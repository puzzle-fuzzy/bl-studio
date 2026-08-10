import { Elysia } from 'elysia'
import {
  AttachDirectorAssetSchema,
  CreateDirectorPhaseRunSchema,
  DirectorPhaseSchema,
  CreateDirectorProjectSchema,
  ListDirectorProjectsSchema,
  UpdateDirectorProjectSchema,
  UpdateDirectorShotSchema,
  ValidationError,
  validateInput,
} from '@bailian-studio/shared'
import { estimatePriceCents, getBailianOperationCapability, getModelById, type FrozenModelManifest } from '@bailian-studio/model-core'
import type { ApiDependencies } from '../../dependencies'
import { requireAuthUser } from '../auth/session'
import { DirectorRepositoryError } from '@bailian-studio/director-repository'

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
      requireDirectorVideoModel(input.modelId)
      const run = await repository.requestPhaseRun({
        userId: user.id,
        projectId: params.id,
        phase: 'videos',
        shotId: params.shotId,
        ...input,
      })
      return { success: true, data: { run } }
    })
    .post('/projects/:id/phases/:phase/runs', async ({ request, params, body }) => {
      const user = await requireAuthUser(request, deps.authService)
      const phase = validateInput(DirectorPhaseSchema, params.phase)
      const input = validateInput(CreateDirectorPhaseRunSchema, body)
      if (phase === 'videos') {
        requireDirectorVideoModel(input.modelId)
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
  const referenceParameter = manifest.parameters.find(parameter => parameter.type === 'media' && parameter.mediaKind === 'image')
  if (referenceParameter !== undefined && referenceCount > 0) params[referenceParameter.name] = Array.from({ length: referenceCount }, () => 'reference')
  return estimatePriceCents(manifest, params)
}

function requireDirectorVideoModel(modelId: string): FrozenModelManifest {
  const model = getModelById(modelId)
  if (
    model === undefined
    || model.availability.enabled === false
    || model.request.kind !== 'dashscope-video-task'
    || getBailianOperationCapability(model.id) !== 'video.reference-to-video'
  ) {
    throw new ValidationError('视频阶段需要使用已启用的参考生视频模型', 'modelId')
  }
  return model
}
