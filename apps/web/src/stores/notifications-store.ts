import { create } from 'zustand'
import type { ModelCatalogItem, NotificationItem } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { formatCents } from '@/lib/money'
import { registerPrivateDataReset } from './auth-store'

/**
 * 通知中心 store。
 *
 * 两类通知合流展示：
 *  - 服务端社交通知（点赞/收藏 → 作者）：落库 + SSE 实时推送，已读态在服务端
 *    readAt，未读数经 /api/notifications/unread-count；
 *  - 本地合成的官方通知（模型目录/月度用量）：纯前端构造，已读态在 localStorage
 *    （原有行为保留）。
 */

export type NotificationKind = 'like' | 'favorite' | 'system'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  description: string
  createdAt: string
  read: boolean
  /** 服务端通知关联的公开作品；点击可跳画廊详情。 */
  recordId?: string
  /** true 表示服务端通知（已读态在 DB）；缺省为本地合成通知（localStorage）。 */
  server?: boolean
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

const isLocalRead = (id: string): boolean => loadReadIds().includes(id)

function markLocalRead(id: string): void {
  const readIds = loadReadIds()
  if (!readIds.includes(id)) persistReadIds([...readIds, id])
}

/** 服务端通知行 → 统一通知模型。 */
function toAppNotification(item: NotificationItem): AppNotification {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    description: item.body,
    createdAt: item.createdAt,
    read: item.read,
    ...(item.recordId !== undefined ? { recordId: item.recordId } : {}),
    server: true,
  }
}

/** 本地合成官方通知（模型目录/月度用量），已读态走 localStorage。 */
function buildLocalNotifications(
  models: readonly ModelCatalogItem[],
  usage: { successfulCount?: number; chargedCents: number } | null,
): AppNotification[] {
  const notifications: AppNotification[] = []
  if (models.length > 0) {
    notifications.push({
      id: 'model-catalog',
      kind: 'system',
      title: '模型目录已更新',
      description: `当前可生成模型 ${models.length} 个，快去创作吧。`,
      createdAt: new Date().toISOString(),
      read: isLocalRead('model-catalog'),
    })
  }
  if (usage !== null) {
    notifications.push({
      id: 'monthly-usage',
      kind: 'system',
      title: '本月用量',
      description: `本月已成功生成 ${usage.successfulCount ?? 0} 次，费用 ${formatCents(usage.chargedCents)}。`,
      createdAt: new Date().toISOString(),
      read: isLocalRead('monthly-usage'),
    })
  }
  return notifications
}

interface NotificationsState {
  notifications: AppNotification[]
  unreadCount: number
  isLoading: boolean
  hasLoaded: boolean
  error: string | null
  activeMessage: GlobalMessage | null

  load(force?: boolean): Promise<void>
  /** 只刷新服务端通知与未读数（SSE 通知事件触发，轻量，不动本地合成项）。 */
  refreshFromServer(): Promise<void>
  recomputeUnread(): void
  openNotification(id: string): void
  markAllRead(): void
  showMessage(message: GlobalMessage): void
  dismissMessage(): void
  reset(): void
}

let messageTimer: ReturnType<typeof setTimeout> | null = null

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  hasLoaded: false,
  error: null,
  activeMessage: null,

  async load(force = false) {
    if (get().hasLoaded && !force) return
    set({ isLoading: true, error: null })
    try {
      const [serverPage, models, usage] = await Promise.all([
        apiClient.listNotifications({ limit: 50 }).catch(() => undefined),
        apiClient.getModels(),
        apiClient.getUsage(),
      ])
      const server = (serverPage?.items ?? []).map(toAppNotification)
      const local = buildLocalNotifications(models, usage)
      const serverUnread = server.filter(item => !item.read).length
      const localUnread = local.filter(item => !item.read).length
      set({ notifications: [...server, ...local], unreadCount: serverUnread + localUnread, hasLoaded: true, isLoading: false, error: null })
    } catch (error) {
      set({ error: error instanceof Error ? error.message : String(error), isLoading: false })
    }
  },

  async refreshFromServer() {
    try {
      const [page, unread] = await Promise.all([
        apiClient.listNotifications({ limit: 50 }),
        apiClient.getNotificationUnreadCount(),
      ])
      const server = page.items.map(toAppNotification)
      const local = get().notifications.filter(item => item.server !== true)
      const localUnread = local.filter(item => !item.read).length
      set({ notifications: [...server, ...local], unreadCount: unread.count + localUnread, hasLoaded: true, error: null })
    } catch {
      // best-effort：SSE 刷新失败不打扰用户，下次交互（打开菜单/load）会重试。
    }
  },

  recomputeUnread() {
    const notifications = get().notifications
    const serverUnread = notifications.filter(item => item.server === true && !item.read).length
    const localUnread = notifications.filter(item => item.server !== true && !item.read).length
    set({ unreadCount: serverUnread + localUnread })
  },

  async openNotification(id) {
    const notification = get().notifications.find(item => item.id === id)
    if (notification === undefined) return
    if (notification.server === true) {
      if (!notification.read) {
        set({ notifications: get().notifications.map(item => item.id === id ? { ...item, read: true } : item) })
        get().recomputeUnread()
        await apiClient.markNotificationRead(id).catch(() => undefined)
      }
    } else {
      if (!isLocalRead(id)) {
        markLocalRead(id)
        set({ notifications: get().notifications.map(item => item.id === id ? { ...item, read: true } : item) })
        get().recomputeUnread()
      }
    }
    get().showMessage({ title: notification.title, description: notification.description, tone: 'info' })
  },

  async markAllRead() {
    const notifications = get().notifications
    for (const item of notifications) {
      if (item.server !== true && !item.read) markLocalRead(item.id)
    }
    set({ notifications: notifications.map(item => ({ ...item, read: true })), unreadCount: 0 })
    await apiClient.markAllNotificationsRead().catch(() => undefined)
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
