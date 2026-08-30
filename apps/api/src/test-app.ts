/**
 * 仅供测试的应用工厂。
 *
 * 每个测试套件都获得一个依赖图不可变的应用。测试必须把自己需要的能力传给
 * `createTestApp`；不存在共享的 app 单例，也没有可在套件之间泄漏状态的
 * 进程级 setter。
 */

import type { AuditOutboxRepository } from '@bailian-studio/audit-repository'
import type { AuthService } from '@bailian-studio/auth'
import type { CreativeAssetRepository } from '@bailian-studio/creative-asset-repository'
import type { CreditLedger } from '@bailian-studio/credit-ledger'
import type { DirectorRepository } from '@bailian-studio/director-repository'
import type {
  AdminTaskRepository,
  AnalyticsRepository,
  AuditRepository,
  GenerationRepository,
  UsageRepository,
} from '@bailian-studio/generation-repository'
import type { MediaRepository } from '@bailian-studio/media-repository'
import {
  resolveArtifactLocalRoot,
  type StorageAdapter,
} from '@bailian-studio/storage'
import { type App, createApp } from './app'
import type { ApiDependencies } from './dependencies'
import { readArtifactConfig } from './lib/artifact-config'
import { readAssetConfig } from './lib/asset-config'
import { readGenerationLimits } from './lib/limits'
import { getAllowedOrigins } from './lib/middleware'
import { readApiRateLimitConfig } from './lib/rate-limit'
import { readRequestGuardConfig } from './lib/request-guards'
import { createCreativeAssetApplicationService } from './modules/creative-assets/service'
import { createDirectorApplicationService } from './modules/director/service'
import { createGenerationApplicationService } from './modules/generations/service'
import { GenerationSseHub } from './modules/generations/sse-hub'

function missing<T>(name: string): T {
  return new Proxy(
    {},
    {
      get() {
        throw new Error(`Test dependency is not configured: ${name}`)
      },
    },
  ) as T
}

export type TestAppOverrides = Partial<ApiDependencies>

export interface TestAppContext {
  readonly app: App
  readonly dependencies: ApiDependencies
  readonly generationSseHub: GenerationSseHub
}

export function createTestApp(
  overrides: TestAppOverrides = {},
): TestAppContext {
  const generationSseHub = overrides.generationSseHub ?? new GenerationSseHub()
  const generationRepository =
    overrides.generationRepository ??
    missing<GenerationRepository>('generationRepository')
  const auditRepository =
    overrides.auditRepository ??
    missing<AuditRepository>('auditRepository')
  const assetRepository =
    overrides.assetRepository ?? missing<ApiDependencies['assetRepository']>('assetRepository')
  const shareRepository =
    overrides.shareRepository ?? missing<ApiDependencies['shareRepository']>('shareRepository')
  const publicShareRepository =
    overrides.publicShareRepository ?? missing<ApiDependencies['publicShareRepository']>('publicShareRepository')
  const socialRepository =
    overrides.socialRepository ??
    missing<ApiDependencies['socialRepository']>('socialRepository')
  const notificationRepository =
    overrides.notificationRepository ??
    missing<ApiDependencies['notificationRepository']>('notificationRepository')
  const promptLibraryRepository =
    overrides.promptLibraryRepository ??
    missing<ApiDependencies['promptLibraryRepository']>('promptLibraryRepository')
  const feedbackRepository =
    overrides.feedbackRepository ??
    missing<ApiDependencies['feedbackRepository']>('feedbackRepository')
  const contentReportRepository =
    overrides.contentReportRepository ??
    missing<ApiDependencies['contentReportRepository']>('contentReportRepository')
  const adminGalleryRepository =
    overrides.adminGalleryRepository ??
    missing<ApiDependencies['adminGalleryRepository']>('adminGalleryRepository')
  const adminTaskRepository =
    overrides.adminTaskRepository ??
    missing<AdminTaskRepository>('adminTaskRepository')
  const analyticsRepository =
    overrides.analyticsRepository ??
    missing<AnalyticsRepository>('analyticsRepository')
  const usageRepository =
    overrides.usageRepository ??
    missing<UsageRepository>('usageRepository')
  const creativeAssetRepository =
    overrides.creativeAssetRepository ??
    missing<CreativeAssetRepository>('creativeAssetRepository')
  const generationLimits =
    overrides.generationLimits ?? readGenerationLimits({})
  const generationApplicationService =
    overrides.generationApplicationService ??
    createGenerationApplicationService({
      repository: generationRepository,
      usageRepository,
      limits: generationLimits,
      creativeAssetRepository,
    })
  const directorRepository =
    overrides.directorRepository ??
    missing<DirectorRepository>('directorRepository')
  const directorApplicationService =
    overrides.directorApplicationService ??
    createDirectorApplicationService({ repository: directorRepository })
  const creativeAssetApplicationService =
    overrides.creativeAssetApplicationService ??
    createCreativeAssetApplicationService({
      repository: creativeAssetRepository,
    })
  const dependencies: ApiDependencies = {
    auditOutboxRepository:
      overrides.auditOutboxRepository ??
      missing<Pick<AuditOutboxRepository, 'listFailed' | 'requeueFailed'>>(
        'auditOutboxRepository',
      ),
    auditRepository,
    authService: overrides.authService ?? missing<AuthService>('authService'),
    ...(overrides.githubOAuth !== undefined
      ? { githubOAuth: overrides.githubOAuth }
      : {}),
    creditLedger:
      overrides.creditLedger ?? missing<CreditLedger>('creditLedger'),
    generationRepository,
    assetRepository,
    shareRepository,
    publicShareRepository,
    socialRepository,
    notificationRepository,
    promptLibraryRepository,
    feedbackRepository,
    contentReportRepository,
    adminGalleryRepository,
    adminTaskRepository,
    analyticsRepository,
    usageRepository,
    generationApplicationService,
    directorRepository,
    directorApplicationService,
    creativeAssetRepository,
    creativeAssetApplicationService,
    mediaRepository:
      overrides.mediaRepository ?? missing<MediaRepository>('mediaRepository'),
    storage: overrides.storage ?? missing<StorageAdapter>('storage'),
    generationSseHub,
    artifactLocalRoot:
      overrides.artifactLocalRoot ?? resolveArtifactLocalRoot({}),
    cookieSecure: overrides.cookieSecure ?? false,
    generationLimits,
    allowedOrigins: overrides.allowedOrigins ?? getAllowedOrigins({}),
    requestGuardConfig:
      overrides.requestGuardConfig ?? readRequestGuardConfig({}),
    rateLimitConfig: overrides.rateLimitConfig ?? readApiRateLimitConfig({}),
    assetConfig: overrides.assetConfig ?? readAssetConfig({}),
    artifactConfig: overrides.artifactConfig ?? readArtifactConfig({}),
  }

  return { app: createApp({ dependencies }), dependencies, generationSseHub }
}
