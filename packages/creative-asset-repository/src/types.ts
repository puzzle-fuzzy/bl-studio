import type {
  CreateCreativeAssetInput,
  CreateCreativeAssetReferenceInput,
  CreateCreativeAssetVersionFromGenerationInput,
  CreateCreativeAssetVersionInput,
  CreateCreativeProjectInput,
  CreativeAssetReferenceMetadata,
  CreativeAssetSemanticSpec,
  CreativeAssetStatus,
  CreativeAssetType,
  CreativeAssetVersionStatus,
  CreativeGenerationContext,
  CreativeGenerationBindingRole,
  CreativeAssetReferenceRole,
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
  /** 内部查询投影；API 层会把它转换成带短期签名 URL 的 preview。 */
  previewSource?: CreativeAssetPreviewSource
}

export interface CreativeAssetPreviewSource {
  userAssetId: string
  kind: 'image' | 'video' | 'audio'
  originalUrl?: string
  storageUrl?: string
  storageProvider?: string
  storageKey?: string
  thumbnailStatus?: 'queued' | 'processing' | 'ready' | 'failed'
  thumbnailStorageProvider?: string
  thumbnailStorageKey?: string
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
  /** 内部查询投影；API 层会把它转换成带短期签名 URL 的 preview。 */
  previewSource?: CreativeAssetPreviewSource
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

export interface CreateCreativeAssetVersionFromGenerationRepositoryInput {
  userId: string
  assetId: string
  sourceGenerationId: string
  semanticSpec: CreateCreativeAssetVersionFromGenerationInput['semanticSpec']
  generationRecipe: CreateCreativeAssetVersionFromGenerationInput['generationRecipe']
  notes?: string
  references: CreateCreativeAssetVersionFromGenerationInput['references']
  now?: string
}

export interface AddCreativeAssetReferenceRepositoryInput extends CreateCreativeAssetReferenceInput {
  userId: string
  now?: string
}

export interface RemoveCreativeAssetReferenceRepositoryInput {
  userId: string
  assetVersionId: string
  referenceId: string
  now?: string
}

export interface TransitionCreativeAssetVersionRepositoryInput {
  userId: string
  assetVersionId: string
  status: CreativeAssetVersionStatus
  now?: string
}

/**
 * compiler 所需的已批准资产绑定解析结果。
 *
 * repository 只返回已通过 owner、状态、软删除和引用归属校验的数据；
 * provider/编译器不应自行查询数据库，也不应接收整份资产详情。
 */
export interface ResolvedCreativeGenerationReference {
  id: string
  userAssetId: string
  mediaKind: 'image' | 'video' | 'audio'
  role: CreativeAssetReferenceRole
}

export interface ResolvedCreativeGenerationBinding {
  assetVersionId: string
  assetVersionStatus: CreativeAssetVersionStatus
  assetType: CreativeAssetType
  role: CreativeGenerationBindingRole
  position: number
  referenceIds: readonly string[]
  references: readonly ResolvedCreativeGenerationReference[]
}

export interface ResolveCreativeGenerationBindingsRepositoryInput {
  userId: string
  context: CreativeGenerationContext
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
  createVersionFromGeneration(input: CreateCreativeAssetVersionFromGenerationRepositoryInput): Promise<CreativeAssetDetail>
  addReference(input: AddCreativeAssetReferenceRepositoryInput): Promise<CreativeAssetDetail>
  removeReference(input: RemoveCreativeAssetReferenceRepositoryInput): Promise<CreativeAssetDetail>
  transitionVersion(input: TransitionCreativeAssetVersionRepositoryInput): Promise<CreativeAssetDetail>
  resolveGenerationBindings(input: ResolveCreativeGenerationBindingsRepositoryInput): Promise<ResolvedCreativeGenerationBinding[]>
}
