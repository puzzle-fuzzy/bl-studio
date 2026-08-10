/**
 * @bailian-studio/shared 的公共出口（barrel）。
 *
 * 作为 monorepo 依赖图的最底层叶子包，向 services / apps / 其他 packages 暴露
 * 共享工具：日志（logger）、指标（metrics）、运行时校验（validation）和统一错误类型
 * （errors）。按 package 边界规则，本包不得 import 任何其它 @bailian-studio/* 包。
 */

export { createLogger, resolveLogFormat, safeJsonStringify, type LogFormat, type Logger } from './logger'
export { MetricsCollector, type MetricsSnapshot, type TimerSummary } from './metrics'
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

export {
  CreateDirectorProjectSchema,
  DirectorPhaseSchema,
  DirectorPhaseStatusSchema,
  DirectorProjectDetailSchema,
  DirectorProjectListResponseSchema,
  DirectorProjectProgressSchema,
  DirectorProjectResponseSchema,
  DirectorProjectStatusSchema,
  DirectorProjectSummarySchema,
  DirectorPhaseStateSchema,
  DIRECTOR_PHASE_LABELS,
  DIRECTOR_PHASES,
  DIRECTOR_PHASE_STATUS,
  DIRECTOR_PROJECT_STATUS,
  ListDirectorProjectsSchema,
  UpdateDirectorProjectSchema,
  type CreateDirectorProjectInput,
  type DirectorPhase,
  type DirectorPhaseState,
  type DirectorPhaseStatus,
  type DirectorProjectDetail,
  type DirectorProjectListResult,
  type DirectorProjectProgress,
  type DirectorProjectStatus,
  type DirectorProjectSummary,
  type ListDirectorProjectsInput,
  type UpdateDirectorProjectInput,
} from './director'
