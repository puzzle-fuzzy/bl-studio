import { AuthError, type AuthService, type PublicUser } from '@bailian-studio/auth'
import { readCookie, SESSION_COOKIE } from './cookies'

/**
 * Resolve the authenticated user from the session cookie. Returns undefined
 * when there is no cookie, the token is invalid/expired, or the session was
 * revoked — callers treat all of these the same (not authenticated).
 */
export async function resolveAuthUser(request: Request, authService: AuthService): Promise<PublicUser | undefined> {
  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE)
  if (token === undefined) return undefined
  const verified = await authService.verifyToken(token)
  return verified?.user
}

/** Resolve the authenticated user or throw AUTH_UNAUTHORIZED (→ 401). */
export async function requireAuthUser(request: Request, authService: AuthService): Promise<PublicUser> {
  const user = await resolveAuthUser(request, authService)
  if (user === undefined) {
    throw new AuthError('AUTH_UNAUTHORIZED', 'Authentication required')
  }
  return user
}

/** Resolve an authenticated administrator or throw AUTH_FORBIDDEN (→403). */
export async function requireAdminUser(request: Request, authService: AuthService): Promise<PublicUser> {
  const user = await requireAuthUser(request, authService)
  if (user.role !== 'admin') {
    throw new AuthError('AUTH_FORBIDDEN', 'Administrator access required')
  }
  return user
}
