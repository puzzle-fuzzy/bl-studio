import type {
  DirectorEntityCandidate,
  DirectorEntityCandidateKind,
  CreateDirectorPhaseRunInput,
  CreateDirectorProjectInput,
  AttachDirectorAssetInput,
  DirectorAsset,
  DirectorPhase,
  DirectorPhaseRun,
	DirectorPhaseState,
	DirectorCharacter,
  DirectorLocation,
  DirectorShot,
  DirectorProjectDetail,
  DirectorProjectProgress,
  DirectorProjectStatus,
	DirectorProjectSummary,
	DirectorScriptVersion,
	DirectorScriptVersionSummary,
	DirectorScriptMessage,
  UpdateDirectorProjectInput,
  UpdateDirectorShotInput,
  DirectorAssemblyPreflight,
  DirectorAssemblySettingsInput,
} from '@bailian-studio/director-contracts'

export type { AttachDirectorAssetInput, CreateDirectorPhaseRunInput, CreateDirectorProjectInput, UpdateDirectorProjectInput }
export type { UpdateDirectorShotInput }

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

export interface ListDirectorScriptMessagesRepositoryInput {
	userId: string
	projectId: string
	limit?: number
}

export interface ListDirectorScriptVersionsRepositoryInput {
	userId: string
	projectId: string
}

export interface GetDirectorScriptVersionRepositoryInput {
	userId: string
	projectId: string
	versionId: string
}

export interface ApplyDirectorScriptChatRepositoryInput {
	userId: string
	projectId: string
	runId: string
	screenplay: string
	synopsis: string | null
	reply: string
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
  shotId?: string
  traceId?: string
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
  assets: DirectorAsset[]
}

export interface AttachDirectorAssetRepositoryInput extends AttachDirectorAssetInput {
  userId: string
  projectId: string
}

export interface DetachDirectorAssetRepositoryInput {
  userId: string
  projectId: string
  directorAssetId: string
}

export interface UpdateDirectorShotRepositoryInput {
  userId: string
  projectId: string
  shotId: string
  patch: UpdateDirectorShotInput
}

export interface GetDirectorAssemblyPreflightRepositoryInput {
  userId: string
  projectId: string
  settings?: DirectorAssemblySettingsInput
}

export interface StartDirectorShotVideoRepositoryInput {
  userId: string
  projectId: string
  shotId: string
  generationId: string
  now?: string
}

export interface MarkDirectorShotVideoFailedRepositoryInput {
  generationId: string
  error: { code?: string; message: string }
  now?: string
}

export interface FinalizeDirectorShotVideoRepositoryInput {
  generationId: string
  now?: string
}

export interface FinalizeDirectorMusicRepositoryInput {
  userId: string
  projectId: string
  phaseRunId: string
  generationId: string
  now?: string
}

export interface FinalizeDirectorAssemblyRepositoryInput {
  userId: string
  projectId: string
  phaseRunId: string
  mediaJobId: string
  outputAssetId: string
  now?: string
}

export interface ListDirectorProjectsResult {
  items: DirectorProjectRepositorySummary[]
  nextCursor?: string
}

export interface DirectorRepository {
  createProject(input: CreateDirectorProjectRepositoryInput): Promise<DirectorProjectRepositoryDetail>
  listProjects(input: ListDirectorProjectsRepositoryInput): Promise<ListDirectorProjectsResult>
	getProject(input: GetDirectorProjectRepositoryInput): Promise<DirectorProjectRepositoryDetail | undefined>
	listScriptMessages(input: ListDirectorScriptMessagesRepositoryInput): Promise<DirectorScriptMessage[]>
	listScriptVersions(input: ListDirectorScriptVersionsRepositoryInput): Promise<DirectorScriptVersionSummary[]>
	getScriptVersion(input: GetDirectorScriptVersionRepositoryInput): Promise<DirectorScriptVersion | undefined>
  updateProject(input: UpdateDirectorProjectRepositoryInput): Promise<DirectorProjectRepositoryDetail>
  attachAsset(input: AttachDirectorAssetRepositoryInput): Promise<DirectorAsset>
  detachAsset(input: DetachDirectorAssetRepositoryInput): Promise<DirectorProjectRepositoryDetail>
  updateShot(input: UpdateDirectorShotRepositoryInput): Promise<DirectorShot>
  getAssemblyPreflight(input: GetDirectorAssemblyPreflightRepositoryInput): Promise<DirectorAssemblyPreflight | undefined>
  startShotVideo(input: StartDirectorShotVideoRepositoryInput): Promise<DirectorShot>
  markShotVideoFailed(input: MarkDirectorShotVideoFailedRepositoryInput): Promise<boolean>
  finalizeShotVideo(input: FinalizeDirectorShotVideoRepositoryInput): Promise<boolean>
  finalizeDirectorMusic(input: FinalizeDirectorMusicRepositoryInput): Promise<DirectorAsset | undefined>
  finalizeDirectorAssembly(input: FinalizeDirectorAssemblyRepositoryInput): Promise<DirectorAsset | undefined>
	requestPhaseRun(input: RequestDirectorPhaseRunRepositoryInput): Promise<DirectorPhaseRun>
	applyScriptChat(input: ApplyDirectorScriptChatRepositoryInput): Promise<void>
  getPhaseRun(input: GetDirectorPhaseRunRepositoryInput): Promise<DirectorPhaseRun | undefined>
  getPhaseRunForWorker(runId: string): Promise<DirectorPhaseRunForWorker | undefined>
  markPhaseRunRunning(input: { runId: string; now?: string }): Promise<DirectorPhaseRun | undefined>
  setPhaseRunProgress(input: DirectorPhaseRunProgressInput): Promise<DirectorPhaseRun | undefined>
  completePhaseRun(input: DirectorPhaseRunCompletionInput): Promise<DirectorPhaseRun | undefined>
  failPhaseRun(input: DirectorPhaseRunFailureInput): Promise<DirectorPhaseRun | undefined>
  listEntityCandidates(input: ListEntityCandidatesInput): Promise<DirectorEntityCandidate[]>
  createEntityCandidates(input: CreateEntityCandidatesInput): Promise<DirectorEntityCandidate[]>
  reviewEntityCandidate(input: ReviewEntityCandidateInput): Promise<DirectorEntityCandidate | undefined>
  deleteEntityCandidate(input: { userId: string; candidateId: string }): Promise<boolean>
}

export interface ListEntityCandidatesInput {
  userId: string
  projectId: string
  status?: DirectorEntityCandidate['status']
  kind?: DirectorEntityCandidateKind
}

export interface CreateEntityCandidateData {
  kind: DirectorEntityCandidateKind
  name: string
  description: string
  traits: string[]
  mentions: Array<{ text: string; start: number; end: number }>
}

export interface CreateEntityCandidatesInput {
  userId: string
  projectId: string
  sourceRunId?: string
  candidates: CreateEntityCandidateData[]
}

export interface ReviewEntityCandidateInput {
  userId: string
  candidateId: string
  status: 'accepted' | 'rejected'
}
