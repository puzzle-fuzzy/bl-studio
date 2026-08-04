import type {
  GenerationArtifact,
  GenerationRecord,
} from '@bailian-studio/generation-repository'
import {
  OSS_IMAGE_THUMBNAIL_PROCESS,
  OSS_VIDEO_SNAPSHOT_PROCESS,
  type StorageAdapter,
} from '@bailian-studio/storage'

type OutputArtifact = Record<string, unknown> & {
  kind: string
  sourceUrl?: string
}

function outputArtifacts(record: GenerationRecord): OutputArtifact[] | undefined {
  const artifacts = record.outputResult?.artifacts
  if (!Array.isArray(artifacts)) return undefined
  if (!artifacts.every(artifact => (
    typeof artifact === 'object'
    && artifact !== null
    && typeof (artifact as { kind?: unknown }).kind === 'string'
  ))) return undefined
  return artifacts as OutputArtifact[]
}

function thumbnailProcess(kind: string): string | undefined {
  if (kind === 'image') return OSS_IMAGE_THUMBNAIL_PROCESS
  if (kind === 'video') return OSS_VIDEO_SNAPSHOT_PROCESS
  return undefined
}

function matchingPersistedArtifact(
  output: OutputArtifact,
  outputIndex: number,
  artifacts: readonly GenerationArtifact[],
  usedIds: ReadonlySet<string>,
): GenerationArtifact | undefined {
  const eligible = (artifact: GenerationArtifact): boolean => (
    !usedIds.has(artifact.id)
    && artifact.status === 'stored'
    && artifact.kind === output.kind
    && thumbnailProcess(artifact.kind) !== undefined
    && (
      artifact.thumbnailStatus !== undefined
      || (artifact.storageProvider === 'oss' && artifact.storageKey !== undefined)
    )
  )

  if (output.sourceUrl !== undefined) {
    const exact = artifacts.find(artifact => (
      eligible(artifact) && artifact.sourceUrl === output.sourceUrl
    ))
    if (exact !== undefined) return exact
  }

  const positional = artifacts[outputIndex]
  if (positional !== undefined && eligible(positional)) return positional
  return artifacts.find(eligible)
}

/**
 * Attach short-lived preview URLs to list projections. Local previews come
 * from durable derivatives; OSS previews use provider-side processing.
 * Originals stay in sourceUrl and are still used by the full output viewer.
 */
export async function attachGenerationThumbnailUrls(
  records: readonly GenerationRecord[],
  persistedArtifacts: readonly GenerationArtifact[],
  storage: StorageAdapter,
): Promise<GenerationRecord[]> {
  if (persistedArtifacts.length === 0) {
    return [...records]
  }

  const artifactsByRecord = new Map<string, GenerationArtifact[]>()
  for (const artifact of persistedArtifacts) {
    const recordArtifacts = artifactsByRecord.get(artifact.recordId) ?? []
    recordArtifacts.push(artifact)
    artifactsByRecord.set(artifact.recordId, recordArtifacts)
  }

  return Promise.all(records.map(async record => {
    const outputs = outputArtifacts(record)
    const recordArtifacts = artifactsByRecord.get(record.id)
    if (outputs === undefined || recordArtifacts === undefined) return record

    const usedIds = new Set<string>()
    const decorated = await Promise.all(outputs.map(async (output, index) => {
      const persisted = matchingPersistedArtifact(output, index, recordArtifacts, usedIds)
      const process = thumbnailProcess(output.kind)
      if (persisted === undefined || process === undefined) return output
      usedIds.add(persisted.id)

      const withStatus = persisted.thumbnailStatus === undefined
        ? output
        : { ...output, thumbnailStatus: persisted.thumbnailStatus }

      try {
        if (
          persisted.thumbnailStatus === 'ready'
          && persisted.thumbnailStorageKey !== undefined
          && persisted.thumbnailStorageProvider === storage.provider
        ) {
          return {
            ...withStatus,
            thumbnailUrl: await storage.createReadUrl({
              key: persisted.thumbnailStorageKey,
              expiresInSeconds: 3600,
            }),
          }
        }
        if (
          storage.provider !== 'oss'
          || persisted.storageProvider !== 'oss'
          || persisted.storageKey === undefined
        ) return withStatus

        return {
          ...withStatus,
          thumbnailStatus: 'ready' as const,
          thumbnailUrl: await storage.createReadUrl({
            key: persisted.storageKey,
            expiresInSeconds: 3600,
            process,
          }),
        }
      }
      catch {
        // A preview optimization must never make the task list unavailable.
        // The existing provider source remains a functional fallback.
        return withStatus
      }
    }))

    return {
      ...record,
      outputResult: {
        ...record.outputResult,
        artifacts: decorated,
      },
    }
  }))
}
