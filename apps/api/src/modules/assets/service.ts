/**
 * 资产业务逻辑：MIME/大小校验、kind 推断、扩展名映射，以及上传/导入的编排
 * （写存储 + 落 user_assets）。从路由里抽出来，让路由只做 HTTP 适配。
 *
 * 输入校验失败时抛 @bailian-studio/shared 的 ValidationError，由全局 onError 统一映射为 400。
 */
import { z } from 'zod'
import type {
  CreateUserAssetInput,
  GenerationRepository,
  UnifiedAssetItem,
} from '@bailian-studio/generation-repository'
import type { StorageAdapter } from '@bailian-studio/storage'
import { ValidationError } from '@bailian-studio/shared'
import type { AssetConfig } from '../../lib/asset-config'
import { assertFileMatchesMime } from '../../lib/file-sniff'
import { probeMediaDuration } from './media-metadata'

export type AssetKind = 'image' | 'video' | 'audio' | 'text' | 'archive'
export type AssetSource = 'upload' | 'link' | 'generation' | 'derived'

/**
 * 仅当当前适配器拥有该存储对象时才返回物理 key。
 * 其他 provider 的 key 绝不能被本进程签名。
 */
export function assetDownloadStorageKey(
  item: Pick<UnifiedAssetItem, 'storageKey' | 'storageProvider'>,
  storage: Pick<StorageAdapter, 'provider'>,
): string | undefined {
  return item.storageKey !== undefined && item.storageKey.length > 0 && item.storageProvider === storage.provider
    ? item.storageKey
    : undefined
}

const ASSET_KINDS: readonly AssetKind[] = ['image', 'video', 'audio', 'text', 'archive']

function isAssetKind(value: string): value is AssetKind {
  return (ASSET_KINDS as readonly string[]).includes(value)
}

/** MIME 类型白名单——只允许上传这些类型的文件。 */
export const ALLOWED_MIME_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/webp',
  'audio/wav', 'audio/mpeg', 'audio/ogg', 'audio/mp4',
  'video/mp4', 'video/webm',
  'text/plain', 'application/json',
])

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
  'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a',
  'video/mp4': 'mp4', 'video/webm': 'webm',
  'text/plain': 'txt', 'application/json': 'json',
}

export function mimeToKind(mime: string): AssetKind {
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('text/') || mime === 'application/json') return 'text'
  return 'archive'
}

export function extForMime(mime: string): string {
  return MIME_TO_EXT[mime] ?? 'bin'
}

export interface AssetUploadResult {
  id: string
  kind: AssetKind
  source: 'upload'
  /** 访问 URL；某些存储适配器可能不返回公开 URL（此时为 undefined）。 */
  url: string | undefined
  mimeType: string
  byteSize: number
  durationSeconds?: number
  fileName: string
  createdAt: string
}

/**
 * 处理文件上传：校验 MIME/大小 → 写存储 → 落 user_assets。
 * 校验失败抛 ValidationError（→ 400）。
 */
export async function uploadAsset(args: {
  file: File
  userId: string
  kindParam: string | File | null
  storage: StorageAdapter
  repository: GenerationRepository
  config: AssetConfig
  /** 测试接缝；生产环境使用基于本地 ffprobe 的探测。 */
  probeMediaDuration?: (file: File) => Promise<number>
}): Promise<AssetUploadResult> {
  const { file, userId, kindParam, storage, repository, config } = args

  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new ValidationError(`Unsupported file type: ${file.type}`, 'file')
  }
  if (file.size > config.maxAssetSizeBytes) {
    throw new ValidationError(`File exceeds maximum size of ${config.maxAssetSizeBytes} bytes`, 'file')
  }

  // P1-16：先做魔数校验（只读前 64 字节），媒体类型与声明不符直接拒绝，
  // 避免伪装的 Content-Type 进入存储，也为后续 ffprobe/写盘省掉白读。
  await assertFileMatchesMime(file)

  const durationSeconds = isMediaMimeType(file.type)
    ? await readAndValidateMediaDuration(file, config, args.probeMediaDuration)
    : undefined

  const mimeType = file.type
  const kindParamText = kindParam instanceof File ? '' : (kindParam ?? '')
  const kind: AssetKind = isAssetKind(kindParamText) ? kindParamText : mimeToKind(mimeType)
  const ext = extForMime(mimeType)
  const uuid = crypto.randomUUID()
  const key = `user_uploads/${userId}/${uuid}.${ext}`

  // P1-16：适配器支持流式时直接 pipeTo（大上传不整块载入内存），并传入准确长度，
  // 让 OSS 适配器避免 chunked PUT；否则退化缓冲写。
  const stored = storage.writeObjectMultipart !== undefined
    ? await storage.writeObjectMultipart({
        key,
        file,
        contentType: mimeType,
        byteSize: file.size,
      })
    : storage.writeObjectStream !== undefined
    ? await storage.writeObjectStream({
        key,
        stream: file.stream(),
        contentType: mimeType,
        contentLength: file.size,
      })
    : await storage.writeObject({ key, body: Buffer.from(await file.arrayBuffer()), contentType: mimeType })

  const assetId = `asset_${uuid.replace(/-/g, '').slice(0, 32)}`
  const input: CreateUserAssetInput = {
    id: assetId,
    userId,
    kind,
    source: 'upload',
    fileName: file.name,
    mimeType,
    byteSize: file.size,
    storageProvider: stored.provider,
    storageKey: stored.key,
    storageUrl: stored.url,
    enqueueThumbnail: stored.provider === 'local' && (kind === 'image' || kind === 'video'),
    ...(durationSeconds !== undefined ? { metadata: { durationSeconds } } : {}),
  }
  try {
    await repository.createUserAsset(input)
  } catch (error) {
    // 存储是外部副作用。当持久化的资产行无法提交时，删除该对象，
    // 否则重试会泄漏孤儿 blob。
    if (storage.deleteObject !== undefined) {
      try {
        await storage.deleteObject({ key: stored.key })
      } catch {
        // 保留原始 DB 错误；孤儿清理可交给后续的存储巡检任务统一处理，
        // 无需掩盖本次上传失败。
      }
    }
    throw error
  }
  const readUrl = await storage.createReadUrl({ key: stored.key, expiresInSeconds: 3600 })

  return {
    id: assetId,
    kind,
    source: 'upload',
    url: readUrl,
    mimeType,
    byteSize: file.size,
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    fileName: file.name,
    createdAt: new Date().toISOString(),
  }
}

async function readAndValidateMediaDuration(
  file: File,
  config: AssetConfig,
  injectedProbe?: (file: File) => Promise<number>,
): Promise<number> {
  let durationSeconds: number
  try {
    durationSeconds = await (injectedProbe === undefined
      ? probeMediaDuration(file, { ffprobePath: config.ffprobePath })
      : injectedProbe(file))
  } catch (error) {
    throw new ValidationError(error instanceof Error ? error.message : String(error), 'file')
  }

  const maxSeconds = config.maxMediaDurationSeconds
  if (maxSeconds !== undefined && durationSeconds > maxSeconds) {
    throw new ValidationError(
      `媒体时长 ${(durationSeconds / 60).toFixed(1)} 分钟超过限制 ${(maxSeconds / 60).toFixed(1)} 分钟`,
      'file',
    )
  }
  return durationSeconds
}

function isMediaMimeType(mimeType: string): boolean {
  return mimeType.startsWith('audio/') || mimeType.startsWith('video/')
}

export const ImportAssetSchema = z.object({
  url: z.string().url(),
  kind: z.enum(['image', 'video', 'audio', 'text', 'archive']),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export interface AssetImportResult {
  id: string
  kind: AssetKind
  source: 'link'
  url: string
  createdAt: string
}

/** 处理 URL 导入：仅记录链接元数据，不下载内容。 */
export async function importAsset(args: {
  input: z.infer<typeof ImportAssetSchema>
  userId: string
  repository: GenerationRepository
}): Promise<AssetImportResult> {
  const { input, userId, repository } = args
  const protocol = new URL(input.url).protocol
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new ValidationError('Only http(s) asset URLs are supported', 'url')
  }
  const uuid = crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  const assetId = `asset_${uuid}`
  await repository.createUserAsset({
    id: assetId,
    userId,
    kind: input.kind,
    source: 'link',
    originalUrl: input.url,
    enqueueThumbnail: input.kind === 'image' || input.kind === 'video',
    ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
  })
  return {
    id: assetId,
    kind: input.kind,
    source: 'link',
    url: input.url,
    createdAt: new Date().toISOString(),
  }
}

export const ListAssetsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().optional(),
  kind: z.enum(['image', 'video', 'audio', 'text', 'archive']).optional(),
  source: z.enum(['upload', 'link', 'generation', 'derived']).optional(),
  q: z.string().trim().max(120).optional(),
  sort: z.enum(['time', 'title', 'size']).default('time'),
})
