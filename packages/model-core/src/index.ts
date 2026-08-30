/**
 * @bailian-studio/model-core 包的 barrel 导出入口。
 *
 * 集中对外暴露本包的全部公开 API：
 *  - 类型定义（types.ts）—— 以 ModelManifest 为核心的声明式抽象
 *  - 模型注册表（registry.ts）—— 模块加载时深冻结的 MODEL_REGISTRY 及取用函数
 *  - manifest 一致性校验（registry-check.ts）
 *  - 定价估算（pricing.ts，整数分 CNY）
 *  - 参数校验与默认值填充（validation.ts）
 *  - 各 provider 模型的具体 manifest（manifests/*）
 *
 * 本包是近 leaf 包：仅依赖 @bailian-studio/shared。manifest 不得依赖 DB / provider /
 * service —— 这正是"添加新模型 = 新增一个 manifest 条目，provider 与 service
 * 代码无需改动"这一设计目标的前提。
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
export { getModelById, listModels, MODEL_REGISTRY } from './registry'
export {
  getModelCatalogItemById,
  listModelCatalogItems,
  type ModelCatalogItem,
} from './catalog'
export { assertModelManifestConsistent, assertUniqueModelIds } from './registry-check'
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
export {
  assertBailianOperationMapComplete,
  getBailianOperationCapability,
  listBailianCoverageRequirements,
  type BailianCoverageRequirementReference,
  type BailianExecutionMode,
  type BailianOperationCapability,
} from './bailian-operations'
export { qwenImage } from './manifests/image/qwen-image'
export { qwenImage2Pro, qwenImageMax, qwenImage2 } from './manifests/image/qwen-image-2'
export { wanx27ImagePro, wanx27Image } from './manifests/image/wanx-image'
export { zImage } from './manifests/image/z-image'
export { qwenImageEditMax, qwenImageEditPlus, qwenImageEdit } from './manifests/image/qwen-image-edit'
export { wanxTextToVideo } from './manifests/video/wanx-video'
export { viduT2VPro, viduT2VTurbo, viduT2V, viduI2V, viduFirstLastFrame, viduR2V } from './manifests/video/vidu-video'
export { viduR2VQ3, viduR2VQ3Turbo, viduR2VQ3Ad, viduR2VQ3Drama, viduR2VQ2, viduR2VQ2Pro } from './manifests/video/vidu-reference-video'
export { wanx27T2V, wanx27I2V, wanx27R2V, wanx27VideoEdit } from './manifests/video/wanx-27-video'
export { wan3T2V, wan3I2V, wan3R2V } from './manifests/video/wan3-video'
export { kelingT2V, kelingI2V, kelingFirstLastFrame, kelingReferenceVideo, kelingVideoEdit } from './manifests/video/keling-video'
export { aishiT2V, aishiI2V, aishiFirstLastFrame } from './manifests/video/aishi-video'
export { happyhorseT2V, happyhorseI2V, happyhorseR2V, happyhorseVideoEdit } from './manifests/video/happyhorse-video'
export { qwenPlus, qwenMax, qwenTurbo, qwenFlash, qwenLong } from './manifests/text/qwen-text'
export { deepseekV4Pro, deepseekV4Flash } from './manifests/text/deepseek-v4'
export { funMusicV1 } from './manifests/audio/fun-music'
export { funAsrV1 } from './manifests/audio/fun-asr'
export { paraformerV1 } from './manifests/audio/paraformer'
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
