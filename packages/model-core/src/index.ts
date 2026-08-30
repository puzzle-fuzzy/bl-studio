/**
 * @bailian-studio/model-core 包的 barrel 导出入口。
 *
 * 集中对外暴露本包的全部公开 API：
 *  - 类型定义（types.ts）—— 以 ModelManifest 为核心的声明式抽象
 *  - 定价估算（pricing.ts，整数分 CNY）
 *  - 参数校验与默认值填充（validation.ts）
 *
 * 本包是 provider-neutral leaf：仅提供模型描述契约、参数/计价/响应校验与错误类型，
 * 不加载任何 concrete provider 的注册表。当前 DashScope 的 manifest 由
 * @bailian-studio/dashscope-manifests 组合。
 */

export {
  calculateUsageCostCents,
  calculateUsagePriceCents,
  estimateModelCost,
  estimatePriceCents,
  type ModelCostEstimate,
  type ModelUsageCostEstimate,
} from './pricing'
export { getModelAuditMetadata, type ModelAuditMetadata } from './metadata'
export { applyDefaults, validateModelParams } from './validation'
export { classifyTaskStatus, type TaskLifecycle } from './task-status'
export {
  assertResponseShape,
  type ResponsePhase,
  type ResponseShapeIssue,
} from './response-shape'
export { ModelCoreError } from './errors'
export { isModelParameterVisible } from './parameter-visibility'
export { modelValuesEqual } from './value-equality'
export { isNumberStepAligned } from './number-step'
export type {
  DeepReadonly,
  FrozenModelManifest,
  ModelCapability,
  ModelCategory,
  ModelManifest,
  ModelManifestExamples,
  ModelManifestSourceRefs,
  ModelParameter,
  ModelParameterType,
  ModelProvider,
  ModelTaskMode,
  LocalizedModelMessage,
  ParameterVisibilityRule,
  ParameterBinding,
  ParameterConditionalConstraint,
  ParameterWhen,
  ModelRuleCondition,
  ModelValidationRule,
  PricingRateData,
  PricingRule,
  PricingUnit,
  ProviderOutputMapping,
  ProviderRequestMapping,
  ReferenceFormat,
  ProviderTransport,
  ProviderSubmitTransport,
  ProviderPollingTransport,
  ProviderStreamingTransport,
  ProviderTransportHeader,
  ParameterIssueCode,
  ParameterValidationIssue,
  ParametersValidationInput,
  ValidationResult,
} from './types'
