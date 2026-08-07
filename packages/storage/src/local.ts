import { createWriteStream } from 'node:fs'
import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, posix, relative, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'
import type { StorageAdapter, StorageDeleteInput, StorageReadInput, StorageReadResult, StorageReadUrlInput, StorageWriteInput, StorageWriteResult, StorageWriteStreamInput } from './types'

export interface LocalStorageAdapterOptions {
  rootDir: string
  publicBaseUrl: string
  keyPrefix?: string
}

/**
 * 本地文件系统存储适配器。把对象以 `<rootDir>/<keyPrefix>/<key>` 的形式落盘，对外暴露的
 * 访问 URL 形如 `<publicBaseUrl>/<keyPrefix>/<key>`（由 API 的 /api/artifacts/local/* 路由
 * 实际读取并返回字节）。
 *
 * 安全关键点：所有写入/读取路径都经 sanitizeKey + resolveLocalStoragePath 校验，
 * 确保 key 无法逃逸出 rootDir（防路径穿越）。
 */
export class LocalStorageAdapter implements StorageAdapter {
  readonly provider = 'local' as const
  readonly keyPrefix: string

  constructor(private readonly options: LocalStorageAdapterOptions) {
    this.keyPrefix = options.keyPrefix ?? ''
  }

  /** 将逻辑 key 解析为新写入使用的物理 key。 */
  private resolveWriteKey(key: string): string {
    if (this.keyPrefix.length === 0 || key === this.keyPrefix || key.startsWith(`${this.keyPrefix}/`)) return key
    return `${this.keyPrefix}/${key}`
  }

  async writeObject(input: StorageWriteInput): Promise<StorageWriteResult> {
    // P2-10：writeObject 是哑适配器，自身不做大小校验——大小护栏由调用方保证
    // （assets/avatar 上传在 service 层按 maxAssetSizeBytes/AVATAR_MAX_BYTES 校验，
    // worker 产物持久化按 fetch maxBytes 上限下载后再写）。新增写路径时同样要先定界。
    const fullKey = this.resolveWriteKey(input.key)
    const safeKey = sanitizeKey(fullKey)
    const target = resolveLocalStoragePath(this.options.rootDir, safeKey)
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, input.body)
    return {
      provider: this.provider,
      key: safeKey,
      url: localUrl(this.options.publicBaseUrl, safeKey),
      byteSize: input.body.byteLength,
    }
  }

  async writeObjectStream(input: StorageWriteStreamInput): Promise<StorageWriteResult> {
    // P1-16：流式落盘，大上传不整块载入内存。字节数用 TransformStream 边流边计，
    // 不依赖调用方上报。大小护栏与 writeObject 一致由调用方保证。
    const fullKey = this.resolveWriteKey(input.key)
    const safeKey = sanitizeKey(fullKey)
    const target = resolveLocalStoragePath(this.options.rootDir, safeKey)
    await mkdir(dirname(target), { recursive: true })
    // DOM lib 与 node:stream/web 的 ReadableStream 类型结构不兼容，运行时两者等价。
    const source = Readable.fromWeb(input.stream as unknown as NodeReadableStream)
    let byteSize = 0
    source.on('data', (chunk: Uint8Array) => {
      byteSize += chunk.byteLength
    })
    await pipeline(source, createWriteStream(target))
    return {
      provider: this.provider,
      key: safeKey,
      url: localUrl(this.options.publicBaseUrl, safeKey),
      byteSize,
    }
  }

  async healthCheck(): Promise<void> {
    await mkdir(this.options.rootDir, { recursive: true })
    const metadata = await stat(this.options.rootDir)
    if (!metadata.isDirectory()) throw new Error('local storage root is not a directory')
  }

  async createReadUrl(input: StorageReadUrlInput): Promise<string> {
    // 读 key 来自持久化的 storageKey；即使当前写入命名空间已变更，也要保证
    // 历史 key 仍可寻址。
    const safeKey = sanitizeKey(input.key)
    // 本地适配器的"读 URL"只是一段由 API 路由负责解析的相对路径，不做签名、
    // 也不校验 expiresInSeconds（本地存储的访问控制由 API 路由层负责）。
    const url = localUrl(this.options.publicBaseUrl, safeKey)
    return input.downloadFileName === undefined ? url : `${url}?download=1`
  }

  async readObject(input: StorageReadInput): Promise<StorageReadResult> {
    validateReadLimit(input.maxBytes)
    const target = resolveLocalStoragePath(this.options.rootDir, sanitizeKey(input.key))
    const metadata = await stat(target)
    if (metadata.size > input.maxBytes) throw new Error(`storage object exceeds limit: ${metadata.size} > ${input.maxBytes}`)
    return { body: new Uint8Array(await readFile(target)) }
  }

  async deleteObject(input: StorageDeleteInput): Promise<void> {
    const target = resolveLocalStoragePath(this.options.rootDir, sanitizeKey(input.key))
    try {
      await unlink(target)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
      throw error
    }
  }
}

function validateReadLimit(maxBytes: number): void {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('storage read maxBytes must be a positive integer')
}

/**
 * 规范化并校验存储 key，拒绝一切可能逃逸 rootDir 或被误判为绝对路径的形式。
 *
 * 处理步骤：
 *  1. 反斜杠统一为正斜杠，再用 posix 规则归一化（存储 key 始终用 posix 风格）；
 *  2. 拒绝含冒号 `:` 的 key —— 兼顾 Windows 盘符（C:）与 UNC scheme；
 *  3. 拒绝归一化后仍以 `/`、`//` 开头（绝对路径/UNC）或包含 `..`（穿越）的 key。
 *
 * 注意：`:` 检查保留是有意为之，不能用 path.isAbsolute 替换——后者在 posix 下
 * 会放行 `C:x` / `C:/x`，而这些在 Windows 上会被 path.resolve 当成盘符绝对路径，
 * 从而逃逸 rootDir。
 *
 * 导出供 OSS 适配器复用同一套 key 安全语义（P1-33）：本地/对象存储的 key 规范
 * 必须一致，否则同一逻辑 key 在两种适配器下会产生不同的注入面。
 */
export function sanitizeKey(key: string): string {
  const normalized = posix.normalize(key.replaceAll('\\', '/'))
  if (
    key.includes(':') ||
    normalized === '.' ||
    normalized.startsWith('/') ||
    normalized.startsWith('//') ||
    normalized.split('/').includes('..')
  ) {
    throw new Error(`unsafe storage key: ${key}`)
  }
  return normalized
}

/**
 * 将 (rootDir, key) 解析为最终的文件系统绝对路径，并保证结果仍在 rootDir 之内。
 *
 * 调用方（createStorageFromEnv、API 读路由）传入的 rootDir 现已保证为绝对路径；
 * 这里的 isAbsolute 护栏仅用于兜底，防止有人直接以相对路径调用本函数时静默落到
 * process.cwd() 之下（正是历史 bug 的形态）。
 */
export function resolveLocalStoragePath(rootDir: string, key: string): string {
  const safeKey = sanitizeKey(key)
  const root = resolve(rootDir)
  if (!isAbsolute(root)) {
    throw new Error(`local storage rootDir must resolve to an absolute path: ${rootDir}`)
  }
  const target = resolve(root, safeKey)
  // 二次校验：目标解析后相对 root 的路径不应为空、不应回溯到 root 之上，
  // 也不应含盘符冒号（防止 Windows 上跨盘符逃逸）。
  const pathFromRoot = relative(root, target)
  if (pathFromRoot === '' || pathFromRoot.startsWith('..') || pathFromRoot.includes(':')) {
    throw new Error(`unsafe storage key: ${safeKey}`)
  }
  return target
}

/**
 * 拼接访问 URL：<publicBaseUrl 末尾去斜杠>/<逐段 encode 的 key>。
 * key 各路径段单独 encodeURIComponent，保留 `/` 作为段分隔符。
 */
function localUrl(base: string, key: string): string {
  return `${base.replace(/\/$/, '')}/${key.split('/').map(encodeURIComponent).join('/')}`
}
