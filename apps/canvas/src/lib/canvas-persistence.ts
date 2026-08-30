import type { CanvasEdge, CanvasNode, CanvasSnapshot } from '@bailian-studio/canvas-contracts'
import type { Edge, Node } from '@xyflow/react'
import { normalizeMediaNodeData, type MediaNodeData } from './media-node-data'

/** 只持久化编辑恢复所需的稳定字段；运行时状态和临时 read URL 不进入版本历史。 */
const PERSISTED_DATA_KEYS = new Set([
  'kind',
  'prompt',
  'modelId',
  'resultKind',
  'resultAssetId',
  'generationId',
  'referenceUrls',
  'referenceAssetIds',
  'referenceAssetKinds',
  'aspectRatio',
  'parameterValues',
])

function persistedData(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => PERSISTED_DATA_KEYS.has(key)),
  )
}

/** 没有 generationId 的旧“生成中”状态无法恢复轮询，打开时降级为可编辑状态。 */
function normalizeRestoredNodeData(data: Record<string, unknown>): MediaNodeData {
  const normalized = normalizeMediaNodeData(data)
  const generationId = normalized.generationId
  if (data.status === 'generating' && generationId !== undefined) return normalized
  if (data.status === 'error' || data.status === 'ready' || data.status === 'empty') return normalized
  return {
    ...normalized,
    status: generationId !== undefined
      ? 'generating'
      : normalized.resultAssetId !== undefined ? 'ready' : 'empty',
  }
}

export function toCanvasSnapshot(nodes: readonly Node[], edges: readonly Edge[]): CanvasSnapshot {
  const snapshot: CanvasSnapshot = {
    nodes: nodes.map(node => ({
      id: node.id,
      type: node.type ?? 'default',
      position: { x: node.position.x, y: node.position.y },
      data: persistedData(node.data),
    })),
    edges: edges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle !== null && edge.sourceHandle !== undefined ? { sourceHandle: edge.sourceHandle } : {}),
      ...(edge.targetHandle !== null && edge.targetHandle !== undefined ? { targetHandle: edge.targetHandle } : {}),
      ...(edge.animated !== undefined ? { animated: edge.animated } : {}),
      ...(edge.type !== undefined ? { type: edge.type } : {}),
    })),
  }
  return snapshot
}

export function fromCanvasSnapshot(snapshot: CanvasSnapshot): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: snapshot.nodes.map((node: CanvasNode) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: normalizeRestoredNodeData(node.data),
    })),
    edges: snapshot.edges.map((edge: CanvasEdge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      ...(edge.sourceHandle !== undefined ? { sourceHandle: edge.sourceHandle } : {}),
      ...(edge.targetHandle !== undefined ? { targetHandle: edge.targetHandle } : {}),
      ...(edge.animated !== undefined ? { animated: edge.animated } : {}),
      ...(edge.type !== undefined ? { type: edge.type } : {}),
    })),
  }
}
