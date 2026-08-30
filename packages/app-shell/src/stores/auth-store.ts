import { create } from 'zustand'
import { ApiClientError, type EmailActionAccepted, type PublicUser } from '@bailian-studio/api-client'
import { apiClient } from '@bailian-studio/lib-client'
import { clearIdempotencyKeys } from '../stores/idempotency'

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous'

/**
 * 认证 store。
 *
 * 继承 Vue 版最佳实践：登出时统一清理各 store 的私有数据（注册表机制），
 * 避免跨用户数据残留。`getCurrentUser` 把 401 映射为 null，因此 restore 能
 * 区分「未登录」与「真故障」。
 */

/** 登出/登出所有设备时被调用的私有数据清理回调。 */
const privateDataResets = new Set<() => void | Promise<void>>()

export function registerPrivateDataReset(fn: () => void | Promise<void>): void {
  privateDataResets.add(fn)
}

export async function resetAllPrivateData(): Promise<void> {
  await Promise.allSettled([...privateDataResets].map(fn => fn()))
}

// P1-07：幂等指纹缓存是模块级跨用户残留——登出时一并清空，防止用户 A 失败后
// 用户 B 提交相同 payload 复用同一 idempotencyKey。
registerPrivateDataReset(clearIdempotencyKeys)

interface AuthState {
  status: AuthStatus
  user: PublicUser | null
  /** 注册后待验证的原始邮箱：重发验证邮件用（R2-P0-01，必须是真实邮箱）。 */
  pendingVerificationEmail: string | null
  /** 注册后待验证邮箱的掩码展示值（如 j***@163.com），仅供渲染。 */
  pendingVerificationDisplayEmail: string | null
  /** 服务端返回的下一次可重发时间，避免前端自行假设冷却长度。 */
  pendingVerificationResendAvailableAt: string | null
  isPending: boolean
  lastError: string | null

  restore(): Promise<void>
  login(email: string, password: string): Promise<void>
  register(email: string, password: string, displayName?: string): Promise<boolean>
  verifyEmail(token: string): Promise<void>
  resendVerification(email: string): Promise<EmailActionAccepted>
  forgotPassword(email: string): Promise<void>
  resetPassword(token: string, newPassword: string): Promise<void>
  changePassword(currentPassword: string, newPassword: string): Promise<void>
  unlinkGithub(): Promise<void>
  updateProfile(displayName: string): Promise<void>
  uploadAvatar(file: File): Promise<void>
  removeAvatar(): Promise<void>
  logout(): Promise<void>
  logoutAll(): Promise<void>
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'unknown',
  user: null,
  pendingVerificationEmail: null,
  pendingVerificationDisplayEmail: null,
  pendingVerificationResendAvailableAt: null,
  isPending: false,
  lastError: null,

  async restore() {
    if (get().status === 'authenticated') return
    try {
      const user = await apiClient.getCurrentUser()
      set({ status: user === null ? 'anonymous' : 'authenticated', user })
    } catch {
      set({ status: 'anonymous', user: null })
    }
  },

  async login(email, password) {
    set({ isPending: true, lastError: null })
    try {
      const user = await apiClient.login({ email: normalizeEmail(email), password })
      set({ status: 'authenticated', user })
    } catch (error) {
      set({ lastError: error instanceof Error ? error.message : String(error) })
      throw error
    } finally {
      set({ isPending: false })
    }
  },

  async register(email, password, displayName) {
    set({ isPending: true, lastError: null })
    try {
      const result = await apiClient.register({
        email: normalizeEmail(email),
        password,
        displayName,
      })
      if (result.status === 'verification_required') {
        // R2-P0-01：存原始邮箱（重发用）+ 掩码展示值（渲染用），二者分离。
        set({
          pendingVerificationEmail: result.email,
          pendingVerificationDisplayEmail: result.displayEmail,
          pendingVerificationResendAvailableAt: result.resendAvailableAt,
        })
        return true
      }
      return false
    } catch (error) {
      if (error instanceof ApiClientError && (
        error.code === 'EMAIL_DELIVERY_FAILED'
        || (error.code === 'AUTH_EMAIL_TAKEN'
          && typeof error.details === 'object'
          && error.details !== null
          && 'action' in error.details
          && (error.details as { action?: unknown }).action === 'resend_verification')
      )) {
        set({
          pendingVerificationEmail: normalizeEmail(email),
          pendingVerificationDisplayEmail: normalizeEmail(email),
          pendingVerificationResendAvailableAt: null,
        })
      }
      set({ lastError: error instanceof Error ? error.message : String(error) })
      throw error
    } finally {
      set({ isPending: false })
    }
  },

  async verifyEmail(token) {
    const user = await apiClient.verifyEmail({ token })
    set({
      status: 'authenticated',
      user,
      pendingVerificationEmail: null,
      pendingVerificationDisplayEmail: null,
      pendingVerificationResendAvailableAt: null,
    })
  },

  async resendVerification(email) {
    const result = await apiClient.resendVerification({ email: normalizeEmail(email) })
    const normalizedEmail = normalizeEmail(email)
    set(state => ({
      pendingVerificationEmail: state.pendingVerificationEmail === normalizedEmail
        ? state.pendingVerificationEmail
        : normalizedEmail,
      pendingVerificationDisplayEmail: state.pendingVerificationEmail === normalizedEmail
        ? state.pendingVerificationDisplayEmail
        : normalizedEmail,
      pendingVerificationResendAvailableAt: result.retryAt ?? null,
    }))
    return result
  },

  async forgotPassword(email) {
    await apiClient.forgotPassword({ email: normalizeEmail(email) })
  },

  async resetPassword(token, newPassword) {
    await apiClient.resetPassword({ token, newPassword })
  },

  async changePassword(currentPassword, newPassword) {
    const user = await apiClient.changePassword({ currentPassword, newPassword })
    set({ user })
  },

  async unlinkGithub() {
    const user = await apiClient.unlinkGithub()
    set({ user })
  },

  async updateProfile(displayName) {
    const user = await apiClient.updateProfile({ displayName })
    set({ user })
  },

  async uploadAvatar(file) {
    const user = await apiClient.uploadAvatar(file)
    set({ user })
  },

  async removeAvatar() {
    const user = await apiClient.removeAvatar()
    set({ user })
  },

  async logout() {
    try {
      await apiClient.logout()
    } finally {
      await resetAllPrivateData()
      set({ status: 'anonymous', user: null })
    }
  },

  async logoutAll() {
    try {
      await apiClient.logoutAll()
    } finally {
      await resetAllPrivateData()
      set({ status: 'anonymous', user: null })
    }
  },
}))
