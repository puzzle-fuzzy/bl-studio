/**
 * @bailian-studio/dashscope-manifests 公共入口。
 *
 * 这里集中暴露当前 DashScope/Bailian 的 concrete model catalog；通用参数、
 * 计价与校验函数仍由 @bailian-studio/model-core 提供。这样第二个 provider
 * 可以拥有自己的 manifest 包，而不必把模型注册表塞回中立核心。
 */
export { getModelById, listModels, MODEL_REGISTRY } from './registry'
export { getModelCatalogItemById, listModelCatalogItems, type ModelCatalogItem } from './catalog'
export {
  assertBailianOperationMapComplete,
  getBailianOperationCapability,
  listBailianCoverageRequirements,
  type BailianCoverageRequirementReference,
  type BailianExecutionMode,
  type BailianOperationCapability,
} from './bailian-operations'
export { assertModelManifestConsistent, assertUniqueModelIds } from './registry-check'
export { classifyTaskStatus, type TaskLifecycle } from './task-status'
export {
  assertResponseShape,
  type ResponsePhase,
  type ResponseShapeIssue,
} from './response-shape'
export type {
  DashScopeModelManifest,
  FrozenDashScopeModelManifest,
  FrozenModelManifest,
  ModelManifest,
} from './types'
export type {
  ParameterBinding,
  ProviderOutputMapping,
  ProviderPollingTransport,
  ProviderRequestMapping,
  ProviderStreamingTransport,
  ProviderSubmitTransport,
  ProviderTransport,
  ProviderTransportHeader,
  ReferenceFormat,
} from './contracts'

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
