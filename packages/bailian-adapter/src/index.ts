/**
 * Bailian Studio 与 @puzzle-fuzzy/bailian-sdk 之间的唯一公开边界。
 *
 * 各子模块保持单一职责；下游只能从本入口消费，避免业务代码直接依赖 SDK。
 */

export {
  BailianStudioBailianAdapterError,
  type BailianStudioBailianAdapterErrorCode,
  type BailianStudioBailianAdapterErrorMessage,
} from './errors'
export {
  BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE,
  assertBailianCoverageBaseline,
  getBailianCoverageReport,
  getBailianIntegrationStatus,
  getBailianRequirementsHash,
  getBailianSdkMeta,
  isBailianSdkCovered,
  requireBailianSdkOperation,
  type BailianIntegrationStatus,
  type BailianLegacyIntegration,
  type BailianSdkIntegration,
} from './coverage'
export {
  getBailianContractSnapshot,
  type BailianContractSnapshot,
} from './status'
export {
  assertBailianContractValid,
  validateBailianHttpRequest,
  validateBailianPayload,
  validateBailianResponse,
} from './contracts'
export {
  classifyBailianTaskStatus,
  assertTrustedBailianEndpoint,
  isValidBailianWorkspaceId,
  resolveBailianCancelTarget,
  resolveBailianPollTarget,
  resolveBailianSubmitTarget,
  type BailianEndpointOptions,
  type BailianTaskLifecycle,
  type ResolvedBailianHttpTarget,
} from './transport'
export {
  calculateOfficialBailianUsageCost,
  estimateBailianModelCost,
  estimateOfficialBailianCost,
  listOfficialBailianPricing,
  type BailianModelCostEstimate,
  type OfficialBailianCostEstimate,
} from './pricing'
