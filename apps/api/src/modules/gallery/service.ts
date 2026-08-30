/**
 * Gallery 业务逻辑（P1-D：从 gallery/routes.ts 和 admin/routes.ts 的重复样板中提取）。
 *
 * 路由只做 HTTP 适配（认证、校验、响应整形）；封面解析、产物 readUrl 映射、
 * 社交通知编排、本地产物流式等业务逻辑收敛到这里。admin 复用同一 service，
 * 仅 localReadUrl 前缀不同（/api/gallery vs /api/admin/gallery）。
 */
import type { GenerationArtifact } from '@bailian-studio/generation-repository'
import type { NotificationRepository } from '@bailian-studio/generation-repository'
import type { StorageAdapter } from '@bailian-studio/storage'
import type { Logger } from '@bailian-studio/shared'
import type { GenerationSseHub } from '../generations/sse-hub'
import { resolveArtifactReadUrlUseCase } from '../artifacts/service'
import { LocalFileTooLargeError, createLocalFileResponse } from '../../lib/local-file-response'
import { resolveLocalStoragePath } from '@bailian-studio/storage'

export interface GalleryItemCover {
  id: string
  kind: string
  readUrl?: string
  thumbnailUrl?: string
}

export interface GalleryArtifactResponse {
  id: string
  kind: string
  readUrl?: string
  thumbnailUrl?: string
  text?: string
}

export interface GalleryServiceDeps {
  readonly notificationRepository: Pick<NotificationRepository, 'getGenerationOwner' | 'createSocialNotification'>
  readonly storage: StorageAdapter
  readonly sseHub: GenerationSseHub
  readonly logger: Logger
  /** localReadUrl 前缀：gallery 用 /api/gallery，admin 用 /api/admin/gallery。 */
  readonly localUrlPrefix: string
}

/**
 * 把 gallery/admin item 的封面解析为带签名 readUrl 的响应。
 * gallery 和 admin 共用（此前两处逐字重复，仅 URL 前缀不同）。
 */
export async function resolveGalleryCover(
  item: { id: string; cover?: GenerationArtifact | { id: string; kind: string } & Record<string, unknown> },
  deps: Pick<GalleryServiceDeps, 'storage' | 'localUrlPrefix'>,
): Promise<GalleryItemCover | undefined> {
  if (item.cover === undefined) return undefined
  const cover = item.cover
  const resolved = await resolveArtifactReadUrlUseCase({ storage: deps.storage }).execute({
    artifact: cover as Parameters<ReturnType<typeof resolveArtifactReadUrlUseCase>['execute']>[0]['artifact'],
    localReadUrl: deps.storage.provider === 'local'
      ? `${deps.localUrlPrefix}/generations/${encodeURIComponent(item.id)}/artifacts/${encodeURIComponent(cover.id)}`
      : undefined,
  })
  return {
    id: cover.id,
    kind: cover.kind,
    ...(resolved.readUrl !== undefined ? { readUrl: resolved.readUrl } : {}),
    ...(resolved.thumbnailUrl !== undefined ? { thumbnailUrl: resolved.thumbnailUrl } : {}),
  }
}

/**
 * 把 generation artifact 映射为 gallery 响应（带签名 readUrl 或落库 text）。
 */
export async function resolveGalleryArtifact(
  recordId: string,
  artifact: GenerationArtifact,
  deps: Pick<GalleryServiceDeps, 'storage' | 'localUrlPrefix'>,
): Promise<GalleryArtifactResponse> {
  const resolved = artifact.status === 'stored' && artifact.storageKey !== undefined
    ? await resolveArtifactReadUrlUseCase({ storage: deps.storage }).execute({
        artifact,
        localReadUrl: deps.storage.provider === 'local'
          ? `${deps.localUrlPrefix}/generations/${encodeURIComponent(recordId)}/artifacts/${encodeURIComponent(artifact.id)}`
          : undefined,
      })
    : undefined
  return {
    id: artifact.id,
    kind: artifact.kind,
    ...(resolved?.readUrl !== undefined ? { readUrl: resolved.readUrl } : {}),
    ...(resolved?.thumbnailUrl !== undefined ? { thumbnailUrl: resolved.thumbnailUrl } : {}),
    ...(artifact.text !== undefined ? { text: artifact.text } : {}),
  }
}

/**
 * 社交通知 + SSE 推送：作品被点赞/收藏时通知作者（非本人）。
 * best-effort：通知/推送失败不影响主流程。
 */
export async function notifyAuthorOnInteraction(
  actor: { id: string; displayName: string | null },
  recordId: string,
  kind: 'like' | 'favorite',
  deps: GalleryServiceDeps,
): Promise<void> {
  try {
    const owner = await deps.notificationRepository.getGenerationOwner(recordId)
    if (owner === undefined || owner === actor.id) return
    const actorName = actor.displayName ?? actor.id.slice(0, 8)
    await deps.notificationRepository.createSocialNotification({
      recipientId: owner,
      actorId: actor.id,
      kind,
      recordId,
      title: kind === 'like' ? '收到新点赞' : '收到新收藏',
      body: `「${actorName}」${kind === 'like' ? '点赞了' : '收藏了'}你的公开作品`,
    })
    deps.sseHub.publish({
      event: 'notification',
      data: { userId: owner, message: 'social-notification', level: 'info' },
    })
  }
  catch (error) {
    deps.logger.warn('notification.create_failed', {
      kind,
      recordId,
      errorName: error instanceof Error ? error.name : 'unknown',
    })
  }
}

/**
 * 本地产物流式响应（gallery 和 admin 共用）。
 * 处理 local storage 的文件读取 + 错误映射（ENOENT→404、超大→413）。
 */
export async function serveLocalArtifact(
  rootDir: string,
  storageKey: string,
  options: { maxBytes: number; contentType: string; cacheControl?: string },
): Promise<Response> {
  try {
    const path = resolveLocalStoragePath(rootDir, decodeURIComponent(storageKey))
    return await createLocalFileResponse({
      path,
      maxBytes: options.maxBytes,
      contentType: options.contentType,
      cacheControl: options.cacheControl ?? 'private, max-age=300',
    })
  }
  catch (error) {
    if (error instanceof LocalFileTooLargeError) {
      return new Response(null, { status: 413 })
    }
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === 'ENOENT') {
      return new Response(null, { status: 404 })
    }
    return new Response(null, { status: 500 })
  }
}
