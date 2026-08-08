/**
 * @bailian-studio/generation-repository 的对外入口。
 *
 * 本包是整个系统的「中央生成接缝」：所有生成（generation）相关的持久化、
 * 状态机推进、任务调度、分享等都集中在这里，对外只暴露类型与工厂函数。
 *
 * 关键的边界设计：
 *  - services 层被架构规则禁止直接 import `@bailian-studio/db`，因此这里把
 *    `ensureGenerationEventsTrigger`、`NotificationListener` 等 db 层产物
 *    重新导出，让 api/worker 不必触碰 `@bailian-studio/db` 即可消费事件监听能力；
 *  - runtime factory 与 test helper 分离：生产 wiring 只消费 factory 导出的
 *    createGenerationRepositoryFromUrl，测试隔离数据库 helper 留在 test-utils。
 */
export { GenerationRepositoryError, type GenerationRepositoryErrorCode } from './errors'
export {
  createGenerationRepository,
  estimateGenerationRequest,
  type ClaimNextQueuedTaskInput,
  type DailyGenerationUsage,
  type DailyGenerationUsageInput,
  type GenerationCallStats,
  type GenerationUsage,
  type GenerationUsageInput,
  type GenerationEstimate,
  type GenerationRepository,
  type ListStuckGenerationRecordsInput,
  type RenewTaskLockInput,
  type SaveTaskOptions,
} from './repository'
export type {
  ContentReport,
  ContentReportReason,
  ContentReportStatus,
  ListContentReportsResult,
} from './types'
export {
  createGenerationRepositoryFromUrl,
  type CreateGenerationRepositoryFromUrlOptions,
  type GenerationRepositoryHandle,
} from './factory'
export type {
  FinishProviderRequestInput,
  ProviderRequestAudit,
  ProviderRequestErrorSummary,
  ProviderRequestOperation,
  ProviderRequestStatus,
  StartProviderRequestInput,
} from './provider-request-types'
export { AUDIT_ACTIONS } from './audit-types'
export type {
  AuditAction,
  AuditEventMetadata,
  AuditEventMetadataValue,
  AuditLog,
  AuditOutcome,
  RecordAuditEventInput,
} from './audit-types'
export {
  type GenerationListView,
  type ListGenerationRecordsOptions,
  type ListGenerationRecordsResult,
} from './cursor'
export { createGenerationEventListener, type GenerationEventNotification } from './event-listener'
export { ensureGenerationEventsTrigger } from './notify'
// 监听器 transport 仍来自 db；generation trigger DDL 由本包自己拥有。
export type { NotificationListener } from '@bailian-studio/db'
export {
  createIsolatedGenerationRepository,
  createTestUser,
  grantTestCredits,
  requireRepositoryDatabaseUrl,
  resetGenerationRepositoryTestDb,
  type GenerationRepositoryTestDb,
  type IsolatedGenerationRepository,
} from './test-utils'
export type {
  AdminGalleryItem,
  AdminTaskItem,
  ArtifactKind,
  ArtifactStatus,
  ArtifactStorageProvider,
  CancelGenerationInput,
  CostMarginRow,
  FeedbackKind,
  FeedbackStatus,
  GalleryDetail,
  GalleryItem,
  GallerySort,
  GalleryVisibility,
  ListAdminGalleryResult,
  ListAdminTasksResult,
  ListFeedbackResult,
  ListGalleryResult,
  ListNotificationsResult,
  ListPromptLibraryResult,
  ModelCost,
  NotificationItem,
  NotificationKind,
  PromptLibraryItem,
  RetentionAnalytics,
  UserFeedback,
  CompleteGenerationInput,
  CompleteGenerationResult,
  CreateGenerationInput,
  CreateGenerationResult,
  GenerationEvent,
  GenerationEventCursor,
  GenerationAssetRefInput,
  GenerationAssetRefs,
  GenerationInputAsset,
  GenerationLibraryState,
  CreateGenerationShareInput,
  FailGenerationInput,
  GenerationDiagnostics,
  GenerationArtifact,
  GenerationRecord,
  GenerationShare,
  GetOwnedStorageObjectInput,
  GetGenerationShareForRecordInput,
  ListGenerationArtifactsOptions,
  ListGenerationArtifactsResult,
  ListGenerationEventsOptions,
  MarkArtifactFailedInput,
  MarkArtifactStoredInput,
  MarkGenerationProcessingInput,
  NormalizedGenerationOutput,
  PublicSharedGeneration,
  PublicSharedGenerationArtifact,
  PublicSharedGenerationRecord,
  OwnedStorageObject,
  RevokeGenerationShareInput,
  RepositoryGenerationStatus,
  RegisterWorkerHeartbeatInput,
  RequestGenerationCancelInput,
  RetryGenerationInput,
  ScheduleGenerationPollInput,
  SetGenerationLibraryStateInput,
  TaskDiagnosticError,
  TaskDiagnostics,
  UpdateGenerationRecordPatch,
  WorkerHealth,
  WorkerHeartbeat,
  GenerationQuotaLimits,
} from './types'
export type {
  AssetDerivativeStatus,
  AssetThumbnailSource,
  AssetSource,
  AssetSort,
  CompleteAssetThumbnailInput,
  CreateUserAssetInput,
  FailAssetThumbnailInput,
  ListUnifiedAssetsOptions,
  ListUnifiedAssetsResult,
  MarkAssetThumbnailProcessingInput,
  UnifiedAssetItem,
} from './asset-types'
