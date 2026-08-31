import {
  assetDownloadFileName,
  OSS_IMAGE_THUMBNAIL_PROCESS,
  OSS_VIDEO_SNAPSHOT_PROCESS,
  type StorageAdapter,
} from '@bailian-studio/storage'

/** API 对可读取资产的最小投影；用户资产和 admin 资产都可接入。 */
export interface AssetReadItem {
  id: string
  kind: string
  source: string
  url?: string
  storageProvider?: string
  storageKey?: string
  thumbnailStatus?: string
  thumbnailStorageProvider?: string
  thumbnailStorageKey?: string
  text?: string
  mimeType?: string
  byteSize?: number
  durationSeconds?: number
  declaredResolution?: string
  fileName?: string
  recordId?: string
  modelId?: string
  createdAt: string
}

/** 仅当当前适配器拥有该存储对象时才返回物理 key，避免签发其他 provider 的 key。 */
export function assetDownloadStorageKey(
  item: Pick<AssetReadItem, 'storageKey' | 'storageProvider'>,
  storage: Pick<StorageAdapter, 'provider'>,
): string | undefined {
  return item.storageKey !== undefined
    && item.storageKey.length > 0
    && item.storageProvider === storage.provider
    ? item.storageKey
    : undefined
}

/** 为用户资产和 admin 资产投影生成短期读取 URL。 */
export async function assetWithReadUrl(
  item: AssetReadItem,
  storage: StorageAdapter,
) {
  const publicItem = {
    id: item.id,
    kind: item.kind,
    source: item.source,
    ...(item.url !== undefined ? { url: item.url } : {}),
    ...(item.text !== undefined ? { text: item.text } : {}),
    ...(item.mimeType !== undefined ? { mimeType: item.mimeType } : {}),
    ...(item.byteSize !== undefined ? { byteSize: item.byteSize } : {}),
    ...(item.durationSeconds !== undefined
      ? { durationSeconds: item.durationSeconds }
      : {}),
    ...(item.declaredResolution !== undefined
      ? { declaredResolution: item.declaredResolution }
      : {}),
    ...(item.fileName !== undefined ? { fileName: item.fileName } : {}),
    ...(item.recordId !== undefined ? { recordId: item.recordId } : {}),
    ...(item.modelId !== undefined ? { modelId: item.modelId } : {}),
    ...(item.thumbnailStatus !== undefined
      ? { thumbnailStatus: item.thumbnailStatus }
      : {}),
    createdAt: item.createdAt,
  }
  const withOriginal = item.storageKey === undefined
    ? publicItem
    : {
        ...publicItem,
        url: await storage.createReadUrl({
          key: item.storageKey,
          expiresInSeconds: 3600,
        }),
      }

  if (
    item.thumbnailStatus === 'ready'
    && item.thumbnailStorageKey !== undefined
    && item.thumbnailStorageProvider === storage.provider
  ) {
    try {
      return {
        ...withOriginal,
        thumbnailUrl: await storage.createReadUrl({
          key: item.thumbnailStorageKey,
          expiresInSeconds: 3600,
        }),
      }
    } catch {
      return withOriginal
    }
  }

  if (
    item.storageKey === undefined
    || storage.provider !== 'oss'
    || (item.kind !== 'image' && item.kind !== 'video')
  ) return withOriginal

  const process = item.kind === 'image'
    ? OSS_IMAGE_THUMBNAIL_PROCESS
    : OSS_VIDEO_SNAPSHOT_PROCESS
  return {
    ...withOriginal,
    thumbnailStatus: 'ready' as const,
    thumbnailUrl: await storage.createReadUrl({
      key: item.storageKey,
      expiresInSeconds: 3600,
      process,
    }),
  }
}

/** 生成附件下载 URL；下载能力只对当前存储 provider 的对象开放。 */
export async function assetWithDownloadUrl(
  item: AssetReadItem,
  storage: StorageAdapter,
) {
  const publicItem = await assetWithReadUrl(item, storage)
  const storageKey = assetDownloadStorageKey(item, storage)
  if (storageKey === undefined) return publicItem

  return {
    ...publicItem,
    downloadUrl: await storage.createReadUrl({
      key: storageKey,
      expiresInSeconds: 3600,
      downloadFileName: assetDownloadFileName(
        item.fileName,
        item.id,
        item.mimeType,
      ),
    }),
  }
}
