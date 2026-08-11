/**
 * Bailian Studio API 线缆契约的 Zod schema 镜像。
 *
 * api-client 对每个响应都用这里的 schema 校验，从而端到端地把传输层类型化，
 * 全程无需 `as` 强转：`fetch().json()` 一律视为 `unknown`，只有 `.parse()`
 * 成功才能得到带类型的值。
 *
 * 这些类型【刻意】只定义在本包里（而不从 @bailian-studio/model-core 导入），以保持
 * api-client 是一个纯粹的传输层，仅依赖 @bailian-studio/shared + zod。
 */
import { z } from 'zod'
import {
  CreateDirectorProjectSchema,
  CreateDirectorPhaseRunSchema,
  DirectorVideoEstimateResponseSchema,
  DirectorMusicEstimateResponseSchema,
  DirectorMusicEstimateSchema,
  DirectorAssemblyPreflightResponseSchema,
  AttachDirectorAssetSchema,
  DirectorAnalysisResultSchema,
  DirectorAssetResponseSchema,
  DirectorAssetSchema,
  DirectorShotDraftSchema,
  DirectorShotSchema,
  DirectorShotResponseSchema,
  DirectorStoryboardResultSchema,
  DirectorContinuityResultSchema,
  DirectorPromptRebuildResultSchema,
  DirectorDialogueResultSchema,
  UpdateDirectorShotSchema,
  DirectorCharacterDraftSchema,
  DirectorCharactersResultSchema,
  DirectorLocationDraftSchema,
  DirectorLocationsResultSchema,
  DirectorPhaseRunResponseSchema,
  DirectorPhaseRunSchema,
  DirectorProjectDetailSchema,
  DirectorProjectListResponseSchema,
  DirectorProjectResponseSchema,
  UpdateDirectorProjectSchema,
  type CreateDirectorProjectInput,
  type CreateDirectorPhaseRunInput,
  type DirectorVideoEstimate,
  type DirectorMusicEstimate,
  type DirectorAssemblyPreflight,
  type AttachDirectorAssetInput,
  type DirectorAsset,
  type DirectorShot,
  type DirectorShotDraft,
  type DirectorStoryboardResult,
  type DirectorContinuityResult,
  type DirectorPromptRebuildResult,
  type DirectorDialogueResult,
  type UpdateDirectorShotInput,
  type DirectorPhaseRun,
  type DirectorPhaseRunStatus,
  type DirectorAnalysisResult,
  type DirectorCharacterDraft,
  type DirectorCharacter,
  type DirectorCharactersResult,
  type DirectorLocationDraft,
  type DirectorLocation,
  type DirectorLocationsResult,
  type DirectorProjectDetail,
  type DirectorProjectListResult,
  type DirectorProjectSummary,
  type DirectorScriptVersion,
  type UpdateDirectorProjectInput,
} from '@bailian-studio/shared'

export {
  CreateDirectorPhaseRunSchema,
  DirectorVideoEstimateResponseSchema,
  DirectorMusicEstimateResponseSchema,
  DirectorMusicEstimateSchema,
  DirectorAssemblyPreflightResponseSchema,
  AttachDirectorAssetSchema,
  DirectorAnalysisResultSchema,
  DirectorAssetResponseSchema,
  DirectorAssetSchema,
  DirectorShotDraftSchema,
  DirectorShotSchema,
  DirectorShotResponseSchema,
  DirectorStoryboardResultSchema,
  DirectorContinuityResultSchema,
  DirectorPromptRebuildResultSchema,
  DirectorDialogueResultSchema,
  UpdateDirectorShotSchema,
  DirectorCharacterDraftSchema,
  DirectorCharactersResultSchema,
  DirectorLocationDraftSchema,
  DirectorLocationsResultSchema,
  CreateDirectorProjectSchema,
  DirectorProjectDetailSchema,
  DirectorProjectListResponseSchema,
  DirectorProjectResponseSchema,
  DirectorPhaseRunResponseSchema,
  DirectorPhaseRunSchema,
  UpdateDirectorProjectSchema,
}
export type {
  CreateDirectorPhaseRunInput,
  DirectorVideoEstimate,
  DirectorMusicEstimate,
  DirectorAssemblyPreflight,
  AttachDirectorAssetInput,
  DirectorAnalysisResult,
  DirectorAsset,
  DirectorShot,
  DirectorShotDraft,
  DirectorStoryboardResult,
  DirectorContinuityResult,
  DirectorPromptRebuildResult,
  DirectorDialogueResult,
  UpdateDirectorShotInput,
  DirectorCharacterDraft,
  DirectorCharacter,
  DirectorCharactersResult,
  DirectorLocationDraft,
  DirectorLocation,
  DirectorLocationsResult,
  CreateDirectorProjectInput,
  DirectorProjectDetail,
  DirectorProjectListResult,
  DirectorProjectSummary,
  DirectorScriptVersion,
  DirectorPhaseRun,
  DirectorPhaseRunStatus,
  UpdateDirectorProjectInput,
}

export const ModelOperationSchema = z.enum([
  'text.chat',
  'image.text-to-image',
  'image.image-to-image',
  'image.edit',
  'video.text-to-video',
  'video.image-to-video',
  'video.reference-to-video',
  'video.edit',
  'video.understand',
  'speech.recognize',
  'music.generate',
])

export const ModelParameterSchema = z.object({
  name: z.string(),
  label: z.string(),
  type: z.enum(['text', 'number', 'select', 'boolean', 'media']),
  required: z.boolean().optional(),
  defaultValue: z.unknown().optional(),
  description: z.string().optional(),
  options: z.array(z.object({ label: z.string(), value: z.unknown() })).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  exclusiveMin: z.boolean().optional(),
  exclusiveMax: z.boolean().optional(),
  step: z.number().finite().positive().optional(),
  maxLength: z.number().optional(),
  minItems: z.number().int().positive().optional(),
  maxItems: z.number().int().positive().optional(),
  visibleWhen: z.object({ field: z.string(), equals: z.unknown() }).optional(),
  // 条件区间约束（field-value-when 折叠而来）：when 触发时才生效的 min/max/equals。
  conditional: z.object({
    when: z.union([
      z.object({ field: z.string(), present: z.boolean() }),
      z.object({ field: z.string(), equals: z.unknown() }),
    ]),
    min: z.number().optional(),
    max: z.number().optional(),
    equals: z.unknown().optional(),
  }).optional(),
  // 仅 media 类型参数携带：约束「作品库」选择器按媒体种类过滤候选成品。
  mediaKind: z.enum(['image', 'video', 'audio', 'text']).optional(),
})

const LocalizedModelMessageSchema = z.object({
  'zh-CN': z.string(),
  'en-US': z.string(),
})

/**
 * 跨字段校验规则的触发条件（与 model-core ModelRuleCondition 同形）。
 *  - field-equals：字段等于 equals（negate 取反时为其反面）
 *  - media-count：media 参数的条目数满足范围
 */
const ModelRuleConditionSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('field-equals'),
    field: z.string(),
    equals: z.unknown(),
    negate: z.boolean().optional(),
  }),
  z.object({
    kind: z.literal('media-count'),
    field: z.string(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
  }),
])

/**
 * 跨字段校验规则 —— 与 model-core ModelValidationRule 同形的六种判别联合。
 * catalog 把 rules 原样透传，web 表单因此能直接用 model-core validateModelParams
 * 做与服务端等价的提交前校验（media 数量上限 / 文本长度 / 条件必填等）。
 */
/**
 * rule.code 投影：与 model-core 的 ParameterIssueCode 联合逐字一致（P2-12 白名单）。
 * 用 z.enum 而非 z.string 让 api-client 的规则类型与 model-core 的 ParameterIssueCode
 * 同构——前端把 catalog 项直接交给 validateModelParams 时类型天然吻合，无需 as。
 * 漂移防护：catalog 投影完整性测试会对每个已注册模型的每条 rule 执行本 schema 的
 * parse，model-core 新增码而未同步到这里时 parse 即抛（改错即红）。
 */
export const ParameterIssueCodeSchema = z.enum([
  'REQUIRED_PARAMETER',
  'INVALID_TYPE',
  'OUT_OF_RANGE',
  'INVALID_VALUE',
  'UNKNOWN_PARAMETER',
  'REQUIRED_MEDIA',
  'TOO_MANY_MEDIA',
])

export const ModelValidationRuleSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('required-one-of'),
    fields: z.array(z.string()),
    minimum: z.number().optional(),
    code: ParameterIssueCodeSchema,
    message: LocalizedModelMessageSchema,
  }),
  z.object({
    kind: z.literal('text-length'),
    field: z.string(),
    cjk: z.object({ min: z.number().optional(), max: z.number() }),
    other: z.object({ min: z.number().optional(), max: z.number() }),
    modes: z.array(z.enum(['sync', 'provider_async', 'stream'])).optional(),
    code: ParameterIssueCodeSchema,
    message: LocalizedModelMessageSchema,
  }),
  z.object({
    kind: z.literal('field-required-when'),
    field: z.string(),
    condition: ModelRuleConditionSchema,
    code: ParameterIssueCodeSchema,
    message: LocalizedModelMessageSchema,
  }),
  z.object({
    kind: z.literal('field-allowed-when'),
    field: z.string(),
    condition: ModelRuleConditionSchema,
    code: ParameterIssueCodeSchema,
    message: LocalizedModelMessageSchema,
  }),
  z.object({
    kind: z.literal('media-group'),
    fields: z.array(z.string()),
    minItems: z.number().optional(),
    maxItems: z.number().optional(),
    condition: ModelRuleConditionSchema.optional(),
    code: ParameterIssueCodeSchema.optional(),
    message: LocalizedModelMessageSchema.optional(),
  }),
  z.object({
    kind: z.literal('array-item-field-max-path'),
    field: z.string(),
    itemProperty: z.string(),
    maximumField: z.string(),
    defaultMaximum: z.number(),
    code: ParameterIssueCodeSchema,
    message: LocalizedModelMessageSchema,
  }),
])

const ModelReferenceFormatSchema = z.enum([
  'angle-bracket',
  'image-bracket',
  'chinese',
])

function normalizeLegacyModelReferenceFormat(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return value
  }

  const item = value as Record<string, unknown>
  if (item.referenceFormat !== undefined) return value

  const request = item.request
  if (typeof request !== 'object' || request === null || Array.isArray(request)) {
    return value
  }

  const nestedReferenceFormat = (request as Record<string, unknown>).referenceFormat
  if (nestedReferenceFormat === undefined) return value

  return { ...item, referenceFormat: nestedReferenceFormat }
}

const ModelCatalogItemContractSchema = z.object({
  id: z.string(),
  provider: z.enum(['dashscope']),
  providerModel: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  category: z.enum(['image', 'video', 'audio', 'text']),
  operation: ModelOperationSchema,
  taskMode: z.enum(['sync', 'provider_async', 'stream']),
  capabilities: z.array(z.string()),
  parameters: z.array(ModelParameterSchema),
  // 跨字段校验规则：透传 manifest rules，web 表单据此做提交前实时校验。
  rules: z.array(ModelValidationRuleSchema).optional(),
  availability: z
    .object({
      enabled: z.boolean(),
      stage: z.enum(['stable', 'beta', 'hidden']),
      notActivated: z.string().optional(),
    })
    .optional(),
  referenceFormat: ModelReferenceFormatSchema.optional(),
})

export const ModelCatalogItemSchema = z.preprocess(
  normalizeLegacyModelReferenceFormat,
  ModelCatalogItemContractSchema,
)

export const ModelCatalogResponseSchema = z.object({
  items: z.array(ModelCatalogItemSchema),
})

export const NormalizedArtifactSchema = z.object({
  kind: z.enum(['image', 'video', 'audio', 'text', 'archive']),
  sourceUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  thumbnailStatus: z.enum(['queued', 'processing', 'ready', 'failed']).optional(),
  text: z.string().optional(),
  mimeType: z.string().optional(),
  providerMeta: z.unknown().optional(),
})

export const OutputResultSchema = z.object({
  artifacts: z.array(NormalizedArtifactSchema),
  usage: z.unknown().optional(),
  raw: z.unknown().optional(),
})

// 这里刻意宽松：error_json 在 DB 里可能是 TaskError 结构，也可能是普通 Error 形状。
export const GenerationErrorJsonSchema = z.object({
  code: z.string().optional(),
  message: z.string().optional(),
  category: z.string().optional(),
  retriable: z.boolean().optional(),
  name: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
})

export const GenerationRecordSchema = z.object({
  id: z.string(),
  userId: z.string(),
  modelId: z.string(),
  provider: z.enum(['dashscope']),
  providerModel: z.string(),
  category: z.enum(['image', 'video', 'audio', 'text']),
  inputParams: z.record(z.string(), z.unknown()),
  assetRefs: z.record(
    z.string(),
    z.array(z.string()).min(1),
  ).optional(),
  status: z.string(),
  statusReason: z.string().optional(),
  providerTaskId: z.string().optional(),
  providerStatus: z.string().optional(),
  requestId: z.string().optional(),
  traceId: z.string().optional(),
  visibility: z.enum(['private', 'public']).default('private'),
  batchId: z.string().optional(),
  outputResult: OutputResultSchema.optional(),
  errorJson: GenerationErrorJsonSchema.optional(),
  costEstimate: z.number(),
  currency: z.literal('CNY'),
  pricingVersion: z.string(),
  modelManifestHash: z.string(),
  costFinal: z.number().optional(),
  parentRecordId: z.string().optional(),
  idempotencyKey: z.string().optional(),
  cancelRequestedAt: z.string().optional(),
  providerCancelStatus: z.enum(['not_requested', 'requested', 'succeeded', 'failed', 'unsupported']),
  hiddenAt: z.string().optional(),
  deletedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const ProviderRequestAuditSchema = z.object({
  id: z.string(),
  generationId: z.string(),
  taskId: z.string().optional(),
  userId: z.string(),
  provider: z.string(),
  providerModel: z.string(),
  operation: z.enum(['submit', 'poll', 'chat', 'cancel']),
  status: z.enum(['started', 'succeeded', 'failed', 'unsupported']),
  providerTaskId: z.string().optional(),
  providerRequestId: z.string().optional(),
  attempt: z.number().int().nonnegative(),
  estimatedCostCents: z.number().int().nonnegative(),
  billedCostCents: z.number().int().nonnegative().optional(),
  error: z.object({
    code: z.string(),
    category: z.string(),
    message: z.string(),
    retriable: z.boolean(),
  }).optional(),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  latencyMs: z.number().int().nonnegative().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const TaskDiagnosticsSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.string(),
  attempts: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  updatedAt: z.string(),
  error: z.object({
    category: z.string(),
    message: z.string(),
    retriable: z.boolean(),
    code: z.string().optional(),
  }).optional(),
  durationMs: z.number().int().nonnegative().optional(),
})

export const GenerationDiagnosticsSchema = z.object({
  generationId: z.string(),
  traceId: z.string().optional(),
  generationDurationMs: z.number().int().nonnegative().optional(),
  tasks: z.array(TaskDiagnosticsSchema),
  providerRequests: z.array(ProviderRequestAuditSchema),
})

export const GenerationArtifactSchema = z.object({
  id: z.string(),
  recordId: z.string(),
  userId: z.string(),
  kind: z.enum(['image', 'video', 'audio', 'text', 'archive']),
  sourceUrl: z.string().optional(),
  text: z.string().optional(),
  mimeType: z.string().optional(),
  storageProvider: z.enum(['oss', 'local']).optional(),
  storageKey: z.string().optional(),
  storageUrl: z.string().optional(),
  readUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  thumbnailStatus: z.enum(['queued', 'processing', 'ready', 'failed']).optional(),
  byteSize: z.number().optional(),
  status: z.enum(['pending', 'stored', 'failed']),
  errorJson: GenerationErrorJsonSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const CreateGenerationResponseSchema = z.object({
  record: GenerationRecordSchema,
  task: z.object({ id: z.string(), type: z.string(), status: z.string() }),
  // 服务端会顺带返回一个 SSE 形态的事件，客户端用不到，故这里不做校验。
  event: z.unknown(),
})

export const GenerationEstimateSchema = z.object({
  modelId: z.string(),
  provider: z.string(),
  providerModel: z.string(),
  category: z.enum(['image', 'video', 'audio', 'text']),
  params: z.record(z.string(), z.unknown()),
  costEstimate: z.number().int().nonnegative(),
  currency: z.literal('CNY'),
  credits: z.object({
    availableCents: z.number().int().nonnegative(),
    reservedCents: z.number().int().nonnegative(),
    canAfford: z.boolean(),
  }),
  usage: z.object({
    attemptCount: z.number().int().nonnegative(),
    successfulCount: z.number().int().nonnegative(),
    generationCount: z.number().int().nonnegative(),
    estimatedCents: z.number().int().nonnegative(),
    chargedCents: z.number().int().nonnegative(),
    providerCostCents: z.number().int().nonnegative(),
  }),
  limits: z.object({
    dailyTaskLimit: z.number().int().positive().optional(),
    dailyCostLimitCents: z.number().int().positive().optional(),
    dailyQuotaMode: z.enum(['attempts', 'successful']),
  }),
})

export const GenerationEstimateResponseSchema = z.object({
  estimate: GenerationEstimateSchema,
})

export const ListGenerationsResponseSchema = z.object({
  items: z.array(GenerationRecordSchema),
  nextCursor: z.string().optional(),
})

export const ListGenerationArtifactsResponseSchema = z.object({
  items: z.array(GenerationArtifactSchema),
})

// 「我的作品库」：按用户列出 artifact（含 keyset 分页）。与按 record 列出
// 产物的 ListGenerationArtifactsResponseSchema 区别在于：本 schema 带 nextCursor。
export const ListArtifactsResponseSchema = z.object({
  items: z.array(GenerationArtifactSchema),
  nextCursor: z.string().optional(),
})

/** 取消生成返回的 record（已翻 cancel 标志位）。 */
export const CancelGenerationResponseSchema = z.object({
  record: GenerationRecordSchema,
})

/** 非状态迁移的 record 更新端点返回的 record（如设置作品库状态）。 */
export const GenerationRecordUpdateResponseSchema = z.object({
  record: GenerationRecordSchema,
})

/** 重跑生成返回新 record + task（与创建生成同构）。 */
export const RetryGenerationResponseSchema = CreateGenerationResponseSchema

// --- 生成分享（Generation sharing） ----------------------------------------

/** 面向所有者的 share（含 userId）。由所有者侧的 share 端点返回。 */
export const GenerationShareSchema = z.object({
  id: z.string(),
  recordId: z.string(),
  userId: z.string(),
  includeParams: z.boolean(),
  expiresAt: z.string().optional(),
  revokedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** 面向公众的 share —— 不含 userId。出现在公开的只读 read model 里。 */
export const PublicGenerationShareSchema = z.object({
  id: z.string(),
  recordId: z.string(),
  expiresAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * 严格收敛后的公开 record：不含 userId、cost、idempotency、outputResult 等
 * 敏感字段，确保匿名访客只能看到必要信息。
 */
export const PublicSharedGenerationRecordSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  provider: z.enum(['dashscope']),
  providerModel: z.string(),
  category: z.enum(['image', 'video', 'audio', 'text']),
  inputParams: z.record(z.string(), z.unknown()).optional(),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** 公众视角下的 artifact 投影；readUrl 由 API 层在响应时附加上来。 */
export const PublicSharedGenerationArtifactSchema = z.object({
  id: z.string(),
  kind: z.enum(['image', 'video', 'audio', 'text', 'archive']),
  mimeType: z.string().optional(),
  byteSize: z.number().optional(),
  status: z.enum(['pending', 'stored', 'failed']),
  readUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  createdAt: z.string(),
})

export const GenerationShareResponseSchema = z.object({
  share: GenerationShareSchema,
})

export const PublicSharedGenerationResponseSchema = z.object({
  share: PublicGenerationShareSchema,
  record: PublicSharedGenerationRecordSchema,
  artifacts: z.array(PublicSharedGenerationArtifactSchema),
})

/**
 * 服务端错误信封。
 *
 * `traceId` 为可选，以兼容旧版 API 响应；`cause` 同样可选，因为只在包装后的
 * 内部错误中出现，且刻意保持为简短、已清洗过的字符串。
 */
export const ApiErrorSchema = z.object({
  success: z.literal(false),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    cause: z.string().optional(),
  }),
  traceId: z.string().optional(),
})

export const PublicUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  /** 已上传自定义头像；false 时用 avatarUrlFor(id) 指向的 identicon 默认头像。 */
  hasAvatar: z.boolean(),
  passwordAuthEnabled: z.boolean(),
  githubLinked: z.boolean(),
  role: z.enum(['user', 'admin']),
  emailVerifiedAt: z.string(),
  /** 非空即封禁（正常会话下恒为 null）。 */
  bannedAt: z.string().nullable(),
})

export const AuthResponseSchema = z.object({
  user: PublicUserSchema,
})

export const RegistrationResultSchema = z.object({
  status: z.literal('verification_required'),
  /** 原始邮箱（供持久化 + 重发）。 */
  email: z.string(),
  /** 掩码邮箱（如 j***@163.com），仅供展示，不可用于重发。 */
  displayEmail: z.string(),
  resendAvailableAt: z.string(),
})

export const RegistrationResponseSchema = z.object({
  registration: RegistrationResultSchema,
})

export const EmailActionAcceptedSchema = z.object({
  accepted: z.literal(true),
  retryAt: z.string().optional(),
})

export const LogoutResponseSchema = z.object({
  ok: z.boolean(),
})

// --- 媒体任务（Media jobs） --------------------------------------------------

export const MediaJobErrorSchema = z.object({
  code: z.string().optional(),
  message: z.string(),
  category: z.string(),
  retriable: z.boolean(),
})

export const MediaJobSchema = z.object({
  id: z.string(),
  userId: z.string(),
  operation: z.enum(['video.extract_audio', 'video.assemble']),
  status: z.enum(['queued', 'processing', 'succeeded', 'failed', 'cancelled']),
  sourceAssetId: z.string().optional(),
  sourceKind: z.enum(['image', 'video', 'audio']),
  outputAssetId: z.string().optional(),
  input: z.record(z.string(), z.unknown()),
  output: z.record(z.string(), z.unknown()).optional(),
  error: MediaJobErrorSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const MediaTaskSchema = z.object({
  id: z.string(),
  type: z.string(),
  domain: z.string(),
  status: z.string(),
})

export const CreateMediaJobResponseSchema = z.object({
  job: MediaJobSchema,
  task: MediaTaskSchema,
})

export const MediaJobResponseSchema = z.object({
  job: MediaJobSchema,
})

export type ModelParameter = z.infer<typeof ModelParameterSchema>
export type ModelOperation = z.infer<typeof ModelOperationSchema>
export type ModelValidationRule = z.infer<typeof ModelValidationRuleSchema>
export type ModelRuleCondition = z.infer<typeof ModelRuleConditionSchema>
export type ModelCatalogItem = z.infer<typeof ModelCatalogItemSchema>
export type NormalizedArtifact = z.infer<typeof NormalizedArtifactSchema>
export type OutputResult = z.infer<typeof OutputResultSchema>
export type GenerationErrorJson = z.infer<typeof GenerationErrorJsonSchema>
export type GenerationRecord = z.infer<typeof GenerationRecordSchema>
export type ProviderRequestAudit = z.infer<typeof ProviderRequestAuditSchema>
export type TaskDiagnostics = z.infer<typeof TaskDiagnosticsSchema>
export type GenerationDiagnostics = z.infer<typeof GenerationDiagnosticsSchema>
export type GenerationArtifact = z.infer<typeof GenerationArtifactSchema>
export type CreateGenerationResponse = z.infer<typeof CreateGenerationResponseSchema>
export type GenerationEstimate = z.infer<typeof GenerationEstimateSchema>
export type ListGenerationsResult = z.infer<typeof ListGenerationsResponseSchema>
export type ListGenerationArtifactsResult = z.infer<typeof ListGenerationArtifactsResponseSchema>
export type ListArtifactsResult = z.infer<typeof ListArtifactsResponseSchema>
export type CancelGenerationResult = z.infer<typeof CancelGenerationResponseSchema>
export type RetryGenerationResult = z.infer<typeof RetryGenerationResponseSchema>
export type GenerationShare = z.infer<typeof GenerationShareSchema>
export type GenerationShareResult = z.infer<typeof GenerationShareResponseSchema>
export type PublicSharedGeneration = z.infer<typeof PublicSharedGenerationResponseSchema>
export type PublicUser = z.infer<typeof PublicUserSchema>
export type RegistrationResult = z.infer<typeof RegistrationResultSchema>
export type EmailActionAccepted = z.infer<typeof EmailActionAcceptedSchema>
export type ApiError = z.infer<typeof ApiErrorSchema>
export type MediaJob = z.infer<typeof MediaJobSchema>
export type CreateMediaJobResult = z.infer<typeof CreateMediaJobResponseSchema>

export const AssetItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['image', 'video', 'audio', 'text', 'archive']),
  source: z.enum(['upload', 'link', 'generation', 'derived']),
  url: z.string().optional(),
  /** 已存储对象由资产详情端点返回的全新附件 URL。 */
  downloadUrl: z.string().optional(),
  /** 紧凑预览图；原始媒体 URL 仍在 `url` 中。 */
  thumbnailUrl: z.string().optional(),
  thumbnailStatus: z.enum(['queued', 'processing', 'ready', 'failed']).optional(),
  text: z.string().optional(),
  mimeType: z.string().optional(),
  byteSize: z.number().optional(),
  durationSeconds: z.number().nonnegative().optional(),
  declaredResolution: z.string().optional(),
  fileName: z.string().optional(),
  recordId: z.string().optional(),
  modelId: z.string().optional(),
  createdAt: z.string(),
})

export const AssetResponseSchema = z.object({
  asset: AssetItemSchema,
})

export const AssetCapabilitiesSchema = z.object({
  maxAssetSizeBytes: z.number().int().positive(),
  maxMediaDurationSeconds: z.number().positive().optional(),
  allowedMimeTypes: z.array(z.string()),
  allowedKinds: z.array(z.enum(['image', 'video', 'audio', 'text', 'archive'])),
})

export const ListAssetsResponseSchema = z.object({
  items: z.array(AssetItemSchema),
  nextCursor: z.string().optional(),
})

export const UsageSummarySchema = z.object({
  generationCount: z.number().int().nonnegative(),
  attemptCount: z.number().int().nonnegative().optional(),
  successfulCount: z.number().int().nonnegative().optional(),
  estimatedCents: z.number().int().nonnegative(),
  chargedCents: z.number().int().nonnegative(),
  providerCostCents: z.number().int().nonnegative(),
  period: z.object({
    since: z.string(),
    until: z.string(),
  }),
  currency: z.literal('CNY'),
})

export const UsageSummaryResponseSchema = z.object({ usage: UsageSummarySchema })

export const CreditBalanceSchema = z.object({
  userId: z.string(),
  availableCents: z.number().int().nonnegative(),
  reservedCents: z.number().int().nonnegative(),
  totalCents: z.number().int().nonnegative(),
})

export const CreditBalanceResponseSchema = z.object({
  balance: CreditBalanceSchema,
})

export type AssetItem = z.infer<typeof AssetItemSchema>
export type AssetCapabilities = z.infer<typeof AssetCapabilitiesSchema>
export type ListAssetsResult = z.infer<typeof ListAssetsResponseSchema>
export type UsageSummary = z.infer<typeof UsageSummarySchema>
export type CreditBalance = z.infer<typeof CreditBalanceSchema>

// ---------------------------------------------------------------------------
// 管理后台
// ---------------------------------------------------------------------------

/** 管理后台用户投影（不含密码哈希/GitHub ID）。 */
export const AdminUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  displayName: z.string().nullable(),
  role: z.enum(['user', 'admin']),
  emailVerifiedAt: z.string(),
  /** 非空即封禁。 */
  bannedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const AdminListUsersResponseSchema = z.object({
  items: z.array(AdminUserSchema),
  nextCursor: z.string().optional(),
  /** offset 分页模式（请求带 page）返回的总条数。 */
  total: z.number().optional(),
})

/** 管理后台调用统计概览（今日调用 + 近 14 天注册）。 */
export const AdminStatsOverviewSchema = z.object({
  todayCalls: z.number(),
  callsByModel: z.array(z.object({
    modelId: z.string(),
    label: z.string(),
    count: z.number(),
  })),
  callsByHour: z.array(z.object({
    hour: z.number(),
    modelId: z.string(),
    count: z.number(),
  })),
  registrationsByDay: z.array(z.object({
    date: z.string(),
    count: z.number(),
  })),
  todayNewUsers: z.number(),
  totalUsers: z.number(),
})

export const AdminUserResponseSchema = z.object({
  user: AdminUserSchema,
})

export const AdminUserDetailSchema = z.object({
  user: AdminUserSchema,
  balance: CreditBalanceSchema,
})

export const AdminUserDetailResponseSchema = z.object({
  user: AdminUserSchema,
  balance: CreditBalanceSchema,
})

export const AdminCreateUserInputSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(256),
  displayName: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['user', 'admin']).optional(),
}).strict()

export const AdminUpdateUserInputSchema = z.object({
  displayName: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['user', 'admin']).optional(),
}).strict()

/** 批量用户操作请求（封禁/解封/删除）：1~100 个用户 ID。 */
export const BatchUsersRequestSchema = z.object({
  userIds: z.array(z.string().trim().min(1).max(256)).min(1).max(100),
}).strict()

/** admin 画廊批量治理请求（下架/恢复/软删）：1~100 个作品 id。 */
export const BatchGalleryRequestSchema = z.object({
  ids: z.array(z.string().trim().min(1).max(256)).min(1).max(100),
}).strict()

/** 批量赠送积分请求：idempotencyKey 为整批共享幂等键（前端 crypto.randomUUID()）。 */
export const BatchGrantPointsRequestSchema = z.object({
  userIds: z.array(z.string().trim().min(1).max(256)).min(1).max(100),
  amountCents: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().trim().min(1).max(256),
}).strict()

export const BatchAffectedResponseSchema = z.object({
  affected: z.number(),
})

export const BatchGrantPointsResponseSchema = z.object({
  /** 实际成功入账的用户数（不再等于请求数）。 */
  granted: z.number(),
  /** 失败的 userId 列表；空数组表示整批成功。 */
  failed: z.array(z.string()),
  results: z.array(z.object({
    userId: z.string(),
    balance: CreditBalanceSchema,
  })),
})

export const CreditLedgerEntrySchema = z.object({
  id: z.string(),
  accountId: z.string(),
  userId: z.string(),
  generationId: z.string().optional(),
  kind: z.enum(['grant', 'recharge', 'reserve', 'settle', 'refund', 'adjustment']),
  availableDeltaCents: z.number(),
  reservedDeltaCents: z.number(),
  availableBalanceCents: z.number(),
  reservedBalanceCents: z.number(),
  idempotencyKey: z.string(),
  reason: z.string().optional(),
  actorUserId: z.string().optional(),
  requestId: z.string().optional(),
  createdAt: z.string(),
})

export const ListPointsLedgerResponseSchema = z.object({
  items: z.array(CreditLedgerEntrySchema),
  nextCursor: z.string().optional(),
})

export const GrantPointsInputSchema = z.object({
  amountCents: z.number().int().positive(),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().trim().min(1).max(256),
}).strict()

export const AdjustPointsInputSchema = z.object({
  amountCents: z.number().int().refine(value => value !== 0, 'amountCents cannot be zero'),
  reason: z.string().trim().min(1).max(500),
  idempotencyKey: z.string().trim().min(1).max(256),
}).strict()

export const PointsMutationResponseSchema = z.object({
  balance: CreditBalanceSchema,
  entry: CreditLedgerEntrySchema,
})

export type AdminUser = z.infer<typeof AdminUserSchema>
export type AdminListUsersResult = z.infer<typeof AdminListUsersResponseSchema>
export type AdminStatsOverview = z.infer<typeof AdminStatsOverviewSchema>
export type BatchUsersRequest = z.infer<typeof BatchUsersRequestSchema>
export type BatchGalleryRequest = z.infer<typeof BatchGalleryRequestSchema>
export type BatchGrantPointsRequest = z.infer<typeof BatchGrantPointsRequestSchema>
export type BatchAffectedResult = z.infer<typeof BatchAffectedResponseSchema>
export type BatchGrantPointsResult = z.infer<typeof BatchGrantPointsResponseSchema>

// ---------------------------------------------------------------------------
// 社区画廊（/api/gallery）。
// ---------------------------------------------------------------------------

/** 画廊封面的公开投影（不含 storage 坐标）。 */
export const GalleryCoverSchema = z.object({
  id: z.string(),
  kind: z.string(),
  readUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
})

export const GalleryItemSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  category: z.enum(['image', 'video', 'audio', 'text']),
  author: z.object({ id: z.string(), displayName: z.string().nullable() }),
  /** 精选脱敏参数（仅文本参数，不含媒体/参考图值）。 */
  inputParams: z.record(z.string(), z.unknown()),
  cover: GalleryCoverSchema.optional(),
  likeCount: z.number(),
  likedByViewer: z.boolean(),
  favoritedByViewer: z.boolean(),
  createdAt: z.string(),
})

export const ListGalleryResponseSchema = z.object({
  items: z.array(GalleryItemSchema),
  nextCursor: z.string().optional(),
})

export const GalleryArtifactSchema = z.object({
  id: z.string(),
  kind: z.string(),
  readUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  /** 文本类产物的正文（kind='text' 时直接随详情返回，无需再拉文件）。 */
  text: z.string().optional(),
})

export const GalleryRecordSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  provider: z.string(),
  providerModel: z.string(),
  category: z.enum(['image', 'video', 'audio', 'text']),
  inputParams: z.record(z.string(), z.unknown()),
  status: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const GalleryDetailSchema = z.object({
  record: GalleryRecordSchema,
  author: z.object({ id: z.string(), displayName: z.string().nullable() }),
  likeCount: z.number(),
  likedByViewer: z.boolean(),
  favoritedByViewer: z.boolean(),
  artifacts: z.array(GalleryArtifactSchema),
})

export const SetVisibilityInputSchema = z.object({
  visibility: z.enum(['private', 'public']),
}).strict()

// ---------------------------------------------------------------------------
// 社交通知（/api/notifications）。
// ---------------------------------------------------------------------------

export const NotificationItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['like', 'favorite', 'system']),
  actorId: z.string().optional(),
  recordId: z.string().optional(),
  title: z.string(),
  body: z.string(),
  read: z.boolean(),
  createdAt: z.string(),
})

export const ListNotificationsResponseSchema = z.object({
  items: z.array(NotificationItemSchema),
  nextCursor: z.string().optional(),
})

export const NotificationUnreadCountSchema = z.object({ count: z.number() })

export const NotificationReadSchema = z.object({ read: z.boolean() })

export const NotificationReadAllSchema = z.object({ marked: z.number() })

// ---------------------------------------------------------------------------
// 管理后台 · 社区画廊治理（/api/admin/gallery）。
// ---------------------------------------------------------------------------

export const AdminGalleryItemSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  category: z.enum(['image', 'video', 'audio', 'text']),
  author: z.object({ id: z.string(), displayName: z.string().nullable() }),
  cover: GalleryCoverSchema.optional(),
  likeCount: z.number(),
  visibility: z.enum(['private', 'public']),
  status: z.string(),
  hiddenAt: z.string().optional(),
  hiddenBy: z.string().optional(),
  createdAt: z.string(),
})

export const ListAdminGalleryResponseSchema = z.object({
  items: z.array(AdminGalleryItemSchema),
  nextCursor: z.string().optional(),
})

export const AdminGalleryHideResultSchema = z.object({ hidden: z.boolean() })

// ---------------------------------------------------------------------------
// 管理后台 · 任务中心。
// ---------------------------------------------------------------------------

/** task error 摘要（category 与 task-engine TaskErrorCategory 对齐）。 */
const TaskErrorCategoryEnum = z.enum([
  'validation', 'auth', 'quota', 'rate_limit', 'provider', 'network', 'timeout', 'storage', 'cancelled', 'system',
])

export const AdminTaskErrorSchema = z.object({
  category: TaskErrorCategoryEnum,
  message: z.string(),
  retriable: z.boolean(),
  code: z.string().optional(),
})

export const AdminTaskItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  domain: z.enum(['generation', 'artifact', 'media', 'director', 'system']),
  status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
  priority: z.number(),
  attempts: z.number(),
  maxAttempts: z.number(),
  nextRunAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  recordId: z.string().optional(),
  userId: z.string().optional(),
  traceId: z.string().optional(),
  author: z.object({ id: z.string(), displayName: z.string().nullable() }).optional(),
  recordContext: z.object({ modelId: z.string(), category: z.enum(['image', 'video', 'audio', 'text']) }).optional(),
  error: AdminTaskErrorSchema.optional(),
  durationMs: z.number().optional(),
})

export const ListAdminTasksResponseSchema = z.object({
  items: z.array(AdminTaskItemSchema),
  nextCursor: z.string().optional(),
})

/** admin 画廊预览产物项（text 内联正文；媒体项带 readUrl/thumbnailUrl）。 */
export const AdminGalleryArtifactSchema = z.object({
  id: z.string(),
  kind: z.string(),
  readUrl: z.string().optional(),
  thumbnailUrl: z.string().optional(),
  text: z.string().optional(),
})

export const AdminGalleryArtifactsResponseSchema = z.object({
  items: z.array(AdminGalleryArtifactSchema),
})

// ---------------------------------------------------------------------------
// 管理分析（model_costs + 成本毛利 + 留存漏斗）。
// ---------------------------------------------------------------------------

export const ModelCostSchema = z.object({
  modelId: z.string(),
  unitCostCents: z.number(),
  currency: z.string(),
  updatedAt: z.string(),
})

export const AdminModelCostsResponseSchema = z.object({ costs: z.array(ModelCostSchema) })

export const AdminModelCostsUpdateInputSchema = z.object({
  entries: z.array(z.object({
    modelId: z.string().trim().min(1).max(256),
    unitCostCents: z.number().int().min(0),
  })).min(1).max(200),
}).strict()

export const AdminModelCostsUpdateResponseSchema = z.object({ updated: z.number() })

export const UserFeedbackSchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  kind: z.enum(['feedback', 'bug', 'suggestion', 'complaint']),
  content: z.string(),
  status: z.enum(['open', 'reviewing', 'resolved', 'closed']),
  resolvedBy: z.string().optional(),
  resolvedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const ListFeedbackResponseSchema = z.object({
  items: z.array(UserFeedbackSchema),
  nextCursor: z.string().optional(),
})

export const FeedbackItemResponseSchema = z.object({ item: UserFeedbackSchema })

export const SubmitFeedbackInputSchema = z.object({
  kind: z.enum(['feedback', 'bug', 'suggestion', 'complaint']),
  content: z.string().trim().min(1).max(2000),
}).strict()

export const UpdateFeedbackStatusInputSchema = z.object({
  status: z.enum(['open', 'reviewing', 'resolved', 'closed']),
}).strict()

export const ContentReportSchema = z.object({
  id: z.string(),
  generationId: z.string(),
  reporterId: z.string(),
  reason: z.enum(['unsafe', 'copyright', 'privacy', 'spam', 'other']),
  details: z.string().optional(),
  status: z.enum(['open', 'reviewing', 'resolved', 'dismissed']),
  resolvedBy: z.string().optional(),
  resolutionNote: z.string().optional(),
  resolvedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const ListContentReportsResponseSchema = z.object({
  items: z.array(ContentReportSchema),
  nextCursor: z.string().optional(),
})

export const ContentReportItemResponseSchema = z.object({ report: ContentReportSchema })

export const SubmitContentReportInputSchema = z.object({
  generationId: z.string().trim().min(1).max(256),
  reason: z.enum(['unsafe', 'copyright', 'privacy', 'spam', 'other']),
  details: z.string().trim().max(2000).optional(),
}).strict()

export const UpdateContentReportInputSchema = z.object({
  status: z.enum(['open', 'reviewing', 'resolved', 'dismissed']),
  resolutionNote: z.string().trim().max(2000).optional(),
  hideTarget: z.boolean().optional(),
}).strict()

export const AdminAnalyticsSchema = z.object({
  window: z.object({ from: z.string(), to: z.string() }),
  costMargin: z.array(z.object({
    modelId: z.string(),
    label: z.string(),
    calls: z.number(),
    revenueCents: z.number(),
    unitCostCents: z.number(),
    costCents: z.number(),
    marginCents: z.number(),
  })),
  retention: z.object({
    registered: z.number(),
    firstGeneration: z.number(),
    firstSuccess: z.number(),
    activeTwoDays: z.number(),
  }),
})

// ---------------------------------------------------------------------------
// 提示词资产库（/api/prompt-library）。
// ---------------------------------------------------------------------------

export const PromptLibraryItemSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  modelId: z.string(),
  prompt: z.string(),
  params: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const ListPromptLibraryResponseSchema = z.object({
  items: z.array(PromptLibraryItemSchema),
  nextCursor: z.string().optional(),
})

export const PromptLibraryItemResponseSchema = z.object({ item: PromptLibraryItemSchema })

export const CreatePromptLibraryInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  modelId: z.string().trim().min(1).max(256),
  prompt: z.string().trim().min(1).max(4000),
  params: z.record(z.string(), z.unknown()).optional(),
}).strict()

export const UpdatePromptLibraryInputSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  prompt: z.string().trim().min(1).max(4000).optional(),
  params: z.record(z.string(), z.unknown()).optional(),
}).strict()

export const SetVisibilityResponseSchema = z.object({ visibility: z.enum(['private', 'public']) })

export const LikeMutationResponseSchema = z.object({ liked: z.boolean(), likeCount: z.number() })

export const FavoriteMutationResponseSchema = z.object({ favorited: z.boolean() })

export type GalleryItem = z.infer<typeof GalleryItemSchema>
export type GalleryDetail = z.infer<typeof GalleryDetailSchema>
export type ListGalleryResult = z.infer<typeof ListGalleryResponseSchema>
export type SetVisibilityInput = z.infer<typeof SetVisibilityInputSchema>
export type LikeMutationResult = z.infer<typeof LikeMutationResponseSchema>
export type FavoriteMutationResult = z.infer<typeof FavoriteMutationResponseSchema>
export type PromptLibraryItem = z.infer<typeof PromptLibraryItemSchema>
export type ListPromptLibraryResult = z.infer<typeof ListPromptLibraryResponseSchema>
export type CreatePromptLibraryInput = z.infer<typeof CreatePromptLibraryInputSchema>
export type UpdatePromptLibraryInput = z.infer<typeof UpdatePromptLibraryInputSchema>
export type ModelCost = z.infer<typeof ModelCostSchema>
export type AdminModelCostsResult = z.infer<typeof AdminModelCostsResponseSchema>
export type AdminAnalytics = z.infer<typeof AdminAnalyticsSchema>
export type UserFeedback = z.infer<typeof UserFeedbackSchema>
export type ListFeedbackResult = z.infer<typeof ListFeedbackResponseSchema>
export type SubmitFeedbackInput = z.infer<typeof SubmitFeedbackInputSchema>
export type UpdateFeedbackStatusInput = z.infer<typeof UpdateFeedbackStatusInputSchema>
export type ContentReport = z.infer<typeof ContentReportSchema>
export type ListContentReportsResult = z.infer<typeof ListContentReportsResponseSchema>
export type SubmitContentReportInput = z.infer<typeof SubmitContentReportInputSchema>
export type UpdateContentReportInput = z.infer<typeof UpdateContentReportInputSchema>
export type NotificationItem = z.infer<typeof NotificationItemSchema>
export type ListNotificationsResult = z.infer<typeof ListNotificationsResponseSchema>
export type NotificationUnreadCount = z.infer<typeof NotificationUnreadCountSchema>
export type AdminGalleryItem = z.infer<typeof AdminGalleryItemSchema>
export type ListAdminGalleryResult = z.infer<typeof ListAdminGalleryResponseSchema>
export type AdminGalleryHideResult = z.infer<typeof AdminGalleryHideResultSchema>
export type AdminTaskItem = z.infer<typeof AdminTaskItemSchema>
export type AdminTaskError = z.infer<typeof AdminTaskErrorSchema>
export type ListAdminTasksResult = z.infer<typeof ListAdminTasksResponseSchema>
export type AdminGalleryArtifact = z.infer<typeof AdminGalleryArtifactSchema>
export type AdminGalleryArtifactsResult = z.infer<typeof AdminGalleryArtifactsResponseSchema>
export type AdminUserDetail = z.infer<typeof AdminUserDetailSchema>
export type AdminCreateUserInput = z.infer<typeof AdminCreateUserInputSchema>
export type AdminUpdateUserInput = z.infer<typeof AdminUpdateUserInputSchema>
export type CreditLedgerEntry = z.infer<typeof CreditLedgerEntrySchema>
export type ListPointsLedgerResult = z.infer<typeof ListPointsLedgerResponseSchema>
export type GrantPointsInput = z.infer<typeof GrantPointsInputSchema>
export type AdjustPointsInput = z.infer<typeof AdjustPointsInputSchema>
export type PointsMutationResult = z.infer<typeof PointsMutationResponseSchema>
