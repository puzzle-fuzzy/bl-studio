/**
 * 全站统一的中文标签映射。
 *
 * 原 Vue/React 两版把 category / kind / source / status 的中文文案分散在 5+ 处
 * （labels.ts、GenerationsPage、CreationToolsPanel、AssetPickerDialog、
 * MediaParameterInput）。合并后收敛到本模块，杜绝重复与漂移。
 */

export const CATEGORY_LABELS: Record<string, string> = {
  image: '图像生成',
  video: '视频生成',
  audio: '音频生成',
  text: '文本生成',
}

export function categoryLabel(category: string | undefined): string {
  return category === undefined ? '未知' : (CATEGORY_LABELS[category] ?? category)
}

export const KIND_LABELS: Record<string, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
  text: '文本',
  archive: '压缩包',
}

export const CREATIVE_ASSET_TYPE_LABELS: Record<string, string> = {
  character: '主体',
  environment: '场景',
  prop: '道具',
  style: '风格',
}

export const CREATIVE_ASSET_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  active: '活跃',
  archived: '已归档',
}

export const CREATIVE_ASSET_VERSION_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  generating: '生成中',
  candidate: '候选',
  approved: '已确认',
  archived: '已归档',
  rejected: '已拒绝',
}

export function creativeAssetTypeLabel(type: string | undefined): string {
  return type === undefined ? '素材' : (CREATIVE_ASSET_TYPE_LABELS[type] ?? type)
}

export function creativeAssetStatusLabel(status: string | undefined): string {
  return status === undefined ? '未知' : (CREATIVE_ASSET_STATUS_LABELS[status] ?? status)
}

export function creativeAssetVersionStatusLabel(status: string | undefined): string {
  return status === undefined ? '未生成版本' : (CREATIVE_ASSET_VERSION_STATUS_LABELS[status] ?? status)
}

export function kindLabel(kind: string | undefined): string {
  return kind === undefined ? '文件' : (KIND_LABELS[kind] ?? kind)
}

export const SOURCE_LABELS: Record<string, string> = {
  upload: '上传',
  link: '链接',
  generation: '生成',
  derived: '派生',
}

export function sourceLabel(source: string | undefined): string {
  return source === undefined ? '未知' : (SOURCE_LABELS[source] ?? source)
}

export const GENERATION_STATUS_LABELS: Record<string, string> = {
  draft: '草稿',
  submitting: '提交中',
  processing: '处理中',
  provider_processing: '生成中',
  saving_output: '保存中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
}

export function generationStatusLabel(status: string | undefined): string {
  return status === undefined ? '未知' : (GENERATION_STATUS_LABELS[status] ?? status)
}

/** 需要实时推进的任务态（非终态）。驱动 SSE 事件后的 record 刷新与缩略图轮询。 */
export const ACTIVE_GENERATION_STATUSES: ReadonlySet<string> = new Set([
  'draft',
  'submitting',
  'processing',
  'provider_processing',
  'saving_output',
])

export const THUMBNAIL_REFRESH_MS = 2_000
export const GENERATIONS_PAGE_SIZE = 30
export const ASSETS_PAGE_SIZE = 36
