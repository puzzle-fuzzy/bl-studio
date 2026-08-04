import { extname } from 'node:path'
import type { PublicSharedGenerationArtifact } from '@bailian-studio/generation-repository'
import { Elysia } from 'elysia'
import { resolveLocalStoragePath } from '@bailian-studio/storage'
import type { ApiDependencies } from '../../dependencies'
import { requestErrorResponseBody } from '../../lib/http-errors'
import { auditErrorCode, recordApiAuditEvent } from '../../lib/audit'
import { LocalFileTooLargeError, createLocalFileResponse } from '../../lib/local-file-response'
import { resolveArtifactReadUrlUseCase } from '../artifacts/service'

type PublicArtifactWithReadUrl = PublicSharedGenerationArtifact & {
  readUrl?: string
  thumbnailUrl?: string
}

/**
 * Public share reads. No auth: anyone with the opaque share id can read the
 * strictly scoped public model. `readUrl` is attached here (API layer) from the
 * storage adapter — the repository never calls storage.
 */
export function createShareRoutes(deps: ApiDependencies) {
  const resolveArtifactReadUrl = resolveArtifactReadUrlUseCase({ storage: deps.storage })
  return new Elysia({ prefix: '/api/shares' })
  .get('/generations/:shareId', async ({ request, params, set }) => {
    const shareId = params.shareId
    if (typeof shareId !== 'string' || shareId.length === 0) {
      set.status = 400
      return requestErrorResponseBody(request, 'INVALID_SHARE_ID', 'Share id is required', set)
    }

    const shared = await deps.generationRepository.getPublicSharedGeneration(shareId)
    if (shared === undefined) {
      set.status = 404
      return requestErrorResponseBody(request, 'SHARE_NOT_FOUND', `Share not found: ${shareId}`, set)
    }

    const repository = deps.generationRepository
    const storage = deps.storage
    const artifacts = await Promise.all(
      shared.artifacts.map(async (artifact): Promise<PublicArtifactWithReadUrl> => {
        if (artifact.status !== 'stored') return artifact
        const stored = await repository.getPublicSharedArtifact(shareId, artifact.id)
        if (stored?.storageKey === undefined) return artifact
        const resolved = await resolveArtifactReadUrl.execute({
          artifact: stored,
          localReadUrl: storage.provider === 'local'
            ? `/api/shares/generations/${encodeURIComponent(shareId)}/artifacts/${encodeURIComponent(artifact.id)}`
            : undefined,
        })
        return resolved.readUrl === undefined
          ? artifact
          : {
              ...artifact,
              readUrl: resolved.readUrl,
              ...(resolved.thumbnailUrl !== undefined
                ? { thumbnailUrl: resolved.thumbnailUrl }
                : {}),
            }
      }),
    )

    return { success: true, data: { ...shared, artifacts } }
  })
  .get('/generations/:shareId/artifacts/:artifactId', async ({ request, params, set }) => {
    const shareId = params.shareId
    const artifactId = params.artifactId
    if (typeof shareId !== 'string' || shareId.length === 0 || typeof artifactId !== 'string' || artifactId.length === 0) {
      set.status = 400
      return requestErrorResponseBody(request, 'INVALID_SHARE_ARTIFACT', 'Share and artifact ids are required', set)
    }

    const artifact = await deps.generationRepository.getPublicSharedArtifact(shareId, artifactId)
    if (artifact === undefined || artifact.storageKey === undefined) {
      set.status = 404
      return requestErrorResponseBody(request, 'SHARE_ARTIFACT_NOT_FOUND', 'Shared artifact not found', set)
    }

    const storage = deps.storage
    if (storage.provider !== 'local') {
      const resolved = await resolveArtifactReadUrl.execute({ artifact, expiresInSeconds: 300 })
      if (resolved.readUrl === undefined) {
        set.status = 404
        return requestErrorResponseBody(request, 'SHARE_ARTIFACT_NOT_FOUND', 'Shared artifact not found', set)
      }
      await recordApiAuditEvent(deps.generationRepository, request, {
        action: 'artifact.read',
        outcome: 'succeeded',
        targetType: 'artifact',
        targetId: artifact.id,
        metadata: { source: 'public_share', shareId },
      })
      return Response.redirect(resolved.readUrl, 302)
    }

    let path: string
    try {
      path = resolveLocalStoragePath(deps.artifactLocalRoot, decodeURIComponent(artifact.storageKey))
    } catch (error) {
      set.status = 400
      return requestErrorResponseBody(
        request,
        'INVALID_ARTIFACT_KEY',
        error instanceof Error ? error.message : 'Invalid artifact key',
        set,
      )
    }

    try {
      const response = await createLocalFileResponse({
        path,
        maxBytes: deps.artifactConfig.maxReadBytes,
        contentType: artifact.mimeType ?? contentTypeForPath(path),
        cacheControl: 'public, max-age=300',
      })
      await recordApiAuditEvent(deps.generationRepository, request, {
        action: 'artifact.read',
        outcome: 'succeeded',
        targetType: 'artifact',
        targetId: artifact.id,
        metadata: { source: 'public_share', shareId },
      })
      return response
    } catch (error) {
      await recordApiAuditEvent(deps.generationRepository, request, {
        action: 'artifact.read',
        outcome: 'failed',
        targetType: 'artifact',
        targetId: artifact.id,
        metadata: { errorCode: auditErrorCode(error), source: 'public_share', shareId },
      })
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
      if (error instanceof LocalFileTooLargeError) set.status = 413
      else set.status = code === 'ENOENT' ? 404 : 500
      return requestErrorResponseBody(
        request,
        error instanceof LocalFileTooLargeError
          ? 'ARTIFACT_TOO_LARGE'
          : code === 'ENOENT' ? 'SHARE_ARTIFACT_NOT_FOUND' : 'ARTIFACT_READ_FAILED',
        error instanceof LocalFileTooLargeError
          ? 'Artifact exceeds the maximum response size'
          : code === 'ENOENT' ? 'Shared artifact not found' : 'Failed to read shared artifact',
        set,
        error instanceof LocalFileTooLargeError
          ? { details: { bytes: error.bytes, limit: error.limit } }
          : {},
      )
    }
  })
}

function contentTypeForPath(path: string): string {
  switch (extname(path).toLowerCase()) {
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.mp4': return 'video/mp4'
    case '.mp3':
    case '.mpeg': return 'audio/mpeg'
    case '.txt': return 'text/plain; charset=utf-8'
    case '.json': return 'application/json; charset=utf-8'
    default: return 'application/octet-stream'
  }
}
