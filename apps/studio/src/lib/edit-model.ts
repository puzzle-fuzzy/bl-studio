import type { ModelCatalogItem } from '@bailian-studio/api-client'

/**
 * 生成详情页「以图继续创作」的目标模型派生（P1-12）。
 *
 * 单一数据源是 model-core 的 manifest（category / capabilities / parameters）。
 * 这里不再硬编码 `qwen-image-edit` 之类的模型 id：编辑入口从已启用目录中按
 * capabilities 派生，模型下线/改名后入口自动消失而不是变成死入口。
 */

/** 生成产物镜像成 user_asset 时的 id 前缀（后端产物落库约定，勿单独改）。 */
export const ASSET_GENERATION_PREFIX = 'asset_generation_'

/** 生成产物镜像的 user_asset id。 */
export function generationMirrorAssetId(artifactId: string): string {
  return `${ASSET_GENERATION_PREFIX}${artifactId}`
}

/** 模型是否带 size select 参数（放大入口需要）。 */
function supportsSizeParameter(model: ModelCatalogItem): boolean {
  return model.parameters.some(parameter => parameter.name === 'size' && parameter.type === 'select')
}

/**
 * 图像编辑入口的目标模型：优先带 size 缩放能力的编辑模型，回退任意已启用的
 * image_input 图像模型（图生图/编辑均可承载「重绘/换背景/增删物体」）。
 */
export function pickImageEditModel(models: readonly ModelCatalogItem[]): ModelCatalogItem | undefined {
  const candidates = models.filter(
    model => model.category === 'image' && model.capabilities.includes('image_input'),
  )
  return candidates.find(supportsSizeParameter) ?? candidates[0]
}

/** 该编辑模型能否放大到 2048×2048（size select 是否含该选项，与 manifest 对齐）。 */
export function supportsUpscaleSize(model: ModelCatalogItem | undefined): boolean {
  if (model === undefined) return false
  const size = model.parameters.find(parameter => parameter.name === 'size' && parameter.type === 'select')
  return size?.options?.some(option => option.value === '2048*2048') ?? false
}
