import type {
  CreativeAssetReferenceRole,
  CreativeAssetType,
  CreativeAssetVersionStatus,
  CreativeGenerationContext,
  CreativeGenerationPurpose,
  CreativeGenerationBindingRole,
} from '@bailian-studio/creative-asset-contracts'
import type { FrozenModelManifest } from '@bailian-studio/dashscope-manifests'

export type CreativeAssetCompilerMediaKind = 'image' | 'video' | 'audio'

export interface CreativeAssetCompilerReferenceInput {
  id: string
  userAssetId: string
  mediaKind: CreativeAssetCompilerMediaKind
  role?: CreativeAssetReferenceRole
}

/**
 * 由 asset service/repository 解析出的最小只读快照。
 * compiler 不查询数据库，因此调用方必须先完成 ownership、approved 状态和参考图归属校验。
 */
export interface ApprovedCreativeAssetBindingInput {
  assetVersionId: string
  assetVersionStatus: CreativeAssetVersionStatus
  assetType: CreativeAssetType
  role: CreativeGenerationBindingRole
  position: number
  referenceIds: readonly string[]
  references: readonly CreativeAssetCompilerReferenceInput[]
}

export interface CompileCreativeGenerationInput {
  manifest: FrozenModelManifest
  purpose: CreativeGenerationPurpose
  prompt: string
  negativePrompt?: string
  projectId?: string
  parameterValues?: Readonly<Record<string, unknown>>
  bindings?: readonly ApprovedCreativeAssetBindingInput[]
  recipe?: Readonly<Record<string, unknown>>
  capabilitySnapshot?: Readonly<Record<string, unknown>>
  /** 多个同类型媒体参数时由上层显式选择；缺省时 compiler 只接受唯一候选。 */
  mediaParameterName?: string
}

export interface CompiledCreativeGenerationReference {
  referenceId: string
  userAssetId: string
  assetVersionId: string
  role: CreativeGenerationBindingRole
  parameterName: string
  position: number
}

export interface CompiledCreativeGeneration {
  modelId: string
  params: Record<string, unknown>
  assetRefs: Record<string, string[]>
  creativeContext: CreativeGenerationContext
  selectedReferences: readonly CompiledCreativeGenerationReference[]
}
