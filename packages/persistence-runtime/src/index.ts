/**
 * 进程级持久化组合边界。
 *
 * 这个包不启动 listener，也不承载业务规则；它只负责在 API/Worker 进程的组合根
 * 创建一次 PostgreSQL/Drizzle 句柄，把同一实例注入各持久化模块，并集中管理关闭。
 * 这样应用不需要直接 import @bailian-studio/db，也不会把某个业务 repository 误当作
 * 其它模块的数据库生命周期 owner。
 */

import {
	type AuditOutboxRepository,
	createAuditOutboxRepository,
} from "@bailian-studio/audit-repository";
import {
	type AuthService,
	type AuthServiceOptions,
	createAuthService,
} from "@bailian-studio/auth";
import {
	type CreativeAssetRepository,
	createCreativeAssetRepository,
} from "@bailian-studio/creative-asset-repository";
import {
	type CreditLedger,
	createCreditLedger,
} from "@bailian-studio/credit-ledger";
import { type BailianStudioDb, createDb } from "@bailian-studio/db";
import {
	createDirectorRepository,
	type DirectorRepository,
} from "@bailian-studio/director-repository";
import {
	type AdminGalleryRepository,
	type AdminTaskRepository,
	type AnalyticsRepository,
	type AssetRepository,
	type AuditRepository,
	type ContentReportRepository,
	createAdminGalleryRepository,
	createAdminTaskRepository,
	createAssetRepository,
	createAnalyticsRepository,
	createContentReportRepository,
	createFeedbackRepository,
	createGenerationRepository,
	createNotificationRepository,
	createPromptLibraryRepository,
	createProviderRequestAuditRepository,
	createSocialRepository,
	createShareRepository,
	createUsageRepository,
	type FeedbackRepository,
	type GenerationRepository,
	type NotificationRepository,
	type PromptLibraryRepository,
	type PublicShareRepository,
	type ProviderRequestAuditRepository,
	type ShareRepository,
	type SocialRepository,
	type UsageRepository,
} from "@bailian-studio/generation-repository";
import {
	createMediaRepository,
	type MediaRepository,
} from "@bailian-studio/media-repository";
import {
	createTaskQueueRepository,
	type TaskQueueRepository,
} from "@bailian-studio/task-repository";

const DEFAULT_DATABASE_POOL_MAX = 5;

export interface CreateApiPersistenceRuntimeOptions
	extends Omit<AuthServiceOptions, "db"> {
	databaseUrl: string;
	databasePoolMax?: number;
}

export interface ApiPersistenceRuntime {
	readonly auditOutboxRepository: AuditOutboxRepository;
	readonly auditRepository: AuditRepository;
	readonly authService: AuthService;
	readonly creditLedger: CreditLedger;
	readonly generationRepository: GenerationRepository;
	readonly assetRepository: AssetRepository;
	readonly shareRepository: ShareRepository;
	readonly publicShareRepository: PublicShareRepository;
	readonly socialRepository: SocialRepository;
	readonly notificationRepository: NotificationRepository;
	readonly promptLibraryRepository: PromptLibraryRepository;
	readonly feedbackRepository: FeedbackRepository;
	readonly contentReportRepository: ContentReportRepository;
	readonly adminGalleryRepository: AdminGalleryRepository;
	readonly adminTaskRepository: AdminTaskRepository;
	readonly analyticsRepository: AnalyticsRepository;
	readonly usageRepository: UsageRepository;
	readonly directorRepository: DirectorRepository;
	readonly creativeAssetRepository: CreativeAssetRepository;
	readonly mediaRepository: MediaRepository;
	close(): Promise<void>;
}

export interface CreateWorkerPersistenceRuntimeOptions {
	databaseUrl: string;
	databasePoolMax?: number;
}

export interface WorkerPersistenceRuntime {
	readonly auditOutboxRepository: AuditOutboxRepository;
	readonly creditLedger: CreditLedger;
	readonly generationRepository: GenerationRepository;
	readonly taskQueueRepository: TaskQueueRepository;
	readonly providerRequestAuditRepository: ProviderRequestAuditRepository;
	readonly directorRepository: DirectorRepository;
	readonly mediaRepository: MediaRepository;
	close(): Promise<void>;
}

function createSharedDatabase(
	url: string,
	max: number | undefined,
): BailianStudioDb {
	return createDb({ url, max: max ?? DEFAULT_DATABASE_POOL_MAX });
}

function closeOnce(db: BailianStudioDb): () => Promise<void> {
	let closed = false;
	return async () => {
		if (closed) return;
		closed = true;
		await db.close();
	};
}

export function createApiPersistenceRuntime(
	options: CreateApiPersistenceRuntimeOptions,
): ApiPersistenceRuntime {
	const db = createSharedDatabase(options.databaseUrl, options.databasePoolMax);
	try {
		const close = closeOnce(db);
		const generationRepository = createGenerationRepository({ db });
		const shareRepository = createShareRepository(db);
		return {
			auditOutboxRepository: createAuditOutboxRepository({ db }),
			auditRepository: generationRepository,
			authService: createAuthService({
				db,
				...withoutDatabaseRuntimeOptions(options),
			}),
			creditLedger: createCreditLedger({ db }),
			generationRepository,
			assetRepository: createAssetRepository(db),
			shareRepository,
			publicShareRepository: shareRepository,
			socialRepository: createSocialRepository(db),
			notificationRepository: createNotificationRepository(db),
			promptLibraryRepository: createPromptLibraryRepository(db),
			feedbackRepository: createFeedbackRepository(db),
			contentReportRepository: createContentReportRepository(db),
			adminGalleryRepository: createAdminGalleryRepository(db),
			adminTaskRepository: createAdminTaskRepository(db),
			analyticsRepository: createAnalyticsRepository(db),
			usageRepository: createUsageRepository(db),
			directorRepository: createDirectorRepository({ db }),
			creativeAssetRepository: createCreativeAssetRepository({ db }),
			mediaRepository: createMediaRepository({ db }),
			close,
		};
	} catch (error) {
		void db.close();
		throw error;
	}
}

export function createWorkerPersistenceRuntime(
	options: CreateWorkerPersistenceRuntimeOptions,
): WorkerPersistenceRuntime {
	const db = createSharedDatabase(options.databaseUrl, options.databasePoolMax);
	try {
		const close = closeOnce(db);
		return {
			auditOutboxRepository: createAuditOutboxRepository({ db }),
			creditLedger: createCreditLedger({ db }),
			generationRepository: createGenerationRepository({ db }),
			taskQueueRepository: createTaskQueueRepository({ db }),
			providerRequestAuditRepository: createProviderRequestAuditRepository(db),
			directorRepository: createDirectorRepository({ db }),
			mediaRepository: createMediaRepository({ db }),
			close,
		};
	} catch (error) {
		void db.close();
		throw error;
	}
}

function withoutDatabaseRuntimeOptions(
	options: CreateApiPersistenceRuntimeOptions,
): Omit<CreateApiPersistenceRuntimeOptions, "databaseUrl" | "databasePoolMax"> {
	const {
		databaseUrl: _databaseUrl,
		databasePoolMax: _databasePoolMax,
		...authOptions
	} = options;
	return authOptions;
}
