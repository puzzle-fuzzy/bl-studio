import OSS from 'ali-oss'
import type { StorageAdapter, StorageDeleteInput, StorageReadInput, StorageReadResult, StorageReadUrlInput, StorageWriteInput, StorageWriteResult } from './types'
import { attachmentContentDisposition } from './content-disposition'

/**
 * 阿里云 OSS 存储适配器，及它依赖的客户端最小接口。
 *
 * 这里不直接依赖 ali-oss 的完整类型，而是抽象出 OssClientLike——这样测试时可以
 * 注入伪造客户端（见 oss.test.ts），生产由 createOssClient 构造真实的 ali-oss 实例。
 */
export interface OssClientLike {
  put(key: string, body: Uint8Array, options?: { headers?: Record<string, string> }): Promise<{ url?: string }>
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
    if (this.keyPrefix.length === 0 || key === this.keyPrefix || key.startsWith(`${this.keyPrefix}/`)) return key
    return `${this.keyPrefix}/${key}`
  }

  async writeObject(input: StorageWriteInput): Promise<StorageWriteResult> {
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
    // OSS_KEY_PREFIX 不同的命名空间，必须按原样存储签名。
    const fullKey = input.key
    return this.options.client.signatureUrl(fullKey, {
      expires: input.expiresInSeconds,
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
    const result = await get.call(this.options.client, input.key)
    if (result.content.byteLength > input.maxBytes) throw new Error(`storage object exceeds limit: ${result.content.byteLength} > ${input.maxBytes}`)
    const contentType = result.res?.headers?.['content-type'] ?? result.res?.headers?.['Content-Type']
    return { body: new Uint8Array(result.content), ...(contentType !== undefined ? { contentType } : {}) }
  }

  async deleteObject(input: StorageDeleteInput): Promise<void> {
    const remove = this.options.client.delete
    if (remove === undefined) return
    // 删除是对已持久化对象的补偿操作；不要改写其命名空间。
    await remove.call(this.options.client, input.key)
  }
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
