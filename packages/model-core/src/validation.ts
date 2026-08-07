/**
 * manifest 参数的运行时校验。
 *
 * 校验规则完全由 manifest 的 parameters 声明驱动（required / type / min / max /
 * step / maxLength / options / conditional）与跨字段 rules[] 驱动，不依赖任何硬编码。
 * 本模块是纯函数，无副作用、无 DB / provider 依赖。
 */

import type {
  DeepReadonly,
  LocalizedModelMessage,
  ModelParameter,
  ModelRuleCondition,
  ModelValidationRule,
  ParameterValidationIssue,
  ParametersValidationInput,
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
    validateConditionalNumber(parameter, value, errors)
  }

  if (typeof value === 'string' && parameter.maxLength !== undefined && value.length > parameter.maxLength) {
    errors.push(issue('OUT_OF_RANGE', parameter.name, `${parameter.name} must be at most ${parameter.maxLength} characters`, `${parameter.label}最多允许 ${parameter.maxLength} 个字符`, `At most ${parameter.maxLength} characters`, `最多 ${parameter.maxLength} 个字符`))
  }

  if (parameter.type === 'select' && parameter.options && !parameter.options.some(option => modelValuesEqual(option.value, value))) {
    const values = parameter.options.map(option => String(option.value)).join(', ')
    errors.push(issue('INVALID_VALUE', parameter.name, `${parameter.name} must be one of the configured options`, `${parameter.label}必须使用已配置选项`, `One of: ${values}`, `可选值：${values}`))
  }

  if (parameter.conditional !== undefined && matchesWhen(parameter.conditional.when, value) && !isEmpty(value)) {
    if (parameter.conditional.equals !== undefined && !modelValuesEqual(parameter.conditional.equals, value)) {
      const expected = parameter.conditional.equals === false ? 'false' : String(parameter.conditional.equals)
      errors.push(issue(
        'INVALID_VALUE',
        parameter.name,
        `${parameter.name} must be ${expected} when the condition is met`,
        `${parameter.label}在条件满足时必须为 ${expected}`,
        expected,
        expected,
      ))
    }
  }

  return errors
}

/** 条件约束的数值段：when 命中时以 min/max 覆盖静态约束。 */
function validateConditionalNumber(
  parameter: DeepReadonly<ModelParameter>,
  value: number,
  errors: ParameterValidationIssue[],
): void {
  const conditional = parameter.conditional
  if (conditional === undefined || !matchesWhen(conditional.when, value)) return
  if (conditional.min !== undefined && value < conditional.min) {
    errors.push(issue(
      'OUT_OF_RANGE',
      parameter.name,
      `${parameter.name} must be at least ${conditional.min} when the condition is met`,
      `${parameter.label}在条件满足时必须大于或等于 ${conditional.min}`,
      `At least ${conditional.min}`,
      `至少 ${conditional.min}`,
    ))
  }
  if (conditional.max !== undefined && value > conditional.max) {
    errors.push(issue(
      'OUT_OF_RANGE',
      parameter.name,
      `${parameter.name} must be at most ${conditional.max} when the condition is met`,
      `${parameter.label}在条件满足时必须小于或等于 ${conditional.max}`,
      `At most ${conditional.max}`,
      `最多 ${conditional.max}`,
    ))
  }
}

/** 判断参数的条件约束 `when` 是否命中。value 是参数自身的当前值（媒体数组时取长度）。 */
function matchesWhen(
  when: { field: string; present?: boolean; equals?: unknown },
  value: unknown,
): boolean {
  if (when.present !== undefined) {
    return (mediaItemCount(value) > 0) === when.present
  }
  return modelValuesEqual(value, when.equals)
}

function mediaItemCount(value: unknown): number {
  if (value === undefined || value === null || value === '') return 0
  return Array.isArray(value) ? value.length : 1
}

/** 评估单个条件（跨字段规则的 condition / when）。 */
function evaluateCondition(
  condition: DeepReadonly<ModelRuleCondition>,
  params: Record<string, unknown>,
): boolean {
  if (condition.kind === 'field-equals') {
    const matched = modelValuesEqual(params[condition.field], condition.equals)
    return condition.negate === true ? !matched : matched
  }
  const count = mediaItemCount(params[condition.field])
  if (condition.minimum !== undefined && count < condition.minimum) return false
  if (condition.maximum !== undefined && count > condition.maximum) return false
  return true
}

/** 该规则是否在本次调用形态下生效（text-length 的 modes 过滤）。 */
function ruleAppliesInMode(rule: DeepReadonly<ModelValidationRule>, taskMode: ParametersValidationInput['taskMode']): boolean {
  if (rule.kind !== 'text-length' || rule.modes === undefined) return true
  return rule.modes.includes(taskMode)
}

function validateRules(
  manifest: ParametersValidationInput,
  params: Record<string, unknown>,
): ParameterValidationIssue[] {
  return (manifest.rules ?? []).flatMap(rule => {
    if (!ruleAppliesInMode(rule, manifest.taskMode)) return []
    switch (rule.kind) {
      case 'required-one-of': {
        const minimum = rule.minimum ?? 1
        const provided = rule.fields.filter(field => !isEmpty(params[field])).length
        if (provided >= minimum) return []
        const field = rule.fields[0]
        if (field === undefined) return []
        return [fromRuleIssue('REQUIRED_PARAMETER', field, rule)]
      }
      case 'text-length': {
        const value = params[rule.field]
        if (typeof value !== 'string') return []
        // 与 bailian-hub SDK 语义一致：文本含任一 CJK 字符时按 cjk 桶计（整串长度），
        // 否则按 other 桶计。cjk/other 是互斥的两档长度区间，不是同时满足的关系。
        const usesCjk = /[㐀-鿿豈-﫿]/u.test(value)
        const limit = usesCjk ? rule.cjk : rule.other
        const length = Array.from(value).length
        if (
          (limit.min !== undefined && length < limit.min)
          || (limit.max !== undefined && length > limit.max)
        ) {
          return [fromRuleIssue('OUT_OF_RANGE', rule.field, rule)]
        }
        return []
      }
      case 'field-required-when': {
        if (evaluateCondition(rule.condition, params) && isEmpty(params[rule.field])) {
          return [fromRuleIssue('REQUIRED_PARAMETER', rule.field, rule)]
        }
        return []
      }
      case 'field-allowed-when': {
        if (evaluateCondition(rule.condition, params) && !isEmpty(params[rule.field])) {
          return [fromRuleIssue('INVALID_VALUE', rule.field, rule)]
        }
        return []
      }
      case 'media-group': {
        if (rule.condition !== undefined && !evaluateCondition(rule.condition, params)) return []
        const count = rule.fields.reduce((total, field) => total + mediaItemCount(params[field]), 0)
        const field = rule.fields[0]
        if (field === undefined) return []
        const label = rule.fields.join(', ')
        if (rule.minItems !== undefined && count < rule.minItems) {
          if (rule.message !== undefined) return [fromRuleIssue('OUT_OF_RANGE', field, rule)]
          return [issue(
            'OUT_OF_RANGE',
            field,
            `${label} must contain at least ${rule.minItems} item(s) in total`,
            `${label} 合计至少需要 ${rule.minItems} 个素材`,
            `At least ${rule.minItems} item(s) across the group`,
            `该组合计至少 ${rule.minItems} 个素材`,
          )]
        }
        if (rule.maxItems !== undefined && count > rule.maxItems) {
          if (rule.message !== undefined) return [fromRuleIssue('OUT_OF_RANGE', field, rule)]
          return [issue(
            'OUT_OF_RANGE',
            field,
            `${label} must contain at most ${rule.maxItems} item(s) in total`,
            `${label} 合计最多允许 ${rule.maxItems} 个素材`,
            `At most ${rule.maxItems} item(s) across the group`,
            `该组合计最多 ${rule.maxItems} 个素材`,
          )]
        }
        return []
      }
      case 'array-item-field-max-path': {
        const items = params[rule.field]
        if (!Array.isArray(items)) return []
        const maximum = typeof params[rule.maximumField] === 'number'
          ? params[rule.maximumField] as number
          : rule.defaultMaximum
        for (const item of items) {
          if (typeof item !== 'object' || item === null) continue
          const itemValue = (item as Record<string, unknown>)[rule.itemProperty]
          if (typeof itemValue === 'number' && itemValue > maximum) {
            return [fromRuleIssue('OUT_OF_RANGE', rule.field, rule)]
          }
        }
        return []
      }
    }
  })
}

/** 统计字符串中 CJK 字符与非 CJK 字符的数量。 */
function countCharacters(value: string): { cjkCount: number; otherCount: number } {
  let cjkCount = 0
  let otherCount = 0
  for (const char of value) {
    if (/[㐀-鿿豈-﫿぀-ヿ가-힯]/.test(char)) cjkCount += 1
    else otherCount += 1
  }
  return { cjkCount, otherCount }
}

/** 用规则自带的官方文案生成 issue；无 message 时由调用方兜底生成。 */
function fromRuleIssue(
  code: ParameterValidationIssue['code'],
  field: string,
  rule: DeepReadonly<ModelValidationRule>,
): ParameterValidationIssue {
  // media-group 的 message 可选，但所有调用点都已确认存在（含显式 `!== undefined` 守卫）。
  const message = rule.message as LocalizedModelMessage
  return issue(code, field, message['en-US'], message['zh-CN'])
}

/**
 * 把 manifest 中声明的 defaultValue 填充进 input（仅当 input 未提供该参数时）。
 * 返回新的 params 对象，不修改入参。
 */
export function applyDefaults(manifest: ParametersValidationInput, input: Record<string, unknown>): Record<string, unknown> {
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
 *
 * manifest 参数接受完整 FrozenModelManifest，也接受只含 id/parameters/rules?/
 * taskMode 的 ParametersValidationInput 投影（前端表单持有的 catalog 项即满足）。
 */
export function validateModelParams(
  manifest: ParametersValidationInput,
  input: Record<string, unknown>,
): ValidationResult {
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
    ...validateRules(manifest, params),
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
