import { CreativeAssetRepositoryError } from '@bailian-studio/creative-asset-repository'
import type {
  AddCreativeAssetReferenceRepositoryInput,
  ArchiveCreativeAssetRepositoryInput,
  AttachCreativeAssetRepositoryInput,
  CreateCreativeAssetRepositoryInput,
  CreateCreativeAssetVersionFromGenerationRepositoryInput,
  CreateCreativeAssetVersionRepositoryInput,
  CreateCreativeProjectRepositoryInput,
  CreativeAssetDetail,
  CreativeAssetRepository,
  CreativeProjectDetail,
  DetachCreativeAssetRepositoryInput,
  GetCreativeAssetRepositoryInput,
  GetCreativeProjectRepositoryInput,
  ListCreativeAssetsRepositoryInput,
  ListCreativeAssetsResult,
  ListCreativeProjectsRepositoryInput,
  ListCreativeProjectsResult,
  RemoveCreativeAssetReferenceRepositoryInput,
  TransitionCreativeAssetVersionRepositoryInput,
} from '@bailian-studio/creative-asset-repository'

/**
 * 创意资产 HTTP 之外的应用层边界。
 *
 * 路由只负责认证、输入 schema 和响应整形；这里负责把当前用户的身份
 * 带入所有资产操作，并统一处理“按用户查不到资源”的公开错误语义。
 * repository 继续负责事务、锁、软删除和状态机不变量。
 */
export interface CreativeAssetUseCases {
  listProjects(input: ListCreativeProjectsRepositoryInput): Promise<ListCreativeProjectsResult>
  createProject(input: CreateCreativeProjectRepositoryInput): Promise<CreativeProjectDetail>
  getProject(input: GetCreativeProjectRepositoryInput): Promise<CreativeProjectDetail>
  updateProject(input: Parameters<CreativeAssetRepository['updateProject']>[0]): ReturnType<CreativeAssetRepository['updateProject']>
  attachAsset(input: AttachCreativeAssetRepositoryInput): Promise<CreativeAssetDetail>
  detachAsset(input: DetachCreativeAssetRepositoryInput): Promise<CreativeProjectDetail>
  listAssets(input: ListCreativeAssetsRepositoryInput): Promise<ListCreativeAssetsResult>
  createAsset(input: CreateCreativeAssetRepositoryInput): Promise<CreativeAssetDetail>
  getAsset(input: GetCreativeAssetRepositoryInput): Promise<CreativeAssetDetail>
  archiveAsset(input: ArchiveCreativeAssetRepositoryInput): Promise<CreativeAssetDetail>
  createVersion(input: CreateCreativeAssetVersionRepositoryInput): Promise<CreativeAssetDetail>
  createVersionFromGeneration(input: CreateCreativeAssetVersionFromGenerationRepositoryInput): Promise<CreativeAssetDetail>
  addReference(input: AddCreativeAssetReferenceRepositoryInput): Promise<CreativeAssetDetail>
  removeReference(input: RemoveCreativeAssetReferenceRepositoryInput): Promise<CreativeAssetDetail>
  transitionVersion(input: TransitionCreativeAssetVersionRepositoryInput): Promise<CreativeAssetDetail>
}

export interface CreativeAssetUseCaseDependencies {
  repository: CreativeAssetRepository
}

function projectNotFound(projectId: string): CreativeAssetRepositoryError {
  return new CreativeAssetRepositoryError('CREATIVE_PROJECT_NOT_FOUND', `Creative project not found: ${projectId}`)
}

function assetNotFound(assetId: string): CreativeAssetRepositoryError {
  return new CreativeAssetRepositoryError('CREATIVE_ASSET_NOT_FOUND', `Creative asset not found: ${assetId}`)
}

export function createCreativeAssetUseCases({ repository }: CreativeAssetUseCaseDependencies): CreativeAssetUseCases {
  return {
    listProjects: input => repository.listProjects(input),
    createProject: input => repository.createProject(input),
    async getProject(input) {
      const project = await repository.getProject(input)
      if (project === undefined) throw projectNotFound(input.projectId)
      return project
    },
    updateProject: input => repository.updateProject(input),
    attachAsset: input => repository.attachAsset(input),
    detachAsset: input => repository.detachAsset(input),
    listAssets: input => repository.listAssets(input),
    createAsset: input => repository.createAsset(input),
    async getAsset(input) {
      const asset = await repository.getAsset(input)
      if (asset === undefined) throw assetNotFound(input.assetId)
      return asset
    },
    archiveAsset: input => repository.archiveAsset(input),
    createVersion: input => repository.createVersion(input),
    createVersionFromGeneration: input => repository.createVersionFromGeneration(input),
    addReference: input => repository.addReference(input),
    removeReference: input => repository.removeReference(input),
    transitionVersion: input => repository.transitionVersion(input),
  }
}
