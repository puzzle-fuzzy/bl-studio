import { randomBytes } from 'node:crypto'
import type { BailianStudioDb } from '@bailian-studio/db'
import { createLogger, ValidationError } from '@bailian-studio/shared'
import type { TransactionalEmailSender } from './email'
import { AuthError } from './errors'
import { signJwt, verifyJwt } from './jwt'
import { hashPassword, verifyPassword } from './password'
import {
  consumeAuthActionToken,
  createAuthActionToken,
  createSession,
  createUserInTransaction,
  findActiveSession,
  findActiveUserByEmail,
  findActiveUserByGithubId,
  findActiveUserById,
  findLatestActiveAuthActionToken,
  linkGithubId,
  lockAuthTokenScope,
  markUserEmailVerified,
  revokeActiveTokens,
  revokeAllSessions,
  revokeSession,
  updateUserPassword,
  type AuthActionTokenPurpose,
  type UserRepositoryRecord,
} from './repository'

export interface PublicUser {
  id: string
  email: string
  displayName: string | null
  role: 'user' | 'admin'
  emailVerifiedAt: string
}

export interface AuthResult {
  token: string
  user: PublicUser
  expiresAt: Date
}

export interface VerifiedSession {
  user: PublicUser
  sessionId: string
}

export interface RegistrationResult {
  status: 'verification_required'
  email: string
  resendAvailableAt: string
}

export interface EmailActionAccepted {
  accepted: true
  retryAt?: string
}

export interface AuthServiceOptions {
  db: BailianStudioDb
  jwtSecret: string
  emailSender?: TransactionalEmailSender
  publicWebOrigin?: string
  sessionTtlSeconds?: number
  verificationTokenTtlSeconds?: number
  passwordResetTokenTtlSeconds?: number
  resendCooldownSeconds?: number
  now?: () => Date
}

export interface AuthService {
  register(input: { email: string; password: string; displayName?: string }): Promise<RegistrationResult>
  verifyEmail(rawToken: string): Promise<AuthResult>
  resendVerification(email: string): Promise<EmailActionAccepted>
  login(input: { email: string; password: string }): Promise<AuthResult>
  loginWithGithub(input: { githubId: string; email: string; displayName?: string }): Promise<AuthResult>
  forgotPassword(email: string): Promise<EmailActionAccepted>
  resetPassword(rawToken: string, newPassword: string): Promise<void>
  changePassword(input: {
    token: string
    currentPassword: string
    newPassword: string
  }): Promise<AuthResult>
  verifyToken(token: string): Promise<VerifiedSession | undefined>
  revokeSessionByToken(token: string): Promise<void>
  revokeAllSessionsByToken(token: string): Promise<void>
}

const DEFAULT_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60
const DEFAULT_VERIFICATION_TTL_SECONDS = 24 * 60 * 60
const DEFAULT_PASSWORD_RESET_TTL_SECONDS = 30 * 60
const DEFAULT_RESEND_COOLDOWN_SECONDS = 60

const authLogger = createLogger('auth')

const unavailableEmailSender: TransactionalEmailSender = {
  async sendEmailVerification() {
    throw new Error('Transactional email is not configured')
  },
  async sendPasswordReset() {
    throw new Error('Transactional email is not configured')
  },
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase()
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError('A valid email is required', 'email')
  }
  return email
}

function validatePassword(password: string, field = 'password'): void {
  if (password.length < 8 || password.length > 256) {
    throw new ValidationError('Password must be 8-256 characters', field)
  }
}

/**
 * 掩码邮箱用于展示（如注册后提示"已发送到 xxx@domain"）。
 *
 * 隐私原则：避免泄露邮箱首字符。超短 local（≤2 字符）整体掩码为 `***`；
 * 较长 local 保留首尾字符便于用户辨认，中间掩码。域名保持原样。
 */
function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@')
  if (local.length <= 2) return `***@${domain}`
  return `${local[0]}${'*'.repeat(Math.max(1, local.length - 2))}${local[local.length - 1]}@${domain}`
}

function normalizeWebOrigin(origin: string): string {
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    throw new Error('publicWebOrigin must be an absolute http(s) URL')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('publicWebOrigin must be an absolute http(s) URL')
  }
  return parsed.origin
}

function rawActionToken(): string {
  return randomBytes(32).toString('base64url')
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === '23505'
}

function toPublicUser(user: UserRepositoryRecord): PublicUser {
  if (user.emailVerifiedAt === null) {
    throw new AuthError('AUTH_EMAIL_UNVERIFIED', '该邮箱尚未完成验证，请检查验证邮件或重新发送。')
  }
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    emailVerifiedAt: user.emailVerifiedAt.toISOString(),
  }
}

export function createAuthService(options: AuthServiceOptions): AuthService {
  const sessionTtlSeconds = options.sessionTtlSeconds ?? DEFAULT_SESSION_TTL_SECONDS
  const verificationTtlSeconds = options.verificationTokenTtlSeconds ?? DEFAULT_VERIFICATION_TTL_SECONDS
  const passwordResetTtlSeconds = options.passwordResetTokenTtlSeconds ?? DEFAULT_PASSWORD_RESET_TTL_SECONDS
  const resendCooldownSeconds = options.resendCooldownSeconds ?? DEFAULT_RESEND_COOLDOWN_SECONDS
  const now = options.now ?? (() => new Date())
  const emailSender = options.emailSender ?? unavailableEmailSender
  const publicWebOrigin = normalizeWebOrigin(options.publicWebOrigin ?? 'http://localhost:5002')

  function sessionResult(
    user: UserRepositoryRecord,
    sessionId: string,
    issuedAt: Date,
    expiresAt: Date,
  ): AuthResult {
    return {
      token: signJwt({
        secret: options.jwtSecret,
        userId: user.id,
        sessionId,
        ttlSeconds: sessionTtlSeconds,
        nowMs: issuedAt.getTime(),
      }),
      user: toPublicUser(user),
      expiresAt,
    }
  }

  async function issueSession(user: UserRepositoryRecord): Promise<AuthResult> {
    const issuedAt = now()
    const expiresAt = new Date(issuedAt.getTime() + sessionTtlSeconds * 1000)
    const sessionId = await createSession(options.db, {
      userId: user.id,
      expiresAt,
      now: issuedAt,
    })
    return sessionResult(user, sessionId, issuedAt, expiresAt)
  }

  async function replaceActionToken(input: {
    user: UserRepositoryRecord
    purpose: AuthActionTokenPurpose
    ttlSeconds: number
    enforceCooldown: boolean
  }): Promise<{ rawToken: string; expiresAt: Date; resendAvailableAt: Date }> {
    const createdAt = now()
    const expiresAt = new Date(createdAt.getTime() + input.ttlSeconds * 1000)
    const resendAvailableAt = new Date(createdAt.getTime() + resendCooldownSeconds * 1000)
    const rawToken = rawActionToken()

    await options.db.transaction(async tx => {
      await lockAuthTokenScope(tx, input.user.id, input.purpose)
      const latest = await findLatestActiveAuthActionToken(tx, input.user.id, input.purpose)
      if (input.enforceCooldown && latest !== undefined) {
        const retryAt = new Date(latest.createdAt.getTime() + resendCooldownSeconds * 1000)
        if (retryAt.getTime() > createdAt.getTime()) {
          throw new AuthError(
            'AUTH_EMAIL_RATE_LIMITED',
            '操作过于频繁，请稍后再请求验证邮件。',
            { retryAt: retryAt.toISOString() },
          )
        }
      }
      await revokeActiveTokens(tx, {
        userId: input.user.id,
        purpose: input.purpose,
        now: createdAt,
      })
      await createAuthActionToken(tx, {
        userId: input.user.id,
        purpose: input.purpose,
        rawToken,
        expiresAt,
        now: createdAt,
      })
    })

    return { rawToken, expiresAt, resendAvailableAt }
  }

  async function sendVerification(
    user: UserRepositoryRecord,
    token: { rawToken: string; expiresAt: Date },
  ): Promise<void> {
    try {
      await emailSender.sendEmailVerification({
        to: user.email,
        verifyUrl: `${publicWebOrigin}/auth/verify-email#token=${encodeURIComponent(token.rawToken)}`,
        expiresAt: token.expiresAt.toISOString(),
      })
    } catch {
      throw new AuthError(
        'EMAIL_DELIVERY_FAILED',
        '验证邮件暂时发送失败，请稍后重试；账户已保留，可使用“重新发送验证邮件”。',
        { action: 'resend_verification', accountRetained: true },
      )
    }
  }

  return {
    async register(input) {
      const email = normalizeEmail(input.email)
      validatePassword(input.password)
      const existing = await findActiveUserByEmail(options.db, email)
      if (existing !== undefined) {
        throw new AuthError(
          'AUTH_EMAIL_TAKEN',
          existing.emailVerifiedAt === null
            ? '该邮箱已注册但尚未完成验证，请使用“重新发送验证邮件”，无需再次注册。'
            : '该邮箱已注册，请直接登录，或使用“忘记密码”找回密码。',
          { action: existing.emailVerifiedAt === null ? 'resend_verification' : 'login_or_reset_password' },
        )
      }

      const createdAt = now()
      const expiresAt = new Date(createdAt.getTime() + verificationTtlSeconds * 1000)
      const resendAvailableAt = new Date(createdAt.getTime() + resendCooldownSeconds * 1000)
      const rawToken = rawActionToken()
      const passwordHash = await hashPassword(input.password)
      let user: UserRepositoryRecord

      try {
        user = await options.db.transaction(async tx => {
          const created = await createUserInTransaction(tx, {
            email,
            passwordHash,
            ...(input.displayName !== undefined ? { displayName: input.displayName.trim() } : {}),
            now: createdAt,
          })
          await createAuthActionToken(tx, {
            userId: created.id,
            purpose: 'email_verification',
            rawToken,
            expiresAt,
            now: createdAt,
          })
          return created
        })
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AuthError('AUTH_EMAIL_TAKEN', '该邮箱已注册，请直接登录，或使用“忘记密码”找回密码。', {
            action: 'login_or_reset_password',
          })
        }
        throw error
      }

      await sendVerification(user, { rawToken, expiresAt })
      return {
        status: 'verification_required',
        email: maskEmail(email),
        resendAvailableAt: resendAvailableAt.toISOString(),
      }
    },

    async verifyEmail(rawToken) {
      const issuedAt = now()
      const expiresAt = new Date(issuedAt.getTime() + sessionTtlSeconds * 1000)
      const result = await options.db.transaction(async tx => {
        const tokenUser = await consumeAuthActionToken(tx, {
          rawToken,
          purpose: 'email_verification',
          now: issuedAt,
        })
        const user = tokenUser.emailVerifiedAt === null
          ? await markUserEmailVerified(tx, tokenUser.id, issuedAt)
          : tokenUser
        const sessionId = await createSession(tx, {
          userId: user.id,
          expiresAt,
          now: issuedAt,
        })
        return { user, sessionId }
      })
      return sessionResult(result.user, result.sessionId, issuedAt, expiresAt)
    },

    async resendVerification(emailInput) {
      const email = normalizeEmail(emailInput)
      const user = await findActiveUserByEmail(options.db, email)
      if (user === undefined || user.emailVerifiedAt !== null) return { accepted: true }

      const token = await replaceActionToken({
        user,
        purpose: 'email_verification',
        ttlSeconds: verificationTtlSeconds,
        enforceCooldown: true,
      })
      await sendVerification(user, token)
      return {
        accepted: true,
        retryAt: token.resendAvailableAt.toISOString(),
      }
    },

    async login(input) {
      const email = normalizeEmail(input.email)
      validatePassword(input.password)
      const user = await findActiveUserByEmail(options.db, email)
      if (user === undefined || !(await verifyPassword(input.password, user.passwordHash))) {
        throw new AuthError('AUTH_INVALID_CREDENTIALS', '邮箱或密码不正确，请重新输入。')
      }
      if (user.emailVerifiedAt === null) {
        throw new AuthError('AUTH_EMAIL_UNVERIFIED', '该邮箱尚未完成验证，请检查验证邮件或重新发送。')
      }
      return issueSession(user)
    },

    async loginWithGithub(input) {
      const email = normalizeEmail(input.email)
      const issuedAt = now()

      const byGithub = await findActiveUserByGithubId(options.db, input.githubId)
      if (byGithub !== undefined) return issueSession(byGithub)

      const byEmail = await findActiveUserByEmail(options.db, email)
      if (byEmail !== undefined) {
        if (byEmail.githubId !== null && byEmail.githubId !== input.githubId) {
          throw new AuthError('AUTH_EMAIL_TAKEN', '该邮箱已绑定其他 GitHub 账号，请使用对应账号登录。', {
            action: 'login',
          })
        }
        const linkedAt = now()
        await options.db.transaction(async tx => {
          await linkGithubId(tx, byEmail.id, input.githubId, linkedAt)
          // GitHub 已验证该邮箱，绑定后视为已完成邮箱验证（无需验证邮件）。
          if (byEmail.emailVerifiedAt === null) {
            await markUserEmailVerified(tx, byEmail.id, linkedAt)
          }
        })
        const user = (await findActiveUserById(options.db, byEmail.id)) ?? byEmail
        return issueSession(user)
      }

      // 新用户：OAuth 邮箱已被 GitHub 验证，直接落库为已验证；密码哈希为随机不可用值
      //（该用户只能通过 GitHub 登录，忘记密码后可用邮箱重设）。
      const passwordHash = await hashPassword(randomBytes(32).toString('base64url'))
      const displayName = input.displayName?.trim()
      const user = await options.db.transaction(tx => createUserInTransaction(tx, {
        email,
        passwordHash,
        githubId: input.githubId,
        displayName: displayName !== undefined && displayName.length > 0 ? displayName : undefined,
        emailVerifiedAt: issuedAt,
        now: issuedAt,
      }))
      return issueSession(user)
    },

    async forgotPassword(emailInput) {
      const email = normalizeEmail(emailInput)
      const user = await findActiveUserByEmail(options.db, email)
      if (user === undefined || user.emailVerifiedAt === null) return { accepted: true }

      // 启用冷却，防止对同一已验证账号的重置邮件轰炸；路由会把
      // AUTH_EMAIL_RATE_LIMITED 映射为 202，保持防枚举语义。
      const token = await replaceActionToken({
        user,
        purpose: 'password_reset',
        ttlSeconds: passwordResetTtlSeconds,
        enforceCooldown: true,
      })
      try {
        await emailSender.sendPasswordReset({
          to: user.email,
          resetUrl: `${publicWebOrigin}/auth/reset-password#token=${encodeURIComponent(token.rawToken)}`,
          expiresAt: token.expiresAt.toISOString(),
        })
      } catch (error) {
        // Forgot-password must not reveal whether an address exists；具体失败
        // 已由 mail sender 记录，这里只补一条服务层告警。
        authLogger.warn('auth.password_reset_email_failed', {
          errorName: error instanceof Error ? error.name : 'unknown',
        })
      }
      return { accepted: true }
    },

    async resetPassword(rawToken, newPassword) {
      validatePassword(newPassword, 'newPassword')
      const changedAt = now()
      const passwordHash = await hashPassword(newPassword)
      await options.db.transaction(async tx => {
        const user = await consumeAuthActionToken(tx, {
          rawToken,
          purpose: 'password_reset',
          now: changedAt,
        })
        if (await verifyPassword(newPassword, user.passwordHash)) {
          throw new AuthError('AUTH_PASSWORD_UNCHANGED', '新密码不能与当前密码相同。')
        }
        await updateUserPassword(tx, user.id, passwordHash, changedAt)
        await revokeAllSessions(tx, user.id, changedAt)
      })
    },

    async changePassword(input) {
      validatePassword(input.currentPassword, 'currentPassword')
      validatePassword(input.newPassword, 'newPassword')
      const payload = verifyJwt(input.token, {
        secret: options.jwtSecret,
        nowMs: now().getTime(),
      })
      if (payload === undefined) throw new AuthError('AUTH_UNAUTHORIZED', '请先登录后再继续。')

      const changedAt = now()
      const session = await findActiveSession(options.db, payload.sid, changedAt)
      const user = await findActiveUserById(options.db, payload.sub)
      if (session === undefined || session.userId !== payload.sub || user === undefined) {
        throw new AuthError('AUTH_UNAUTHORIZED', '登录状态已失效，请重新登录。')
      }
      if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
        throw new AuthError('AUTH_INVALID_CREDENTIALS', '当前密码不正确，请重新输入。')
      }
      if (await verifyPassword(input.newPassword, user.passwordHash)) {
        throw new AuthError('AUTH_PASSWORD_UNCHANGED', '新密码不能与当前密码相同。')
      }

      const passwordHash = await hashPassword(input.newPassword)
      const expiresAt = new Date(changedAt.getTime() + sessionTtlSeconds * 1000)
      const sessionId = await options.db.transaction(async tx => {
        await updateUserPassword(tx, user.id, passwordHash, changedAt)
        await revokeAllSessions(tx, user.id, changedAt)
        return createSession(tx, { userId: user.id, expiresAt, now: changedAt })
      })
      return sessionResult(user, sessionId, changedAt, expiresAt)
    },

    async verifyToken(token) {
      const checkedAt = now()
      const payload = verifyJwt(token, { secret: options.jwtSecret, nowMs: checkedAt.getTime() })
      if (payload === undefined) return undefined
      const session = await findActiveSession(options.db, payload.sid, checkedAt)
      if (session === undefined || session.userId !== payload.sub) return undefined
      const user = await findActiveUserById(options.db, payload.sub)
      if (user === undefined || user.emailVerifiedAt === null) return undefined
      return { user: toPublicUser(user), sessionId: payload.sid }
    },

    async revokeSessionByToken(token) {
      const revokedAt = now()
      const payload = verifyJwt(token, { secret: options.jwtSecret, nowMs: revokedAt.getTime() })
      if (payload !== undefined) await revokeSession(options.db, payload.sid, revokedAt)
    },

    async revokeAllSessionsByToken(token) {
      const revokedAt = now()
      const payload = verifyJwt(token, { secret: options.jwtSecret, nowMs: revokedAt.getTime() })
      if (payload === undefined) return
      const session = await findActiveSession(options.db, payload.sid, revokedAt)
      if (session !== undefined && session.userId === payload.sub) {
        await revokeAllSessions(options.db, payload.sub, revokedAt)
      }
    },
  }
}
