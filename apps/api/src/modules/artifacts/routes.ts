import { extname } from 'node:path'
import { Elysia } from 'elysia'
import type { ArtifactKind } from '@bailian-studio/generation-repository'
import {
  assetDownloadFileName,
  attachmentContentDisposition,
  resolveLocalStoragePath,
} from '@bailian-studio/storage'
import type { ApiDependencies } from '../../dependencies'
import { requireAuthUser } from '../auth/session'
import { requestErrorResponseBody } from '../../lib/http-errors'
import { auditErrorCode, recordApiAuditEvent } from '../../lib/audit'
import { LocalFileTooLargeError, createLocalFileResponse } from '../../lib/local-file-response'
import { resolveArtifactReadUrlUseCase } from './service'

/**
 * 允许的 artifact kind 白名单（与 ArtifactKind 联合保持一致）。
 * 任何不在此集合内的 kind 都应在查询前以 400 拒绝，而不是被静默 cast 成
 * GenerationArtifact['kind'] 后去查一个不可能存在的值。
 */
const ALLOWED_ARTIFACT_KINDS: ReadonlySet<ArtifactKind> = new Set<ArtifactKind>([
  'image',
  'video',
  'audio',
  'text',
  'archive',
])

export function createArtifactRoutes(deps: ApiDependencies) {
  const resolveArtifactReadUrl = resolveArtifactReadUrlUseCase({ storage: deps.storage })
  return new Elysia({ prefix: '/api/artifacts' })
  // 「我的作品库」：列出当前用户拥有的 artifact，可选 kind 过滤 + keyset 分页。
  // 必须放在 /local/* 之前注册，否则会被通配路由吞掉。
  .get('/', async ({ request, query, set }) => {
    const user = await requireAuthUser(request, deps.authService)
    const limit = typeof query.limit === 'string' ? Number(query.limit) : undefined
    const cursor = typeof query.cursor === 'string' ? query.cursor : undefined
    const kindParam = typeof query.kind === 'string' ? query.kind : undefined

    // 显式校验 kind：避免把任意字符串 cast 成 ArtifactKind 后去查不可能的值。
    if (kindParam !== undefined && !ALLOWED_ARTIFACT_KINDS.has(kindParam as ArtifactKind)) {
      set.status = 400
      return requestErrorResponseBody(request, 'VALIDATION_ERROR', `Invalid artifact kind: ${kindParam}`, set)
    }

    const repository = deps.generationRepository
    const result = await repository.listArtifactsForUser(user.id, {
      ...(limit !== undefined ? { limit } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
      ...(kindParam !== undefined ? { kind: kindParam as ArtifactKind } : {}),
    })

    const items = await Promise.all(result.items.map(artifact => resolveArtifactReadUrl.execute({ artifact })))
    await Promise.all(items
      .filter(artifact => artifact.readUrl !== undefined)
      .map(artifact => recordApiAuditEvent(deps.auditRepository, request, {
        userId: user.id,
        action: 'artifact.read',
        outcome: 'succeeded',
        targetType: 'artifact',
        targetId: artifact.id,
        metadata: { source: 'artifact_library' },
      })))
    return { success: true, data: { items, ...(result.nextCursor !== undefined ? { nextCursor: result.nextCursor } : {}) } }
  })
  .get('/local/*', async ({ request, params, set }) => {
    const user = await requireAuthUser(request, deps.authService)
    const key = params['*']
    if (typeof key !== 'string' || key.length === 0) {
      set.status = 400
      return requestErrorResponseBody(request, 'INVALID_ARTIFACT_KEY', 'Artifact key is required', set)
    }

    let decodedKey: string
    let path: string
    try {
      decodedKey = decodeURIComponent(key)
      path = resolveLocalStoragePath(deps.artifactLocalRoot, decodedKey)
    } catch (error) {
      set.status = 400
      return requestErrorResponseBody(
        request,
        'INVALID_ARTIFACT_KEY',
        error instanceof Error ? error.message : 'Invalid artifact key',
        set,
      )
    }

    const repository = deps.generationRepository
    const owned = await repository.getOwnedStorageObject({ userId: user.id, storageKey: decodedKey })
    if (owned === undefined) {
      set.status = 404
      return requestErrorResponseBody(request, 'ARTIFACT_NOT_FOUND', `Artifact not found: ${key}`, set)
    }

    try {
      const isDownload = new URL(request.url).searchParams.get('download') === '1'
      const resolvedContentType = owned.mimeType ?? contentTypeForPath(path)
      const response = await createLocalFileResponse({
        path,
        maxBytes: deps.artifactConfig.maxReadBytes,
        contentType: resolvedContentType,
        cacheControl: 'private, max-age=300',
        ...(isDownload
          ? {
              contentDisposition: attachmentContentDisposition(
                assetDownloadFileName(owned.fileName, owned.id, resolvedContentType),
              ),
            }
          : {}),
      })
      await recordApiAuditEvent(deps.auditRepository, request, {
        userId: user.id,
        action: 'artifact.read',
        outcome: 'succeeded',
        targetType: 'artifact',
        targetId: owned.id,
        metadata: { source: owned.source },
      })
      return response
    } catch (error) {
      await recordApiAuditEvent(deps.auditRepository, request, {
        userId: user.id,
        action: 'artifact.read',
        outcome: 'failed',
        targetType: 'artifact',
        targetId: owned.id,
        metadata: { errorCode: auditErrorCode(error), source: owned.source },
      })
      const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
      if (error instanceof LocalFileTooLargeError) set.status = 413
      else set.status = code === 'ENOENT' ? 404 : 500
      return requestErrorResponseBody(
        request,
        error instanceof LocalFileTooLargeError
          ? 'ARTIFACT_TOO_LARGE'
          : code === 'ENOENT' ? 'ARTIFACT_NOT_FOUND' : 'ARTIFACT_READ_FAILED',
        error instanceof LocalFileTooLargeError
          ? 'Artifact exceeds the maximum response size'
          : code === 'ENOENT' ? `Artifact not found: ${key}` : 'Failed to read artifact',
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
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.mp4':
      return 'video/mp4'
    case '.mp3':
    case '.mpeg':
      return 'audio/mpeg'
    case '.txt':
      return 'text/plain; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    default:
      return 'application/octet-stream'
  }
}
