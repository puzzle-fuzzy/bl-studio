import { stat } from 'node:fs/promises'
import { basename } from 'node:path'

export interface OssUploadClient {
  put(key: string, filePath: string): Promise<unknown>
}

interface BackupOssConfig {
  readonly region: string
  readonly bucket: string
  readonly accessKeyId: string
  readonly accessKeySecret: string
  readonly endpoint: string | undefined
  readonly prefix: string
}

/**
 * 为备份文件生成稳定的 OSS object key。路径只允许来自 basename，避免本地路径
 * 或调用参数把对象写到备份前缀之外。
 */
export function buildBackupObjectKey(filePath: string, prefix = 'bailian-studio/backups'): string {
  const fileName = basename(filePath)
  if (fileName.length === 0 || fileName === '.' || fileName === '..') {
    throw new Error('backup file name is required')
  }
  const normalizedPrefix = prefix.trim().replace(/^\/+|\/+$/g, '')
  return normalizedPrefix.length === 0 ? fileName : `${normalizedPrefix}/${fileName}`
}

/**
 * 上传一个已完成 gzip 校验的备份文件。客户端可注入，便于在不触碰真实 OSS 的
 * 情况下覆盖上传 key、文件路径和失败边界。
 */
export async function uploadBackupFile(
  filePath: string,
  env: Readonly<Record<string, string | undefined>>,
  client?: OssUploadClient,
): Promise<{ key: string }> {
  const config = readBackupOssConfig(env)
  const file = await stat(filePath)
  if (!file.isFile()) throw new Error('backup file must be a regular file')

  const key = buildBackupObjectKey(filePath, config.prefix)
  const uploader = client ?? await createOssUploadClient(config)
  await uploader.put(key, filePath)
  return { key }
}

function readBackupOssConfig(env: Readonly<Record<string, string | undefined>>): BackupOssConfig {
  const required = (key: string): string => {
    const value = env[key]?.trim()
    if (value === undefined || value.length === 0) throw new Error(`missing ${key}`)
    return value
  }

  return {
    region: required('OSS_REGION'),
    bucket: required('OSS_BUCKET'),
    accessKeyId: required('OSS_ACCESS_KEY_ID'),
    accessKeySecret: required('OSS_ACCESS_KEY_SECRET'),
    endpoint: env['OSS_ENDPOINT']?.trim() || undefined,
    prefix: env['BACKUP_OSS_PREFIX']?.trim() || 'bailian-studio/backups',
  }
}

async function createOssUploadClient(config: BackupOssConfig): Promise<OssUploadClient> {
  // ali-oss is intentionally installed only in the dedicated backup image, not in the
  // root deployment-script dependency graph or the API/Worker runtime image.
  // @ts-expect-error ali-oss is bundled only in the dedicated backup image.
  const module = await import('ali-oss') as unknown as {
    readonly default: new (options: Record<string, unknown>) => unknown
  }
  return new module.default({
    region: config.region,
    bucket: config.bucket,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    authorizationV4: true,
    ...(config.endpoint !== undefined ? { endpoint: config.endpoint } : {}),
  }) as unknown as OssUploadClient
}

async function main(): Promise<void> {
  const filePath = process.argv[2]
  if (filePath === undefined || filePath.length === 0) {
    console.error('[backup] OSS 上传失败：缺少备份文件路径')
    process.exitCode = 1
    return
  }

  try {
    const result = await uploadBackupFile(filePath, process.env)
    console.log(`[backup] 已上传 OSS: ${result.key}`)
  } catch {
    // 供应商异常可能包含 endpoint 或请求细节；备份日志只需要可行动的稳定错误。
    console.error('[backup] OSS 上传失败（检查 OSS 配置、CLI 权限与 bucket）')
    process.exitCode = 1
  }
}

if (import.meta.main) await main()
