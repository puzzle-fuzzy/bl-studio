import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ModelCatalogItem, NotificationItem } from '@bailian-studio/api-client'
import { apiClient } from '@/lib/api'
import { formatCents } from '@/lib/money'

/**
 * 通知中心（原 notifications-store 的服务端数据部分，Batch 0c）。
 * 服务端通知（点赞/收藏）走 react-query；本地合成官方通知（模型目录/月度用量）
 * 由模型目录与用量两个查询组合派生，已读态仍在 localStorage。
 */

export type NotificationKind = 'like' | 'favorite' | 'system'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  description: string
  createdAt: string
  read: boolean
  recordId?: string
  /** true = 服务端通知（已读态在 DB）；缺省为本地合成（localStorage）。 */
  server?: boolean
}

const READ_IDS_KEY = 'bailian-studio:read-notification-ids:v1'
const MAX_READ_IDS = 100

function loadReadIds(): string[] {
  try {
    const raw = localStorage.getItem(READ_IDS_KEY)
    if (raw === null) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  }
  catch {
    return []
  }
}

function persistReadIds(ids: readonly string[]): void {
  localStorage.setItem(READ_IDS_KEY, JSON.stringify(ids.slice(0, MAX_READ_IDS)))
}

export const isLocalRead = (id: string): boolean => loadReadIds().includes(id)

export function markLocalRead(id: string): void {
  const readIds = loadReadIds()
  if (!readIds.includes(id)) persistReadIds([...readIds, id])
}

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

export function useNotifications() {
  const queryClient = useQueryClient()
  const server = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => apiClient.listNotifications({ limit: 50 }),
  })
  const models = useQuery({
    queryKey: ['models', 'catalog'],
    queryFn: () => apiClient.getModels(),
    staleTime: 5 * 60_000,
  })
  const usage = useQuery({
    queryKey: ['usage', 'monthly'],
    queryFn: () => apiClient.getUsage(),
    staleTime: 60_000,
  })

  const serverItems = (server.data?.items ?? []).map(toAppNotification)
  const localItems = buildLocalNotifications(models.data ?? [], usage.data ?? null)
  const notifications = [...serverItems, ...localItems]
  const unreadCount = notifications.filter(item => !item.read).length

  async function openNotification(id: string, onOpen: (n: AppNotification) => void): Promise<void> {
    const notification = notifications.find(item => item.id === id)
    if (notification === undefined) return
    if (notification.server === true) {
      if (!notification.read) {
        await apiClient.markNotificationRead(id).catch(() => undefined)
        await queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] })
      }
    }
    else if (!isLocalRead(id)) {
      markLocalRead(id)
    }
    onOpen(notification)
  }

  async function markAllRead(): Promise<void> {
    for (const item of localItems) {
      if (!item.read) markLocalRead(item.id)
    }
    await apiClient.markAllNotificationsRead().catch(() => undefined)
    await queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] })
  }

  return {
    notifications,
    unreadCount,
    isLoading: server.isPending,
    error: server.error !== null ? server.error : null,
    openNotification,
    markAllRead,
  }
}
