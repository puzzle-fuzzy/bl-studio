import { chmod, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type EnvironmentSource = Readonly<Record<string, string | undefined>>

const repositoryRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const defaultBackupPrefix = 'bailian-studio/backups'

/**
 * 只解析简单 dotenv 键值，不执行 shell 表达式。生产 env 文件中的引号值会被
 * 解码后再按安全规则写回，避免把应用机密原样扩散到 backup 容器。
 */
export function parseDotenv(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const line of text.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(trimmed)
    if (match === null) continue

    const key = match[1]
    const rawValue = match[2]
    if (key === undefined || rawValue === undefined) continue
    result[key] = decodeDotenvValue(rawValue.trim())
  }
  return result
}

/**
 * 从应用 env 和基础设施 env 投影备份服务所需的最小变量集合。
 */
export function buildBackupEnvironment(
  appEnv: EnvironmentSource,
  infraEnv: EnvironmentSource,
): Record<string, string> {
  const backupUpload = infraEnv['BACKUP_OSS_UPLOAD']?.trim().toLowerCase()
  if (backupUpload !== 'true' && backupUpload !== 'false') {
    throw new Error('BACKUP_OSS_UPLOAD must be explicitly set to true or false')
  }

  if (backupUpload === 'false') {
    if (infraEnv['BACKUP_OSS_DISABLED_ACK']?.trim() !== 'confirmed') {
      throw new Error('BACKUP_OSS_DISABLED_ACK=confirmed is required when OSS backup is disabled')
    }
    return { BACKUP_OSS_UPLOAD: 'false' }
  }

  const required = (key: string): string => {
    const value = appEnv[key]?.trim()
    if (value === undefined || value.length === 0) throw new Error(`missing ${key} in .env.production`)
    return value
  }

  const result: Record<string, string> = {
    BACKUP_OSS_UPLOAD: 'true',
    OSS_REGION: required('OSS_REGION'),
    OSS_BUCKET: required('OSS_BUCKET'),
    OSS_ACCESS_KEY_ID: required('OSS_ACCESS_KEY_ID'),
    OSS_ACCESS_KEY_SECRET: required('OSS_ACCESS_KEY_SECRET'),
    BACKUP_OSS_PREFIX: normalizePrefix(infraEnv['BACKUP_OSS_PREFIX'] ?? defaultBackupPrefix),
  }
  const endpoint = appEnv['OSS_ENDPOINT']?.trim()
  if (endpoint !== undefined && endpoint.length > 0) result.OSS_ENDPOINT = endpoint
  return result
}

/** 将备份变量写为稳定、dotenv-safe 的内容；调用方负责写入并收紧权限。 */
export function renderBackupEnvironment(environment: EnvironmentSource): string {
  return `${Object.entries(environment)
    .map(([key, value]) => `${key}=${encodeDotenvValue(value ?? '')}`)
    .join('\n')}\n`
}

export async function prepareBackupEnvironment(
  appEnvPath = resolve(repositoryRoot, 'infra/env/.env.production'),
  infraEnvPath = resolve(repositoryRoot, 'infra/env/.env.prod-infra'),
  targetPath = resolve(repositoryRoot, 'infra/env/.env.prod-backup'),
): Promise<void> {
  const [appText, infraText] = await Promise.all([
    readFile(appEnvPath, 'utf8'),
    readFile(infraEnvPath, 'utf8'),
  ])
  const backupEnvironment = buildBackupEnvironment(parseDotenv(appText), parseDotenv(infraText))
  await writeFile(targetPath, renderBackupEnvironment(backupEnvironment), { mode: 0o600 })
  await chmod(targetPath, 0o600)
}

function normalizePrefix(value: string): string {
  const normalized = value.trim().replace(/^\/+|\/+$/gu, '')
  return normalized.length === 0 ? defaultBackupPrefix : normalized
}

function decodeDotenvValue(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      const decoded: unknown = JSON.parse(value)
      return typeof decoded === 'string' ? decoded : value
    } catch {
      return value.slice(1, -1)
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1)
  return value
}

function encodeDotenvValue(value: string): string {
  return /^[A-Za-z0-9_./:@%+=,-]+$/u.test(value) ? value : JSON.stringify(value)
}

if (import.meta.main) {
  await prepareBackupEnvironment()
  console.log('Backup environment prepared.')
}
