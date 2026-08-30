import type { AssetItem, ModelCatalogItem } from '@bailian-studio/api-client'
import { removeHiddenParameterValues } from './parameter-form-schema'
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
  const mediaParamNames = new Set(
    model.parameters.filter(parameter => parameter.type === 'media').map(parameter => parameter.name),
  )

  for (const [key, value] of Object.entries(visible)) {
    if (key.startsWith('_')) continue
    if (mediaParamNames.has(key)) {
      // 声明的媒体参数：非空参考池 → assetRefs；空值/空数组 → 省略。
      // 空数组不能落进 params：服务端 prepareGenerationParams 要求 media 参数
      // 必须经 assetRefs 提供且拒绝空引用，而可选媒体参数（如 q2-pro 的参考视频）
      // 未选素材时正是空数组——此时整体省略才是合法提交。
      if (Array.isArray(value) && value.length > 0 && isMediaValue(value)) {
        assetRefs[key] = value.map(asset => asset.id)
      }
      continue
    }
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

/**
 * 构造 model-core validateModelParams 的入参（纯函数，可单测）。
 *
 * 与服务端 prepareGenerationParams 等价：媒体字段以 id 数组进入（AssetItem[] →
 * string[]），提示词走 buildSubmitPayload 的引用解析（服务端校验的是解析后的
 * prompt）。因此客户端校验结果与服务端一致，不会出现「前端通过、提交被拒」。
 */
export function buildValidationParams(
  model: ModelCatalogItem,
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const { params, assetRefs } = buildSubmitPayload(model, values)
  const validationParams: Record<string, unknown> = { ...params }
  for (const [name, ids] of Object.entries(assetRefs)) {
    validationParams[name] = ids
  }
  return validationParams
}
