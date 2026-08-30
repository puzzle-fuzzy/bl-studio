import {
  CreateCanvasInputSchema,
  RestoreCanvasInputSchema,
  SaveCanvasInputSchema,
} from '@bailian-studio/canvas-contracts'
import { validateInput } from '@bailian-studio/shared'
import { Elysia } from 'elysia'
import { z } from 'zod'
import type { ApiDependencies } from '../../dependencies'
import { requestErrorResponseBody } from '../../lib/http-errors'
import { requireAuthUser } from '../auth/session'

const ListCanvasesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
}).strict()

export function createCanvasRoutes(deps: ApiDependencies) {
  return new Elysia({ prefix: '/api/canvases' })
    .get('/', async ({ request, query }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { limit } = validateInput(ListCanvasesQuerySchema, query)
      return {
        success: true,
        data: await deps.canvasRepository.listDocuments({
          userId: user.id,
          ...(limit !== undefined ? { limit } : {}),
        }),
      }
    })
    .post('/', async ({ request, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(CreateCanvasInputSchema, body)
      const document = await deps.canvasRepository.createDocument({ userId: user.id, ...input })
      return { success: true, data: { document } }
    })
    .get('/:id', async ({ request, params, set }) => {
      const user = await requireAuthUser(request, deps.authService)
      const document = await deps.canvasRepository.getDocument({ userId: user.id, documentId: params.id })
      if (document === undefined) {
        set.status = 404
        return requestErrorResponseBody(request, 'CANVAS_NOT_FOUND', 'Canvas not found', set)
      }
      return { success: true, data: { document } }
    })
    .patch('/:id', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(SaveCanvasInputSchema, body)
      const document = await deps.canvasRepository.saveDocument({
        userId: user.id,
        documentId: params.id,
        ...input,
      })
      return { success: true, data: { document } }
    })
    .get('/:id/versions', async ({ request, params, query }) => {
      const user = await requireAuthUser(request, deps.authService)
      const { limit } = validateInput(ListCanvasesQuerySchema, query)
      const versions = await deps.canvasRepository.listVersions({
        userId: user.id,
        documentId: params.id,
        ...(limit !== undefined ? { limit } : {}),
      })
      return { success: true, data: { versions } }
    })
    .post('/:id/restore', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(RestoreCanvasInputSchema, body)
      const document = await deps.canvasRepository.restoreVersion({
        userId: user.id,
        documentId: params.id,
        ...input,
      })
      return { success: true, data: { document } }
    })
}
