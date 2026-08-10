import type {
  CreateDirectorPhaseRunInput,
  CreateDirectorProjectInput,
  DirectorPhase,
  DirectorPhaseRun,
	DirectorPhaseState,
	DirectorCharacter,
	DirectorLocation,
  DirectorProjectDetail,
  DirectorProjectProgress,
  DirectorProjectStatus,
	DirectorProjectSummary,
	DirectorScriptVersion,
  UpdateDirectorProjectInput,
} from '@bailian-studio/shared'

export type { CreateDirectorPhaseRunInput, CreateDirectorProjectInput, UpdateDirectorProjectInput }

export interface CreateDirectorProjectRepositoryInput extends CreateDirectorProjectInput {
  userId: string
}

export interface ListDirectorProjectsRepositoryInput {
  userId: string
  limit: number
  cursor?: string
}

export interface GetDirectorProjectRepositoryInput {
  userId: string
  projectId: string
}

export interface UpdateDirectorProjectRepositoryInput {
  userId: string
  projectId: string
  patch: UpdateDirectorProjectInput
}

export interface RequestDirectorPhaseRunRepositoryInput extends CreateDirectorPhaseRunInput {
  userId: string
  projectId: string
  phase: DirectorPhase
  now?: string
}

export interface GetDirectorPhaseRunRepositoryInput {
  userId: string
  projectId: string
  phase: DirectorPhase
  runId: string
}

export interface DirectorPhaseRunProgressInput {
  runId: string
  outputSummary: Record<string, unknown>
  now?: string
}

export interface DirectorPhaseRunCompletionInput extends DirectorPhaseRunProgressInput {}

export interface DirectorPhaseRunFailureInput {
  runId: string
  error: { code: string; message: string; retriable?: boolean }
  now?: string
}

export interface DirectorPhaseRunForWorker extends DirectorPhaseRun {
  inputSnapshot: Record<string, unknown>
}

export interface DirectorProjectRepositorySummary extends DirectorProjectSummary {
  status: DirectorProjectStatus
  progress: DirectorProjectProgress
}

export interface DirectorProjectRepositoryDetail extends DirectorProjectDetail {
  phases: DirectorPhaseState[]
  scriptVersion: DirectorScriptVersion
  characters: DirectorCharacter[]
  locations: DirectorLocation[]
}

export interface ListDirectorProjectsResult {
  items: DirectorProjectRepositorySummary[]
  nextCursor?: string
}

export interface DirectorRepository {
  createProject(input: CreateDirectorProjectRepositoryInput): Promise<DirectorProjectRepositoryDetail>
  listProjects(input: ListDirectorProjectsRepositoryInput): Promise<ListDirectorProjectsResult>
  getProject(input: GetDirectorProjectRepositoryInput): Promise<DirectorProjectRepositoryDetail | undefined>
  updateProject(input: UpdateDirectorProjectRepositoryInput): Promise<DirectorProjectRepositoryDetail>
  requestPhaseRun(input: RequestDirectorPhaseRunRepositoryInput): Promise<DirectorPhaseRun>
  getPhaseRun(input: GetDirectorPhaseRunRepositoryInput): Promise<DirectorPhaseRun | undefined>
  getPhaseRunForWorker(runId: string): Promise<DirectorPhaseRunForWorker | undefined>
  markPhaseRunRunning(input: { runId: string; now?: string }): Promise<DirectorPhaseRun | undefined>
  setPhaseRunProgress(input: DirectorPhaseRunProgressInput): Promise<DirectorPhaseRun | undefined>
  completePhaseRun(input: DirectorPhaseRunCompletionInput): Promise<DirectorPhaseRun | undefined>
  failPhaseRun(input: DirectorPhaseRunFailureInput): Promise<DirectorPhaseRun | undefined>
}
