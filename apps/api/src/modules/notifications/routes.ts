import { z } from 'zod'
import { Elysia } from 'elysia'
import { validateInput } from '@bailian-studio/shared'
import type { ApiDependencies } from '../../dependencies'
import { requestErrorResponseBody } from '../../lib/http-errors'
import { requireAuthUser } from '../auth/session'

/**
 * 社交通知模块（/api/notifications）。
 *
 * 作品被点赞/收藏时，gallery 模块在 repository 落一条通知并 SSE 推送给作者；
 * 本模块负责收件人侧的读取与已读状态流转。全部端点要求登录且只作用于本人
 * 通知（userId 由会话决定，越权读他人通知 ID 统一 404）。
 */
const ListNotificationsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).max(1024).optional(),
}).strict()

const NotificationIdParamsSchema = z.object({ id: z.string().trim().min(1).max(256) }).strict()

export function createNotificationsRoutes(deps: ApiDependencies) {
  return new Elysia()
    .get('/api/notifications', async ({ request, query }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(ListNotificationsQuerySchema, query)
      const page = await deps.notificationRepository.listNotifications({
        userId: user.id,
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
      })
      return { success: true, data: page }
    })
    .get('/api/notifications/unread-count', async ({ request }) => {
      const user = await requireAuthUser(request, deps.authService)
      const count = await deps.notificationRepository.countUnreadNotifications(user.id)
      return { success: true, data: { count } }
    })
    .post('/api/notifications/:id/read', async ({ request, params, set }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { id } = validateInput(NotificationIdParamsSchema, params)
      const marked = await deps.notificationRepository.markNotificationRead({ userId: user.id, notificationId: id })
      if (!marked) {
        set.status = 404
        return requestErrorResponseBody(request, 'NOTIFICATION_NOT_FOUND', 'Notification not found', set)
      }
      return { success: true, data: { read: true } }
    })
    .post('/api/notifications/read-all', async ({ request }) => {
      const user = await requireAuthUser(request, deps.authService)
      const marked = await deps.notificationRepository.markAllNotificationsRead(user.id)
      return { success: true, data: { marked } }
    })
}
