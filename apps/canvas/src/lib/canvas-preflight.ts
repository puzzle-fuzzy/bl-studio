import type { ModelCatalogItem } from '@bailian-studio/api-client'
import {
  preflightCanvasGraph,
  type CanvasValidationAssetKind,
  type CanvasPreflightResult,
} from '@bailian-studio/canvas-validation'
import type { Edge, Node } from '@xyflow/react'
import { toCanvasSnapshot } from './canvas-persistence'

/** 将 React Flow 当前编辑态适配为 Canvas 执行预检输入。 */
export function preflightCanvasState(
  nodes: readonly Node[],
  edges: readonly Edge[],
  models: readonly ModelCatalogItem[],
): CanvasPreflightResult {
  const assetKinds = new Map<string, CanvasValidationAssetKind>()
  for (const node of nodes) {
    const data = node.data as Record<string, unknown>
    const kinds = data.referenceAssetKinds
    if (kinds === null || typeof kinds !== 'object' || Array.isArray(kinds)) continue
    for (const [assetId, kind] of Object.entries(kinds)) {
      if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'text' || kind === 'archive') {
        assetKinds.set(assetId, kind)
      }
    }
  }

  return preflightCanvasGraph({
    snapshot: toCanvasSnapshot(nodes, edges),
    models: models.filter((model): model is ModelCatalogItem & { category: 'image' | 'video' } => (
      model.category === 'image' || model.category === 'video'
    )),
    assetKinds,
  })
}
