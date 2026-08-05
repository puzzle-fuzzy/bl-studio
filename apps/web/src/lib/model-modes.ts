import type { ModelCatalogItem } from '@bailian-studio/api-client'

/**
 * 模型级联分组的子模式推导（纯函数，可单测）。
 *
 * 三连下拉：分类（视频/图片/音乐）→ 子模式（参考生视频/图生视频/文生视频/视频编辑…）
 * → 模型。子模式由模型的 `capabilities` 推导，与 manifest 保持单一事实源：
 * - video：video_input→视频编辑；multi_reference→参考生视频；image_input→图生视频；否则文生视频；
 * - image：image_input→图生图；否则文生图；
 * - audio：audio_input→语音识别；否则音乐生成。
 */

export type ModelCategory = 'video' | 'image' | 'audio'
export type SubMode = 'r2v' | 'i2v' | 't2v' | 'vedit' | 'r2i' | 'i2i' | 't2i' | 'music' | 'asr'

/** 一级分类下拉（只列出实际存在模型的分类）。 */
export const CATEGORY_OPTIONS: ReadonlyArray<{ value: ModelCategory; label: string }> = [
  { value: 'video', label: '视频生成' },
  { value: 'image', label: '图片生成' },
  { value: 'audio', label: '音乐生成' },
]

/** 子模式中文名。 */
export const SUB_MODE_LABELS: Record<SubMode, string> = {
  r2v: '参考生视频',
  i2v: '图生视频',
  t2v: '文生视频',
  vedit: '视频编辑',
  r2i: '参考生图',
  i2i: '图生图',
  t2i: '文生图',
  music: '音乐生成',
  asr: '语音识别',
}

/** 每个分类的子模式下拉顺序。 */
export const SUB_MODE_ORDER: Record<ModelCategory, readonly SubMode[]> = {
  video: ['r2v', 'i2v', 't2v', 'vedit'],
  image: ['r2i', 'i2i', 't2i'],
  audio: ['music', 'asr'],
}

/** 由模型 capabilities 推导子模式。 */
export function subModeOf(model: Pick<ModelCatalogItem, 'category' | 'capabilities'>): SubMode {
  const caps = new Set(model.capabilities)
  if (model.category === 'video') {
    if (caps.has('video_input')) return 'vedit'
    if (caps.has('multi_reference')) return 'r2v'
    if (caps.has('image_input')) return 'i2v'
    return 't2v'
  }
  if (model.category === 'image') {
    if (caps.has('image_input')) return 'i2i'
    return 't2i'
  }
  // audio
  if (caps.has('audio_input')) return 'asr'
  return 'music'
}

/** 分类下存在模型的子模式（保持 SUB_MODE_ORDER 顺序）。 */
export function availableSubModes(models: readonly ModelCatalogItem[], category: ModelCategory): SubMode[] {
  return SUB_MODE_ORDER[category].filter(mode => modelsInMode(models, category, mode).length > 0)
}

/** 分类 + 子模式 → 模型列表。 */
export function modelsInMode(
  models: readonly ModelCatalogItem[],
  category: ModelCategory,
  mode: SubMode,
): ModelCatalogItem[] {
  return models.filter(model => model.category === category && subModeOf(model) === mode)
}

/** 分类 → 模型列表。 */
export function modelsInCategory(models: readonly ModelCatalogItem[], category: ModelCategory): ModelCatalogItem[] {
  return models.filter(model => model.category === category)
}

/**
 * 模型中文名：取 description 首个「，/,」前的片段。
 * 如「快乐马参考生视频，多参考图保持角色一致」→「快乐马参考生视频」；
 * 无 description 时退回英文 displayName。
 */
export function modelNameZh(model: Pick<ModelCatalogItem, 'displayName' | 'description'>): string {
  const description = model.description
  if (description === undefined) return model.displayName
  const first = (description.split(/[，,]/)[0] ?? '').trim()
  return first.length > 0 ? first : model.displayName
}
