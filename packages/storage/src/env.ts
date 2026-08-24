import { createLogger, type Logger } from '@bailian-studio/shared'
import { LocalStorageAdapter } from './local'
import { looksLikeForeignAbsolute, resolveArtifactLocalRoot } from './paths'
import { createOssClient, DEFAULT_OSS_RETRY_MAX, OssStorageAdapter } from './oss'
import type { StorageAdapter } from './types'

/** ali-oss 默认仅等待 60 秒；生产上传允许更大的对象和较慢的跨地域链路。 */
export const DEFAULT_OSS_TIMEOUT_MS = 180_000

export interface CreateStorageFromEnvOptions {
  env?: Record<string, string | undefined>
  logger?: Logger
}

/**
 * 根据环境变量创建存储适配器：OSS 四项凭据齐全时用 OssStorageAdapter，否则
 * 回退到 LocalStorageAdapter。
 *
 * 选择规则：
 *  - OSS_REGION / OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET 都非空
 *    → 使用 OSS；
 *  - 否则使用本地文件系统。若只配置了部分 OSS 项（疑似漏配），打一条告警；
 *  - 本地模式下，若 ARTIFACT_LOCAL_ROOT 看起来是"异平台绝对路径"
 *    （如 macOS 上配了 Windows 路径 G:\...），打一条非致命告警，避免它被静默地
 *    当成相对路径处理——这正是历史 bug 的形态。
 *
 * @param options.env    可注入的环境变量字典（默认 process.env，便于测试）
 * @param options.logger 可注入的日志器（默认 createLogger('storage')）
 */
export function createStorageFromEnv(options: CreateStorageFromEnvOptions = {}): StorageAdapter {
  const env = options.env ?? process.env
  const logger = options.logger ?? createLogger('storage')
  const region = nonEmpty(env['OSS_REGION'])
  const bucket = nonEmpty(env['OSS_BUCKET'])
  const accessKeyId = nonEmpty(env['OSS_ACCESS_KEY_ID'])
  const accessKeySecret = nonEmpty(env['OSS_ACCESS_KEY_SECRET'])
  // 只要环境里出现了任意一个 OSS 必填项，就认为使用者"本意是想用 OSS"，
  // 用于在凭据不全时给出"正在回退到本地存储"的提示。
  const hasAnyRequiredOssKey = [
    'OSS_REGION',
    'OSS_BUCKET',
    'OSS_ACCESS_KEY_ID',
    'OSS_ACCESS_KEY_SECRET',
  ].some(key => Object.hasOwn(env, key))

  const keyPrefix = env['OSS_KEY_PREFIX'] ?? 'bailian-studio'

  if (region !== undefined && bucket !== undefined && accessKeyId !== undefined && accessKeySecret !== undefined) {
    const timeoutMs = readOssTimeoutMs(env['OSS_TIMEOUT_MS'])
    return new OssStorageAdapter({
      client: createOssClient({
        region,
        bucket,
        accessKeyId,
        accessKeySecret,
        timeoutMs,
        retryMax: readOssRetryMax(env['OSS_RETRY_MAX']),
        ...(env['OSS_ENDPOINT'] !== undefined ? { endpoint: env['OSS_ENDPOINT'] } : {}),
      }),
      keyPrefix,
    })
  }

  if (env['NODE_ENV']?.trim().toLowerCase() === 'production') {
    throw new Error(
      'Production storage requires complete OSS configuration: OSS_REGION, OSS_BUCKET, OSS_ACCESS_KEY_ID, OSS_ACCESS_KEY_SECRET',
    )
  }

  if (hasAnyRequiredOssKey) {
    logger.warn('storage.oss_incomplete_using_local', {})
  }
  // 异平台路径告警：检测疑似从别的 OS 复制过来的绝对路径，提示配置可能错误。
  const configuredRoot = env['ARTIFACT_LOCAL_ROOT']
  if (configuredRoot !== undefined && configuredRoot.trim() !== '' && looksLikeForeignAbsolute(configuredRoot)) {
    logger.warn('storage.local_foreign_absolute_path', { value: configuredRoot })
  }
  return new LocalStorageAdapter({
    rootDir: resolveArtifactLocalRoot(env),
    publicBaseUrl: env['ARTIFACT_LOCAL_PUBLIC_BASE_URL'] ?? '/api/artifacts/local',
    keyPrefix,
  })
}

/** 去除首尾空白；去空白后为空则视为未设置（返回 undefined）。 */
function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === '' ? undefined : trimmed
}

function readOssTimeoutMs(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return DEFAULT_OSS_TIMEOUT_MS
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error('OSS_TIMEOUT_MS must be a positive integer in milliseconds')
  }
  return parsed
}

function readOssRetryMax(value: string | undefined): number {
  if (value === undefined || value.trim() === '') return DEFAULT_OSS_RETRY_MAX
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error('OSS_RETRY_MAX must be a non-negative integer')
  }
  return parsed
}
