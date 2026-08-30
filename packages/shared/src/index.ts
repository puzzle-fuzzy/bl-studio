/**
 * @bailian-studio/shared 的公共出口（barrel）。
 *
 * 向 services / apps / 其他 packages 暴露共享工具：日志（logger）、指标（metrics）、
 * 运行时校验（validation）和统一错误类型（errors）。创意资产协议由
 * @bailian-studio/creative-asset-contracts 独立拥有；需要创意资产协议的调用方应直接
 * 依赖该包，不再通过 shared 间接取得领域类型。
 */

export { createLogger, resolveLogFormat, safeJsonStringify, type LogFormat, type Logger } from './logger'
export { MetricsCollector, type MetricsSnapshot, type TimerSummary } from './metrics'
export { readGenerationLimits, type GenerationLimits } from './generation-limits'
export {
  CreateGenerationSchema,
  GenerationListViewSchema,
  ListGenerationsSchema,
  GetGenerationSchema,
  SetGenerationLibraryStateSchema,
  UserIdQuerySchema,
  ModelParameterSchema,
  ProviderResultSchema,
  ApiResponseSchema,
  validateInput,
  safeValidate,
  type CreateGenerationInput,
  type GenerationListView,
  type ListGenerationsInput,
  type GetGenerationInput,
  type SetGenerationLibraryStateInput,
  type UserIdQuery,
  type ModelParameter,
  type ProviderResult,
  type ApiResponse,
} from './validation'

export {
  ErrorCode,
  BailianStudioError,
  ValidationError,
} from './errors'

// ── Repository 层共享工具（P1-H 统一五套并行约定） ──
export { encodeCursor, decodeCursor, clampLimit, RepositoryError, DEFAULT_LIMIT_POLICY, WIDE_LIMIT_POLICY } from './repository-kit'
export type { CursorPayload, LimitPolicy } from './repository-kit'
