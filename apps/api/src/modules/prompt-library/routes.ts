import { z } from 'zod'
import { Elysia } from 'elysia'
import { validateInput } from '@bailian-studio/shared'
import type { ApiDependencies } from '../../dependencies'
import { auditErrorCode, recordApiAuditEvent } from '../../lib/audit'
import { requireAuthUser } from '../auth/session'

/**
 * 提示词资产库：服务端命名库，owner 限定。
 * 存「提示词 + 模型 + 文本参数」，媒体/参考图值不入库（跨设备复用不泄露个人素材）。
 */

const CreatePromptSchema = z.object({
  name: z.string().trim().min(1).max(100),
  modelId: z.string().trim().min(1).max(256),
  prompt: z.string().trim().min(1).max(4000),
  params: z.record(z.string(), z.unknown()).optional(),
}).strict()

const UpdatePromptSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  prompt: z.string().trim().min(1).max(4000).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
}).strict()

const ListPromptsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().trim().min(1).max(1024).optional(),
  q: z.string().trim().min(1).max(120).optional(),
}).strict()

const PromptIdParamsSchema = z.object({ id: z.string().trim().min(1).max(256) }).strict()

export function createPromptLibraryRoutes(deps: ApiDependencies) {
  return new Elysia()
    .get('/api/prompt-library', async ({ request, query }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(ListPromptsQuerySchema, query)
      const page = await deps.generationRepository.listPromptLibrary({
        userId: user.id,
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
        ...(input.q !== undefined && input.q.length > 0 ? { q: input.q } : {}),
      })
      return { success: true, data: page }
    })
    .post('/api/prompt-library', async ({ request, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(CreatePromptSchema, body)
      try {
        const item = await deps.generationRepository.createPromptLibraryItem({
          userId: user.id,
          name: input.name,
          modelId: input.modelId,
          prompt: input.prompt,
          ...(input.params !== undefined ? { params: input.params } : { params: {} }),
        })
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: user.id,
          action: 'prompt-library.create',
          outcome: 'succeeded',
          targetType: 'prompt',
          targetId: item.id,
          metadata: { modelId: item.modelId },
        })
        return { success: true, data: { item } }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: user.id,
          action: 'prompt-library.create',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .patch('/api/prompt-library/:id', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { id } = validateInput(PromptIdParamsSchema, params)
      const input = validateInput(UpdatePromptSchema, body)
      const item = await deps.generationRepository.updatePromptLibraryItem({ userId: user.id, itemId: id, ...input })
      return { success: true, data: { item } }
    })
    .delete('/api/prompt-library/:id', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { id } = validateInput(PromptIdParamsSchema, params)
      try {
        await deps.generationRepository.deletePromptLibraryItem({ userId: user.id, itemId: id })
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: user.id,
          action: 'prompt-library.delete',
          outcome: 'succeeded',
          targetType: 'prompt',
          targetId: id,
        })
        return { success: true, data: null }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: user.id,
          action: 'prompt-library.delete',
          outcome: 'failed',
          targetType: 'prompt',
          targetId: id,
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
}
