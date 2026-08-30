import type {
  AssetRepository,
  CreateGenerationResult,
  GenerationRecord,
  GenerationQuotaLimits,
  GenerationRepository,
} from '@bailian-studio/generation-repository'
import { CanvasExecutionTaskInputSchema, type CanvasExecutionTaskInput } from '@bailian-studio/canvas-contracts'
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
  /** 单个 Canvas 任务内允许同时运行的节点数；默认 4。 */
  readonly maxParallelNodes?: number
  readonly logger: Logger
}

interface GenerationRepositoryPort {
  createGeneration(input: Parameters<GenerationRepository['createGeneration']>[0]): Promise<CreateGenerationResult>
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
    return failed('Canvas execution task is missing its user scope', 'CANVAS_EXECUTION_USER_MISSING')
  }

  let nextInput = parsed.data
  const generatingNodes = nextInput.plan.nodes.filter(node => nextInput.nodeRuns[node.nodeId]?.status === 'generating')
  const generationResults = await Promise.all(
    generatingNodes.map(node => inspectGeneratingNode(task, node, nextInput.nodeRuns[node.nodeId], deps)),
  )
  for (const result of generationResults) {
    if (result.kind === 'succeeded') {
      nextInput = withNodeRun(nextInput, result.nodeId, result.run)
      deps.logger.info('canvas.node_succeeded', {
        taskId: task.id,
        nodeId: result.nodeId,
        generationId: result.run.generationId,
        assetIds: result.run.assetIds,
      })
    } else if (result.kind === 'failed') {
      nextInput = withNodeRun(nextInput, result.nodeId, result.run)
    }
  }
  const waitingResult = generationResults.find(result => result.kind === 'waiting')

  const failedNode = nextInput.plan.nodes.find(node => nextInput.nodeRuns[node.nodeId]?.status === 'failed')
  const activeGeneratingNode = nextInput.plan.nodes.some(
    node => nextInput.nodeRuns[node.nodeId]?.status === 'generating',
  )
  if (failedNode !== undefined && !activeGeneratingNode) {
    const run = nextInput.nodeRuns[failedNode.nodeId]
    return failed(
      run?.error ?? `Canvas node ${failedNode.nodeId} failed`,
      'CANVAS_NODE_FAILED',
      { nodeId: failedNode.nodeId },
      nextInput,
    )
  }
  const userId = task.userId

  const readyNodes = nextInput.plan.nodes.filter(node => {
    const run = nextInput.nodeRuns[node.nodeId]
    if (run?.status === 'succeeded' || run?.status === 'generating' || run?.status === 'failed') return false
    return node.dependsOn.every(dependencyNodeId => nextInput.nodeRuns[dependencyNodeId]?.status === 'succeeded')
  })
  const activeNodeCount = nextInput.plan.nodes.filter(
    node => nextInput.nodeRuns[node.nodeId]?.status === 'generating',
  ).length
  const maxParallelNodes = Math.max(1, deps.maxParallelNodes ?? 4)
  const slots = Math.max(0, maxParallelNodes - activeNodeCount)
  const batch = readyNodes.slice(0, slots)

  if (batch.length > 0) {
    const startResults = await Promise.all(
      batch.map(async node => {
        const dependencyResult = resolveDependencyAssetRefs(node, nextInput)
        if (dependencyResult.waiting) {
          return { nodeId: node.nodeId, waiting: true as const }
        }
        if (dependencyResult.error !== undefined) {
          return { nodeId: node.nodeId, error: dependencyResult.error }
        }
        try {
          const created = await deps.repository.createGeneration({
            userId,
            modelId: node.modelId,
            params: node.params,
            ...(Object.keys(dependencyResult.assetRefs).length > 0 ? { assetRefs: dependencyResult.assetRefs } : {}),
            ...(task.traceId === undefined ? {} : { traceId: task.traceId }),
            idempotencyKey: `canvas:${task.id}:${node.nodeId}`,
            ...(deps.generationQuota === undefined ? {} : { quota: deps.generationQuota }),
          })
          return { nodeId: node.nodeId, created }
        } catch (error) {
          return {
            nodeId: node.nodeId,
            error: {
              message: error instanceof Error ? error.message : String(error),
              code: 'CANVAS_NODE_GENERATION_CREATE_FAILED',
              details: { nodeId: node.nodeId },
            },
          }
        }
      }),
    )
    let createdCount = 0
    let failedCount = 0
    for (const result of startResults) {
      if (result.created !== undefined) {
        createdCount += 1
        nextInput = withNodeRun(nextInput, result.nodeId, {
          status: 'generating',
          generationId: result.created.record.id,
        })
        deps.logger.info('canvas.node_generation_queued', {
          taskId: task.id,
          nodeId: result.nodeId,
          generationId: result.created.record.id,
          modelId: nextInput.plan.nodes.find(node => node.nodeId === result.nodeId)?.modelId,
        })
      } else if (result.error !== undefined) {
        failedCount += 1
        nextInput = withNodeRun(nextInput, result.nodeId, {
          status: 'failed',
          error: result.error.message,
        })
      }
    }
    if (failedCount > 0 && createdCount === 0) {
      const failure = startResults.find(result => result.error !== undefined)
      return failed(
        failure?.error?.message ?? 'Canvas node generation could not start',
        failure?.error?.code ?? 'CANVAS_NODE_GENERATION_CREATE_FAILED',
        failure?.error?.details,
        nextInput,
      )
    }
    return retry(
      createdCount > 0 ? 'Canvas nodes queued; advancing graph in parallel' : 'Waiting for canvas node dependencies',
      createdCount > 0 ? 'CANVAS_NODES_QUEUED' : 'CANVAS_DEPENDENCY_WAITING',
      nextInput,
    )
  }

  const hasPendingNode = nextInput.plan.nodes.some(node => nextInput.nodeRuns[node.nodeId]?.status !== 'succeeded')
  if (!hasPendingNode) return { status: 'succeeded', output: { artifacts: [] }, nextInput }
  if (activeGeneratingNode) {
    return retry(
      'Waiting for canvas node generations',
      waitingResult?.code ?? 'CANVAS_GENERATION_WAITING',
      nextInput,
      waitingResult?.details,
    )
  }
  return retry('Waiting for upstream canvas nodes', 'CANVAS_DEPENDENCY_WAITING', nextInput)
}

type CanvasNodeRun = CanvasExecutionTaskInput['nodeRuns'][string]
type CanvasPlanNode = CanvasExecutionTaskInput['plan']['nodes'][number]

type NodeInspectionResult =
  | { kind: 'waiting'; nodeId: string; code: string; details?: Readonly<Record<string, unknown>> }
  | { kind: 'succeeded'; nodeId: string; run: CanvasNodeRun }
  | { kind: 'failed'; nodeId: string; run: CanvasNodeRun }

async function inspectGeneratingNode(
  task: TaskRecord,
  planNode: CanvasPlanNode,
  currentRun: CanvasNodeRun | undefined,
  deps: CanvasExecutionTaskHandlerDeps,
): Promise<NodeInspectionResult> {
  const generationId = currentRun?.generationId
  if (generationId === undefined) {
    return {
      kind: 'failed',
      nodeId: planNode.nodeId,
      run: {
        status: 'failed',
        error: 'Canvas node is marked generating without a generation ID',
      },
    }
  }

  const generation = await deps.repository.getGenerationRecord(generationId)
  if (generation === undefined) {
    return failedNodeInspection(planNode.nodeId, generationId, `Generation record not found: ${generationId}`)
  }
  if (generation.status === 'failed' || generation.status === 'cancelled') {
    const message =
      typeof generation.errorJson?.['message'] === 'string'
        ? String(generation.errorJson['message'])
        : `Canvas node generation ${generation.status}`
    return failedNodeInspection(planNode.nodeId, generation.id, message)
  }
  if (generation.status !== 'succeeded') {
    return {
      kind: 'waiting',
      nodeId: planNode.nodeId,
      code: 'CANVAS_GENERATION_WAITING',
      details: { nodeId: planNode.nodeId, generationId: generation.id, status: generation.status },
    }
  }

  const assetRepository = deps.assetRepository
  if (assetRepository === undefined) {
    return failedNodeInspection(planNode.nodeId, generation.id, 'Canvas execution asset repository is not configured')
  }

  const artifacts = (await deps.repository.listArtifactsForRecord(generation.id)).filter(
    artifact => artifact.kind === planNode.kind,
  )
  const failedArtifact = artifacts.find(artifact => artifact.status === 'failed')
  if (failedArtifact !== undefined) {
    return failedNodeInspection(planNode.nodeId, generation.id, 'Canvas node artifact persistence failed')
  }
  if (artifacts.length === 0) {
    return failedNodeInspection(
      planNode.nodeId,
      generation.id,
      'Canvas node generation completed without a matching media artifact',
    )
  }

  const assetIds = artifacts.map(artifact => `asset_generation_${artifact.id}`)
  try {
    const assets = await Promise.all(
      assetIds.map(assetId =>
        assetRepository.getUserAsset({
          userId: task.userId as string,
          assetId,
        }),
      ),
    )
    if (assets.some(asset => asset === undefined)) {
      return {
        kind: 'waiting',
        nodeId: planNode.nodeId,
        code: 'CANVAS_ASSET_WAITING',
        details: { nodeId: planNode.nodeId, generationId: generation.id },
      }
    }
  } catch {
    return {
      kind: 'waiting',
      nodeId: planNode.nodeId,
      code: 'CANVAS_ASSET_READ_RETRY',
      details: { nodeId: planNode.nodeId, generationId: generation.id },
    }
  }

  return {
    kind: 'succeeded',
    nodeId: planNode.nodeId,
    run: {
      status: 'succeeded',
      generationId: generation.id,
      assetIds,
    },
  }
}

function failedNodeInspection(nodeId: string, generationId: string, message: string): NodeInspectionResult {
  return {
    kind: 'failed',
    nodeId,
    run: { status: 'failed', generationId, error: message },
  }
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
    Object.entries(planNode.assetRefs).map(([parameter, ids]) => [parameter, [...ids]]),
  )
  for (const [parameter, upstreamNodeIds] of Object.entries(planNode.dependencyBindings)) {
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
        (code === 'CANVAS_NODE_ADVANCE' || code === 'CANVAS_NODE_QUEUED' ? NODE_ADVANCE_DELAY_MS : NODE_POLL_DELAY_MS),
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
      ...(details !== undefined && typeof details === 'object' && details !== null
        ? { details: details as Record<string, unknown> }
        : {}),
    },
    ...(nextInput === undefined ? {} : { nextInput }),
  }
}
