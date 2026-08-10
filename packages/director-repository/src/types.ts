import type {
  CreateDirectorProjectInput,
  DirectorPhaseState,
  DirectorProjectDetail,
  DirectorProjectProgress,
  DirectorProjectStatus,
  DirectorProjectSummary,
  UpdateDirectorProjectInput,
} from '@bailian-studio/shared'

export type { CreateDirectorProjectInput, UpdateDirectorProjectInput }

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

export interface DirectorProjectRepositorySummary extends DirectorProjectSummary {
  status: DirectorProjectStatus
  progress: DirectorProjectProgress
}

export interface DirectorProjectRepositoryDetail extends DirectorProjectDetail {
  phases: DirectorPhaseState[]
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
}
