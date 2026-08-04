import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { authActionTokens, createDb, creditAccounts } from '@bailian-studio/db'
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
      email: 'p******@x.test',
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
})
