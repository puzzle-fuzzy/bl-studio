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
  /** The API projection being returned; it may be a public or owner view. */
  readonly artifact: {
    kind: 'image' | 'video' | 'audio' | 'text' | 'archive'
    status: ArtifactStatus
    storageKey?: string
    thumbnailStatus?: 'queued' | 'processing' | 'ready' | 'failed'
    thumbnailStorageProvider?: 'oss' | 'local'
    thumbnailStorageKey?: string
  }
  /** Public local shares need their own unauthenticated route. */
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
