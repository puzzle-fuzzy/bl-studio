import type { AssetItem, ModelCatalogItem } from '@bailian-studio/api-client'
import { buildParameterFormSchema, removeHiddenParameterValues } from './parameter-form-schema'
import { referenceFormatOf, resolvePromptReferences } from './reference-format'

/**
 * 生成提交 payload 构造（纯函数，可单测）。
 *
 * - 可见参数值进入 `params`（剥离隐藏字段与 `_` UI 元数据）；
 * - media 类型字段（值形如 AssetItem[]，即「参考素材」参考池）提取为
 *   `assetRefs[paramName]`，顺序即 provider 参考图下标；
 * - 提示词中的 `@图N` 标记按模型 referenceFormat 转成 provider 语法（N 与
 *   `assetRefs.references` 顺序一一对应）。
 */

export interface SubmitPayload {
  params: Record<string, unknown>
  assetRefs: Record<string, string[]>
  resolvedPrompt: string
}

function isMediaValue(value: unknown): value is AssetItem[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    typeof value[0] === 'object' &&
    value[0] !== null &&
    'id' in value[0]
  )
}

export function buildSubmitPayload(
  model: ModelCatalogItem,
  values: Readonly<Record<string, unknown>>,
): SubmitPayload {
  const visible = removeHiddenParameterValues(model.parameters, values)
  const params: Record<string, unknown> = {}
  const assetRefs: Record<string, string[]> = {}

  for (const [key, value] of Object.entries(visible)) {
    if (key.startsWith('_')) continue
    if (isMediaValue(value)) {
      assetRefs[key] = value.map(asset => asset.id)
    } else {
      params[key] = value
    }
  }

  const format = referenceFormatOf(model)
  const promptValue = params.prompt
  const resolvedPrompt =
    typeof promptValue === 'string' ? resolvePromptReferences(promptValue, format) : ''
  params.prompt = resolvedPrompt

  return { params, assetRefs, resolvedPrompt }
}
