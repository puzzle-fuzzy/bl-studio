import type { ModelCatalogItem } from '@bailian-studio/api-client'

export interface CanvasReferenceAsset {
  assetId: string
  kind: 'image' | 'video'
}

type CanvasMediaParameter = ModelCatalogItem['parameters'][number] & {
  type: 'media'
  mediaKind: 'image' | 'video'
}

/**
 * 汇总当前模型按媒体类型可承载的参考素材槽位。
 *
 * 选择器和编译器都以 manifest 的 maxItems 为准；同一媒体类型存在多个
 * 参数时，用户可以在这些参数之间分配素材，因此容量是各参数上限之和。
 */
export function canvasReferenceCapacityByKind(
  parameters: ReadonlyArray<CanvasMediaParameter>,
): Record<CanvasReferenceAsset['kind'], number> {
  const capacityByKind: Record<CanvasReferenceAsset['kind'], number> = { image: 0, video: 0 }
  for (const parameter of parameters) {
    capacityByKind[parameter.mediaKind] += Math.max(0, parameter.maxItems ?? 1)
  }
  return capacityByKind
}

/**
 * 将画布入边转换为生成协议中的 assetRefs。
 *
 * 参考素材必须通过资产 ID 绑定，不能把 readUrl 塞进 params；参数的
 * mediaKind/maxItems 决定每条入边应落到哪个 provider 字段。
 */
export function buildCanvasAssetRefs(
  parameters: ReadonlyArray<CanvasMediaParameter>,
  references: ReadonlyArray<CanvasReferenceAsset>,
): Record<string, string | string[]> {
  const remaining = [...references]
  const assetRefs: Record<string, string | string[]> = {}

  for (const parameter of parameters) {
    const capacity = parameter.maxItems ?? 1
    const selected = remaining
      .filter(reference => reference.kind === parameter.mediaKind)
      .slice(0, capacity)

    if (selected.length === 0) continue

    const firstSelected = selected[0]
    if (firstSelected === undefined) continue
    const selectedIds = new Set(selected.map(reference => reference.assetId))
    assetRefs[parameter.name] = selected.length === 1
      ? firstSelected.assetId
      : selected.map(reference => reference.assetId)

    for (let index = remaining.length - 1; index >= 0; index -= 1) {
      const reference = remaining[index]
      if (reference !== undefined && selectedIds.has(reference.assetId)) remaining.splice(index, 1)
    }
  }

  return assetRefs
}

export function canvasMediaParameters(
  model: ModelCatalogItem | undefined,
): Array<CanvasMediaParameter> {
  return (model?.parameters ?? []).filter(
    (parameter): parameter is CanvasMediaParameter => (
      parameter.type === 'media'
      && (parameter.mediaKind === 'image' || parameter.mediaKind === 'video')
    ),
  )
}
