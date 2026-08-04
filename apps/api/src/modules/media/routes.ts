import { Elysia } from 'elysia'
import { z } from 'zod'
import type { ApiDependencies } from '../../dependencies'
import { requireAuthUser } from '../auth/session'
import { getRequestTrace } from '../../lib/middleware'
import { requestErrorResponseBody } from '../../lib/http-errors'

const CreateMediaJobSchema = z.object({
  operation: z.literal('video.extract_audio'),
  source: z.object({
    assetId: z.string().min(1),
    kind: z.literal('video'),
    fileName: z.string().optional(),
  }),
  options: z.object({
    format: z.enum(['mp3', 'wav']).optional(),
  }).optional(),
})

function notFoundBody(request: Request, id: string, set: { headers: Record<string, string | number> }) {
  return requestErrorResponseBody(request, 'MEDIA_JOB_NOT_FOUND', `Media job not found: ${id}`, set)
}

export function createMediaRoutes(deps: ApiDependencies) {
  return new Elysia({ prefix: '/api/media' })
  .post('/jobs', async ({ request, body, set }) => {
    const user = await requireAuthUser(request, deps.authService)
    const input = CreateMediaJobSchema.parse(body)
    const result = await deps.mediaRepository.createMediaJob({
      userId: user.id,
      operation: input.operation,
      source: input.source,
      traceId: getRequestTrace(request)?.requestId ?? crypto.randomUUID(),
      ...(input.options !== undefined ? { options: input.options } : {}),
    })
    if (result.task.traceId !== undefined) set.headers['x-trace-id'] = result.task.traceId
    return { success: true, data: result }
  })
  .get('/jobs/:id', async ({ request, params, set }) => {
    const user = await requireAuthUser(request, deps.authService)
    const job = await deps.mediaRepository.getMediaJob({ userId: user.id, jobId: params.id })
    if (job === undefined) {
      set.status = 404
      return notFoundBody(request, params.id, set)
    }
    return { success: true, data: { job } }
  })
}
