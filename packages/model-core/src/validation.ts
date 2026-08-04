/**
 * manifest 参数的运行时校验。
 *
 * 校验规则完全由 manifest 的 parameters 声明驱动（required / type / min / max /
 * step / maxLength / options），不依赖任何硬编码——新增参数或新模型时，校验逻辑自动
 * 适配。本模块是纯函数，无副作用、无 DB / provider 依赖。
 */

import type {
  DeepReadonly,
  FrozenModelManifest,
  ModelParameter,
  ParameterValidationIssue,
  ValidationResult,
} from './types'
import { isNumberStepAligned } from './number-step'
import { isModelParameterVisible } from './parameter-visibility'
import { modelValuesEqual } from './value-equality'

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

function validateParameter(parameter: DeepReadonly<ModelParameter>, value: unknown): ParameterValidationIssue[] {
  const errors: ParameterValidationIssue[] = []

  if (parameter.required && isEmpty(value)) {
    errors.push(issue(
      'REQUIRED_PARAMETER',
      parameter.name,
      `${parameter.name} is required`,
      `${parameter.label}为必填参数`,
      'Provide a non-empty value',
      '请提供非空值',
    ))
    return errors
  }

  if (isEmpty(value)) return errors

  if (parameter.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
    errors.push(issue('INVALID_TYPE', parameter.name, `${parameter.name} must be a finite number`, `${parameter.label}必须是有限数字`, 'A finite number', '有限数字'))
  }

  if (parameter.type === 'boolean' && typeof value !== 'boolean') {
    errors.push(issue('INVALID_TYPE', parameter.name, `${parameter.name} must be a boolean`, `${parameter.label}必须是布尔值`, 'true or false', 'true 或 false'))
  }

  if (parameter.type === 'text' && typeof value !== 'string') {
    errors.push(issue('INVALID_TYPE', parameter.name, `${parameter.name} must be text`, `${parameter.label}必须是文本`, 'A string', '字符串'))
  }

  if (parameter.type === 'media') {
    const values = Array.isArray(value) ? value : [value]
    const maxItems = parameter.maxItems ?? 1
    if (values.length === 0 || values.some(item => typeof item !== 'string' || item.length === 0)) {
      errors.push(issue(
        'INVALID_TYPE',
        parameter.name,
        `${parameter.name} must contain non-empty media references`,
        `${parameter.label}必须包含非空媒体引用`,
        'A media reference or an ordered array of media references',
        '一个媒体引用或有序媒体引用数组',
      ))
    }
    if (parameter.minItems !== undefined && values.length < parameter.minItems) {
      errors.push(issue(
        'OUT_OF_RANGE',
        parameter.name,
        `${parameter.name} must contain at least ${parameter.minItems} item(s)`,
        `${parameter.label}至少需要 ${parameter.minItems} 个素材`,
        `At least ${parameter.minItems} item(s)`,
        `至少 ${parameter.minItems} 个素材`,
      ))
    }
    if (values.length > maxItems) {
      errors.push(issue(
        'OUT_OF_RANGE',
        parameter.name,
        `${parameter.name} must contain at most ${maxItems} item(s)`,
        `${parameter.label}最多允许 ${maxItems} 个素材`,
        `At most ${maxItems} item(s)`,
        `最多 ${maxItems} 个素材`,
      ))
    }
  }

  if (typeof value === 'number') {
    if (parameter.min !== undefined && (parameter.exclusiveMin ? value <= parameter.min : value < parameter.min)) {
      const comparison = parameter.exclusiveMin ? 'greater than' : 'greater than or equal to'
      const comparisonZh = parameter.exclusiveMin ? '大于' : '大于或等于'
      errors.push(issue('OUT_OF_RANGE', parameter.name, `${parameter.name} must be ${comparison} ${parameter.min}`, `${parameter.label}必须${comparisonZh} ${parameter.min}`, `A number ${comparison} ${parameter.min}`, `${comparisonZh} ${parameter.min} 的数字`))
    }
    if (parameter.max !== undefined && (parameter.exclusiveMax ? value >= parameter.max : value > parameter.max)) {
      const comparison = parameter.exclusiveMax ? 'less than' : 'less than or equal to'
      const comparisonZh = parameter.exclusiveMax ? '小于' : '小于或等于'
      errors.push(issue('OUT_OF_RANGE', parameter.name, `${parameter.name} must be ${comparison} ${parameter.max}`, `${parameter.label}必须${comparisonZh} ${parameter.max}`, `A number ${comparison} ${parameter.max}`, `${comparisonZh} ${parameter.max} 的数字`))
    }
    if (
      parameter.step !== undefined &&
      Number.isFinite(value) &&
      !isNumberStepAligned(value, parameter.step, parameter.min ?? 0)
    ) {
      const integerOnly = parameter.step === 1 && Number.isInteger(parameter.min ?? 0)
      errors.push(issue(
        'INVALID_VALUE',
        parameter.name,
        integerOnly
          ? `${parameter.name} must be an integer`
          : `${parameter.name} must align to step ${parameter.step}`,
        integerOnly
          ? `${parameter.label}必须是整数`
          : `${parameter.label}必须按 ${parameter.step} 的步长取值`,
        integerOnly ? 'An integer' : `A value aligned to step ${parameter.step}`,
        integerOnly ? '整数' : `符合 ${parameter.step} 步长的数字`,
      ))
    }
  }

  if (typeof value === 'string' && parameter.maxLength !== undefined && value.length > parameter.maxLength) {
    errors.push(issue('OUT_OF_RANGE', parameter.name, `${parameter.name} must be at most ${parameter.maxLength} characters`, `${parameter.label}最多允许 ${parameter.maxLength} 个字符`, `At most ${parameter.maxLength} characters`, `最多 ${parameter.maxLength} 个字符`))
  }

  if (parameter.type === 'select' && parameter.options && !parameter.options.some(option => modelValuesEqual(option.value, value))) {
    const values = parameter.options.map(option => String(option.value)).join(', ')
    errors.push(issue('INVALID_VALUE', parameter.name, `${parameter.name} must be one of the configured options`, `${parameter.label}必须使用已配置选项`, `One of: ${values}`, `可选值：${values}`))
  }

  return errors
}

function mediaItemCount(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0
  return Array.isArray(value) ? value.length : 1
}

function validateMediaGroups(
  manifest: FrozenModelManifest,
  params: Record<string, unknown>,
): ParameterValidationIssue[] {
  return (manifest.mediaGroups ?? []).flatMap(group => {
    const conditionMatches = group.when === undefined
      || (mediaItemCount(params[group.when.field]) > 0) === group.when.present
    if (!conditionMatches) {
      return []
    }
    const count = group.parameters.reduce(
      (total, parameterName) => total + mediaItemCount(params[parameterName]),
      0,
    )
    const field = group.parameters[0]
    if (field === undefined) return []
    const label = group.parameters.join(', ')

    if (group.minItems !== undefined && count < group.minItems) {
      return [issue(
        'OUT_OF_RANGE',
        field,
        `${label} must contain at least ${group.minItems} item(s) in total`,
        `${label} 合计至少需要 ${group.minItems} 个素材`,
        `At least ${group.minItems} item(s) across the group`,
        `该组合计至少 ${group.minItems} 个素材`,
      )]
    }
    if (group.maxItems !== undefined && count > group.maxItems) {
      return [issue(
        'OUT_OF_RANGE',
        field,
        `${label} must contain at most ${group.maxItems} item(s) in total`,
        `${label} 合计最多允许 ${group.maxItems} 个素材`,
        `At most ${group.maxItems} item(s) across the group`,
        `该组合计最多 ${group.maxItems} 个素材`,
      )]
    }
    return []
  })
}

/**
 * 把 manifest 中声明的 defaultValue 填充进 input（仅当 input 未提供该参数时）。
 * 返回新的 params 对象，不修改入参。
 */
export function applyDefaults(manifest: FrozenModelManifest, input: Record<string, unknown>): Record<string, unknown> {
  const next = { ...input }
  for (const parameter of manifest.parameters) {
    if (next[parameter.name] === undefined && parameter.defaultValue !== undefined) {
      next[parameter.name] = parameter.defaultValue
    }
  }
  for (const parameter of manifest.parameters) {
    if (!isModelParameterVisible(parameter, next)) {
      delete next[parameter.name]
    }
  }
  return next
}

/**
 * 按 manifest.parameters 校验用户入参，返回 errors 与合并默认值后的最终 params。
 *
 * 关键点：先调用 applyDefaults 再校验——这样 required 参数若声明了 defaultValue，
 * 即使用户未传也能通过校验。返回的 params 已是"用户输入 + 默认值"的合并结果，
 * 直接交给下游 provider 请求构建器即可。
 */
export function validateModelParams(manifest: FrozenModelManifest, input: Record<string, unknown>): ValidationResult {
  const params = applyDefaults(manifest, input)
  const knownParameters = new Set(manifest.parameters.map(parameter => parameter.name))
  const unknownErrors = Object.keys(input)
    .filter(name => !knownParameters.has(name))
    .map(field => issue(
      'UNKNOWN_PARAMETER',
      field,
      `${field} is not a supported parameter for ${manifest.id}`,
      `${field} 不是 ${manifest.id} 支持的参数`,
      `Use only: ${[...knownParameters].join(', ')}`,
      `仅可使用：${[...knownParameters].join('、')}`,
    ))
  const errors = [
    ...unknownErrors,
    ...manifest.parameters
      .filter(parameter => isModelParameterVisible(parameter, params))
      .flatMap(parameter => validateParameter(parameter, params[parameter.name])),
    ...validateMediaGroups(manifest, params),
  ]
  return {
    valid: errors.length === 0,
    errors,
    params,
  }
}

function issue(
  code: ParameterValidationIssue['code'],
  field: string,
  english: string,
  chinese: string,
  expectedEnglish?: string,
  expectedChinese?: string,
): ParameterValidationIssue {
  return {
    code,
    field,
    message: english,
    messages: { 'zh-CN': chinese, 'en-US': english },
    ...(expectedEnglish !== undefined && expectedChinese !== undefined
      ? { expected: { 'zh-CN': expectedChinese, 'en-US': expectedEnglish } }
      : {}),
  }
}
