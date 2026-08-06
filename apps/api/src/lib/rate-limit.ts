export interface RateLimitDecision {
  allowed: boolean
  retryAfterSeconds: number
}

interface WindowState {
  startedAt: number
  count: number
}

/**
 * 面向单实例 API 的轻量、进程内固定窗口限流器。
 *
 * 有意做成护栏而非分布式配额系统：它保护个人部署免受意外循环与基础滥用，
 * 而生成成本限额仍由 repository/数据库负责。
 */
export class MemoryRateLimiter {
  private readonly windows = new Map<string, WindowState>()

  constructor(private readonly maxEntries = 10_000) {}

  consume(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitDecision {
    if (limit <= 0) return { allowed: true, retryAfterSeconds: 0 }

    const current = this.windows.get(key)
    if (current === undefined || now - current.startedAt >= windowMs) {
      this.evictExpired(now, windowMs)
      this.windows.set(key, { startedAt: now, count: 1 })
      return { allowed: true, retryAfterSeconds: 0 }
    }

    if (current.count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((current.startedAt + windowMs - now) / 1000))
      return { allowed: false, retryAfterSeconds }
    }

    current.count += 1
    return { allowed: true, retryAfterSeconds: 0 }
  }

  reset(): void {
    this.windows.clear()
  }

  private evictExpired(now: number, windowMs: number): void {
    if (this.windows.size < this.maxEntries) return
    for (const [key, state] of this.windows) {
      if (now - state.startedAt >= windowMs) this.windows.delete(key)
    }
    if (this.windows.size < this.maxEntries) return

    const oldestKey = this.windows.keys().next().value
    if (typeof oldestKey === 'string') this.windows.delete(oldestKey)
  }
}

export interface ApiRateLimitConfig {
  enabled: boolean
  /** 仅在反向代理会重写转发头时，才信任这些头。 */
  trustProxy: boolean
  requestsPerMinute: number
  authRequestsPerMinute: number
  generationRequestsPerMinute: number
  uploadRequestsPerMinute: number
}

export function readApiRateLimitConfig(
  source: Readonly<Record<string, string | undefined>> = process.env,
): ApiRateLimitConfig {
  const production = source['NODE_ENV']?.trim().toLowerCase() === 'production'
  // 各桶默认配额（请求/分钟）。生产更严格：auth 10 防爆破、generation 30 防刷量、
  // upload 10 防存储滥用、write 120 兜底；开发放宽便于本地联调。单实例进程内
  // 限流，多副本水平扩展前需换 Redis/网关（见 docs）。
  const defaults = production
    ? { requests: 120, auth: 10, generation: 30, upload: 10 }
    : { requests: 600, auth: 30, generation: 120, upload: 30 }

  return {
    enabled: source['API_RATE_LIMIT_ENABLED']?.trim().toLowerCase() !== 'false',
    trustProxy: booleanValue(source['API_TRUST_PROXY'], false, 'API_TRUST_PROXY'),
    requestsPerMinute: positiveInteger(source['API_RATE_LIMIT_REQUESTS_PER_MINUTE'], defaults.requests, 'API_RATE_LIMIT_REQUESTS_PER_MINUTE'),
    authRequestsPerMinute: positiveInteger(source['API_RATE_LIMIT_AUTH_PER_MINUTE'], defaults.auth, 'API_RATE_LIMIT_AUTH_PER_MINUTE'),
    generationRequestsPerMinute: positiveInteger(source['API_RATE_LIMIT_GENERATIONS_PER_MINUTE'], defaults.generation, 'API_RATE_LIMIT_GENERATIONS_PER_MINUTE'),
    uploadRequestsPerMinute: positiveInteger(source['API_RATE_LIMIT_UPLOADS_PER_MINUTE'], defaults.upload, 'API_RATE_LIMIT_UPLOADS_PER_MINUTE'),
  }
}

function booleanValue(value: string | undefined, fallback: boolean, name: string): boolean {
  const normalized = value?.trim().toLowerCase()
  if (normalized === undefined || normalized.length === 0) return fallback
  if (normalized === 'true' || normalized === '1') return true
  if (normalized === 'false' || normalized === '0') return false
  throw new Error(`${name} must be true/false or 1/0 / ${name} 必须是 true/false 或 1/0`)
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const normalized = value?.trim()
  if (normalized === undefined || normalized.length === 0) return fallback
  const parsed = Number(normalized)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer / ${name} 必须是正整数`)
  }
  return parsed
}

export function clientIdentity(request: Request, trustProxy = false): string {
  if (!trustProxy) return 'local-client'
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (forwarded !== undefined && forwarded.length > 0) return forwarded
  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp !== undefined && realIp.length > 0) return realIp
  return 'local-client'
}

export function rateLimitRule(
  request: Request,
  config: ApiRateLimitConfig,
): { bucket: string; limit: number } | undefined {
  if (!config.enabled || !isUnsafeMethod(request.method)) return undefined

  const pathname = new URL(request.url).pathname
  if (!pathname.startsWith('/api/')) return undefined
  // 社区写端点豁免限流（有意偏离标准实践：内部工具、无真实用户）。
  // 如需重新启用限流，删除以下豁免分支即可（auth/generation/upload/write 桶仍生效）。
  if (isCommunityPath(pathname)) return undefined
  if (pathname.startsWith('/api/auth/')) {
    return { bucket: 'auth', limit: config.authRequestsPerMinute }
  }
  if (request.method === 'POST' && pathname === '/api/generations') {
    return { bucket: 'generation', limit: config.generationRequestsPerMinute }
  }
  if (request.method === 'POST' && pathname === '/api/assets/upload') {
    return { bucket: 'upload', limit: config.uploadRequestsPerMinute }
  }
  return { bucket: 'write', limit: config.requestsPerMinute }
}

/** 社区用户写端点（画廊互动 / 提示词库 / 反馈通道）不参与进程内限流。 */
function isCommunityPath(pathname: string): boolean {
  return pathname === '/api/gallery'
    || pathname.startsWith('/api/gallery/')
    || pathname === '/api/prompt-library'
    || pathname.startsWith('/api/prompt-library/')
    || pathname === '/api/feedback'
    || pathname.startsWith('/api/feedback/')
}

export function isUnsafeMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE'
}
