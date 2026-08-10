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
  'queued',
  'running',
  'needs_review',
  'failed',
  'completed',
  'cancelled',
] as const

export type DirectorPhaseStatus = (typeof DIRECTOR_PHASE_STATUS)[number]

export const DIRECTOR_PHASE_RUN_STATUS = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const

export type DirectorPhaseRunStatus = (typeof DIRECTOR_PHASE_RUN_STATUS)[number]

export const DIRECTOR_PROJECT_STATUS = ['draft', 'active', 'completed', 'archived'] as const
export type DirectorProjectStatus = (typeof DIRECTOR_PROJECT_STATUS)[number]

export const DirectorPhaseSchema = z.enum(DIRECTOR_PHASES)
export const DirectorPhaseStatusSchema = z.enum(DIRECTOR_PHASE_STATUS)
export const DirectorPhaseRunStatusSchema = z.enum(DIRECTOR_PHASE_RUN_STATUS)
export const DirectorProjectStatusSchema = z.enum(DIRECTOR_PROJECT_STATUS)

export const DirectorScriptVersionSchema = z.object({
  id: z.string(),
  version: z.number().int().positive(),
  storyText: z.string(),
  synopsis: z.string().nullable(),
  createdAt: z.string(),
}).strict()

const DirectorStaleFields = {
  staleAt: z.string().nullable(),
  staleReason: z.string().nullable(),
}

export const DirectorCharacterSchema = z.object({
  id: z.string(),
  sourceRunId: z.string().nullable(),
  name: z.string(),
  role: z.string().nullable(),
  description: z.string(),
  traits: z.array(z.string()),
  referenceAssetIds: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()),
  locked: z.boolean(),
  version: z.number().int().positive(),
  ...DirectorStaleFields,
}).strict()

export const DirectorLocationSchema = z.object({
  id: z.string(),
  sourceRunId: z.string().nullable(),
  name: z.string(),
  description: z.string(),
  atmosphere: z.string().nullable(),
  referenceAssetIds: z.array(z.string()),
  metadata: z.record(z.string(), z.unknown()),
  locked: z.boolean(),
  version: z.number().int().positive(),
  ...DirectorStaleFields,
}).strict()

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
  lastRunId: z.string().nullable(),
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
  scriptVersion: DirectorScriptVersionSchema,
  characters: z.array(DirectorCharacterSchema),
  locations: z.array(DirectorLocationSchema),
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

export const CreateDirectorPhaseRunSchema = z.object({
  modelId: z.string().trim().min(1).max(256),
}).strict()

export const DirectorPhaseRunSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  scriptVersionId: z.string(),
  phase: DirectorPhaseSchema,
  status: DirectorPhaseRunStatusSchema,
  version: z.number().int().positive(),
  taskId: z.string().nullable(),
  outputSummary: z.record(z.string(), z.unknown()).nullable(),
  error: z.record(z.string(), z.unknown()).nullable(),
  staleAt: z.string().nullable(),
  staleReason: z.string().nullable(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  updatedAt: z.string(),
})

export const DirectorPhaseRunResponseSchema = z.object({
  run: DirectorPhaseRunSchema,
})

export const DirectorCharacterDraftSchema = z.object({
  name: z.string().min(1).max(120),
  role: z.string().max(120),
  description: z.string().min(1).max(2_000),
  traits: z.array(z.string().min(1).max(120)).max(12),
  goal: z.string().min(1).max(1_000),
  conflict: z.string().min(1).max(1_000),
  arc: z.string().min(1).max(2_000),
  visualSignature: z.string().max(1_000),
}).strict()

export const DirectorCharactersResultSchema = z.object({
  characters: z.array(DirectorCharacterDraftSchema).max(50),
  relationshipNotes: z.array(z.string().min(1).max(1_000)).max(50),
}).strict()

export const DirectorLocationDraftSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().min(1).max(2_000),
  atmosphere: z.string().max(500),
  narrativeFunction: z.string().min(1).max(1_000),
  timeOfDay: z.string().max(120),
  visualAnchors: z.array(z.string().min(1).max(500)).max(12),
  continuityNotes: z.array(z.string().min(1).max(500)).max(12),
}).strict()

export const DirectorLocationsResultSchema = z.object({
  locations: z.array(DirectorLocationDraftSchema).max(50),
  continuityNotes: z.array(z.string().min(1).max(1_000)).max(50),
}).strict()

export const DirectorAnalysisResultSchema = z.object({
  summary: z.string().min(1).max(2_000),
  theme: z.string().min(1).max(2_000),
  audience: z.string().min(1).max(1_000),
  structure: z.array(z.object({
    name: z.string().min(1).max(120),
    purpose: z.string().min(1).max(1_000),
    beats: z.array(z.string().min(1).max(500)).max(20),
  }).strict()).max(12),
  characters: z.array(z.object({
    name: z.string().min(1).max(120),
    role: z.string().max(120),
    description: z.string().min(1).max(2_000),
    traits: z.array(z.string().min(1).max(120)).max(12),
  }).strict()).max(50),
  locations: z.array(z.object({
    name: z.string().min(1).max(120),
    description: z.string().min(1).max(2_000),
    atmosphere: z.string().max(500),
  }).strict()).max(50),
  continuityRisks: z.array(z.string().min(1).max(1_000)).max(30),
  visualMotifs: z.array(z.string().min(1).max(500)).max(30),
}).strict()

export type CreateDirectorProjectInput = z.infer<typeof CreateDirectorProjectSchema>
export type UpdateDirectorProjectInput = z.infer<typeof UpdateDirectorProjectSchema>
export type CreateDirectorPhaseRunInput = z.infer<typeof CreateDirectorPhaseRunSchema>
export type DirectorPhaseRun = z.infer<typeof DirectorPhaseRunSchema>
export type DirectorAnalysisResult = z.infer<typeof DirectorAnalysisResultSchema>
export type DirectorCharacterDraft = z.infer<typeof DirectorCharacterDraftSchema>
export type DirectorCharactersResult = z.infer<typeof DirectorCharactersResultSchema>
export type DirectorLocationDraft = z.infer<typeof DirectorLocationDraftSchema>
export type DirectorLocationsResult = z.infer<typeof DirectorLocationsResultSchema>
export type ListDirectorProjectsInput = z.infer<typeof ListDirectorProjectsSchema>
export type DirectorPhaseState = z.infer<typeof DirectorPhaseStateSchema>
export type DirectorProjectProgress = z.infer<typeof DirectorProjectProgressSchema>
export type DirectorProjectSummary = z.infer<typeof DirectorProjectSummarySchema>
export type DirectorProjectDetail = z.infer<typeof DirectorProjectDetailSchema>
export type DirectorScriptVersion = z.infer<typeof DirectorScriptVersionSchema>
export type DirectorCharacter = z.infer<typeof DirectorCharacterSchema>
export type DirectorLocation = z.infer<typeof DirectorLocationSchema>
export type DirectorProjectListResult = z.infer<typeof DirectorProjectListResponseSchema>
