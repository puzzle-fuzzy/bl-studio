import type { ModelParameter } from '@bailian-studio/api-client'
import { buildParameterFormSchema, removeHiddenParameterValues } from './parameter-form-schema'

/**
 * 创作预设（版本化 localStorage）。
 *
 * 保存用户在创作工作台上填好的完整参数（模型 + 可见参数值），支持命名保存与
 * 最近使用。存储键带版本号，容量上限 12，隐私模式下自动清空。
 */

export const CREATION_PRESETS_STORAGE_KEY = 'bailian-studio.creation-presets.v1'
export const RECENT_MODEL_IDS_KEY = 'bailian-studio.recent-model-ids.v1'
const MAX_PRESETS = 12
const MAX_RECENT = 8

export interface CreationPreset {
  id: string
  name: string
  modelId: string
  params: Record<string, unknown>
  createdAt: string
}

export function loadCreationPresets(): CreationPreset[] {
  try {
    const raw = localStorage.getItem(CREATION_PRESETS_STORAGE_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isCreationPreset).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  } catch {
    return []
  }
}

function isCreationPreset(value: unknown): value is CreationPreset {
  if (typeof value !== 'object' || value === null) return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    typeof item.modelId === 'string' &&
    typeof item.createdAt === 'string' &&
    typeof item.params === 'object' &&
    item.params !== null
  )
}

function persist(presets: CreationPreset[]): CreationPreset[] {
  localStorage.setItem(CREATION_PRESETS_STORAGE_KEY, JSON.stringify(presets))
  return presets
}

/** 保存预设；同名覆盖，超出容量丢弃最旧的。 */
export function saveCreationPreset(preset: CreationPreset): CreationPreset[] {
  const presets = loadCreationPresets()
  const withoutDuplicate = presets.filter(item => item.name !== preset.name)
  const next = [preset, ...withoutDuplicate].slice(0, MAX_PRESETS)
  return persist(next)
}

export function removeCreationPreset(id: string): CreationPreset[] {
  return persist(loadCreationPresets().filter(item => item.id !== id))
}

/** 最近使用的模型 id（用于「最近使用」入口）。 */
export function loadRecentModelIds(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_MODEL_IDS_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

export function rememberRecentModelId(modelId: string): void {
  const recent = [modelId, ...loadRecentModelIds().filter(id => id !== modelId)].slice(0, MAX_RECENT)
  localStorage.setItem(RECENT_MODEL_IDS_KEY, JSON.stringify(recent))
}

/**
 * 从历史记录还原可提交参数（重试/「用同参数新建」）。
 * 以 manifest 默认值打底，叠加历史值，只保留当前可见参数并剥离隐藏字段。
 */
export function buildParamsFromRecord(
  recordParams: Record<string, unknown>,
  parameters: readonly ModelParameter[],
): Record<string, unknown> {
  const base: Record<string, unknown> = {}
  for (const parameter of parameters) {
    if (parameter.defaultValue !== undefined) base[parameter.name] = parameter.defaultValue
  }
  const merged = { ...base, ...recordParams }
  return removeHiddenParameterValues(parameters, merged)
}
