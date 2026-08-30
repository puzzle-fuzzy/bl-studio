import { z } from 'zod'
import { Elysia } from 'elysia'
import { validateInput } from '@bailian-studio/shared'
import type { ApiDependencies } from '../../dependencies'
import { auditErrorCode, recordApiAuditEvent } from '../../lib/audit'
import { requireAdminUser, requireAuthUser } from '../auth/session'

/**
 * 反馈通道：用户提交意见/报 bug（POST /api/feedback），admin 在后台列表并流转状态。
 */

const SubmitFeedbackSchema = z.object({
  kind: z.enum(['feedback', 'bug', 'suggestion', 'complaint']),
  content: z.string().trim().min(1).max(2000),
}).strict()

const ListFeedbackQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).max(1024).optional(),
  status: z.enum(['open', 'reviewing', 'resolved', 'closed']).optional(),
}).strict()

const FeedbackIdParamsSchema = z.object({ id: z.string().trim().min(1).max(256) }).strict()

const UpdateFeedbackStatusSchema = z.object({
  status: z.enum(['open', 'reviewing', 'resolved', 'closed']),
}).strict()

export function createFeedbackRoutes(deps: ApiDependencies) {
  return new Elysia()
    .post('/api/feedback', async ({ request, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(SubmitFeedbackSchema, body)
      try {
        const item = await deps.feedbackRepository.submitFeedback({
          userId: user.id,
          kind: input.kind,
          content: input.content,
        })
        await recordApiAuditEvent(deps.auditRepository, request, {
          userId: user.id,
          action: 'feedback.submit',
          outcome: 'succeeded',
          targetType: 'feedback',
          targetId: item.id,
          metadata: { kind: item.kind },
        })
        return { success: true, data: { item } }
      } catch (error) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          userId: user.id,
          action: 'feedback.submit',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .get('/api/feedback', async ({ request, query }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(ListFeedbackQuerySchema, query)
      const page = await deps.feedbackRepository.listMyFeedback({
        userId: user.id,
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
      })
      return { success: true, data: page }
    })
    .get('/api/admin/feedback', async ({ request, query }) => {
      await requireAdminUser(request, deps.authService)
      const input = validateInput(ListFeedbackQuerySchema, query)
      const page = await deps.feedbackRepository.listFeedback({
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      })
      return { success: true, data: page }
    })
    .patch('/api/admin/feedback/:id', async ({ request, params, body }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { id } = validateInput(FeedbackIdParamsSchema, params)
      const { status } = validateInput(UpdateFeedbackStatusSchema, body)
      try {
        const item = await deps.feedbackRepository.updateFeedbackStatus({
          itemId: id,
          status,
          resolvedBy: actor.id,
        })
        await recordApiAuditEvent(deps.auditRepository, request, {
          userId: actor.id,
          action: 'feedback.update',
          outcome: 'succeeded',
          targetType: 'feedback',
          targetId: id,
          metadata: { status },
        })
        return { success: true, data: { item } }
      } catch (error) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          userId: actor.id,
          action: 'feedback.update',
          outcome: 'failed',
          targetType: 'feedback',
          targetId: id,
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
}
