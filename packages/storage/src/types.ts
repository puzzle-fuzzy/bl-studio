/**
 * 存储适配器的统一类型契约。
 *
 * @bailian-studio/storage 对上层（worker 写入、API 读取）暴露的唯一抽象是 StorageAdapter；
 * 底层可以是本地文件系统（LocalStorageAdapter）或阿里云 OSS（OssStorageAdapter）。
 * 新增存储后端时实现该接口即可，调用方无需改动。
 */

/** 存储后端标识：本地文件系统或阿里云 OSS。 */
export type StorageProvider = 'oss' | 'local'

/** 写入请求：对象在存储中的逻辑 key、原始字节，可选 Content-Type。 */
export interface StorageWriteInput {
  key: string
  body: Uint8Array
  contentType?: string
}

/** 写入结果：实际使用的 key、可访问的 url（可能为空）、字节数。 */
export interface StorageWriteResult {
  provider: StorageProvider
  key: string
  url?: string
  byteSize: number
}

/** 删除请求：使用 writeObject 返回的实际持久化 key。 */
export interface StorageDeleteInput {
  /** writeObject 返回的实际持久化 key；不要再次加前缀。 */
  key: string
}

/** 生成只读访问 URL 的请求：实际持久化 key 与有效期（秒）。 */
export interface StorageReadUrlInput {
  /** writeObject 返回的实际持久化 key；不要再次加前缀。 */
  key: string
  expiresInSeconds: number
  /**
   * 可选的 provider 侧处理指令。OSS 会把它纳入签名；local 存储忽略它，
   * 因为本地文件由 API 路由直接提供。
   */
  process?: string
  /** 面向用户的附件文件名。省略时 URL 保持 inline/read 语义。 */
  downloadFileName?: string
}

export interface StorageReadInput {
  /** writeObject 返回的实际持久化 key；不要再次加前缀。 */
  key: string
  /** 返回对象给 worker 前施加的硬性字节上限。 */
  maxBytes: number
}

export interface StorageReadResult {
  body: Uint8Array
  contentType?: string
}

/**
 * 存储适配器契约。writeObject 负责持久化原始字节并返回访问信息；
 * createReadUrl 生成（通常是带签名的）只读访问 URL。写入接受逻辑 key，返回实际持久化 key；
 * 读取和删除必须使用返回的持久化 key 原样访问，以兼容历史命名空间。
 *
 * keyPrefix 仅用于新写入时划分共享 OSS 桶中的项目命名空间。
 */
export interface StorageAdapter {
  readonly provider: StorageProvider
  readonly keyPrefix: string
  writeObject(input: StorageWriteInput): Promise<StorageWriteResult>
  /** 对配置后端执行可选连通性/就绪探测。 */
  healthCheck?(): Promise<void>
  /** worker 侧媒体处理使用的可选读能力。 */
  readObject?(input: StorageReadInput): Promise<StorageReadResult>
  /** DB 写入在存储成功后失败的尽力补偿钩子。 */
  deleteObject?(input: StorageDeleteInput): Promise<void>
  createReadUrl(input: StorageReadUrlInput): Promise<string>
}
