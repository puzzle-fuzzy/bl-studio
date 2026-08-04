export const SESSION_COOKIE = 'bailian_studio_session'

export interface SessionCookieAttributes {
  httpOnly: true
  sameSite: 'lax'
  path: '/'
  secure: boolean
  maxAge: number
}

export function sessionCookieAttributes(maxAgeSeconds: number, secure: boolean): SessionCookieAttributes {
  return { httpOnly: true, sameSite: 'lax', path: '/', secure, maxAge: maxAgeSeconds }
}

/** 立即过期的 cookie 设置值，用于登出时清除会话 cookie。 */
export function clearedCookieAttributes(secure: boolean): SessionCookieAttributes & { value: '' } {
  return { ...sessionCookieAttributes(0, secure), value: '' }
}

export function readCookie(cookieHeader: string | null, name: string): string | undefined {
  if (cookieHeader === null) return undefined
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    if (key === name) {
      const value = part.slice(eq + 1).trim()
      return value.length > 0 ? decodeURIComponent(value) : undefined
    }
  }
  return undefined
}

/** 生产环境（HTTPS）下 cookie 必须带 Secure；本地 HTTP 开发默认关闭。 */
export function cookieSecure(source: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return source['COOKIE_SECURE'] === 'true' || source['NODE_ENV'] === 'production'
}
