/**
 * API 进程组装入口。
 *
 * `app.ts` 只构造可测试的 Elysia 应用；数据库连接、认证、存储和事件监听器
 * 都在这里创建并在退出时成对释放，避免 import API 模块就启动网络或泄漏连接。
 */
import { createAuthServiceFromUrl } from '@bailian-studio/auth'
import { createCreditLedgerFromUrl } from '@bailian-studio/credit-ledger'
import { createGenerationRepositoryFromUrl } from '@bailian-studio/generation-repository'
import { createDirectorRepositoryFromUrl } from '@bailian-studio/director-repository'
import { createMediaRepositoryFromUrl } from '@bailian-studio/media-repository'
import { createStorageFromEnv, resolveArtifactLocalRoot } from '@bailian-studio/storage'
import { createLogger } from '@bailian-studio/shared'
import { readApiEnvOrThrow } from './lib/env'
import { cookieSecure } from './modules/auth/cookies'
import { createSmtpEmailSender } from './modules/auth/smtp-email-sender'
import { getAllowedOrigins } from './lib/middleware'
import { readApiRateLimitConfig } from './lib/rate-limit'
import { readGenerationLimits } from './lib/limits'
import { readRequestGuardConfig } from './lib/request-guards'
import { readAssetConfig } from './lib/asset-config'
import { readArtifactConfig } from './lib/artifact-config'
import { createApp } from './app'
import type { ApiDependencies } from './dependencies'
import { GenerationSseHub } from './modules/generations/sse-hub'
import { startGenerationEventListener } from './modules/generations/event-listener'

export { createApp, type ApiAppOptions, type App } from './app'
export type { ApiDependencies } from './dependencies'

async function main(): Promise<void> {
  const env = readApiEnvOrThrow()
  const generationHandle = createGenerationRepositoryFromUrl(env.databaseUrl)
  const directorHandle = createDirectorRepositoryFromUrl(env.databaseUrl)
  const mediaHandle = createMediaRepositoryFromUrl(env.databaseUrl)
  const authHandle = createAuthServiceFromUrl(env.databaseUrl, {
    jwtSecret: env.authJwtSecret,
    emailSender: createSmtpEmailSender(process.env),
    publicWebOrigin: env.authPublicWebOrigin,
  })
  const creditHandle = createCreditLedgerFromUrl(env.databaseUrl)
  const storage = createStorageFromEnv({ env: process.env })

  const generationSseHub = new GenerationSseHub()
  const allowedOrigins = getAllowedOrigins(process.env)
  const githubOAuth = readGithubOAuthConfig(process.env, env.authPublicWebOrigin)
  const dependencies: ApiDependencies = {
    authService: authHandle.authService,
    ...(githubOAuth !== undefined ? { githubOAuth } : {}),
    creditLedger: creditHandle.ledger,
    generationRepository: generationHandle.repository,
    directorRepository: directorHandle.repository,
    mediaRepository: mediaHandle.repository,
    storage,
    generationSseHub,
    artifactLocalRoot: resolveArtifactLocalRoot(process.env),
    cookieSecure: cookieSecure(process.env),
    generationLimits: readGenerationLimits(process.env),
    allowedOrigins,
    requestGuardConfig: readRequestGuardConfig(process.env),
    rateLimitConfig: readApiRateLimitConfig(process.env),
    assetConfig: readAssetConfig(process.env),
    artifactConfig: readArtifactConfig(process.env),
  }
  const app = createApp({ dependencies })
  const maintenanceLogger = createLogger('api:maintenance')
  const sweepAuthState = () => {
    void authHandle.authService.pruneExpiredAuthState().catch(error => {
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
      repository: generationHandle.repository,
      hub: generationSseHub,
    })

    const server = app.listen({ hostname: env.host, port: env.port })
    console.log(`Bailian Studio API listening on http://${env.host}:${env.port}`)

    let shuttingDown = false
    const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
      if (shuttingDown) return
      shuttingDown = true
      console.log(`received ${signal}, stopping...`)
      clearInterval(authStateSweepTimer)
      await app.stop()
      if (listener !== undefined) await listener.close()
      await Promise.all([generationHandle.close(), directorHandle.close(), mediaHandle.close(), authHandle.close(), creditHandle.close()])
      server.stop?.()
    }

    process.on('SIGINT', () => void shutdown('SIGINT'))
    process.on('SIGTERM', () => void shutdown('SIGTERM'))
  }
  catch (error) {
    clearInterval(authStateSweepTimer)
    if (listener !== undefined) await listener.close()
    await Promise.all([generationHandle.close(), directorHandle.close(), mediaHandle.close(), authHandle.close(), creditHandle.close()])
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
  if (clientId === undefined || clientId.length === 0 || clientSecret === undefined || clientSecret.length === 0) {
    return undefined
  }
  return {
    clientId,
    clientSecret,
    callbackUrl: source['GITHUB_CALLBACK_URL']?.trim() || `${webOrigin}/api/auth/github/callback`,
    webOrigin,
  }
}

if (import.meta.main) {
  main().catch(error => {
    console.error('API failed to start:', error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
