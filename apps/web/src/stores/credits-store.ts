import { create } from 'zustand'
import type { CreditBalance } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { registerPrivateDataReset } from './auth-store'

interface CreditsState {
  balance: CreditBalance | null
  isLoading: boolean
  hasLoaded: boolean
  error: string | null
  load(force?: boolean): Promise<void>
  refresh(): Promise<void>
  reset(): void
}

let requestEpoch = 0

export const useCreditsStore = create<CreditsState>((set, get) => ({
  balance: null,
  isLoading: false,
  hasLoaded: false,
  error: null,

  async load(force = false) {
    if (get().hasLoaded && !force) return
    await get().refresh()
  },

  async refresh() {
    const epoch = ++requestEpoch
    set({ isLoading: true, error: null })
    try {
      const balance = await apiClient.getCreditBalance()
      // 丢弃过期响应，防止乱序回写旧余额。
      if (epoch === requestEpoch) set({ balance, hasLoaded: true, isLoading: false })
    } catch (error) {
      if (epoch === requestEpoch) {
        set({ error: error instanceof Error ? error.message : String(error), isLoading: false })
      }
    }
  },

  reset() {
    requestEpoch += 1
    set({ balance: null, hasLoaded: false, error: null, isLoading: false })
  },
}))

registerPrivateDataReset(() => useCreditsStore.getState().reset())
