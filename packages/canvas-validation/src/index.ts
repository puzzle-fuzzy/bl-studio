import {
  projectCanvasParameterValues,
  resolveCanvasAspectRatioParameter,
  type CanvasNode,
  type CanvasSnapshot,
} from '@bailian-studio/canvas-contracts'
import {
  validateModelParams,
  type ModelCategory,
  type ParameterIssueCode,
  type ParametersValidationInput,
} from '@bailian-studio/model-core'

export type CanvasValidationAssetKind = 'image' | 'video' | 'audio' | 'text' | 'archive'

type CanvasValidationErrorCode =
  | 'CANVAS_EXECUTION_INVALID_GRAPH'
  | 'CANVAS_EXECUTION_UNSUPPORTED_NODE'
  | 'CANVAS_EXECUTION_MODEL_NOT_FOUND'
  | 'CANVAS_EXECUTION_MODEL_KIND_MISMATCH'
  | 'CANVAS_EXECUTION_PROMPT_REQUIRED'
  | 'CANVAS_EXECUTION_INPUT_UNSUPPORTED'
  | 'CANVAS_EXECUTION_REQUIRED_INPUT_MISSING'

/** 前端提交前预检所需的模型目录投影；完整 manifest 仍由服务端保管。 */
export type CanvasPreflightModel = Pick<
  ParametersValidationInput,
  'id' | 'parameters' | 'rules' | 'taskMode'
> & {
  category: Extract<ModelCategory, 'image' | 'video'>
}

export interface CanvasPreflightIssue {
  code: CanvasValidationErrorCode | ParameterIssueCode
  message: string
  nodeId?: string
  field?: string
}

export interface CanvasPreflightResult {
  valid: boolean
  issues: CanvasPreflightIssue[]
}

export interface PreflightCanvasGraphOptions {
  snapshot: CanvasSnapshot
  /** 只需 API 返回的已启用模型目录，不需要 provider transport 等服务端字段。 */
  models: ReadonlyArray<CanvasPreflightModel>
  /** 前端已知的静态资产类型；缺失时保留服务端授权检查作为最终边界。 */
  assetKinds?: ReadonlyMap<string, CanvasValidationAssetKind>
}

interface PreflightContext {
  node: CanvasNode
  kind: 'image' | 'video'
  model: CanvasPreflightModel
}

interface PreflightReference {
  id: string
  kind: CanvasValidationAssetKind
}

/**
 * 在客户端复用 model-core 与 Canvas 编译规则做提交前预检。
 *
 * 预检只负责反馈，不取代 API 的权限、资产归属和最终编译；因此静态资产没有
 * 类型缓存时不会擅自判定为不存在，而是让服务端继续完成权威检查。
 */
export function preflightCanvasGraph({
  snapshot,
  models,
  assetKinds,
}: PreflightCanvasGraphOptions): CanvasPreflightResult {
  const issues: CanvasPreflightIssue[] = []
  if (snapshot.nodes.length === 0) {
    issues.push(issue('CANVAS_EXECUTION_INVALID_GRAPH', '画布至少需要一个可执行节点'))
    return { valid: false, issues }
  }

  const modelById = new Map(models.map(model => [model.id, model]))
  const contexts = new Map<string, PreflightContext>()
  const nodeIds = new Set<string>()
  let hasDuplicateNode = false

  for (const node of snapshot.nodes) {
    if (nodeIds.has(node.id)) {
      hasDuplicateNode = true
      issues.push(issue('CANVAS_EXECUTION_INVALID_GRAPH', `画布包含重复节点 ID：${node.id}`, node.id))
      continue
    }
    nodeIds.add(node.id)

    const kind = readNodeKind(node)
    if (kind === undefined) {
      issues.push(issue(
        'CANVAS_EXECUTION_UNSUPPORTED_NODE',
        `节点 ${node.id} 不是受支持的图片或视频节点`,
        node.id,
      ))
      continue
    }
    const modelId = readString(node.data, 'modelId')
    if (modelId === undefined) {
      issues.push(issue('CANVAS_EXECUTION_MODEL_NOT_FOUND', `节点 ${node.id} 尚未选择模型`, node.id))
      continue
    }
    const model = modelById.get(modelId)
    if (model === undefined) {
      issues.push(issue('CANVAS_EXECUTION_MODEL_NOT_FOUND', `节点 ${node.id} 的模型不可用：${modelId}`, node.id))
      continue
    }
    if (model.category !== kind) {
      issues.push(issue(
        'CANVAS_EXECUTION_MODEL_KIND_MISMATCH',
        `节点 ${node.id} 是${kind === 'image' ? '图片' : '视频'}节点，但模型 ${modelId} 产出${model.category}`,
        node.id,
      ))
      continue
    }
    contexts.set(node.id, { node, kind, model })
  }

  const incoming = new Map<string, PreflightReference[]>()
  const outgoing = new Map<string, string[]>()
  const indegree = new Map<string, number>()
  for (const nodeId of nodeIds) {
    incoming.set(nodeId, [])
    outgoing.set(nodeId, [])
    indegree.set(nodeId, 0)
  }

  const edgeIds = new Set<string>()
  const endpointPairs = new Set<string>()
  let hasInvalidEdge = false
  for (const edge of snapshot.edges) {
    if (edgeIds.has(edge.id)) {
      hasInvalidEdge = true
      issues.push(issue('CANVAS_EXECUTION_INVALID_GRAPH', `画布包含重复边 ID：${edge.id}`))
      continue
    }
    edgeIds.add(edge.id)
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      hasInvalidEdge = true
      issues.push(issue('CANVAS_EXECUTION_INVALID_GRAPH', `连线 ${edge.id} 指向未知节点`))
      continue
    }
    if (edge.source === edge.target) {
      hasInvalidEdge = true
      issues.push(issue('CANVAS_EXECUTION_INVALID_GRAPH', `连线 ${edge.id} 不能连接节点自身`, edge.source))
      continue
    }
    const pair = `${edge.source}\u0000${edge.target}\u0000${edge.sourceHandle ?? ''}\u0000${edge.targetHandle ?? ''}`
    if (endpointPairs.has(pair)) {
      hasInvalidEdge = true
      issues.push(issue('CANVAS_EXECUTION_INVALID_GRAPH', `画布包含重复连接：${edge.source} → ${edge.target}`))
      continue
    }
    endpointPairs.add(pair)
    outgoing.get(edge.source)?.push(edge.target)
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1)

    const source = contexts.get(edge.source)
    const target = contexts.get(edge.target)
    if (source !== undefined && target !== undefined) {
      incoming.get(edge.target)?.push({ id: source.node.id, kind: source.kind })
    }
  }

  if (!hasDuplicateNode && !hasInvalidEdge && hasCycle([...nodeIds], outgoing, indegree)) {
    issues.push(issue('CANVAS_EXECUTION_INVALID_GRAPH', '画布存在循环连线，无法执行'))
  }

  for (const node of snapshot.nodes) {
    const context = contexts.get(node.id)
    if (context === undefined) continue
    issues.push(...preflightNode(context, incoming.get(node.id) ?? [], assetKinds))
  }

  return { valid: issues.length === 0, issues }
}

function preflightNode(
  context: PreflightContext,
  incoming: ReadonlyArray<PreflightReference>,
  assetKinds: ReadonlyMap<string, CanvasValidationAssetKind> | undefined,
): CanvasPreflightIssue[] {
  const { node, kind, model } = context
  const issues: CanvasPreflightIssue[] = []
  const parameterValues = readParameterValues(node, issues)
  const prompt = readString(node.data, 'prompt')
  if (prompt === undefined) {
    issues.push(issue(
      'CANVAS_EXECUTION_PROMPT_REQUIRED',
      `节点 ${node.id} 需要填写提示词`,
      node.id,
      'prompt',
    ))
  }
  const validationParams: Record<string, unknown> = {
    ...projectCanvasParameterValues(model.parameters, parameterValues),
    ...(prompt === undefined ? {} : { prompt }),
  }
  const aspectRatio = readString(node.data, 'aspectRatio')
  if (aspectRatio !== undefined) {
    const mapped = resolveCanvasAspectRatioParameter(model.parameters, aspectRatio)
    if (mapped !== undefined) validationParams[mapped.name] = mapped.value
  }

  const references = [
    ...incoming,
    ...readStaticReferences(node, kind, assetKinds, issues),
  ]
  const remaining = [...references]
  const missingMediaFields = new Set<string>()
  for (const parameter of model.parameters) {
    if (parameter.type !== 'media') continue
    const mediaKind = parameter.mediaKind
    if (mediaKind === undefined) continue
    const capacity = parameter.maxItems ?? 1
    const selected = remaining.filter(reference => reference.kind === mediaKind).slice(0, capacity)
    if (selected.length === 0) {
      if (parameter.required === true || (parameter.minItems ?? 0) > 0) {
        missingMediaFields.add(parameter.name)
        issues.push(issue(
          'CANVAS_EXECUTION_REQUIRED_INPUT_MISSING',
          `节点 ${node.id} 需要${mediaKindLabel(mediaKind)}素材：${parameter.label}`,
          node.id,
          parameter.name,
        ))
      }
      continue
    }
    const selectedIds = new Set(selected.map(reference => reference.id))
    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const reference = remaining[index]
      if (reference !== undefined && selectedIds.has(reference.id)) remaining.splice(index, 1)
    }
    validationParams[parameter.name] = selected.map(reference => `canvas://${reference.id}`)
  }

  if (remaining.length > 0) {
    issues.push(issue(
      'CANVAS_EXECUTION_INPUT_UNSUPPORTED',
      `节点 ${node.id} 有 ${remaining.length} 个输入素材无法匹配当前模型`,
      node.id,
    ))
  }

  const validation = validateModelParams(model, validationParams)
  for (const validationIssue of validation.errors) {
    // 上面的 Canvas 媒体槽位错误比通用 required/out-of-range 更具体，避免同一问题重复展示。
    if (missingMediaFields.has(validationIssue.field) || (validationIssue.field === 'prompt' && prompt === undefined)) continue
    issues.push(issue(
      validationIssue.code,
      validationIssue.messages['zh-CN'] ?? validationIssue.message,
      node.id,
      validationIssue.field,
    ))
  }
  return issues
}

function readNodeKind(node: CanvasNode): 'image' | 'video' | undefined {
  if (node.type !== 'mediaNode') return undefined
  const kind = node.data['kind']
  return kind === 'image' || kind === 'video' ? kind : undefined
}

function readString(data: Record<string, unknown>, key: string): string | undefined {
  const value = data[key]
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function readParameterValues(
  node: CanvasNode,
  issues: CanvasPreflightIssue[],
): Record<string, unknown> {
  const value = node.data['parameterValues']
  if (value === undefined) return {}
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    issues.push(issue('CANVAS_EXECUTION_INVALID_GRAPH', `节点 ${node.id} 的模型参数格式无效`, node.id, 'parameterValues'))
    return {}
  }
  return Object.fromEntries(Object.entries(value))
}

function readStaticReferences(
  node: CanvasNode,
  nodeKind: 'image' | 'video',
  assetKinds: ReadonlyMap<string, CanvasValidationAssetKind> | undefined,
  issues: CanvasPreflightIssue[],
): PreflightReference[] {
  const value = node.data['referenceAssetIds']
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string' || item.trim().length === 0)) {
    issues.push(issue('CANVAS_EXECUTION_INVALID_GRAPH', `节点 ${node.id} 的参考素材 ID 格式无效`, node.id, 'referenceAssetIds'))
    return []
  }
  const kinds = node.data['referenceAssetKinds']
  const declaredKinds = objectRecord(kinds)
  return [...new Set(value.map(item => item.trim()))].map(id => ({
    id,
    kind: assetKinds?.get(id)
      ?? readAssetKind(declaredKinds[id])
      ?? nodeKind,
  }))
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value))
}

function readAssetKind(value: unknown): CanvasValidationAssetKind | undefined {
  return value === 'image' || value === 'video' || value === 'audio' || value === 'text' || value === 'archive'
    ? value
    : undefined
}

function mediaKindLabel(kind: ModelCategory): string {
  return kind === 'image' ? '图片' : kind === 'video' ? '视频' : kind === 'audio' ? '音频' : '文本'
}

function hasCycle(
  nodeIds: ReadonlyArray<string>,
  outgoing: ReadonlyMap<string, string[]>,
  initialIndegree: ReadonlyMap<string, number>,
): boolean {
  const indegree = new Map(initialIndegree)
  const queue = nodeIds.filter(nodeId => indegree.get(nodeId) === 0)
  let visited = 0
  while (queue.length > 0) {
    const nodeId = queue.shift()
    if (nodeId === undefined) continue
    visited += 1
    for (const target of outgoing.get(nodeId) ?? []) {
      const next = (indegree.get(target) ?? 0) - 1
      indegree.set(target, next)
      if (next === 0) queue.push(target)
    }
  }
  return visited !== nodeIds.length
}

function issue(
  code: CanvasPreflightIssue['code'],
  message: string,
  nodeId?: string,
  field?: string,
): CanvasPreflightIssue {
  return {
    code,
    message,
    ...(nodeId === undefined ? {} : { nodeId }),
    ...(field === undefined ? {} : { field }),
  }
}
