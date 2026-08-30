import {
  CANVAS_ASPECT_RATIOS,
  type CanvasAspectRatio,
} from '@bailian-studio/canvas-contracts'
import type { Edge, Node } from '@xyflow/react'

export type MediaNodeStatus = 'empty' | 'generating' | 'ready' | 'error'
export type MediaKind = 'image' | 'video'

export interface MediaNodeData extends Record<string, unknown> {
  kind: MediaKind
  status: MediaNodeStatus
  prompt: string
  modelId: string
  resultUrl?: string
  resultKind?: MediaKind
  resultAssetId?: string
  /** 按当前模型 manifest 保存的普通参数；prompt/媒体/比例由节点专用字段管理。 */
  parameterValues?: Record<string, unknown>
  /** 单节点快捷 generation 在页面刷新后的恢复 ID。 */
  generationId?: string
  errorMessage?: string
  /** 仅保留旧版本画布数据的兼容展示；新连接使用上游资产 ID。 */
  referenceUrls: string[]
  /** 用户从资产库选择的稳定资产 ID；生成时按模型参数映射到 assetRefs。 */
  referenceAssetIds?: string[]
  /** 静态资产 ID 对应的媒体类型；用于模型切换和版本恢复时保持参数分配稳定。 */
  referenceAssetKinds?: Record<string, MediaKind>
  aspectRatio: CanvasAspectRatio
}

function objectRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value))
}

function mediaKind(value: unknown): MediaKind | undefined {
  return value === 'image' || value === 'video' ? value : undefined
}

function mediaNodeStatus(value: unknown): MediaNodeStatus {
  return value === 'generating' || value === 'ready' || value === 'error' ? value : 'empty'
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function normalizeReferenceAssetKinds(value: unknown): Record<string, MediaKind> {
  return Object.fromEntries(
    Object.entries(objectRecord(value)).flatMap(([assetId, value]) => {
      const kind = mediaKind(value)
      return kind === undefined ? [] : [[assetId, kind]]
    }),
  )
}

/**
 * 将服务端快照、localStorage 草稿和 React Flow runtime data 收敛为节点可消费的形状。
 * 该函数会保留未知字段，方便未来扩展，同时把节点渲染依赖的字段全部补齐或降级。
 */
export function normalizeMediaNodeData(value: unknown): MediaNodeData {
  const data = objectRecord(value)
  const resultKind = mediaKind(data.resultKind)
  const referenceAssetIds = stringArray(data.referenceAssetIds)

  return {
    ...data,
    kind: mediaKind(data.kind) ?? resultKind ?? 'image',
    status: mediaNodeStatus(data.status),
    prompt: typeof data.prompt === 'string' ? data.prompt : '',
    modelId: typeof data.modelId === 'string' ? data.modelId : '',
    resultUrl: optionalString(data.resultUrl),
    resultKind,
    resultAssetId: optionalString(data.resultAssetId),
    parameterValues: objectRecord(data.parameterValues),
    generationId: optionalString(data.generationId),
    errorMessage: optionalString(data.errorMessage),
    referenceUrls: stringArray(data.referenceUrls),
    referenceAssetIds,
    referenceAssetKinds: normalizeReferenceAssetKinds(data.referenceAssetKinds),
    aspectRatio: CANVAS_ASPECT_RATIOS.find(ratio => ratio === data.aspectRatio) ?? '1:1',
  }
}

function position(value: unknown): { x: number; y: number } | undefined {
  const record = objectRecord(value)
  return typeof record.x === 'number' && Number.isFinite(record.x)
    && typeof record.y === 'number' && Number.isFinite(record.y)
    ? { x: record.x, y: record.y }
    : undefined
}

/** 仅从离线草稿恢复 React Flow 需要的稳定节点字段，丢弃未知结构避免污染 store。 */
export function normalizeStoredCanvasNode(value: unknown): Node<MediaNodeData> | undefined {
  const record = objectRecord(value)
  const id = typeof record.id === 'string' && record.id.length > 0 ? record.id : undefined
  const nodePosition = position(record.position)
  if (id === undefined || nodePosition === undefined) return undefined

  return {
    id,
    type: typeof record.type === 'string' && record.type.length > 0 ? record.type : 'mediaNode',
    position: nodePosition,
    data: normalizeMediaNodeData(record.data),
    ...(typeof record.selected === 'boolean' ? { selected: record.selected } : {}),
    ...(typeof record.hidden === 'boolean' ? { hidden: record.hidden } : {}),
  }
}

/** 仅从离线草稿恢复连接拓扑需要的稳定边字段。 */
export function normalizeStoredCanvasEdge(value: unknown): Edge | undefined {
  const record = objectRecord(value)
  if (
    typeof record.id !== 'string'
    || record.id.length === 0
    || typeof record.source !== 'string'
    || record.source.length === 0
    || typeof record.target !== 'string'
    || record.target.length === 0
  ) return undefined

  return {
    id: record.id,
    source: record.source,
    target: record.target,
    ...(typeof record.sourceHandle === 'string' || record.sourceHandle === null
      ? { sourceHandle: record.sourceHandle }
      : {}),
    ...(typeof record.targetHandle === 'string' || record.targetHandle === null
      ? { targetHandle: record.targetHandle }
      : {}),
    ...(typeof record.animated === 'boolean' ? { animated: record.animated } : {}),
    ...(typeof record.type === 'string' ? { type: record.type } : {}),
  }
}
