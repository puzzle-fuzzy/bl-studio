/**
 * @bailian-studio/generation-repository 的对外入口。
 *
 * 本包是整个系统的「生成持久化接缝」：核心 repository 负责 generation 业务持久化、
 * 状态推进和业务事务内的初始任务写入；诊断与故障恢复通过独立窄 port 暴露，任务
 * 调度/租约生命周期由 task-repository 独立拥有。
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
export {
	createAssetRepository,
	type CreateAssetRepositoryOptions,
} from "./assets";
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
export {
	createGenerationDiagnosticsRepository,
	type GenerationDiagnosticsRepository,
} from "./diagnostics";
export {
	createGenerationRecoveryRepository,
	type GenerationRecoveryRepository,
	type ListStuckGenerationRecordsInput,
} from "./recovery";
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
	createGenerationRepository,
	estimateGenerationRequest,
	type GenerationEstimate,
	type GenerationRepository,
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
