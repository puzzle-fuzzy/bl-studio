import type {
  CreateCreativeAssetInput,
  CreateCreativeAssetReferenceInput,
  CreateCreativeAssetVersionInput,
  CreateCreativeProjectInput,
  CreativeAssetReferenceMetadata,
  CreativeAssetSemanticSpec,
  CreativeAssetStatus,
  CreativeAssetType,
  CreativeAssetVersionStatus,
  CreativeProjectStatus,
} from '@bailian-studio/shared'

export interface CreativeProject {
  id: string
  userId: string
  title: string
  description: string | null
  status: CreativeProjectStatus
  createdAt: string
  updatedAt: string
}

export interface CreativeProjectAssetMembership {
  id: string
  projectId: string
  assetId: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CreativeAssetReference {
  id: string
  assetVersionId: string
  userAssetId: string
  role: CreateCreativeAssetReferenceInput['role']
  position: number
  metadata: CreativeAssetReferenceMetadata
  createdAt: string
  updatedAt: string
}

export interface CreativeAssetVersion {
  id: string
  assetId: string
  sourceGenerationId?: string
  version: number
  status: CreativeAssetVersionStatus
  semanticSpec: CreativeAssetSemanticSpec
  generationRecipe: Record<string, unknown>
  notes?: string
  references: CreativeAssetReference[]
  createdAt: string
  updatedAt: string
}

export interface CreativeAssetSummary {
  id: string
  userId: string
  type: CreativeAssetType
  name: string
  description: string
  status: CreativeAssetStatus
  metadata: Record<string, unknown>
  latestVersion?: {
    id: string
    version: number
    status: CreativeAssetVersionStatus
  }
  approvedVersionId?: string
  createdAt: string
  updatedAt: string
}

export interface CreativeAssetDetail extends CreativeAssetSummary {
  projects: CreativeProjectAssetMembership[]
  versions: CreativeAssetVersion[]
}

export interface CreativeProjectDetail extends CreativeProject {
  assets: CreativeAssetSummary[]
}

export interface CreateCreativeProjectRepositoryInput extends CreateCreativeProjectInput {
  userId: string
  now?: string
}

export interface ListCreativeProjectsRepositoryInput {
  userId: string
  limit?: number
  cursor?: string
  query?: string
}

export interface GetCreativeProjectRepositoryInput {
  userId: string
  projectId: string
}

export interface UpdateCreativeProjectRepositoryInput {
  userId: string
  projectId: string
  patch: {
    title?: string
    description?: string
    status?: CreativeProjectStatus
  }
  now?: string
}

export interface CreateCreativeAssetRepositoryInput extends CreateCreativeAssetInput {
  userId: string
  projectId?: string
  now?: string
}

export interface ListCreativeAssetsRepositoryInput {
  userId: string
  projectId?: string
  type?: CreativeAssetType
  query?: string
  limit?: number
  cursor?: string
}

export interface GetCreativeAssetRepositoryInput {
  userId: string
  assetId: string
}

export interface AttachCreativeAssetRepositoryInput {
  userId: string
  projectId: string
  assetId: string
  sortOrder?: number
  now?: string
}

export interface DetachCreativeAssetRepositoryInput {
  userId: string
  projectId: string
  assetId: string
  now?: string
}

export interface CreateCreativeAssetVersionRepositoryInput extends CreateCreativeAssetVersionInput {
  userId: string
  now?: string
}

export interface AddCreativeAssetReferenceRepositoryInput extends CreateCreativeAssetReferenceInput {
  userId: string
  now?: string
}

export interface TransitionCreativeAssetVersionRepositoryInput {
  userId: string
  assetVersionId: string
  status: CreativeAssetVersionStatus
  now?: string
}

export interface ArchiveCreativeAssetRepositoryInput {
  userId: string
  assetId: string
  now?: string
}

export interface ListCreativeProjectsResult {
  items: CreativeProject[]
  nextCursor?: string
}

export interface ListCreativeAssetsResult {
  items: CreativeAssetSummary[]
  nextCursor?: string
}

export interface CreativeAssetRepository {
  createProject(input: CreateCreativeProjectRepositoryInput): Promise<CreativeProjectDetail>
  listProjects(input: ListCreativeProjectsRepositoryInput): Promise<ListCreativeProjectsResult>
  getProject(input: GetCreativeProjectRepositoryInput): Promise<CreativeProjectDetail | undefined>
  updateProject(input: UpdateCreativeProjectRepositoryInput): Promise<CreativeProjectDetail>
  createAsset(input: CreateCreativeAssetRepositoryInput): Promise<CreativeAssetDetail>
  listAssets(input: ListCreativeAssetsRepositoryInput): Promise<ListCreativeAssetsResult>
  getAsset(input: GetCreativeAssetRepositoryInput): Promise<CreativeAssetDetail | undefined>
  archiveAsset(input: ArchiveCreativeAssetRepositoryInput): Promise<CreativeAssetDetail>
  attachAsset(input: AttachCreativeAssetRepositoryInput): Promise<CreativeAssetDetail>
  detachAsset(input: DetachCreativeAssetRepositoryInput): Promise<CreativeProjectDetail>
  createVersion(input: CreateCreativeAssetVersionRepositoryInput): Promise<CreativeAssetDetail>
  addReference(input: AddCreativeAssetReferenceRepositoryInput): Promise<CreativeAssetDetail>
  transitionVersion(input: TransitionCreativeAssetVersionRepositoryInput): Promise<CreativeAssetDetail>
}
