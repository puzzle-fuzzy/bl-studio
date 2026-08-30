import { Elysia } from 'elysia'
import { z } from 'zod'
import { AuthError, type PublicUser } from '@bailian-studio/auth'
import { validateInput, ValidationError } from '@bailian-studio/shared'
import type { ApiDependencies } from '../../dependencies'
import { auditErrorCode, recordApiAuditEvent } from '../../lib/audit'
import { assertFileMatchesMime } from '../../lib/file-sniff'
import {
  clearedCookieAttributes,
  readCookie,
  SESSION_COOKIE,
  sessionCookieAttributes,
  type SessionCookieAttributes,
} from './cookies'
import { requireAuthUser } from './session'
import { createGithubOAuthHandlers } from './github-routes'

type CookieJarEntry = SessionCookieAttributes & { value: string }

function setSessionCookie(set: { cookie?: Record<string, unknown> }, cookie: CookieJarEntry): void {
  set.cookie = { ...(set.cookie ?? {}), [SESSION_COOKIE]: cookie }
}

const CredentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(256),
})

const RegisterSchema = CredentialsSchema.extend({
  displayName: z.string().trim().min(1).max(100).optional(),
})

const TokenSchema = z.object({
  token: z.string().min(32).max(512),
})

const EmailSchema = z.object({
  email: z.string().trim().email().max(254),
})

const ResetPasswordSchema = TokenSchema.extend({
  newPassword: z.string().min(8).max(256),
})

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(256),
  newPassword: z.string().min(8).max(256),
})

const ProfileUpdateSchema = z.object({
  displayName: z.string().trim().min(1).max(100),
})

/** 头像上传白名单：只允许位图。拒绝 SVG（可内联脚本，是 XSS 向量）及其它类型。 */
const AVATAR_ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])

const AVATAR_MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

/** 头像文件大小上限（与前端提示一致）。 */
const AVATAR_MAX_BYTES = 2 * 1024 * 1024

async function deleteStorageKeyBestEffort(storage: ApiDependencies['storage'], key: string): Promise<void> {
  if (storage.deleteObject === undefined) return
  try {
    await storage.deleteObject({ key })
  } catch {
    // 旧文件清理失败不阻断本次操作：孤儿对象交由存储巡检任务统一回收。
  }
}

function maxAgeFor(expiresAt: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
}

function requireSessionToken(request: Request): string {
  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE)
  if (token === undefined) throw new AuthError('AUTH_UNAUTHORIZED', 'Authentication required')
  return token
}

export function createAuthRoutes(deps: ApiDependencies) {
  const github = createGithubOAuthHandlers(deps)
  return new Elysia({ prefix: '/api/auth' })
    .get('/github', github.authorize)
    .get('/github/callback', github.callback)
    .post('/register', async ({ request, body }) => {
      try {
        const registration = await deps.authService.register(validateInput(RegisterSchema, body))
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.register',
          outcome: 'succeeded',
        })
        return { success: true, data: { registration } }
      } catch (error) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.register',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/verify-email', async ({ request, body, set }) => {
      try {
        const input = validateInput(TokenSchema, body)
        const result = await deps.authService.verifyEmail(input.token)
        setSessionCookie(set, {
          value: result.token,
          ...sessionCookieAttributes(maxAgeFor(result.expiresAt), deps.cookieSecure),
        })
        await recordApiAuditEvent(deps.auditRepository, request, {
          userId: result.user.id,
          action: 'auth.verify-email',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: result.user.id,
        })
        return { success: true, data: { user: result.user } }
      } catch (error) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.verify-email',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/resend-verification', async ({ request, body, set }) => {
      try {
        const input = validateInput(EmailSchema, body)
        const result = await deps.authService.resendVerification(input.email)
        set.status = 202
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.resend-verification',
          outcome: 'succeeded',
        })
        return { success: true, data: result }
      } catch (error) {
        if (error instanceof AuthError && error.code === 'AUTH_EMAIL_RATE_LIMITED') {
          set.status = 202
          await recordApiAuditEvent(deps.auditRepository, request, {
            action: 'auth.resend-verification',
            outcome: 'succeeded',
            metadata: { rateLimited: true },
          })
          const retryAt = error.details?.retryAt
          return {
            success: true,
            data: {
              accepted: true as const,
              ...(typeof retryAt === 'string' ? { retryAt } : {}),
            },
          }
        }
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.resend-verification',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/login', async ({ request, body, set }) => {
      try {
        const result = await deps.authService.login(validateInput(CredentialsSchema, body))
        setSessionCookie(set, {
          value: result.token,
          ...sessionCookieAttributes(maxAgeFor(result.expiresAt), deps.cookieSecure),
        })
        await recordApiAuditEvent(deps.auditRepository, request, {
          userId: result.user.id,
          action: 'auth.login',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: result.user.id,
        })
        return { success: true, data: { user: result.user } }
      } catch (error) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.login',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/forgot-password', async ({ request, body, set }) => {
      try {
        const input = validateInput(EmailSchema, body)
        const result = await deps.authService.forgotPassword(input.email)
        set.status = 202
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.forgot-password',
          outcome: 'succeeded',
        })
        return { success: true, data: result }
      } catch (error) {
        // 冷却命中时同样返回 202（accepted），避免通过状态码区分账号是否存在。
        if (error instanceof AuthError && error.code === 'AUTH_EMAIL_RATE_LIMITED') {
          set.status = 202
          await recordApiAuditEvent(deps.auditRepository, request, {
            action: 'auth.forgot-password',
            outcome: 'succeeded',
            metadata: { rateLimited: true },
          })
          return { success: true, data: { accepted: true as const } }
        }
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.forgot-password',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/reset-password', async ({ request, body }) => {
      try {
        const input = validateInput(ResetPasswordSchema, body)
        await deps.authService.resetPassword(input.token, input.newPassword)
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.reset-password',
          outcome: 'succeeded',
        })
        return new Response(null, { status: 204 })
      } catch (error) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.reset-password',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/change-password', async ({ request, body, set }) => {
      try {
        const token = requireSessionToken(request)
        const input = validateInput(ChangePasswordSchema, body)
        const result = await deps.authService.changePassword({ token, ...input })
        setSessionCookie(set, {
          value: result.token,
          ...sessionCookieAttributes(maxAgeFor(result.expiresAt), deps.cookieSecure),
        })
        await recordApiAuditEvent(deps.auditRepository, request, {
          userId: result.user.id,
          action: 'auth.change-password',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: result.user.id,
        })
        return { success: true, data: { user: result.user } }
      } catch (error) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.change-password',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/github/unlink', async ({ request }) => {
      try {
        const user = await requireAuthUser(request, deps.authService)
        const updated = await deps.authService.unlinkGithub(user.id)
        await recordApiAuditEvent(deps.auditRepository, request, {
          userId: user.id,
          action: 'auth.github',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: user.id,
          metadata: { operation: 'unlink' },
        })
        return { success: true, data: { user: updated } }
      } catch (error) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.github',
          outcome: 'failed',
          metadata: { operation: 'unlink', errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/logout', async ({ request, set }) => {
      const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE)
      try {
        if (token !== undefined) await deps.authService.revokeSessionByToken(token)
        setSessionCookie(set, clearedCookieAttributes(deps.cookieSecure))
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.logout',
          outcome: 'succeeded',
          metadata: { hadSessionCookie: token !== undefined },
        })
        return new Response(null, { status: 204 })
      } catch (error) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.logout',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error), hadSessionCookie: token !== undefined },
        })
        throw error
      }
    })
    .post('/logout-all', async ({ request, set }) => {
      try {
        const token = requireSessionToken(request)
        const user = await requireAuthUser(request, deps.authService)
        await deps.authService.revokeAllSessionsByToken(token)
        setSessionCookie(set, clearedCookieAttributes(deps.cookieSecure))
        await recordApiAuditEvent(deps.auditRepository, request, {
          userId: user.id,
          action: 'auth.logout-all',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: user.id,
        })
        return new Response(null, { status: 204 })
      } catch (error) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.logout-all',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .patch('/profile', async ({ request, body }) => {
      try {
        const user = await requireAuthUser(request, deps.authService)
        const updated = await deps.authService.updateProfile(
          user.id,
          validateInput(ProfileUpdateSchema, body),
        )
        await recordApiAuditEvent(deps.auditRepository, request, {
          userId: user.id,
          action: 'auth.profile.update',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: user.id,
        })
        return { success: true, data: { user: updated } }
      } catch (error) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.profile.update',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/avatar', async ({ request }) => {
      try {
        const user = await requireAuthUser(request, deps.authService)
        const formData = await request.formData()
        const file = formData.get('file')

        if (!(file instanceof File)) {
          throw new ValidationError('File is required', 'file')
        }
        if (!AVATAR_ALLOWED_MIME_TYPES.has(file.type)) {
          throw new ValidationError('仅支持 PNG / JPEG / WEBP 格式的头像图片', 'file')
        }
        if (file.size > AVATAR_MAX_BYTES) {
          throw new ValidationError('头像文件大小不能超过 2MB', 'file')
        }

        // P1-16：魔数校验，防止伪装 image/png 等类型上传任意内容。
        await assertFileMatchesMime(file)

        const ext = AVATAR_MIME_TO_EXT[file.type]
        const key = `avatars/${user.id}/${crypto.randomUUID()}.${ext}`
        const stored = deps.storage.writeObjectStream !== undefined
          ? await deps.storage.writeObjectStream({
              key,
              stream: file.stream(),
              contentType: file.type,
              contentLength: file.size,
            })
          : await deps.storage.writeObject({ key, body: Buffer.from(await file.arrayBuffer()), contentType: file.type })

        // 先记旧 key（updateAvatar 成功后旧值就丢了），再落库新头像。
        const previousKey = await deps.authService.getUserAvatarStorageKey(user.id)
        let updated: PublicUser
        try {
          updated = await deps.authService.updateAvatar(user.id, stored.key)
        } catch (error) {
          // 存储是外部副作用：DB 提交失败时删除新写入的对象，避免重试泄漏孤儿 blob。
          await deleteStorageKeyBestEffort(deps.storage, stored.key)
          throw error
        }
        if (previousKey !== undefined && previousKey !== null && previousKey !== stored.key) {
          await deleteStorageKeyBestEffort(deps.storage, previousKey)
        }

        await recordApiAuditEvent(deps.auditRepository, request, {
          userId: user.id,
          action: 'auth.avatar.update',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: user.id,
          metadata: { byteSize: file.size },
        })
        return { success: true, data: { user: updated } }
      } catch (error) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.avatar.update',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .delete('/avatar', async ({ request }) => {
      try {
        const user = await requireAuthUser(request, deps.authService)
        const previousKey = await deps.authService.getUserAvatarStorageKey(user.id)
        const updated = await deps.authService.removeAvatar(user.id)
        if (previousKey !== undefined && previousKey !== null) {
          await deleteStorageKeyBestEffort(deps.storage, previousKey)
        }
        await recordApiAuditEvent(deps.auditRepository, request, {
          userId: user.id,
          action: 'auth.avatar.remove',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: user.id,
        })
        return { success: true, data: { user: updated } }
      } catch (error) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.avatar.remove',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .get('/me', async ({ request }) => {
      const user = await requireAuthUser(request, deps.authService)
      return { success: true, data: { user } }
    })
}
