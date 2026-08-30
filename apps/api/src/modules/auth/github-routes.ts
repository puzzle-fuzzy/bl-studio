import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { AuthError } from '@bailian-studio/auth'
import { validateInput } from '@bailian-studio/shared'
import type { ApiDependencies, GithubOAuthConfig } from '../../dependencies'
import { recordApiAuditEvent } from '../../lib/audit'
import { readCookie, sessionCookieAttributes, SESSION_COOKIE, type SessionCookieAttributes } from './cookies'

/**
 * GitHub OAuth 登录流程（Authorization Code + PKCE 由 GitHub 内置 state 承担）。
 *
 * - `GET /api/auth/github`：生成随机 state（存短生命周期 http-only cookie）后 302 跳转
 *   GitHub 授权页；
 * - `GET /api/auth/github/callback`：校验 state → code 换 access_token → 拉取用户与
 *   主邮箱 → `authService.loginWithGithub`（按 githubId / 邮箱链接 / 新建用户）→ 种会话
 *   cookie → 302 回前端。
 *
 * 失败一律 302 回登录页并带 `?oauth_error=<code>`，避免把 GitHub 细节暴露给用户。
 */

const GITHUB_AUTHORIZE_URL = 'https://github.com/login/oauth/authorize'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_OAUTH_STATE_COOKIE = 'github_oauth_state'
const STATE_COOKIE_TTL_SECONDS = 10 * 60

const CallbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(8),
  error: z.string().optional(),
})

/** GitHub OAuth 未配置时抛出的错误（路由启动前检查，配置缺失即拒用）。 */
export class GithubNotConfiguredError extends AuthError {
  constructor() {
    super('AUTH_PROVIDER_NOT_CONFIGURED', 'GitHub 登录尚未配置，请使用邮箱登录。')
  }
}

function stateCookieHeader(state: string, secure: boolean): string {
  const base = `${GITHUB_OAUTH_STATE_COOKIE}=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${STATE_COOKIE_TTL_SECONDS}`
  return secure ? `${base}; Secure` : base
}

function clearedStateCookieHeader(secure: boolean): string {
  const base = `${GITHUB_OAUTH_STATE_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
  return secure ? `${base}; Secure` : base
}

function sessionCookieHeader(value: string, attrs: SessionCookieAttributes): string {
  const parts = [`${SESSION_COOKIE}=${encodeURIComponent(value)}`, 'HttpOnly', `SameSite=${attrs.sameSite}`, `Path=${attrs.path}`]
  if (attrs.secure) parts.push('Secure')
  parts.push(`Max-Age=${attrs.maxAge}`)
  return parts.join('; ')
}

function maxAgeFor(expiresAt: Date): number {
  return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
}

function redirectToLogin(config: GithubOAuthConfig, secure: boolean, errorCode: string): Response {
  const location = `${config.webOrigin}/auth/login?oauth_error=${encodeURIComponent(errorCode)}`
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Set-Cookie': clearedStateCookieHeader(secure) },
  })
}

export function createGithubOAuthHandlers(deps: ApiDependencies) {
  return {
    authorize(): Response {
      const config = deps.githubOAuth
      if (config === undefined) throw new GithubNotConfiguredError()

      const state = randomBytes(16).toString('base64url')
      const authorizeUrl = new URL(GITHUB_AUTHORIZE_URL)
      authorizeUrl.searchParams.set('client_id', config.clientId)
      authorizeUrl.searchParams.set('redirect_uri', config.callbackUrl)
      // user:email 即足够：拉取用户头像/昵称无需 scope，仅取主邮箱需要。
      authorizeUrl.searchParams.set('scope', 'user:email')
      authorizeUrl.searchParams.set('state', state)

      return new Response(null, {
        status: 302,
        headers: { Location: authorizeUrl.toString(), 'Set-Cookie': stateCookieHeader(state, deps.cookieSecure) },
      })
    },

    async callback({ request, query }: { request: Request; query: Record<string, string> }): Promise<Response> {
      const config = deps.githubOAuth
      if (config === undefined) throw new GithubNotConfiguredError()

      // GitHub 在用户取消授权时带 error 参数返回（无 code），先行处理。
      if (typeof query.error === 'string' && query.error.length > 0) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.github',
          outcome: 'failed',
          metadata: { step: 'access_denied' },
        })
        return redirectToLogin(config, deps.cookieSecure, 'access_denied')
      }

      let input: { code: string; state: string }
      try {
        input = validateInput(CallbackQuerySchema, query)
      } catch {
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.github',
          outcome: 'failed',
          metadata: { step: 'invalid_query' },
        })
        return redirectToLogin(config, deps.cookieSecure, 'invalid_state')
      }

      const expectedState = readCookie(request.headers.get('cookie'), GITHUB_OAUTH_STATE_COOKIE)
      if (expectedState === undefined || expectedState !== input.state) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.github',
          outcome: 'failed',
          metadata: { step: 'state_mismatch' },
        })
        return redirectToLogin(config, deps.cookieSecure, 'invalid_state')
      }

      const accessToken = await exchangeCodeForToken(config, input.code)
      if (accessToken === undefined) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.github',
          outcome: 'failed',
          metadata: { step: 'token_exchange' },
        })
        return redirectToLogin(config, deps.cookieSecure, 'login_failed')
      }

      const profile = await fetchGithubProfile(accessToken)
      if (profile === undefined) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.github',
          outcome: 'failed',
          metadata: { step: 'profile_fetch' },
        })
        return redirectToLogin(config, deps.cookieSecure, 'login_failed')
      }

      try {
        const result = await deps.authService.loginWithGithub({
          githubId: profile.githubId,
          email: profile.email,
          displayName: profile.displayName,
        })
        await recordApiAuditEvent(deps.auditRepository, request, {
          userId: result.user.id,
          action: 'auth.github',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: result.user.id,
        })
        const headers = new Headers({ Location: `${config.webOrigin}/create` })
        headers.append(
          'Set-Cookie',
          sessionCookieHeader(result.token, sessionCookieAttributes(maxAgeFor(result.expiresAt), deps.cookieSecure)),
        )
        headers.append('Set-Cookie', clearedStateCookieHeader(deps.cookieSecure))
        return new Response(null, { status: 302, headers })
      } catch (error) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          action: 'auth.github',
          outcome: 'failed',
          metadata: { errorCode: error instanceof Error && 'code' in error ? String((error as { code: unknown }).code) : 'unknown' },
        })
        return redirectToLogin(config, deps.cookieSecure, 'login_failed')
      }
    },
  }
}

/** 用授权码换 access_token；失败返回 undefined。 */
async function exchangeCodeForToken(config: GithubOAuthConfig, code: string): Promise<string | undefined> {
  try {
    const response = await fetch(GITHUB_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: config.callbackUrl,
      }),
    })
    const data = (await response.json().catch(() => ({}))) as { access_token?: unknown }
    return typeof data.access_token === 'string' ? data.access_token : undefined
  } catch {
    return undefined
  }
}

interface GithubProfile {
  githubId: string
  email: string
  displayName?: string
}

/** 拉取 GitHub 用户与主邮箱；邮箱缺失（私密邮箱）时返回 undefined。 */
async function fetchGithubProfile(accessToken: string): Promise<GithubProfile | undefined> {
  const headers = {
    Accept: 'application/json',
    Authorization: `Bearer ${accessToken}`,
    'User-Agent': 'bailian-studio',
  }
  try {
    const userResponse = await fetch(`${GITHUB_API_BASE}/user`, { headers })
    const user = (await userResponse.json().catch(() => ({}))) as {
      id?: unknown
      login?: unknown
      name?: unknown
      email?: unknown
    }
    const githubId = typeof user.id === 'number' ? String(user.id) : undefined
    if (githubId === undefined) return undefined

    // `/user.email` may be present even when it is not a verified primary address.
    // Always use `/user/emails` so account linking and email verification share one rule.
    const emailsResponse = await fetch(`${GITHUB_API_BASE}/user/emails`, { headers })
    const emails = (await emailsResponse.json().catch(() => [])) as Array<{
      email?: unknown
      primary?: unknown
      verified?: unknown
    }>
    let email: string | undefined
    if (Array.isArray(emails)) {
      const primary = emails.find(entry => entry.primary === true && entry.verified === true)
      email = typeof primary?.email === 'string' && primary.email.length > 0 ? primary.email : undefined
    }
    if (email === undefined) return undefined

    const displayName = typeof user.name === 'string' && user.name.length > 0
      ? user.name
      : typeof user.login === 'string' ? user.login : undefined
    return { githubId, email, displayName }
  } catch {
    return undefined
  }
}
