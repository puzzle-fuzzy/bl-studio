import { create } from 'zustand'
import type { PublicUser } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { userErrorMessage } from '@/lib/user-error'

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous'

/**
 * 管理后台认证 store：复用主站 /api/auth 的会话 cookie。
 *
 * 与主站唯一区别：登录/恢复后要求 `role === 'admin'`，否则视为未授权（匿名），
 * 路由守卫据此把非管理员弹回登录页。
 */

interface AdminAuthState {
  status: AuthStatus
  user: PublicUser | null
  isPending: boolean
  lastError: string | null

  restore(): Promise<void>
  login(email: string, password: string): Promise<void>
  logout(): Promise<void>
}

export const useAdminAuthStore = create<AdminAuthState>(set => ({
  status: 'unknown',
  user: null,
  isPending: false,
  lastError: null,

  async restore() {
    if (get().status === 'authenticated') return
    try {
      const user = await apiClient.getCurrentUser()
      // 非 admin 一律按未登录处理（403 页由守卫展示）。
      const authorized = user !== null && user.role === 'admin'
      set(authorized
        ? { status: 'authenticated', user }
        : { status: 'anonymous', user: null })
    } catch {
      set({ status: 'anonymous', user: null })
    }
  },

  async login(email, password) {
    set({ isPending: true, lastError: null })
    try {
      const user = await apiClient.login({ email: email.trim().toLowerCase(), password })
      if (user.role !== 'admin') {
        set({ status: 'anonymous', user: null, lastError: '该账号没有管理员权限' })
        return
      }
      set({ status: 'authenticated', user })
    } catch (error) {
      // P1-13：错误走 user-error 映射，避免原始 message 泄漏到 lastError。
      set({ lastError: userErrorMessage(error) })
      throw error
    } finally {
      set({ isPending: false })
    }
  },

  async logout() {
    try {
      await apiClient.logout()
    } finally {
      set({ status: 'anonymous', user: null })
    }
  },
}))

function get(): AdminAuthState {
  return useAdminAuthStore.getState()
}
