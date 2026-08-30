import type { ModelParameter } from '@bailian-studio/api-client'

/**
 * Manifest → 表单投影层（纯函数，可单测）。
 *
 * 把模型目录的 `ModelParameter[]` 投影为表单需要的控件元数据：
 * - control：text 长文本 → textarea；其余按 type 直映射
 * - group：主输入（prompt/媒体引用）→ input 区；输出参数 → settings 区
 * - wide：text/media 占满两列
 *
 * 继承 React 版的设计：select 控件用「索引 token」无损承载非 string 枚举值
 * （数组/空字符串），见 ParameterForm 的实现。
 */

export type ParameterControl = 'text' | 'textarea' | 'number' | 'select' | 'boolean' | 'media'
export type ParameterGroup = 'input' | 'settings'

export interface FormField {
  parameter: ModelParameter
  control: ParameterControl
  group: ParameterGroup
  wide: boolean
}

/** 长文本参数（即使 maxLength 不大也渲染为 textarea）。 */
const TEXTAREA_NAMES = new Set(['prompt', 'negativePrompt', 'lyrics'])

/** 视为「主输入」的参数名，渲染在输入区（settings 区之外的参数归入输出区）。 */
const PRIMARY_INPUT_NAMES = new Set([
  'prompt',
  'lyrics',
  'image',
  'video',
  'audio',
  'imageUrl',
  'videoUrl',
  'audioUrl',
  'fileUrls',
  'firstFrame',
  'lastFrame',
  'featureVideo',
  'drivingAudio',
  'referenceImages',
  'referenceVideos',
  'references',
])

export function buildParameterFormSchema(parameters: readonly ModelParameter[]): FormField[] {
  return parameters.map(parameter => {
    const isLongText =
      parameter.type === 'text' &&
      (TEXTAREA_NAMES.has(parameter.name) || (parameter.maxLength ?? 0) > 200)
    const control: ParameterControl = isLongText ? 'textarea' : parameter.type
    const group: ParameterGroup =
      parameter.type === 'media' || PRIMARY_INPUT_NAMES.has(parameter.name)
        ? 'input'
        : 'settings'
    const wide = parameter.type === 'text' || parameter.type === 'media'
    return { parameter, control, group, wide }
  })
}

/** 深比较两个任意值（支持数组/对象等非标量枚举值）。 */
export function valuesEqual(left: unknown, right: unknown): boolean {
  if (typeof left === 'object' || typeof right === 'object') {
    if (left === null || right === null) return Object.is(left, right)
    return JSON.stringify(left) === JSON.stringify(right)
  }
  return Object.is(left, right)
}

/** 依据 visibleWhen 判断参数是否可见。 */
export function isParameterVisible(
  parameter: ModelParameter,
  values: Readonly<Record<string, unknown>>,
): boolean {
  const rule = parameter.visibleWhen
  if (rule === undefined) return true
  return valuesEqual(values[rule.field], rule.equals)
}

/** 可见参数（用于渲染过滤）。 */
export function visibleFormFields(
  schema: readonly FormField[],
  values: Readonly<Record<string, unknown>>,
): FormField[] {
  return schema.filter(field => isParameterVisible(field.parameter, values))
}

/**
 * 提交前剥离隐藏字段的值，同时保留 UI 元数据（以 `_` 前缀开头的键，如 `_refs`）。
 * 保证发送给服务端的 params 与 manifest 可见性一致。
 */
export function removeHiddenParameterValues(
  parameters: readonly ModelParameter[],
  values: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const visible = new Set(
    parameters.filter(parameter => isParameterVisible(parameter, values)).map(parameter => parameter.name),
  )
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (visible.has(key) || key.startsWith('_')) result[key] = value
  }
  return result
}
