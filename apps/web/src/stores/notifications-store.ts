import { create } from 'zustand'
import { apiClient } from '@/lib/api'
import { formatCents } from '@/lib/money'
import { registerPrivateDataReset } from './auth-store'

export interface OfficialNotification {
  id: string
  title: string
  description: string
  createdAt: string
}

export interface GlobalMessage {
  title: string
  description?: string
  tone: 'success' | 'warning' | 'info'
}

const READ_IDS_KEY = 'bailian-studio:read-notification-ids:v1'
const MAX_READ_IDS = 100
const MESSAGE_DURATION_MS = 4500

function loadReadIds(): string[] {
  try {
    const raw = localStorage.getItem(READ_IDS_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  } catch {
    return []
  }
}

function persistReadIds(ids: readonly string[]): void {
  localStorage.setItem(READ_IDS_KEY, JSON.stringify(ids.slice(0, MAX_READ_IDS)))
}

interface NotificationsState {
  notifications: OfficialNotification[]
  readIds: string[]
  unreadCount: number
  isLoading: boolean
  hasLoaded: boolean
  error: string | null
  activeMessage: GlobalMessage | null

  load(force?: boolean): Promise<void>
  openNotification(id: string): void
  markAllRead(): void
  showMessage(message: GlobalMessage): void
  dismissMessage(): void
  reset(): void
}

let messageTimer: ReturnType<typeof setTimeout> | null = null

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  readIds: loadReadIds(),
  unreadCount: 0,
  isLoading: false,
  hasLoaded: false,
  error: null,
  activeMessage: null,

  async load(force = false) {
    if (get().hasLoaded && !force) return
    set({ isLoading: true, error: null })
    try {
      const [models, usage] = await Promise.all([apiClient.getModels(), apiClient.getUsage()])
      const notifications: OfficialNotification[] = []
      if (models.length > 0) {
        notifications.push({
          id: 'model-catalog',
          title: '模型目录已更新',
          description: `当前可生成模型 ${models.length} 个，快去创作吧。`,
          createdAt: new Date().toISOString(),
        })
      }
      if (usage !== null) {
        notifications.push({
          id: 'monthly-usage',
          title: '本月用量',
          description: `本月已成功生成 ${usage.successfulCount} 次，费用 ${formatCents(usage.chargedCents)}。`,
          createdAt: new Date().toISOString(),
        })
      }
      const readIds = get().readIds
      set({
        notifications,
        unreadCount: notifications.filter(notification => !readIds.includes(notification.id)).length,
        hasLoaded: true,
        isLoading: false,
      })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isLoading: false })
    }
  },

  openNotification(id) {
    const readIds = get().readIds.includes(id) ? get().readIds : [...get().readIds, id]
    persistReadIds(readIds)
    const notification = get().notifications.find(item => item.id === id)
    set({
      readIds,
      unreadCount: Math.max(0, get().unreadCount - (get().readIds.includes(id) ? 0 : 1)),
    })
    if (notification !== undefined) {
      get().showMessage({ title: notification.title, description: notification.description, tone: 'info' })
    }
  },

  markAllRead() {
    const readIds = get().notifications.map(notification => notification.id)
    persistReadIds(readIds)
    set({ readIds, unreadCount: 0 })
  },

  showMessage(message) {
    if (messageTimer !== null) clearTimeout(messageTimer)
    set({ activeMessage: message })
    messageTimer = setTimeout(() => {
      set({ activeMessage: null })
      messageTimer = null
    }, MESSAGE_DURATION_MS)
  },

  dismissMessage() {
    if (messageTimer !== null) clearTimeout(messageTimer)
    messageTimer = null
    set({ activeMessage: null })
  },

  reset() {
    set({ notifications: [], unreadCount: 0, hasLoaded: false, error: null, isLoading: false, activeMessage: null })
  },
}))

registerPrivateDataReset(() => useNotificationsStore.getState().reset())
