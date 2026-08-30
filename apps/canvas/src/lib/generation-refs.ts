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
