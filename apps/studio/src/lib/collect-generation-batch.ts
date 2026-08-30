import type {
  CollectCreativeAssetFromGenerationBatchRequest,
  CreativeAssetReferenceRole,
  CreativeAssetType,
} from '@bailian-studio/api-client'

export const MAX_GENERATION_ASSET_BATCH_SIZE = 50

export function buildCollectGenerationBatchRequest({
  generationId,
  artifactIds,
  type,
  role,
  projectId,
  namePrefix,
  description,
}: {
  generationId: string
  artifactIds: readonly string[]
  type: CreativeAssetType
  role: CreativeAssetReferenceRole
  projectId?: string
  namePrefix: string
  description?: string
}): CollectCreativeAssetFromGenerationBatchRequest {
  const normalizedPrefix = namePrefix.trim()
  if (normalizedPrefix.length === 0) throw new Error('请输入素材名称前缀')
  if (artifactIds.length === 0) throw new Error('请至少选择一个已落存的图片产物')
  if (artifactIds.length > MAX_GENERATION_ASSET_BATCH_SIZE) {
    throw new Error(`一次最多收录 ${MAX_GENERATION_ASSET_BATCH_SIZE} 个图片产物`)
  }

  const normalizedDescription = description?.trim()
  const normalizedProjectId = projectId?.trim()
  return {
    items: artifactIds.map((artifactId, index) => ({
      type,
      name: `${normalizedPrefix} ${String(index + 1).padStart(2, '0')}`,
      ...(normalizedDescription ? { description: normalizedDescription } : {}),
      ...(normalizedProjectId ? { projectId: normalizedProjectId } : {}),
      sourceGenerationId: generationId,
      semanticSpec: {},
      generationRecipe: { source: 'generation', generationId, batchPosition: index },
      references: [{ artifactId, role, position: 0, metadata: { source: 'generated' } }],
    })),
  }
}
