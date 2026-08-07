/**
 * manifest 的内部一致性校验。
 *
 * 这些断言在 registry.ts 模块加载时对每个 manifest 执行一次，把"配置错误"从
 * 运行时故障提前成启动失败——任何 manifest 若违反下列契约，整个注册表都无法
 * 构建，从而避免坏 manifest 流到下游 provider 调用时才暴露。
 *
 * 校验项见 assertModelManifestConsistent / assertUniqueModelIds 的注释。
 * 注意：错误消息字符串是契约的一部分（部分测试断言其文本），不要修改。
 */

import type {
  DeepReadonly,
  FrozenModelManifest,
  ModelRuleCondition,
  ModelValidationRule,
} from './types'
import { isNumberStepAligned } from './number-step'
import { modelValuesEqual } from './value-equality'

/**
 * 校验单个 manifest 的内部一致性，违反任一规则即抛错：
 *  - 必须有 id 与 providerModel（调用 DashScope 的真实模型名）
 *  - transport 与 taskMode 一致，async 必有 polling、stream 必有 stream 段
 *  - 至少一条定价 rate；同一 (chargeItem, region) 至多一条默认价
 *  - pricing.quantityKey 必须引用某个已声明的参数
 *  - 每条 rate 的 unitPrice 必须是有限非负小数（十进制元）、unitSize 正整数、
 *    conditions 字段必须引用已声明参数
 *  - 每条 rule 引用的字段必须是已声明参数；media-group 的字段必须是 media 参数
 *  - 每个 required 参数必须有对应的 request binding（否则用户必填的字段不会
 *    进入 provider 请求）
 *  - 每个 binding 必须引用某个已声明的参数（悬空 binding 是死配置）
 */
export function assertModelManifestConsistent(manifest: FrozenModelManifest): void {
  if (!manifest.id) throw new Error('Model manifest is missing id')
  if (!manifest.providerModel) throw new Error(`${manifest.id} is missing providerModel`)
  if (!manifest.displayName.trim()) throw new Error(`${manifest.id} is missing displayName`)
  if (manifest.capabilities.length === 0) throw new Error(`${manifest.id} must define at least one capability`)
  if (new Set(manifest.capabilities).size !== manifest.capabilities.length) {
    throw new Error(`${manifest.id} must not define duplicate capabilities`)
  }

  assertAvailability(manifest)
  assertTransport(manifest)
  assertPricing(manifest)

  const parameterNames = new Set<string>()
  for (const parameter of manifest.parameters) {
    if (!parameter.name.trim()) throw new Error(`${manifest.id} has a parameter without a name`)
    if (!parameter.label.trim()) throw new Error(`${manifest.id} parameter "${parameter.name}" is missing label`)
    if (parameterNames.has(parameter.name)) {
      throw new Error(`${manifest.id} must not define duplicate parameter "${parameter.name}"`)
    }
    parameterNames.add(parameter.name)
    assertParameterMetadata(manifest.id, parameter)
    if (parameter.exclusiveMin && parameter.min === undefined) {
      throw new Error(`${manifest.id} parameter "${parameter.name}" exclusiveMin requires min`)
    }
    if (parameter.exclusiveMax && parameter.max === undefined) {
      throw new Error(`${manifest.id} parameter "${parameter.name}" exclusiveMax requires max`)
    }
    if (parameter.conditional !== undefined) {
      assertConditionalConstraint(manifest.id, parameter)
    }
  }
  for (const parameter of manifest.parameters) {
    if (parameter.conditional?.when.field !== undefined && !parameterNames.has(parameter.conditional.when.field)) {
      throw new Error(`${manifest.id} parameter "${parameter.name}" conditional when.field "${parameter.conditional.when.field}" does not match a parameter`)
    }
  }
  assertRules(manifest, parameterNames)
  if (!parameterNames.has(manifest.pricing.quantityKey)) {
    throw new Error(`${manifest.id} pricing quantityKey "${manifest.pricing.quantityKey}" does not match a parameter`)
  }

  const bindingNames = new Set(Object.keys(manifest.request.bindings))

  for (const parameter of manifest.parameters) {
    if (parameter.required && !bindingNames.has(parameter.name)) {
      throw new Error(`${manifest.id} required parameter "${parameter.name}" has no request binding`)
    }
    if (parameter.visibleWhen !== undefined && !parameterNames.has(parameter.visibleWhen.field)) {
      throw new Error(`${manifest.id} parameter "${parameter.name}" visibility field "${parameter.visibleWhen.field}" does not match a parameter`)
    }
    if (parameter.visibleWhen?.field === parameter.name) {
      throw new Error(`${manifest.id} parameter "${parameter.name}" cannot depend on itself`)
    }
  }

  assertNoVisibilityCycles(manifest)

  for (const bindingName of bindingNames) {
    if (!parameterNames.has(bindingName)) {
      throw new Error(`${manifest.id} binding "${bindingName}" does not match a parameter`)
    }
  }
}

function assertAvailability(manifest: FrozenModelManifest): void {
  const availability = manifest.availability
  if (availability.notActivated !== undefined) {
    if (availability.enabled) {
      throw new Error(`${manifest.id} notActivated models must be disabled (availability.enabled=false)`)
    }
    if (!availability.notActivated.trim()) {
      throw new Error(`${manifest.id} availability.notActivated must not be empty`)
    }
  }
}

function assertTransport(manifest: FrozenModelManifest): void {
  const transport = manifest.transport
  if (transport.mode !== manifest.taskMode) {
    throw new Error(`${manifest.id} transport mode "${transport.mode}" must match taskMode "${manifest.taskMode}"`)
  }
  if (!transport.submit.endpointTemplate.trim()) {
    throw new Error(`${manifest.id} transport submit endpointTemplate is missing`)
  }
  if (!transport.submit.endpointTemplate.includes('{WorkspaceId}')) {
    throw new Error(`${manifest.id} transport submit endpointTemplate must contain {WorkspaceId}`)
  }
  if (transport.submit.modelFieldPath !== '/model') {
    throw new Error(`${manifest.id} transport submit modelFieldPath must be /model`)
  }
  if (transport.mode === 'provider_async') {
    const polling = transport.polling
    if (!polling.taskIdPath || !polling.statusPath) {
      throw new Error(`${manifest.id} async transport polling must declare taskIdPath and statusPath`)
    }
    if (polling.succeededValues.length === 0 || polling.failedValues.length === 0) {
      throw new Error(`${manifest.id} async transport polling must declare succeededValues and failedValues`)
    }
    if (polling.succeededValues.some(value => polling.failedValues.includes(value))) {
      throw new Error(`${manifest.id} async transport polling succeededValues and failedValues must not overlap`)
    }
  }
  if (transport.mode === 'stream' && transport.stream === undefined) {
    throw new Error(`${manifest.id} stream transport must declare the stream section`)
  }
}

function assertPricing(manifest: FrozenModelManifest): void {
  const rates = manifest.pricing.rates
  if (rates.length === 0) throw new Error(`${manifest.id} must define at least one pricing rate`)
  for (const rate of rates) {
    const price = Number(rate.unitPrice)
    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`${manifest.id} pricing rate "${rate.id}" unitPrice must be a finite non-negative decimal yuan`)
    }
    if (!Number.isInteger(rate.unitSize) || rate.unitSize <= 0) {
      throw new Error(`${manifest.id} pricing rate "${rate.id}" unitSize must be a positive integer`)
    }
    if (!rate.region.trim()) {
      throw new Error(`${manifest.id} pricing rate "${rate.id}" region is missing`)
    }
    for (const conditionField of Object.keys(rate.conditions)) {
      const parameterNames = new Set(manifest.parameters.map(parameter => parameter.name))
      if (!parameterNames.has(conditionField)) {
        throw new Error(`${manifest.id} pricing rate "${rate.id}" condition field "${conditionField}" does not match a parameter`)
      }
    }
  }
  // 同一 (chargeItem, region) 至多一条默认价——selectRate 的默认回退依赖唯一性。
  const defaultKeys = new Set<string>()
  for (const rate of rates) {
    if (Object.keys(rate.conditions).length !== 0) continue
    const key = `${rate.chargeItem}:${rate.region}`
    if (defaultKeys.has(key)) {
      throw new Error(`${manifest.id} pricing rate "${rate.id}" duplicates the default rate for ${key}`)
    }
    defaultKeys.add(key)
  }
}

function assertConditionalConstraint(
  modelId: string,
  parameter: FrozenModelManifest['parameters'][number],
): void {
  const conditional = parameter.conditional
  if (conditional === undefined) return
  const when = conditional.when
  if (!when.field.trim()) throw new Error(`${modelId} parameter "${parameter.name}" conditional when.field is missing`)
  if (when.field === parameter.name) throw new Error(`${modelId} parameter "${parameter.name}" conditional cannot depend on itself`)
  if (conditional.min !== undefined && conditional.max !== undefined && conditional.min > conditional.max) {
    throw new Error(`${modelId} parameter "${parameter.name}" conditional min must not exceed max`)
  }
  if (conditional.equals !== undefined && (conditional.min !== undefined || conditional.max !== undefined)) {
    throw new Error(`${modelId} parameter "${parameter.name}" conditional must not combine equals with min/max`)
  }
  if (conditional.min === undefined && conditional.max === undefined && conditional.equals === undefined) {
    throw new Error(`${modelId} parameter "${parameter.name}" conditional must declare min, max, or equals`)
  }
}

/** 每个 rule 引用的字段必须存在；media-group 的字段必须是 media 参数。 */
function assertRules(
  manifest: FrozenModelManifest,
  parameterNames: ReadonlySet<string>,
): void {
  const parameters = new Map(manifest.parameters.map(parameter => [parameter.name, parameter] as const))
  const assertField = (rule: DeepReadonly<ModelValidationRule>, field: string): void => {
    if (!parameterNames.has(field)) {
      throw new Error(`${manifest.id} rule ${rule.kind} field "${field}" does not match a parameter`)
    }
  }
  const assertCondition = (rule: DeepReadonly<ModelValidationRule>, condition: DeepReadonly<ModelRuleCondition>): void => {
    if (!parameterNames.has(condition.field)) {
      throw new Error(`${manifest.id} rule ${rule.kind} condition field "${condition.field}" does not match a parameter`)
    }
  }

  for (const rule of manifest.rules ?? []) {
    switch (rule.kind) {
      case 'required-one-of': {
        if (rule.fields.length === 0) {
          throw new Error(`${manifest.id} rule required-one-of must declare fields`)
        }
        for (const field of rule.fields) assertField(rule, field)
        if (rule.minimum !== undefined && (!Number.isInteger(rule.minimum) || rule.minimum < 1)) {
          throw new Error(`${manifest.id} rule required-one-of minimum must be a positive integer`)
        }
        break
      }
      case 'text-length': {
        assertField(rule, rule.field)
        if (rule.cjk.max <= 0 || rule.other.max <= 0) {
          throw new Error(`${manifest.id} rule text-length must declare positive cjk/other max`)
        }
        break
      }
      case 'field-required-when':
      case 'field-allowed-when': {
        assertField(rule, rule.field)
        assertCondition(rule, rule.condition)
        break
      }
      case 'media-group': {
        if (rule.fields.length === 0) {
          throw new Error(`${manifest.id} rule media-group must declare fields`)
        }
        if (new Set(rule.fields).size !== rule.fields.length) {
          throw new Error(`${manifest.id} rule media-group must not declare duplicate fields`)
        }
        for (const field of rule.fields) {
          if (!parameterNames.has(field) || parameters.get(field)?.type !== 'media') {
            throw new Error(`${manifest.id} rule media-group field "${field}" does not match a media parameter`)
          }
        }
        if (rule.condition !== undefined) assertCondition(rule, rule.condition)
        if (rule.minItems === undefined && rule.maxItems === undefined) {
          throw new Error(`${manifest.id} rule media-group must declare minItems or maxItems`)
        }
        for (const [field, value] of [
          ['minItems', rule.minItems],
          ['maxItems', rule.maxItems],
        ] as const) {
          if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
            throw new Error(`${manifest.id} rule media-group ${field} must be a positive integer`)
          }
        }
        if (
          rule.minItems !== undefined &&
          rule.maxItems !== undefined &&
          rule.minItems > rule.maxItems
        ) {
          throw new Error(`${manifest.id} rule media-group minItems must not exceed maxItems`)
        }
        break
      }
      case 'array-item-field-max-path': {
        assertField(rule, rule.field)
        assertField(rule, rule.maximumField)
        if (!Number.isFinite(rule.defaultMaximum)) {
          throw new Error(`${manifest.id} rule array-item-field-max-path defaultMaximum must be finite`)
        }
        break
      }
    }
  }
}

function assertParameterMetadata(
  modelId: string,
  parameter: FrozenModelManifest['parameters'][number],
): void {
  const hasNumericConstraint = parameter.min !== undefined
    || parameter.max !== undefined
    || parameter.step !== undefined
  if (hasNumericConstraint && parameter.type !== 'number') {
    throw new Error(`${modelId} parameter "${parameter.name}" numeric metadata requires number type`)
  }
  if (parameter.min !== undefined && !Number.isFinite(parameter.min)) {
    throw new Error(`${modelId} parameter "${parameter.name}" min must be finite`)
  }
  if (parameter.max !== undefined && !Number.isFinite(parameter.max)) {
    throw new Error(`${modelId} parameter "${parameter.name}" max must be finite`)
  }
  if (parameter.min !== undefined && parameter.max !== undefined && parameter.min > parameter.max) {
    throw new Error(`${modelId} parameter "${parameter.name}" min must not exceed max`)
  }
  if (parameter.step !== undefined && (!Number.isFinite(parameter.step) || parameter.step <= 0)) {
    throw new Error(`${modelId} parameter "${parameter.name}" step must be finite and positive`)
  }
  if (
    parameter.step !== undefined &&
    typeof parameter.defaultValue === 'number' &&
    !isNumberStepAligned(parameter.defaultValue, parameter.step, parameter.min ?? 0)
  ) {
    throw new Error(`${modelId} parameter "${parameter.name}" defaultValue must align to step`)
  }

  if (parameter.maxLength !== undefined) {
    if (parameter.type !== 'text') {
      throw new Error(`${modelId} parameter "${parameter.name}" maxLength metadata requires text type`)
    }
    if (!Number.isInteger(parameter.maxLength) || parameter.maxLength <= 0) {
      throw new Error(`${modelId} parameter "${parameter.name}" maxLength must be a positive integer`)
    }
  }

  const hasCardinality = parameter.minItems !== undefined || parameter.maxItems !== undefined
  if (hasCardinality && parameter.type !== 'media') {
    throw new Error(`${modelId} parameter "${parameter.name}" cardinality metadata requires media type`)
  }
  for (const [field, value] of [
    ['minItems', parameter.minItems],
    ['maxItems', parameter.maxItems],
  ] as const) {
    if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
      throw new Error(`${modelId} parameter "${parameter.name}" ${field} must be a positive integer`)
    }
  }
  if (
    parameter.minItems !== undefined &&
    parameter.maxItems !== undefined &&
    parameter.minItems > parameter.maxItems
  ) {
    throw new Error(`${modelId} parameter "${parameter.name}" minItems must not exceed maxItems`)
  }

  if (parameter.type === 'media' && parameter.mediaKind === undefined) {
    throw new Error(`${modelId} media parameter "${parameter.name}" must declare mediaKind`)
  }
  if (parameter.type !== 'media' && parameter.mediaKind !== undefined) {
    throw new Error(`${modelId} non-media parameter "${parameter.name}" must not declare mediaKind`)
  }

  if (parameter.type === 'select') {
    if (parameter.options === undefined || parameter.options.length === 0) {
      throw new Error(`${modelId} select parameter "${parameter.name}" must define options`)
    }
    for (const [index, option] of parameter.options.entries()) {
      if (!option.label.trim()) {
        throw new Error(`${modelId} select parameter "${parameter.name}" option ${index} is missing label`)
      }
      const duplicateIndex = parameter.options.findIndex((candidate, candidateIndex) =>
        candidateIndex < index && modelValuesEqual(candidate.value, option.value))
      if (duplicateIndex >= 0) {
        throw new Error(`${modelId} select parameter "${parameter.name}" has duplicate option value at ${index}`)
      }
    }
    if (parameter.defaultValue !== undefined && !parameter.options.some(option => modelValuesEqual(option.value, parameter.defaultValue))) {
      throw new Error(`${modelId} select parameter "${parameter.name}" defaultValue must match an option`)
    }
  } else if (parameter.options !== undefined) {
    throw new Error(`${modelId} non-select parameter "${parameter.name}" must not define options`)
  }
}

function assertNoVisibilityCycles(manifest: FrozenModelManifest): void {
  const dependencies = new Map(manifest.parameters.map(parameter => [
    parameter.name,
    parameter.visibleWhen?.field,
  ]))
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const visit = (name: string): void => {
    if (visiting.has(name)) {
      throw new Error(`${manifest.id} has cyclic parameter visibility dependencies`)
    }
    if (visited.has(name)) return

    visiting.add(name)
    const dependency = dependencies.get(name)
    if (dependency !== undefined) visit(dependency)
    visiting.delete(name)
    visited.add(name)
  }

  for (const parameter of manifest.parameters) visit(parameter.name)
}

/** 校验注册表内 id 全局唯一——id 是对外稳定标识（URL/API/share 链接），重复会破坏路由。 */
export function assertUniqueModelIds(manifests: readonly FrozenModelManifest[]): void {
  const seen = new Set<string>()
  for (const manifest of manifests) {
    if (seen.has(manifest.id)) throw new Error(`Duplicate model id: ${manifest.id}`)
    seen.add(manifest.id)
  }
}
