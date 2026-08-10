import { z } from 'zod'
import type { DirectorProjectDetail } from './director'

export const DirectorAssemblySettingsSchema = z.object({
  width: z.number().int().min(360).max(2160),
  height: z.number().int().min(360).max(3840),
  fps: z.number().int().min(12).max(60),
  audioVolume: z.number().min(0).max(2),
}).strict()

export const DirectorAssemblySettingsInputSchema = z.object({
  width: z.number().int().min(360).max(2160).optional(),
  height: z.number().int().min(360).max(3840).optional(),
  fps: z.number().int().min(12).max(60).optional(),
  audioVolume: z.number().min(0).max(2).optional(),
}).strict()

export const DirectorAssemblyShotSchema = z.object({
  shotId: z.string(),
  sequence: z.number().int().positive(),
  shotVersion: z.number().int().positive(),
  directorAssetId: z.string(),
  assetId: z.string(),
  sourceRunId: z.string().nullable(),
  durationSeconds: z.number().positive(),
}).strict()

export const DirectorAssemblyMusicSchema = z.object({
  directorAssetId: z.string(),
  assetId: z.string(),
}).strict()

export const DirectorAssemblyPlanSchema = z.object({
  shots: z.array(DirectorAssemblyShotSchema).max(500),
  music: DirectorAssemblyMusicSchema.nullable(),
  totalDurationSeconds: z.number().nonnegative(),
  settings: DirectorAssemblySettingsSchema,
}).strict()

export const DirectorAssemblyIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  shotId: z.string().optional(),
}).strict()

export const DirectorAssemblyPreflightSchema = z.object({
  ready: z.boolean(),
  plan: DirectorAssemblyPlanSchema,
  issues: z.array(DirectorAssemblyIssueSchema).max(500),
  warnings: z.array(z.string()).max(50),
}).strict()

export const DirectorAssemblyPreflightResponseSchema = z.object({
  preflight: DirectorAssemblyPreflightSchema,
}).strict()

export type DirectorAssemblySettings = z.infer<typeof DirectorAssemblySettingsSchema>
export type DirectorAssemblySettingsInput = z.infer<typeof DirectorAssemblySettingsInputSchema>
export type DirectorAssemblyShot = z.infer<typeof DirectorAssemblyShotSchema>
export type DirectorAssemblyPlan = z.infer<typeof DirectorAssemblyPlanSchema>
export type DirectorAssemblyPreflight = z.infer<typeof DirectorAssemblyPreflightSchema>

export interface DirectorAssemblyShotCandidate {
  id: string
  sequence: number
  version: number
  status: string
  activeVideoAssetId: string | null
  durationSeconds: number | null
  staleAt: string | null
}

export interface DirectorAssemblyAssetCandidate {
  id: string
  kind: string
  assetId: string | null
  sourceRunId: string | null
  staleAt: string | null
}

export const DEFAULT_DIRECTOR_ASSEMBLY_SETTINGS: DirectorAssemblySettings = {
  width: 1080,
  height: 1920,
  fps: 30,
  audioVolume: 1,
}

export function normalizeDirectorAssemblySettings(
  input: DirectorAssemblySettingsInput | undefined,
): DirectorAssemblySettings {
  return {
    ...DEFAULT_DIRECTOR_ASSEMBLY_SETTINGS,
    ...(input ?? {}),
  }
}

export function buildDirectorAssemblyPreflight(
  project: Pick<DirectorProjectDetail, 'shots' | 'assets'>,
  settingsInput?: DirectorAssemblySettingsInput,
): DirectorAssemblyPreflight {
  return buildDirectorAssemblyPreflightFromCandidates(project.shots, project.assets, settingsInput)
}

export function buildDirectorAssemblyPreflightFromCandidates(
  shotsInput: ReadonlyArray<DirectorAssemblyShotCandidate>,
  assetsInput: ReadonlyArray<DirectorAssemblyAssetCandidate>,
  settingsInput?: DirectorAssemblySettingsInput,
): DirectorAssemblyPreflight {
  const settings = normalizeDirectorAssemblySettings(settingsInput)
  const currentAssets = assetsInput.filter(asset => asset.staleAt === null && asset.assetId !== null)
  const issues: Array<{ code: string; message: string; shotId?: string }> = []
  const shots: DirectorAssemblyShot[] = []

  for (const shot of [...shotsInput].sort((left, right) => left.sequence - right.sequence)) {
    if (shot.staleAt !== null) {
      issues.push({ code: 'SHOT_STALE', message: `镜头 ${shot.sequence} 已过时，请先重新生成或确认当前版本`, shotId: shot.id })
      continue
    }
    if (shot.status !== 'succeeded' || shot.activeVideoAssetId === null) {
      issues.push({ code: 'SHOT_VIDEO_MISSING', message: `镜头 ${shot.sequence} 尚未拥有可用的视频资产`, shotId: shot.id })
      continue
    }
    const videoAsset = currentAssets.find(asset => asset.id === shot.activeVideoAssetId && asset.kind === 'shot_video')
    if (videoAsset === undefined || videoAsset.assetId === null) {
      issues.push({ code: 'SHOT_ASSET_INVALID', message: `镜头 ${shot.sequence} 的视频资产不可用`, shotId: shot.id })
      continue
    }
    if (shot.durationSeconds === null || shot.durationSeconds <= 0) {
      issues.push({ code: 'SHOT_DURATION_MISSING', message: `镜头 ${shot.sequence} 缺少有效时长`, shotId: shot.id })
      continue
    }
    shots.push({
      shotId: shot.id,
      sequence: shot.sequence,
      shotVersion: shot.version,
      directorAssetId: videoAsset.id,
      assetId: videoAsset.assetId,
      sourceRunId: videoAsset.sourceRunId,
      durationSeconds: shot.durationSeconds,
    })
  }

  const musicAsset = currentAssets.find(asset => asset.kind === 'music')
  const warnings = musicAsset === undefined ? ['当前没有可用背景音乐，将只合成视频画面'] : []
  if (shots.length === 0) {
    issues.push({ code: 'SHOTS_EMPTY', message: '至少需要一个可用的视频镜头才能合成' })
  }

  return {
    ready: issues.length === 0,
    plan: {
      shots,
      music: musicAsset?.assetId === null || musicAsset === undefined
        ? null
        : { directorAssetId: musicAsset.id, assetId: musicAsset.assetId },
      totalDurationSeconds: shots.reduce((total, shot) => total + shot.durationSeconds, 0),
      settings,
    },
    issues,
    warnings,
  }
}
