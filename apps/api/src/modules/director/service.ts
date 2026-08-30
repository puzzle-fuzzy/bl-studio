/**
 * Director 业务逻辑（P1-D：从 director/routes.ts 下沉模型选择与计价规则）。
 *
 * 路由只做 HTTP 适配（认证、校验、响应整形）；模型前置校验、参数构造、
 * 计价估算等业务逻辑收敛到这里。API 侧的 directorVideoParams 与 worker 侧的
 * buildDirectorVideoGenerationInput 构造同一批参数——两套构造器需保持一致，
 * 统一放在 service 层减少漂移面。
 */
import type { CreateDirectorPhaseRunInput, DirectorAssemblyPreflight, DirectorAssemblySettingsInput, DirectorMusicEstimate, DirectorPhase, DirectorPhaseRun, DirectorVideoEstimate } from '@bailian-studio/director-contracts'
import { ValidationError } from '@bailian-studio/shared'
import { DirectorRepositoryError, type DirectorProjectRepositoryDetail, type DirectorRepository } from '@bailian-studio/director-repository'
import {
  estimatePriceCents,
  validateModelParams,
  type ModelCatalog,
  type ModelManifestResolver,
} from '@bailian-studio/model-core'
import type {
  FrozenModelManifest,
} from '@bailian-studio/dashscope-manifests'

export interface DirectorApplicationService {
  requestScriptChat(input: {
    userId: string
    projectId: string
    traceId?: string
    input: CreateDirectorPhaseRunInput
  }): Promise<DirectorPhaseRun>
  estimateShotVideo(input: {
    userId: string
    projectId: string
    shotId: string
    modelId?: string
  }): Promise<DirectorVideoEstimate>
  createShotVideoRun(input: {
    userId: string
    projectId: string
    shotId: string
    traceId?: string
    input: CreateDirectorPhaseRunInput
  }): Promise<DirectorPhaseRun>
  createPhaseRun(input: {
    userId: string
    projectId: string
    phase: DirectorPhase
    traceId?: string
    input: CreateDirectorPhaseRunInput
  }): Promise<DirectorPhaseRun>
  estimateVideos(input: {
    userId: string
    projectId: string
    modelId?: string
  }): Promise<DirectorVideoEstimate>
  estimateMusic(input: {
    userId: string
    projectId: string
    input: CreateDirectorPhaseRunInput
  }): Promise<DirectorMusicEstimate>
  getAssemblyPreflight(input: {
    userId: string
    projectId: string
    settings?: DirectorAssemblySettingsInput
  }): Promise<DirectorAssemblyPreflight>
  createAssemblyRun(input: {
    userId: string
    projectId: string
    traceId?: string
    input: CreateDirectorPhaseRunInput
  }): Promise<DirectorPhaseRun>
}

// ── 模型前置校验 ──

export function requireDirectorMusicModel(
  modelId: string | undefined,
  modelResolver: ModelManifestResolver<FrozenModelManifest>,
  modelCatalog: Pick<ModelCatalog, 'getById'>,
): FrozenModelManifest {
  const model = modelId === undefined ? undefined : modelResolver.getModelById(modelId)
  if (model === undefined || model.availability.enabled === false || modelCatalog.getById(model.id)?.operation !== 'music.generate') {
    throw new ValidationError('音乐阶段需要使用已启用的音乐生成模型')
  }
  return model
}

export function requireDirectorVideoModel(
  modelId: string | undefined,
  modelResolver: ModelManifestResolver<FrozenModelManifest>,
  modelCatalog: Pick<ModelCatalog, 'getById'>,
): FrozenModelManifest {
  const model = modelId === undefined ? undefined : modelResolver.getModelById(modelId)
  if (
    model === undefined
    || model.availability.enabled === false
    || model.request.kind !== 'dashscope-video-task'
    || modelCatalog.getById(model.id)?.operation !== 'video.reference-to-video'
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

// ── 参数构造（API 估价用，与 worker 侧 buildDirectorVideoGenerationInput 对齐） ──

export function directorMusicParams(input: {
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

export function directorVideoParams(
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

// ── 计价与校验 ──

export function estimateDirectorShotCents(
  manifest: FrozenModelManifest,
  durationSeconds: number | null,
  referenceCount: number,
): number {
  return estimatePriceCents(manifest, directorVideoParams(manifest, durationSeconds, referenceCount))
}

export function validateDirectorVideoShots(
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

function requireDirectorProject(
  repository: DirectorRepository,
  userId: string,
  projectId: string,
): Promise<DirectorProjectRepositoryDetail> {
  return repository.getProject({ userId, projectId }).then((project) => {
    if (project === undefined) {
      throw new DirectorRepositoryError(
        'DIRECTOR_PROJECT_NOT_FOUND',
        `Director project not found: ${projectId}`,
      )
    }
    return project
  })
}

function requireDirectorShot(
  project: DirectorProjectRepositoryDetail,
  shotId: string,
) {
  const shot = project.shots.find((candidate) => candidate.id === shotId)
  if (shot === undefined) {
    throw new DirectorRepositoryError(
      'DIRECTOR_SHOT_NOT_FOUND',
      `Director shot not found: ${shotId}`,
    )
  }
  return shot
}

function requireRetryableDirectorShot(
  project: DirectorProjectRepositoryDetail,
  shotId: string,
) {
  const shot = requireDirectorShot(project, shotId)
  if (shot.status !== 'locked' && shot.status !== 'failed') {
    throw new DirectorRepositoryError(
      shot.status === 'generating'
        ? 'DIRECTOR_SHOT_GENERATING'
        : 'DIRECTOR_PHASE_INPUT_NOT_READY',
      'Only a locked or failed storyboard shot can be retried individually',
    )
  }
  return shot
}

function validateDirectorMusicInput(
  input: CreateDirectorPhaseRunInput,
  modelResolver: ModelManifestResolver<FrozenModelManifest>,
  modelCatalog: Pick<ModelCatalog, 'getById'>,
) {
  const model = requireDirectorMusicModel(input.modelId, modelResolver, modelCatalog)
  const params = directorMusicParams(input)
  const validation = validateModelParams(model, params)
  if (!validation.valid) {
    throw new ValidationError(
      validation.errors[0]?.message ?? 'Invalid music generation parameters',
    )
  }
  return { model, params }
}

export function createDirectorApplicationService({
  repository,
  modelResolver,
  modelCatalog,
}: {
  repository: DirectorRepository
  modelResolver: ModelManifestResolver<FrozenModelManifest>
  modelCatalog: Pick<ModelCatalog, 'getById'>
}): DirectorApplicationService {
  return {
    async requestScriptChat({ userId, projectId, traceId, input }) {
      return repository.requestPhaseRun({
        userId,
        projectId,
        phase: 'analyze',
        traceId,
        ...input,
      })
    },

    async estimateShotVideo({ userId, projectId, shotId, modelId }) {
      const model = requireDirectorVideoModel(modelId, modelResolver, modelCatalog)
      const project = await requireDirectorProject(repository, userId, projectId)
      const shot = requireRetryableDirectorShot(project, shotId)
      validateDirectorVideoShots(model, [shot])
      return {
        modelId: model.id,
        estimatedCents: estimateDirectorShotCents(
          model,
          shot.durationSeconds,
          shot.referenceAssetIds.length,
        ),
        shotCount: 1,
        currency: 'CNY',
      }
    },

    async createShotVideoRun({ userId, projectId, shotId, traceId, input }) {
      const model = requireDirectorVideoModel(input.modelId, modelResolver, modelCatalog)
      const project = await requireDirectorProject(repository, userId, projectId)
      const shot = requireRetryableDirectorShot(project, shotId)
      validateDirectorVideoShots(model, [shot])
      return repository.requestPhaseRun({
        userId,
        projectId,
        phase: 'videos',
        shotId,
        traceId,
        ...input,
      })
    },

    async createPhaseRun({ userId, projectId, phase, traceId, input }) {
      if (phase === 'videos') {
        const model = requireDirectorVideoModel(input.modelId, modelResolver, modelCatalog)
        const project = await requireDirectorProject(repository, userId, projectId)
        validateDirectorVideoShots(
          model,
          project.shots.filter(
            (shot) => shot.status === 'locked' || shot.status === 'failed',
          ),
        )
      }
      if (phase === 'bgm') {
        validateDirectorMusicInput(input, modelResolver, modelCatalog)
      }
      return repository.requestPhaseRun({
        userId,
        projectId,
        phase,
        traceId,
        ...input,
      })
    },

    async estimateVideos({ userId, projectId, modelId }) {
      const model = requireDirectorVideoModel(modelId, modelResolver, modelCatalog)
      const project = await requireDirectorProject(repository, userId, projectId)
      const pendingShots = project.shots.filter(
        (shot) => shot.status === 'locked' || shot.status === 'failed',
      )
      if (
        project.shots.length === 0
        || project.shots.some(
          (shot) => !['locked', 'failed', 'generating', 'succeeded'].includes(shot.status),
        )
        || project.shots.some(
          (shot) => shot.status === 'generating' && shot.videoGenerationId === null,
        )
      ) {
        throw new DirectorRepositoryError(
          'DIRECTOR_PHASE_INPUT_NOT_READY',
          'Every current storyboard shot must be locked, resumable, or already generated before estimating video generation',
        )
      }
      validateDirectorVideoShots(model, pendingShots)
      return {
        modelId: model.id,
        estimatedCents: pendingShots.reduce(
          (total, shot) => total + estimateDirectorShotCents(
            model,
            shot.durationSeconds,
            shot.referenceAssetIds.length,
          ),
          0,
        ),
        shotCount: pendingShots.length,
        currency: 'CNY',
      }
    },

    async estimateMusic({ userId, projectId, input }) {
      const { model, params } = validateDirectorMusicInput(input, modelResolver, modelCatalog)
      await requireDirectorProject(repository, userId, projectId)
      return {
        modelId: model.id,
        estimatedCents: estimatePriceCents(model, params),
        durationSeconds: Number(params.duration),
        currency: 'CNY',
      }
    },

    async getAssemblyPreflight({ userId, projectId, settings }) {
      const preflight = await repository.getAssemblyPreflight({
        userId,
        projectId,
        ...(settings === undefined ? {} : { settings }),
      })
      if (preflight === undefined) {
        throw new DirectorRepositoryError(
          'DIRECTOR_PROJECT_NOT_FOUND',
          `Director project not found: ${projectId}`,
        )
      }
      return preflight
    },

    async createAssemblyRun({ userId, projectId, traceId, input }) {
      const preflight = await this.getAssemblyPreflight({
        userId,
        projectId,
        ...(input.assembly === undefined ? {} : { settings: input.assembly }),
      })
      if (!preflight.ready) {
        throw new DirectorRepositoryError(
          'DIRECTOR_PHASE_INPUT_NOT_READY',
          preflight.issues[0]?.message ?? 'Assembly inputs are not ready',
        )
      }
      return repository.requestPhaseRun({
        userId,
        projectId,
        phase: 'assemble',
        traceId,
        ...input,
      })
    },
  }
}
