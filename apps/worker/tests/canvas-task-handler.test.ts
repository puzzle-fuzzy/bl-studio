import { describe, expect, it } from 'vitest'
import type {
  CreateGenerationResult,
  CreateGenerationInput,
  GenerationArtifact,
  GenerationRecord,
  UnifiedAssetItem,
} from '@bailian-studio/generation-repository'
import type { CanvasExecutionTaskInput } from '@bailian-studio/canvas-contracts'
import { processCanvasExecutionTask } from '../src/canvas-task-handler'
import {
  createRecordingLogger,
  makeArtifact,
  makeRecord,
  makeTask,
  NOW,
} from './fixtures'

function canvasInput(
  overrides: Partial<CanvasExecutionTaskInput> = {},
): CanvasExecutionTaskInput {
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

function task(input: CanvasExecutionTaskInput) {
  return makeTask({
    id: 'canvas_task_1',
    type: 'canvas.execute',
    domain: 'canvas',
    input,
    recordId: undefined,
    userId: 'user_1',
    maxAttempts: 100,
  })
}

function createdGeneration(record: GenerationRecord): CreateGenerationResult {
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
        node_1: { status: 'generating', generationId: generated.id },
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
            node_1: { status: 'generating', generationId: generated.id },
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
