/**
 * 认证域错误定义。
 *
 * @bailian-studio/auth 抛出的错误统一用 AuthError，并通过 code 标识具体原因；API 层
 * （modules/auth）据此映射到 HTTP 状态码：凭据/token 类问题映射 401，邮箱已被
 * 占用映射 409。这样认证逻辑与 HTTP 层解耦——本包只关心业务语义，不关心传输。
 */
export type AuthErrorCode =
  | 'AUTH_INVALID_CREDENTIALS'
  | 'AUTH_EMAIL_TAKEN'
  | 'AUTH_EMAIL_UNVERIFIED'
  | 'AUTH_TOKEN_INVALID'
  | 'AUTH_TOKEN_EXPIRED'
  | 'AUTH_TOKEN_CONSUMED'
  | 'AUTH_PASSWORD_UNCHANGED'
  | 'AUTH_EMAIL_RATE_LIMITED'
  | 'EMAIL_DELIVERY_FAILED'
  | 'AUTH_UNAUTHORIZED'
  | 'AUTH_FORBIDDEN'
  | 'AUTH_PROVIDER_NOT_CONFIGURED'

/** 认证错误。code 供 API 层做 HTTP 状态码与错误响应体映射，message 仅用于人类阅读。 */
export class AuthError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'AuthError'
  }
}
