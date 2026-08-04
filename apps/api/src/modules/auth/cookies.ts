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

/** Cookie set value that expires immediately, used to clear the session cookie on logout. */
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

/** Cookies require Secure in production (HTTPS). Off by default for local dev over HTTP. */
export function cookieSecure(source: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return source['COOKIE_SECURE'] === 'true' || source['NODE_ENV'] === 'production'
}
