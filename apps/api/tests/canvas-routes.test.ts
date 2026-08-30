import { beforeEach, describe, expect, it } from 'vitest'
import type { CanvasRepository } from '@bailian-studio/canvas-repository'
import { CanvasRepositoryError } from '@bailian-studio/canvas-repository'
import type { CanvasDocument, CanvasSnapshot, CanvasVersion } from '@bailian-studio/canvas-contracts'
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
        body: JSON.stringify({ expectedRevision: 1, snapshot }),
      }),
    )
    expect(saved.status).toBe(200)
    expect((await saved.json()).data.document.revision).toBe(2)
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

    const read = await app.handle(
      new Request(`http://localhost/api/canvases/canvas-1/executions/${firstExecution.id}`, {
        headers: { cookie: 'bailian_studio_session=fake-token' },
      }),
    )
    expect(read.status).toBe(200)
    expect((await read.json()).data.execution.id).toBe(firstExecution.id)
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
})
