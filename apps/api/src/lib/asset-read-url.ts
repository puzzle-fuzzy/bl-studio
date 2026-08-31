import type { UnifiedAssetItem } from '@bailian-studio/generation-repository'
import {
  assetDownloadFileName,
  OSS_IMAGE_THUMBNAIL_PROCESS,
  OSS_VIDEO_SNAPSHOT_PROCESS,
  type StorageAdapter,
} from '@bailian-studio/storage'

/** 仅当当前适配器拥有该存储对象时才返回物理 key，避免签发其他 provider 的 key。 */
export function assetDownloadStorageKey(
  item: Pick<UnifiedAssetItem, 'storageKey' | 'storageProvider'>,
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
  item: UnifiedAssetItem,
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
  item: UnifiedAssetItem,
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
