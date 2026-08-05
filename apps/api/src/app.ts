import { Elysia } from 'elysia'
import { cors } from '@elysia/cors'
import { createLogger } from '@bailian-studio/shared'
import { errorResponseBody, httpStatusForError, requestErrorResponseBody } from './lib/http-errors'
import {
  beginRequestTrace,
  copyRequestTrace,
  getRequestTrace,
  SECURITY_HEADERS,
} from './lib/middleware'
import {
  MemoryRateLimiter,
  clientIdentity,
  rateLimitRule,
  type ApiRateLimitConfig,
} from './lib/rate-limit'
import {
  validateRequestGuards,
  wrapRequestBodyWithLimit,
  type RequestGuardConfig,
} from './lib/request-guards'
import type { ApiDependencies } from './dependencies'
import { createGenerationRoutes } from './modules/generations/routes'
import { createGalleryRoutes } from './modules/gallery/routes'
import { createPromptLibraryRoutes } from './modules/prompt-library/routes'
import { createFeedbackRoutes } from './modules/feedback/routes'
import { modelRoutes } from './modules/models/routes'
import { createArtifactRoutes } from './modules/artifacts/routes'
import { createAssetRoutes } from './modules/assets'
import { createAuthRoutes } from './modules/auth'
import { createMediaRoutes } from './modules/media'
import { createShareRoutes } from './modules/shares'
import { createUsageRoutes } from './modules/usage'
import { createPointsRoutes } from './modules/points'
import { createAdminRoutes } from './modules/admin'
import { appMetrics } from './lib/metrics'

const accessLogger = createLogger('api')

// worker 存活心跳被认为过期的阈值：worker 每 5s 更新心跳行，15s 无更新即视为
// 失联（允许 3 个心跳周期的抖动容差）。用于 /api/health/ready 的 worker 检查。
const WORKER_HEARTBEAT_STALE_AFTER_MS = 15_000

export interface ApiAppOptions {
  dependencies: ApiDependencies
  rateLimiter?: MemoryRateLimiter
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url
  }
}

export function createApp(options: ApiAppOptions) {
  const { dependencies } = options
  const requestGuardConfig: RequestGuardConfig = dependencies.requestGuardConfig
  const rateLimitConfig: ApiRateLimitConfig = dependencies.rateLimitConfig
  const rateLimiter = options.rateLimiter ?? new MemoryRateLimiter()

  return new Elysia()
  .use(cors({
    origin: [...dependencies.allowedOrigins],
    credentials: true,
     allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Trace-ID'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  }))
  .onRequest((context) => {
    const { set } = context
    let { request } = context
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      set.headers[key] = value
    }
    const trace = beginRequestTrace(request)
    set.headers['x-request-id'] = trace.requestId

    const guardRejection = validateRequestGuards(request, requestGuardConfig, dependencies.allowedOrigins)
    if (guardRejection !== undefined) {
      set.status = guardRejection.status
      return requestErrorResponseBody(request, guardRejection.code, guardRejection.message, set, {
        ...(guardRejection.details !== undefined ? { details: guardRejection.details } : {}),
      })
    }

    const limitedRequest = wrapRequestBodyWithLimit(request, requestGuardConfig)
    if (limitedRequest !== request) {
      copyRequestTrace(request, limitedRequest)
      context.request = limitedRequest
      request = limitedRequest
    }

    const rule = rateLimitRule(request, rateLimitConfig)
    if (rule !== undefined) {
      const decision = rateLimiter.consume(
        `${clientIdentity(request, rateLimitConfig.trustProxy)}:${rule.bucket}`,
        rule.limit,
        60_000,
      )
      if (!decision.allowed) {
        set.status = 429
        set.headers['retry-after'] = String(decision.retryAfterSeconds)
        return requestErrorResponseBody(request, 'RATE_LIMITED', 'Too many requests; please retry later', set, {
          details: { retryAfterSeconds: decision.retryAfterSeconds },
        })
      }
    }
  })
  .onAfterResponse(({ request, set }) => {
    const trace = getRequestTrace(request)
    if (trace === undefined) return
    const status = typeof set.status === 'number' ? set.status : 200
    const durationMs = Date.now() - trace.startedAt
      accessLogger.info('request.completed', {
        requestId: trace.requestId,
        ...(typeof set.headers['x-trace-id'] === 'string' ? { traceId: set.headers['x-trace-id'] } : {}),
        method: request.method,
      path: safePath(request.url),
      status,
      durationMs,
    })
    appMetrics.increment('api.request', { method: request.method, status: String(status) })
    appMetrics.timing('api.request.duration', durationMs, { method: request.method, status: String(status) })
  })
  .onError(({ error, request, set }) => {
    // onError 直接定义在 app 上：Elysia 1.4 中命名插件的 onError 不会向上
    // 传播，因此必须写在这里才能捕获路由错误。
    set.status = httpStatusForError(error)
    const traceId = getRequestTrace(request)?.requestId
    if (traceId !== undefined) set.headers['x-trace-id'] = traceId
    // 每个失败请求都必须可排查：只靠 request.completed 的 status 无法知道
    // 具体错误。这里记录稳定错误码 + 短消息（不含 cause/provider 原文）。
    accessLogger.error('request.failed', {
      requestId: traceId,
      method: request.method,
      path: safePath(request.url),
      errorCode: stableErrorCode(error),
      message: errorMessage(error),
    })
    return errorResponseBody(error, traceId)
  })
  .use(modelRoutes)
  .use(createAuthRoutes(dependencies))
  .use(createGenerationRoutes(dependencies))
  .use(createGalleryRoutes(dependencies))
  .use(createPromptLibraryRoutes(dependencies))
  .use(createFeedbackRoutes(dependencies))
  .use(createShareRoutes(dependencies))
  .use(createArtifactRoutes(dependencies))
  .use(createAssetRoutes(dependencies))
  .use(createMediaRoutes(dependencies))
  .use(createUsageRoutes(dependencies))
  .use(createPointsRoutes(dependencies))
  .use(createAdminRoutes(dependencies))
  .get('/api/health/live', () => ({ success: true, data: { status: 'ok' } }))
  .get('/api/health/ready', async ({ set }) => {
    const checks: {
      database: 'ok' | 'failed'
      storage: 'ok' | 'failed'
      worker: 'ok' | 'failed' | 'unknown'
    } = {
      database: 'ok',
      storage: 'ok',
      worker: 'unknown',
    }

    try {
      const repository = dependencies.generationRepository
      if (repository.healthCheck === undefined) {
        throw new Error('Generation repository does not expose healthCheck')
      }
      await repository.healthCheck()
    } catch (error) {
      checks.database = 'failed'
      accessLogger.error('health.database_failed', { error: errorMessage(error) })
    }

    if (checks.database === 'ok') {
      try {
        const repository = dependencies.generationRepository
        if (repository.getWorkerHealth === undefined) {
          accessLogger.warn('health.worker_unavailable', { reason: 'repository_method_missing' })
        } else {
          const workerHealth = await repository.getWorkerHealth({ staleAfterMs: WORKER_HEARTBEAT_STALE_AFTER_MS })
          checks.worker = workerHealth.status === 'ok' ? 'ok' : 'failed'
        }
      } catch (error) {
        checks.worker = 'failed'
        accessLogger.error('health.worker_failed', { error: errorMessage(error) })
      }
    }

    try {
      if (dependencies.storage.healthCheck !== undefined) {
        await dependencies.storage.healthCheck()
      } else {
        // 让先于就绪探针出现的自定义适配器保持可用；
        // 生产适配器则执行真实的后端连通性检查。
        await dependencies.storage.createReadUrl({ key: 'health/ready', expiresInSeconds: 60 })
      }
    } catch (error) {
      checks.storage = 'failed'
      accessLogger.error('health.storage_failed', { error: errorMessage(error) })
    }

    const apiReady = checks.database === 'ok' && checks.storage === 'ok'
    const status = !apiReady ? 'not_ready' : checks.worker === 'ok' ? 'ok' : 'degraded'
    if (!apiReady) set.status = 503
    return { success: apiReady, data: { status, checks } }
  })
}

export type App = ReturnType<typeof createApp>

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 从领域错误中提取稳定的错误码；无 code 时回退为错误名或 unknown。 */
function stableErrorCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
    return error.code
  }
  return error instanceof Error ? error.name : 'unknown'
}
