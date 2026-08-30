import { Elysia } from 'elysia'
import { makeDirectorEvent } from '@bailian-studio/sse-protocol'
import {
  AttachDirectorAssetSchema,
  CreateDirectorPhaseRunSchema,
  DirectorPhaseSchema,
  CreateDirectorProjectSchema,
  DirectorScriptChatInputSchema,
  ListDirectorProjectsSchema,
  UpdateDirectorProjectSchema,
  UpdateDirectorShotSchema,
  ListDirectorEntityCandidatesSchema,
  ReviewDirectorEntityCandidateSchema,
} from '@bailian-studio/director-contracts'
import { createLogger, validateInput } from '@bailian-studio/shared'
import type { ApiDependencies } from '../../dependencies'
import { requireAuthUser } from '../auth/session'
import { DirectorRepositoryError } from '@bailian-studio/director-repository'
import { getRequestTrace } from '../../lib/middleware'

const directorLogger = createLogger('director-api')

export function createDirectorRoutes(deps: ApiDependencies) {
  const repository = deps.directorRepository
  const directorService = deps.directorApplicationService

  return new Elysia({ prefix: '/api/director' })
    .get('/projects', async ({ request, query }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(ListDirectorProjectsSchema, query)
      const result = await repository.listProjects({ userId: user.id, ...input })
      return { success: true, data: result }
    })
    .post('/projects', async ({ request, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(CreateDirectorProjectSchema, body)
      const project = await repository.createProject({ userId: user.id, ...input })
      return { success: true, data: { project } }
    })
    .get('/projects/:id', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const project = await repository.getProject({ userId: user.id, projectId: params.id })
      if (project === undefined) {
        throw new DirectorRepositoryError('DIRECTOR_PROJECT_NOT_FOUND', `Director project not found: ${params.id}`)
      }
      return { success: true, data: { project } }
    })
    .patch('/projects/:id', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const patch = validateInput(UpdateDirectorProjectSchema, body)
      const project = await repository.updateProject({ userId: user.id, projectId: params.id, patch })
      return { success: true, data: { project } }
    })
    .get('/projects/:id/script/messages', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const traceId = getRequestTrace(request)?.requestId
      try {
        const messages = await repository.listScriptMessages({ userId: user.id, projectId: params.id, limit: 100 })
        directorLogger.info('script_messages.listed', {
          requestId: traceId,
          projectId: params.id,
          messageCount: messages.length,
        })
        return { success: true, data: { messages } }
      } catch (error) {
        directorLogger.error('script_messages.list_failed', {
          requestId: traceId,
          projectId: params.id,
          errorName: error instanceof Error ? error.name : 'unknown',
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    })
    .get('/projects/:id/script/versions', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const versions = await repository.listScriptVersions({ userId: user.id, projectId: params.id })
      return { success: true, data: { versions } }
    })
    .get('/projects/:id/script/versions/:versionId', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const version = await repository.getScriptVersion({ userId: user.id, projectId: params.id, versionId: params.versionId })
      if (version === undefined) {
        throw new DirectorRepositoryError('DIRECTOR_SCRIPT_VERSION_NOT_FOUND', `Director screenplay version not found: ${params.versionId}`)
      }
      return { success: true, data: { version } }
    })
    .post('/projects/:id/script/chat', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(DirectorScriptChatInputSchema, body)
      const requestId = getRequestTrace(request)?.requestId
      const startedAt = Date.now()
      directorLogger.info('script_chat.requested', {
        requestId,
        projectId: params.id,
        modelId: input.modelId,
        messageLength: input.message.length,
      })
      try {
        const run = await directorService.requestScriptChat({
          userId: user.id,
          projectId: params.id,
          traceId: requestId,
          input,
        })
        directorLogger.info('script_chat.queued', {
          requestId,
          projectId: params.id,
          phaseRunId: run.id,
          taskId: run.taskId,
          version: run.version,
          durationMs: Date.now() - startedAt,
        })
        return { success: true, data: { run } }
      } catch (error) {
        directorLogger.error('script_chat.queue_failed', {
          requestId,
          projectId: params.id,
          modelId: input.modelId,
          messageLength: input.message.length,
          durationMs: Date.now() - startedAt,
          errorName: error instanceof Error ? error.name : 'unknown',
          errorCode: error instanceof DirectorRepositoryError ? error.code : 'UNKNOWN',
          errorMessage: error instanceof Error ? error.message : String(error),
        })
        throw error
      }
    })
    .post('/projects/:id/assets', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(AttachDirectorAssetSchema, body)
      const asset = await repository.attachAsset({ userId: user.id, projectId: params.id, ...input })
      return { success: true, data: { asset } }
    })
    .delete('/projects/:id/assets/:assetId', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const project = await repository.detachAsset({
        userId: user.id,
        projectId: params.id,
        directorAssetId: params.assetId,
      })
      return { success: true, data: { project } }
    })
    .patch('/projects/:id/shots/:shotId', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const patch = validateInput(UpdateDirectorShotSchema, body)
      const shot = await repository.updateShot({
        userId: user.id,
        projectId: params.id,
        shotId: params.shotId,
        patch,
      })
      return { success: true, data: { shot } }
    })
    .post('/projects/:id/shots/:shotId/video-runs/estimate', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(CreateDirectorPhaseRunSchema, body)
      const estimate = await directorService.estimateShotVideo({
        userId: user.id,
        projectId: params.id,
        shotId: params.shotId,
        modelId: input.modelId,
      })
      return {
        success: true,
        data: { estimate },
      }
    })
    .post('/projects/:id/shots/:shotId/video-runs', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(CreateDirectorPhaseRunSchema, body)
      const run = await directorService.createShotVideoRun({
        userId: user.id,
        projectId: params.id,
        shotId: params.shotId,
        traceId: getRequestTrace(request)?.requestId,
        input,
      })
      return { success: true, data: { run } }
    })
    .post('/projects/:id/phases/assemble/runs', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(CreateDirectorPhaseRunSchema, body)
      const run = await directorService.createAssemblyRun({
        userId: user.id,
        projectId: params.id,
        traceId: getRequestTrace(request)?.requestId,
        input,
      })
      return { success: true, data: { run } }
    })
    .post('/projects/:id/phases/:phase/runs', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const phase = validateInput(DirectorPhaseSchema, params.phase)
      const input = validateInput(CreateDirectorPhaseRunSchema, body)
      const run = await directorService.createPhaseRun({
        userId: user.id,
        projectId: params.id,
        phase,
        traceId: getRequestTrace(request)?.requestId,
        input,
      })
      return { success: true, data: { run } }
    })
    .post('/projects/:id/phases/videos/estimate', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(CreateDirectorPhaseRunSchema, body)
      const estimate = await directorService.estimateVideos({
        userId: user.id,
        projectId: params.id,
        modelId: input.modelId,
      })
      return {
        success: true,
        data: { estimate },
      }
    })
    .post('/projects/:id/phases/bgm/estimate', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(CreateDirectorPhaseRunSchema, body)
      const estimate = await directorService.estimateMusic({
        userId: user.id,
        projectId: params.id,
        input,
      })
      return {
        success: true,
        data: { estimate },
      }
    })
    .post('/projects/:id/phases/assemble/preflight', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(CreateDirectorPhaseRunSchema, body)
      const preflight = await directorService.getAssemblyPreflight({
        userId: user.id,
        projectId: params.id,
        ...(input.assembly === undefined ? {} : { settings: input.assembly }),
      })
      return { success: true, data: { preflight } }
    })
    .get('/projects/:id/phases/:phase/runs/:runId', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const phase = validateInput(DirectorPhaseSchema, params.phase)
      const run = await repository.getPhaseRun({
        userId: user.id,
        projectId: params.id,
        phase,
        runId: params.runId,
      })
      if (run === undefined) {
        throw new DirectorRepositoryError('DIRECTOR_PHASE_RUN_NOT_FOUND', `Director phase run not found: ${params.runId}`)
      }
      return { success: true, data: { run } }
    })

    // ── 实体候选：剧本 AI 提取 → 人工审核 ──
    .get('/projects/:id/entity-candidates', async ({ request, params, query }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(ListDirectorEntityCandidatesSchema, {
        projectId: params.id,
        ...(query.status !== undefined ? { status: query.status } : {}),
        ...(query.kind !== undefined ? { kind: query.kind } : {}),
      })
      const candidates = await repository.listEntityCandidates({ userId: user.id, ...input })
      return { success: true, data: candidates }
    })
    .patch('/entity-candidates/:candidateId', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(ReviewDirectorEntityCandidateSchema, body)
      const candidate = await repository.reviewEntityCandidate({
        userId: user.id,
        candidateId: params.candidateId,
        status: input.status,
      })
      if (candidate === undefined) {
        throw new DirectorRepositoryError('DIRECTOR_ENTITY_CANDIDATE_NOT_FOUND', `Candidate not found: ${params.candidateId}`)
      }
      deps.generationSseHub.publish(makeDirectorEvent('director.entities.changed', {
        userId: user.id,
        projectId: candidate.projectId,
        candidateId: candidate.id,
        reason: 'candidate_reviewed',
      }))
      return { success: true, data: candidate }
    })
    .delete('/entity-candidates/:candidateId', async ({ request, params }) => {
      const user = await requireAuthUser(request, deps.authService)
      const deleted = await repository.deleteEntityCandidate({ userId: user.id, candidateId: params.candidateId })
      if (!deleted) {
        throw new DirectorRepositoryError('DIRECTOR_ENTITY_CANDIDATE_NOT_FOUND', `Candidate not found: ${params.candidateId}`)
      }
      deps.generationSseHub.publish(makeDirectorEvent('director.entities.changed', {
        userId: user.id,
        candidateId: params.candidateId,
        reason: 'candidate_deleted',
      }))
      return { success: true, data: { deleted: true } }
    })
}
