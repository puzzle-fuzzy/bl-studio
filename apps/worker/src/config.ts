import { isValidDashScopeWorkspaceId } from '@bailian-studio/provider-dashscope'

export interface WorkerEnv {
  readonly databaseUrl: string
  readonly dashscopeApiKey: string
  readonly bailianWorkspaceId?: string
  readonly errorLocale: 'zh-CN' | 'en-US'
  readonly workerId: string
  readonly ffmpegPath?: string
  readonly workerPollIntervalMs?: number
  readonly workerIdleSleepMs?: number
  readonly workerLockDurationMs?: number
  readonly dashscopeRequestTimeoutMs?: number
  readonly generationSubmitTimeoutMs?: number
  readonly providerAsyncMaxDurationMs?: number
  readonly artifactPersistTimeoutMs?: number
  readonly artifactFetchMaxBytes?: number
  readonly artifactFetchTimeoutMs?: number
  readonly artifactFetchMaxRedirects?: number
  readonly artifactFetchAllowedHosts?: readonly string[]
  readonly workerLockHeartbeatMs?: number
  readonly workerHeartbeatIntervalMs?: number
  readonly workerStaleGenerationSweepIntervalMs?: number
}

type EnvironmentSource = Readonly<Record<string, string | undefined>>

/** 纯配置解析边界：启动入口只负责装配，环境变量校验可独立、无副作用地测试。 */
export function readWorkerEnv(
  source: EnvironmentSource = process.env,
  pid: number = process.pid,
): WorkerEnv {
  const databaseUrl = requiredValue(source['DATABASE_URL'], 'DATABASE_URL')
  const dashscopeApiKey = requiredValue(source['DASHSCOPE_API_KEY'], 'DASHSCOPE_API_KEY')
  if (optionalValue(source['NODE_ENV'])?.toLowerCase() === 'production') {
    validateProductionStorage(source)
  }
  const bailianWorkspaceId = optionalValue(source['BAILIAN_WORKSPACE_ID'])
  const localeValue = optionalValue(source['ERROR_LOCALE']) ?? 'zh-CN'
  const workerId = optionalValue(source['WORKER_ID']) ?? `worker-${pid}`
  const ffmpegPath = optionalValue(source['FFMPEG_PATH'])
  const workerPollIntervalMs = optionalPositiveInteger(source['WORKER_POLL_INTERVAL_MS'], 'WORKER_POLL_INTERVAL_MS')
  const workerIdleSleepMs = optionalPositiveInteger(source['WORKER_IDLE_SLEEP_MS'], 'WORKER_IDLE_SLEEP_MS')
  const workerLockDurationMs = optionalPositiveInteger(source['WORKER_LOCK_DURATION_MS'], 'WORKER_LOCK_DURATION_MS')
  const dashscopeRequestTimeoutMs = optionalPositiveInteger(source['DASHSCOPE_REQUEST_TIMEOUT_MS'], 'DASHSCOPE_REQUEST_TIMEOUT_MS')
  const generationSubmitTimeoutMs = optionalPositiveInteger(source['GENERATION_SUBMIT_TIMEOUT_MS'], 'GENERATION_SUBMIT_TIMEOUT_MS')
  const providerAsyncMaxDurationMs = optionalPositiveInteger(source['PROVIDER_ASYNC_MAX_DURATION_MS'], 'PROVIDER_ASYNC_MAX_DURATION_MS')
  const artifactPersistTimeoutMs = optionalPositiveInteger(source['ARTIFACT_PERSIST_TIMEOUT_MS'], 'ARTIFACT_PERSIST_TIMEOUT_MS')
  const artifactFetchMaxBytes = optionalPositiveInteger(source['ARTIFACT_FETCH_MAX_BYTES'], 'ARTIFACT_FETCH_MAX_BYTES')
  const artifactFetchTimeoutMs = optionalPositiveInteger(source['ARTIFACT_FETCH_TIMEOUT_MS'], 'ARTIFACT_FETCH_TIMEOUT_MS')
  const artifactFetchMaxRedirects = optionalNonNegativeInteger(source['ARTIFACT_FETCH_MAX_REDIRECTS'], 'ARTIFACT_FETCH_MAX_REDIRECTS')
  const artifactFetchAllowedHosts = optionalHostList(source['ARTIFACT_FETCH_ALLOWED_HOSTS'])
  const workerLockHeartbeatMs = optionalPositiveInteger(source['WORKER_LOCK_HEARTBEAT_MS'], 'WORKER_LOCK_HEARTBEAT_MS')
  const workerHeartbeatIntervalMs = optionalPositiveInteger(source['WORKER_HEARTBEAT_INTERVAL_MS'], 'WORKER_HEARTBEAT_INTERVAL_MS')
  const workerStaleGenerationSweepIntervalMs = optionalPositiveInteger(source['WORKER_STALE_GENERATION_SWEEP_INTERVAL_MS'], 'WORKER_STALE_GENERATION_SWEEP_INTERVAL_MS')

  if (localeValue !== 'zh-CN' && localeValue !== 'en-US') {
    throw configError(
      'ERROR_LOCALE 必须是 zh-CN 或 en-US',
      'ERROR_LOCALE must be zh-CN or en-US',
    )
  }
  if (bailianWorkspaceId !== undefined && !isValidDashScopeWorkspaceId(bailianWorkspaceId)) {
    throw configError(
      'BAILIAN_WORKSPACE_ID 只能包含英文字母、数字、连字符和下划线',
      'BAILIAN_WORKSPACE_ID may contain only letters, digits, hyphens, and underscores',
    )
  }

  return Object.freeze({
    databaseUrl,
    dashscopeApiKey,
    ...(bailianWorkspaceId === undefined ? {} : { bailianWorkspaceId }),
    errorLocale: localeValue,
    workerId,
    ...(ffmpegPath === undefined ? {} : { ffmpegPath }),
    ...(workerPollIntervalMs === undefined ? {} : { workerPollIntervalMs }),
    ...(workerIdleSleepMs === undefined ? {} : { workerIdleSleepMs }),
    ...(workerLockDurationMs === undefined ? {} : { workerLockDurationMs }),
    ...(dashscopeRequestTimeoutMs === undefined ? {} : { dashscopeRequestTimeoutMs }),
    ...(generationSubmitTimeoutMs === undefined ? {} : { generationSubmitTimeoutMs }),
    ...(providerAsyncMaxDurationMs === undefined ? {} : { providerAsyncMaxDurationMs }),
    ...(artifactPersistTimeoutMs === undefined ? {} : { artifactPersistTimeoutMs }),
    ...(artifactFetchMaxBytes === undefined ? {} : { artifactFetchMaxBytes }),
    ...(artifactFetchTimeoutMs === undefined ? {} : { artifactFetchTimeoutMs }),
    ...(artifactFetchMaxRedirects === undefined ? {} : { artifactFetchMaxRedirects }),
    ...(artifactFetchAllowedHosts === undefined ? {} : { artifactFetchAllowedHosts }),
    ...(workerLockHeartbeatMs === undefined ? {} : { workerLockHeartbeatMs }),
    ...(workerHeartbeatIntervalMs === undefined ? {} : { workerHeartbeatIntervalMs }),
    ...(workerStaleGenerationSweepIntervalMs === undefined ? {} : { workerStaleGenerationSweepIntervalMs }),
  })
}

function requiredValue(value: string | undefined, name: string): string {
  const normalized = optionalValue(value)
  if (normalized !== undefined) return normalized
  throw configError(`${name} 环境变量不能为空`, `${name} environment variable is required`)
}

function optionalValue(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized === undefined || normalized.length === 0 ? undefined : normalized
}

function optionalPositiveInteger(value: string | undefined, name: string): number | undefined {
  const normalized = optionalValue(value)
  if (normalized === undefined) return undefined
  if (!/^\d+$/.test(normalized)) {
    throw configError(`${name} 必须是正整数`, `${name} must be a positive integer`)
  }
  const parsed = Number(normalized)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw configError(`${name} 必须是正整数`, `${name} must be a positive integer`)
  }
  return parsed
}

function optionalNonNegativeInteger(value: string | undefined, name: string): number | undefined {
  const normalized = optionalValue(value)
  if (normalized === undefined) return undefined
  if (!/^\d+$/.test(normalized)) {
    throw configError(`${name} 必须是非负整数`, `${name} must be a non-negative integer`)
  }
  const parsed = Number(normalized)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw configError(`${name} 必须是非负整数`, `${name} must be a non-negative integer`)
  }
  return parsed
}

function optionalHostList(value: string | undefined): readonly string[] | undefined {
  const normalized = optionalValue(value)
  if (normalized === undefined) return undefined
  const hosts = [...new Set(normalized.split(',').map(item => item.trim().toLowerCase()).filter(Boolean))]
  if (hosts.length === 0 || hosts.some(host => !isValidHostname(host))) {
    throw configError(
      'ARTIFACT_FETCH_ALLOWED_HOSTS 必须包含主机名',
      'ARTIFACT_FETCH_ALLOWED_HOSTS must contain hostnames',
    )
  }
  return hosts
}

function isValidHostname(hostname: string): boolean {
  if (hostname.length === 0 || hostname.length > 253 || hostname.includes(':') || hostname.includes('/')) return false
  const labels = hostname.split('.')
  if (labels.length < 2) return false
  return labels.every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
}

function configError(zh: string, en: string): Error {
  return new Error(`${zh} / ${en}`)
}

function validateProductionStorage(source: EnvironmentSource): void {
  const required = ['OSS_REGION', 'OSS_BUCKET', 'OSS_ACCESS_KEY_ID', 'OSS_ACCESS_KEY_SECRET']
  if (required.some(name => optionalValue(source[name]) === undefined)) {
    throw configError(
      '生产环境必须完整配置 OSS 存储，禁止回退到本地文件系统',
      'Production requires complete OSS storage configuration; local fallback is disabled',
    )
  }
}
