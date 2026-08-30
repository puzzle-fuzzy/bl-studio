import type { CanvasEdge, CanvasNode, CanvasSnapshot } from '@bailian-studio/canvas-contracts'
import type { Edge, Node } from '@xyflow/react'

/** 只持久化生成节点下一次恢复所需的稳定字段；临时 read URL 由资产 API 重新解析。 */
const PERSISTED_DATA_KEYS = new Set([
  'kind',
  'status',
  'prompt',
  'modelId',
  'resultKind',
  'resultAssetId',
  'errorMessage',
  'referenceUrls',
  'referenceAssetIds',
  'aspectRatio',
])

function persistedData(data: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => PERSISTED_DATA_KEYS.has(key)),
  )
}

export function toCanvasSnapshot(nodes: readonly Node[], edges: readonly Edge[]): CanvasSnapshot {
  const snapshot: CanvasSnapshot = {
    nodes: nodes.map(node => ({
      id: node.id,
      type: node.type ?? 'default',
      position: { x: node.position.x, y: node.position.y },
      data: persistedData(node.data as Record<string, unknown>),
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
      data: node.data,
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
