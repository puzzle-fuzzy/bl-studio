import { validateModelParams, type FrozenModelManifest, type ReferenceFormat } from '@bailian-studio/model-core'
import type { DirectorAsset, DirectorShot } from '@bailian-studio/director-contracts'

const REFERENCE_ASSET_KINDS = new Set<DirectorAsset['kind']>([
  'uploaded_reference',
  'character_reference',
  'location_reference',
])

export interface DirectorVideoShotSnapshot {
  id: string
  sequence: number
  status: string
  referenceAssetIds: string[]
}

export type DirectorVideoGenerationStatus = 'queued' | 'processing' | 'succeeded'

export interface DirectorVideoGenerationProgress {
  shotId: string
  sequence: number
  generationId: string
  status: DirectorVideoGenerationStatus
}

export interface DirectorVideoRunSummary {
  modelId: string
  shotGenerations: Record<string, DirectorVideoGenerationProgress>
}

export interface DirectorVideoGenerationInput {
  params: Record<string, unknown>
  assetRefs?: Record<string, string[]>
}

export class DirectorVideoInputError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'DirectorVideoInputError'
  }
}

export function buildDirectorVideoGenerationInput(
  shot: Pick<DirectorShot, 'narrative' | 'camera' | 'durationSeconds' | 'environmentPrompt' | 'videoPrompt' | 'negativePrompt' | 'dialogue' | 'referenceAssetIds'>,
  assets: readonly DirectorAsset[],
  manifest: FrozenModelManifest,
): DirectorVideoGenerationInput {
  if (manifest.category !== 'video' || manifest.request.kind !== 'dashscope-video-task') {
    throw new DirectorVideoInputError(
      'DIRECTOR_VIDEO_MODEL_INVALID',
      'Director video generation requires an enabled asynchronous video model',
    )
  }

  const referenceParameter = manifest.parameters.find(parameter => (
    parameter.type === 'media'
    && parameter.mediaKind === 'image'
    && manifest.request.bindings[parameter.name]?.target === 'input.media'
  ))?.name
  const promptParameter = manifest.parameters.find(parameter => parameter.name === 'prompt' && parameter.type === 'text')
  if (referenceParameter === undefined || promptParameter === undefined) {
    throw new DirectorVideoInputError(
      'DIRECTOR_VIDEO_MODEL_UNSUPPORTED',
      'Selected video model does not expose the reference image and prompt bindings required by the Director workflow',
    )
  }

  const references = [...new Set(shot.referenceAssetIds)].map((directorAssetId) => {
    const binding = assets.find(asset => asset.id === directorAssetId)
    if (
      binding === undefined
      || binding.assetId === null
      || binding.staleAt !== null
      || !REFERENCE_ASSET_KINDS.has(binding.kind)
    ) {
      throw new DirectorVideoInputError(
        'DIRECTOR_VIDEO_REFERENCE_UNAVAILABLE',
        `Storyboard reference binding is unavailable: ${directorAssetId}`,
      )
    }
    return binding
  })

  const referenceParameterDefinition = manifest.parameters.find(parameter => parameter.name === referenceParameter)
  const maximumReferences = referenceParameterDefinition?.type === 'media'
    ? referenceParameterDefinition.maxItems ?? Number.POSITIVE_INFINITY
    : 0
  if (references.length > maximumReferences) {
    throw new DirectorVideoInputError(
      'DIRECTOR_VIDEO_REFERENCE_LIMIT',
      `This video model accepts at most ${maximumReferences} reference images per shot`,
    )
  }

  const prompt = buildPrompt(shot, manifest.request.referenceFormat, references.length)
  const params: Record<string, unknown> = {
    [promptParameter.name]: prompt.slice(0, promptParameter.maxLength ?? 5_000),
  }
  const negativePromptParameter = manifest.parameters.find(parameter => parameter.name === 'negativePrompt' && parameter.type === 'text')
  if (negativePromptParameter !== undefined && shot.negativePrompt !== null && shot.negativePrompt.trim().length > 0) {
    params[negativePromptParameter.name] = shot.negativePrompt.slice(0, negativePromptParameter.maxLength ?? 2_000)
  }

  const durationParameter = manifest.parameters.find(parameter => parameter.name === 'duration' && parameter.type === 'number')
  if (durationParameter !== undefined && shot.durationSeconds !== null) {
    const minimum = durationParameter.min ?? shot.durationSeconds
    const maximum = durationParameter.max ?? shot.durationSeconds
    params[durationParameter.name] = Math.min(maximum, Math.max(minimum, shot.durationSeconds))
  }

  const validation = validateModelParams(manifest, {
    ...params,
    [referenceParameter]: references.map((_, index) => `asset://director-reference/${index}`),
  })
  if (!validation.valid) {
    const firstIssue = validation.errors[0]
    throw new DirectorVideoInputError(
      `DIRECTOR_VIDEO_${firstIssue?.code ?? 'PARAMETERS_INVALID'}`,
      firstIssue?.messages['zh-CN'] ?? firstIssue?.message ?? '视频模型参数不满足 manifest 约束',
    )
  }

  return {
    params,
    ...(references.length === 0 ? {} : { assetRefs: { [referenceParameter]: references.map(asset => asset.assetId as string) } }),
  }
}

export function parseDirectorVideoRunSummary(value: Record<string, unknown> | null | undefined): DirectorVideoRunSummary | undefined {
  if (value === null || value === undefined || typeof value.modelId !== 'string' || typeof value.shotGenerations !== 'object' || value.shotGenerations === null) {
    return undefined
  }
  const shotGenerations: Record<string, DirectorVideoGenerationProgress> = {}
  for (const [shotId, raw] of Object.entries(value.shotGenerations)) {
    if (typeof raw !== 'object' || raw === null) continue
    const candidate = raw as Record<string, unknown>
    if (
      typeof candidate.shotId !== 'string'
      || typeof candidate.sequence !== 'number'
      || typeof candidate.generationId !== 'string'
      || !['queued', 'processing', 'succeeded'].includes(String(candidate.status))
    ) continue
    shotGenerations[shotId] = {
      shotId: candidate.shotId,
      sequence: candidate.sequence,
      generationId: candidate.generationId,
      status: candidate.status as DirectorVideoGenerationStatus,
    }
  }
  return { modelId: value.modelId, shotGenerations }
}

function buildPrompt(
  shot: Pick<DirectorShot, 'narrative' | 'camera' | 'durationSeconds' | 'environmentPrompt' | 'videoPrompt' | 'dialogue' | 'referenceAssetIds'>,
  referenceFormat: ReferenceFormat | undefined,
  referenceCount: number,
): string {
  const camera = Object.entries(shot.camera)
    .filter(([, value]) => typeof value === 'string' && value.trim().length > 0)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('；')
  const dialogue = shot.dialogue === null ? '' : JSON.stringify(shot.dialogue)
  const referenceHint = referenceCount === 0
    ? ''
    : referenceFormat === 'image-bracket'
      ? `参考图按顺序使用 [Image 1] 到 [Image ${referenceCount}]，保持角色与场景一致。`
      : referenceFormat === 'angle-bracket'
        ? `参考图按顺序使用 <<<image_1>>> 到 <<<image_${referenceCount}>>>，保持角色与场景一致。`
      : `参考图按顺序使用图1到图${referenceCount}，保持角色与场景一致。`
  return [
    shot.environmentPrompt,
    shot.videoPrompt,
    `叙事动作：${shot.narrative}`,
    camera.length > 0 ? `镜头：${camera}` : '',
    shot.durationSeconds === null ? '' : `镜头时长约 ${shot.durationSeconds} 秒。`,
    dialogue.length > 0 && dialogue !== '{}' ? `对白与表演：${dialogue}` : '',
    referenceHint,
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join('\n')
}
