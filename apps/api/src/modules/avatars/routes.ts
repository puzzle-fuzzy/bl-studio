/**
 * 公开头像端点：`GET /api/avatars/:userId`。
 *
 * 所有用户（含未上传头像者）都走同一个 URL：
 * - 未上传自定义头像（或用户不存在）→ 回传由 userId 确定性生成的 identicon SVG；
 * - 已上传 → local 有界流式回传文件，OSS 302 到签名 URL。
 *
 * 全程不暴露存储 key / 隐私字段，也不依赖调用方登录态（画廊等公共面要用）。
 * 同一 URL 的内容会随用户上传而变化，故缓存用短 max-age（≤1 分钟）而非 immutable。
 */
import { Elysia } from 'elysia'
import { resolveLocalStoragePath } from '@bailian-studio/storage'
import type { ApiDependencies } from '../../dependencies'
import { avatarContentTypeForKey, generateAvatarSvg } from '../../lib/avatar'
import { createLocalFileResponse } from '../../lib/local-file-response'

function identiconResponse(userId: string): Response {
  return new Response(generateAvatarSvg(userId), {
    headers: {
      'content-type': 'image/svg+xml',
      'cache-control': 'public, max-age=60',
    },
  })
}

export function createAvatarRoutes(deps: ApiDependencies) {
  return new Elysia({ prefix: '/api/avatars' })
    .get('/:userId', async ({ params }) => {
      const storageKey = await deps.authService.getUserAvatarStorageKey(params.userId)
      if (storageKey === null || storageKey === undefined) {
        return identiconResponse(params.userId)
      }

      if (deps.storage.provider === 'oss') {
        const url = await deps.storage.createReadUrl({ key: storageKey, expiresInSeconds: 3600 })
        return new Response(null, {
          status: 302,
          headers: { location: url, 'cache-control': 'no-cache' },
        })
      }

      try {
        const path = resolveLocalStoragePath(deps.artifactLocalRoot, storageKey)
        return await createLocalFileResponse({
          path,
          maxBytes: deps.artifactConfig.maxReadBytes,
          contentType: avatarContentTypeForKey(storageKey),
          cacheControl: 'public, max-age=60',
        })
      } catch {
        // 存储文件缺失（ENOENT 等）时优雅降级为 identicon，绝不 500 破图。
        return identiconResponse(params.userId)
      }
    })
}
