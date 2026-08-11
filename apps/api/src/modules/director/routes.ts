import { Elysia } from 'elysia'
import {
  AttachDirectorAssetSchema,
  CreateDirectorPhaseRunSchema,
  DirectorPhaseSchema,
  CreateDirectorProjectSchema,
  DirectorScriptChatInputSchema,
  ListDirectorProjectsSchema,
  UpdateDirectorProjectSchema,
  UpdateDirectorShotSchema,
  ValidationError,
  createLogger,
  validateInput,
} from '@bailian-studio/shared'
import { estimatePriceCents, getBailianOperationCapability, getModelById, validateModelParams, type FrozenModelManifest } from '@bailian-studio/model-core'
import type { ApiDependencies } from '../../dependencies'
import { requireAuthUser } from '../auth/session'
import { DirectorRepositoryError } from '@bailian-studio/director-repository'
import { getRequestTrace } from '../../lib/middleware'

const directorLogger = createLogger('director-api')

export function createDirectorRoutes(deps: ApiDependencies) {
  const repository = deps.directorRepository

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
        const run = await repository.requestPhaseRun({
          userId: user.id,
          projectId: params.id,
          phase: 'analyze',
          traceId: requestId,
          ...input,
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
      const model = requireDirectorVideoModel(input.modelId)
      const project = await repository.getProject({ userId: user.id, projectId: params.id })
      if (project === undefined) {
        throw new DirectorRepositoryError('DIRECTOR_PROJECT_NOT_FOUND', `Director project not found: ${params.id}`)
      }
      const shot = project.shots.find(candidate => candidate.id === params.shotId)
      if (shot === undefined) {
        throw new DirectorRepositoryError('DIRECTOR_SHOT_NOT_FOUND', `Director shot not found: ${params.shotId}`)
      }
      if (shot.status !== 'locked' && shot.status !== 'failed') {
        throw new DirectorRepositoryError(
          shot.status === 'generating' ? 'DIRECTOR_SHOT_GENERATING' : 'DIRECTOR_PHASE_INPUT_NOT_READY',
          'Only a locked or failed storyboard shot can be retried individually',
        )
      }
      validateDirectorVideoShots(model, [shot])
      return {
        success: true,
        data: {
          estimate: {
            modelId: model.id,
            estimatedCents: estimateDirectorShotCents(model, shot.durationSeconds, shot.referenceAssetIds.length),
            shotCount: 1,
            currency: 'CNY' as const,
          },
        },
      }
    })
    .post('/projects/:id/shots/:shotId/video-runs', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(CreateDirectorPhaseRunSchema, body)
      const model = requireDirectorVideoModel(input.modelId)
      const project = await repository.getProject({ userId: user.id, projectId: params.id })
      if (project === undefined) {
        throw new DirectorRepositoryError('DIRECTOR_PROJECT_NOT_FOUND', `Director project not found: ${params.id}`)
      }
      const shot = project.shots.find(candidate => candidate.id === params.shotId)
      if (shot === undefined) {
        throw new DirectorRepositoryError('DIRECTOR_SHOT_NOT_FOUND', `Director shot not found: ${params.shotId}`)
      }
      if (shot.status !== 'locked' && shot.status !== 'failed') {
        throw new DirectorRepositoryError(
          shot.status === 'generating' ? 'DIRECTOR_SHOT_GENERATING' : 'DIRECTOR_PHASE_INPUT_NOT_READY',
          'Only a locked or failed storyboard shot can be retried individually',
        )
      }
      validateDirectorVideoShots(model, [shot])
      const run = await repository.requestPhaseRun({
        userId: user.id,
        projectId: params.id,
        phase: 'videos',
        shotId: params.shotId,
        ...input,
      })
      return { success: true, data: { run } }
    })
    .post('/projects/:id/phases/assemble/runs', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(CreateDirectorPhaseRunSchema, body)
      const preflight = await repository.getAssemblyPreflight({
        userId: user.id,
        projectId: params.id,
        ...(input.assembly === undefined ? {} : { settings: input.assembly }),
      })
      if (preflight === undefined) {
        throw new DirectorRepositoryError('DIRECTOR_PROJECT_NOT_FOUND', `Director project not found: ${params.id}`)
      }
      if (!preflight.ready) {
        throw new DirectorRepositoryError(
          'DIRECTOR_PHASE_INPUT_NOT_READY',
          preflight.issues[0]?.message ?? 'Assembly inputs are not ready',
        )
      }
      const run = await repository.requestPhaseRun({
        userId: user.id,
        projectId: params.id,
        phase: 'assemble',
        ...input,
      })
      return { success: true, data: { run } }
    })
    .post('/projects/:id/phases/:phase/runs', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const phase = validateInput(DirectorPhaseSchema, params.phase)
      const input = validateInput(CreateDirectorPhaseRunSchema, body)
      if (phase === 'videos') {
        const model = requireDirectorVideoModel(input.modelId)
        const project = await repository.getProject({ userId: user.id, projectId: params.id })
        if (project === undefined) {
          throw new DirectorRepositoryError('DIRECTOR_PROJECT_NOT_FOUND', `Director project not found: ${params.id}`)
        }
        validateDirectorVideoShots(model, project.shots.filter(shot => shot.status === 'locked' || shot.status === 'failed'))
      }
      if (phase === 'bgm') {
        const model = requireDirectorMusicModel(input.modelId)
        const validation = validateModelParams(model, directorMusicParams(input))
        if (!validation.valid) {
          throw new ValidationError(validation.errors[0]?.message ?? 'Invalid music generation parameters')
        }
      }
      const run = await repository.requestPhaseRun({
        userId: user.id,
        projectId: params.id,
        phase,
        ...input,
      })
      return { success: true, data: { run } }
    })
    .post('/projects/:id/phases/videos/estimate', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(CreateDirectorPhaseRunSchema, body)
      const model = requireDirectorVideoModel(input.modelId)
      const project = await repository.getProject({ userId: user.id, projectId: params.id })
      if (project === undefined) {
        throw new DirectorRepositoryError('DIRECTOR_PROJECT_NOT_FOUND', `Director project not found: ${params.id}`)
      }
      const pendingShots = project.shots.filter(shot => shot.status === 'locked' || shot.status === 'failed')
      if (
        project.shots.length === 0
        || project.shots.some(shot => !['locked', 'failed', 'generating', 'succeeded'].includes(shot.status))
        || project.shots.some(shot => shot.status === 'generating' && shot.videoGenerationId === null)
      ) {
        throw new DirectorRepositoryError(
          'DIRECTOR_PHASE_INPUT_NOT_READY',
          'Every current storyboard shot must be locked, resumable, or already generated before estimating video generation',
        )
      }
      validateDirectorVideoShots(model, pendingShots)
      const estimatedCents = pendingShots.reduce((total, shot) => total + estimateDirectorShotCents(model, shot.durationSeconds, shot.referenceAssetIds.length), 0)
      return {
        success: true,
        data: {
          estimate: {
            modelId: model.id,
            estimatedCents,
            shotCount: pendingShots.length,
            currency: 'CNY' as const,
          },
        },
      }
    })
    .post('/projects/:id/phases/bgm/estimate', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(CreateDirectorPhaseRunSchema, body)
      const model = requireDirectorMusicModel(input.modelId)
      const paramsForModel = directorMusicParams(input)
      const validation = validateModelParams(model, paramsForModel)
      if (!validation.valid) {
        throw new ValidationError(validation.errors[0]?.message ?? 'Invalid music generation parameters')
      }
      const project = await repository.getProject({ userId: user.id, projectId: params.id })
      if (project === undefined) {
        throw new DirectorRepositoryError('DIRECTOR_PROJECT_NOT_FOUND', `Director project not found: ${params.id}`)
      }
      return {
        success: true,
        data: {
          estimate: {
            modelId: model.id,
            estimatedCents: estimatePriceCents(model, paramsForModel),
            durationSeconds: Number(paramsForModel.duration),
            currency: 'CNY' as const,
          },
        },
      }
    })
    .post('/projects/:id/phases/assemble/preflight', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(CreateDirectorPhaseRunSchema, body)
      const preflight = await repository.getAssemblyPreflight({
        userId: user.id,
        projectId: params.id,
        ...(input.assembly === undefined ? {} : { settings: input.assembly }),
      })
      if (preflight === undefined) {
        throw new DirectorRepositoryError('DIRECTOR_PROJECT_NOT_FOUND', `Director project not found: ${params.id}`)
      }
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
}

function estimateDirectorShotCents(
  manifest: FrozenModelManifest,
  durationSeconds: number | null,
  referenceCount: number,
): number {
  return estimatePriceCents(manifest, directorVideoParams(manifest, durationSeconds, referenceCount))
}

function requireDirectorMusicModel(modelId: string | undefined): FrozenModelManifest {
  const model = modelId === undefined ? undefined : getModelById(modelId)
  if (model === undefined || model.availability.enabled === false || getBailianOperationCapability(model.id) !== 'music.generate') {
    throw new ValidationError('音乐阶段需要使用已启用的音乐生成模型')
  }
  return model
}

function directorMusicParams(input: {
  prompt?: string
  lyrics?: string
  isInstrumental?: boolean
  enableAigcWatermark?: boolean
  gender?: 'female' | 'male'
  format?: 'mp3' | 'wav'
  duration?: number
}): Record<string, unknown> {
  return {
    ...(input.prompt === undefined ? {} : { prompt: input.prompt }),
    ...(input.lyrics === undefined ? {} : { lyrics: input.lyrics }),
    isInstrumental: input.isInstrumental ?? false,
    enableAigcWatermark: input.enableAigcWatermark ?? false,
    gender: input.gender ?? 'female',
    format: input.format ?? 'mp3',
    duration: input.duration ?? 60,
  }
}

function validateDirectorVideoShots(
  manifest: FrozenModelManifest,
  shots: ReadonlyArray<{ durationSeconds: number | null; referenceAssetIds: string[] }>,
): void {
  for (const shot of shots) {
    const params = directorVideoParams(manifest, shot.durationSeconds, shot.referenceAssetIds.length)
    const promptParameter = manifest.parameters.find(parameter => parameter.name === 'prompt' && parameter.type === 'text')
    if (promptParameter !== undefined) params[promptParameter.name] = 'director video estimate'
    const validation = validateModelParams(manifest, params)
    if (validation.valid) continue
    const issue = validation.errors[0]
    throw new ValidationError(
      issue?.messages['zh-CN'] ?? issue?.message ?? '视频镜头参数不满足模型约束',
      'shots',
      { modelId: manifest.id, code: issue?.code ?? 'PARAMETERS_INVALID' },
    )
  }
}

function directorVideoParams(
  manifest: FrozenModelManifest,
  durationSeconds: number | null,
  referenceCount: number,
): Record<string, unknown> {
  const durationParameter = manifest.parameters.find(parameter => parameter.name === 'duration' && parameter.type === 'number')
  const defaultDuration = durationParameter?.defaultValue
  const requestedDuration = durationSeconds ?? (typeof defaultDuration === 'number' ? defaultDuration : 5)
  const duration = durationParameter === undefined
    ? requestedDuration
    : Math.min(durationParameter.max ?? requestedDuration, Math.max(durationParameter.min ?? requestedDuration, requestedDuration))
  const params: Record<string, unknown> = { duration }
  for (const parameter of manifest.parameters) {
    if (parameter.defaultValue !== undefined && parameter.name !== 'duration') params[parameter.name] = parameter.defaultValue
  }
  const referenceParameter = manifest.parameters.find(parameter => (
    parameter.type === 'media'
    && parameter.mediaKind === 'image'
    && manifest.request.bindings[parameter.name]?.target === 'input.media'
  ))
  if (referenceParameter !== undefined && referenceCount > 0) params[referenceParameter.name] = Array.from({ length: referenceCount }, () => 'reference')
  return params
}

function requireDirectorVideoModel(modelId: string | undefined): FrozenModelManifest {
  const model = modelId === undefined ? undefined : getModelById(modelId)
  if (
    model === undefined
    || model.availability.enabled === false
    || model.request.kind !== 'dashscope-video-task'
    || getBailianOperationCapability(model.id) !== 'video.reference-to-video'
    || !model.parameters.some(parameter => (
      parameter.type === 'media'
      && parameter.mediaKind === 'image'
      && model.request.bindings[parameter.name]?.target === 'input.media'
    ))
  ) {
    throw new ValidationError('视频阶段需要使用支持参考图像输入的已启用参考生视频模型', 'modelId')
  }
  return model
}
