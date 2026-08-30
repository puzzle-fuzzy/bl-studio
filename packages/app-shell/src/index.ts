/**
 * @bailian-studio/app-shell：跨 app 共享的认证层。
 *
 * Batch 1 拆分（studio / writer）的不可约共享核心：会话 store、登录/注册
 * 相关页面与弹窗、路由守卫。守卫不再绑定任何应用外壳——壳由各 app 组合。
 */
export { useAuthStore, registerPrivateDataReset, resetAllPrivateData } from './stores/auth-store'
export { useAuthDialogStore } from './stores/auth-dialog-store'
export { clearIdempotencyKey, clearIdempotencyKeys, idempotencyKeyFor, payloadFingerprint, stableStringify } from './stores/idempotency'
export { ProtectedRoute } from './auth/ProtectedRoute'
export { RedirectIfAuthed } from './auth/RedirectIfAuthed'
export { AuthDialog } from './auth/AuthDialog'
export { ChangePasswordDialog } from './auth/ChangePasswordDialog'
export { LoginWordmark } from './auth/LoginWordmark'
export { LiquidSandBackground } from './auth/LiquidSandBackground'
export { LoginPage } from './pages/auth/LoginPage'
export { VerifyEmailPage } from './pages/auth/VerifyEmailPage'
export { CheckEmailPage } from './pages/auth/CheckEmailPage'
export { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
export { ResetPasswordPage } from './pages/auth/ResetPasswordPage'
