import { AuthError, type AuthService, type PublicUser } from '@bailian-studio/auth'
import { readCookie, SESSION_COOKIE } from './cookies'

/**
 * 从会话 cookie 解析已认证用户。无 cookie、token 无效/过期或会话已被吊销时
 * 返回 undefined——调用方把所有情况都同等对待（视为未认证）。
 */
export async function resolveAuthUser(request: Request, authService: AuthService): Promise<PublicUser | undefined> {
  const token = readCookie(request.headers.get('cookie'), SESSION_COOKIE)
  if (token === undefined) return undefined
  const verified = await authService.verifyToken(token)
  return verified?.user
}

/** 解析已认证用户，否则抛出 AUTH_UNAUTHORIZED（→ 401）。 */
export async function requireAuthUser(request: Request, authService: AuthService): Promise<PublicUser> {
  const user = await resolveAuthUser(request, authService)
  if (user === undefined) {
    throw new AuthError('AUTH_UNAUTHORIZED', 'Authentication required')
  }
  return user
}

/** 解析已认证的管理员，否则抛出 AUTH_FORBIDDEN（→ 403）。 */
export async function requireAdminUser(request: Request, authService: AuthService): Promise<PublicUser> {
  const user = await requireAuthUser(request, authService)
  if (user.role !== 'admin') {
    throw new AuthError('AUTH_FORBIDDEN', 'Administrator access required')
  }
  return user
}
