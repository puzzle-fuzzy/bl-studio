import { Elysia } from 'elysia'
import { z } from 'zod'
import { AuthError } from '@bailian-studio/auth'
import { validateInput } from '@bailian-studio/shared'
import type { ApiDependencies } from '../../dependencies'
import { auditErrorCode, recordApiAuditEvent } from '../../lib/audit'
import {
  clearedCookieAttributes,
  readCookie,
  SESSION_COOKIE,
  sessionCookieAttributes,
  type SessionCookieAttributes,
} from './cookies'
import { requireAuthUser } from './session'

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

function maxAgeFor(expiresAt: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
}

function requireSessionToken(request: Request): string {
  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE)
  if (token === undefined) throw new AuthError('AUTH_UNAUTHORIZED', 'Authentication required')
  return token
}

export function createAuthRoutes(deps: ApiDependencies) {
  return new Elysia({ prefix: '/api/auth' })
    .post('/register', async ({ request, body }) => {
      try {
        const registration = await deps.authService.register(validateInput(RegisterSchema, body))
        await recordApiAuditEvent(deps.generationRepository, request, {
          action: 'auth.register',
          outcome: 'succeeded',
        })
        return { success: true, data: { registration } }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
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
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: result.user.id,
          action: 'auth.verify-email',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: result.user.id,
        })
        return { success: true, data: { user: result.user } }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
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
        await recordApiAuditEvent(deps.generationRepository, request, {
          action: 'auth.resend-verification',
          outcome: 'succeeded',
        })
        return { success: true, data: result }
      } catch (error) {
        if (error instanceof AuthError && error.code === 'AUTH_EMAIL_RATE_LIMITED') {
          set.status = 202
          await recordApiAuditEvent(deps.generationRepository, request, {
            action: 'auth.resend-verification',
            outcome: 'succeeded',
            metadata: { rateLimited: true },
          })
          return { success: true, data: { accepted: true as const } }
        }
        await recordApiAuditEvent(deps.generationRepository, request, {
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
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: result.user.id,
          action: 'auth.login',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: result.user.id,
        })
        return { success: true, data: { user: result.user } }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
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
        await recordApiAuditEvent(deps.generationRepository, request, {
          action: 'auth.forgot-password',
          outcome: 'succeeded',
        })
        return { success: true, data: result }
      } catch (error) {
        // 冷却命中时同样返回 202（accepted），避免通过状态码区分账号是否存在。
        if (error instanceof AuthError && error.code === 'AUTH_EMAIL_RATE_LIMITED') {
          set.status = 202
          await recordApiAuditEvent(deps.generationRepository, request, {
            action: 'auth.forgot-password',
            outcome: 'succeeded',
            metadata: { rateLimited: true },
          })
          return { success: true, data: { accepted: true as const } }
        }
        await recordApiAuditEvent(deps.generationRepository, request, {
          action: 'auth.forgot-password',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/reset-password', async ({ request, body, set }) => {
      try {
        const input = validateInput(ResetPasswordSchema, body)
        await deps.authService.resetPassword(input.token, input.newPassword)
        await recordApiAuditEvent(deps.generationRepository, request, {
          action: 'auth.reset-password',
          outcome: 'succeeded',
        })
        return new Response(null, { status: 204 })
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
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
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: result.user.id,
          action: 'auth.change-password',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: result.user.id,
        })
        return { success: true, data: { user: result.user } }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          action: 'auth.change-password',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/logout', async ({ request, set }) => {
      const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE)
      try {
        if (token !== undefined) await deps.authService.revokeSessionByToken(token)
        setSessionCookie(set, clearedCookieAttributes(deps.cookieSecure))
        await recordApiAuditEvent(deps.generationRepository, request, {
          action: 'auth.logout',
          outcome: 'succeeded',
          metadata: { hadSessionCookie: token !== undefined },
        })
        return new Response(null, { status: 204 })
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
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
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: user.id,
          action: 'auth.logout-all',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: user.id,
        })
        return new Response(null, { status: 204 })
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          action: 'auth.logout-all',
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
