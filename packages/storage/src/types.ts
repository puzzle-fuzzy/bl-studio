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
  /** Physical key returned by writeObject; never re-prefix this value. */
  key: string
}

/** 生成只读访问 URL 的请求：实际持久化 key 与有效期（秒）。 */
export interface StorageReadUrlInput {
  /** Physical key returned by writeObject; never re-prefix this value. */
  key: string
  expiresInSeconds: number
  /**
   * Optional provider-side processing instruction. OSS includes this value in
   * the signature; local storage ignores it because it is served by the API.
   */
  process?: string
  /** User-facing attachment name. When omitted, the URL keeps inline/read semantics. */
  downloadFileName?: string
}

export interface StorageReadInput {
  /** Physical key returned by writeObject; never re-prefix this value. */
  key: string
  /** Hard byte ceiling applied before returning the object to a worker. */
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
  /** Optional connectivity/readiness probe for the configured backend. */
  healthCheck?(): Promise<void>
  /** Optional read capability used by worker-side media processing. */
  readObject?(input: StorageReadInput): Promise<StorageReadResult>
  /** Best-effort compensation hook for a DB write that fails after storage succeeds. */
  deleteObject?(input: StorageDeleteInput): Promise<void>
  createReadUrl(input: StorageReadUrlInput): Promise<string>
}
