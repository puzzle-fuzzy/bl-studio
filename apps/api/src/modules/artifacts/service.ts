import type { ArtifactStatus } from '@bailian-studio/generation-repository'
import {
  OSS_IMAGE_THUMBNAIL_PROCESS,
  OSS_VIDEO_SNAPSHOT_PROCESS,
  type StorageAdapter,
} from '@bailian-studio/storage'

export interface ArtifactReadUrlUseCaseDependencies {
  readonly storage: StorageAdapter
}

export interface ResolveArtifactReadUrlInput {
  /** 正在返回的 API 投影；可能是公开视图或所有者视图。 */
  readonly artifact: {
    kind: 'image' | 'video' | 'audio' | 'text' | 'archive'
    status: ArtifactStatus
    storageKey?: string
    thumbnailStatus?: 'queued' | 'processing' | 'ready' | 'failed'
    thumbnailStorageProvider?: 'oss' | 'local'
    thumbnailStorageKey?: string
  }
  /** 公开的本地分享需要走自己的免鉴权路由。 */
  readonly localReadUrl?: string
  readonly expiresInSeconds?: number
}

export function resolveArtifactReadUrlUseCase(deps: ArtifactReadUrlUseCaseDependencies) {
  return {
    async execute<T extends ResolveArtifactReadUrlInput['artifact']>(
      input: ResolveArtifactReadUrlInput & { artifact: T },
    ): Promise<T & { readUrl?: string; thumbnailUrl?: string }> {
      const { artifact } = input
      if (artifact.status !== 'stored' || artifact.storageKey === undefined) {
        return artifact
      }

      const expiresInSeconds = input.expiresInSeconds ?? 3600
      const readUrl = deps.storage.provider === 'local' && input.localReadUrl !== undefined
        ? input.localReadUrl
        : await deps.storage.createReadUrl({
            key: artifact.storageKey,
            expiresInSeconds,
          })

      if (
        artifact.thumbnailStatus === 'ready'
        && artifact.thumbnailStorageKey !== undefined
        && artifact.thumbnailStorageProvider === deps.storage.provider
      ) {
        try {
          return {
            ...artifact,
            readUrl,
            thumbnailUrl: await deps.storage.createReadUrl({
              key: artifact.thumbnailStorageKey,
              expiresInSeconds,
            }),
          }
        } catch {
          return { ...artifact, readUrl }
        }
      }

      if (deps.storage.provider !== 'oss' || (artifact.kind !== 'image' && artifact.kind !== 'video')) {
        return { ...artifact, readUrl }
      }

      // OSS 图片/视频可即时生成缩略图（x-oss-process），无需预先生成存储对象。
      return {
        ...artifact,
        readUrl,
        thumbnailStatus: 'ready' as const,
        thumbnailUrl: await deps.storage.createReadUrl({
          key: artifact.storageKey,
          expiresInSeconds,
          process: artifact.kind === 'image'
            ? OSS_IMAGE_THUMBNAIL_PROCESS
            : OSS_VIDEO_SNAPSHOT_PROCESS,
        }),
      }
    },
  }
}
