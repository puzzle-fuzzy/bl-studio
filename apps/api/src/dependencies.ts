import type { AuthService } from '@bailian-studio/auth'
import type { CreditLedger } from '@bailian-studio/credit-ledger'
import type { GenerationRepository } from '@bailian-studio/generation-repository'
import type { DirectorRepository } from '@bailian-studio/director-repository'
import type { CreativeAssetRepository } from '@bailian-studio/creative-asset-repository'
import type { MediaRepository } from '@bailian-studio/media-repository'
import type { StorageAdapter } from '@bailian-studio/storage'
import type { GenerationLimits } from './lib/limits'
import type { ApiRateLimitConfig } from './lib/rate-limit'
import type { RequestGuardConfig } from './lib/request-guards'
import type { AssetConfig } from './lib/asset-config'
import type { ArtifactConfig } from './lib/artifact-config'
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
  readonly authService: AuthService
  readonly githubOAuth?: GithubOAuthConfig
  readonly creditLedger: CreditLedger
  readonly generationRepository: GenerationRepository
  readonly directorRepository: DirectorRepository
  readonly creativeAssetRepository: CreativeAssetRepository
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
