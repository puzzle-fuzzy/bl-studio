/**
 * @bailian-studio/storage 包入口。统一导出存储适配器、env 工厂与本地路径解析工具。
 *
 * 上层（apps/worker 写入、apps/api 读取）只依赖这里的类型与工厂，
 * 不感知底层是本地文件系统还是阿里云 OSS。
 */
export { createStorageFromEnv, DEFAULT_OSS_TIMEOUT_MS, type CreateStorageFromEnvOptions } from './env'
export { assetDownloadFileName, attachmentContentDisposition } from './content-disposition'
export { findRepoRoot, resolveArtifactLocalRoot, looksLikeForeignAbsolute, type ExistsChecker } from './paths'
export { LocalStorageAdapter, resolveLocalStoragePath, type LocalStorageAdapterOptions } from './local'
export {
  createOssClient,
  OssStorageAdapter,
  OSS_IMAGE_THUMBNAIL_PROCESS,
  OSS_VIDEO_SNAPSHOT_PROCESS,
  OSS_MIN_EXPIRES_SECONDS,
  OSS_MAX_EXPIRES_SECONDS,
  type CreateOssClientOptions,
  type OssClientLike,
  type OssStorageAdapterOptions,
} from './oss'
export type { StorageAdapter, StorageDeleteInput, StorageProvider, StorageReadInput, StorageReadResult, StorageReadUrlInput, StorageWriteInput, StorageWriteResult, StorageWriteStreamInput } from './types'
