import OSS from 'ali-oss'
import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import type { StorageAdapter, StorageDeleteInput, StorageReadInput, StorageReadResult, StorageReadUrlInput, StorageWriteInput, StorageWriteResult, StorageWriteStreamInput } from './types'
import { attachmentContentDisposition } from './content-disposition'
import { sanitizeKey as sanitizeStorageKey } from './local'

/**
 * 阿里云 OSS 存储适配器，及它依赖的客户端最小接口。
 *
 * 这里不直接依赖 ali-oss 的完整类型，而是抽象出 OssClientLike——这样测试时可以
 * 注入伪造客户端（见 oss.test.ts），生产由 createOssClient 构造真实的 ali-oss 实例。
 */
export interface OssClientLike {
  put(key: string, body: Uint8Array, options?: { headers?: Record<string, string> }): Promise<{ url?: string }>
  /** P1-16：流式上传（ali-oss `putStream`）。未实现时 OSS 适配器退化为缓冲写。 */
  putStream?(
    key: string,
    stream: Readable,
    options?: { headers?: Record<string, string>; contentLength?: number; timeout?: number },
  ): Promise<{ url?: string }>
  delete?(key: string): Promise<unknown>
  head?(key: string): Promise<unknown>
  signatureUrl(key: string, options: {
    expires: number
    process?: string
    response?: { 'content-disposition'?: string }
  }): string
  get?(key: string): Promise<{ content: Uint8Array; res?: { headers?: Record<string, string> } }>
}

/** 用于媒体库卡片缩略图的 OSS 视频截图指令。 */
export const OSS_VIDEO_SNAPSHOT_PROCESS = 'video/snapshot,t_1000,f_jpg,w_400,m_fast'

/**
 * 紧凑预览使用的 OSS 图片处理指令。
 *
 * 最长边限制为 640px 并编码为 WebP。原始分辨率读取刻意使用不带该
 * process 的独立签名 URL。
 */
export const OSS_IMAGE_THUMBNAIL_PROCESS = 'image/resize,m_lfit,w_640,h_640/format,webp/quality,Q_80'

export interface OssStorageAdapterOptions {
  client: OssClientLike
  keyPrefix?: string
}

export interface CreateOssClientOptions {
  region: string
  bucket: string
  accessKeyId: string
  accessKeySecret: string
  endpoint?: string
  /** ali-oss operation timeout in milliseconds; the SDK default is 60 seconds. */
  timeoutMs?: number
}

/**
 * 基于 OssClientLike 的存储适配器。写入直接 put 字节；读 URL 用 OSS 的签名 URL
 * （带有效期），因此 createReadUrl 的 expiresInSeconds 在 OSS 模式下真正生效
 * （本地适配器不签名，由 API 路由层控制访问）。
 */
export class OssStorageAdapter implements StorageAdapter {
  readonly provider = 'oss' as const
  readonly keyPrefix: string

  constructor(private readonly options: OssStorageAdapterOptions) {
    this.keyPrefix = options.keyPrefix ?? ''
  }

  /** 将逻辑 key 解析为新写入使用的物理 key。 */
  private resolveWriteKey(key: string): string {
    // P1-33：写路径先经 sanitizeStorageKey（与 local 适配器同一套语义，拒绝
    // `:` / `..` / 前导 `/`），再拼命名空间前缀，杜绝外部输入做对象 key 注入。
    const sanitized = sanitizeStorageKey(key)
    if (this.keyPrefix.length === 0 || sanitized === this.keyPrefix || sanitized.startsWith(`${this.keyPrefix}/`)) {
      return sanitized
    }
    return `${this.keyPrefix}/${sanitized}`
  }

  async writeObject(input: StorageWriteInput): Promise<StorageWriteResult> {
    // P2-10：writeObject 是哑适配器，自身不做大小校验——大小护栏由调用方保证
    // （assets/avatar 上传在 service 层按 maxAssetSizeBytes/AVATAR_MAX_BYTES 校验，
    // worker 产物持久化按 fetch maxBytes 上限下载后再写）。新增写路径时同样要先定界。
    const fullKey = this.resolveWriteKey(input.key)
    const result = await this.options.client.put(fullKey, input.body, {
      ...(input.contentType !== undefined ? { headers: { 'Content-Type': input.contentType } } : {}),
    })
    return {
      provider: this.provider,
      key: fullKey,
      ...(result.url !== undefined ? { url: result.url } : {}),
      byteSize: input.body.byteLength,
    }
  }

  async writeObjectStream(input: StorageWriteStreamInput): Promise<StorageWriteResult> {
    // P1-16：流式上传。已知长度时传给 ali-oss，避免生产环境的 chunked PUT；
    // 未知长度的通用流仍允许退回 SDK 的 chunked 行为。字节数边流边计，不依赖服务端返回。
    const putStream = this.options.client.putStream
    if (putStream === undefined) throw new Error('OSS storage stream write is not configured')
    const fullKey = this.resolveWriteKey(input.key)
    const source = Readable.fromWeb(input.stream as unknown as NodeReadableStream)
    let byteSize = 0
    source.on('data', (chunk: Uint8Array) => {
      byteSize += chunk.byteLength
    })
    const result = await putStream.call(
      this.options.client,
      fullKey,
      source,
      {
        ...(input.contentType !== undefined ? { headers: { 'Content-Type': input.contentType } } : {}),
        ...(input.contentLength !== undefined ? { contentLength: input.contentLength } : {}),
      },
    )
    return {
      provider: this.provider,
      key: fullKey,
      ...(result.url !== undefined ? { url: result.url } : {}),
      byteSize,
    }
  }

  async healthCheck(): Promise<void> {
    const head = this.options.client.head
    if (head === undefined) throw new Error('OSS storage health probe is not configured')
    try {
      // HEAD 不会下载任何数据。哨兵对象缺失即视为健康：404 说明凭据能触达
      // 配置的 bucket/object API。
      await head.call(this.options.client, 'health/ready')
    } catch (error) {
      const status = readStorageErrorStatus(error)
      if (status === 404) return
      throw error
    }
  }

  async createReadUrl(input: StorageReadUrlInput): Promise<string> {
    // `input.key` 是持久化的物理 storage key。历史 key 可能使用与当前
    // OSS_KEY_PREFIX 不同的命名空间，必须按原样存储签名（仅过一遍安全校验）。
    const fullKey = sanitizeStorageKey(input.key)
    return this.options.client.signatureUrl(fullKey, {
      // P1-33：expires 夹紧到 [1, 7×86400]，过大/负值不再生成长期有效签名 URL。
      expires: clampExpires(input.expiresInSeconds),
      ...(input.process !== undefined ? { process: input.process } : {}),
      ...(input.downloadFileName !== undefined
        ? {
            response: {
              'content-disposition': attachmentContentDisposition(input.downloadFileName),
            },
          }
        : {}),
    })
  }

  async readObject(input: StorageReadInput): Promise<StorageReadResult> {
    if (!Number.isSafeInteger(input.maxBytes) || input.maxBytes <= 0) throw new Error('storage read maxBytes must be a positive integer')
    const get = this.options.client.get
    if (get === undefined) throw new Error('OSS storage read is not configured')
    const safeKey = sanitizeStorageKey(input.key)
    const result = await get.call(this.options.client, safeKey)
    if (result.content.byteLength > input.maxBytes) throw new Error(`storage object exceeds limit: ${result.content.byteLength} > ${input.maxBytes}`)
    const contentType = result.res?.headers?.['content-type'] ?? result.res?.headers?.['Content-Type']
    return { body: new Uint8Array(result.content), ...(contentType !== undefined ? { contentType } : {}) }
  }

  async deleteObject(input: StorageDeleteInput): Promise<void> {
    const remove = this.options.client.delete
    if (remove === undefined) return
    // 删除是对已持久化对象的补偿操作；不要改写其命名空间，仅过安全校验。
    await remove.call(this.options.client, sanitizeStorageKey(input.key))
  }
}

/** 签名 URL 有效期夹紧区间（秒）：下限 1s，上限 7 天（P1-33）。 */
export const OSS_MIN_EXPIRES_SECONDS = 1
export const OSS_MAX_EXPIRES_SECONDS = 7 * 24 * 60 * 60

function clampExpires(seconds: number): number {
  if (!Number.isFinite(seconds)) return OSS_MIN_EXPIRES_SECONDS
  const clamped = Math.floor(seconds)
  return Math.min(OSS_MAX_EXPIRES_SECONDS, Math.max(OSS_MIN_EXPIRES_SECONDS, clamped))
}

/**
 * 用阿里云凭据构造一个真实的 ali-oss 客户端（满足 OssClientLike）。
 * 显式启用 authorizationV4 以使用新版签名算法。
 */
export function createOssClient(options: CreateOssClientOptions): OssClientLike {
  return new OSS({
    region: options.region,
    bucket: options.bucket,
    accessKeyId: options.accessKeyId,
    accessKeySecret: options.accessKeySecret,
    authorizationV4: true,
    ...(options.endpoint !== undefined ? { endpoint: options.endpoint } : {}),
    ...(options.timeoutMs !== undefined ? { timeout: options.timeoutMs } : {}),
  }) as OssClientLike
}

function readStorageErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const candidate = error as { status?: unknown; statusCode?: unknown; statusCodeValue?: unknown }
  for (const value of [candidate.status, candidate.statusCode, candidate.statusCodeValue]) {
    if (typeof value === 'number' && Number.isInteger(value)) return value
    if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  }
  return undefined
}
