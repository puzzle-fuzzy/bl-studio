/**
 * API 进程组装入口。
 *
 * `app.ts` 只构造可测试的 Elysia 应用；数据库连接、认证、存储和事件监听器
 * 都在这里创建并在退出时成对释放，避免 import API 模块就启动网络或泄漏连接。
 */
import { createApiPersistenceRuntime } from '@bailian-studio/persistence-runtime'
import { createLogger } from '@bailian-studio/shared'
import {
  createStorageFromEnv,
  resolveArtifactLocalRoot,
} from '@bailian-studio/storage'
import { createApp } from './app'
import type { ApiDependencies } from './dependencies'
import { readArtifactConfig } from './lib/artifact-config'
import { readAssetConfig } from './lib/asset-config'
import { readApiEnvOrThrow } from './lib/env'
import { readGenerationLimits } from './lib/limits'
import { getAllowedOrigins } from './lib/middleware'
import { readApiRateLimitConfig } from './lib/rate-limit'
import { readRequestGuardConfig } from './lib/request-guards'
import { cookieSecure } from './modules/auth/cookies'
import { createSmtpEmailSender } from './modules/auth/smtp-email-sender'
import { createCreativeAssetApplicationService } from './modules/creative-assets/service'
import { createDirectorApplicationService } from './modules/director/service'
import { startGenerationEventListener } from './modules/generations/event-listener'
import { createGenerationApplicationService } from './modules/generations/service'
import { GenerationSseHub } from './modules/generations/sse-hub'

export { type ApiAppOptions, type App, createApp } from './app'
export type { ApiDependencies } from './dependencies'

async function main(): Promise<void> {
  const env = readApiEnvOrThrow()
  const persistence = createApiPersistenceRuntime({
    databaseUrl: env.databaseUrl,
    jwtSecret: env.authJwtSecret,
    emailSender: createSmtpEmailSender(process.env),
    publicWebOrigin: env.authPublicWebOrigin,
  })
  const storage = createStorageFromEnv({ env: process.env })

  const generationSseHub = new GenerationSseHub()
  const allowedOrigins = getAllowedOrigins(process.env)
  const githubOAuth = readGithubOAuthConfig(
    process.env,
    env.authPublicWebOrigin,
  )
  const generationLimits = readGenerationLimits(process.env)
  const generationApplicationService = createGenerationApplicationService({
    repository: persistence.generationRepository,
    usageRepository: persistence.usageRepository,
    limits: generationLimits,
    creativeAssetRepository: persistence.creativeAssetRepository,
  })
  const directorApplicationService = createDirectorApplicationService({
    repository: persistence.directorRepository,
  })
  const creativeAssetApplicationService = createCreativeAssetApplicationService(
    {
      repository: persistence.creativeAssetRepository,
    },
  )
  const dependencies: ApiDependencies = {
    auditOutboxRepository: persistence.auditOutboxRepository,
    auditRepository: persistence.auditRepository,
    authService: persistence.authService,
    ...(githubOAuth !== undefined ? { githubOAuth } : {}),
    creditLedger: persistence.creditLedger,
    generationRepository: persistence.generationRepository,
    generationDiagnosticsRepository: persistence.generationDiagnosticsRepository,
    assetRepository: persistence.assetRepository,
    shareRepository: persistence.shareRepository,
    publicShareRepository: persistence.publicShareRepository,
    socialRepository: persistence.socialRepository,
    notificationRepository: persistence.notificationRepository,
    promptLibraryRepository: persistence.promptLibraryRepository,
    feedbackRepository: persistence.feedbackRepository,
    contentReportRepository: persistence.contentReportRepository,
    adminGalleryRepository: persistence.adminGalleryRepository,
    adminTaskRepository: persistence.adminTaskRepository,
    analyticsRepository: persistence.analyticsRepository,
    usageRepository: persistence.usageRepository,
    generationApplicationService,
    directorRepository: persistence.directorRepository,
    directorApplicationService,
    creativeAssetRepository: persistence.creativeAssetRepository,
    creativeAssetApplicationService,
    mediaRepository: persistence.mediaRepository,
    storage,
    generationSseHub,
    artifactLocalRoot: resolveArtifactLocalRoot(process.env),
    cookieSecure: cookieSecure(process.env),
    generationLimits,
    allowedOrigins,
    requestGuardConfig: readRequestGuardConfig(process.env),
    rateLimitConfig: readApiRateLimitConfig(process.env),
    assetConfig: readAssetConfig(process.env),
    artifactConfig: readArtifactConfig(process.env),
  }
  const app = createApp({ dependencies })
  const maintenanceLogger = createLogger('api:maintenance')
  const sweepAuthState = () => {
    void persistence.authService.pruneExpiredAuthState().catch((error) => {
      maintenanceLogger.error('auth_state_sweep_failed', {
        errorName: error instanceof Error ? error.name : 'unknown',
      })
    })
  }
  sweepAuthState()
  const authStateSweepTimer = setInterval(sweepAuthState, 60 * 60 * 1000)

  let listener: { close(): Promise<void> } | undefined
  try {
    listener = await startGenerationEventListener({
      connectionString: env.databaseUrl,
      repository: persistence.generationRepository,
      hub: generationSseHub,
    })

    const server = app.listen({ hostname: env.host, port: env.port })
    console.log(
      `Bailian Studio API listening on http://${env.host}:${env.port}`,
    )

    let shuttingDown = false
    const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
      if (shuttingDown) return
      shuttingDown = true
      console.log(`received ${signal}, stopping...`)
      clearInterval(authStateSweepTimer)
      await app.stop()
      if (listener !== undefined) await listener.close()
      await persistence.close()
      server.stop?.()
    }

    process.on('SIGINT', () => void shutdown('SIGINT'))
    process.on('SIGTERM', () => void shutdown('SIGTERM'))
  } catch (error) {
    clearInterval(authStateSweepTimer)
    if (listener !== undefined) await listener.close()
    await persistence.close()
    throw error
  }
}

/** GitHub OAuth 应用配置；缺少 GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET 时返回 undefined（登录禁用）。 */
function readGithubOAuthConfig(
  source: Readonly<Record<string, string | undefined>>,
  webOrigin: string,
): ApiDependencies['githubOAuth'] {
  const clientId = source['GITHUB_CLIENT_ID']?.trim()
  const clientSecret = source['GITHUB_CLIENT_SECRET']?.trim()
  if (
    clientId === undefined ||
    clientId.length === 0 ||
    clientSecret === undefined ||
    clientSecret.length === 0
  ) {
    return undefined
  }
  return {
    clientId,
    clientSecret,
    callbackUrl:
      source['GITHUB_CALLBACK_URL']?.trim() ||
      `${webOrigin}/api/auth/github/callback`,
    webOrigin,
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(
      'API failed to start:',
      error instanceof Error ? error.message : error,
    )
    process.exit(1)
  })
}
