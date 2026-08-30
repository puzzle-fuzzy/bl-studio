import type { AuditOutboxRepository } from '@bailian-studio/audit-repository'
import type { AuthService } from '@bailian-studio/auth'
import type { AdminRepository } from '@bailian-studio/admin-repository'
import type { CanvasRepository } from '@bailian-studio/canvas-repository'
import type { CreativeAssetRepository } from '@bailian-studio/creative-asset-repository'
import type { CreditLedger } from '@bailian-studio/credit-ledger'
import type { DirectorRepository } from '@bailian-studio/director-repository'
import type {
  AssetRepository,
  AuditRepository,
  ContentReportRepository,
  FeedbackRepository,
  GenerationDiagnosticsRepository,
  GenerationRepository,
  NotificationRepository,
  PromptLibraryRepository,
  PublicShareRepository,
  ShareRepository,
  SocialRepository,
  UsageRepository,
} from '@bailian-studio/generation-repository'
import type { MediaRepository } from '@bailian-studio/media-repository'
import type { ModelCatalog, ModelManifestResolver } from '@bailian-studio/model-core'
import type { StorageAdapter } from '@bailian-studio/storage'
import type { TaskQueueRepository } from '@bailian-studio/task-repository'
import type { ArtifactConfig } from './lib/artifact-config'
import type { AssetConfig } from './lib/asset-config'
import type { GenerationLimits } from './lib/limits'
import type { ApiRateLimitConfig } from './lib/rate-limit'
import type { RequestGuardConfig } from './lib/request-guards'
import type { CreativeAssetApplicationService } from './modules/creative-assets/service'
import type { DirectorApplicationService } from './modules/director/service'
import type { GenerationApplicationService } from './modules/generations/service'
import type { GenerationSseHub } from './modules/generations/sse-hub'

/**
 * HTTP 应用可用的全部运行时能力。
 *
 * 这是 API 的组合边界：路由模块从进程入口接收这些具体能力，绝不自行创建
 * 数据库连接池、读取 process.env，或触及另一模块的可变单例。
 */
/** GitHub OAuth 应用配置；未配置时 `githubOAuth` 为 undefined（GitHub 登录禁用）。 */
export interface GithubOAuthConfig {
  readonly clientId: string
  readonly clientSecret: string
  /** 注册到 GitHub OAuth App 的回调地址（形如 https://create.yxswy.com/api/auth/github/callback）。 */
  readonly callbackUrl: string
  /** 登录成功后前端重定向的 origin（AUTH_PUBLIC_WEB_ORIGIN）。 */
  readonly webOrigin: string
}

export interface ApiDependencies {
  readonly auditOutboxRepository: Pick<AuditOutboxRepository, 'listFailed' | 'requeueFailed'>
  /** API 横切审计写入的最小 port。 */
  readonly auditRepository: AuditRepository
  readonly authService: AuthService
  readonly githubOAuth?: GithubOAuthConfig
  readonly creditLedger: CreditLedger
  readonly generationRepository: GenerationRepository
  /** API 组合根提供的 provider-neutral 模型目录解析器。 */
  readonly modelResolver: ModelManifestResolver
  /** API 路由消费的 provider-neutral 模型目录投影。 */
  readonly modelCatalog: ModelCatalog
  /** 当前用户生成详情的安全诊断投影。 */
  readonly generationDiagnosticsRepository: GenerationDiagnosticsRepository
  /** 用户资产读写的窄持久化 port。 */
  readonly assetRepository: AssetRepository
  /** generation 分享创建与撤销的窄持久化 port。 */
  readonly shareRepository: ShareRepository
  /** 匿名分享读取的窄持久化 port，与所有者写入能力分离。 */
  readonly publicShareRepository: PublicShareRepository
  /** 画廊/点赞/收藏的窄持久化 port；generationRepository 仅保留兼容与审计等能力。 */
  readonly socialRepository: SocialRepository
  /** 通知收件箱与社交通知写入的窄持久化 port。 */
  readonly notificationRepository: NotificationRepository
  /** 用户提示词资产库的窄持久化 port。 */
  readonly promptLibraryRepository: PromptLibraryRepository
  /** 用户反馈及 admin 状态流转的窄持久化 port。 */
  readonly feedbackRepository: FeedbackRepository
  /** 内容举报读写的窄持久化 port；admin 下架联动由 social/admin port 显式编排。 */
  readonly contentReportRepository: ContentReportRepository
  /** admin 跨域读模型与治理 port 的组合根。 */
  readonly adminRepository: AdminRepository
  /** 当前用户 Canvas 文档、版本和乐观并发控制。 */
  readonly canvasRepository: CanvasRepository
  /** Canvas 编排任务的独立队列写入/读取端口。 */
  readonly taskQueueRepository: Pick<TaskQueueRepository, 'getTask' | 'enqueueTask' | 'cancelTask' | 'listTasks'>
  /** 用户用量读模型的窄持久化 port。 */
  readonly usageRepository: UsageRepository
  readonly generationApplicationService: GenerationApplicationService
  readonly directorRepository: DirectorRepository
  readonly directorApplicationService: DirectorApplicationService
  readonly creativeAssetRepository: CreativeAssetRepository
  readonly creativeAssetApplicationService: CreativeAssetApplicationService
  readonly mediaRepository: MediaRepository
  readonly storage: StorageAdapter
  readonly generationSseHub: GenerationSseHub
  readonly artifactLocalRoot: string
  readonly cookieSecure: boolean
  readonly generationLimits: GenerationLimits
  readonly allowedOrigins: readonly string[]
  readonly requestGuardConfig: RequestGuardConfig
  readonly rateLimitConfig: ApiRateLimitConfig
  readonly assetConfig: AssetConfig
  readonly artifactConfig: ArtifactConfig
}
