/**
 * 运行时 repository 装配。
 *
 * 本模块刻意不提供测试数据库 helper。API 与 worker 的进程组合由
 * @bailian-studio/persistence-runtime 统一创建共享数据库句柄，再把同一 db 注入
 * 各持久化模块；独立使用时仍可通过本文件的 URL 工厂快速组装一个 repository。
 */
import { createDb, type BailianStudioDb } from '@bailian-studio/db'
import { createCreativeGenerationContextStore } from '@bailian-studio/creative-asset-repository'
import { createAssetRepository } from './assets'
import type { AssetRepository } from './asset-port'
import { createAuditRepository } from './audit-events'
import type { AuditRepository } from './audit-port'
import { createContentReportRepository, type ContentReportRepository } from './content-reports'
import { createGenerationDiagnosticsRepository, type GenerationDiagnosticsRepository } from './diagnostics'
import { createGenerationRecoveryRepository, type GenerationRecoveryRepository } from './recovery'
import { createFeedbackRepository, type FeedbackRepository } from './feedback'
import { createGenerationRepository, type GenerationRepository } from './repository'
import { createNotificationRepository, type NotificationRepository } from './notifications'
import { createPromptLibraryRepository, type PromptLibraryRepository } from './prompt-library'
import type { ProviderRequestAuditRepository } from './provider-request-port'
import { createProviderRequestAuditRepository } from './provider-requests'
import { createShareRepository } from './shares'
import type { PublicShareRepository, ShareRepository } from './share-port'
import { createSocialRepository, type SocialRepository } from './social'
import { createUsageRepository, type UsageRepository } from './usage'
import {
  createTaskQueueReadStore,
  createTaskQueueTransactionStore,
} from '@bailian-studio/task-repository'

export interface CreateGenerationRepositoryFromUrlOptions {
  max?: number
}

export interface GenerationRepositoryHandle {
  db: BailianStudioDb
  /** 核心 generation/worker 能力；其他上下文通过下面的窄 port 暴露。 */
  repository: GenerationRepository
  assetRepository: AssetRepository
  auditRepository: AuditRepository
  generationDiagnosticsRepository: GenerationDiagnosticsRepository
  generationRecoveryRepository: GenerationRecoveryRepository
  contentReportRepository: ContentReportRepository
  feedbackRepository: FeedbackRepository
  notificationRepository: NotificationRepository
  promptLibraryRepository: PromptLibraryRepository
  providerRequestAuditRepository: ProviderRequestAuditRepository
  shareRepository: ShareRepository
  publicShareRepository: PublicShareRepository
  socialRepository: SocialRepository
  usageRepository: UsageRepository
  close(): Promise<void>
}

export function createGenerationRepositoryFromUrl(
  url: string,
  options: CreateGenerationRepositoryFromUrlOptions = {},
): GenerationRepositoryHandle {
  const db = createDb({ url, max: options.max ?? 5 })
  const taskQueueReadStore = createTaskQueueReadStore()
  const taskQueueTransactionStore = createTaskQueueTransactionStore()
  const creativeGenerationContextStore = createCreativeGenerationContextStore()
  const shareRepository = createShareRepository(db)
  return {
    db,
    repository: createGenerationRepository({
      db,
      taskQueueTransactionStore,
      creativeGenerationContextStore,
    }),
    assetRepository: createAssetRepository({ db, taskQueueTransactionStore }),
    auditRepository: createAuditRepository(db),
    generationDiagnosticsRepository: createGenerationDiagnosticsRepository(db, taskQueueReadStore),
    generationRecoveryRepository: createGenerationRecoveryRepository(db, taskQueueReadStore),
    contentReportRepository: createContentReportRepository(db),
    feedbackRepository: createFeedbackRepository(db),
    notificationRepository: createNotificationRepository(db),
    promptLibraryRepository: createPromptLibraryRepository(db),
    providerRequestAuditRepository: createProviderRequestAuditRepository(db),
    shareRepository,
    publicShareRepository: shareRepository,
    socialRepository: createSocialRepository(db),
    usageRepository: createUsageRepository(db),
    close: () => db.close(),
  }
}
