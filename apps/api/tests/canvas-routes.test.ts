import { beforeEach, describe, expect, it } from 'vitest'
import type { CanvasRepository } from '@bailian-studio/canvas-repository'
import { CanvasRepositoryError } from '@bailian-studio/canvas-repository'
import { CanvasExecutionTaskInputSchema, type CanvasDocument, type CanvasExecutionTaskInput, type CanvasSnapshot, type CanvasVersion } from '@bailian-studio/canvas-contracts'
import type { TaskRecord } from '@bailian-studio/task-engine'
import type { CancelTaskInput } from '@bailian-studio/task-repository'
import { createTestApp } from '../src/test-app'
import { createFakeAuthService } from './fake-auth-service'

const user = {
  id: 'user-canvas',
  email: 'canvas@example.test',
  displayName: null,
  role: 'user' as const,
}
const snapshot: CanvasSnapshot = { nodes: [], edges: [] }
let document: CanvasDocument
let versions: CanvasVersion[]

function createFakeCanvasRepository(): CanvasRepository {
  return {
    async listDocuments() {
      return { items: [document] }
    },
    async createDocument() {
      return document
    },
    async getDocument() {
      return document
    },
    async saveDocument(input) {
      if (input.expectedRevision !== document.revision) {
        throw new CanvasRepositoryError('CANVAS_REVISION_CONFLICT', 'revision conflict')
      }
      document = {
        ...document,
        revision: document.revision + 1,
        title: input.title ?? document.title,
        snapshot: input.snapshot,
        currentVersionId: `version-${document.revision + 1}`,
      }
      return document
    },
    async listVersions() {
      return versions
    },
    async restoreVersion() {
      return document
    },
  }
}

function createFakeTaskRepository() {
  const tasks = new Map<string, TaskRecord>()
  let enqueues = 0
  return {
    tasks,
    get enqueues() {
      return enqueues
    },
    async getTask(id: string) {
      return tasks.get(id)
    },
    async enqueueTask(task: TaskRecord) {
      enqueues += 1
      tasks.set(task.id, task)
      return task
    },
    async cancelTask(input: CancelTaskInput) {
      const task = tasks.get(input.taskId)
      if (task === undefined || (task.status !== 'queued' && task.status !== 'running')) return undefined
      const cancelled = {
        ...task,
        status: 'cancelled' as const,
        lockedBy: undefined,
        lockedUntil: undefined,
        completedAt: input.now,
        updatedAt: input.now,
        errorJson: input.error,
      }
      tasks.set(task.id, cancelled)
      return cancelled
    },
    async listTasks(input: { userId: string; inputField?: { key: string; value: string }; limit?: number; cursor?: string }) {
      const items = [...tasks.values()].filter(task => (
        task.userId === input.userId
        && task.type === 'canvas.execute'
        && task.domain === 'canvas'
        && (input.inputField === undefined || task.input[input.inputField.key] === input.inputField.value)
      ))
      return { items, nextCursor: undefined }
    },
  }
}

async function readUntilReader(reader: ReadableStreamDefaultReader<Uint8Array>, marker: string): Promise<string> {
  const decoder = new TextDecoder()
  let text = ''
  for (;;) {
    const next = await reader.read()
    if (next.done) return text
    text += decoder.decode(next.value, { stream: true })
    if (text.includes(marker)) return text
  }
}

beforeEach(() => {
  document = {
    id: 'canvas-1',
    title: '测试画布',
    revision: 1,
    snapshot,
    currentVersionId: 'version-1',
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-08-30T00:00:00.000Z',
  }
  versions = [
    {
      id: 'version-1',
      documentId: 'canvas-1',
      version: 1,
      snapshot,
      createdAt: document.createdAt,
    },
  ]
})

describe('canvas routes', () => {
  it('lists canvas documents with an opaque cursor', async () => {
    const repository = createFakeCanvasRepository()
    repository.listDocuments = async input => {
      expect(input).toEqual({ userId: user.id, limit: 2, cursor: 'page-1' })
      return { items: [document], nextCursor: 'page-2' }
    }
    const app = createTestApp({
      authService: createFakeAuthService(() => user),
      canvasRepository: repository,
    }).app

    const response = await app.handle(
      new Request('http://localhost/api/canvases?limit=2&cursor=page-1', {
        headers: { cookie: 'bailian_studio_session=fake-token' },
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      success: true,
      data: { items: [{ id: 'canvas-1' }], nextCursor: 'page-2' },
    })
  })

  it('reads and saves a canvas using the authenticated user', async () => {
    const app = createTestApp({
      authService: createFakeAuthService(() => user),
      canvasRepository: createFakeCanvasRepository(),
    }).app

    const response = await app.handle(
      new Request('http://localhost/api/canvases/canvas-1', {
        headers: { cookie: 'bailian_studio_session=fake-token' },
      }),
    )
    expect(response.status).toBe(200)
    expect((await response.json()).data.document.id).toBe('canvas-1')

    const saved = await app.handle(
      new Request('http://localhost/api/canvases/canvas-1', {
        method: 'PATCH',
        headers: {
          cookie: 'bailian_studio_session=fake-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ expectedRevision: 1, title: '重命名后的画布', snapshot }),
      }),
    )
    expect(saved.status).toBe(200)
    expect((await saved.json()).data.document).toMatchObject({
      revision: 2,
      title: '重命名后的画布',
    })
  })

  it('maps optimistic concurrency conflicts to 409', async () => {
    const app = createTestApp({
      authService: createFakeAuthService(() => user),
      canvasRepository: createFakeCanvasRepository(),
    }).app
    await app.handle(
      new Request('http://localhost/api/canvases/canvas-1', {
        method: 'PATCH',
        headers: {
          cookie: 'bailian_studio_session=fake-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ expectedRevision: 1, snapshot }),
      }),
    )
    const response = await app.handle(
      new Request('http://localhost/api/canvases/canvas-1', {
        method: 'PATCH',
        headers: {
          cookie: 'bailian_studio_session=fake-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ expectedRevision: 1, snapshot }),
      }),
    )
    expect(response.status).toBe(409)
  })

  it('compiles and enqueues an idempotent canvas execution', async () => {
    document = {
      ...document,
      snapshot: {
        nodes: [
          {
            id: 'node-1',
            type: 'mediaNode',
            position: { x: 0, y: 0 },
            data: {
              kind: 'image',
              status: 'empty',
              prompt: 'a lantern',
              modelId: 'qwen-image',
              referenceAssetIds: [],
            },
          },
        ],
        edges: [],
      },
    }
    const taskRepository = createFakeTaskRepository()
    const app = createTestApp({
      authService: createFakeAuthService(() => user),
      canvasRepository: createFakeCanvasRepository(),
      taskQueueRepository: taskRepository,
    }).app
    const init = {
      method: 'POST',
      headers: {
        cookie: 'bailian_studio_session=fake-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ expectedRevision: 1, idempotencyKey: 'run-1' }),
    }
    const first = await app.handle(new Request('http://localhost/api/canvases/canvas-1/execute', init))
    expect(first.status).toBe(200)
    const firstExecution = (await first.json()).data.execution
    expect(firstExecution).toMatchObject({
      documentId: 'canvas-1',
      status: 'queued',
      nodeStatuses: [{ nodeId: 'node-1', status: 'queued' }],
    })

    const second = await app.handle(new Request('http://localhost/api/canvases/canvas-1/execute', init))
    expect(second.status).toBe(200)
    expect((await second.json()).data.execution.id).toBe(firstExecution.id)
    expect(taskRepository.enqueues).toBe(1)

    const stored = taskRepository.tasks.get(firstExecution.id)
    if (stored === undefined) throw new Error('expected stored canvas task')
    const storedInput = CanvasExecutionTaskInputSchema.parse(stored.input)
    const diagnosticInput: CanvasExecutionTaskInput = {
      ...storedInput,
      nodeRuns: {
        ...storedInput.nodeRuns,
        'node-1': {
          status: 'failed',
          startedAt: '2026-08-30T00:00:01.500Z',
          completedAt: '2026-08-30T00:00:02.500Z',
          durationMs: 1_000,
          errorCode: 'CANVAS_ARTIFACT_MISSING',
          error: 'artifact missing',
        },
      },
    }
    taskRepository.tasks.set(firstExecution.id, {
      ...stored,
      status: 'failed',
      startedAt: '2026-08-30T00:00:01.000Z',
      completedAt: '2026-08-30T00:00:03.000Z',
      errorJson: {
        category: 'validation',
        message: 'Canvas node node-1 failed',
        retriable: false,
        code: 'CANVAS_NODE_FAILED',
      },
      input: diagnosticInput,
    })

    const read = await app.handle(
      new Request(`http://localhost/api/canvases/canvas-1/executions/${firstExecution.id}`, {
        headers: { cookie: 'bailian_studio_session=fake-token' },
      }),
    )
    expect(read.status).toBe(200)
    expect((await read.json()).data.execution).toMatchObject({
      id: firstExecution.id,
      status: 'failed',
      startedAt: '2026-08-30T00:00:01.000Z',
      completedAt: '2026-08-30T00:00:03.000Z',
      durationMs: 2_000,
      errorCode: 'CANVAS_NODE_FAILED',
      nodeStatuses: [{
        nodeId: 'node-1',
        durationMs: 1_000,
        errorCode: 'CANVAS_ARTIFACT_MISSING',
      }],
    })

    const history = await app.handle(
      new Request('http://localhost/api/canvases/canvas-1/executions?limit=10', {
        headers: { cookie: 'bailian_studio_session=fake-token' },
      }),
    )
    expect(history.status).toBe(200)
    expect((await history.json()).data.items).toMatchObject([
      { id: firstExecution.id, documentId: 'canvas-1', status: 'failed', durationMs: 2_000 },
    ])
  })

  it('derives an idempotent node rerun and preserves successful nodes', async () => {
    const taskRepository = createFakeTaskRepository()
    taskRepository.tasks.set('source-execution', {
      id: 'source-execution',
      type: 'canvas.execute',
      domain: 'canvas',
      status: 'failed',
      priority: 1,
      input: {
        documentId: 'canvas-1',
        documentRevision: 1,
        plan: {
          nodes: [
            {
              nodeId: 'source',
              kind: 'image',
              modelId: 'qwen-image',
              params: {},
              assetRefs: {},
              dependencyBindings: {},
              dependsOn: [],
            },
            {
              nodeId: 'target',
              kind: 'image',
              modelId: 'qwen-image',
              params: {},
              assetRefs: {},
              dependencyBindings: {},
              dependsOn: ['source'],
            },
            {
              nodeId: 'downstream',
              kind: 'image',
              modelId: 'qwen-image',
              params: {},
              assetRefs: {},
              dependencyBindings: {},
              dependsOn: ['target'],
            },
          ],
        },
        nodeRuns: {
          source: { status: 'succeeded', assetIds: ['asset-source'] },
          target: { status: 'failed', error: 'provider failed' },
          downstream: { status: 'queued' },
        },
      },
      attempts: 1,
      maxAttempts: 1000,
      nextRunAt: '2026-08-30T00:00:00.000Z',
      userId: user.id,
      traceId: 'trace-source',
      createdAt: '2026-08-30T00:00:00.000Z',
      updatedAt: '2026-08-30T00:00:02.000Z',
    })
    const app = createTestApp({
      authService: createFakeAuthService(() => user),
      canvasRepository: createFakeCanvasRepository(),
      taskQueueRepository: taskRepository,
    }).app
    const init = {
      method: 'POST',
      headers: {
        cookie: 'bailian_studio_session=fake-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ idempotencyKey: 'node-retry-1' }),
    }
    const first = await app.handle(
      new Request('http://localhost/api/canvases/canvas-1/executions/source-execution/nodes/target/retry', init),
    )
    expect(first.status).toBe(200)
    const firstExecution = (await first.json()).data.execution
    expect(firstExecution).toMatchObject({
      documentId: 'canvas-1',
      status: 'queued',
      nodeStatuses: [
        { nodeId: 'source', status: 'succeeded', assetIds: ['asset-source'] },
        { nodeId: 'target', status: 'queued' },
        { nodeId: 'downstream', status: 'queued' },
      ],
    })
    expect(taskRepository.tasks.get(firstExecution.id)?.input).toMatchObject({
      rerun: { sourceExecutionId: 'source-execution', nodeId: 'target' },
    })

    const second = await app.handle(
      new Request('http://localhost/api/canvases/canvas-1/executions/source-execution/nodes/target/retry', init),
    )
    expect(second.status).toBe(200)
    expect((await second.json()).data.execution.id).toBe(firstExecution.id)
    expect(taskRepository.enqueues).toBe(1)

    taskRepository.tasks.set('source-execution', {
      ...taskRepository.tasks.get('source-execution')!,
      status: 'running',
    })
    const active = await app.handle(
      new Request('http://localhost/api/canvases/canvas-1/executions/source-execution/nodes/target/retry', init),
    )
    expect(active.status).toBe(409)
    expect((await active.json()).error.code).toBe('CANVAS_EXECUTION_NOT_RETRYABLE')

    document = { ...document, revision: 2 }
    taskRepository.tasks.set('source-execution', {
      ...taskRepository.tasks.get('source-execution')!,
      status: 'failed',
    })
    const stale = await app.handle(
      new Request(
        'http://localhost/api/canvases/canvas-1/executions/source-execution/nodes/target/retry',
        { ...init, body: JSON.stringify({ idempotencyKey: 'node-retry-stale-revision' }) },
      ),
    )
    expect(stale.status).toBe(409)
    expect((await stale.json()).error.code).toBe('CANVAS_REVISION_CONFLICT')
  })

  it('cancels a queued canvas execution and makes the terminal state readable', async () => {
    document = {
      ...document,
      snapshot: {
        nodes: [
          {
            id: 'node-1',
            type: 'mediaNode',
            position: { x: 0, y: 0 },
            data: {
              kind: 'image',
              status: 'empty',
              prompt: 'a lantern',
              modelId: 'qwen-image',
              referenceAssetIds: [],
            },
          },
        ],
        edges: [],
      },
    }
    const taskRepository = createFakeTaskRepository()
    const app = createTestApp({
      authService: createFakeAuthService(() => user),
      canvasRepository: createFakeCanvasRepository(),
      taskQueueRepository: taskRepository,
    }).app
    const executionResponse = await app.handle(
      new Request('http://localhost/api/canvases/canvas-1/execute', {
        method: 'POST',
        headers: {
          cookie: 'bailian_studio_session=fake-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ expectedRevision: 1, idempotencyKey: 'run-cancel' }),
      }),
    )
    const execution = (await executionResponse.json()).data.execution

    const cancelled = await app.handle(
      new Request(`http://localhost/api/canvases/canvas-1/executions/${execution.id}/cancel`, {
        method: 'POST',
        headers: { cookie: 'bailian_studio_session=fake-token' },
      }),
    )
    expect(cancelled.status).toBe(200)
    expect((await cancelled.json()).data.execution).toMatchObject({
      id: execution.id,
      status: 'cancelled',
    })
  })

  it('streams the initial canvas execution and subsequent task changes', async () => {
    document = {
      ...document,
      snapshot: {
        nodes: [
          {
            id: 'node-1',
            type: 'mediaNode',
            position: { x: 0, y: 0 },
            data: {
              kind: 'image',
              status: 'empty',
              prompt: 'a lantern',
              modelId: 'qwen-image',
              referenceAssetIds: [],
            },
          },
        ],
        edges: [],
      },
    }
    const taskRepository = createFakeTaskRepository()
    const app = createTestApp({
      authService: createFakeAuthService(() => user),
      canvasRepository: createFakeCanvasRepository(),
      taskQueueRepository: taskRepository,
    }).app
    const executionResponse = await app.handle(
      new Request('http://localhost/api/canvases/canvas-1/execute', {
        method: 'POST',
        headers: {
          cookie: 'bailian_studio_session=fake-token',
          'content-type': 'application/json',
        },
        body: JSON.stringify({ expectedRevision: 1, idempotencyKey: 'run-events' }),
      }),
    )
    const execution = (await executionResponse.json()).data.execution as { id: string }
    const response = await app.handle(
      new Request(`http://localhost/api/canvases/canvas-1/executions/${execution.id}/events`, {
        headers: { cookie: 'bailian_studio_session=fake-token' },
      }),
    )
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const reader = response.body?.getReader()
    if (reader === undefined) throw new Error('expected readable body')

    const connected = await reader.read()
    expect(new TextDecoder().decode(connected.value)).toContain('event: connected')
    const initial = await reader.read()
    expect(new TextDecoder().decode(initial.value)).toContain('event: canvas.execution')

    const stored = taskRepository.tasks.get(execution.id)
    if (stored === undefined) throw new Error('expected stored canvas task')
    taskRepository.tasks.set(execution.id, {
      ...stored,
      status: 'running',
      updatedAt: '2026-08-30T00:00:01.000Z',
    })
    const live = await readUntilReader(reader, '"status":"running"')
    expect(live).toContain('event: canvas.execution')
    await reader.cancel()
  })
})
