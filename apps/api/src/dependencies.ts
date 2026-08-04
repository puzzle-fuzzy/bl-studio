import type { AuthService } from '@bailian-studio/auth'
import type { CreditLedger } from '@bailian-studio/credit-ledger'
import type { GenerationRepository } from '@bailian-studio/generation-repository'
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
export interface ApiDependencies {
  readonly authService: AuthService
  readonly creditLedger: CreditLedger
  readonly generationRepository: GenerationRepository
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
