/**
 * 启动期环境变量校验。在 app.listen 之前调用：缺失必需变量时立即抛错并给出明确提示，
 * 而不是把问题推迟到第一次请求（例如 AUTH_JWT_SECRET 缺失，原先只在首次 auth 请求
 * 触发签名时才暴露）。
 */
import { readGenerationLimits } from './limits'
import { assertProductionStorageConfigured } from '@bailian-studio/storage'
export interface ApiEnv {
  databaseUrl: string
  authJwtSecret: string
  authPublicWebOrigin: string
  host: string
  port: number
  generationDailyTaskLimit?: number
  generationDailyCostLimitCents?: number
}

type EnvironmentSource = Readonly<Record<string, string | undefined>>

export function readApiEnvOrThrow(source: EnvironmentSource = process.env): ApiEnv {
  const databaseUrl = source['DATABASE_URL']
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error('Missing required API environment variable: DATABASE_URL')
  }
  const authJwtSecret = source['AUTH_JWT_SECRET']
  if (authJwtSecret === undefined || authJwtSecret.length === 0) {
    throw new Error('Missing required API environment variable: AUTH_JWT_SECRET')
  }
  if (source['NODE_ENV']?.trim().toLowerCase() === 'production') {
    validateProductionEnvironment(source, authJwtSecret)
  }
  const limits = readGenerationLimits(source)
  return {
    databaseUrl,
    authJwtSecret,
    authPublicWebOrigin: source['AUTH_PUBLIC_WEB_ORIGIN']?.trim()
      || source['VITE_WEB_ORIGIN']?.trim()
      // P1-21：web dev server 实际跑在 5002（Vite），默认回退不能指向不存在的 5004。
      || 'http://localhost:5002',
    host: source['API_HOST']?.trim() || (source['NODE_ENV']?.trim().toLowerCase() === 'production' ? '0.0.0.0' : '127.0.0.1'),
    port: readPort(source['API_PORT']),
    ...(limits.dailyTaskLimit !== undefined ? { generationDailyTaskLimit: limits.dailyTaskLimit } : {}),
    ...(limits.dailyCostLimitCents !== undefined ? { generationDailyCostLimitCents: limits.dailyCostLimitCents } : {}),
  }
}

function readPort(value: string | undefined): number {
  const normalized = value?.trim()
  if (normalized === undefined || normalized.length === 0) return 5003
  if (!/^\d+$/.test(normalized)) throw new Error('API_PORT must be an integer between 1 and 65535')
  const port = Number(normalized)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('API_PORT must be an integer between 1 and 65535')
  }
  return port
}

function validateProductionEnvironment(source: EnvironmentSource, authJwtSecret: string): void {
  if (authJwtSecret === 'dev-secret-change-me' || authJwtSecret.length < 32) {
    throw new Error('Production API requires AUTH_JWT_SECRET with at least 32 characters')
  }

  if (source['COOKIE_SECURE']?.trim().toLowerCase() !== 'true') {
    throw new Error('Production API requires COOKIE_SECURE=true')
  }

  if (source['CSRF_REQUIRE_ORIGIN']?.trim().toLowerCase() !== 'true') {
    throw new Error('Production API requires CSRF_REQUIRE_ORIGIN=true')
  }

  if (source['API_RATE_LIMIT_ENABLED']?.trim().toLowerCase() === 'false') {
    throw new Error('Production API requires API_RATE_LIMIT_ENABLED=true')
  }

  if (source['API_TRUST_PROXY']?.trim().toLowerCase() !== 'true') {
    throw new Error('Production API requires API_TRUST_PROXY=true when running behind the managed proxy')
  }

  const authPublicWebOrigin = source['AUTH_PUBLIC_WEB_ORIGIN']?.trim()
  if (authPublicWebOrigin === undefined || !isSecurePublicOrigin(authPublicWebOrigin)) {
    throw new Error('Production API requires AUTH_PUBLIC_WEB_ORIGIN with an explicit HTTPS origin')
  }

  const smtpRequired = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM']
  if (smtpRequired.some(key => source[key]?.trim() === undefined || source[key]?.trim() === '')) {
    throw new Error('Production API requires complete SMTP configuration')
  }
  if (source['SMTP_SECURE']?.trim().toLowerCase() !== 'true') {
    throw new Error('Production API requires SMTP_SECURE=true')
  }

  const origins = source['CORS_ALLOWED_ORIGINS']
    ?.split(',')
    .map(origin => origin.trim())
    .filter(origin => origin.length > 0) ?? []
  if (origins.length === 0 || origins.includes('*') || origins.some(isLocalOrigin)) {
    throw new Error('Production API requires CORS_ALLOWED_ORIGINS with non-local explicit origins')
  }

  assertProductionStorageConfigured(source)
}

function isSecurePublicOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin)
    return parsed.protocol === 'https:'
      && parsed.origin === origin
      && !isLocalOrigin(origin)
  } catch {
    return false
  }
}

function isLocalOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname.toLowerCase()
    return host === 'localhost' || host === '127.0.0.1' || host === '::1'
  } catch {
    return true
  }
}
