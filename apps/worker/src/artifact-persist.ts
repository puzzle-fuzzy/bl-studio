import type {
  GenerationArtifact,
  GenerationRepository,
  MarkArtifactFailedInput,
  MarkArtifactStoredInput,
} from '@bailian-studio/generation-repository'
import type { StorageAdapter } from '@bailian-studio/storage'
import type { TaskError } from '@bailian-studio/task-engine'
import { fetchProviderArtifact } from './artifact-fetch'
import type { ArtifactFetch } from './artifact-fetch'

export interface PersistArtifactsForRecordInput {
  recordId: string
  repository: Pick<
    GenerationRepository,
    'listPendingArtifactsForRecord' | 'markArtifactStored' | 'markArtifactFailed'
  >
  storage: StorageAdapter
  fetch?: typeof fetch
  artifactFetch?: ArtifactFetchPolicy
  now?: string
}

export interface ArtifactFetchPolicy {
  /** Exact extra provider hosts allowed in addition to DashScope result hosts. */
  allowedHosts?: readonly string[]
  /** Maximum bytes accepted from a provider artifact. Defaults to 100 MiB. */
  maxBytes?: number
  /** Maximum time spent fetching and consuming one provider artifact. */
  timeoutMs?: number
  /** Maximum number of validated redirects. */
  maxRedirects?: number
}

export const DEFAULT_ARTIFACT_FETCH_MAX_BYTES = 100 * 1024 * 1024
export const DEFAULT_ARTIFACT_FETCH_TIMEOUT_MS = 30_000

export interface PersistArtifactsForRecordResult {
  storedCount: number
}

interface ArtifactPayload {
  body: Uint8Array
  contentType?: string
}

export async function persistArtifactsForRecord(
  input: PersistArtifactsForRecordInput,
): Promise<PersistArtifactsForRecordResult> {
  const artifacts = await input.repository.listPendingArtifactsForRecord(input.recordId)
  let storedCount = 0

  for (const artifact of artifacts) {
    try {
      const payload = await readArtifactPayload(
        artifact,
        input.fetch ?? fetch,
        input.artifactFetch,
      )
      const contentType = payload.contentType ?? artifact.mimeType
      const result = await input.storage.writeObject({
        key: artifactStorageKey(input.recordId, artifact.id, contentType, artifact.kind),
        body: payload.body,
        ...(contentType !== undefined ? { contentType } : {}),
      })
      const stored: MarkArtifactStoredInput = {
        artifactId: artifact.id,
        storageProvider: result.provider,
        storageKey: result.key,
        byteSize: result.byteSize,
        ...(result.url !== undefined ? { storageUrl: result.url } : {}),
        ...(contentType !== undefined ? { mimeType: contentType } : {}),
        ...(input.now !== undefined ? { now: input.now } : {}),
      }
      await input.repository.markArtifactStored(stored)
      storedCount += 1
    } catch (error) {
      const taskError = artifactErrorToTaskError(error)
      const failed: MarkArtifactFailedInput = {
        artifactId: artifact.id,
        error: taskError,
        ...(input.now !== undefined ? { now: input.now } : {}),
      }
      await input.repository.markArtifactFailed(failed)
      throw attachTaskError(error, taskError)
    }
  }

  return { storedCount }
}

async function readArtifactPayload(
  artifact: GenerationArtifact,
  fetchImpl: ArtifactFetch,
  policy: ArtifactFetchPolicy | undefined,
): Promise<ArtifactPayload> {
  if (artifact.text !== undefined) {
    return {
      body: Buffer.from(artifact.text, 'utf-8'),
      contentType: artifact.mimeType ?? 'text/plain; charset=utf-8',
    }
  }

  if (artifact.sourceUrl === undefined) {
    throw new Error(`Artifact ${artifact.id} has neither text nor sourceUrl`)
  }

  const response = await fetchProviderArtifact({
    url: artifact.sourceUrl,
    kind: artifact.kind,
    allowedHosts: policy?.allowedHosts,
    maxBytes: policy?.maxBytes ?? DEFAULT_ARTIFACT_FETCH_MAX_BYTES,
    timeoutMs: policy?.timeoutMs ?? DEFAULT_ARTIFACT_FETCH_TIMEOUT_MS,
    ...(policy?.maxRedirects === undefined ? {} : { maxRedirects: policy.maxRedirects }),
    fetch: fetchImpl,
  })
  const buffer = await response.consume()
  return {
    body: Buffer.from(buffer),
    contentType: response.contentType,
  }
}

/** Build the storage key for an artifact. Exported for targeted unit tests. */
export function artifactStorageKey(
  recordId: string,
  artifactId: string,
  contentType: string | undefined,
  kind: GenerationArtifact['kind'],
): string {
  const extension = extensionForContent(contentType, kind)
  return `generations/${recordId}/${artifactId}.${extension}`
}

function extensionForContent(contentType: string | undefined, kind: GenerationArtifact['kind']): string {
  const lower = contentType?.toLowerCase() ?? ''
  if (lower.includes('png')) return 'png'
  if (lower.includes('jpeg') || lower.includes('jpg')) return 'jpeg'
  if (lower.includes('mp4')) return 'mp4'
  // audio/mpeg is the standard MIME for MP3 files (DashScope's music output).
  // Use .mp3 so browsers and OSes recognize it; reserve .mpeg for video/mpeg.
  if (lower.includes('audio/mpeg') || lower.includes('mp3')) return 'mp3'
  if (lower.includes('text')) return 'txt'

  switch (kind) {
    case 'image':
      return 'png'
    case 'video':
      return 'mp4'
    case 'audio':
      return 'mp3'
    case 'text':
      return 'txt'
    case 'archive':
      return 'bin'
  }
}

function artifactErrorToTaskError(error: unknown): TaskError {
  const message = error instanceof Error ? error.message : String(error)
  return {
    category: 'storage',
    message,
    retriable: /network|timeout|HTTP 5|fetch|upload/i.test(message),
    code: 'ARTIFACT_PERSIST_FAILED',
  }
}

function attachTaskError(error: unknown, taskError: TaskError): Error & { taskError: TaskError } {
  const wrapped = error instanceof Error ? error : new Error(String(error))
  return Object.assign(wrapped, { taskError })
}
