import type { CreateGenerationRequest, ModelCatalogItem } from '@bailian-studio/api-client'

/**
 * 辅助工具（视频→剧本 / 语音识别）的提交载荷构建（R2-P1-09）。
 *
 * 把「工具模型 → 所选素材的 assetRefs 媒体参数名」映射下沉为纯函数，便于单测：
 * P0-01 曾因 UI 层把 fun-asr 的媒体参数错写成 audioUrl（manifest 声明为 fileUrls）
 * 导致功能端到端不可用——这个映射必须与 manifest 的媒体参数名对齐，并靠测试锁死。
 *
 * 单一事实源在 model-core 的 manifest（参数 type: 'media' 的 name）。P1-37 把「哪些
 * 模型是剧本流 / ASR 流」的判定从硬编码 ID 下沉到 manifest capabilities（screenplay /
 * audio_input）：新增剧本/ASR 模型只改 manifest + 按 capability 声明媒体参数名，
 * 不再需要在这里枚举模型 ID。FunctionsPage 用 selectToolModel 按能力选首个已启用模型。
 */

export type ToolModelKind = 'screenplay' | 'asr'

/** 按 capability 判定工具模型类型；不属于任何工具流返回 undefined。 */
export function toolModelKind(model: Pick<ModelCatalogItem, 'category' | 'capabilities'>): ToolModelKind | undefined {
  if (model.capabilities.includes('screenplay')) return 'screenplay'
  if (model.category === 'audio' && model.capabilities.includes('audio_input')) return 'asr'
  return undefined
}

/** 分类下第一个已启用的工具模型；无启用模型返回 undefined（FunctionsPage 显示「模型暂不可用」）。 */
export function selectToolModel(
  models: readonly ModelCatalogItem[],
  kind: ToolModelKind,
): ModelCatalogItem | undefined {
  return models.find(model => toolModelKind(model) === kind && model.availability?.enabled !== false)
}

/** 工具提交所需的媒体参数名：assetRefs 的 key，须与 manifest 中 type: 'media' 的参数 name 一致。 */
export function toolMediaParamName(model: ModelCatalogItem): string {
  const kind = toolModelKind(model)
  if (kind === 'screenplay') return 'videoUrl'
  if (kind === 'asr') return 'fileUrls'
  throw new Error(`Unsupported tool model: ${model.id}`)
}

export function buildToolGenerationPayload(
  model: ModelCatalogItem,
  assetId: string,
): CreateGenerationRequest {
  return {
    modelId: model.id,
    params: {},
    assetRefs: { [toolMediaParamName(model)]: [assetId] },
  }
}
