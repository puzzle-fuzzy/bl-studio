import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  createIsolatedAuthService,
  type IsolatedAuthService,
  type TransactionalEmailSender,
} from '@bailian-studio/auth'
import type {
  AuditRepository,
  GenerationRepository,
  RecordAuditEventInput,
} from '@bailian-studio/generation-repository'
import { createTestApp } from '../src/test-app'

interface SentEmail {
  to: string
  url: string
}

class MemoryEmailSender implements TransactionalEmailSender {
  readonly verifications: SentEmail[] = []
  readonly passwordResets: SentEmail[] = []

  async sendEmailVerification(input: { to: string; verifyUrl: string }) {
    this.verifications.push({ to: input.to, url: input.verifyUrl })
  }

  async sendPasswordReset(input: { to: string; resetUrl: string }) {
    this.passwordResets.push({ to: input.to, url: input.resetUrl })
  }
}

let handle: IsolatedAuthService
let sender: MemoryEmailSender
let app: ReturnType<typeof createTestApp>['app']
const audits: RecordAuditEventInput[] = []
const auditRepository = {
  async recordAuditEvent(input: RecordAuditEventInput) {
    audits.push(input)
    const occurredAt = input.occurredAt ?? '2026-07-25T00:00:00.000Z'
    return {
      id: `audit_${audits.length}`,
      action: input.action,
      outcome: input.outcome,
      ...(input.userId !== undefined ? { userId: input.userId } : {}),
      ...(input.targetType !== undefined ? { targetType: input.targetType } : {}),
      ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
      occurredAt,
      createdAt: occurredAt,
      updatedAt: occurredAt,
    }
  },
} satisfies AuditRepository

beforeAll(async () => {
  sender = new MemoryEmailSender()
  handle = await createIsolatedAuthService({
    jwtSecret: 'route-test-secret',
    emailSender: sender,
    publicWebOrigin: 'https://create.example.test',
  })
  app = createTestApp({
    authService: handle.authService,
    generationRepository: {} as GenerationRepository,
    auditRepository,
  }).app
})

afterAll(async () => {
  await handle.close()
})

function json(url: string, body: unknown, init: RequestInit = {}): Request {
  return new Request(url, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: JSON.stringify(body),
  })
}

function sessionCookie(setCookie: string | null): string {
  if (setCookie === null) throw new Error('no set-cookie header')
  const first = setCookie.split(',')[0] ?? setCookie
  return first.split(';')[0] ?? ''
}

function tokenFrom(url: string): string {
  const token = new URLSearchParams(new URL(url).hash.slice(1)).get('token')
  if (token === null) throw new Error('email URL did not contain a token')
  return token
}

async function register(email: string, password = 'password1'): Promise<Response> {
  return app.handle(json(
    'http://localhost/api/auth/register',
    { email, password, displayName: 'Route User' },
    { method: 'POST' },
  ))
}

async function verifyLatestEmail(): Promise<Response> {
  const token = tokenFrom(sender.verifications.at(-1)!.url)
  return app.handle(json(
    'http://localhost/api/auth/verify-email',
    { token },
    { method: 'POST' },
  ))
}

describe('auth routes', () => {
  it('returns the request traceId in the centralized error envelope', async () => {
    const response = await app.handle(new Request('http://localhost/api/auth/me', {
      headers: { 'x-request-id': 'auth-error-trace-1' },
    }))
    const body = await response.json() as {
      success: false
      error: { code: string; message: string }
      traceId?: string
    }

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('AUTH_UNAUTHORIZED')
    expect(body.traceId).toBe('auth-error-trace-1')
    expect(response.headers.get('x-trace-id')).toBe('auth-error-trace-1')
  })

  it('registers without a session and never returns the raw verification token', async () => {
    const response = await register('route@x.test')
    const text = await response.text()
    const body = JSON.parse(text) as {
      success: true
      data: {
        registration: {
          status: string
          email: string
          displayEmail: string
          resendAvailableAt: string
        }
      }
    }

    expect(response.status).toBe(200)
    expect(body.data.registration.status).toBe('verification_required')
    // R2-P0-01：email 是真实邮箱（供重发），掩码只出现在 displayEmail（仅供展示）。
    expect(body.data.registration.email).toBe('route@x.test')
    expect(body.data.registration.displayEmail).toBe('r***e@x.test')
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(text).not.toContain(tokenFrom(sender.verifications.at(-1)!.url))
    expect(text).not.toContain(sender.verifications.at(-1)!.url)
    const auditText = JSON.stringify(audits)
    expect(auditText).not.toContain(tokenFrom(sender.verifications.at(-1)!.url))
    expect(auditText).not.toContain(sender.verifications.at(-1)!.url)
  })

  it('returns an actionable Chinese message when an unverified email is registered again', async () => {
    await register('duplicate-route@x.test')
    const response = await register('duplicate-route@x.test')
    const body = await response.json() as {
      success: false
      error: { code: string; message: string; details?: { action?: string } }
    }

    expect(response.status).toBe(409)
    expect(body.error.code).toBe('AUTH_EMAIL_TAKEN')
    expect(body.error.message).toContain('尚未完成验证')
    expect(body.error.message).toContain('重新发送验证邮件')
    expect(body.error.details?.action).toBe('resend_verification')
  })

  it('rejects login before verification (anti-enumeration, P1-28), then verification sets the session cookie', async () => {
    await register('verify-route@x.test')
    const login = await app.handle(json(
      'http://localhost/api/auth/login',
      { email: 'verify-route@x.test', password: 'password1' },
      { method: 'POST' },
    ))
    // P1-28：未验证邮箱登录与「账号不存在/密码错误」统一为 401 + AUTH_INVALID_CREDENTIALS，
    // 防止通过错误码区分账号状态。
    expect(login.status).toBe(401)
    expect((await login.json() as { error: { code: string } }).error.code).toBe('AUTH_INVALID_CREDENTIALS')

    const verified = await verifyLatestEmail()
    const body = await verified.json() as { success: true; data: { user: { email: string; emailVerifiedAt: string } } }
    expect(verified.status).toBe(200)
    expect(body.data.user.email).toBe('verify-route@x.test')
    expect(body.data.user.emailVerifiedAt.length).toBeGreaterThan(0)
    expect(verified.headers.get('set-cookie')).toContain('HttpOnly')
  })

  it('returns generic accepted results for resend and forgot-password', async () => {
    await register('generic@x.test')

    const unknownResend = await app.handle(json(
      'http://localhost/api/auth/resend-verification',
      { email: 'unknown@x.test' },
      { method: 'POST' },
    ))
    const unknownForgot = await app.handle(json(
      'http://localhost/api/auth/forgot-password',
      { email: 'unknown@x.test' },
      { method: 'POST' },
    ))

    expect(unknownResend.status).toBe(202)
    expect(unknownForgot.status).toBe(202)
    expect(await unknownResend.json()).toEqual({ success: true, data: { accepted: true } })
    expect(await unknownForgot.json()).toEqual({ success: true, data: { accepted: true } })
  })

  it('resets a password without a new session and revokes every old session', async () => {
    await register('reset-route@x.test')
    const verified = await verifyLatestEmail()
    const firstCookie = sessionCookie(verified.headers.get('set-cookie'))
    const login = await app.handle(json(
      'http://localhost/api/auth/login',
      { email: 'reset-route@x.test', password: 'password1' },
      { method: 'POST' },
    ))
    const secondCookie = sessionCookie(login.headers.get('set-cookie'))

    await app.handle(json(
      'http://localhost/api/auth/forgot-password',
      { email: 'reset-route@x.test' },
      { method: 'POST' },
    ))
    const resetToken = tokenFrom(sender.passwordResets.at(-1)!.url)
    const reset = await app.handle(json(
      'http://localhost/api/auth/reset-password',
      { token: resetToken, newPassword: 'password2' },
      { method: 'POST' },
    ))

    expect(reset.status).toBe(204)
    expect(reset.headers.get('set-cookie')).toBeNull()
    for (const cookie of [firstCookie, secondCookie]) {
      const me = await app.handle(new Request('http://localhost/api/auth/me', { headers: { cookie } }))
      expect(me.status).toBe(401)
    }
  })

  it('changes the password by revoking old sessions and setting one replacement cookie', async () => {
    await register('change-route@x.test')
    const verified = await verifyLatestEmail()
    const oldCookie = sessionCookie(verified.headers.get('set-cookie'))

    const changed = await app.handle(json(
      'http://localhost/api/auth/change-password',
      { currentPassword: 'password1', newPassword: 'password2' },
      { method: 'POST', headers: { cookie: oldCookie } },
    ))
    const replacementCookie = sessionCookie(changed.headers.get('set-cookie'))

    expect(changed.status).toBe(200)
    expect(replacementCookie).not.toBe(oldCookie)
    expect((await app.handle(new Request('http://localhost/api/auth/me', {
      headers: { cookie: oldCookie },
    }))).status).toBe(401)
    expect((await app.handle(new Request('http://localhost/api/auth/me', {
      headers: { cookie: replacementCookie },
    }))).status).toBe(200)
  })

  it('logs out all sessions and clears the current cookie', async () => {
    await register('logout-all-route@x.test')
    const verified = await verifyLatestEmail()
    const cookie = sessionCookie(verified.headers.get('set-cookie'))

    const response = await app.handle(new Request('http://localhost/api/auth/logout-all', {
      method: 'POST',
      headers: { cookie },
    }))

    expect(response.status).toBe(204)
    expect(response.headers.get('set-cookie')).toContain('Max-Age=0')
    expect((await app.handle(new Request('http://localhost/api/auth/me', {
      headers: { cookie },
    }))).status).toBe(401)
  })

  it('logs out the current session and clears the cookie', async () => {
    await register('logout-route@x.test')
    const verified = await verifyLatestEmail()
    const cookie = sessionCookie(verified.headers.get('set-cookie'))

    const logout = await app.handle(new Request('http://localhost/api/auth/logout', {
      method: 'POST',
      headers: { cookie },
    }))
    expect(logout.status).toBe(204)
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')
    expect((await app.handle(new Request('http://localhost/api/auth/me', {
      headers: { cookie },
    }))).status).toBe(401)
  })
})

describe('github oauth routes', () => {
  let githubApp: ReturnType<typeof createTestApp>['app']

  beforeAll(() => {
    githubApp = createTestApp({
      authService: handle.authService,
      generationRepository: {} as GenerationRepository,
      auditRepository,
      githubOAuth: {
        clientId: 'test-client',
        clientSecret: 'test-secret',
        callbackUrl: 'https://create.example.test/api/auth/github/callback',
        webOrigin: 'https://create.example.test',
      },
    }).app
  })

  function mockGithubFetch(): void {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url === 'https://github.com/login/oauth/access_token') {
        return new Response(JSON.stringify({ access_token: 'gho_test_token' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      if (url === 'https://api.github.com/user') {
        return new Response(JSON.stringify({
          id: 4242,
          login: 'octocat',
          name: 'Mona Octocat',
          email: 'octo@example.com',
        }), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      if (url === 'https://api.github.com/user/emails') {
        return new Response(JSON.stringify([
          { email: 'octo@example.com', primary: true, verified: true },
        ]), { status: 200, headers: { 'content-type': 'application/json' } })
      }
      return new Response(JSON.stringify({ message: 'unexpected url' }), { status: 500 })
    }))
  }

  it('redirects to GitHub authorize with a state cookie', async () => {
    const response = await githubApp.handle(new Request('http://localhost/api/auth/github'))
    expect(response.status).toBe(302)
    const location = response.headers.get('location')
    expect(location).toMatch(/^https:\/\/github\.com\/login\/oauth\/authorize\?/)
    expect(location).toContain('client_id=test-client')
    expect(location).toContain('redirect_uri=https%3A%2F%2Fcreate.example.test%2Fapi%2Fauth%2Fgithub%2Fcallback')
    expect(location).toContain('state=')
    expect(response.headers.get('set-cookie')).toContain('github_oauth_state=')
  })

  it('completes the OAuth dance and issues a session cookie', async () => {
    mockGithubFetch()
    try {
      const authorize = await githubApp.handle(new Request('http://localhost/api/auth/github'))
      const state = new URL(authorize.headers.get('location')!).searchParams.get('state')!
      const stateCookie = authorize.headers.get('set-cookie')!.split(';')[0]!

      const callback = await githubApp.handle(new Request(
        `http://localhost/api/auth/github/callback?code=testcode&state=${state}`,
        { headers: { cookie: stateCookie } },
      ))
      expect(callback.status).toBe(302)
      expect(callback.headers.get('location')).toBe('https://create.example.test/create')

      const setCookie = callback.headers.get('set-cookie')
      expect(setCookie).toContain('bailian_studio_session=')
      const sessionValue = setCookie!.split(',')[0]!.split(';')[0]!
      const me = await githubApp.handle(new Request('http://localhost/api/auth/me', {
        headers: { cookie: sessionValue },
      }))
      expect(me.status).toBe(200)
      const body = await me.json() as { data: { user: { email: string } } }
      expect(body.data.user.email).toBe('octo@example.com')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('rejects a state mismatch and redirects to login with oauth_error', async () => {
    const callback = await githubApp.handle(new Request(
      'http://localhost/api/auth/github/callback?code=testcode&state=wrong-state-value',
      { headers: { cookie: 'github_oauth_state=some-other-state' } },
    ))
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toContain('/auth/login?oauth_error=invalid_state')
  })

  it('redirects to login when the user cancels (error param, no code)', async () => {
    const callback = await githubApp.handle(new Request(
      'http://localhost/api/auth/github/callback?error=access_denied&error_description=denied&state=whatever',
      { headers: { cookie: 'github_oauth_state=whatever' } },
    ))
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toContain('/auth/login?oauth_error=access_denied')
  })
})
