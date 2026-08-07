import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { authActionTokens, createDb, creditAccounts, users } from '@bailian-studio/db'
import { eq } from 'drizzle-orm'
import {
  AuthError,
  createIsolatedAuthService,
  hashAuthActionToken,
  type IsolatedAuthService,
  type TransactionalEmailSender,
} from '../src'

interface SentEmail {
  to: string
  url: string
  expiresAt: string
}

class MemoryEmailSender implements TransactionalEmailSender {
  readonly verifications: SentEmail[] = []
  readonly passwordResets: SentEmail[] = []
  failVerification = false

  async sendEmailVerification(input: { to: string; verifyUrl: string; expiresAt: string }) {
    if (this.failVerification) throw new Error('smtp unavailable')
    this.verifications.push({ to: input.to, url: input.verifyUrl, expiresAt: input.expiresAt })
  }

  async sendPasswordReset(input: { to: string; resetUrl: string; expiresAt: string }) {
    this.passwordResets.push({ to: input.to, url: input.resetUrl, expiresAt: input.expiresAt })
  }
}

function tokenFrom(url: string): string {
  const token = new URLSearchParams(new URL(url).hash.slice(1)).get('token')
  if (token === null) throw new Error('expected token in email URL fragment')
  return token
}

let handle: IsolatedAuthService
let emailSender: MemoryEmailSender
let nowMs = Date.parse('2026-07-25T00:00:00.000Z')

beforeAll(async () => {
  emailSender = new MemoryEmailSender()
  handle = await createIsolatedAuthService({
    jwtSecret: 'test-secret',
    emailSender,
    publicWebOrigin: 'https://create.example.test',
    now: () => new Date(nowMs),
  })
})

afterAll(async () => {
  await handle.close()
})

describe('auth service', () => {
  it('registers without a session and requires verified email before login', async () => {
    const result = await handle.authService.register({
      email: '  Pending@X.Test ',
      password: 'password1',
      displayName: 'Pending',
    })

    expect(result).toMatchObject({
      status: 'verification_required',
      email: 'pending@x.test',
      displayEmail: 'p*****g@x.test',
    })
    expect(emailSender.verifications.at(-1)?.to).toBe('pending@x.test')
    expect(emailSender.verifications.at(-1)?.url?.startsWith(
      'https://create.example.test/auth/verify-email#token=',
    )).toBe(true)
    const rawToken = tokenFrom(emailSender.verifications.at(-1)!.url)
    const db = createDb({ url: handle.databaseUrl, max: 1 })
    try {
      const tokens = await db.select().from(authActionTokens)
      const persisted = tokens.find(token => token.tokenHash === hashAuthActionToken(rawToken))
      expect(persisted?.tokenHash).toMatch(/^[0-9a-f]{64}$/)
      expect(persisted?.tokenHash).not.toContain(rawToken)
    } finally {
      await db.close()
    }
    await expect(handle.authService.login({
      email: 'pending@x.test',
      password: 'password1',
    })).rejects.toMatchObject({ code: 'AUTH_EMAIL_UNVERIFIED' })
  })

  it('consumes a verification token once and issues a verifiable session', async () => {
    await handle.authService.register({ email: 'verify@x.test', password: 'password1' })
    const rawToken = tokenFrom(emailSender.verifications.at(-1)!.url)

    const verified = await handle.authService.verifyEmail(rawToken)
    expect(verified.user.email).toBe('verify@x.test')
    expect(verified.user.emailVerifiedAt).toBe('2026-07-25T00:00:00.000Z')
    expect(await handle.authService.verifyToken(verified.token)).toMatchObject({
      user: { id: verified.user.id },
    })
    await expect(handle.authService.verifyEmail(rawToken)).rejects.toMatchObject({
      code: 'AUTH_TOKEN_CONSUMED',
    })
  })

  it('replaces an earlier verification token after the resend cooldown', async () => {
    await handle.authService.register({ email: 'replace@x.test', password: 'password1' })
    const firstToken = tokenFrom(emailSender.verifications.at(-1)!.url)

    await expect(handle.authService.resendVerification('replace@x.test')).rejects.toMatchObject({
      code: 'AUTH_EMAIL_RATE_LIMITED',
    })
    nowMs += 61_000
    const accepted = await handle.authService.resendVerification('replace@x.test')
    const secondToken = tokenFrom(emailSender.verifications.at(-1)!.url)

    expect(accepted.accepted).toBe(true)
    expect(secondToken).not.toBe(firstToken)
    await expect(handle.authService.verifyEmail(firstToken)).rejects.toMatchObject({
      code: 'AUTH_TOKEN_CONSUMED',
    })
    await expect(handle.authService.verifyEmail(secondToken)).resolves.toBeDefined()
  })

  it('returns the real email for resend and a masked displayEmail only (R2-P0-01 regression)', async () => {
    const result = await handle.authService.register({
      email: 'resend-flow@x.test',
      password: 'password1',
    })
    // 真实邮箱可回传（用户自己刚提交的，无泄漏风险），掩码只存在于 displayEmail。
    expect(result.email).toBe('resend-flow@x.test')
    expect(result.displayEmail).toBe('r*********w@x.test')
    expect(result.displayEmail).not.toBe(result.email)

    const firstToken = tokenFrom(emailSender.verifications.at(-1)!.url)
    nowMs += 61_000
    // 前端正是拿 register 返回的 email 字段去重发 —— 此前返回的是掩码，这里必然查无此人。
    const accepted = await handle.authService.resendVerification(result.email)
    expect(accepted.accepted).toBe(true)
    const secondToken = tokenFrom(emailSender.verifications.at(-1)!.url)
    expect(secondToken).not.toBe(firstToken)

    // 用 displayEmail（掩码）重发必须静默接受但不产生新邮件（防枚举兜底，不能真发信）。
    const beforeCount = emailSender.verifications.length
    nowMs += 61_000
    const masked = await handle.authService.resendVerification(result.displayEmail)
    expect(masked).toEqual({ accepted: true })
    expect(emailSender.verifications.length).toBe(beforeCount)
  })

  it('rejects expired verification tokens', async () => {
    await handle.authService.register({ email: 'expired@x.test', password: 'password1' })
    const rawToken = tokenFrom(emailSender.verifications.at(-1)!.url)
    nowMs += 24 * 60 * 60 * 1000 + 1

    await expect(handle.authService.verifyEmail(rawToken)).rejects.toMatchObject({
      code: 'AUTH_TOKEN_EXPIRED',
    })
  })

  it('keeps forgot-password responses generic and reset revokes every session', async () => {
    await handle.authService.register({ email: 'reset@x.test', password: 'password1' })
    const verificationToken = tokenFrom(emailSender.verifications.at(-1)!.url)
    const firstSession = await handle.authService.verifyEmail(verificationToken)
    const secondSession = await handle.authService.login({ email: 'reset@x.test', password: 'password1' })

    await expect(handle.authService.forgotPassword('unknown@x.test')).resolves.toEqual({ accepted: true })
    await expect(handle.authService.forgotPassword('reset@x.test')).resolves.toEqual({ accepted: true })
    const resetToken = tokenFrom(emailSender.passwordResets.at(-1)!.url)
    await expect(handle.authService.resetPassword(resetToken, 'password2')).resolves.toBeUndefined()

    expect(await handle.authService.verifyToken(firstSession.token)).toBeUndefined()
    expect(await handle.authService.verifyToken(secondSession.token)).toBeUndefined()
    await expect(handle.authService.login({
      email: 'reset@x.test',
      password: 'password1',
    })).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' })
    await expect(handle.authService.login({
      email: 'reset@x.test',
      password: 'password2',
    })).resolves.toBeDefined()
    await expect(handle.authService.resetPassword(resetToken, 'password3')).rejects.toMatchObject({
      code: 'AUTH_TOKEN_CONSUMED',
    })
  })

  it('rotates the current session on password change and rejects an unchanged password', async () => {
    await handle.authService.register({ email: 'change@x.test', password: 'password1' })
    const verificationToken = tokenFrom(emailSender.verifications.at(-1)!.url)
    const current = await handle.authService.verifyEmail(verificationToken)
    const other = await handle.authService.login({ email: 'change@x.test', password: 'password1' })

    await expect(handle.authService.changePassword({
      token: current.token,
      currentPassword: 'password1',
      newPassword: 'password1',
    })).rejects.toMatchObject({ code: 'AUTH_PASSWORD_UNCHANGED' })

    const rotated = await handle.authService.changePassword({
      token: current.token,
      currentPassword: 'password1',
      newPassword: 'password2',
    })
    expect(rotated.token).not.toBe(current.token)
    expect(await handle.authService.verifyToken(current.token)).toBeUndefined()
    expect(await handle.authService.verifyToken(other.token)).toBeUndefined()
    expect(await handle.authService.verifyToken(rotated.token)).toBeDefined()
  })

  it('logs out every active session for the authenticated user', async () => {
    await handle.authService.register({ email: 'logout-all@x.test', password: 'password1' })
    const first = await handle.authService.verifyEmail(tokenFrom(emailSender.verifications.at(-1)!.url))
    const second = await handle.authService.login({ email: 'logout-all@x.test', password: 'password1' })

    await handle.authService.revokeAllSessionsByToken(first.token)
    expect(await handle.authService.verifyToken(first.token)).toBeUndefined()
    expect(await handle.authService.verifyToken(second.token)).toBeUndefined()
  })

  it('preserves the account and token when verification email delivery fails', async () => {
    emailSender.failVerification = true
    try {
      await expect(handle.authService.register({
        email: 'mail-failure@x.test',
        password: 'password1',
      })).rejects.toMatchObject({ code: 'EMAIL_DELIVERY_FAILED' })
    } finally {
      emailSender.failVerification = false
    }

    await expect(handle.authService.login({
      email: 'mail-failure@x.test',
      password: 'password1',
    })).rejects.toMatchObject({ code: 'AUTH_EMAIL_UNVERIFIED' })
    await expect(handle.authService.register({
      email: 'mail-failure@x.test',
      password: 'password1',
    })).rejects.toMatchObject({ code: 'AUTH_EMAIL_TAKEN' })
  })

  it('creates one credit account and never resets its balance on later login', async () => {
    await handle.authService.register({ email: 'balance@x.test', password: 'password1' })
    const registrationSession = await handle.authService.verifyEmail(
      tokenFrom(emailSender.verifications.at(-1)!.url),
    )
    const db = createDb({ url: handle.databaseUrl, max: 1 })
    try {
      await db.update(creditAccounts)
        .set({ availableCents: 2500 })
        .where(eq(creditAccounts.userId, registrationSession.user.id))
      await handle.authService.login({ email: 'balance@x.test', password: 'password1' })
      const [account] = await db
        .select()
        .from(creditAccounts)
        .where(eq(creditAccounts.userId, registrationSession.user.id))
      expect(account?.availableCents).toBe(2500)
    } finally {
      await db.close()
    }
  })

  it('uses uniform credential errors and rejects malformed session tokens', async () => {
    await expect(handle.authService.login({
      email: 'nobody@x.test',
      password: 'password1',
    })).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' })
    expect(await handle.authService.verifyToken('not.a.jwt')).toBeUndefined()

    let caught: unknown
    try {
      await handle.authService.login({ email: 'nobody2@x.test', password: 'password1' })
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(AuthError)
  })

  describe('loginWithGithub', () => {
    it('creates a verified account on first login and reuses it on later logins', async () => {
      const first = await handle.authService.loginWithGithub({
        githubId: '10001',
        email: 'octocat@example.com',
        displayName: 'Mona Octocat',
      })
      expect(first.user.email).toBe('octocat@example.com')
      expect(first.user.displayName).toBe('Mona Octocat')
      expect(await handle.authService.verifyToken(first.token)).toMatchObject({
        user: { id: first.user.id, emailVerifiedAt: expect.any(String) },
      })

      const second = await handle.authService.loginWithGithub({
        githubId: '10001',
        email: 'octocat@example.com',
      })
      expect(second.user.id).toBe(first.user.id)

      const db = createDb({ url: handle.databaseUrl, max: 1 })
      try {
        const [row] = await db.select().from(users).where(eq(users.id, first.user.id))
        expect(row?.githubId).toBe('10001')
        expect(row?.emailVerifiedAt).not.toBeNull()
      } finally {
        await db.close()
      }
    })

    it('links an existing verified email account to the GitHub identity', async () => {
      await handle.authService.register({ email: 'link@x.test', password: 'password1' })
      await handle.authService.verifyEmail(tokenFrom(emailSender.verifications.at(-1)!.url))

      const result = await handle.authService.loginWithGithub({
        githubId: '10002',
        email: 'link@x.test',
      })
      expect(result.user.email).toBe('link@x.test')

      const db = createDb({ url: handle.databaseUrl, max: 1 })
      try {
        const [row] = await db.select().from(users).where(eq(users.id, result.user.id))
        expect(row?.githubId).toBe('10002')
      } finally {
        await db.close()
      }
    })

    it('rejects when the email is already bound to a different GitHub account', async () => {
      await handle.authService.loginWithGithub({ githubId: '10003', email: 'dual@x.test' })
      await expect(handle.authService.loginWithGithub({
        githubId: '10004',
        email: 'dual@x.test',
      })).rejects.toMatchObject({ code: 'AUTH_EMAIL_TAKEN' })
    })
  })

  describe('admin user management', () => {
    it('creates a verified account without requiring email verification', async () => {
      const created = await handle.authService.adminCreateUser({
        email: 'admin-made@x.test',
        password: 'password1',
        displayName: 'Admin Made',
        role: 'admin',
      })
      expect(created.email).toBe('admin-made@x.test')
      expect(created.role).toBe('admin')
      expect(created.emailVerifiedAt).not.toBe('')

      // 直接可用密码登录（无需验证邮件）。
      const login = await handle.authService.login({ email: 'admin-made@x.test', password: 'password1' })
      expect(login.user.id).toBe(created.id)
    })

    it('rejects duplicate emails on admin create', async () => {
      await handle.authService.adminCreateUser({ email: 'dup@x.test', password: 'password1' })
      await expect(handle.authService.adminCreateUser({
        email: 'dup@x.test',
        password: 'password1',
      })).rejects.toMatchObject({ code: 'AUTH_EMAIL_TAKEN' })
    })

    it('lists active users with q filter and pagination', async () => {
      await handle.authService.adminCreateUser({ email: 'alpha@x.test', password: 'password1', displayName: 'Alice' })
      await handle.authService.adminCreateUser({ email: 'bravo@x.test', password: 'password1', displayName: 'Bob' })
      await handle.authService.adminCreateUser({ email: 'charlie@x.test', password: 'password1' })

      const all = await handle.authService.listActiveUsers({ limit: 2 })
      expect(all.items.length).toBe(2)
      expect(all.nextCursor).toBeDefined()

      const next = await handle.authService.listActiveUsers({ limit: 2, cursor: all.nextCursor })
      expect(next.items.length).toBeGreaterThan(0)

      const byName = await handle.authService.listActiveUsers({ q: 'alice' })
      expect(byName.items.map(item => item.email)).toEqual(['alpha@x.test'])

      const byEmail = await handle.authService.listActiveUsers({ q: 'charlie' })
      expect(byEmail.items.map(item => item.email)).toEqual(['charlie@x.test'])

      // offset 分页模式：page/pageSize 返回 total，两页无重叠，total 与全量一致。
      const countAll = await handle.authService.listActiveUsers({ limit: 100 })
      const page1 = await handle.authService.listActiveUsers({ page: 1, pageSize: 2 })
      expect(page1.items.length).toBe(2)
      expect(page1.total).toBe(countAll.items.length)
      expect(page1.nextCursor).toBeUndefined()

      const page2 = await handle.authService.listActiveUsers({ page: 2, pageSize: 2 })
      expect(page2.items.length).toBeGreaterThan(0)
      const ids = new Set([...page1.items, ...page2.items].map(item => item.id))
      expect(ids.size).toBe(page1.items.length + page2.items.length)
    })

    it('soft-deletes a user and revokes all sessions immediately', async () => {
      const created = await handle.authService.adminCreateUser({ email: 'delete-me@x.test', password: 'password1' })
      const login = await handle.authService.login({ email: 'delete-me@x.test', password: 'password1' })

      await handle.authService.softDeleteUser(created.id)
      expect(await handle.authService.verifyToken(login.token)).toBeUndefined()

      // 密码登录也失败（findActiveUserByEmail 过滤已删除）。
      await expect(handle.authService.login({
        email: 'delete-me@x.test',
        password: 'password1',
      })).rejects.toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' })
    })

    it('updates role/displayName and returns deleted users via adminGetUser', async () => {
      const created = await handle.authService.adminCreateUser({
        email: 'edit-me@x.test',
        password: 'password1',
        displayName: 'Before',
      })
      const updated = await handle.authService.adminUpdateUser(created.id, {
        displayName: 'After',
        role: 'admin',
      })
      expect(updated.displayName).toBe('After')
      expect(updated.role).toBe('admin')

      await handle.authService.softDeleteUser(created.id)
      // 软删后管理端仍可查看该账号。
      const viewed = await handle.authService.adminGetUser(created.id)
      expect(viewed.email).toBe('edit-me@x.test')

      await expect(handle.authService.adminGetUser('missing-id')).rejects.toMatchObject({ code: 'AUTH_UNAUTHORIZED' })
    })

    it('bans a user: existing sessions die, login is rejected with AUTH_BANNED, unban restores login', async () => {
      const created = await handle.authService.adminCreateUser({ email: 'ban-me@x.test', password: 'password1' })
      const login = await handle.authService.login({ email: 'ban-me@x.test', password: 'password1' })
      expect(await handle.authService.verifyToken(login.token)).toBeDefined()

      await handle.authService.adminBanUser(created.id)
      // 封禁后既有会话立即失效（单点卡口 verifyToken）。
      expect(await handle.authService.verifyToken(login.token)).toBeUndefined()
      // 重新登录抛 AUTH_BANNED（不发新会话）。
      await expect(handle.authService.login({ email: 'ban-me@x.test', password: 'password1' }))
        .rejects.toMatchObject({ code: 'AUTH_BANNED' })

      await handle.authService.adminUnbanUser(created.id)
      const relogin = await handle.authService.login({ email: 'ban-me@x.test', password: 'password1' })
      expect(relogin.user.email).toBe('ban-me@x.test')
    })

    it('batch-bans several users and batch-deletes without touching self semantics', async () => {
      const a = await handle.authService.adminCreateUser({ email: 'batch-a@x.test', password: 'password1' })
      const b = await handle.authService.adminCreateUser({ email: 'batch-b@x.test', password: 'password1' })
      await handle.authService.adminBatchBanUsers([a.id, b.id])
      await expect(handle.authService.login({ email: 'batch-a@x.test', password: 'password1' }))
        .rejects.toMatchObject({ code: 'AUTH_BANNED' })
      await expect(handle.authService.login({ email: 'batch-b@x.test', password: 'password1' }))
        .rejects.toMatchObject({ code: 'AUTH_BANNED' })

      await handle.authService.adminBatchUnbanUsers([a.id, b.id])
      expect((await handle.authService.login({ email: 'batch-a@x.test', password: 'password1' })).user.email)
        .toBe('batch-a@x.test')
    })
  })

  describe('profile & avatar (user self-service)', () => {
    async function verifiedUser(email: string) {
      await handle.authService.register({ email, password: 'password1' })
      const rawToken = tokenFrom(emailSender.verifications.at(-1)!.url)
      const session = await handle.authService.verifyEmail(rawToken)
      return { user: session.user, session }
    }

    it('updates the display name and persists it', async () => {
      const { user } = await verifiedUser('profile@x.test')
      const updated = await handle.authService.updateProfile(user.id, { displayName: '新昵称' })
      expect(updated.displayName).toBe('新昵称')
      expect(updated.hasAvatar).toBe(false)

      const db = createDb({ url: handle.databaseUrl, max: 1 })
      try {
        const [row] = await db
          .select({ displayName: users.displayName })
          .from(users)
          .where(eq(users.id, user.id))
        expect(row?.displayName).toBe('新昵称')
      } finally {
        await db.close()
      }
    })

    it('rejects an empty or over-length display name', async () => {
      const { user } = await verifiedUser('profile-invalid@x.test')
      await expect(handle.authService.updateProfile(user.id, { displayName: '   ' }))
        .rejects.toMatchObject({ code: 'VALIDATION_INVALID_INPUT' })
      await expect(handle.authService.updateProfile(user.id, { displayName: 'x'.repeat(101) }))
        .rejects.toMatchObject({ code: 'VALIDATION_INVALID_INPUT' })
    })

    it('sets, reads, and removes the custom avatar storage key', async () => {
      const { user } = await verifiedUser('avatar@x.test')
      expect(await handle.authService.getUserAvatarStorageKey(user.id)).toBeNull()

      const updated = await handle.authService.updateAvatar(user.id, 'avatars/avatar/x.png')
      expect(updated.hasAvatar).toBe(true)
      expect(await handle.authService.getUserAvatarStorageKey(user.id)).toBe('avatars/avatar/x.png')

      const removed = await handle.authService.removeAvatar(user.id)
      expect(removed.hasAvatar).toBe(false)
      expect(await handle.authService.getUserAvatarStorageKey(user.id)).toBeNull()
    })

    it('reports undefined for unknown users from getUserAvatarStorageKey', async () => {
      expect(await handle.authService.getUserAvatarStorageKey('no-such-user')).toBeUndefined()
    })

    it('throws AUTH_UNAUTHORIZED for self-service on a deleted user', async () => {
      const { user } = await verifiedUser('profile-deleted@x.test')
      await handle.authService.softDeleteUser(user.id)
      await expect(handle.authService.updateProfile(user.id, { displayName: 'x' }))
        .rejects.toMatchObject({ code: 'AUTH_UNAUTHORIZED' })
      await expect(handle.authService.updateAvatar(user.id, 'avatars/u/x.png'))
        .rejects.toMatchObject({ code: 'AUTH_UNAUTHORIZED' })
      await expect(handle.authService.removeAvatar(user.id))
        .rejects.toMatchObject({ code: 'AUTH_UNAUTHORIZED' })
    })
  })
})
