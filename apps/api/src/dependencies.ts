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
 * All runtime capabilities available to the HTTP application.
 *
 * This is the API composition boundary: route modules receive these concrete
 * capabilities from the process entrypoint and never create database pools,
 * read process.env, or reach into another module's mutable singleton.
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
