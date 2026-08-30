/**
 * 发布前校验生产环境。
 *
 * 该命令刻意不发起任何网络调用，也绝不打印环境变量值。它会在 Docker/API/Worker
 * 启动前拦截占位凭据与不安全开关，而真实 provider、OSS、TLS 与数据库的检查
 * 则交给目标环境的 smoke checklist。
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSyncResult } from '@bailian-studio/shared/server'

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

  // 必填键：缺失或仍为模板占位值（change_me、example.com 等）都会判为 issue。
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

  const publicLaunch = value('PUBLIC_WEB_LAUNCH')?.toLowerCase()
  if (publicLaunch !== undefined && !['true', 'false'].includes(publicLaunch)) {
    addIssue('PUBLIC_WEB_LAUNCH', '只能是 true 或 false')
  }
  if (publicLaunch === 'true') {
    for (const key of ['VITE_LEGAL_ENTITY', 'VITE_LEGAL_EFFECTIVE_DATE'] as const) {
      const current = value(key)
      if (current === undefined || looksLikePlaceholder(current)) addIssue(key, 'PUBLIC_WEB_LAUNCH=true 时必须填写真实值')
    }
    const legalEmail = value('VITE_LEGAL_CONTACT_EMAIL')
    if (legalEmail === undefined || looksLikePlaceholder(legalEmail) || !isEmail(legalEmail)) {
      addIssue('VITE_LEGAL_CONTACT_EMAIL', 'PUBLIC_WEB_LAUNCH=true 时必须填写真实联系邮箱')
    }
  }

  for (const key of POSITIVE_INTEGER_KEYS) checkInteger(value(key), key, false, addIssue)
  checkInteger(value('SMTP_PORT'), 'SMTP_PORT', false, addIssue)
  for (const key of NON_NEGATIVE_INTEGER_KEYS) checkInteger(value(key), key, true, addIssue)

  // LOG_FORMAT 非必填（未设置时生产默认 json，兼容现状）：出现即校验取值，
  // 且生产环境明确禁止退回 console（会破坏日志采集字段化）。
  const logFormat = value('LOG_FORMAT')?.toLowerCase()
  if (logFormat !== undefined && logFormat !== 'json' && logFormat !== 'console') {
    addIssue('LOG_FORMAT', '只能是 json 或 console')
  }
  if (value('NODE_ENV') === 'production' && logFormat === 'console') {
    addIssue('LOG_FORMAT', '生产环境必须使用 json 格式')
  }

  return { issues, warnings }
}

/**
 * 校验生产环境中的基础设施配置（.env.prod）：Nginx/Postgres/Grafana/
 * 备份/部署参数。只做格式、占位与强度检查，不联网、不打印任何值。
 */
export function checkProductionInfrastructure(
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

  for (const key of ['SITE_DOMAIN', 'LOGS_DOMAIN'] as const) {
    const current = value(key)
    if (current === undefined || looksLikePlaceholder(current)) {
      addIssue(key, '不能为空或使用模板占位值')
    } else if (!isHostname(current)) {
      addIssue(key, '必须是合法主机名（不含 scheme、路径或端口）')
    }
  }

  const leEmail = value('LE_EMAIL')
  if (leEmail === undefined || looksLikePlaceholder(leEmail) || !isEmail(leEmail)) {
    addIssue('LE_EMAIL', '不能为空，且必须是合法邮箱（Let’s Encrypt 证书通知用）')
  }

  const grafanaAdminUser = value('GRAFANA_ADMIN_USER')
  if (grafanaAdminUser === undefined || looksLikePlaceholder(grafanaAdminUser)) {
    addIssue('GRAFANA_ADMIN_USER', '不能为空或使用模板占位值')
  }
  const grafanaPassword = value('GRAFANA_ADMIN_PASSWORD')
  if (grafanaPassword === undefined || looksLikePlaceholder(grafanaPassword)) {
    addIssue('GRAFANA_ADMIN_PASSWORD', '不能为空或使用模板占位值')
  } else if (grafanaPassword.length < 12) {
    addIssue('GRAFANA_ADMIN_PASSWORD', '长度至少需要 12 个字符')
  }

  for (const key of ['POSTGRES_USER', 'POSTGRES_DB'] as const) {
    const currentValue = value(key)
    if (currentValue === undefined || looksLikePlaceholder(currentValue)) {
      addIssue(key, '不能为空或使用模板占位值')
    }
  }
  const postgresPassword = value('POSTGRES_PASSWORD')
  if (postgresPassword === undefined || looksLikePlaceholder(postgresPassword)) {
    addIssue('POSTGRES_PASSWORD', '不能为空或使用模板占位值')
  } else if (postgresPassword.length < 12) {
    addIssue('POSTGRES_PASSWORD', '长度至少需要 12 个字符')
  }

  const backupDir = value('BACKUP_DIR')
  if (backupDir === undefined || looksLikePlaceholder(backupDir)) {
    addIssue('BACKUP_DIR', '不能为空或使用模板占位值')
  }
  for (const key of ['BACKUP_RETENTION_DAYS', 'LOKI_RETENTION_DAYS'] as const) {
    checkInteger(value(key), key, false, addIssue)
  }

  for (const key of ['MONITOR_INTERVAL_SECONDS', 'MONITOR_BACKUP_MAX_AGE_HOURS'] as const) {
    checkInteger(value(key), key, false, addIssue)
  }
  const diskThreshold = value('MONITOR_DISK_USED_PERCENT')
  checkInteger(diskThreshold, 'MONITOR_DISK_USED_PERCENT', false, addIssue)
  if (diskThreshold !== undefined && /^\d+$/.test(diskThreshold)) {
    const parsed = Number(diskThreshold)
    if (parsed > 100) addIssue('MONITOR_DISK_USED_PERCENT', '必须不大于 100')
  }
  const monitorAlertRequired = value('MONITOR_ALERT_REQUIRED')?.toLowerCase()
  if (monitorAlertRequired !== undefined && !['true', 'false'].includes(monitorAlertRequired)) {
    addIssue('MONITOR_ALERT_REQUIRED', '只能是 true 或 false')
  }
  const monitorAlertUrl = value('MONITOR_ALERT_WEBHOOK_URL')
  if (monitorAlertRequired === 'true' && monitorAlertUrl === undefined) {
    addIssue('MONITOR_ALERT_WEBHOOK_URL', 'MONITOR_ALERT_REQUIRED=true 时必须配置 HTTPS webhook')
  }
  if (monitorAlertUrl !== undefined && !monitorAlertUrl.startsWith('https://')) {
    addIssue('MONITOR_ALERT_WEBHOOK_URL', '生产告警 webhook 必须使用 HTTPS')
  }

  // P0-07：灾备必须显式选择，不能默默用默认值关掉 —— 默认 false 时备份与 DB 同宿主，
  // 整机故障即丢数据。要么开启 OSS 灾备，要么用 BACKUP_OSS_DISABLED_ACK=confirmed
  // 显式确认接受该风险，否则预检不过、无法部署。
  const backupOss = value('BACKUP_OSS_UPLOAD')?.toLowerCase()
  if (backupOss === undefined) {
    addIssue('BACKUP_OSS_UPLOAD', '必须显式设置为 true 或 false（省略会静默关闭 OSS 灾备）')
  } else if (backupOss !== 'true' && backupOss !== 'false') {
    addIssue('BACKUP_OSS_UPLOAD', '只能是 true 或 false')
  } else if (backupOss === 'false' && value('BACKUP_OSS_DISABLED_ACK') !== 'confirmed') {
    addIssue(
      'BACKUP_OSS_UPLOAD',
      'OSS 灾备已关闭：备份与 DB 在同一台宿主机磁盘，整机故障/误删卷时无恢复路径。' +
        '开启灾备（BACKUP_OSS_UPLOAD=true 且 .env.prod 具备完整 OSS 配置）或显式接受该风险' +
        '（BACKUP_OSS_DISABLED_ACK=confirmed）',
    )
  }

  const deployHost = value('DEPLOY_HOST')
  if (deployHost === undefined || looksLikePlaceholder(deployHost)) {
    addIssue('DEPLOY_HOST', '不能为空或使用模板占位值（格式 user@host）')
  }

  return { issues, warnings }
}

function isHostname(host: string): boolean {
  if (host.length === 0 || host.length > 253) return false
  return /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(host)
}

function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
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
    '待填写',
    '待定',
    'draft',
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
  // 子命令 `infra`：只校验统一生产 env 中的基础设施配置。
  if (process.argv[2] === 'infra') {
    const result = checkProductionInfrastructure()
    if (result.issues.length > 0) {
      console.error(formatProductionPreflightFailure(result))
      process.exitCode = 1
    } else {
      console.log('Production infrastructure preflight passed: infrastructure configuration is present and safe to start.')
      for (const warning of result.warnings) console.warn(`Warning: ${warning}`)
    }
  } else {
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
}
