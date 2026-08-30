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

// 监听器 transport 仍来自 db；generation trigger DDL 由本包自己拥有。
export type { NotificationListener } from "@bailian-studio/db";
export {
	type AdminGalleryRepository,
	createAdminGalleryRepository,
} from "./admin-gallery";
export {
	type AdminTaskRepository,
	createAdminTaskRepository,
} from "./admin-tasks";
export {
	type AnalyticsRepository,
	createAnalyticsRepository,
	type GenerationCallStats,
} from "./analytics";
export type { AssetRepository } from "./asset-port";
export { createAssetRepository } from "./assets";
export type {
	AssetDerivativeStatus,
	AssetSort,
	AssetSource,
	AssetThumbnailSource,
	CompleteAssetThumbnailInput,
	CreateUserAssetInput,
	FailAssetThumbnailInput,
	ListUnifiedAssetsOptions,
	ListUnifiedAssetsResult,
	MarkAssetThumbnailProcessingInput,
	UnifiedAssetItem,
} from "./asset-types";
export type { AuditRepository } from "./audit-port";
export { createAuditRepository } from "./audit-events";
export type {
	AuditAction,
	AuditEventMetadata,
	AuditEventMetadataValue,
	AuditLog,
	AuditOutcome,
	RecordAuditEventInput,
} from "./audit-types";
export { AUDIT_ACTIONS } from "./audit-types";
export {
	type ContentReportRepository,
	createContentReportRepository,
} from "./content-reports";
export type {
	GenerationListView,
	ListGenerationRecordsOptions,
	ListGenerationRecordsResult,
} from "./cursor";
export {
	GenerationRepositoryError,
	type GenerationRepositoryErrorCode,
} from "./errors";
export {
	createGenerationEventListener,
	type GenerationEventNotification,
} from "./event-listener";
export {
	type CreateGenerationRepositoryFromUrlOptions,
	createGenerationRepositoryFromUrl,
	type GenerationRepositoryHandle,
} from "./factory";
export { createFeedbackRepository, type FeedbackRepository } from "./feedback";
export {
	createNotificationRepository,
	type NotificationRepository,
} from "./notifications";
export { ensureGenerationEventsTrigger } from "./notify";
export {
	createPromptLibraryRepository,
	type PromptLibraryRepository,
} from "./prompt-library";
export type {
	FinishProviderRequestInput,
	ProviderRequestAudit,
	ProviderRequestErrorSummary,
	ProviderRequestOperation,
	ProviderRequestStatus,
	StartProviderRequestInput,
} from "./provider-request-types";
export type { ProviderRequestAuditRepository } from "./provider-request-port";
export { createProviderRequestAuditRepository } from "./provider-requests";
export {
	type ClaimNextQueuedTaskInput,
	createGenerationRepository,
	estimateGenerationRequest,
	type GenerationEstimate,
	type GenerationRepository,
	type ListStuckGenerationRecordsInput,
	type RenewTaskLockInput,
	type SaveTaskOptions,
} from "./repository";
export type {
	PublicShareRepository,
	ShareRepository,
} from "./share-port";
export { createShareRepository } from "./shares";
export { createSocialRepository, type SocialRepository } from "./social";
export {
	createIsolatedGenerationRepository,
	createTestUser,
	type GenerationRepositoryTestDb,
	grantTestCredits,
	type IsolatedGenerationRepository,
	requireRepositoryDatabaseUrl,
	resetGenerationRepositoryTestDb,
} from "./test-utils";
export type {
	AdminGalleryItem,
	AdminTaskItem,
	ArtifactKind,
	ArtifactStatus,
	ArtifactStorageProvider,
	CancelGenerationInput,
	CompleteGenerationInput,
	CompleteGenerationResult,
	ContentReport,
	ContentReportReason,
	ContentReportStatus,
	CostMarginRow,
	CreateGenerationInput,
	CreateGenerationResult,
	CreateGenerationShareInput,
	FailGenerationInput,
	FeedbackKind,
	FeedbackStatus,
	GalleryDetail,
	GalleryItem,
	GallerySort,
	GalleryVisibility,
	GenerationArtifact,
	GenerationAssetRefInput,
	GenerationAssetRefs,
	GenerationDiagnostics,
	GenerationEvent,
	GenerationEventCursor,
	GenerationInputAsset,
	GenerationLibraryState,
	GenerationQuotaLimits,
	GenerationRecord,
	GenerationShare,
	GetGenerationShareForRecordInput,
	GetOwnedStorageObjectInput,
	ListAdminGalleryResult,
	ListAdminTasksResult,
	ListContentReportsResult,
	ListFeedbackResult,
	ListGalleryResult,
	ListGenerationArtifactsOptions,
	ListGenerationArtifactsResult,
	ListGenerationEventsOptions,
	ListNotificationsResult,
	ListPromptLibraryResult,
	MarkArtifactFailedInput,
	MarkArtifactStoredInput,
	MarkGenerationProcessingInput,
	ModelCost,
	NormalizedGenerationOutput,
	NotificationItem,
	NotificationKind,
	OwnedStorageObject,
	PromptLibraryItem,
	PublicSharedGeneration,
	PublicSharedGenerationArtifact,
	PublicSharedGenerationRecord,
	RegisterWorkerHeartbeatInput,
	RepositoryGenerationStatus,
	RequestGenerationCancelInput,
	RetentionAnalytics,
	RetryGenerationInput,
	RevokeGenerationShareInput,
	ScheduleGenerationPollInput,
	SetGenerationLibraryStateInput,
	TaskDiagnosticError,
	TaskDiagnostics,
	UpdateGenerationRecordPatch,
	UserFeedback,
	WorkerHealth,
	WorkerHeartbeat,
} from "./types";
export {
	createUsageRepository,
	type DailyGenerationUsage,
	type DailyGenerationUsageInput,
	type GenerationUsage,
	type GenerationUsageInput,
	type UsageRepository,
} from "./usage";
