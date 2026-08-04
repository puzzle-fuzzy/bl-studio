/**
 * @bailian-studio/auth —— 自托管邮箱/密码认证包（端到端）。
 *
 * 职责：用 http-only cookie + 可撤销 JWT session 实现完整的认证闭环。
 * 内部组合 @bailian-studio/db（users/sessions 表）、密码 argon2id 哈希、HS256 JWT
 * 签发/校验，对外暴露 createAuthService 编排出的四个动词（register / login /
 * verifyToken / revokeSessionByToken），以及与 generation repository 包
 * 一致的 URL 工厂（createAuthServiceFromUrl / createIsolatedAuthService），让
 * services 在不直接 import @bailian-studio/db 的前提下完成持久化接线。
 *
 * 安全要点：明文密码永不存储；token 的 sid 同时是 sessions 表一行，删除该行
 * 即可在 token 的 exp 到期前撤销它（token 有效 ≠ session 有效）。
 */

export { hashPassword, verifyPassword } from './password'
export { signJwt, verifyJwt, type JwtPayload, type SignJwtOptions, type VerifyJwtOptions } from './jwt'
export {
  createUser,
  createUserInTransaction,
  findActiveUserByEmail,
  findActiveUserById,
  createSession,
  findActiveSession,
  revokeSession,
  revokeAllSessions,
  createAuthActionToken,
  consumeAuthActionToken,
  revokeActiveTokens,
  markUserEmailVerified,
  updateUserPassword,
  hashAuthActionToken,
  type AuthActionTokenPurpose,
  type ActiveSession,
  type CreateUserInput,
  type CreateSessionInput,
  type UserRepositoryRecord,
} from './repository'
export {
  createAuthService,
  type AuthService,
  type AuthServiceOptions,
  type AuthResult,
  type EmailActionAccepted,
  type PublicUser,
  type RegistrationResult,
  type VerifiedSession,
} from './service'
export type { TransactionalEmailSender } from './email'
export { createAuthServiceFromUrl, createIsolatedAuthService, type AuthServiceHandle, type CreateAuthServiceFromUrlOptions, type IsolatedAuthService } from './factory'
export { AuthError, type AuthErrorCode } from './errors'
