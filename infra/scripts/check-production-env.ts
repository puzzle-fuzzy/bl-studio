/**
 * Validate the production environment before a release.
 *
 * This command intentionally performs no network calls and never prints
 * environment values. It catches placeholder credentials and unsafe flags
 * before Docker/API/Worker startup, while leaving real provider, OSS, TLS and
 * database checks to the target-environment smoke checklist.
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSyncResult } from '@bailian-studio/shared'

export interface ProductionPreflightIssue {
  readonly key: string
  readonly message: string
}

export interface ProductionPreflightResult {
  readonly issues: readonly ProductionPreflightIssue[]
  readonly warnings: readonly string[]
}

export interface ProductionReleaseSourceState {
  readonly headSha: string | undefined
  readonly worktreeClean: boolean | undefined
}

type EnvironmentSource = Readonly<Record<string, string | undefined>>

const repositoryRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const fullGitShaPattern = /^[0-9a-f]{40}$/

const REQUIRED_NON_EMPTY_KEYS = [
  'BAILIAN_STUDIO_RELEASE_TAG',
  'DATABASE_URL',
  'DASHSCOPE_API_KEY',
  'AUTH_JWT_SECRET',
  'AUTH_PUBLIC_WEB_ORIGIN',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'OSS_REGION',
  'OSS_BUCKET',
  'OSS_ACCESS_KEY_ID',
  'OSS_ACCESS_KEY_SECRET',
] as const

const POSITIVE_INTEGER_KEYS = [
  'MEDIA_MAX_DURATION_SECONDS',
  'API_MAX_JSON_BODY_BYTES',
  'API_MAX_MULTIPART_BODY_BYTES',
  'API_MAX_OTHER_BODY_BYTES',
] as const

const NON_NEGATIVE_INTEGER_KEYS = [
  'GENERATION_DAILY_TASK_LIMIT',
  'GENERATION_DAILY_COST_LIMIT_CENTS',
] as const

export function checkProductionEnvironment(
  source: EnvironmentSource = process.env,
): ProductionPreflightResult {
  const issues: ProductionPreflightIssue[] = []
  const warnings: string[] = []
  const value = (key: string): string | undefined => {
    const normalized = source[key]?.trim()
    return normalized === undefined || normalized.length === 0 ? undefined : normalized
  }
  const addIssue = (key: string, message: string): void => {
    issues.push({ key, message })
  }

  if (value('NODE_ENV') !== 'production') {
    addIssue('NODE_ENV', '必须明确设置为 production')
  }

  for (const key of REQUIRED_NON_EMPTY_KEYS) {
    const current = value(key)
    if (current === undefined) {
      addIssue(key, '不能为空')
    } else if (looksLikePlaceholder(current)) {
      addIssue(key, '仍然是模板占位值')
    }
  }

  const authJwtSecret = value('AUTH_JWT_SECRET')
  if (authJwtSecret !== undefined && !looksLikePlaceholder(authJwtSecret) && authJwtSecret.length < 32) {
    addIssue('AUTH_JWT_SECRET', '长度至少需要 32 个字符')
  }

  const releaseTag = value('BAILIAN_STUDIO_RELEASE_TAG')
  if (releaseTag !== undefined && !looksLikePlaceholder(releaseTag) && !fullGitShaPattern.test(releaseTag)) {
    addIssue('BAILIAN_STUDIO_RELEASE_TAG', '必须是 40 位小写 Git commit SHA，不接受可变标签、分支名或短 SHA')
  }

  const databaseUrl = value('DATABASE_URL')
  if (databaseUrl !== undefined && !isPostgresUrl(databaseUrl)) {
    addIssue('DATABASE_URL', '必须是有效的 postgres:// 或 postgresql:// URL')
  }

  for (const key of ['COOKIE_SECURE', 'CSRF_REQUIRE_ORIGIN', 'API_RATE_LIMIT_ENABLED', 'SMTP_SECURE'] as const) {
    if (value(key)?.toLowerCase() !== 'true') {
      addIssue(key, '生产环境必须设置为 true')
    }
  }

  const corsOrigins = value('CORS_ALLOWED_ORIGINS')?.split(',').map(origin => origin.trim()).filter(Boolean) ?? []
  if (corsOrigins.length === 0) {
    addIssue('CORS_ALLOWED_ORIGINS', '至少需要一个明确的非本地 Origin')
  } else {
    for (const origin of corsOrigins) {
      const parsed = parseOrigin(origin)
      if (parsed === undefined || isLocalHostname(parsed.hostname) || parsed.origin !== origin) {
        addIssue('CORS_ALLOWED_ORIGINS', '只能包含有效的非本地 Origin，且不能包含路径、通配符或模板值')
        continue
      }
      if (parsed.protocol !== 'https:') {
        warnings.push('CORS_ALLOWED_ORIGINS 含有非 HTTPS Origin；正式公网入口应通过 TLS 提供服务')
      }
    }
  }

  checkOrigin(value('VITE_WEB_ORIGIN'), 'VITE_WEB_ORIGIN', true, false, addIssue, warnings)
  checkOrigin(value('AUTH_PUBLIC_WEB_ORIGIN'), 'AUTH_PUBLIC_WEB_ORIGIN', true, true, addIssue, warnings)
  const apiOrigin = value('VITE_API_ORIGIN')
  if (apiOrigin !== undefined) checkOrigin(apiOrigin, 'VITE_API_ORIGIN', false, false, addIssue, warnings)

  for (const key of POSITIVE_INTEGER_KEYS) checkInteger(value(key), key, false, addIssue)
  checkInteger(value('SMTP_PORT'), 'SMTP_PORT', false, addIssue)
  for (const key of NON_NEGATIVE_INTEGER_KEYS) checkInteger(value(key), key, true, addIssue)

  return { issues, warnings }
}

export function checkProductionReleaseSource(
  source: EnvironmentSource,
  state: ProductionReleaseSourceState,
): readonly ProductionPreflightIssue[] {
  const issues: ProductionPreflightIssue[] = []
  const releaseTag = source['BAILIAN_STUDIO_RELEASE_TAG']?.trim()
  const headSha = state.headSha?.trim().toLowerCase()

  if (headSha === undefined || !fullGitShaPattern.test(headSha)) {
    issues.push({ key: 'GIT_HEAD', message: '无法确认当前源码对应的完整 Git commit SHA' })
  }
  if (state.worktreeClean !== true) {
    issues.push({ key: 'GIT_WORKTREE', message: '生产镜像只能从无未提交改动的干净工作区构建' })
  }
  if (
    releaseTag !== undefined
    && fullGitShaPattern.test(releaseTag)
    && headSha !== undefined
    && fullGitShaPattern.test(headSha)
    && releaseTag !== headSha
  ) {
    issues.push({ key: 'BAILIAN_STUDIO_RELEASE_TAG', message: '必须与当前检出的 Git commit 完全一致' })
  }

  return issues
}

export function formatProductionPreflightFailure(result: ProductionPreflightResult): string {
  const lines = ['Production environment preflight failed:']
  for (const issue of result.issues) lines.push(`- ${issue.key}: ${issue.message}`)
  if (result.warnings.length > 0) {
    lines.push('Warnings:')
    for (const warning of result.warnings) lines.push(`- ${warning}`)
  }
  return lines.join('\n')
}

function checkInteger(
  current: string | undefined,
  key: string,
  allowZero: boolean,
  addIssue: (key: string, message: string) => void,
): void {
  if (current === undefined) return
  if (!/^\d+$/.test(current)) {
    addIssue(key, allowZero ? '必须是非负整数' : '必须是正整数')
    return
  }
  const parsed = Number(current)
  if (!Number.isSafeInteger(parsed) || (!allowZero && parsed <= 0)) {
    addIssue(key, allowZero ? '必须是非负整数' : '必须是正整数')
  }
}

function checkOrigin(
  current: string | undefined,
  key: string,
  required: boolean,
  requireHttps: boolean,
  addIssue: (key: string, message: string) => void,
  warnings: string[],
): void {
  if (current === undefined) {
    if (required) addIssue(key, '必须配置正式 Web Origin')
    return
  }
  const parsed = parseOrigin(current)
  if (parsed === undefined || isLocalHostname(parsed.hostname) || parsed.origin !== current) {
    addIssue(key, '必须是有效的非本地 Origin，且不能是模板值或包含路径')
    return
  }
  if (parsed.protocol !== 'https:') {
    if (requireHttps) {
      addIssue(key, '生产环境必须使用 HTTPS Origin')
    } else {
      warnings.push(`${key} 使用 HTTP；正式公网入口应通过 TLS 提供服务`)
    }
  }
}

function parseOrigin(value: string): URL | undefined {
  if (value === '*' || looksLikePlaceholder(value)) return undefined
  try {
    const parsed = new URL(value)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return undefined
    return parsed
  } catch {
    return undefined
  }
}

function isPostgresUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return ['postgres:', 'postgresql:'].includes(parsed.protocol) && parsed.hostname.length > 0
  } catch {
    return false
  }
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1'
}

function looksLikePlaceholder(value: string): boolean {
  const normalized = value.toLowerCase()
  return [
    'change_me',
    'change-me',
    'replace-with',
    'your-domain',
    'example.com',
    'example.internal',
    'dev-secret-change-me',
  ].some(marker => normalized.includes(marker))
}

function inspectProductionReleaseSource(): ProductionReleaseSourceState {
  const head = spawnSyncResult(['git', 'rev-parse', 'HEAD'], {
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'ignore',
  })
  const status = spawnSyncResult(['git', 'status', '--porcelain', '--untracked-files=normal'], {
    cwd: repositoryRoot,
    stdout: 'pipe',
    stderr: 'ignore',
  })

  return {
    headSha: head.status === 0 ? head.stdout.trim() : undefined,
    worktreeClean: status.status === 0
      ? status.stdout.trim().length === 0
      : undefined,
  }
}

if (import.meta.main) {
  const environmentResult = checkProductionEnvironment()
  const result: ProductionPreflightResult = {
    issues: [
      ...environmentResult.issues,
      ...checkProductionReleaseSource(process.env, inspectProductionReleaseSource()),
    ],
    warnings: environmentResult.warnings,
  }
  if (result.issues.length > 0) {
    console.error(formatProductionPreflightFailure(result))
    process.exitCode = 1
  } else {
    console.log('Production environment preflight passed: required configuration is present and safe to start.')
    for (const warning of result.warnings) console.warn(`Warning: ${warning}`)
  }
}
