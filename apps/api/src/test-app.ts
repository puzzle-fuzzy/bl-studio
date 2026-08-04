/**
 * Test-only application factory.
 *
 * Every suite gets an application with an immutable dependency graph.  Tests
 * must pass the capabilities they need to `createTestApp`; there is no shared
 * app singleton and no process-wide setter that can leak state between suites.
 */
import type { AuthService } from '@bailian-studio/auth'
import type { CreditLedger } from '@bailian-studio/credit-ledger'
import type { GenerationRepository } from '@bailian-studio/generation-repository'
import type { MediaRepository } from '@bailian-studio/media-repository'
import { resolveArtifactLocalRoot, type StorageAdapter } from '@bailian-studio/storage'
import { createApp, type App } from './app'
import type { ApiDependencies } from './dependencies'
import { readAssetConfig } from './lib/asset-config'
import { readArtifactConfig } from './lib/artifact-config'
import { readGenerationLimits } from './lib/limits'
import { getAllowedOrigins } from './lib/middleware'
import { readApiRateLimitConfig } from './lib/rate-limit'
import { readRequestGuardConfig } from './lib/request-guards'
import { GenerationSseHub } from './modules/generations/sse-hub'

function missing<T>(name: string): T {
  return new Proxy({}, {
    get() {
      throw new Error(`Test dependency is not configured: ${name}`)
    },
  }) as T
}

export type TestAppOverrides = Partial<ApiDependencies>

export interface TestAppContext {
  readonly app: App
  readonly dependencies: ApiDependencies
  readonly generationSseHub: GenerationSseHub
}

export function createTestApp(overrides: TestAppOverrides = {}): TestAppContext {
  const generationSseHub = overrides.generationSseHub ?? new GenerationSseHub()
  const dependencies: ApiDependencies = {
    authService: overrides.authService ?? missing<AuthService>('authService'),
    creditLedger: overrides.creditLedger ?? missing<CreditLedger>('creditLedger'),
    generationRepository: overrides.generationRepository ?? missing<GenerationRepository>('generationRepository'),
    mediaRepository: overrides.mediaRepository ?? missing<MediaRepository>('mediaRepository'),
    storage: overrides.storage ?? missing<StorageAdapter>('storage'),
    generationSseHub,
    artifactLocalRoot: overrides.artifactLocalRoot ?? resolveArtifactLocalRoot({}),
    cookieSecure: overrides.cookieSecure ?? false,
    generationLimits: overrides.generationLimits ?? readGenerationLimits({}),
    allowedOrigins: overrides.allowedOrigins ?? getAllowedOrigins({}),
    requestGuardConfig: overrides.requestGuardConfig ?? readRequestGuardConfig({}),
    rateLimitConfig: overrides.rateLimitConfig ?? readApiRateLimitConfig({}),
    assetConfig: overrides.assetConfig ?? readAssetConfig({}),
    artifactConfig: overrides.artifactConfig ?? readArtifactConfig({}),
  }

  return { app: createApp({ dependencies }), dependencies, generationSseHub }
}
