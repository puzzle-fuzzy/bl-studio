/**
 * api-client 包的对外出口集合（barrel）。
 *
 * 本包是 apps/web 使用的【类型化 API 契约层】：它把后端
 * `/api/*` 的 HTTP 路由封装成带类型的方法，并用 zod schema 在传输层两端
 * （请求返回时 / SSE 信令上线时）做严格校验，让前端代码永远不需要写 `as`
 * 强转。任何对 API wire 形状的改动都应在这里或 schemas.ts 体现，从而成为
 * 前端可见的契约变更。
 */

export {
  CALLBACK_PARAM,
  buildLoginUrl,
  isAllowedCallback,
  resolvePostLoginRedirect,
  type AuthCallbackConfig,
} from './auth-callback'

export {
  createApiClient,
  type CreateApiClientOptions,
  type CreateGenerationRequest,
  type CreateMediaJobRequest,
  type GenerationLibraryState,
  type GenerationListView,
  type ListGenerationsParams,
  type AssetSort,
  type ListAssetsParams,
  type BailianStudioApiClient,
  type UploadAssetInput,
} from './generation-client'
export { ApiClientError } from './http'
export type {
  AssetItem,
  AssetCapabilities,
  CreditBalance,
  BailianContractStatus,
  GenerationArtifact,
  CreateGenerationResponse,
  CreateMediaJobResult,
  GenerationDiagnostics,
  GenerationEstimate,
  GenerationErrorJson,
  GenerationRecord,
  ProviderRequestAudit,
  GenerationShareResult,
  ListAssetsResult,
  ListGenerationArtifactsResult,
  ListGenerationsResult,
  MediaJob,
  ModelCatalogItem,
  ModelOperation,
  ModelParameter,
  NormalizedArtifact,
  OutputResult,
  PublicSharedGeneration,
  PublicUser,
  RegistrationResult,
  EmailActionAccepted,
  TaskDiagnostics,
  UsageSummary,
} from './schemas'
