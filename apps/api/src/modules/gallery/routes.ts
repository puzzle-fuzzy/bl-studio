import { extname } from 'node:path'
import { z } from 'zod'
import { Elysia } from 'elysia'
import { resolveLocalStoragePath } from '@bailian-studio/storage'
import type { GalleryItem, GenerationArtifact } from '@bailian-studio/generation-repository'
import { validateInput } from '@bailian-studio/shared'
import type { ApiDependencies } from '../../dependencies'
import { requestErrorResponseBody } from '../../lib/http-errors'
import { auditErrorCode, recordApiAuditEvent } from '../../lib/audit'
import { LocalFileTooLargeError, createLocalFileResponse } from '../../lib/local-file-response'
import { requireAuthUser } from '../auth/session'
import { resolveArtifactReadUrlUseCase } from '../artifacts/service'

/**
 * 社区画廊模块。
 *
 * 与 generation 主模块的 owner 路由分开维护（community surface 统一挂
 * `/api/gallery`），避免与现有 `/api/generations/:id` 系列路由产生静态/参数段
 * 冲突。所有端点都要求登录（同事内网）；公开只读通过"记录 visibility='public'"
 * 控制，越权访问统一 404（IDOR 模式）。
 *
 * 可见性/点赞/收藏的持久化在 generation-repository 的 content 模块
 * （packages/generation-repository/src/content.ts）。
 */

const GalleryIdParamsSchema = z.object({ id: z.string().trim().min(1).max(256) }).strict()
const ArtifactParamsSchema = z.object({
  id: z.string().trim().min(1).max(256),
  artifactId: z.string().trim().min(1).max(256),
}).strict()
const SetVisibilitySchema = z.object({ visibility: z.enum(['private', 'public']) }).strict()
const ListGalleryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).max(1024).optional(),
  category: z.enum(['image', 'video', 'audio', 'text']).optional(),
  modelId: z.string().trim().min(1).max(256).optional(),
}).strict()
const FavoriteQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).max(1024).optional(),
}).strict()

type GalleryCoverResponse = { id: string; kind: string; readUrl?: string; thumbnailUrl?: string }

export function createGalleryRoutes(deps: ApiDependencies) {
  const resolveArtifactReadUrl = resolveArtifactReadUrlUseCase({ storage: deps.storage })

  async function galleryItemCover(
    item: GalleryItem,
  ): Promise<GalleryCoverResponse | undefined> {
    if (item.cover === undefined) return undefined
    const resolved = await resolveArtifactReadUrl.execute({
      artifact: item.cover,
      localReadUrl: deps.storage.provider === 'local'
        ? `/api/gallery/generations/${encodeURIComponent(item.id)}/artifacts/${encodeURIComponent(item.cover.id)}`
        : undefined,
    })
    return {
      id: item.cover.id,
      kind: item.cover.kind,
      ...(resolved.readUrl !== undefined ? { readUrl: resolved.readUrl } : {}),
      ...(resolved.thumbnailUrl !== undefined ? { thumbnailUrl: resolved.thumbnailUrl } : {}),
    }
  }

  async function artifactWithReadUrl(
    recordId: string,
    artifact: GenerationArtifact,
  ): Promise<{ id: string; kind: string; readUrl?: string; thumbnailUrl?: string }> {
    if (artifact.status !== 'stored' || artifact.storageKey === undefined) {
      return { id: artifact.id, kind: artifact.kind }
    }
    const resolved = await resolveArtifactReadUrl.execute({
      artifact,
      localReadUrl: deps.storage.provider === 'local'
        ? `/api/gallery/generations/${encodeURIComponent(recordId)}/artifacts/${encodeURIComponent(artifact.id)}`
        : undefined,
    })
    return {
      id: artifact.id,
      kind: artifact.kind,
      ...(resolved.readUrl !== undefined ? { readUrl: resolved.readUrl } : {}),
      ...(resolved.thumbnailUrl !== undefined ? { thumbnailUrl: resolved.thumbnailUrl } : {}),
    }
  }

  return new Elysia()
    .get('/api/gallery', async ({ request, query }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(ListGalleryQuerySchema, query)
      const page = await deps.generationRepository.listGalleryGenerations({
        viewerId: user.id,
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
        ...(input.modelId !== undefined ? { modelId: input.modelId } : {}),
      })
      const items = await Promise.all(page.items.map(async item => ({
        id: item.id,
        modelId: item.modelId,
        category: item.category,
        author: item.author,
        inputParams: item.inputParams,
        ...(item.cover !== undefined ? { cover: await galleryItemCover(item) } : {}),
        likeCount: item.likeCount,
        likedByViewer: item.likedByViewer,
        favoritedByViewer: item.favoritedByViewer,
        createdAt: item.createdAt,
      })))
      return {
        success: true,
        data: {
          items,
          ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}),
        },
      }
    })
    .get('/api/gallery/favorites', async ({ request, query }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(FavoriteQuerySchema, query)
      const page = await deps.generationRepository.listGenerationFavorites({
        userId: user.id,
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
      })
      const items = await Promise.all(page.items.map(async item => ({
        id: item.id,
        modelId: item.modelId,
        category: item.category,
        author: item.author,
        inputParams: item.inputParams,
        ...(item.cover !== undefined ? { cover: await galleryItemCover(item) } : {}),
        likeCount: item.likeCount,
        likedByViewer: item.likedByViewer,
        favoritedByViewer: item.favoritedByViewer,
        createdAt: item.createdAt,
      })))
      return {
        success: true,
        data: {
          items,
          ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}),
        },
      }
    })
    .get('/api/gallery/generations/:id', async ({ request, params, set }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { id } = validateInput(GalleryIdParamsSchema, params)
      const detail = await deps.generationRepository.getGalleryGeneration({ recordId: id, viewerId: user.id })
      if (detail === undefined) {
        set.status = 404
        return requestErrorResponseBody(request, 'GALLERY_ITEM_NOT_FOUND', 'Gallery item not found', set)
      }
      const artifacts = await Promise.all(detail.artifacts.map(artifact => artifactWithReadUrl(id, artifact)))
      return {
        success: true,
        data: {
          record: detail.record,
          author: detail.author,
          likeCount: detail.likeCount,
          likedByViewer: detail.likedByViewer,
          favoritedByViewer: detail.favoritedByViewer,
          artifacts,
        },
      }
    })
    .patch('/api/gallery/generations/:id/visibility', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { id } = validateInput(GalleryIdParamsSchema, params)
      const { visibility } = validateInput(SetVisibilitySchema, body)
      await deps.generationRepository.setGenerationVisibility({
        userId: user.id,
        recordId: id,
        visibility,
      })
      return { success: true, data: { visibility } }
    })
    .post('/api/gallery/generations/:id/like', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { id } = validateInput(GalleryIdParamsSchema, params)
      try {
        const result = await deps.generationRepository.setGenerationLike({ userId: user.id, recordId: id, liked: true })
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: user.id,
          action: 'gallery.like',
          outcome: 'succeeded',
          targetType: 'generation',
          targetId: id,
        })
        return { success: true, data: result }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: user.id,
          action: 'gallery.like',
          outcome: 'failed',
          targetType: 'generation',
          targetId: id,
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .delete('/api/gallery/generations/:id/like', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { id } = validateInput(GalleryIdParamsSchema, params)
      const result = await deps.generationRepository.setGenerationLike({ userId: user.id, recordId: id, liked: false })
      return { success: true, data: result }
    })
    .post('/api/gallery/generations/:id/favorite', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { id } = validateInput(GalleryIdParamsSchema, params)
      try {
        const result = await deps.generationRepository.setGenerationFavorite({ userId: user.id, recordId: id, favorited: true })
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: user.id,
          action: 'gallery.favorite',
          outcome: 'succeeded',
          targetType: 'generation',
          targetId: id,
        })
        return { success: true, data: result }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: user.id,
          action: 'gallery.favorite',
          outcome: 'failed',
          targetType: 'generation',
          targetId: id,
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .delete('/api/gallery/generations/:id/favorite', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { id } = validateInput(GalleryIdParamsSchema, params)
      const result = await deps.generationRepository.setGenerationFavorite({ userId: user.id, recordId: id, favorited: false })
      return { success: true, data: result }
    })
    .get('/api/gallery/generations/:id/favorite', async ({ request, params, set }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { id } = validateInput(GalleryIdParamsSchema, params)
      const favorited = await deps.generationRepository.getGenerationFavorited({ userId: user.id, recordId: id })
      if (favorited === undefined) {
        set.status = 404
        return requestErrorResponseBody(request, 'GALLERY_ITEM_NOT_FOUND', 'Gallery item not found', set)
      }
      return { success: true, data: { favorited } }
    })
    .get('/api/gallery/generations/:id/artifacts/:artifactId', async ({ request, params, set }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { id, artifactId } = validateInput(ArtifactParamsSchema, params)

      const artifact = await deps.generationRepository.getGalleryArtifact({ recordId: id, artifactId })
      if (artifact === undefined || artifact.storageKey === undefined) {
        set.status = 404
        return requestErrorResponseBody(request, 'GALLERY_ARTIFACT_NOT_FOUND', 'Gallery artifact not found', set)
      }

      const storage = deps.storage
      if (storage.provider !== 'local') {
        const resolved = await resolveArtifactReadUrl.execute({ artifact, expiresInSeconds: 300 })
        if (resolved.readUrl === undefined) {
          set.status = 404
          return requestErrorResponseBody(request, 'GALLERY_ARTIFACT_NOT_FOUND', 'Gallery artifact not found', set)
        }
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: user.id,
          action: 'artifact.read',
          outcome: 'succeeded',
          targetType: 'artifact',
          targetId: artifact.id,
          metadata: { source: 'gallery', recordId: id },
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
          cacheControl: 'private, max-age=300',
        })
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: user.id,
          action: 'artifact.read',
          outcome: 'succeeded',
          targetType: 'artifact',
          targetId: artifact.id,
          metadata: { source: 'gallery', recordId: id },
        })
        return response
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: user.id,
          action: 'artifact.read',
          outcome: 'failed',
          targetType: 'artifact',
          targetId: artifact.id,
          metadata: { errorCode: auditErrorCode(error), source: 'gallery', recordId: id },
        })
        const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
        if (error instanceof LocalFileTooLargeError) set.status = 413
        else set.status = code === 'ENOENT' ? 404 : 500
        return requestErrorResponseBody(
          request,
          error instanceof LocalFileTooLargeError
            ? 'ARTIFACT_TOO_LARGE'
            : code === 'ENOENT' ? 'GALLERY_ARTIFACT_NOT_FOUND' : 'ARTIFACT_READ_FAILED',
          error instanceof LocalFileTooLargeError
            ? 'Artifact exceeds the maximum response size'
            : code === 'ENOENT' ? 'Gallery artifact not found' : 'Failed to read gallery artifact',
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
    case '.webp': return 'image/webp'
    case '.mp4': return 'video/mp4'
    case '.mp3':
    case '.mpeg': return 'audio/mpeg'
    case '.txt': return 'text/plain; charset=utf-8'
    case '.json': return 'application/json; charset=utf-8'
    default: return 'application/octet-stream'
  }
}
