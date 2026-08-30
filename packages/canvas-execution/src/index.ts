/**
 * Canvas graph compiler.
 *
 * This package is intentionally pure: it turns an authored Canvas snapshot
 * into an immutable execution plan without touching HTTP, storage, DB or a
 * worker. The API owns user/asset authorization; the worker consumes the plan
 * and creates ordinary generation records for each node.
 */
import {
  getModelById as getRegisteredModelById,
  validateModelParams,
  type FrozenModelManifest,
  type ModelCategory,
} from '@bailian-studio/model-core'
import type {
  CanvasExecutionPlan,
  CanvasExecutionPlanNode,
  CanvasNode,
  CanvasSnapshot,
} from '@bailian-studio/canvas-contracts'

export type CanvasExecutionAssetKind =
  | 'image'
  | 'video'
  | 'audio'
  | 'text'
  | 'archive'

export type CanvasExecutionErrorCode =
  | 'CANVAS_EXECUTION_INVALID_GRAPH'
  | 'CANVAS_EXECUTION_UNSUPPORTED_NODE'
  | 'CANVAS_EXECUTION_MODEL_NOT_FOUND'
  | 'CANVAS_EXECUTION_MODEL_KIND_MISMATCH'
  | 'CANVAS_EXECUTION_PROMPT_REQUIRED'
  | 'CANVAS_EXECUTION_ASSET_NOT_FOUND'
  | 'CANVAS_EXECUTION_INPUT_UNSUPPORTED'
  | 'CANVAS_EXECUTION_REQUIRED_INPUT_MISSING'
  | 'CANVAS_EXECUTION_MODEL_VALIDATION_FAILED'
  | 'CANVAS_EXECUTION_INVALID_TASK_INPUT'

export class CanvasExecutionError extends Error {
  constructor(
    public readonly code: CanvasExecutionErrorCode,
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message)
    this.name = 'CanvasExecutionError'
  }
}

export interface CompileCanvasGraphOptions {
  snapshot: CanvasSnapshot
  /** Required when the snapshot contains manually selected asset IDs. */
  assetKinds?: ReadonlyMap<string, CanvasExecutionAssetKind>
  getModelById?: (id: string) => FrozenModelManifest | undefined
}

interface Reference {
  id: string
  kind: CanvasExecutionAssetKind
  sourceNodeId?: string
}

interface NodeContext {
  node: CanvasNode
  kind: 'image' | 'video'
  modelId: string
  model: FrozenModelManifest
}

/**
 * Compile and validate the graph in deterministic snapshot order.
 *
 * A connected edge is an ordered upstream reference. Static references are
 * resolved by the API to their owned asset kinds before this function runs.
 * The compiler never copies URLs into the plan.
 */
export function compileCanvasGraph({
  snapshot,
  assetKinds,
  getModelById = getRegisteredModelById,
}: CompileCanvasGraphOptions): CanvasExecutionPlan {
  if (snapshot.nodes.length === 0) {
    throw invalidGraph('Canvas graph must contain at least one executable node')
  }
  const nodeById = new Map<string, NodeContext>()
  for (const node of snapshot.nodes) {
    if (nodeById.has(node.id)) {
      throw invalidGraph(`Canvas contains duplicate node id: ${node.id}`, {
        nodeId: node.id,
      })
    }
    const kind = readNodeKind(node)
    const modelId = readString(node.data, 'modelId')
    if (modelId === undefined) {
      throw new CanvasExecutionError(
        'CANVAS_EXECUTION_MODEL_NOT_FOUND',
        `Canvas node ${node.id} has no modelId`,
        { nodeId: node.id },
      )
    }
    const model = getModelById(modelId)
    if (model === undefined) {
      throw new CanvasExecutionError(
        'CANVAS_EXECUTION_MODEL_NOT_FOUND',
        `Model ${modelId} is not available for canvas node ${node.id}`,
        { nodeId: node.id, modelId },
      )
    }
    if (model.category !== kind) {
      throw new CanvasExecutionError(
        'CANVAS_EXECUTION_MODEL_KIND_MISMATCH',
        `Model ${modelId} produces ${model.category}, but node ${node.id} is ${kind}`,
        {
          nodeId: node.id,
          modelId,
          expectedKind: kind,
          actualKind: model.category,
        },
      )
    }
    nodeById.set(node.id, { node, kind, modelId, model })
  }

  const incoming = new Map<
    string,
    Array<{ sourceId: string; edgeId: string }>
  >()
  const outgoing = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  const edgeIds = new Set<string>()
  const endpointPairs = new Set<string>()
  for (const node of snapshot.nodes) {
    incoming.set(node.id, [])
    outgoing.set(node.id, [])
    indegree.set(node.id, 0)
  }

  for (const edge of snapshot.edges) {
    if (edgeIds.has(edge.id)) {
      throw invalidGraph(`Canvas contains duplicate edge id: ${edge.id}`, {
        edgeId: edge.id,
      })
    }
    edgeIds.add(edge.id)
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) {
      throw invalidGraph(`Canvas edge ${edge.id} points to an unknown node`, {
        edgeId: edge.id,
        source: edge.source,
        target: edge.target,
      })
    }
    if (edge.source === edge.target) {
      throw invalidGraph(`Canvas edge ${edge.id} connects a node to itself`, {
        edgeId: edge.id,
      })
    }
    const pair = `${edge.source}\u0000${edge.target}\u0000${edge.sourceHandle ?? ''}\u0000${edge.targetHandle ?? ''}`
    if (endpointPairs.has(pair)) {
      throw invalidGraph(
        `Canvas contains duplicate connection ${edge.source} → ${edge.target}`,
        { edgeId: edge.id },
      )
    }
    endpointPairs.add(pair)
    incoming.get(edge.target)?.push({ sourceId: edge.source, edgeId: edge.id })
    outgoing.get(edge.source)?.push(edge.target)
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)
  }

  const topologicalOrder = topologicalSort(
    snapshot.nodes.map((node) => node.id),
    outgoing,
    indegree,
  )
  const planNodes = topologicalOrder.map((nodeId) => {
    const context = nodeById.get(nodeId)
    if (context === undefined) {
      throw invalidGraph(
        `Canvas node ${nodeId} disappeared during compilation`,
        { nodeId },
      )
    }
    return compileNode(
      context,
      incoming.get(nodeId) ?? [],
      nodeById,
      assetKinds,
    )
  })

  return { nodes: planNodes }
}

function compileNode(
  context: NodeContext,
  incomingEdges: Array<{ sourceId: string; edgeId: string }>,
  nodeById: ReadonlyMap<string, NodeContext>,
  assetKinds: ReadonlyMap<string, CanvasExecutionAssetKind> | undefined,
): CanvasExecutionPlanNode {
  const { node, kind, modelId, model } = context
  const prompt = readString(node.data, 'prompt')
  if (prompt === undefined || prompt.trim().length === 0) {
    throw new CanvasExecutionError(
      'CANVAS_EXECUTION_PROMPT_REQUIRED',
      `Canvas node ${node.id} requires a non-empty prompt`,
      { nodeId: node.id },
    )
  }

  const staticAssetIds = readAssetIds(node)
  const references: Reference[] = []
  for (const edge of incomingEdges) {
    const source = nodeById.get(edge.sourceId)
    if (source === undefined) {
      throw invalidGraph(
        `Canvas node ${node.id} has an unknown upstream node`,
        { nodeId: node.id, sourceId: edge.sourceId },
      )
    }
    references.push({
      id: source.node.id,
      kind: source.kind,
      sourceNodeId: source.node.id,
    })
  }
  for (const assetId of staticAssetIds) {
    const kindForAsset = assetKinds?.get(assetId)
    if (kindForAsset === undefined) {
      throw new CanvasExecutionError(
        'CANVAS_EXECUTION_ASSET_NOT_FOUND',
        `Canvas asset ${assetId} is unavailable or not owned by the current user`,
        { nodeId: node.id, assetId },
      )
    }
    references.push({ id: assetId, kind: kindForAsset })
  }

  const mediaParameters = model.parameters.filter(
    (parameter) => parameter.type === 'media',
  )
  const remaining = [...references]
  const assetRefs: Record<string, string[]> = {}
  const dependencyBindings: Record<string, string[]> = {}
  const validationParams: Record<string, unknown> = { prompt }

  for (const parameter of mediaParameters) {
    const mediaKind = parameter.mediaKind
    if (mediaKind === undefined) continue
    const capacity = parameter.maxItems ?? 1
    const selected = remaining
      .filter((reference) => reference.kind === mediaKind)
      .slice(0, capacity)
    if (selected.length === 0) {
      if (parameter.required === true || (parameter.minItems ?? 0) > 0) {
        throw new CanvasExecutionError(
          'CANVAS_EXECUTION_REQUIRED_INPUT_MISSING',
          `Canvas node ${node.id} requires ${mediaKind} input for ${parameter.name}`,
          { nodeId: node.id, parameter: parameter.name, mediaKind },
        )
      }
      continue
    }
    const selectedIds = new Set(selected.map((reference) => reference.id))
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const reference = remaining[index]
      if (reference !== undefined && selectedIds.has(reference.id))
        remaining.splice(index, 1)
    }

    const staticIds = selected
      .filter((reference) => reference.sourceNodeId === undefined)
      .map((reference) => reference.id)
    const upstreamIds = selected
      .filter((reference) => reference.sourceNodeId !== undefined)
      .map((reference) => reference.sourceNodeId as string)
    if (staticIds.length > 0) assetRefs[parameter.name] = staticIds
    if (upstreamIds.length > 0) dependencyBindings[parameter.name] = upstreamIds
    validationParams[parameter.name] = selected.map(
      (reference) => `canvas://${reference.id}`,
    )
  }

  if (remaining.length > 0) {
    const unsupported = remaining
      .map((reference) => `${reference.kind}:${reference.id}`)
      .join(', ')
    throw new CanvasExecutionError(
      'CANVAS_EXECUTION_INPUT_UNSUPPORTED',
      `Canvas node ${node.id} has inputs unsupported by model ${modelId}: ${unsupported}`,
      {
        nodeId: node.id,
        modelId,
        inputs: remaining.map((reference) => reference.id),
      },
    )
  }

  const validation = validateModelParams(model, validationParams)
  if (!validation.valid) {
    throw new CanvasExecutionError(
      'CANVAS_EXECUTION_MODEL_VALIDATION_FAILED',
      `Canvas node ${node.id} has invalid parameters for model ${modelId}`,
      {
        nodeId: node.id,
        modelId,
        issues: validation.errors.map((issue) => ({
          code: issue.code,
          field: issue.field,
          message: issue.message,
        })),
      },
    )
  }

  const params = { ...validation.params }
  for (const parameter of mediaParameters) delete params[parameter.name]
  const dependsOn = [...new Set(incomingEdges.map((edge) => edge.sourceId))]
  return {
    nodeId: node.id,
    kind,
    modelId,
    params,
    assetRefs,
    dependencyBindings,
    dependsOn,
  }
}

function topologicalSort(
  nodeIds: string[],
  outgoing: ReadonlyMap<string, string[]>,
  initialIndegree: ReadonlyMap<string, number>,
): string[] {
  const indegree = new Map(initialIndegree)
  const queue = nodeIds.filter((nodeId) => indegree.get(nodeId) === 0)
  const order: string[] = []
  while (queue.length > 0) {
    const nodeId = queue.shift()
    if (nodeId === undefined) continue
    order.push(nodeId)
    for (const target of outgoing.get(nodeId) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1
      indegree.set(target, next)
      if (next === 0) queue.push(target)
    }
  }
  if (order.length !== nodeIds.length) {
    throw new CanvasExecutionError(
      'CANVAS_EXECUTION_INVALID_GRAPH',
      'Canvas graph contains a cycle and cannot be executed',
    )
  }
  return order
}

function readNodeKind(node: CanvasNode): 'image' | 'video' {
  if (node.type !== 'mediaNode') {
    throw new CanvasExecutionError(
      'CANVAS_EXECUTION_UNSUPPORTED_NODE',
      `Canvas node ${node.id} has unsupported type ${node.type}`,
      { nodeId: node.id, type: node.type },
    )
  }
  const kind = node.data['kind']
  if (kind !== 'image' && kind !== 'video') {
    throw new CanvasExecutionError(
      'CANVAS_EXECUTION_UNSUPPORTED_NODE',
      `Canvas node ${node.id} has unsupported media kind`,
      { nodeId: node.id, kind },
    )
  }
  return kind
}

function readString(
  data: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = data[key]
  return typeof value === 'string' && value.trim().length > 0
    ? value
    : undefined
}

function readAssetIds(node: CanvasNode): string[] {
  const value = node.data['referenceAssetIds']
  if (value === undefined) return []
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== 'string' || item.trim().length === 0)
  ) {
    throw invalidGraph(`Canvas node ${node.id} has invalid referenceAssetIds`, {
      nodeId: node.id,
    })
  }
  return [...new Set(value.map((item) => item.trim()))]
}

function invalidGraph(
  message: string,
  details?: Readonly<Record<string, unknown>>,
): CanvasExecutionError {
  return new CanvasExecutionError(
    'CANVAS_EXECUTION_INVALID_GRAPH',
    message,
    details,
  )
}

export function isCanvasExecutionModelCategory(
  value: ModelCategory,
): value is 'image' | 'video' {
  return value === 'image' || value === 'video'
}
