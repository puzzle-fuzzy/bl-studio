import { randomBytes } from 'node:crypto'
import type { BailianStudioDb } from '@bailian-studio/db'
import { createLogger, ValidationError } from '@bailian-studio/shared'
import type { TransactionalEmailSender } from './email'
import { AuthError } from './errors'
import { signJwt, verifyJwt } from './jwt'
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password'
import {
  clearUserBanned,
  clearUsersBanned,
  consumeAuthActionToken,
  countActiveUsersTotal,
  countRegistrationsPerDayBetween,
  createAuthActionToken,
  createSession,
  createUserInTransaction,
  findActiveSession,
  findActiveUserByEmail,
  findActiveUserByGithubId,
  findActiveUserById,
  findLatestActiveAuthActionToken,
  findUserById,
  linkGithubId,
  listActiveUsers,
  lockAuthTokenScope,
  markUserEmailVerified,
  revokeActiveTokens,
  revokeAllSessions,
  revokeSession,
  setUserBanned,
  setUsersBanned,
  clearUserAvatar as clearUserAvatarRecord,
  softDeleteUser as softDeleteUserRecord,
  softDeleteUsers as softDeleteUsersRecord,
  updateUserAdmin as updateUserAdminRecord,
  updateUserAvatar as updateUserAvatarRecord,
  updateUserPassword,
  updateUserSelf as updateUserSelfRecord,
  type AuthActionTokenPurpose,
  type UserRepositoryRecord,
} from './repository'

export interface PublicUser {
  id: string
  email: string
  displayName: string | null
  /** 已上传自定义头像；false 时前端使用由 userId 生成的 identicon 默认头像。 */
  hasAvatar: boolean
  role: 'user' | 'admin'
  emailVerifiedAt: string
  /** 非空即封禁（正常会话下恒为 null —— 封禁用户会被 verifyToken 拒绝）。 */
  bannedAt: string | null
}

export interface AuthResult {
  token: string
  user: PublicUser
  expiresAt: Date
}

/** 管理后台看到的用户投影（不含密码哈希/GitHub ID）。 */
export interface AdminUser {
  id: string
  email: string
  displayName: string | null
  role: 'user' | 'admin'
  emailVerifiedAt: string
  /** 非空即封禁。 */
  bannedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ListAdminUsersResult {
  items: AdminUser[]
  nextCursor?: string
  /** offset 分页模式（传 page）返回的总条数。 */
  total?: number
}

export interface VerifiedSession {
  user: PublicUser
  sessionId: string
}

export interface RegistrationResult {
  status: 'verification_required'
  /** 原始（规范化后）邮箱：供前端持久化并用于重发验证邮件。 */
  email: string
  /** 掩码展示用邮箱（如 j***@163.com），只允许渲染，不可回传。 */
  displayEmail: string
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

  /** 用户自助更新昵称（displayName）；用户不存在或已删除时抛 AUTH_UNAUTHORIZED。 */
  updateProfile(userId: string, input: { displayName: string }): Promise<PublicUser>
  /** 用户自助设置自定义头像（storage key 由 API 层写入存储后提供）。 */
  updateAvatar(userId: string, avatarStorageKey: string): Promise<PublicUser>
  /** 用户自助移除自定义头像（回到 identicon 默认头像）。 */
  removeAvatar(userId: string): Promise<PublicUser>
  /** 头像公开路由的只读查询：返回自定义头像存储 key；undefined=用户不存在。 */
  getUserAvatarStorageKey(userId: string): Promise<string | null | undefined>

  verifyToken(token: string): Promise<VerifiedSession | undefined>
  revokeSessionByToken(token: string): Promise<void>
  revokeAllSessionsByToken(token: string): Promise<void>

  /** 管理后台：创建账户（跳过邮箱验证，直接视为已验证）。 */
  adminCreateUser(input: {
    email: string
    password: string
    displayName?: string
    role?: 'user' | 'admin'
  }): Promise<AdminUser>
  /** 管理后台：分页列用户（含搜索）。cursor 走 keyset；传 page/pageSize 走 offset 并返回 total。 */
  listActiveUsers(input?: {
    limit?: number
    cursor?: string
    q?: string
    page?: number
    pageSize?: number
  }): Promise<ListAdminUsersResult>
  /** 管理后台：注册统计（近 N 天每日新增注册数）+ 总用户数。 */
  adminStats(input: { since: string; until: string }): Promise<{
    registrationsByDay: Array<{ date: string; count: number }>
    totalUsers: number
  }>
  /** 管理后台：查单个用户（含已软删）。 */
  adminGetUser(id: string): Promise<AdminUser>
  /** 管理后台：改昵称/角色。 */
  adminUpdateUser(id: string, input: { displayName?: string; role?: 'user' | 'admin' }): Promise<AdminUser>
  /** 管理后台：软删除用户（同时吊销全部会话）。 */
  softDeleteUser(id: string): Promise<void>
  /** 管理后台：封禁用户（吊销全部会话；禁登录/禁新提交，在途任务放行完成）。 */
  adminBanUser(id: string): Promise<void>
  /** 管理后台：解除封禁。 */
  adminUnbanUser(id: string): Promise<void>
  /** 管理后台：批量封禁（逐个吊销会话）。调用方须在 API 层剔除当前 admin 自身。 */
  adminBatchBanUsers(ids: string[]): Promise<void>
  /** 管理后台：批量解除封禁。 */
  adminBatchUnbanUsers(ids: string[]): Promise<void>
  /** 管理后台：批量软删除（逐个吊销会话）。调用方须在 API 层剔除当前 admin 自身。 */
  adminBatchDeleteUsers(ids: string[]): Promise<void>
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
  if (typeof error !== 'object' || error === null) return false
  // drizzle 把 PostgresError 包在 DrizzleQueryError.cause 里，需逐层解包。
  let current: unknown = error
  for (let depth = 0; depth < 3 && current !== null; depth += 1) {
    if (typeof current === 'object' && 'code' in current && (current as { code?: unknown }).code === '23505') {
      return true
    }
    current = typeof current === 'object' && current !== null
      ? (current as { cause?: unknown }).cause
      : undefined
  }
  return false
}

function toPublicUser(user: UserRepositoryRecord): PublicUser {
  if (user.emailVerifiedAt === null) {
    throw new AuthError('AUTH_EMAIL_UNVERIFIED', '该邮箱尚未完成验证，请检查验证邮件或重新发送。')
  }
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    hasAvatar: user.avatarStorageKey !== null,
    role: user.role,
    emailVerifiedAt: user.emailVerifiedAt.toISOString(),
    bannedAt: user.bannedAt === null ? null : user.bannedAt.toISOString(),
  }
}

/** 管理后台用户投影：剥离密码哈希与 GitHub ID。 */
function toAdminUser(user: Pick<
  UserRepositoryRecord,
  'id' | 'email' | 'displayName' | 'role' | 'emailVerifiedAt' | 'bannedAt' | 'createdAt' | 'updatedAt'
>): AdminUser {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    emailVerifiedAt: user.emailVerifiedAt === null ? '' : user.emailVerifiedAt.toISOString(),
    bannedAt: user.bannedAt === null ? null : user.bannedAt.toISOString(),
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

/**
 * 封禁门：所有"发放新会话"的入口（login / loginWithGithub / verifyEmail）在
 * 签发 token 前必须经过此检查。已封禁用户抛 AUTH_BANNED，绝不签发新会话。
 */
function ensureNotBanned(user: UserRepositoryRecord): void {
  if (user.bannedAt !== null) {
    throw new AuthError('AUTH_BANNED', '该账号已被封禁，请联系管理员。')
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
      // R2-P0-01：email 返回原始邮箱（用户自己刚提交的，回传无泄漏风险），供前端
      // 持久化并用于重发；displayEmail 是掩码，仅供展示。此前这里直接返回掩码，
      // 前端拿它去重发 → findActiveUserByEmail(掩码) 查无此人 → 假成功、验证邮件永不到达。
      return {
        status: 'verification_required',
        email,
        displayEmail: maskEmail(email),
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
        ensureNotBanned(tokenUser)
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
      // 已封禁用户静默不重发（保持防枚举语义，不透露封禁状态）。
      if (user === undefined || user.emailVerifiedAt !== null || user.bannedAt !== null) return { accepted: true }

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
      // P1-28：用户不存在时也对 DUMMY_PASSWORD_HASH 跑一次完整 argon2 校验，抹平
      // 「存在/不存在」响应时间差（计时侧信道）；未验证邮箱与不存在/密码错误统一
      // 返回 AUTH_INVALID_CREDENTIALS，杜绝通过错误码枚举邮箱。已封禁用户被
      // findActiveUserByEmail 排除，走同一假校验路径。
      const matched = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_PASSWORD_HASH)
      if (user === undefined || !matched || user.emailVerifiedAt === null) {
        throw new AuthError('AUTH_INVALID_CREDENTIALS', '邮箱或密码不正确，请重新输入。')
      }
      ensureNotBanned(user)
      return issueSession(user)
    },

    async loginWithGithub(input) {
      const email = normalizeEmail(input.email)
      const issuedAt = now()

      const byGithub = await findActiveUserByGithubId(options.db, input.githubId)
      if (byGithub !== undefined) {
        ensureNotBanned(byGithub)
        return issueSession(byGithub)
      }

      const byEmail = await findActiveUserByEmail(options.db, email)
      if (byEmail !== undefined) {
        ensureNotBanned(byEmail)
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
      // 已封禁用户静默不发送重置邮件（保持防枚举语义）。
      if (user === undefined || user.emailVerifiedAt === null || user.bannedAt !== null) return { accepted: true }

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
      // 已封禁/已删/未验证的用户：会话一律失效 —— 这是所有已认证路由的单点卡口
      //（生成提交、预估、SSE 都经由 requireAuthUser → verifyToken）。
      if (user === undefined || user.emailVerifiedAt === null || user.bannedAt !== null) return undefined
      return { user: toPublicUser(user), sessionId: payload.sid }
    },

    async updateProfile(userId, input) {
      const displayName = input.displayName.trim()
      if (displayName.length < 1 || displayName.length > 100) {
        throw new ValidationError('昵称长度为 1–100 个字符', 'displayName')
      }
      const updated = await updateUserSelfRecord(options.db, userId, { displayName }, now())
      if (updated === undefined) {
        throw new AuthError('AUTH_UNAUTHORIZED', '用户不存在或已删除。')
      }
      return toPublicUser(updated)
    },

    async updateAvatar(userId, avatarStorageKey) {
      if (avatarStorageKey.length === 0 || avatarStorageKey.length > 512) {
        throw new ValidationError('Avatar storage key is invalid', 'avatarStorageKey')
      }
      const updated = await updateUserAvatarRecord(options.db, userId, avatarStorageKey, now())
      if (updated === undefined) {
        throw new AuthError('AUTH_UNAUTHORIZED', '用户不存在或已删除。')
      }
      return toPublicUser(updated)
    },

    async removeAvatar(userId) {
      const updated = await clearUserAvatarRecord(options.db, userId, now())
      if (updated === undefined) {
        throw new AuthError('AUTH_UNAUTHORIZED', '用户不存在或已删除。')
      }
      return toPublicUser(updated)
    },

    async getUserAvatarStorageKey(userId) {
      const user = await findActiveUserById(options.db, userId)
      return user === undefined ? undefined : user.avatarStorageKey
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

    async adminCreateUser(input) {
      const email = normalizeEmail(input.email)
      validatePassword(input.password)
      const passwordHash = await hashPassword(input.password)
      const createdAt = now()
      const displayName = input.displayName?.trim()
      let user: UserRepositoryRecord
      try {
        user = await options.db.transaction(tx => createUserInTransaction(tx, {
          email,
          passwordHash,
          displayName: displayName !== undefined && displayName.length > 0 ? displayName : undefined,
          role: input.role,
          emailVerifiedAt: createdAt,
          now: createdAt,
        }))
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AuthError('AUTH_EMAIL_TAKEN', '该邮箱已注册，请使用其他邮箱。', { action: 'admin_create' })
        }
        throw error
      }
      return toAdminUser(user)
    },

    async listActiveUsers(input) {
      const page = await listActiveUsers(options.db, {
        limit: input?.limit,
        cursor: input?.cursor,
        q: input?.q,
        ...(input?.page !== undefined ? { page: input.page } : {}),
        ...(input?.pageSize !== undefined ? { pageSize: input.pageSize } : {}),
      })
      return {
        items: page.items.map(toAdminUser),
        ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}),
        ...(page.total !== undefined ? { total: page.total } : {}),
      }
    },

    async adminStats(input) {
      const since = new Date(input.since)
      const until = new Date(input.until)
      const [registrationsByDay, totalUsers] = await Promise.all([
        countRegistrationsPerDayBetween(options.db, since, until),
        countActiveUsersTotal(options.db),
      ])
      return { registrationsByDay, totalUsers }
    },

    async adminGetUser(id) {
      const user = await findUserById(options.db, id)
      if (user === undefined) {
        throw new AuthError('AUTH_UNAUTHORIZED', '用户不存在。', { action: 'admin_get' })
      }
      return toAdminUser(user)
    },

    async adminUpdateUser(id, input) {
      const updated = await updateUserAdminRecord(options.db, id, input, now())
      if (updated === undefined) {
        throw new AuthError('AUTH_UNAUTHORIZED', '用户不存在或已删除。', { action: 'admin_update' })
      }
      return toAdminUser(updated)
    },

    async softDeleteUser(id) {
      const deletedAt = now()
      await options.db.transaction(async tx => {
        const deleted = await softDeleteUserRecord(tx, id, deletedAt)
        if (!deleted) {
          throw new AuthError('AUTH_UNAUTHORIZED', '用户不存在或已删除。', { action: 'admin_delete' })
        }
        // 软删除后吊销全部会话，token 立即失效（verifyToken 本身也会因 deletedAt 拒绝）。
        await revokeAllSessions(tx, id, deletedAt)
      })
    },

    async adminBanUser(id) {
      const bannedAt = now()
      await options.db.transaction(async tx => {
        const banned = await setUserBanned(tx, { userId: id, bannedAt, bannedBy: 'admin.user.ban' })
        if (!banned) {
          throw new AuthError('AUTH_UNAUTHORIZED', '用户不存在或已删除。', { action: 'admin_ban' })
        }
        // 封禁立即吊销全部会话：已登录态被强制注销（verifyToken 的 bannedAt 检查兜底）。
        await revokeAllSessions(tx, id, bannedAt)
      })
    },

    async adminUnbanUser(id) {
      const unbanned = await clearUserBanned(options.db, id, now())
      if (!unbanned) {
        throw new AuthError('AUTH_UNAUTHORIZED', '用户不存在或已删除。', { action: 'admin_unban' })
      }
    },

    async adminBatchBanUsers(ids) {
      if (ids.length === 0) return
      const bannedAt = now()
      await options.db.transaction(async tx => {
        await setUsersBanned(tx, { userIds: ids, bannedAt, bannedBy: 'admin.user.ban' })
        for (const id of ids) await revokeAllSessions(tx, id, bannedAt)
      })
    },

    async adminBatchUnbanUsers(ids) {
      if (ids.length === 0) return
      await clearUsersBanned(options.db, ids, now())
    },

    async adminBatchDeleteUsers(ids) {
      if (ids.length === 0) return
      const deletedAt = now()
      await options.db.transaction(async tx => {
        await softDeleteUsersRecord(tx, ids, deletedAt)
        for (const id of ids) await revokeAllSessions(tx, id, deletedAt)
      })
    },
  }
}
