import { z } from 'zod'

/**
 * 创意资产域的协议版本。
 *
 * 这个版本描述的是“语义资产如何被引用”，不是 provider 的请求格式。
 * provider adapter 可以把同一个协议翻译成不同模型需要的输入顺序和参数名。
 */
export const CREATIVE_ASSET_PROTOCOL_VERSION = 1 as const

export const CREATIVE_ASSET_TYPES = ['character', 'environment', 'prop', 'style'] as const
export const CreativeAssetTypeSchema = z.enum(CREATIVE_ASSET_TYPES)
export type CreativeAssetType = z.infer<typeof CreativeAssetTypeSchema>

export const CREATIVE_ASSET_STATUSES = ['draft', 'active', 'archived'] as const
export const CreativeAssetStatusSchema = z.enum(CREATIVE_ASSET_STATUSES)
export type CreativeAssetStatus = z.infer<typeof CreativeAssetStatusSchema>

export const CREATIVE_ASSET_VERSION_STATUSES = [
  'draft',
  'generating',
  'candidate',
  'approved',
  'archived',
  'rejected',
] as const
export const CreativeAssetVersionStatusSchema = z.enum(CREATIVE_ASSET_VERSION_STATUSES)
export type CreativeAssetVersionStatus = z.infer<typeof CreativeAssetVersionStatusSchema>

export const CREATIVE_PROJECT_STATUSES = ['draft', 'active', 'archived'] as const
export const CreativeProjectStatusSchema = z.enum(CREATIVE_PROJECT_STATUSES)
export type CreativeProjectStatus = z.infer<typeof CreativeProjectStatusSchema>

/**
 * 参考图的语义角色。角色和环境使用的 role 集合不同，但统一存储，
 * 使资产引用可以被 provider adapter 按需翻译，而不依赖文件名或数组顺序。
 */
export const CREATIVE_ASSET_REFERENCE_ROLES = [
  'front',
  'three_quarter',
  'side',
  'back',
  'full_body',
  'medium',
  'face_closeup',
  'wide',
  'detail',
  'isolated',
  'interaction',
  'mask',
  'style_board',
  'other',
] as const
export const CreativeAssetReferenceRoleSchema = z.enum(CREATIVE_ASSET_REFERENCE_ROLES)
export type CreativeAssetReferenceRole = z.infer<typeof CreativeAssetReferenceRoleSchema>

export const CREATIVE_GENERATION_PURPOSES = [
  'asset_reference_sheet',
  'asset_variant',
  'shot_image',
  'shot_video',
  'utility',
] as const
export const CreativeGenerationPurposeSchema = z.enum(CREATIVE_GENERATION_PURPOSES)
export type CreativeGenerationPurpose = z.infer<typeof CreativeGenerationPurposeSchema>

export const CREATIVE_GENERATION_BINDING_ROLES = [
  'character',
  'environment',
  'prop',
  'style',
] as const
export const CreativeGenerationBindingRoleSchema = z.enum(CREATIVE_GENERATION_BINDING_ROLES)
export type CreativeGenerationBindingRole = z.infer<typeof CreativeGenerationBindingRoleSchema>

const CreativeTextArraySchema = z.array(z.string().trim().min(1).max(500)).max(100)

/**
 * 资产语义描述采用稳定的核心字段 + 可扩展字段。
 * 核心字段用于跨模型复用；catchall 为不同资产类型保留扩展空间，避免把
 * 服装、空间锚点、材质等领域信息硬编码成一套无法演进的表结构。
 */
export const CreativeAssetSemanticSpecSchema = z.object({
  identity: z.record(z.string(), z.unknown()).optional(),
  appearance: z.record(z.string(), z.unknown()).optional(),
  state: z.record(z.string(), z.unknown()).optional(),
  spatialAnchors: CreativeTextArraySchema.optional(),
  constraints: CreativeTextArraySchema.optional(),
}).catchall(z.unknown())
export type CreativeAssetSemanticSpec = z.infer<typeof CreativeAssetSemanticSpecSchema>

export const CreativeAssetReferenceMetadataSchema = z.object({
  angle: z.string().trim().max(120).optional(),
  shotSize: z.string().trim().max(120).optional(),
  lighting: z.string().trim().max(200).optional(),
  aspectRatio: z.string().trim().max(32).optional(),
  source: z.enum(['uploaded', 'generated', 'derived', 'imported']).optional(),
  notes: z.string().trim().max(2_000).optional(),
}).catchall(z.unknown())
export type CreativeAssetReferenceMetadata = z.infer<typeof CreativeAssetReferenceMetadataSchema>

export const CreateCreativeProjectSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2_000).optional(),
}).strict()
export type CreateCreativeProjectInput = z.infer<typeof CreateCreativeProjectSchema>

export const CreateCreativeProjectAssetSchema = z.object({
  projectId: z.string().trim().min(1).max(256),
  assetId: z.string().trim().min(1).max(256),
  sortOrder: z.number().int().nonnegative().max(1_000_000).default(0),
}).strict()
export type CreateCreativeProjectAssetInput = z.infer<typeof CreateCreativeProjectAssetSchema>

export const CreateCreativeAssetSchema = z.object({
  type: CreativeAssetTypeSchema,
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
}).strict()
export type CreateCreativeAssetInput = z.infer<typeof CreateCreativeAssetSchema>

export const CreateCreativeAssetVersionSchema = z.object({
  assetId: z.string().trim().min(1).max(256),
  semanticSpec: CreativeAssetSemanticSpecSchema.default({}),
  generationRecipe: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().trim().max(2_000).optional(),
}).strict()
export type CreateCreativeAssetVersionInput = z.infer<typeof CreateCreativeAssetVersionSchema>

const CreateCreativeAssetVersionFromGenerationReferenceSchema = z.object({
  artifactId: z.string().trim().min(1).max(256),
  role: CreativeAssetReferenceRoleSchema,
  position: z.number().int().nonnegative().max(100).default(0),
  metadata: CreativeAssetReferenceMetadataSchema.default({}),
}).strict()

/**
 * 把已完成生成的图片产物收录为一个创意资产版本。
 *
 * artifactId 必须属于 sourceGenerationId，服务端会在同一事务内解析为
 * 已持久化且属于当前用户的 user_asset，再创建版本和参考图绑定；客户端
 * 不需要也不应该猜测 asset_generation_* 的投影 ID。
 */
export const CreateCreativeAssetVersionFromGenerationSchema = z.object({
  sourceGenerationId: z.string().trim().min(1).max(256),
  semanticSpec: CreativeAssetSemanticSpecSchema.default({}),
  generationRecipe: z.record(z.string(), z.unknown()).default({}),
  notes: z.string().trim().max(2_000).optional(),
  references: z.array(CreateCreativeAssetVersionFromGenerationReferenceSchema).min(1).max(20),
}).strict().superRefine((input, context) => {
  const occupiedSlots = new Set<string>()
  const artifactIds = new Set<string>()
  for (const [index, reference] of input.references.entries()) {
    const slot = `${reference.role}:${reference.position}`
    if (occupiedSlots.has(slot)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['references', index, 'position'],
        message: `duplicate reference role and position: ${slot}`,
      })
    }
    occupiedSlots.add(slot)
    if (artifactIds.has(reference.artifactId)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['references', index, 'artifactId'],
        message: 'duplicate artifact id',
      })
    }
    artifactIds.add(reference.artifactId)
  }
})
export type CreateCreativeAssetVersionFromGenerationInput = z.infer<typeof CreateCreativeAssetVersionFromGenerationSchema>

export const CreateCreativeAssetReferenceSchema = z.object({
  assetVersionId: z.string().trim().min(1).max(256),
  userAssetId: z.string().trim().min(1).max(256),
  role: CreativeAssetReferenceRoleSchema,
  position: z.number().int().nonnegative().default(0),
  metadata: CreativeAssetReferenceMetadataSchema.default({}),
}).strict()
export type CreateCreativeAssetReferenceInput = z.infer<typeof CreateCreativeAssetReferenceSchema>

export const CreativeGenerationBindingSchema = z.object({
  assetVersionId: z.string().trim().min(1).max(256),
  role: CreativeGenerationBindingRoleSchema,
  position: z.number().int().nonnegative().default(0),
  /** 明确本次 provider 请求使用资产版本中的哪些参考图。 */
  referenceIds: z.array(z.string().trim().min(1).max(256)).max(20).default([]),
}).strict().superRefine((binding, context) => {
  if (new Set(binding.referenceIds).size !== binding.referenceIds.length) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['referenceIds'],
      message: 'duplicate reference id',
    })
  }
})
export type CreativeGenerationBinding = z.infer<typeof CreativeGenerationBindingSchema>

export const CreativeGenerationBindingsSchema = z.array(CreativeGenerationBindingSchema).max(50).superRefine((bindings, context) => {
  const positions = new Set<string>()
  for (const [index, binding] of bindings.entries()) {
    const key = `${binding.role}:${binding.position}`
    if (positions.has(key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [index, 'position'],
        message: `duplicate binding position for ${binding.role}`,
      })
    }
    positions.add(key)
  }
})

export const CreativeGenerationContextSchema = z.object({
  protocolVersion: z.literal(CREATIVE_ASSET_PROTOCOL_VERSION).default(CREATIVE_ASSET_PROTOCOL_VERSION),
  purpose: CreativeGenerationPurposeSchema,
  /** 用于在项目工作区中检索这次生成；不改变资产跨项目复用能力。 */
  projectId: z.string().trim().min(1).max(256).optional(),
  prompt: z.string().trim().max(8_000).default(''),
  negativePrompt: z.string().trim().max(4_000).optional(),
  modelId: z.string().trim().min(1).max(256).optional(),
  assetBindings: CreativeGenerationBindingsSchema.default([]),
  recipe: z.record(z.string(), z.unknown()).default({}),
  capabilitySnapshot: z.record(z.string(), z.unknown()).default({}),
}).strict()
export type CreativeGenerationContext = z.infer<typeof CreativeGenerationContextSchema>

/**
 * 生成上下文的稳定形态。槽位由 role + position 定义，因此 fingerprint 和
 * provider adapter 不应依赖调用方传入的数组排列；每个槽位内的参考图顺序
 * 则保留，因为某些模型把多图顺序作为条件的一部分。
 */
export function normalizeCreativeGenerationContext(input: unknown): CreativeGenerationContext {
  const parsed = CreativeGenerationContextSchema.parse(input)
  return {
    ...parsed,
    assetBindings: [...parsed.assetBindings]
      .sort((left, right) => left.role.localeCompare(right.role) || left.position - right.position)
      .map(binding => ({
        ...binding,
        referenceIds: [...binding.referenceIds],
      })),
  }
}

/**
 * 约束资产类型与参考图 role 的组合，供 API/repository 在跨表校验时使用。
 * 数据库只能校验 role 是否在总集合内，具体兼容性必须在业务层检查。
 */
const REFERENCE_ROLE_TYPES: Record<CreativeAssetReferenceRole, readonly CreativeAssetType[]> = {
  front: ['character'],
  three_quarter: ['character'],
  side: ['character'],
  back: ['character'],
  full_body: ['character'],
  medium: ['character', 'environment'],
  face_closeup: ['character'],
  wide: ['environment'],
  detail: ['environment', 'prop'],
  isolated: ['prop'],
  interaction: ['prop'],
  mask: ['character', 'environment', 'prop'],
  style_board: ['style'],
  other: ['character', 'environment', 'prop', 'style'],
}

export function isCreativeAssetReferenceRoleCompatible(
  assetType: CreativeAssetType,
  role: CreativeAssetReferenceRole,
): boolean {
  return REFERENCE_ROLE_TYPES[role].includes(assetType)
}
