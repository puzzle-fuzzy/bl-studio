import { describe, expect, it } from 'vitest'
import type {
  CreateGenerationResult,
  CreateGenerationInput,
  GenerationArtifact,
  GenerationRecord,
  UnifiedAssetItem,
} from '@bailian-studio/generation-repository'
import type { CanvasExecutionTaskInput } from '@bailian-studio/canvas-contracts'
import { MetricsCollector } from '@bailian-studio/shared'
import { processCanvasExecutionTask } from '../src/canvas-task-handler'
import { createRecordingLogger, makeArtifact, makeRecord, makeTask, NOW } from './fixtures'

function canvasInput(overrides: Partial<CanvasExecutionTaskInput> = {}): CanvasExecutionTaskInput {
  return {
    documentId: 'canvas_1',
    documentRevision: 3,
    plan: {
      nodes: [
        {
          nodeId: 'node_1',
          kind: 'image',
          modelId: 'qwen-image',
          params: { prompt: 'lantern', n: 1 },
          assetRefs: {},
          dependencyBindings: {},
          dependsOn: [],
        },
      ],
    },
    nodeRuns: {},
    ...overrides,
  }
}

function task(input: CanvasExecutionTaskInput, id = 'canvas_task_1') {
  return makeTask({
    id,
    type: 'canvas.execute',
    domain: 'canvas',
    input,
    recordId: undefined,
    userId: 'user_1',
    maxAttempts: 100,
  })
}

function createdGeneration(record: GenerationRecord, reused = false): CreateGenerationResult {
  return {
    record,
    task: makeTask({ id: `generation_task_${record.id}`, recordId: record.id }),
    event: {
      id: `event_${record.id}`,
      recordId: record.id,
      userId: record.userId,
      status: record.status,
      modelId: record.modelId,
      updatedAt: NOW,
      createdAt: NOW,
    },
    reused,
  }
}

describe('processCanvasExecutionTask', () => {
  it('creates one ordinary generation and persists the node cursor', async () => {
    let created = 0
    const generated = makeRecord({ id: 'generation_1', status: 'submitting' })
    const repository = {
      createGeneration: async () => {
        created += 1
        return createdGeneration(generated)
      },
      getGenerationRecord: async () => generated,
      listArtifactsForRecord: async () => [],
    }

    const result = await processCanvasExecutionTask(task(canvasInput()), {
      repository,
      logger: createRecordingLogger(),
    })

    expect(result).toMatchObject({
      status: 'retry',
      nextInput: {
        nodeRuns: {
          node_1: { status: 'generating', generationId: 'generation_1' },
        },
      },
    })
    expect(created).toBe(1)
  })

  it('uses the same cache idempotency key for equivalent nodes across executions', async () => {
    const requests: CreateGenerationInput[] = []
    const generated = makeRecord({ id: 'generation_cached', status: 'submitting' })
    const repository = {
      createGeneration: async (request: CreateGenerationInput) => {
        requests.push(request)
        return createdGeneration(generated)
      },
      getGenerationRecord: async () => generated,
      listArtifactsForRecord: async () => [],
    }

    await processCanvasExecutionTask(task(canvasInput()), { repository, logger: createRecordingLogger() })
    await processCanvasExecutionTask(task(canvasInput(), 'canvas_task_2'), { repository, logger: createRecordingLogger() })

    expect(requests).toHaveLength(2)
    expect(requests[0]?.idempotencyKey).toBe(requests[1]?.idempotencyKey)
    expect(requests[0]?.idempotencyKey).toMatch(/^canvas-cache:user_1:v1-/)
  })

  it('records cache hits in the durable node run and metrics', async () => {
    const metrics = new MetricsCollector()
    const generated = makeRecord({ id: 'generation_cached', status: 'submitting' })
    const repository = {
      createGeneration: async () => createdGeneration(generated, true),
      getGenerationRecord: async () => generated,
      listArtifactsForRecord: async () => [],
    }

    const result = await processCanvasExecutionTask(task(canvasInput()), {
      repository,
      metrics,
      logger: createRecordingLogger(),
    })

    expect(result).toMatchObject({
      nextInput: { nodeRuns: { node_1: { status: 'generating', cacheHit: true } } },
    })
    expect(metrics.snapshot().counters['worker.canvas.node_cache|outcome=hit,policy=reuse']).toBe(1)
  })

  it('falls back to a fresh generation key when the cached result is failed', async () => {
    const requests: CreateGenerationInput[] = []
    let calls = 0
    const repository = {
      createGeneration: async (request: CreateGenerationInput) => {
        requests.push(request)
        calls += 1
        return createdGeneration(
          makeRecord({
            id: calls === 1 ? 'generation_failed_cache' : 'generation_fresh',
            status: calls === 1 ? 'failed' : 'submitting',
          }),
        )
      },
      getGenerationRecord: async () => undefined,
      listArtifactsForRecord: async () => [],
    }

    const result = await processCanvasExecutionTask(task(canvasInput()), {
      repository,
      logger: createRecordingLogger(),
    })

    expect(result).toMatchObject({
      status: 'retry',
      nextInput: {
        nodeRuns: { node_1: { status: 'generating', generationId: 'generation_fresh', cacheHit: false } },
      },
    })
    expect(requests).toHaveLength(2)
    expect(requests[0]?.idempotencyKey).not.toBe(requests[1]?.idempotencyKey)
    expect(requests[1]?.idempotencyKey).toBe('canvas:canvas_task_1:node_1')
  })

  it('uses a task-scoped key when a node rerun explicitly requests refresh', async () => {
    const requests: CreateGenerationInput[] = []
    const repository = {
      createGeneration: async (request: CreateGenerationInput) => {
        requests.push(request)
        return createdGeneration(makeRecord({ id: `generation_${requests.length}`, status: 'submitting' }))
      },
      getGenerationRecord: async () => undefined,
      listArtifactsForRecord: async () => [],
    }

    await processCanvasExecutionTask(task(canvasInput({ cachePolicy: 'refresh' })), {
      repository,
      logger: createRecordingLogger(),
    })

    expect(requests[0]?.idempotencyKey).toBe('canvas:canvas_task_1:node_1')
  })

  it('starts independent nodes in parallel while respecting the task limit', async () => {
    const calls: CreateGenerationInput[] = []
    let active = 0
    let maxActive = 0
    const repository = {
      createGeneration: async (request: CreateGenerationInput) => {
        calls.push(request)
        const generationId = `generation_${calls.length}`
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise(resolve => setTimeout(resolve, 5))
        active -= 1
        return createdGeneration(makeRecord({ id: generationId, status: 'submitting' }))
      },
      getGenerationRecord: async () => undefined,
      listArtifactsForRecord: async () => [],
    }
    const input = canvasInput({
      plan: {
        nodes: [
          {
            nodeId: 'node_a',
            kind: 'image',
            modelId: 'qwen-image',
            params: { prompt: 'a' },
            assetRefs: {},
            dependencyBindings: {},
            dependsOn: [],
          },
          {
            nodeId: 'node_b',
            kind: 'image',
            modelId: 'qwen-image',
            params: { prompt: 'b' },
            assetRefs: {},
            dependencyBindings: {},
            dependsOn: [],
          },
        ],
      },
    })

    const result = await processCanvasExecutionTask(task(input), {
      repository,
      maxParallelNodes: 2,
      logger: createRecordingLogger(),
    })

    expect(result).toMatchObject({
      status: 'retry',
      nextInput: {
        nodeRuns: {
          node_a: { status: 'generating', generationId: 'generation_1' },
          node_b: { status: 'generating', generationId: 'generation_2' },
        },
      },
    })
    expect(calls).toHaveLength(2)
    expect(maxActive).toBe(2)
  })

  it('waits for the generated asset projection, then records stable asset IDs', async () => {
    const generated = makeRecord({ id: 'generation_1', status: 'succeeded' })
    const artifact: GenerationArtifact = makeArtifact({
      id: 'artifact_1',
      recordId: generated.id,
      kind: 'image',
      status: 'stored',
    })
    let assetReady = false
    const repository = {
      createGeneration: async () => createdGeneration(generated),
      getGenerationRecord: async () => generated,
      listArtifactsForRecord: async () => [artifact],
    }
    const readyAsset = {
      id: 'asset_generation_artifact_1',
      kind: 'image',
      source: 'generation',
      createdAt: NOW,
    } satisfies UnifiedAssetItem
    const assetRepository = {
      getUserAsset: async () => (assetReady ? readyAsset : undefined),
    }
    const runningInput = canvasInput({
      nodeRuns: {
        node_1: { status: 'generating', generationId: generated.id, cacheHit: false, startedAt: NOW },
      },
    })

    const waiting = await processCanvasExecutionTask(task(runningInput), {
      repository,
      assetRepository,
      logger: createRecordingLogger(),
    })
    expect(waiting).toMatchObject({
      status: 'retry',
      error: { code: 'CANVAS_ASSET_WAITING' },
    })

    assetReady = true
    const completed = await processCanvasExecutionTask(task(runningInput), {
      repository,
      assetRepository,
      logger: createRecordingLogger(),
    })
    expect(completed).toMatchObject({
      status: 'succeeded',
      nextInput: {
        nodeRuns: {
          node_1: {
            status: 'succeeded',
            assetIds: ['asset_generation_artifact_1'],
            cacheHit: false,
            startedAt: expect.any(String),
            completedAt: expect.any(String),
            durationMs: expect.any(Number),
          },
        },
      },
    })
  })

  it('persists a failed node cursor when its generation fails', async () => {
    const generated = makeRecord({
      id: 'generation_1',
      status: 'failed',
      errorJson: { message: 'provider failed' },
    })
    const result = await processCanvasExecutionTask(
      task(
        canvasInput({
          nodeRuns: {
            node_1: { status: 'generating', generationId: generated.id, startedAt: NOW },
          },
        }),
      ),
      {
        repository: {
          createGeneration: async () => createdGeneration(generated),
          getGenerationRecord: async () => generated,
          listArtifactsForRecord: async () => [],
        },
        logger: createRecordingLogger(),
      },
    )

    expect(result).toMatchObject({
      status: 'failed',
      nextInput: {
        nodeRuns: {
          node_1: {
            status: 'failed',
            generationId: 'generation_1',
            error: 'provider failed',
            errorCode: 'CANVAS_GENERATION_FAILED',
            startedAt: expect.any(String),
            completedAt: expect.any(String),
            durationMs: expect.any(Number),
          },
        },
      },
    })
  })

  it('persists node diagnostics when generation creation fails', async () => {
    const result = await processCanvasExecutionTask(task(canvasInput()), {
      repository: {
        createGeneration: async () => {
          throw new Error('provider quota unavailable')
        },
        getGenerationRecord: async () => undefined,
        listArtifactsForRecord: async () => [],
      },
      logger: createRecordingLogger(),
    })

    expect(result).toMatchObject({
      status: 'failed',
      error: { code: 'CANVAS_NODE_GENERATION_CREATE_FAILED' },
      nextInput: {
        nodeRuns: {
          node_1: {
            status: 'failed',
            error: 'provider quota unavailable',
            errorCode: 'CANVAS_NODE_GENERATION_CREATE_FAILED',
            startedAt: expect.any(String),
            completedAt: expect.any(String),
            durationMs: expect.any(Number),
          },
        },
      },
    })
  })

  it('passes upstream asset IDs into the dependent generation parameter', async () => {
    const calls: CreateGenerationInput[] = []
    const generated = makeRecord({ id: 'generation_2', status: 'submitting' })
    const input = canvasInput({
      plan: {
        nodes: [
          {
            nodeId: 'source',
            kind: 'image',
            modelId: 'qwen-image',
            params: { prompt: 'source' },
            assetRefs: {},
            dependencyBindings: {},
            dependsOn: [],
          },
          {
            nodeId: 'target',
            kind: 'video',
            modelId: 'vidu-image-to-video',
            params: { prompt: 'animate' },
            assetRefs: {},
            dependencyBindings: { firstFrame: ['source'] },
            dependsOn: ['source'],
          },
        ],
      },
      nodeRuns: { source: { status: 'succeeded', assetIds: ['asset_source'] } },
    })
    const repository = {
      createGeneration: async (request: CreateGenerationInput) => {
        calls.push(request)
        return createdGeneration(generated)
      },
      getGenerationRecord: async () => generated,
      listArtifactsForRecord: async () => [],
    }

    const result = await processCanvasExecutionTask(task(input), {
      repository,
      logger: createRecordingLogger(),
    })

    expect(result).toMatchObject({ status: 'retry' })
    expect(calls[0]).toMatchObject({
      assetRefs: { firstFrame: ['asset_source'] },
      modelId: 'vidu-image-to-video',
    })
  })
})
