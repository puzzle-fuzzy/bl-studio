import { z } from 'zod'
import { Elysia } from 'elysia'
import { validateInput } from '@bailian-studio/shared'
import type { ApiDependencies } from '../../dependencies'
import { auditErrorCode, recordApiAuditEvent } from '../../lib/audit'
import { requireAdminUser, requireAuthUser } from '../auth/session'

const SubmitContentReportSchema = z.object({
  generationId: z.string().trim().min(1).max(256),
  reason: z.enum(['unsafe', 'copyright', 'privacy', 'spam', 'other']),
  details: z.string().trim().max(2000).optional(),
}).strict()

const ListContentReportsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).max(1024).optional(),
  status: z.enum(['open', 'reviewing', 'resolved', 'dismissed']).optional(),
}).strict()

const ContentReportIdParamsSchema = z.object({ id: z.string().trim().min(1).max(256) }).strict()

const UpdateContentReportSchema = z.object({
  status: z.enum(['open', 'reviewing', 'resolved', 'dismissed']),
  resolutionNote: z.string().trim().max(2000).optional(),
  /** 审核人可在处理举报时联动下架目标作品；审核状态本身不等于下架。 */
  hideTarget: z.boolean().optional(),
}).strict()

export function createContentReportRoutes(deps: ApiDependencies) {
  return new Elysia()
    .post('/api/reports', async ({ request, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(SubmitContentReportSchema, body)
      try {
        const report = await deps.generationRepository.submitContentReport({
          reporterId: user.id,
          generationId: input.generationId,
          reason: input.reason,
          ...(input.details !== undefined && input.details.length > 0 ? { details: input.details } : {}),
        })
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: user.id,
          action: 'content.report.submit',
          outcome: 'succeeded',
          targetType: 'generation',
          targetId: input.generationId,
          metadata: { reason: input.reason },
        })
        return { success: true, data: { report } }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: user.id,
          action: 'content.report.submit',
          outcome: 'failed',
          targetType: 'generation',
          targetId: input.generationId,
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .get('/api/admin/reports', async ({ request, query }) => {
      await requireAdminUser(request, deps.authService)
      const input = validateInput(ListContentReportsQuerySchema, query)
      const page = await deps.generationRepository.listContentReports({
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
      })
      return { success: true, data: page }
    })
    .patch('/api/admin/reports/:id', async ({ request, params, body }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { id } = validateInput(ContentReportIdParamsSchema, params)
      const input = validateInput(UpdateContentReportSchema, body)
      try {
        const report = await deps.generationRepository.updateContentReport({
          reportId: id,
          status: input.status,
          resolvedBy: actor.id,
          ...(input.resolutionNote !== undefined && input.resolutionNote.length > 0
            ? { resolutionNote: input.resolutionNote }
            : {}),
        })
        if (input.hideTarget === true) {
          await deps.generationRepository.setGalleryRecordHidden({
            recordId: report.generationId,
            hidden: true,
            actorId: actor.id,
          })
        }
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.content-report.update',
          outcome: 'succeeded',
          targetType: 'content-report',
          targetId: id,
          metadata: { status: input.status, hideTarget: input.hideTarget === true },
        })
        return { success: true, data: { report } }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.content-report.update',
          outcome: 'failed',
          targetType: 'content-report',
          targetId: id,
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
}
