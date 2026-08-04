import { create } from 'zustand'

/**
 * 全局认证弹窗状态。登录/注册通过同一个 Dialog 承载，支持模式切换与
 * 登录后回跳（`callback` 经安全校验，见 api-client 的 resolvePostLoginRedirect）。
 */

export type AuthDialogMode = 'login' | 'register'

interface AuthDialogState {
  isOpen: boolean
  mode: AuthDialogMode
  /** 登录成功后的回跳路径（相对路径或同源绝对路径，安全白名单内）。 */
  callback: string | null
  open(mode: AuthDialogMode, callback?: string | null): void
  switchMode(mode: AuthDialogMode): void
  close(): void
}

export const useAuthDialogStore = create<AuthDialogState>(set => ({
  isOpen: false,
  mode: 'login',
  callback: null,
  open: (mode, callback = null) => set({ isOpen: true, mode, callback }),
  switchMode: mode => set({ mode }),
  close: () => set({ isOpen: false }),
}))
