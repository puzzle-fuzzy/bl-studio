/**
 * @bailian-studio/provider-dashscope 包的统一出口。
 *
 * 本包是阿里云 DashScope（百炼）provider 的运行时构建块，由 @bailian-studio/worker
 * 消费：client.ts 负责提交与轮询的 HTTP 调用，request-builder.ts 按 manifest
 * 把参数绑定到 DashScope 请求体，response-parser.ts 把响应归一化为 artifact，
 * errors.ts 把 provider 错误映射为内部统一的错误类型。这里把这些能力统一对外导出。
 */
export { DashScopeHttpError, createDashScopeClient } from './client'
export type {
  CreateDashScopeClientOptions,
  DashScopeClient,
  DashScopeFetch,
  ProviderCancelInput,
  ProviderCancelResult,
  ProviderChatInput,
  ProviderChatResult,
  ProviderPollInput,
  ProviderPollResult,
  ProviderSubmitInput,
  ProviderSubmitResult,
} from './client'
export type { BailianContractLocale } from './contract'
export {
  isValidDashScopeWorkspaceId,
  resolveDashScopeCancelTarget,
  resolveDashScopePollTarget,
  resolveDashScopeSubmitTarget,
} from './transport'
export type { DashScopeHttpTarget, DashScopeTransportOptions } from './transport'
export { classifyDashScopeError } from './errors'
export type { ProviderErrorCategory, ProviderErrorInfo } from './errors'
export { buildDashScopeRequest } from './request-builder'
export type { DashScopeRequest } from './request-builder'
export { buildChatRequest } from './chat-builder'
export type { ChatRequest } from './chat-builder'
export {
  buildOfflineFixtureParams,
  runOfflineModelAcceptance,
} from './acceptance'
export type {
  ModelAcceptanceFailure,
  ModelAcceptanceReport,
  ModelAcceptanceResult,
  ModelAcceptanceStatus,
} from './acceptance'
export { parseDashScopeOutput } from './response-parser'
export type { NormalizedArtifact, NormalizedOutput } from './response-parser'
export type { ChatUsage, SseResult } from './sse-reader'
