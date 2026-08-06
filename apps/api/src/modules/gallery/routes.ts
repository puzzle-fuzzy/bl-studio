import { z } from 'zod'
import { Elysia } from 'elysia'
import { resolveLocalStoragePath } from '@bailian-studio/storage'
import type { GalleryItem, GenerationArtifact } from '@bailian-studio/generation-repository'
import { createLogger, validateInput } from '@bailian-studio/shared'
import type { ApiDependencies } from '../../dependencies'
import { requestErrorResponseBody } from '../../lib/http-errors'
import { auditErrorCode, recordApiAuditEvent } from '../../lib/audit'
import { contentTypeForPath } from '../../lib/artifact-content-types'
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
  /** 按作者过滤（用户 id）。 */
  authorId: z.string().trim().min(1).max(256).optional(),
  /** 提示词/参数正文搜索。 */
  q: z.string().trim().min(1).max(200).optional(),
  /** 排序：latest（默认）| hot（按点赞数）。 */
  sort: z.enum(['latest', 'hot']).optional(),
}).strict()
const FavoriteQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).max(1024).optional(),
}).strict()

type GalleryCoverResponse = { id: string; kind: string; readUrl?: string; thumbnailUrl?: string }

export function createGalleryRoutes(deps: ApiDependencies) {
  const resolveArtifactReadUrl = resolveArtifactReadUrlUseCase({ storage: deps.storage })
  const accessLogger = createLogger('gallery')

  /**
   * 社交通知 + SSE 推送：作品被点赞/收藏时通知作者（非本人）。
   * best-effort：通知/推送失败不影响点赞收藏主流程（与审计同模式）。
   */
  async function notifyAuthorOnInteraction(
    actor: { id: string; displayName: string | null },
    recordId: string,
    kind: 'like' | 'favorite',
  ): Promise<void> {
    try {
      const owner = await deps.generationRepository.getGenerationOwner(recordId)
      if (owner === undefined || owner === actor.id) return
      const actorName = actor.displayName ?? actor.id.slice(0, 8)
      await deps.generationRepository.createSocialNotification({
        recipientId: owner,
        actorId: actor.id,
        kind,
        recordId,
        title: kind === 'like' ? '收到新点赞' : '收到新收藏',
        body: `「${actorName}」${kind === 'like' ? '点赞了' : '收藏了'}你的公开作品`,
      })
      deps.generationSseHub.publish({
        event: 'notification',
        data: { userId: owner, message: 'social-notification', level: 'info' },
      })
    } catch (error) {
      // 整体 best-effort：查询作者/写通知/推送任何一步失败都不影响点赞收藏主流程。
      // 不记录异常对象/消息：数据库错误可能包含连接信息；action 足以用于告警。
      accessLogger.warn('notification.create_failed', {
        kind,
        recordId,
        errorName: error instanceof Error ? error.name : 'unknown',
      })
    }
  }

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
  ): Promise<{ id: string; kind: string; readUrl?: string; thumbnailUrl?: string; text?: string }> {
    const resolved = artifact.status === 'stored' && artifact.storageKey !== undefined
      ? await resolveArtifactReadUrl.execute({
          artifact,
          localReadUrl: deps.storage.provider === 'local'
            ? `/api/gallery/generations/${encodeURIComponent(recordId)}/artifacts/${encodeURIComponent(artifact.id)}`
            : undefined,
        })
      : undefined
    return {
      id: artifact.id,
      kind: artifact.kind,
      // 文本类产物的正文直接落库（generation_artifacts.text），随详情返回，
      // 前端无需再拉文件即可渲染；其它 kind 不带 text。
      ...(artifact.kind === 'text' && artifact.text !== undefined ? { text: artifact.text } : {}),
      ...(resolved?.readUrl !== undefined ? { readUrl: resolved.readUrl } : {}),
      ...(resolved?.thumbnailUrl !== undefined ? { thumbnailUrl: resolved.thumbnailUrl } : {}),
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
        ...(input.authorId !== undefined ? { authorId: input.authorId } : {}),
        ...(input.q !== undefined && input.q.length > 0 ? { q: input.q } : {}),
        ...(input.sort !== undefined ? { sort: input.sort } : {}),
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
      // 公开/私有切换是社区内容生命周期中最需要留痕的动作（此前未审计）。
      await recordApiAuditEvent(deps.generationRepository, request, {
        userId: user.id,
        action: 'gallery.visibility-change',
        outcome: 'succeeded',
        targetType: 'generation',
        targetId: id,
        metadata: { visibility },
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
        // 社交通知：通知作品作者（非本人）。
        await notifyAuthorOnInteraction(user, id, 'like')
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
      await recordApiAuditEvent(deps.generationRepository, request, {
        userId: user.id,
        action: 'gallery.like',
        outcome: 'succeeded',
        targetType: 'generation',
        targetId: id,
        metadata: { removed: true },
      })
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
        // 社交通知：通知作品作者（非本人）。
        await notifyAuthorOnInteraction(user, id, 'favorite')
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
      await recordApiAuditEvent(deps.generationRepository, request, {
        userId: user.id,
        action: 'gallery.favorite',
        outcome: 'succeeded',
        targetType: 'generation',
        targetId: id,
        metadata: { removed: true },
      })
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
