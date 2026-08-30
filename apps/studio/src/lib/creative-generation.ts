import type { AssetItem, CreateGenerationRequest, CreativeAssetDetail, ModelCatalogItem } from '@bailian-studio/api-client'
import { resolveApiUrl } from '@/lib/api'

export type CreativeGenerationContext = NonNullable<CreateGenerationRequest['creativeContext']>

function approvedVersion(asset: CreativeAssetDetail) {
  return asset.versions.find(version => version.id === asset.approvedVersionId)
}

/** 把已确认版本的参考图投影成现有媒体表单可以展示的 AssetItem。 */
export function creativeAssetReferencesToAssetItems(assets: readonly CreativeAssetDetail[]): AssetItem[] {
  return orderedAssets(assets).flatMap(asset => {
    const version = approvedVersion(asset)
    if (version === undefined) return []
    return version.references.map(reference => ({
      id: reference.userAssetId,
      kind: reference.preview?.kind ?? 'image',
      source: 'derived' as const,
      ...(reference.preview?.url === undefined ? {} : { url: resolveApiUrl(reference.preview.url) }),
      ...(reference.preview?.thumbnailUrl === undefined ? {} : { thumbnailUrl: resolveApiUrl(reference.preview.thumbnailUrl) }),
      ...(reference.preview?.thumbnailStatus === undefined ? {} : { thumbnailStatus: reference.preview.thumbnailStatus }),
      createdAt: reference.createdAt,
    }))
  })
}

/** 把当前选中的资产编译成 CreateGeneration 所需的语义上下文。 */
export function buildCreativeGenerationContext(input: {
  model: ModelCatalogItem
  prompt: string
  negativePrompt?: string
  projectId?: string
  assets: readonly CreativeAssetDetail[]
}): CreativeGenerationContext | undefined {
  const assets = orderedAssets(input.assets)
  if (assets.length === 0) return undefined
  const positions = new Map<string, number>()
  const assetBindings = assets.flatMap(asset => {
    const version = approvedVersion(asset)
    if (version === undefined || version.references.length === 0) return []
    const position = positions.get(asset.type) ?? 0
    positions.set(asset.type, position + 1)
    return [{
      assetVersionId: version.id,
      role: asset.type,
      position,
      referenceIds: version.references.map(reference => reference.id),
    }]
  })
  if (assetBindings.length === 0) return undefined
  const purpose = input.model.category === 'video'
    ? 'shot_video' as const
    : input.model.category === 'image'
      ? 'shot_image' as const
      : 'utility' as const
  return {
    protocolVersion: 1,
    purpose,
    ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
    prompt: input.prompt,
    ...(input.negativePrompt?.trim() ? { negativePrompt: input.negativePrompt.trim() } : {}),
    modelId: input.model.id,
    assetBindings,
    recipe: { source: 'creative-asset-picker' },
    capabilitySnapshot: {},
  }
}

function orderedAssets(assets: readonly CreativeAssetDetail[]): CreativeAssetDetail[] {
  const order = new Map(['character', 'environment', 'prop', 'style'].map((type, index) => [type, index]))
  return [...assets].sort((left, right) => (order.get(left.type) ?? 99) - (order.get(right.type) ?? 99) || left.id.localeCompare(right.id))
}
