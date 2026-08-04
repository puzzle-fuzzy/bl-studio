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

import type { FrozenModelManifest } from './types'
import { isNumberStepAligned } from './number-step'
import { modelValuesEqual } from './value-equality'

/** 默认定价阶梯的判定：condition 为空对象即视为默认阶梯。 */
function isDefaultPricingTier(condition: Record<string, unknown>): boolean {
  return Object.keys(condition).length === 0
}

/**
 * 校验单个 manifest 的内部一致性，违反任一规则即抛错：
 *  - 必须有 id 与 providerModel（调用 DashScope 的真实模型名）
 *  - 至少一个定价阶梯
 *  - 有且仅有一个"默认阶梯"（condition 为空），且必须位于 tiers[0]
 *    —— estimatePriceCents 的 `?? tiers[0]` 回退依赖此不变量
 *  - pricing.quantityKey 必须引用某个已声明的参数
 *  - 每个 tier.priceCents 必须是有限非负数。它是「每单位费率」，可以为小数
 *    （如 per_second 0.5 分/秒）；estimatePriceCents 在返回前会取整为整数分，
 *    所以这里不强求整数——cost_estimate/cost_final 列的整数性由取整保证。
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
  if (manifest.pricing.tiers.length === 0) throw new Error(`${manifest.id} must define at least one pricing tier`)
  const defaultTierIndexes = manifest.pricing.tiers
    .map((tier, index) => isDefaultPricingTier(tier.condition) ? index : -1)
    .filter(index => index >= 0)
  if (defaultTierIndexes.length !== 1) throw new Error(`${manifest.id} must define exactly one default pricing tier`)
  if (defaultTierIndexes[0] !== 0) throw new Error(`${manifest.id} default pricing tier must be first`)

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
  }
  assertMediaGroups(manifest, parameterNames)
  if (!parameterNames.has(manifest.pricing.quantityKey)) {
    throw new Error(`${manifest.id} pricing quantityKey "${manifest.pricing.quantityKey}" does not match a parameter`)
  }

  for (const tier of manifest.pricing.tiers) {
    if (!Number.isFinite(tier.priceCents) || tier.priceCents < 0) {
      throw new Error(`${manifest.id} pricing tier priceCents must be finite and non-negative`)
    }
    for (const conditionField of Object.keys(tier.condition)) {
      if (!parameterNames.has(conditionField)) {
        throw new Error(`${manifest.id} pricing tier condition field "${conditionField}" does not match a parameter`)
      }
    }
  }

  const actualUsage = manifest.pricing.actualUsage
  if (actualUsage !== undefined) {
    if (actualUsage.kind !== 'chat_tokens') {
      throw new Error(`${manifest.id} pricing actualUsage kind is unsupported`)
    }
    for (const [name, price] of Object.entries(actualUsage).filter(([key]) => key !== 'kind')) {
      if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
        throw new Error(`${manifest.id} pricing actualUsage ${name} must be finite and non-negative`)
      }
    }
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

function assertMediaGroups(
  manifest: FrozenModelManifest,
  parameterNames: ReadonlySet<string>,
): void {
  const parameters = new Map(manifest.parameters.map(parameter => [parameter.name, parameter] as const))
  for (const [groupIndex, group] of (manifest.mediaGroups ?? []).entries()) {
    if (group.parameters.length < 2 || new Set(group.parameters).size !== group.parameters.length) {
      throw new Error(`${manifest.id} media group ${groupIndex} must declare at least two unique parameters`)
    }
    for (const parameterName of group.parameters) {
      if (!parameterNames.has(parameterName) || parameters.get(parameterName)?.type !== 'media') {
        throw new Error(`${manifest.id} media group ${groupIndex} parameter "${parameterName}" does not match a media parameter`)
      }
    }
    if (
      group.when !== undefined &&
      !parameterNames.has(group.when.field)
    ) {
      throw new Error(`${manifest.id} media group ${groupIndex} condition field "${group.when.field}" does not match a parameter`)
    }
    if (group.minItems === undefined && group.maxItems === undefined) {
      throw new Error(`${manifest.id} media group ${groupIndex} must declare minItems or maxItems`)
    }
    for (const [field, value] of [
      ['minItems', group.minItems],
      ['maxItems', group.maxItems],
    ] as const) {
      if (value !== undefined && (!Number.isInteger(value) || value <= 0)) {
        throw new Error(`${manifest.id} media group ${groupIndex} ${field} must be a positive integer`)
      }
    }
    if (
      group.minItems !== undefined &&
      group.maxItems !== undefined &&
      group.minItems > group.maxItems
    ) {
      throw new Error(`${manifest.id} media group ${groupIndex} minItems must not exceed maxItems`)
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
