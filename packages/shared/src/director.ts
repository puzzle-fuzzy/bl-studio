import { z } from 'zod'

/**
 * Director pipeline phases are intentionally stable identifiers. The UI may
 * group or rename phases, but worker/API contracts should continue to use
 * these backend-oriented keys.
 */
export const DIRECTOR_PHASES = [
  'analyze',
  'characters',
  'locations',
  'characterRefs',
  'locationRefs',
  'storyboard',
  'continuity',
  'rebuild',
  'dialogue',
  'videos',
  'bgm',
  'assemble',
] as const

export type DirectorPhase = (typeof DIRECTOR_PHASES)[number]

export const DIRECTOR_PHASE_LABELS: Record<DirectorPhase, string> = {
  analyze: '剧本分析',
  characters: '角色',
  locations: '场景',
  characterRefs: '角色参考',
  locationRefs: '场景参考',
  storyboard: '分镜',
  continuity: '连贯性',
  rebuild: '视频提示词',
  dialogue: '对白',
  videos: '视频生成',
  bgm: '音乐',
  assemble: '合成',
}

export const DIRECTOR_PHASE_STATUS = [
  'not_started',
  'ready',
  'running',
  'needs_review',
  'failed',
  'completed',
  'cancelled',
] as const

export type DirectorPhaseStatus = (typeof DIRECTOR_PHASE_STATUS)[number]

export const DIRECTOR_PROJECT_STATUS = ['draft', 'active', 'completed', 'archived'] as const
export type DirectorProjectStatus = (typeof DIRECTOR_PROJECT_STATUS)[number]

export const DirectorPhaseSchema = z.enum(DIRECTOR_PHASES)
export const DirectorPhaseStatusSchema = z.enum(DIRECTOR_PHASE_STATUS)
export const DirectorProjectStatusSchema = z.enum(DIRECTOR_PROJECT_STATUS)

export const CreateDirectorProjectSchema = z.object({
  title: z.string().trim().min(1).max(120),
  storyText: z.string().trim().min(1).max(500_000),
  synopsis: z.string().trim().max(2_000).optional(),
}).strict()

export const UpdateDirectorProjectSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  storyText: z.string().trim().min(1).max(500_000).optional(),
  synopsis: z.string().trim().max(2_000).nullable().optional(),
}).strict()

export const ListDirectorProjectsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().trim().min(1).max(512).optional(),
}).strict()

export const DirectorPhaseStateSchema = z.object({
  phase: DirectorPhaseSchema,
  status: DirectorPhaseStatusSchema,
  version: z.number().int().nonnegative(),
  activeRunId: z.string().nullable(),
  lastError: z.object({
    code: z.string(),
    message: z.string(),
    retriable: z.boolean().optional(),
  }).nullable(),
  updatedAt: z.string(),
})

export const DirectorProjectProgressSchema = z.object({
  completed: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  currentPhase: DirectorPhaseSchema.nullable(),
})

export const DirectorProjectSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  status: DirectorProjectStatusSchema,
  progress: DirectorProjectProgressSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const DirectorProjectDetailSchema = z.object({
  id: z.string(),
  title: z.string(),
  storyText: z.string(),
  synopsis: z.string().nullable(),
  status: DirectorProjectStatusSchema,
  settings: z.record(z.string(), z.unknown()),
  phases: z.array(DirectorPhaseStateSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const DirectorProjectListResponseSchema = z.object({
  items: z.array(DirectorProjectSummarySchema),
  nextCursor: z.string().optional(),
})

export const DirectorProjectResponseSchema = z.object({
  project: DirectorProjectDetailSchema,
})

export type CreateDirectorProjectInput = z.infer<typeof CreateDirectorProjectSchema>
export type UpdateDirectorProjectInput = z.infer<typeof UpdateDirectorProjectSchema>
export type ListDirectorProjectsInput = z.infer<typeof ListDirectorProjectsSchema>
export type DirectorPhaseState = z.infer<typeof DirectorPhaseStateSchema>
export type DirectorProjectProgress = z.infer<typeof DirectorProjectProgressSchema>
export type DirectorProjectSummary = z.infer<typeof DirectorProjectSummarySchema>
export type DirectorProjectDetail = z.infer<typeof DirectorProjectDetailSchema>
export type DirectorProjectListResult = z.infer<typeof DirectorProjectListResponseSchema>
