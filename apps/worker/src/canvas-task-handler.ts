import type {
  AssetRepository,
  CreateGenerationResult,
  GenerationRecord,
  GenerationQuotaLimits,
  GenerationRepository,
} from '@bailian-studio/generation-repository'
import {
  CanvasExecutionTaskInputSchema,
  type CanvasExecutionTaskInput,
} from '@bailian-studio/canvas-contracts'
import type { Logger } from '@bailian-studio/shared'
import type { TaskRecord } from '@bailian-studio/task-engine'
import type { TaskProcessOutcome } from './task-contracts'

const NODE_POLL_DELAY_MS = 3_000
const NODE_ADVANCE_DELAY_MS = 250

export interface CanvasExecutionTaskHandlerDeps {
  readonly repository: Pick<
    GenerationRepositoryPort,
    'createGeneration' | 'getGenerationRecord' | 'listArtifactsForRecord'
  >
  readonly assetRepository?: Pick<AssetRepository, 'getUserAsset'>
  readonly generationQuota?: GenerationQuotaLimits
  readonly logger: Logger
}

interface GenerationRepositoryPort {
  createGeneration(
    input: Parameters<GenerationRepository['createGeneration']>[0],
  ): Promise<CreateGenerationResult>
  getGenerationRecord(id: string): Promise<GenerationRecord | undefined>
  listArtifactsForRecord: GenerationRepository['listArtifactsForRecord']
}

/**
 * Drives one Canvas execution task as a small durable state machine.
 *
 * Each media node is still an ordinary generation record and therefore keeps
 * the existing provider, credit, artifact and audit semantics. This handler
 * only coordinates dependencies and persists its cursor through `nextInput`.
 */
export async function processCanvasExecutionTask(
  task: TaskRecord,
  deps: CanvasExecutionTaskHandlerDeps,
): Promise<TaskProcessOutcome> {
  const parsed = CanvasExecutionTaskInputSchema.safeParse(task.input)
  if (!parsed.success) {
    return failed(
      'Canvas execution task input is invalid',
      'CANVAS_EXECUTION_TASK_INPUT_INVALID',
      parsed.error.flatten(),
    )
  }
  if (task.userId === undefined || task.userId.length === 0) {
    return failed(
      'Canvas execution task is missing its user scope',
      'CANVAS_EXECUTION_USER_MISSING',
    )
  }

  const input = parsed.data
  const planNode = input.plan.nodes.find(
    (node) => input.nodeRuns[node.nodeId]?.status !== 'succeeded',
  )
  if (planNode === undefined) {
    return {
      status: 'succeeded',
      output: { artifacts: [] },
      nextInput: input,
    }
  }

  const currentRun = input.nodeRuns[planNode.nodeId]
  if (currentRun?.status === 'failed') {
    return failed(
      currentRun.error ?? `Canvas node ${planNode.nodeId} failed`,
      'CANVAS_NODE_FAILED',
      { nodeId: planNode.nodeId },
      input,
    )
  }

  if (currentRun?.generationId === undefined) {
    const dependencyResult = resolveDependencyAssetRefs(planNode, input)
    if (dependencyResult.waiting) {
      return retry(
        'Waiting for upstream canvas nodes',
        'CANVAS_DEPENDENCY_WAITING',
        input,
        dependencyResult.details,
      )
    }
    if (dependencyResult.error !== undefined) {
      return failed(
        dependencyResult.error.message,
        dependencyResult.error.code,
        dependencyResult.error.details,
        input,
      )
    }

    try {
      const created = await deps.repository.createGeneration({
        userId: task.userId,
        modelId: planNode.modelId,
        params: planNode.params,
        ...(Object.keys(dependencyResult.assetRefs).length > 0
          ? { assetRefs: dependencyResult.assetRefs }
          : {}),
        ...(task.traceId === undefined ? {} : { traceId: task.traceId }),
        idempotencyKey: `canvas:${task.id}:${planNode.nodeId}`,
        ...(deps.generationQuota === undefined
          ? {}
          : { quota: deps.generationQuota }),
      })
      const nextInput = withNodeRun(input, planNode.nodeId, {
        status: 'generating',
        generationId: created.record.id,
      })
      deps.logger.info('canvas.node_generation_queued', {
        taskId: task.id,
        nodeId: planNode.nodeId,
        generationId: created.record.id,
        modelId: planNode.modelId,
      })
      return retry(
        'Canvas node generation queued',
        'CANVAS_NODE_QUEUED',
        nextInput,
        { nodeId: planNode.nodeId },
      )
    } catch (error) {
      return failed(
        error instanceof Error ? error.message : String(error),
        'CANVAS_NODE_GENERATION_CREATE_FAILED',
        { nodeId: planNode.nodeId },
        input,
      )
    }
  }

  const generation = await deps.repository.getGenerationRecord(
    currentRun.generationId,
  )
  if (generation === undefined) {
    const message = `Generation record not found: ${currentRun.generationId}`
    return failed(
      message,
      'CANVAS_GENERATION_NOT_FOUND',
      {
        nodeId: planNode.nodeId,
        generationId: currentRun.generationId,
      },
      withNodeRun(input, planNode.nodeId, {
        status: 'failed',
        generationId: currentRun.generationId,
        error: message,
      }),
    )
  }
  if (generation.status === 'failed' || generation.status === 'cancelled') {
    const message =
      typeof generation.errorJson?.['message'] === 'string'
        ? String(generation.errorJson['message'])
        : `Canvas node generation ${generation.status}`
    return failed(
      message,
      'CANVAS_GENERATION_FAILED',
      {
        nodeId: planNode.nodeId,
        generationId: generation.id,
        status: generation.status,
      },
      withNodeRun(input, planNode.nodeId, {
        status: 'failed',
        generationId: generation.id,
        error: message,
      }),
    )
  }
  if (generation.status !== 'succeeded') {
    return retry(
      'Waiting for canvas node generation',
      'CANVAS_GENERATION_WAITING',
      input,
      {
        nodeId: planNode.nodeId,
        generationId: generation.id,
        status: generation.status,
      },
    )
  }

  if (deps.assetRepository === undefined) {
    return failed(
      'Canvas execution asset repository is not configured',
      'CANVAS_ASSET_REPOSITORY_MISSING',
      {
        nodeId: planNode.nodeId,
      },
      input,
    )
  }

  const artifacts = (
    await deps.repository.listArtifactsForRecord(generation.id)
  ).filter((artifact) => artifact.kind === planNode.kind)
  const failedArtifact = artifacts.find(
    (artifact) => artifact.status === 'failed',
  )
  if (failedArtifact !== undefined) {
    const message = 'Canvas node artifact persistence failed'
    return failed(
      message,
      'CANVAS_OUTPUT_PERSIST_FAILED',
      {
        nodeId: planNode.nodeId,
        generationId: generation.id,
        artifactId: failedArtifact.id,
      },
      withNodeRun(input, planNode.nodeId, {
        status: 'failed',
        generationId: generation.id,
        error: message,
      }),
    )
  }
  if (artifacts.length === 0) {
    const message =
      'Canvas node generation completed without a matching media artifact'
    return failed(
      message,
      'CANVAS_OUTPUT_MISSING',
      {
        nodeId: planNode.nodeId,
        generationId: generation.id,
        expectedKind: planNode.kind,
      },
      withNodeRun(input, planNode.nodeId, {
        status: 'failed',
        generationId: generation.id,
        error: message,
      }),
    )
  }

  const assetIds = artifacts.map(
    (artifact) => `asset_generation_${artifact.id}`,
  )
  try {
    const assets = await Promise.all(
      assetIds.map((assetId) =>
        deps.assetRepository?.getUserAsset({
          userId: task.userId as string,
          assetId,
        }),
      ),
    )
    if (assets.some((asset) => asset === undefined)) {
      return retry(
        'Waiting for generated assets to become ready',
        'CANVAS_ASSET_WAITING',
        input,
        {
          nodeId: planNode.nodeId,
          generationId: generation.id,
        },
      )
    }
  } catch (error) {
    return retry(
      'Generated asset projection is temporarily unavailable',
      'CANVAS_ASSET_READ_RETRY',
      input,
      {
        nodeId: planNode.nodeId,
        error: error instanceof Error ? error.message : String(error),
      },
    )
  }

  const nextInput = withNodeRun(input, planNode.nodeId, {
    status: 'succeeded',
    generationId: generation.id,
    assetIds,
  })
  deps.logger.info('canvas.node_succeeded', {
    taskId: task.id,
    nodeId: planNode.nodeId,
    generationId: generation.id,
    assetIds,
  })
  const hasPendingNode = nextInput.plan.nodes.some(
    (node) => nextInput.nodeRuns[node.nodeId]?.status !== 'succeeded',
  )
  if (!hasPendingNode)
    return { status: 'succeeded', output: { artifacts: [] }, nextInput }
  return retry(
    'Canvas node completed; advancing graph',
    'CANVAS_NODE_ADVANCE',
    nextInput,
  )
}

function resolveDependencyAssetRefs(
  planNode: CanvasExecutionTaskInput['plan']['nodes'][number],
  input: CanvasExecutionTaskInput,
): {
  assetRefs: Record<string, string[]>
  waiting: boolean
  details?: Readonly<Record<string, unknown>>
  error?: {
    message: string
    code: string
    details?: Readonly<Record<string, unknown>>
  }
} {
  const assetRefs: Record<string, string[]> = Object.fromEntries(
    Object.entries(planNode.assetRefs).map(([parameter, ids]) => [
      parameter,
      [...ids],
    ]),
  )
  for (const [parameter, upstreamNodeIds] of Object.entries(
    planNode.dependencyBindings,
  )) {
    const refs = assetRefs[parameter] ?? []
    for (const upstreamNodeId of upstreamNodeIds) {
      const upstream = input.nodeRuns[upstreamNodeId]
      if (upstream?.status !== 'succeeded') {
        return {
          assetRefs,
          waiting: true,
          details: { nodeId: planNode.nodeId, upstreamNodeId },
        }
      }
      const assetId = upstream.assetIds?.[0]
      if (assetId === undefined) {
        return {
          assetRefs,
          waiting: false,
          error: {
            message: `Upstream canvas node ${upstreamNodeId} has no output asset`,
            code: 'CANVAS_DEPENDENCY_OUTPUT_MISSING',
            details: { nodeId: planNode.nodeId, upstreamNodeId },
          },
        }
      }
      refs.push(assetId)
    }
    if (refs.length > 0) assetRefs[parameter] = [...new Set(refs)]
  }
  return { assetRefs, waiting: false }
}

function withNodeRun(
  input: CanvasExecutionTaskInput,
  nodeId: string,
  run: CanvasExecutionTaskInput['nodeRuns'][string],
): CanvasExecutionTaskInput {
  return {
    ...input,
    nodeRuns: { ...input.nodeRuns, [nodeId]: run },
  }
}

function retry(
  message: string,
  code: string,
  nextInput: CanvasExecutionTaskInput,
  details?: Readonly<Record<string, unknown>>,
): TaskProcessOutcome {
  return {
    status: 'retry',
    nextRunAt: new Date(
      Date.now() +
        (code === 'CANVAS_NODE_ADVANCE' || code === 'CANVAS_NODE_QUEUED'
          ? NODE_ADVANCE_DELAY_MS
          : NODE_POLL_DELAY_MS),
    ).toISOString(),
    error: {
      category: 'system',
      message,
      retriable: true,
      code,
      ...(details === undefined ? {} : { details }),
    },
    nextInput,
  }
}

function failed(
  message: string,
  code: string,
  details?: unknown,
  nextInput?: CanvasExecutionTaskInput,
): TaskProcessOutcome {
  return {
    status: 'failed',
    error: {
      category: 'validation',
      message,
      retriable: false,
      code,
      ...(details !== undefined &&
      typeof details === 'object' &&
      details !== null
        ? { details: details as Record<string, unknown> }
        : {}),
    },
    ...(nextInput === undefined ? {} : { nextInput }),
  }
}
