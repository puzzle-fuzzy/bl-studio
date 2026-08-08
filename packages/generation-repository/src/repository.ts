/**
 * 生成领域的中央 repository —— 整个系统的「中央生成接缝」。
 *
 * 这里集中了所有 generation 相关的持久化与状态推进逻辑，是 services 层
 * （api / worker）唯一被允许触碰的持久化入口。底层使用 Drizzle 操作
 * Postgres，但本包对外只通过 `createGenerationRepository` 暴露能力，配合
 * `createGenerationRepositoryFromUrl`（见 factory.ts）让 services 在
 * wiring 时只持有一个 DATABASE_URL，从而不必 import `@bailian-studio/db`（包边界
 * 规则禁止）。
 *
 * 关键设计要点（详见各方法 doc）：
 *  - **事务边界**：所有「记录 + 任务」的复合写入都放在单个事务中（如
 *    createGeneration / scheduleGenerationPoll / completeGeneration），要么
 *    全部成功要么全部回滚；artifact.persist / generation.poll 等后续任务也
 *    在同一事务里入队，确保任务队列与记录状态始终一致。
 *  - **幂等性**：createGeneration 由 `(userId, idempotencyKey)` 唯一索引兜底；
 *    createGenerationShare 由 `generation_shares_record_idx` 部分唯一索引兜底，
 *    每个 generation 恰好产生一个 share。
 *  - **并发认领**：claimNextQueuedTask 使用 `FOR UPDATE SKIP LOCKED`，多 worker
 *    并发拉取时互不阻塞、且不会抢到同一条任务。
 *  - **processing 中间态**：markGenerationProcessing / scheduleGenerationPoll
 *    会把记录翻到 `processing`，这是 repository 内部中间态，不属于 event-bus
 *    的 GenerationStatus 联合——详见 types.ts 的 RepositoryGenerationStatus。
 *  - **分享的严格只读 scope**：getPublicSharedGeneration 返回的对象经
 *    toPublicSharedRecord / toPublicSharedArtifact 严格裁剪，剥除 owner id /
 *    cost / task / provider / outputResult / readUrl 等一切敏感或内部字段。
 */
import { and, asc, desc, eq, exists, gt, gte, ilike, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm'
import {
  CreditLedgerError,
  ensureCreditAccountInTransaction,
  refundCreditsInTransaction,
  reserveCreditsInTransaction,
  settleCreditsInTransaction,
} from '@bailian-studio/credit-ledger'
import { assetDerivatives, auditLogs, generationArtifacts, generationEvents, generationInputAssets, generationRecords, generationShares, providerRequestAudits, taskRecords, usageRecords, userAssets, workerHeartbeats, type BailianStudioDb } from '@bailian-studio/db'
import {
  estimateModelCost,
  getModelAuditMetadata,
  getModelById,
  validateModelParams,
  type FrozenModelManifest,
  type ModelCategory,
  type ModelManifest,
  type ModelValidationRule,
  type ProviderTransport,
} from '@bailian-studio/model-core'
import { transitionTask, type TaskRecord, type TaskError } from '@bailian-studio/task-engine'
import {
  clampLimit,
  decodeCursor,
  encodeCursor,
  type ListGenerationRecordsOptions,
  type ListGenerationRecordsResult,
  type GenerationListView,
} from './cursor'
import { GenerationRepositoryError } from './errors'
import { createContentRepository } from './content'
import { assetCursorFilters, decodeAssetCursor, encodeAssetCursor } from './asset-cursor'
import { nextArtifactId, nextAssetDerivativeId, nextAuditLogId, nextGenerationEventId, nextGenerationRecordId, nextGenerationShareId, nextProviderRequestAuditId, nextTaskRecordId, nextUsageRecordId } from './id'
import {
    toGenerationArtifact,
    toGenerationEvent,
    toGenerationRecord,
    toGenerationShare,
    toAuditLog,
    toProviderRequestAudit,
    toTaskRecord,
    toWorkerHeartbeat,
  type GenerationRecordRow,
  type TaskRecordRow,
} from './mappers'
import type {
  AdminGalleryItem,
  CostMarginRow,
  ContentReport,
  ContentReportReason,
  ContentReportStatus,
  FeedbackKind,
  FeedbackStatus,
  GalleryDetail,
  GallerySort,
  GalleryVisibility,
  GenerationArtifact,
  GenerationEvent,
  ListAdminGalleryResult,
  ListAdminTasksResult,
  ListFeedbackResult,
  ListContentReportsResult,
  ListGalleryResult,
  ListNotificationsResult,
  ListPromptLibraryResult,
  ModelCost,
  NotificationKind,
  PromptLibraryItem,
  RetentionAnalytics,
  UserFeedback,
  CancelGenerationInput,
  CompleteGenerationInput,
  CompleteGenerationResult,
  CreateGenerationInput,
  CreateGenerationResult,
  CreateGenerationShareInput,
  FailGenerationInput,
  GenerationDiagnostics,
  GenerationAssetRefInput,
  GenerationAssetRefs,
  GenerationInputAsset,
  GenerationRecord,
  GenerationQuotaLimits,
  GenerationShare,
  GetOwnedStorageObjectInput,
  GetGenerationShareForRecordInput,
  ListGenerationArtifactsOptions,
  ListGenerationArtifactsResult,
  ListGenerationEventsOptions,
  MarkArtifactFailedInput,
  MarkArtifactStoredInput,
  MarkGenerationProcessingInput,
  PublicSharedGeneration,
  PublicSharedGenerationArtifact,
  PublicSharedGenerationRecord,
  OwnedStorageObject,
  RevokeGenerationShareInput,
  RequestGenerationCancelInput,
  RetryGenerationInput,
  ScheduleGenerationPollInput,
  SetGenerationLibraryStateInput,
  TaskDiagnostics,
  WorkerHealth,
  WorkerHeartbeat,
  RegisterWorkerHeartbeatInput,
  UpdateGenerationRecordPatch,
  } from './types'
import type {
  FinishProviderRequestInput,
  ProviderRequestAudit,
  StartProviderRequestInput,
} from './provider-request-types'
import type { AuditLog, RecordAuditEventInput } from './audit-types'
import type {
  AssetThumbnailSource,
  CompleteAssetThumbnailInput,
  CreateUserAssetInput,
  FailAssetThumbnailInput,
  ListUnifiedAssetsOptions,
  ListUnifiedAssetsResult,
  MarkAssetThumbnailProcessingInput,
  UnifiedAssetItem,
} from './asset-types'

/**
 * 把任意值安全地当作 JSON 记录返回。
 * 输入为 null/undefined、或不是「普通对象」时返回 null，避免把数组/原始值
 * 误当成 record 写进数据库。
 */
function safeParseJsonRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    try {
      // 这里仅做结构判定：只要走到了「非数组 object」就认为是 plain object。
      return value as Record<string, unknown>
    } catch {
      return null
    }
  }

  return null
}

function readDurationSeconds(value: unknown): number | undefined {
  const metadata = safeParseJsonRecord(value)
  const duration = metadata?.['durationSeconds']
  return typeof duration === 'number' && Number.isFinite(duration) && duration >= 0
    ? duration
    : undefined
}

function readRequestDurationSeconds(value: unknown): number | undefined {
  const request = safeParseJsonRecord(value)
  const duration = request?.['duration']
  return typeof duration === 'number' && Number.isFinite(duration) && duration >= 0
    ? duration
    : undefined
}

function readDeclaredResolution(
  storedValue: unknown,
  requestValue: unknown,
): string | undefined {
  const stored = safeParseJsonRecord(storedValue)
  const width = stored?.['width']
  const height = stored?.['height']
  if (
    typeof width === 'number'
    && Number.isFinite(width)
    && width > 0
    && typeof height === 'number'
    && Number.isFinite(height)
    && height > 0
  ) {
    return `${width}×${height}`
  }

  const storedResolution = normalizeDeclaredResolution(stored?.['resolution'])
    ?? normalizeDeclaredResolution(stored?.['size'])
  if (storedResolution !== undefined) return storedResolution

  const request = safeParseJsonRecord(requestValue)
  return normalizeDeclaredResolution(request?.['size'])
    ?? normalizeDeclaredResolution(request?.['resolution'])
}

function normalizeDeclaredResolution(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  if (normalized.length === 0) return undefined
  const dimensions = /^(\d+(?:\.\d+)?)\s*(?:x|\*|×)\s*(\d+(?:\.\d+)?)$/i.exec(normalized)
  if (dimensions === null) return normalized
  return `${dimensions[1]}×${dimensions[2]}`
}

function escapedLikePattern(value: string): string {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`
}

function toUnifiedAssetItem(
  row: typeof userAssets.$inferSelect,
  artifactText?: string | null,
  thumbnail?: typeof assetDerivatives.$inferSelect | null,
  generationInputParams?: Record<string, unknown> | null,
): UnifiedAssetItem {
  const durationSeconds = readDurationSeconds(row.metadataJson)
    ?? readRequestDurationSeconds(generationInputParams)
  const declaredResolution = readDeclaredResolution(row.metadataJson, generationInputParams)
  const url = row.storageUrl
    ?? (row.storageKey === null ? (row.originalUrl ?? undefined) : undefined)

  return {
    id: row.id,
    kind: row.kind as UnifiedAssetItem['kind'],
    source: row.source as UnifiedAssetItem['source'],
    ...(row.generationArtifactId !== null
      ? { generationArtifactId: row.generationArtifactId }
      : {}),
    ...(url !== undefined ? { url } : {}),
    ...(artifactText !== undefined && artifactText !== null
      ? { text: artifactText }
      : {}),
    ...(row.mimeType !== null ? { mimeType: row.mimeType } : {}),
    ...(row.byteSize !== null ? { byteSize: row.byteSize } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    ...(declaredResolution !== undefined ? { declaredResolution } : {}),
    ...(row.fileName !== null ? { fileName: row.fileName } : {}),
    ...(row.recordId !== null ? { recordId: row.recordId } : {}),
    ...(row.modelId !== null ? { modelId: row.modelId } : {}),
    ...(row.storageProvider !== null ? { storageProvider: row.storageProvider } : {}),
    ...(row.storageKey !== null ? { storageKey: row.storageKey } : {}),
    ...(thumbnail !== undefined && thumbnail !== null
      ? {
          thumbnailStatus: thumbnail.status as UnifiedAssetItem['thumbnailStatus'],
          ...(thumbnail.storageProvider !== null
            ? { thumbnailStorageProvider: thumbnail.storageProvider }
            : {}),
          ...(thumbnail.storageKey !== null
            ? { thumbnailStorageKey: thumbnail.storageKey }
            : {}),
        }
      : {}),
    createdAt: row.createdAt.toISOString(),
  }
}

function toGenerationArtifactWithThumbnail(
  artifact: typeof generationArtifacts.$inferSelect,
  thumbnail?: typeof assetDerivatives.$inferSelect | null,
): GenerationArtifact {
  const item = toGenerationArtifact(artifact)
  if (thumbnail === undefined || thumbnail === null) return item
  return {
    ...item,
    thumbnailStatus: thumbnail.status as NonNullable<GenerationArtifact['thumbnailStatus']>,
    ...(thumbnail.storageProvider === 'local' || thumbnail.storageProvider === 'oss'
      ? { thumbnailStorageProvider: thumbnail.storageProvider }
      : {}),
    ...(thumbnail.storageKey !== null ? { thumbnailStorageKey: thumbnail.storageKey } : {}),
  }
}

type AssetReferenceValue = string | string[]

interface PreparedGenerationParams {
  params: Record<string, unknown>
  pricingParams: Record<string, unknown>
  assetRefs?: GenerationAssetRefs
}

function invalidAssetReference(
  field: string,
  message: string,
  chineseMessage: string,
): never {
  throw new GenerationRepositoryError(
    'INVALID_GENERATION_PARAMS',
    'Invalid generation asset references',
    {
      issues: [{
        code: 'INVALID_ASSET_REFERENCE',
        field,
        message,
        messages: { 'zh-CN': chineseMessage, 'en-US': message },
      }],
    },
  )
}

function referenceIds(value: AssetReferenceValue): string[] {
  const ids = Array.isArray(value) ? [...value] : [value]
  if (ids.length === 0 || ids.some(id => typeof id !== 'string' || id.length === 0)) {
    invalidAssetReference('assetRefs', 'Asset references must contain non-empty IDs', '资产引用必须包含非空 ID')
  }
  return ids
}

/** 校验并规整生成参数：无 assetRefs 时走纯参数校验；有 assetRefs 时校验媒体绑定并归一化。 */
function prepareGenerationParams(
  manifest: FrozenModelManifest,
  inputParams: Record<string, unknown>,
  rawAssetRefs?: GenerationAssetRefInput,
): PreparedGenerationParams {
  // 空 assetRefs（{}）等价于无媒体绑定：纯文生图/文生视频模型合法，走纯参数校验。
  // 不能把 {} 当"有绑定但为空"拒绝——前端对无媒体模型总是发 assetRefs:{}。
  if (rawAssetRefs === undefined || Object.keys(rawAssetRefs).length === 0) {
    const validation = validateModelParams(manifest, inputParams)
    if (!validation.valid) {
      throw new GenerationRepositoryError(
        'INVALID_GENERATION_PARAMS',
        'Invalid generation params',
        { issues: validation.errors },
      )
    }
    return { params: validation.params, pricingParams: validation.params }
  }

  const entries = Object.entries(rawAssetRefs).sort(([left], [right]) => left.localeCompare(right))
  if (entries.length === 0) {
    invalidAssetReference('assetRefs', 'assetRefs must contain at least one binding', '资产引用至少需要一个绑定')
  }

  const parameters = new Map(manifest.parameters.map(parameter => [parameter.name, parameter] as const))
  const mediaParameters = new Set(
    manifest.parameters.filter(parameter => parameter.type === 'media').map(parameter => parameter.name),
  )
  for (const parameterName of mediaParameters) {
    if (Object.hasOwn(inputParams, parameterName)) {
      invalidAssetReference(
        parameterName,
        `${parameterName} must be supplied through assetRefs`,
        `${parameterName} 必须通过资产引用提供`,
      )
    }
  }

  const normalizedRefs: GenerationAssetRefs = {}
  const validationParams: Record<string, unknown> = { ...inputParams }
  for (const [parameterName, rawValue] of entries) {
    const parameter = parameters.get(parameterName)
    if (parameter === undefined) {
      invalidAssetReference(
        parameterName,
        `${parameterName} is not a supported model parameter`,
        `${parameterName} 不是该模型支持的参数`,
      )
    }
    if (parameter.type !== 'media') {
      invalidAssetReference(
        parameterName,
        `${parameterName} is not a media parameter`,
        `${parameterName} 不是媒体参数`,
      )
    }

    const ids = referenceIds(rawValue)
    const allowsMultiple = (parameter.maxItems ?? 1) > 1
    if (!allowsMultiple && ids.length > 1) {
      invalidAssetReference(
        parameterName,
        `${parameterName} accepts only one asset`,
        `${parameterName} 仅允许一个资产`,
      )
    }
    if (new Set(ids).size !== ids.length) {
      invalidAssetReference(
        parameterName,
        `${parameterName} contains duplicate assets`,
        `${parameterName} 包含重复资产`,
      )
    }

    normalizedRefs[parameterName] = ids
    validationParams[parameterName] = allowsMultiple
      ? ids.map((_, index) => `asset://validation/${parameterName}/${index}`)
      : `asset://validation/${parameterName}/0`
  }

  const validation = validateModelParams(manifest, validationParams)
  if (!validation.valid) {
    throw new GenerationRepositoryError(
      'INVALID_GENERATION_PARAMS',
      'Invalid generation params',
      { issues: validation.errors },
    )
  }

  const params = Object.fromEntries(
    Object.entries(validation.params).filter(([name]) => !mediaParameters.has(name)),
  )
  return { params, pricingParams: validation.params, assetRefs: normalizedRefs }
}

function flattenAssetRefs(assetRefs: GenerationAssetRefs | undefined): Array<{
  parameterName: string
  position: number
  assetId: string
}> {
  if (assetRefs === undefined) return []
  return Object.entries(assetRefs)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([parameterName, value]) =>
      referenceIds(value).map((assetId, position) => ({ parameterName, position, assetId })),
    )
}

/** 在事务内锁定被引用的资产行（FOR UPDATE），并校验归属、就绪状态与媒体类型。 */
async function lockAndValidateGenerationAssets(
  tx: BailianStudioTx,
  input: {
    userId: string
    manifest: FrozenModelManifest
    assetRefs?: GenerationAssetRefs
    allowDeleted: boolean
  },
): Promise<void> {
  const bindings = flattenAssetRefs(input.assetRefs)
  if (bindings.length === 0) return
  const uniqueAssetIds = [...new Set(bindings.map(binding => binding.assetId))].sort()
  const rows = await tx
    .select()
    .from(userAssets)
    .where(inArray(userAssets.id, uniqueAssetIds))
    .orderBy(asc(userAssets.id))
    .for('update')
  const byId = new Map(rows.map(row => [row.id, row] as const))

  for (const binding of bindings) {
    const asset = byId.get(binding.assetId)
    if (
      asset === undefined ||
      asset.userId !== input.userId ||
      asset.status !== 'ready' ||
      (!input.allowDeleted && asset.deletedAt !== null)
    ) {
      invalidAssetReference(
        binding.parameterName,
        'The selected asset is unavailable',
        '所选资产不可用',
      )
    }

    const parameter = input.manifest.parameters.find(item => item.name === binding.parameterName)
    if (parameter?.type !== 'media' || parameter.mediaKind === undefined) {
      invalidAssetReference(
        binding.parameterName,
        `${binding.parameterName} is not a supported media parameter`,
        `${binding.parameterName} 不是支持的媒体参数`,
      )
    }
    if (asset.kind !== parameter.mediaKind) {
      invalidAssetReference(
        binding.parameterName,
        `${binding.parameterName} requires a ${parameter.mediaKind} asset`,
        `${binding.parameterName} 需要 ${parameter.mediaKind} 类型资产`,
      )
    }
  }
}

/** 把 generation_input_assets 的查询行按参数名重新聚合成有序的资产引用。 */
function refsFromRows(
  rows: ReadonlyArray<{ parameterName: string; position: number; assetId: string }>,
): GenerationAssetRefs | undefined {
  if (rows.length === 0) return undefined
  const grouped = new Map<string, Array<{ position: number; assetId: string }>>()
  for (const row of rows) {
    const current = grouped.get(row.parameterName) ?? []
    current.push({ position: row.position, assetId: row.assetId })
    grouped.set(row.parameterName, current)
  }
  const refs: GenerationAssetRefs = {}
  for (const parameterName of [...grouped.keys()].sort()) {
    const ids = grouped.get(parameterName)!
      .sort((left, right) => left.position - right.position)
      .map(({ assetId }) => assetId)
    refs[parameterName] = ids
  }
  return refs
}

/** 把任意值递归规范化成字符串（对象键排序、数组保持顺序），用于幂等比较。 */
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

/**
 * 把 Error / TaskError 转成可入库的 JSON 记录。
 * 通过 `'category' in error` 区分这两种类型——TaskError 携带 category/retriable
 * 等结构化字段（用于后续重试决策），普通 Error 只保存 name/message/stack。
 */
function errorToJsonRecord(error: Error | TaskError): Record<string, unknown> {
  if ('category' in error) {
    // TaskError 分支：保留分类与可重试信息
    return {
      category: error.category,
      message: error.message,
      retriable: error.retriable,
      code: error.code,
      ...(error.details !== undefined ? { details: error.details } : {}),
    }
  }

  // 普通 Error 分支：仅保留排查用的字段
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  }
}

export interface CreateGenerationRepositoryOptions {
  db: BailianStudioDb
}

function mapCreditLedgerError(error: unknown): GenerationRepositoryError | undefined {
  if (!(error instanceof CreditLedgerError)) return undefined
  const code = error.code === 'POINTS_DATABASE_ERROR'
    ? 'DATABASE_ERROR'
    : error.code === 'POINTS_GRANT_INVALID'
      ? 'DATABASE_ERROR'
      : error.code === 'POINTS_ADJUSTMENT_INVALID'
        ? 'DATABASE_ERROR'
        : error.code === 'POINTS_INVALID_CURSOR'
          ? 'DATABASE_ERROR'
          : error.code === 'POINTS_CONFIRMATION_REQUIRED'
            ? 'DATABASE_ERROR'
      : error.code
  return new GenerationRepositoryError(code, error.message, error.details)
}

/** claimNextQueuedTask 的入参：worker 标识、当前时间、锁过期时间。 */
export interface ClaimNextQueuedTaskInput {
  workerId: string
  now: string
  lockedUntil: string
}

/** 延长一条运行中 task 的租约；只有当前 worker 仍持有未过期锁时才成功。 */
export interface RenewTaskLockInput {
  taskId: string
  workerId: string
  now: string
  lockedUntil: string
}

/** 保存 task 时可选的所有权护栏，避免旧 worker 覆盖新 worker 的结果。 */
export interface SaveTaskOptions {
  expectedWorkerId?: string
}

export interface GenerationEstimate {
  modelId: string
  provider: string
  providerModel: string
  category: string
  params: Record<string, unknown>
  costEstimate: number
  currency: 'CNY'
}

export interface DailyGenerationUsage {
  /** 生成尝试次数，包含 failed 与 cancelled 的记录。 */
  attemptCount: number
  /** provider 侧成功的生成数（usage 状态为 settled）。 */
  successfulCount: number
  /** 已废弃的 attemptCount 传输别名。 */
  generationCount: number
  estimatedCents: number
  chargedCents: number
  providerCostCents: number
}

export interface DailyGenerationUsageInput {
  userId: string
  since: string
  until: string
}

/** 时间窗口内的用量聚合，供每日限额与月度报表复用。 */
export type GenerationUsage = DailyGenerationUsage
export type GenerationUsageInput = DailyGenerationUsageInput

/** 管理后台调用统计：窗口内调用总数，按模型、按(小时, 模型)聚合。 */
export interface GenerationCallStats {
  total: number
  byModel: Array<{ modelId: string; count: number }>
  byHour: Array<{ hour: number; modelId: string; count: number }>
}

/** 清扫器输入：找「任务已终态失败/取消、记录仍卡在 submitting/processing」的 generation。 */
export interface ListStuckGenerationRecordsInput {
  /** 判断「卡住」的时长下限，默认 10 分钟。 */
  staleAfterMs?: number
  now?: string
  limit?: number
}

/**
 * 生成 repository 的对外契约。
 *
 * 这是 services 层唯一可调用的持久化接口集合。每个方法的语义与边界（事务、
 * 幂等、并发安全、状态机推进）请参见各方法的实现 doc。
 */
export interface GenerationRepository {
  createGeneration(input: CreateGenerationInput): Promise<CreateGenerationResult>
  listGenerationRecords(userId: string, options?: ListGenerationRecordsOptions): Promise<ListGenerationRecordsResult>
  getGenerationRecord(id: string): Promise<GenerationRecord | undefined>
  setGenerationLibraryState(input: SetGenerationLibraryStateInput): Promise<GenerationRecord>
  /** Worker 内部读模型；切勿把存储坐标通过 HTTP 暴露。 */
  getGenerationInputAssets(recordId: string): Promise<GenerationInputAsset[]>
  /** 清扫器：列出「任务已终态失败/取消、记录仍卡住」的 generation（可选能力）。 */
  listStuckGenerationRecords?(input?: ListStuckGenerationRecordsInput): Promise<GenerationRecord[]>
  getGenerationDiagnostics?: (id: string) => Promise<GenerationDiagnostics | undefined>
  updateGenerationRecord(id: string, patch: UpdateGenerationRecordPatch): Promise<GenerationRecord>
  markGenerationProcessing(input: MarkGenerationProcessingInput): Promise<GenerationRecord>
  scheduleGenerationPoll(input: ScheduleGenerationPollInput): Promise<{ record: GenerationRecord; task: TaskRecord }>
  completeGeneration(input: CompleteGenerationInput): Promise<CompleteGenerationResult>
  failGeneration(input: FailGenerationInput): Promise<GenerationRecord>
  /**
   * 以「取消」终态收尾一条生成（status=cancelled）。与 failGeneration 的区别：
   * 本方法只写 cancelled，不写 failed——确保已被用户取消的记录不会被 worker
   * 的取消短路误覆盖成 failed。worker 的取消短路应调用本方法而非 failGeneration。
   */
  cancelGeneration(input: CancelGenerationInput): Promise<GenerationRecord>
  /**
   * 「我的作品库」：按用户列出 artifact（keyset 分页，可选 kind 过滤）。
   * 用于作品库页面展示当前用户拥有的所有成品。
   */
  listArtifactsForUser(userId: string, options?: ListGenerationArtifactsOptions): Promise<ListGenerationArtifactsResult>
  /** 读取本地对象前确认它属于当前用户；不存在或已删除时返回 undefined。 */
  getOwnedStorageObject(input: GetOwnedStorageObjectInput): Promise<OwnedStorageObject | undefined>
  /**
   * 请求取消一条生成：仅翻 cancel 标志位，不在 provider 侧真正发起取消。
   * 非 owner 或不存在统一报 GENERATION_NOT_FOUND；终态记录报 GENERATION_NOT_CANCELLABLE。
   */
  requestGenerationCancel(input: RequestGenerationCancelInput): Promise<GenerationRecord>
  /**
   * 重跑一条 failed/cancelled 生成：以原 modelId + inputParams 起新记录，
   * parentRecordId 指回原记录。非 owner 报 GENERATION_NOT_FOUND；
   * 非可重跑态（submitting/processing/succeeded）报 GENERATION_NOT_RETRYABLE。
   */
  retryGeneration(input: RetryGenerationInput): Promise<CreateGenerationResult>
  listArtifactsForRecord(recordId: string): Promise<GenerationArtifact[]>
  /** 批量版本，供分页任务列表使用，避免每条记录各查一次。 */
  listArtifactsForRecords(recordIds: readonly string[]): Promise<GenerationArtifact[]>
  listPendingArtifactsForRecord(recordId: string): Promise<GenerationArtifact[]>
  markArtifactStored(input: MarkArtifactStoredInput): Promise<GenerationArtifact>
  markArtifactFailed(input: MarkArtifactFailedInput): Promise<GenerationArtifact>
  claimNextQueuedTask(input: ClaimNextQueuedTaskInput): Promise<TaskRecord | undefined>
  renewTaskLock(input: RenewTaskLockInput): Promise<TaskRecord | undefined>
  saveTask(task: TaskRecord, options?: SaveTaskOptions): Promise<TaskRecord | undefined>
  getTask(id: string): Promise<TaskRecord | undefined>
  listGenerationEvents(options?: ListGenerationEventsOptions): Promise<GenerationEvent[]>
  /** 在可选的用户 scope 内解析一个持久化 SSE 游标。 */
  getGenerationEvent(id: string, userId?: string): Promise<GenerationEvent | undefined>
  getLatestGenerationEvent(): Promise<GenerationEvent | undefined>
  createGenerationShare(input: CreateGenerationShareInput): Promise<GenerationShare>
  getGenerationShareForRecord(input: GetGenerationShareForRecordInput): Promise<GenerationShare | undefined>
  revokeGenerationShare(input: RevokeGenerationShareInput): Promise<GenerationShare | undefined>
  getPublicSharedGeneration(shareId: string): Promise<PublicSharedGeneration | undefined>
  /** 公开分享的内部对象读取查询；只供 API 生成分享专属读取响应。 */
  getPublicSharedArtifact(shareId: string, artifactId: string): Promise<GenerationArtifact | undefined>

  /** 只读数据库探针，供 API readiness 端点使用。 */
  healthCheck?: () => Promise<void>

  /** 注册/更新进程存活状态，用于区分 API 健康与 worker 健康。 */
  registerWorkerHeartbeat?: (input: RegisterWorkerHeartbeatInput) => Promise<WorkerHeartbeat>
  touchWorkerHeartbeat?: (workerId: string, now?: string) => Promise<WorkerHeartbeat | undefined>
  stopWorkerHeartbeat?: (workerId: string, now?: string) => Promise<WorkerHeartbeat | undefined>
  getWorkerHealth?: (input?: { now?: string; staleAfterMs?: number }) => Promise<WorkerHealth>

  /** 只读的每日用量聚合，用于任务/成本限额的预检。 */
  getDailyGenerationUsage?: (input: DailyGenerationUsageInput) => Promise<DailyGenerationUsage>

  /** 只读用量聚合，支持任意报表时间窗口，包括当月。 */
  getGenerationUsage?: (input: GenerationUsageInput) => Promise<GenerationUsage>

  /** 管理后台调用统计：时间窗口内的调用总数 + 按模型 / 按(小时,模型) 聚合。 */
  countGenerationCallsBetween(since: string, until: string): Promise<GenerationCallStats>

  startProviderRequest(input: StartProviderRequestInput): Promise<ProviderRequestAudit>
  finishProviderRequest(input: FinishProviderRequestInput): Promise<ProviderRequestAudit | undefined>
  recordAuditEvent(input: RecordAuditEventInput): Promise<AuditLog>

  /** 插入一条用户上传/导入的资产记录（user_assets 表）。 */
  createUserAsset(input: CreateUserAssetInput): Promise<void>
  /** 仅 Worker 使用的来源查询，供持久化缩略图衍生任务读取。 */
  getAssetThumbnailSource(derivativeId: string): Promise<AssetThumbnailSource | undefined>
  markAssetThumbnailProcessing(input: MarkAssetThumbnailProcessingInput): Promise<boolean>
  completeAssetThumbnail(input: CompleteAssetThumbnailInput): Promise<void>
  failAssetThumbnail(input: FailAssetThumbnailInput): Promise<void>

  /**
   * 统一的资产列表：合并 user_assets（upload/link）与 generation_artifacts（generation），
   * 按请求的 time/title/size 稳定元组排序，并使用与排序及过滤条件绑定的 keyset 游标分页。
   */
  listUnifiedAssets(userId: string, options?: ListUnifiedAssetsOptions): Promise<ListUnifiedAssetsResult>
  getUserAsset(input: {
    userId: string
    assetId: string
    includeDeleted?: boolean
  }): Promise<UnifiedAssetItem | undefined>
  softDeleteUserAsset(input: {
    userId: string
    assetId: string
    now?: string
  }): Promise<boolean>

  // -------------------------------------------------------------------------
  // 社区画廊（content.ts 实现）：作品可见性 / 画廊 / 收藏点赞。
  // -------------------------------------------------------------------------
  setGenerationVisibility(input: {
    userId: string
    recordId: string
    visibility: GalleryVisibility
    now?: string
  }): Promise<GenerationRecord>
  listGalleryGenerations(input: {
    cursor?: string
    limit?: number
    category?: ModelCategory
    modelId?: string
    authorId?: string
    q?: string
    sort?: GallerySort
    viewerId?: string
  }): Promise<ListGalleryResult>
  getGalleryGeneration(input: { recordId: string; viewerId?: string }): Promise<GalleryDetail | undefined>
  getGalleryArtifact(input: { recordId: string; artifactId: string }): Promise<GenerationArtifact | undefined>
  setGenerationLike(input: {
    userId: string
    recordId: string
    liked: boolean
  }): Promise<{ liked: boolean; likeCount: number }>
  setGenerationFavorite(input: {
    userId: string
    recordId: string
    favorited: boolean
  }): Promise<{ favorited: boolean }>
  /** 查询 viewer 是否已收藏某记录；记录对 viewer 不可见时返回 undefined。 */
  getGenerationFavorited(input: { userId: string; recordId: string }): Promise<boolean | undefined>
  listGenerationFavorites(input: { userId: string; cursor?: string; limit?: number }): Promise<ListGalleryResult>

  // -------------------------------------------------------------------------
  // 社区治理（admin）：含隐藏作品的画廊列表 + 下架/恢复 + 封禁联动。
  // -------------------------------------------------------------------------
  listAdminGalleryGenerations(input: {
    cursor?: string
    limit?: number
    includeHidden?: boolean
    q?: string
    authorId?: string
  }): Promise<ListAdminGalleryResult>
  /** admin 画廊产物读取：不检查 hiddenAt（治理需预览已隐藏作品）。 */
  getAdminGalleryArtifact(input: { recordId: string; artifactId: string }): Promise<GenerationArtifact | undefined>
  /** admin 画廊一条记录的全部产物（stored 未删），不检查 hiddenAt；供预览弹窗多图切换。 */
  listAdminGalleryRecordArtifacts(input: { recordId: string }): Promise<GenerationArtifact[]>
  setGalleryRecordHidden(input: { recordId: string; hidden: boolean; actorId: string }): Promise<void>
  /** admin 批量下架/恢复：只返回实际状态翻转的记录 id（hide 只命中未藏，unhide 只命中已藏）。 */
  setGalleryRecordsHidden(input: { recordIds: string[]; hidden: boolean; actorId: string }): Promise<string[]>
  /** admin 批量软删（可恢复）：仅限 public+succeeded 未删记录。 */
  softDeleteGalleryRecords(input: { recordIds: string[]; actorId: string }): Promise<string[]>
  /** 封禁联动：把某用户全部公开成功且未隐藏的作品批量置 hiddenAt。 */
  hideUserPublicWorks(input: { userId: string; actorId: string }): Promise<number>

  // -------------------------------------------------------------------------
  // 管理后台 · 任务中心：全量 task_records 列表（含进行中 + 已完成）。
  // -------------------------------------------------------------------------
  listAdminTasks(input: {
    cursor?: string
    limit?: number
    status?: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
    type?: string
    domain?: string
    userId?: string
    recordId?: string
  }): Promise<ListAdminTasksResult>

  // -------------------------------------------------------------------------
  // 社交通知：作者收到点赞/收藏通知。
  // -------------------------------------------------------------------------
  /** 读取记录作者 id（不存在或已删除返回 undefined）。 */
  getGenerationOwner(recordId: string): Promise<string | undefined>
  createSocialNotification(input: {
    recipientId: string
    actorId?: string
    kind: NotificationKind
    recordId?: string
    title: string
    body: string
  }): Promise<void>
  listNotifications(input: { userId: string; cursor?: string; limit?: number }): Promise<ListNotificationsResult>
  countUnreadNotifications(userId: string): Promise<number>
  markNotificationRead(input: { userId: string; notificationId: string }): Promise<boolean>
  markAllNotificationsRead(userId: string): Promise<number>

  listPromptLibrary(input: { userId: string; cursor?: string; limit?: number; q?: string }): Promise<ListPromptLibraryResult>
  createPromptLibraryItem(input: {
    userId: string
    name: string
    modelId: string
    prompt: string
    params: Record<string, unknown>
  }): Promise<PromptLibraryItem>
  updatePromptLibraryItem(input: {
    userId: string
    itemId: string
    name?: string
    prompt?: string
    params?: Record<string, unknown>
  }): Promise<PromptLibraryItem>
  deletePromptLibraryItem(input: { userId: string; itemId: string }): Promise<void>
  listModelCosts(): Promise<ModelCost[]>
  upsertModelCosts(entries: Array<{ modelId: string; unitCostCents: number }>): Promise<void>
  getCostMarginAnalytics(input: { from: string; to: string }): Promise<CostMarginRow[]>
  getRetentionAnalytics(input: { since: string }): Promise<RetentionAnalytics>
  submitFeedback(input: { userId: string; kind: FeedbackKind; content: string }): Promise<UserFeedback>
  listFeedback(input: { cursor?: string; limit?: number; status?: FeedbackStatus }): Promise<ListFeedbackResult>
  listMyFeedback(input: { userId: string; cursor?: string; limit?: number }): Promise<ListFeedbackResult>
  updateFeedbackStatus(input: { itemId: string; status: FeedbackStatus; resolvedBy: string }): Promise<UserFeedback>
  submitContentReport(input: {
    reporterId: string
    generationId: string
    reason: ContentReportReason
    details?: string
  }): Promise<ContentReport>
  listContentReports(input: {
    cursor?: string
    limit?: number
    status?: ContentReportStatus
  }): Promise<ListContentReportsResult>
  updateContentReport(input: {
    reportId: string
    status: ContentReportStatus
    resolvedBy: string
    resolutionNote?: string
  }): Promise<ContentReport>
}

type BailianStudioTx = Parameters<Parameters<BailianStudioDb['transaction']>[0]>[0]

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer U)[]
    ? readonly DeepReadonly<U>[]
    : T extends object
      ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
      : T

/**
 * 把 registry 中「深度冻结」的 manifest 还原成可变副本。
 * registry 在加载时被 deep-freeze，这里做一次浅 + 关键嵌套字段的拷贝，
 * 让 validateModelParams / estimatePriceCents 等函数可以放心操作而不破坏
 * 全局共享的 manifest 实例。`request` 走 structuredClone 是因为它结构较深。
 */
function mutableManifest(manifest: DeepReadonly<ModelManifest> | FrozenModelManifest): ModelManifest {
  return {
    ...manifest,
    capabilities: [...manifest.capabilities],
    parameters: manifest.parameters.map(parameter => ({
      ...parameter,
      options: parameter.options?.map(option => ({ ...option })),
      ...(parameter.conditional !== undefined
        ? { conditional: { ...parameter.conditional, when: { ...parameter.conditional.when } } }
        : {}),
    })),
    rules: manifest.rules === undefined
      ? undefined
      : structuredClone(manifest.rules) as ModelValidationRule[],
    request: structuredClone(manifest.request),
    output: { ...manifest.output },
    pricing: {
      ...manifest.pricing,
      rates: manifest.pricing.rates.map(rate => ({
        ...rate,
        conditions: { ...rate.conditions },
      })),
    },
    transport: structuredClone(manifest.transport) as ProviderTransport,
    availability: { ...manifest.availability },
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

/**
 * 把记录投影成公开只读模型：剥除所有 owner 标识 / cost / task / provider /
 * outputResult 等敏感字段。分享页对外只暴露用户可见的安全字段。
 */
function toPublicSharedRecord(record: GenerationRecord, includeParams: boolean): PublicSharedGenerationRecord {
  return {
    id: record.id,
    modelId: record.modelId,
    provider: record.provider,
    providerModel: record.providerModel,
    category: record.category,
    ...(includeParams ? { inputParams: record.inputParams } : {}),
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

/**
 * 把 artifact 投影成公开只读模型：去掉 userId / errorJson，也不含 readUrl——
 * readUrl 由 API 层从 storage 适配器拼出后附加，repository 永远不调用 storage。
 */
function toPublicSharedArtifact(artifact: GenerationArtifact): PublicSharedGenerationArtifact {
  return {
    id: artifact.id,
    kind: artifact.kind,
    ...(artifact.mimeType !== undefined ? { mimeType: artifact.mimeType } : {}),
    ...(artifact.byteSize !== undefined ? { byteSize: artifact.byteSize } : {}),
    status: artifact.status,
    createdAt: artifact.createdAt,
  }
}

/** 把可选的 ISO 时间字符串解析成 Date | null（undefined → null，用于 SQL 写入）。 */
function parseDate(value: string | undefined): Date | null {
  return value === undefined ? null : new Date(value)
}

function activeShareCondition(shareId: string, now: Date) {
  return and(
    eq(generationShares.id, shareId),
    isNull(generationShares.deletedAt),
    isNull(generationShares.revokedAt),
    or(isNull(generationShares.expiresAt), gt(generationShares.expiresAt, now)),
    isNull(generationRecords.deletedAt),
  )
}

const ACTIVE_GENERATION_LIST_STATUSES = [
  'draft',
  'submitting',
  'queued',
  'processing',
  'provider_processing',
  'saving_output',
] as const

function defaultGenerationListCondition() {
  return and(
    isNull(generationRecords.hiddenAt),
    isNull(generationRecords.deletedAt),
  )
}

/**
 * 库视图以 OR 组合，让用户可以同时查看如 completed 与 hidden 的记录。
 * 执行状态与 owner 的展示状态相互独立。
 */
function generationListViewCondition(
  views: readonly GenerationListView[] | undefined,
) {
  if (views === undefined || views.length === 0) {
    return defaultGenerationListCondition()
  }

  const requested = new Set(views)
  const conditions = []
  if (requested.has('completed')) {
    conditions.push(and(
      defaultGenerationListCondition(),
      eq(generationRecords.status, 'succeeded'),
    ))
  }
  if (requested.has('active')) {
    conditions.push(and(
      defaultGenerationListCondition(),
      inArray(generationRecords.status, ACTIVE_GENERATION_LIST_STATUSES),
    ))
  }
  if (requested.has('hidden')) {
    conditions.push(and(
      isNotNull(generationRecords.hiddenAt),
      isNull(generationRecords.deletedAt),
    ))
  }
  if (requested.has('deleted')) {
    conditions.push(isNotNull(generationRecords.deletedAt))
  }

  return or(...conditions) ?? defaultGenerationListCondition()
}

/**
 * 把领域 TaskRecord 拼成 task_records 表的 insert/update 列值。
 * 所有 ISO 时间字符串在这里转回 Date；errorJson 走 safeParseJsonRecord 兜底。
 */
function taskInsertValues(task: TaskRecord) {
  return {
    id: task.id,
    type: task.type,
    domain: task.domain,
    status: task.status,
    priority: task.priority,
    inputJson: task.input,
    outputJson: task.output ?? null,
    lockedBy: task.lockedBy ?? null,
    lockedUntil: parseDate(task.lockedUntil),
    startedAt: parseDate(task.startedAt),
    completedAt: parseDate(task.completedAt),
    attempts: task.attempts,
    maxAttempts: task.maxAttempts,
    nextRunAt: new Date(task.nextRunAt),
    errorJson: safeParseJsonRecord(task.errorJson),
    recordId: task.recordId ?? null,
    userId: task.userId ?? null,
    traceId: task.traceId ?? null,
    createdAt: new Date(task.createdAt),
    updatedAt: new Date(task.updatedAt),
  }
}

/**
 * 把领域 patch 翻译成 generation_records 的 update 列值。
 * 用 `'key' in patch` 判断而非真值判断——这样显式传 `undefined` 也会被当成
 * 「清空该字段」（写入 null），与上层「明确重置」的语义保持一致。
 */
function generationPatchValues(patch: UpdateGenerationRecordPatch, updatedAt: string) {
  const values: Partial<typeof generationRecords.$inferInsert> = {
    updatedAt: new Date(updatedAt),
  }

  if ('status' in patch) values.status = patch.status
  if ('statusReason' in patch) values.statusReason = patch.statusReason ?? null
  if ('providerTaskId' in patch) values.providerTaskId = patch.providerTaskId ?? null
  if ('providerStatus' in patch) values.providerStatus = patch.providerStatus ?? null
  if ('requestId' in patch) values.requestId = patch.requestId ?? null
  if ('outputResult' in patch) values.outputResultJson = patch.outputResult ?? null
  if ('errorJson' in patch) values.errorJson = patch.errorJson ?? null
  if ('costFinal' in patch) values.costFinal = patch.costFinal ?? null
  if ('parentRecordId' in patch) values.parentRecordId = patch.parentRecordId ?? null
  if ('idempotencyKey' in patch) values.idempotencyKey = patch.idempotencyKey ?? null
  if ('cancelRequestedAt' in patch) values.cancelRequestedAt = parseDate(patch.cancelRequestedAt)
  if ('providerCancelStatus' in patch) values.providerCancelStatus = patch.providerCancelStatus

  return values
}

/**
 * 构造一条后续（follow-up）任务，挂在指定 record 上。
 * 用于 generation.poll / artifact.persist 等「主任务结束后再排程」的衍生任务：
 * 重置 attempts、设置 nextRunAt（poll 时由 provider 的轮询间隔决定），
 * 默认 domain 为 generation（artifact.persist 用 artifact domain）。
 */
function followUpTaskValues(
  record: GenerationRecordRow,
  type: TaskRecord['type'],
  input: Record<string, unknown>,
  now: string,
  nextRunAt = now,
  domain: TaskRecord['domain'] = 'generation',
): TaskRecord {
  return {
    id: nextTaskRecordId(),
    type,
    domain,
    status: 'queued',
    priority: 0,
    input,
    attempts: 0,
    maxAttempts: 3,
    nextRunAt,
    recordId: record.id,
    userId: record.userId,
    ...(record.traceId !== null ? { traceId: record.traceId } : {}),
    createdAt: now,
    updatedAt: now,
  }
}

function thumbnailSourceIsEligible(input: Pick<
  CreateUserAssetInput,
  'kind' | 'storageProvider' | 'storageKey' | 'originalUrl' | 'enqueueThumbnail'
>): boolean {
  if (input.enqueueThumbnail !== true || (input.kind !== 'image' && input.kind !== 'video')) return false
  if (input.storageProvider === 'local' && input.storageKey !== undefined) return true
  if (input.originalUrl === undefined) return false
  try {
    return new URL(input.originalUrl).protocol === 'https:'
  } catch {
    return false
  }
}

async function enqueueAssetThumbnail(
  tx: BailianStudioTx,
  input: CreateUserAssetInput,
  now: string,
): Promise<void> {
  if (!thumbnailSourceIsEligible(input)) return

  const derivativeId = nextAssetDerivativeId()
  const [created] = await tx
    .insert(assetDerivatives)
    .values({
      id: derivativeId,
      assetId: input.id,
      userId: input.userId,
      kind: 'thumbnail',
      status: 'queued',
      createdBy: input.userId,
      updatedBy: input.userId,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    })
    .onConflictDoNothing({
      target: [assetDerivatives.assetId, assetDerivatives.kind],
      where: sql`${assetDerivatives.deletedAt} is null`,
    })
    .returning({ id: assetDerivatives.id })

  if (created === undefined) return

  const task: TaskRecord = {
    id: nextTaskRecordId(),
    type: 'media.thumbnail',
    domain: 'media',
    status: 'queued',
    priority: -5,
    input: { assetId: input.id, derivativeId: created.id },
    attempts: 0,
    maxAttempts: 3,
    nextRunAt: now,
    recordId: created.id,
    userId: input.userId,
    ...(input.traceId !== undefined ? { traceId: input.traceId } : {}),
    createdAt: now,
    updatedAt: now,
  }
  await tx.insert(taskRecords).values(taskInsertValues(task))
}

/**
 * 把 provider 归一化产物中的单个 artifact 字典，拼成 generation_artifacts 表
 * 的 insert 列值。字段缺失时给安全默认（kind 默认 archive），状态初始为 pending，
 * 等待后续的 artifact.persist 任务把它落存储并翻成 stored。
 */
function artifactInsertValues(
  record: GenerationRecordRow,
  artifact: Record<string, unknown>,
  now: string,
): typeof generationArtifacts.$inferInsert {
  return {
    id: nextArtifactId(),
    recordId: record.id,
    userId: record.userId,
    kind: typeof artifact['kind'] === 'string' ? artifact['kind'] : 'archive',
    sourceUrl: typeof artifact['sourceUrl'] === 'string' ? artifact['sourceUrl'] : null,
    text: typeof artifact['text'] === 'string' ? artifact['text'] : null,
    mimeType: typeof artifact['mimeType'] === 'string' ? artifact['mimeType'] : null,
    status: 'pending',
    createdAt: new Date(now),
    updatedAt: new Date(now),
  }
}

/**
 * 构造「翻到 processing」的 patch：只携带上层实际传入的 provider 字段，
 * 避免用 undefined 覆盖已有值。状态固定写 `processing`（repository 内部中间态）。
 */
function processingPatch(input: MarkGenerationProcessingInput): UpdateGenerationRecordPatch {
  return {
    status: 'processing',
    ...(input.providerTaskId !== undefined ? { providerTaskId: input.providerTaskId } : {}),
    ...(input.providerStatus !== undefined ? { providerStatus: input.providerStatus } : {}),
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
  }
}

/** 把归一化输出与可选的 raw 合并成最终写入 outputResultJson 的对象。 */
function completionOutput(input: CompleteGenerationInput): Record<string, unknown> {
  return {
    ...input.output,
    ...(input.raw !== undefined ? { raw: input.raw } : {}),
  }
}

/** 取某条 record 最早创建的那条任务（用于幂等场景下还原 createGeneration 的返回值）。 */
async function getFirstTaskForRecord(db: BailianStudioDb | BailianStudioTx, recordId: string): Promise<TaskRecordRow | undefined> {
  const [task] = await db
    .select()
    .from(taskRecords)
    .where(eq(taskRecords.recordId, recordId))
    .orderBy(asc(taskRecords.createdAt))
    .limit(1)
  return task
}

/** 幂等命中的记录必须能找到对应任务，否则视为数据不一致并抛错。 */
function requireTaskForIdempotentRecord(task: TaskRecordRow | undefined, recordId: string): TaskRecordRow {
  if (!task) {
    throw new GenerationRepositoryError('DATABASE_ERROR', `Idempotent generation record has no task: ${recordId}`)
  }
  return task
}

interface ExpectedIdempotentRequest {
  modelId: string
  params: Record<string, unknown>
  assetRefs?: GenerationAssetRefs
}

async function readGenerationInputAssetRows(
  db: BailianStudioDb | BailianStudioTx,
  generationIds: readonly string[],
): Promise<Array<{
  generationId: string
  parameterName: string
  position: number
  assetId: string
}>> {
  if (generationIds.length === 0) return []
  return db
    .select({
      generationId: generationInputAssets.generationId,
      parameterName: generationInputAssets.parameterName,
      position: generationInputAssets.position,
      assetId: generationInputAssets.assetId,
    })
    .from(generationInputAssets)
    .where(inArray(generationInputAssets.generationId, [...generationIds]))
    .orderBy(
      asc(generationInputAssets.generationId),
      asc(generationInputAssets.parameterName),
      asc(generationInputAssets.position),
    )
}

async function toGenerationRecordsWithAssetRefs(
  db: BailianStudioDb | BailianStudioTx,
  rows: readonly GenerationRecordRow[],
): Promise<GenerationRecord[]> {
  const refRows = await readGenerationInputAssetRows(db, rows.map(row => row.id))
  const byGeneration = new Map<string, typeof refRows>()
  for (const row of refRows) {
    const current = byGeneration.get(row.generationId) ?? []
    current.push(row)
    byGeneration.set(row.generationId, current)
  }
  return rows.map(row =>
    toGenerationRecord(
      row,
      refsFromRows(byGeneration.get(row.id) ?? []),
    ),
  )
}

/**
 * 幂等查询：按 (userId, idempotencyKey) 找已存在的 generation 记录，
 * 命中则还原成 CreateGenerationResult 返回。这是 createGeneration 在「同 key
 * 重放」时直接复用既有结果的路径。
 */
async function getIdempotentGenerationResult(
  db: BailianStudioDb | BailianStudioTx,
  userId: string,
  idempotencyKey: string,
  expected: ExpectedIdempotentRequest,
): Promise<CreateGenerationResult | undefined> {
  const [existing] = await db
    .select()
    .from(generationRecords)
    .where(and(
      eq(generationRecords.userId, userId),
      eq(generationRecords.idempotencyKey, idempotencyKey),
    ))
    .limit(1)

  if (!existing) return undefined

  const existingRefs = refsFromRows(
    await readGenerationInputAssetRows(db, [existing.id]),
  )
  const existingCanonical = canonicalize({
    modelId: existing.modelId,
    params: existing.inputParamsJson,
    assetRefs: existingRefs ?? {},
  })
  const expectedCanonical = canonicalize({
    modelId: expected.modelId,
    params: expected.params,
    assetRefs: expected.assetRefs ?? {},
  })
  if (existingCanonical !== expectedCanonical) {
    throw new GenerationRepositoryError(
      'IDEMPOTENCY_CONFLICT',
      `Idempotency key '${idempotencyKey}' was already used with different generation input`,
    )
  }

  const task = requireTaskForIdempotentRecord(
    await getFirstTaskForRecord(db, existing.id),
    existing.id,
  )
  const [event] = await db
    .select()
    .from(generationEvents)
    .where(eq(generationEvents.recordId, existing.id))
    .orderBy(asc(generationEvents.createdAt))
    .limit(1)
  if (event === undefined) {
    throw new GenerationRepositoryError('DATABASE_ERROR', `Idempotent generation record has no event: ${existing.id}`)
  }
  return {
    record: toGenerationRecord(existing, existingRefs),
    task: toTaskRecord(task),
    event: toGenerationEvent(event),
  }
}

/**
 * 判断错误是否为 Postgres 唯一约束冲突（SQLSTATE 23505）。
 * 递归 unwrap `cause`，兼容 driver/事务包装层把原始错误嵌套在 cause 链里的情况。
 */
function isUniqueViolation(error: unknown): boolean {
  if (error === null || typeof error !== 'object') return false
  const maybeError = error as { code?: unknown; cause?: unknown }
  return maybeError.code === '23505' || isUniqueViolation(maybeError.cause)
}

async function readGenerationUsage(
  db: BailianStudioDb | BailianStudioTx,
  input: GenerationUsageInput,
): Promise<GenerationUsage> {
  // 只读 generation 级账本，绝不读 provider_request_audits：poll 行是运营证据，
  // 不能乘进用户的成本。
  const [usage] = await db
    .select({
      attemptCount: sql<number>`count(*)::int`,
      successfulCount: sql<number>`count(*) filter (where ${usageRecords.status} = 'settled')::int`,
      estimatedCents: sql<number>`coalesce(sum(${usageRecords.estimatedCostCents}), 0)::int`,
      chargedCents: sql<number>`coalesce(sum(${usageRecords.chargedCostCents}), 0)::int`,
      providerCostCents: sql<number>`coalesce(sum(${usageRecords.providerCostCents}), 0)::int`,
    })
    .from(usageRecords)
    .where(and(
      eq(usageRecords.userId, input.userId),
      gte(usageRecords.createdAt, new Date(input.since)),
      lt(usageRecords.createdAt, new Date(input.until)),
    ))

  return {
    attemptCount: usage?.attemptCount ?? 0,
    successfulCount: usage?.successfulCount ?? 0,
    generationCount: usage?.attemptCount ?? 0,
    estimatedCents: usage?.estimatedCents ?? 0,
    chargedCents: usage?.chargedCents ?? 0,
    providerCostCents: usage?.providerCostCents ?? 0,
  }
}

async function readGenerationCallStats(
  db: BailianStudioDb | BailianStudioTx,
  since: Date,
  until: Date,
): Promise<GenerationCallStats> {
  const where = and(
    gte(generationRecords.createdAt, since),
    lt(generationRecords.createdAt, until),
  )
  const hourExpr = sql`extract(hour from ${generationRecords.createdAt})::int`
  const [byModel, byHour, [totalRow]] = await Promise.all([
    db
      .select({
        modelId: generationRecords.modelId,
        count: sql<number>`count(*)::int`,
      })
      .from(generationRecords)
      .where(where)
      .groupBy(generationRecords.modelId)
      .orderBy(sql`count(*) desc`),
    db
      .select({
        hour: sql<number>`${hourExpr}`,
        modelId: generationRecords.modelId,
        count: sql<number>`count(*)::int`,
      })
      .from(generationRecords)
      .where(where)
      .groupBy(hourExpr, generationRecords.modelId)
      .orderBy(hourExpr),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(generationRecords)
      .where(where),
  ])
  return {
    total: totalRow?.count ?? 0,
    byModel,
    byHour: byHour.map(row => ({ hour: row.hour, modelId: row.modelId, count: row.count })),
  }
}

async function readPendingGenerationCount(
  db: BailianStudioDb | BailianStudioTx,
  input: GenerationUsageInput,
): Promise<number> {
  const [pending] = await db
    .select({ pendingCount: sql<number>`count(*) filter (where ${usageRecords.status} = 'reserved')::int` })
    .from(usageRecords)
    .where(and(
      eq(usageRecords.userId, input.userId),
      gte(usageRecords.createdAt, new Date(input.since)),
      lt(usageRecords.createdAt, new Date(input.until)),
    ))
  return pending?.pendingCount ?? 0
}

function utcDayWindow(now: Date): { since: string; until: string } {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  return { since: since.toISOString(), until: new Date(since.getTime() + 24 * 60 * 60 * 1000).toISOString() }
}

function enforceAtomicGenerationQuota(
  limits: GenerationQuotaLimits,
  usage: GenerationUsage,
  requestedCents: number,
): void {
  const quotaCount = limits.dailyQuotaMode === 'successful' ? usage.successfulCount : usage.attemptCount
  const details = {
    attemptCount: usage.attemptCount,
    successfulCount: usage.successfulCount,
    generationCount: usage.attemptCount,
    estimatedCents: usage.estimatedCents,
    requestedCents,
    dailyQuotaMode: limits.dailyQuotaMode,
    ...(limits.dailyTaskLimit !== undefined ? { dailyTaskLimit: limits.dailyTaskLimit } : {}),
    ...(limits.dailyCostLimitCents !== undefined ? { dailyCostLimitCents: limits.dailyCostLimitCents } : {}),
  }

  if (limits.dailyTaskLimit !== undefined && quotaCount >= limits.dailyTaskLimit) {
    throw new GenerationRepositoryError('GENERATION_DAILY_LIMIT_EXCEEDED', 'Daily generation task limit exceeded', details)
  }
  if (limits.dailyCostLimitCents !== undefined && usage.estimatedCents + requestedCents > limits.dailyCostLimitCents) {
    throw new GenerationRepositoryError('GENERATION_DAILY_LIMIT_EXCEEDED', 'Daily generation cost limit exceeded', details)
  }
}

async function markUsageRecordTerminal(
  db: BailianStudioDb | BailianStudioTx,
  generationId: string,
  status: 'failed' | 'cancelled',
  now: string,
): Promise<void> {
  const [updated] = await db
    .update(usageRecords)
    .set({ status, chargedCostCents: 0, updatedAt: new Date(now) })
    .where(eq(usageRecords.generationId, generationId))
    .returning({ id: usageRecords.id })

  if (!updated) {
    throw new GenerationRepositoryError('DATABASE_ERROR', `Usage record not found: ${generationId}`)
  }
}

/** 退还预留并恰好关闭一次 usage 行。 */
async function refundGenerationInTransaction(
  tx: BailianStudioTx,
  record: GenerationRecordRow,
  now: string,
): Promise<void> {
  try {
    await refundCreditsInTransaction(tx, {
      userId: record.userId,
      generationId: record.id,
      reservedCents: record.costEstimate,
      idempotencyKey: `generation:${record.id}:refund`,
      now: new Date(now),
    })
  } catch (error) {
    throw mapCreditLedgerError(error) ?? error
  }
  await markUsageRecordTerminal(tx, record.id, 'cancelled', now)
}

/**
 * Repository 工厂：注入一个已建好的 BailianStudioDb 句柄，返回完整的 repository 对象。
 * services 层不应直接调用本函数（需要 db 句柄），而是走 test-utils.ts 的
 * `createGenerationRepositoryFromUrl(url)`，后者只要求一个 DATABASE_URL。
 */
export function createGenerationRepository(options: CreateGenerationRepositoryOptions): GenerationRepository {
  const { db } = options

  return {
    async healthCheck() {
      await db.execute(sql`select 1`)
    },

    async registerWorkerHeartbeat(input) {
      const now = input.now ?? nowIso()
      const [row] = await db
        .insert(workerHeartbeats)
        .values({
          workerId: input.workerId,
          status: 'running',
          startedAt: new Date(input.startedAt),
          lastSeenAt: new Date(now),
          stoppedAt: null,
          updatedAt: new Date(now),
        })
        .onConflictDoUpdate({
          target: workerHeartbeats.workerId,
          set: {
            status: 'running',
            startedAt: new Date(input.startedAt),
            lastSeenAt: new Date(now),
            stoppedAt: null,
            updatedAt: new Date(now),
          },
        })
        .returning()

      if (row === undefined) {
        throw new GenerationRepositoryError('DATABASE_ERROR', `Failed to register worker heartbeat: ${input.workerId}`)
      }
      return toWorkerHeartbeat(row)
    },

    async touchWorkerHeartbeat(workerId, now = nowIso()) {
      const [row] = await db
        .update(workerHeartbeats)
        .set({
          status: 'running',
          lastSeenAt: new Date(now),
          updatedAt: new Date(now),
        })
        .where(eq(workerHeartbeats.workerId, workerId))
        .returning()

      return row === undefined ? undefined : toWorkerHeartbeat(row)
    },

    async stopWorkerHeartbeat(workerId, now = nowIso()) {
      const [row] = await db
        .update(workerHeartbeats)
        .set({
          status: 'stopping',
          lastSeenAt: new Date(now),
          stoppedAt: new Date(now),
          updatedAt: new Date(now),
        })
        .where(eq(workerHeartbeats.workerId, workerId))
        .returning()

      return row === undefined ? undefined : toWorkerHeartbeat(row)
    },

    async getWorkerHealth(input = {}) {
      const now = input.now ?? nowIso()
      const staleAfterMs = Math.max(1, input.staleAfterMs ?? 15_000)
      const cutoff = Date.parse(now) - staleAfterMs
      const rows = await db
        .select()
        .from(workerHeartbeats)
        .orderBy(desc(workerHeartbeats.lastSeenAt))

      const workers = rows.map(toWorkerHeartbeat)
      const healthy = rows.some(row => row.status === 'running' && row.lastSeenAt.getTime() >= cutoff)
      return { status: healthy ? 'ok' : 'failed', workers }
    },

    async getDailyGenerationUsage(input) {
      return readGenerationUsage(db, input)
    },

    async getGenerationUsage(input) {
      return readGenerationUsage(db, input)
    },

    async countGenerationCallsBetween(since, until) {
      return readGenerationCallStats(db, new Date(since), new Date(until))
    },

    /**
     * 记录一次 provider 出站调用的开始。
     *
     * 该行先以 started 落库，再由 worker 在 provider 返回后收尾。这样即使
     * worker 在 HTTP 调用期间崩溃，也能从审计表识别「发起但未收尾」的请求，
     * 不把一次可能产生费用的外部调用伪装成从未发生。
     */
    async startProviderRequest(input) {
      const startedAt = input.startedAt ?? nowIso()
      const [inserted] = await db
        .insert(providerRequestAudits)
        .values({
          id: nextProviderRequestAuditId(),
          generationId: input.generationId,
          ...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
          userId: input.userId,
          provider: input.provider,
          providerModel: input.providerModel,
          operation: input.operation,
          status: 'started',
          ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
          ...(input.providerTaskId !== undefined ? { providerTaskId: input.providerTaskId } : {}),
          attempt: input.attempt,
          estimatedCostCents: input.estimatedCostCents,
          startedAt: new Date(startedAt),
          createdAt: new Date(startedAt),
          updatedAt: new Date(startedAt),
        })
        .returning()

      if (!inserted) {
        throw new GenerationRepositoryError('DATABASE_ERROR', `Failed to record provider request for generation: ${input.generationId}`)
      }

      return toProviderRequestAudit(inserted)
    },

    /** 收尾一条 provider 请求审计；找不到行时返回 undefined，供 worker 记录告警。 */
    async finishProviderRequest(input) {
      const completedAt = input.completedAt ?? nowIso()
      const [updated] = await db
        .update(providerRequestAudits)
        .set({
          status: input.status,
          ...(input.providerTaskId !== undefined ? { providerTaskId: input.providerTaskId } : {}),
          ...(input.providerRequestId !== undefined ? { providerRequestId: input.providerRequestId } : {}),
          ...(input.billedCostCents !== undefined ? { billedCostCents: input.billedCostCents } : {}),
          ...(input.error !== undefined ? { errorJson: { ...input.error } } : {}),
          completedAt: new Date(completedAt),
          latencyMs: Math.max(0, Math.round(input.latencyMs)),
          updatedAt: new Date(completedAt),
        })
        .where(eq(providerRequestAudits.id, input.auditId))
        .returning()

      return updated ? toProviderRequestAudit(updated) : undefined
    },

    /**
     * 记录一条产品侧安全审计事件。
     *
     * 事件与业务写入保持独立：API 层以 best-effort 方式调用本方法，审计表
     * 写入失败不会回滚已经完成的登录、生成或资源读取。metadata 由 API 层
     * 先做 primitive-only 脱敏/限长，这里仍复制一份，避免调用方后续修改
     * 同一个对象时影响 Drizzle 的序列化结果。
     */
    async recordAuditEvent(input) {
      const occurredAt = input.occurredAt ?? nowIso()
      const [inserted] = await db
        .insert(auditLogs)
        .values({
          id: nextAuditLogId(),
          ...(input.userId !== undefined ? { userId: input.userId } : {}),
          action: input.action,
          outcome: input.outcome,
          ...(input.targetType !== undefined ? { targetType: input.targetType } : {}),
          ...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
          ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
          ...(input.traceId !== undefined ? { traceId: input.traceId } : {}),
          ...(input.method !== undefined ? { method: input.method } : {}),
          ...(input.path !== undefined ? { path: input.path } : {}),
          ...(input.metadata !== undefined ? { metadataJson: { ...input.metadata } } : {}),
          occurredAt: new Date(occurredAt),
          createdAt: new Date(occurredAt),
          updatedAt: new Date(occurredAt),
        })
        .returning()

      if (inserted === undefined) {
        throw new GenerationRepositoryError('DATABASE_ERROR', `Failed to record audit event: ${input.action}`)
      }

      return toAuditLog(inserted)
    },

    /**
     * 创建一条生成请求。
     *
     * 流程：取 manifest → 校验 params → 估算成本 → 在【一个事务】里
     *  1) 插入 generation_records（status=submitting）；
     *  2) 插入对应的 generation.submit 任务（status=queued）。
     * 任一步失败则整体回滚，不会留下「无任务的记录」或「无记录的任务」。
     *
     * 幂等：若调用方传了 idempotencyKey，先按 (userId, idempotencyKey) 查既有
     * 记录，命中则直接返回；未命中则继续 insert，由数据库的 `(userId,
     * idempotencyKey)` 唯一索引兜底——并发场景下另一事务可能抢先插入，此时
     * catch 到唯一冲突后再做一次幂等查询返回既有结果，保证调用方拿到稳定输出。
     */
    async createGeneration(input) {
      const { estimate, prepared } = prepareGenerationRequest({
        modelId: input.modelId,
        params: input.params,
        ...(input.assetRefs !== undefined ? { assetRefs: input.assetRefs } : {}),
      })
      const model = mutableManifest(estimate.manifest)
      const costEstimate = estimate.costEstimate
      const auditMetadata = getModelAuditMetadata(estimate.manifest)
      const traceId = input.traceId ?? crypto.randomUUID()
      const expectedRequest: ExpectedIdempotentRequest = {
        modelId: model.id,
        params: prepared.params,
        ...(prepared.assetRefs !== undefined ? { assetRefs: prepared.assetRefs } : {}),
      }

      try {
        return await db.transaction(async tx => {
          if (input.idempotencyKey) {
            const existingResult = await getIdempotentGenerationResult(
              tx,
              input.userId,
              input.idempotencyKey,
              expectedRequest,
            )
            if (existingResult) return existingResult
          }

          const createdAt = nowIso()
          if (input.quota !== undefined) {
            // 按用户串行化准入，不持有进程内锁；
            // 事务锁在 commit/rollback 时自动释放。
            await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.userId}, 0))`)
            const window = utcDayWindow(new Date(createdAt))
            const usage = await readGenerationUsage(tx, {
              userId: input.userId,
              since: window.since,
              until: window.until,
            })
            const pendingCount = input.quota.dailyQuotaMode === 'successful'
              ? await readPendingGenerationCount(tx, { userId: input.userId, since: window.since, until: window.until })
              : 0
            enforceAtomicGenerationQuota(input.quota, {
              ...usage,
              successfulCount: usage.successfulCount + pendingCount,
            }, costEstimate)
          }

          await lockAndValidateGenerationAssets(tx, {
            userId: input.userId,
            manifest: model,
            assetRefs: prepared.assetRefs,
            allowDeleted: input.allowDeletedAssetRefs === true,
          })

          const recordRow = {
            id: nextGenerationRecordId(),
            userId: input.userId,
            modelId: model.id,
            provider: model.provider,
            providerModel: model.providerModel,
            category: model.category,
            inputParamsJson: prepared.params,
            status: 'submitting',
            costEstimate,
            currency: model.pricing.currency,
            pricingVersion: auditMetadata.pricingVersion,
            modelManifestHash: auditMetadata.manifestHash,
            traceId,
            providerCancelStatus: 'not_requested',
            idempotencyKey: input.idempotencyKey ?? null,
            batchId: input.batchId ?? null,
            createdAt: new Date(createdAt),
            updatedAt: new Date(createdAt),
          } satisfies typeof generationRecords.$inferInsert

          const [insertedRecord] = await tx
            .insert(generationRecords)
            .values(recordRow)
            .returning()

          if (!insertedRecord) {
            throw new GenerationRepositoryError('DATABASE_ERROR', 'Failed to insert generation record')
          }

          const assetBindings = flattenAssetRefs(prepared.assetRefs)
          if (assetBindings.length > 0) {
            await tx
              .insert(generationInputAssets)
              .values(assetBindings.map(binding => ({
                generationId: insertedRecord.id,
                parameterName: binding.parameterName,
                position: binding.position,
                assetId: binding.assetId,
                createdAt: new Date(createdAt),
              })))
          }

          try {
            await ensureCreditAccountInTransaction(tx, { userId: insertedRecord.userId, now: new Date(createdAt) })
            await reserveCreditsInTransaction(tx, {
              userId: insertedRecord.userId,
              generationId: insertedRecord.id,
              amountCents: insertedRecord.costEstimate,
              idempotencyKey: `generation:${insertedRecord.id}:reserve`,
              now: new Date(createdAt),
            })
          } catch (error) {
            throw mapCreditLedgerError(error) ?? error
          }

          const [insertedUsage] = await tx
            .insert(usageRecords)
            .values({
              id: nextUsageRecordId(),
              generationId: insertedRecord.id,
              userId: insertedRecord.userId,
              modelId: insertedRecord.modelId,
              provider: insertedRecord.provider,
              providerModel: insertedRecord.providerModel,
              category: insertedRecord.category,
              status: 'reserved',
              estimatedCostCents: insertedRecord.costEstimate,
              createdAt: new Date(createdAt),
              updatedAt: new Date(createdAt),
            })
            .returning()

          if (!insertedUsage) {
            throw new GenerationRepositoryError('DATABASE_ERROR', 'Failed to insert generation usage record')
          }

          const task: TaskRecord = {
            id: nextTaskRecordId(),
            type: 'generation.submit',
            domain: 'generation',
            status: 'queued',
            priority: 0,
            input: { recordId: insertedRecord.id },
            attempts: 0,
            maxAttempts: 3,
            nextRunAt: createdAt,
            recordId: insertedRecord.id,
            userId: insertedRecord.userId,
            traceId: insertedRecord.traceId ?? undefined,
            createdAt,
            updatedAt: createdAt,
          }

          const [insertedTask] = await tx
            .insert(taskRecords)
            .values(taskInsertValues(task))
            .returning()

          if (!insertedTask) {
            throw new GenerationRepositoryError('DATABASE_ERROR', 'Failed to insert generation task')
          }

          const [insertedEvent] = await tx
            .insert(generationEvents)
            .values({
              id: nextGenerationEventId(),
              recordId: insertedRecord.id,
              userId: insertedRecord.userId,
              status: insertedRecord.status,
              modelId: insertedRecord.modelId,
              updatedAt: insertedRecord.updatedAt,
              // 所有 outbox 追加时间戳必须来自 PostgreSQL。状态触发事件使用
              // clock_timestamp()；混入应用时钟会导致两个时钟略有偏差时游标
              // 顺序颠倒。毫秒精度保证 Date/ISO 游标往返精确。
              createdAt: sql`date_trunc('milliseconds', clock_timestamp())`,
            })
            .returning()

          if (!insertedEvent) {
            throw new GenerationRepositoryError('DATABASE_ERROR', 'Failed to insert generation created event')
          }

          return {
            record: toGenerationRecord(insertedRecord, prepared.assetRefs),
            task: toTaskRecord(insertedTask),
            event: toGenerationEvent(insertedEvent),
          }
        })
      }
      catch (error) {
        // 并发幂等：另一事务抢先插入了同 key 记录，触发唯一冲突。
        // 此时降级为读既有结果返回；没有 idempotencyKey 或不是唯一冲突则原样抛出。
        if (!input.idempotencyKey || !isUniqueViolation(error)) throw error

        const existingResult = await getIdempotentGenerationResult(
          db,
          input.userId,
          input.idempotencyKey,
          expectedRequest,
        )
        if (existingResult) return existingResult

        throw error
      }
    },

    /**
     * 列出某用户的 generation 记录，使用 keyset 分页。
     *
     * 之所以用 keyset（基于 (createdAt, id) 的比较）而非 offset：offset 在
     * 并发写入下会出现「跳页 / 重复」——翻页期间新插入的记录会让 offset 窗口
     * 漂移；而 keyset 始终以「上一页最后一行的有序元组」为锚点续读，对插入
     * 友好且能直接利用 created_at + id 索引稳定前行。详见 cursor.ts。
     *
     * 多取一行（limit+1）仅用于判断是否还有下一页，不返回给上层。
     */
    async listGenerationRecords(userId, options = {}) {
      const limit = clampLimit(options.limit)
      const cursor = options.cursor !== undefined ? decodeCursor(options.cursor) : undefined

      const conditions = [
        eq(generationRecords.userId, userId),
        generationListViewCondition(options.views),
      ]
      if (options.status !== undefined) {
        conditions.push(eq(generationRecords.status, options.status))
      }
      if (cursor !== undefined) {
        // keyset 续读：取所有在 (createdAt, id) 字典序上严格小于游标的行（DESC）。
        // 游标里的 createdAt 是 ISO 字符串，Postgres 在比较时会自动 coerce 成
        // timestamptz，与其它地方 next_run_at <= ${iso} 的模式一致。
        conditions.push(sql`(${generationRecords.createdAt} < ${cursor.createdAt} OR (${generationRecords.createdAt} = ${cursor.createdAt} AND ${generationRecords.id} < ${cursor.id}))`)
      }

      const rows = await db
        .select()
        .from(generationRecords)
        .where(and(...conditions))
        .orderBy(desc(generationRecords.createdAt), desc(generationRecords.id))
        .limit(limit + 1)

      // 多取的那一行只用于判断 hasMore，本身不进入当前页。
      const hasMore = rows.length > limit
      const page = hasMore ? rows.slice(0, limit) : rows
      const items = await toGenerationRecordsWithAssetRefs(db, page)

      const last = page[page.length - 1]
      const nextCursor = hasMore && last !== undefined
        ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
        : undefined

      return { items, ...(nextCursor !== undefined ? { nextCursor } : {}) }
    },

    /** 按主键取单条记录；不存在返回 undefined（不抛错，由上层决定如何处理）。 */
    async getGenerationRecord(id) {
      const [row] = await db
        .select()
        .from(generationRecords)
        .where(eq(generationRecords.id, id))
        .limit(1)

      if (row === undefined) return undefined
      const [record] = await toGenerationRecordsWithAssetRefs(db, [row])
      return record
    },

    /**
     * 在可见、隐藏与软删除三种库状态之间移动 owner 记录。
     * 刻意不去触碰 generation 状态、排队任务、产物、用量或计费。
     */
    async setGenerationLibraryState(input) {
      const now = input.now ?? nowIso()
      const changedAt = new Date(now)
      const stateValues = input.state === 'visible'
        ? {
            hiddenAt: null,
            hiddenBy: null,
            deletedAt: null,
            deletedBy: null,
          }
        : input.state === 'hidden'
          ? {
              hiddenAt: changedAt,
              hiddenBy: input.userId,
              deletedAt: null,
              deletedBy: null,
            }
          : {
              hiddenAt: null,
              hiddenBy: null,
              deletedAt: changedAt,
              deletedBy: input.userId,
            }

      const [row] = await db
        .update(generationRecords)
        .set({
          ...stateValues,
          updatedAt: changedAt,
          updatedBy: input.userId,
        })
        .where(and(
          eq(generationRecords.id, input.recordId),
          eq(generationRecords.userId, input.userId),
        ))
        .returning()

      if (row === undefined) {
        throw new GenerationRepositoryError(
          'GENERATION_NOT_FOUND',
          `Generation not found: ${input.recordId}`,
        )
      }

      const [record] = await toGenerationRecordsWithAssetRefs(db, [row])
      if (record === undefined) {
        throw new GenerationRepositoryError(
          'DATABASE_ERROR',
          `Generation library state could not be read: ${input.recordId}`,
        )
      }
      return record
    },

    async getGenerationInputAssets(recordId) {
      const rows = await db
        .select({
          generationId: generationInputAssets.generationId,
          parameterName: generationInputAssets.parameterName,
          position: generationInputAssets.position,
          assetId: generationInputAssets.assetId,
          generationUserId: generationRecords.userId,
          assetUserId: userAssets.userId,
          kind: userAssets.kind,
          source: userAssets.source,
          storageProvider: userAssets.storageProvider,
          storageKey: userAssets.storageKey,
          originalUrl: userAssets.originalUrl,
        })
        .from(generationInputAssets)
        .innerJoin(generationRecords, eq(generationRecords.id, generationInputAssets.generationId))
        .innerJoin(userAssets, eq(userAssets.id, generationInputAssets.assetId))
        .where(eq(generationInputAssets.generationId, recordId))
        .orderBy(
          asc(generationInputAssets.parameterName),
          asc(generationInputAssets.position),
        )

      return rows.map(row => {
        if (row.generationUserId !== row.assetUserId) {
          throw new GenerationRepositoryError(
            'DATABASE_ERROR',
            `Generation input asset owner mismatch: ${row.generationId}/${row.assetId}`,
          )
        }
        return {
          generationId: row.generationId,
          parameterName: row.parameterName,
          position: row.position,
          assetId: row.assetId,
          userId: row.generationUserId,
          kind: row.kind as GenerationInputAsset['kind'],
          source: row.source as GenerationInputAsset['source'],
          ...(row.storageProvider !== null
            ? { storageProvider: row.storageProvider as GenerationInputAsset['storageProvider'] }
            : {}),
          ...(row.storageKey !== null ? { storageKey: row.storageKey } : {}),
          ...(row.originalUrl !== null ? { originalUrl: row.originalUrl } : {}),
        }
      })
    },

    /**
     * 返回一条 generation 的安全诊断投影：只包含任务生命周期摘要和 provider
     * 请求审计，不返回任务 input/output、prompt、原始 provider 响应或存储 URL。
     */
    /**
     * 清扫器用：找出「任务已终态失败/取消、但记录仍停在 submitting/processing」的
     * generation 记录。这是 worker catch 的 failGeneration 也失败（DB 全挂）或
     * 进程崩溃时残留的状态。只返回存在 failed/cancelled 任务且 updatedAt 早于
     * staleAfterMs 的记录，避开仍在运行的异步长任务与正常的终态过渡窗口。
     */
    async listStuckGenerationRecords(input) {
      const staleAfterMs = input?.staleAfterMs ?? 10 * 60 * 1000
      const cutoff = new Date(Date.parse(input?.now ?? nowIso()) - staleAfterMs).toISOString()
      const limit = input?.limit ?? 100
      const rows = await db
        .select()
        .from(generationRecords)
        .where(and(
          inArray(generationRecords.status, ['submitting', 'processing']),
          lt(generationRecords.updatedAt, new Date(cutoff)),
          exists(
            db
              .select({ id: taskRecords.id })
              .from(taskRecords)
              .where(and(
                eq(taskRecords.recordId, generationRecords.id),
                inArray(taskRecords.status, ['failed', 'cancelled']),
              )),
          ),
        ))
        .orderBy(asc(generationRecords.updatedAt))
        .limit(limit)
      return rows.map(row => toGenerationRecord(row))
    },

    async getGenerationDiagnostics(id) {
      const [record] = await db
        .select()
        .from(generationRecords)
        .where(eq(generationRecords.id, id))
        .limit(1)

      if (record === undefined) return undefined

      const [taskRows, auditRows] = await Promise.all([
        db
          .select()
          .from(taskRecords)
          .where(eq(taskRecords.recordId, id))
          .orderBy(asc(taskRecords.createdAt), asc(taskRecords.id)),
        db
          .select()
          .from(providerRequestAudits)
          .where(eq(providerRequestAudits.generationId, id))
          .orderBy(asc(providerRequestAudits.startedAt), asc(providerRequestAudits.id)),
      ])

      const tasks: TaskDiagnostics[] = taskRows.map(taskRow => {
        const task = toTaskRecord(taskRow)
        const error = task.errorJson === undefined
          ? undefined
          : {
              category: task.errorJson.category,
              message: task.errorJson.message,
              retriable: task.errorJson.retriable,
              ...(task.errorJson.code !== undefined ? { code: task.errorJson.code } : {}),
            }
        const durationMs = task.startedAt !== undefined && task.completedAt !== undefined
          ? Math.max(0, Date.parse(task.completedAt) - Date.parse(task.startedAt))
          : undefined

        return {
          id: task.id,
          type: task.type,
          status: task.status,
          attempts: task.attempts,
          maxAttempts: task.maxAttempts,
          createdAt: task.createdAt,
          ...(task.startedAt !== undefined ? { startedAt: task.startedAt } : {}),
          ...(task.completedAt !== undefined ? { completedAt: task.completedAt } : {}),
          updatedAt: task.updatedAt,
          ...(error !== undefined ? { error } : {}),
          ...(durationMs !== undefined ? { durationMs } : {}),
        }
      })

      const generationDurationMs = record.status === 'succeeded' || record.status === 'failed' || record.status === 'cancelled'
        ? Math.max(0, record.updatedAt.getTime() - record.createdAt.getTime())
        : undefined

      const diagnostics: GenerationDiagnostics = {
        generationId: record.id,
        ...(record.traceId !== null ? { traceId: record.traceId } : {}),
        ...(generationDurationMs !== undefined ? { generationDurationMs } : {}),
        tasks,
        providerRequests: auditRows.map(toProviderRequestAudit),
      }
      return diagnostics
    },

    /**
     * 按 patch 更新记录。
     * 仅校验「记录存在」，不做状态机合法性校验——上层应通过专门的状态推进方法
     * （markGenerationProcessing / completeGeneration / failGeneration）操作状态，
     * 本方法主要给「非状态的元数据更新」用。
     */
    async updateGenerationRecord(id, patch) {
      const [updated] = await db
        .update(generationRecords)
        .set(generationPatchValues(patch, nowIso()))
        .where(eq(generationRecords.id, id))
        .returning()

      if (!updated) {
        throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Generation record not found: ${id}`)
      }

      return toGenerationRecord(updated)
    },

    /**
     * 把记录翻到 `processing`（repository 内部中间态）。
     *
     * 注意这个状态不属于 event-bus 的 GenerationStatus 联合——它的语义是
     * 「worker 已经认领了 submit 任务，准备向 provider 提交」，比面向前端的
     * `provider_processing` 更靠前。SSE 管线对非终态一视同仁地转发，前端
     * 看不到这个内部区分。本方法不涉及任务入队，仅更新记录。
     */
    async markGenerationProcessing(input) {
      const now = input.now ?? nowIso()
      const [updated] = await db
        .update(generationRecords)
        .set(generationPatchValues(processingPatch(input), now))
        .where(and(
          eq(generationRecords.id, input.recordId),
          isNull(generationRecords.cancelRequestedAt),
          sql`${generationRecords.status} in ('submitting', 'processing')`,
        ))
        .returning()

      if (!updated) {
        const [current] = await db
          .select({ id: generationRecords.id, status: generationRecords.status })
          .from(generationRecords)
          .where(eq(generationRecords.id, input.recordId))
          .limit(1)
        if (!current) {
          throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Generation record not found: ${input.recordId}`)
        }
        throw new GenerationRepositoryError('GENERATION_NOT_PROCESSABLE', `Generation cannot enter processing from status '${current.status}': ${input.recordId}`)
      }

      return toGenerationRecord(updated)
    },

    /**
     * 翻到 `processing` 并入队一条 generation.poll 任务。
     *
     * 两步操作放在【一个事务】里：避免出现「记录已 processing 但没有轮询任务」
     * 的悬空状态——那会让这条生成永久卡住。任务的 nextRunAt 由调用方按
     * provider 的轮询间隔决定，task-engine 的 retry 逻辑据此排程。
     */
    async scheduleGenerationPoll(input) {
      const now = input.now ?? nowIso()

      return db.transaction(async tx => {
        const [updatedRecord] = await tx
          .update(generationRecords)
          .set(generationPatchValues(processingPatch(input), now))
          .where(and(
            eq(generationRecords.id, input.recordId),
            isNull(generationRecords.cancelRequestedAt),
            sql`${generationRecords.status} in ('submitting', 'processing')`,
          ))
          .returning()

        if (!updatedRecord) {
          const [current] = await tx
            .select({ id: generationRecords.id, status: generationRecords.status })
            .from(generationRecords)
            .where(eq(generationRecords.id, input.recordId))
            .limit(1)
          if (!current) {
            throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Generation record not found: ${input.recordId}`)
          }
          throw new GenerationRepositoryError('GENERATION_NOT_PROCESSABLE', `Generation cannot schedule polling from status '${current.status}': ${input.recordId}`)
        }

        // P1-22：插入前查重——同一 record 已存在非终态 poll 任务（上一次 submit 在
        // 落成功态前崩溃/锁丢失、重跑 submit 续轮询）时不重复插，否则 poll 任务会
        // 随重跑指数增长。
        const [existingPoll] = await tx
          .select()
          .from(taskRecords)
          .where(and(
            eq(taskRecords.recordId, updatedRecord.id),
            eq(taskRecords.type, 'generation.poll'),
            inArray(taskRecords.status, ['queued', 'running']),
          ))
          .limit(1)

        if (existingPoll) {
          return {
            record: toGenerationRecord(updatedRecord),
            task: toTaskRecord(existingPoll),
          }
        }

        const task = followUpTaskValues(
          updatedRecord,
          'generation.poll',
          { recordId: updatedRecord.id, providerTaskId: input.providerTaskId },
          now,
          input.nextRunAt ?? now,
        )
        const [insertedTask] = await tx
          .insert(taskRecords)
          .values(taskInsertValues(task))
          .returning()

        if (!insertedTask) {
          throw new GenerationRepositoryError('DATABASE_ERROR', 'Failed to insert generation poll task')
        }

        return {
          record: toGenerationRecord(updatedRecord),
          task: toTaskRecord(insertedTask),
        }
      })
    },

    /**
     * 完成生成（status=succeeded）。
     *
     * 在【一个事务】里：更新记录（写 outputResult、清 errorJson、状态翻 succeeded）
     * + 批量插入 artifacts（初始 status=pending）+ 可选入队 artifact.persist 任务。
     * 全部写入要么一起成功要么一起回滚——避免出现「记录成功但产物没落库」
     * 或「产物入库了但没有持久化任务推进」。
     *
     * enqueueArtifactPersist=true 且本次确有产物时，才会入队 artifact.persist
     * 任务（domain=artifact）；否则只返回 record。产物初始为 pending，由
     * 后续 artifact.persist worker 调用 storage 落盘后再翻成 stored。
     */
    async completeGeneration(input) {
      const now = input.now ?? nowIso()

      return db.transaction(async tx => {
        // 让 complete 与 requestGenerationCancel 串行化。若不加行锁，已经在途的
        // provider 响应可能会覆盖取消请求，并在用户赢得取消竞态后结算 credits。
        const [currentRecord] = await tx
          .select()
          .from(generationRecords)
          .where(eq(generationRecords.id, input.recordId))
          .for('update')

        if (!currentRecord) {
          throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Generation record not found: ${input.recordId}`)
        }

        if (currentRecord.status === 'succeeded') {
          return {
            outcome: 'already_completed' as const,
            record: toGenerationRecord(currentRecord),
          }
        }

        if (currentRecord.status === 'failed') {
          return {
            outcome: 'already_failed' as const,
            record: toGenerationRecord(currentRecord),
          }
        }

        if (
          currentRecord.status === 'cancelled'
          || currentRecord.cancelRequestedAt !== null
        ) {
          const cancelledRecord = currentRecord.status === 'cancelled'
            ? currentRecord
            : (await tx
              .update(generationRecords)
              .set(generationPatchValues({
                status: 'cancelled',
                statusReason: currentRecord.statusReason ?? 'Generation was cancelled before provider completion',
              }, now))
              .where(eq(generationRecords.id, input.recordId))
              .returning())[0]

          if (!cancelledRecord) {
            throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Generation record not found: ${input.recordId}`)
          }

          if (currentRecord.status !== 'cancelled') {
            await refundGenerationInTransaction(tx, cancelledRecord, now)
          }

          return {
            outcome: 'cancelled' as const,
            record: toGenerationRecord(cancelledRecord),
          }
        }

        const [updatedRecord] = await tx
          .update(generationRecords)
          .set(generationPatchValues({
            status: 'succeeded',
            statusReason: undefined,
            ...(input.providerStatus !== undefined ? { providerStatus: input.providerStatus } : {}),
            ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
            costFinal: input.costFinal,
            outputResult: completionOutput(input),
            errorJson: undefined,
          }, now))
          .where(eq(generationRecords.id, input.recordId))
          .returning()

        if (!updatedRecord) {
          throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Generation record not found: ${input.recordId}`)
        }

        let billingAnomaly: { estimatedCents: number; reportedCents: number } | undefined
        try {
          const settlement = await settleCreditsInTransaction(tx, {
            userId: updatedRecord.userId,
            generationId: updatedRecord.id,
            reservedCents: updatedRecord.costEstimate,
            finalCents: input.costFinal,
            idempotencyKey: `generation:${updatedRecord.id}:settle`,
            now: new Date(now),
          })
          if (settlement.anomaly === true) {
            billingAnomaly = {
              estimatedCents: updatedRecord.costEstimate,
              reportedCents: input.costFinal,
            }
          }

          const chargedCents = updatedRecord.costEstimate - settlement.entry.availableDeltaCents
          const [updatedUsage] = await tx
            .update(usageRecords)
            .set({
              status: 'settled',
              providerCostCents: input.costFinal,
              chargedCostCents: chargedCents,
              ...(input.requestId !== undefined ? { providerRequestId: input.requestId } : {}),
              settledAt: new Date(now),
              updatedAt: new Date(now),
            })
            .where(eq(usageRecords.generationId, input.recordId))
            .returning()

          if (!updatedUsage) {
            throw new GenerationRepositoryError('DATABASE_ERROR', `Usage record not found: ${input.recordId}`)
          }
        } catch (error) {
          throw mapCreditLedgerError(error) ?? error
        }

        const artifactRows = input.output.artifacts.map(artifact => artifactInsertValues(updatedRecord, artifact, now))
        if (artifactRows.length > 0) {
          await tx.insert(generationArtifacts).values(artifactRows)
        }

        if (!input.enqueueArtifactPersist || artifactRows.length === 0) {
          return {
            outcome: 'completed' as const,
            record: toGenerationRecord(updatedRecord),
            ...(billingAnomaly !== undefined ? { billingAnomaly } : {}),
          }
        }

        const task = followUpTaskValues(
          updatedRecord,
          'artifact.persist',
          { recordId: updatedRecord.id },
          now,
          now,
          'artifact',
        )
        const [insertedTask] = await tx
          .insert(taskRecords)
          .values(taskInsertValues(task))
          .returning()

        if (!insertedTask) {
          throw new GenerationRepositoryError('DATABASE_ERROR', 'Failed to insert artifact persist task')
        }

        return {
          outcome: 'completed' as const,
          record: toGenerationRecord(updatedRecord),
          task: toTaskRecord(insertedTask),
          ...(billingAnomaly !== undefined ? { billingAnomaly } : {}),
        }
      })
    },

    /**
     * 失败结束生成（status=failed）。
     * 写入 statusReason（error.message）与结构化 errorJson（用于后续重试/分类分析），
     * 不涉及任务入队——失败是终态，重试由调用方在 task-engine 层按 attempts 判断。
     */
    async failGeneration(input) {
      const now = input.now ?? nowIso()
      return db.transaction(async tx => {
        const [currentRecord] = await tx
          .select()
          .from(generationRecords)
          .where(eq(generationRecords.id, input.recordId))
          .for('update')

        if (!currentRecord) {
          throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Generation record not found: ${input.recordId}`)
        }

        // provider 失败可能发生在用户取消请求之后（或另一 worker 已收尾该记录之后）。
        // 保留第一个终态决策，而不是复活或覆盖它。
        if (currentRecord.status === 'succeeded' || currentRecord.status === 'failed') {
          return toGenerationRecord(currentRecord)
        }

        if (currentRecord.status === 'cancelled' || currentRecord.cancelRequestedAt !== null) {
          const cancelledRecord = currentRecord.status === 'cancelled'
            ? currentRecord
            : (await tx
              .update(generationRecords)
              .set(generationPatchValues({
                status: 'cancelled',
                statusReason: currentRecord.statusReason ?? 'Generation was cancelled before provider failure',
              }, now))
              .where(eq(generationRecords.id, input.recordId))
              .returning())[0]

          if (!cancelledRecord) {
            throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Generation record not found: ${input.recordId}`)
          }

          if (currentRecord.status !== 'cancelled') {
            await refundGenerationInTransaction(tx, cancelledRecord, now)
          }

          return toGenerationRecord(cancelledRecord)
        }

        const [updated] = await tx
          .update(generationRecords)
          .set(generationPatchValues({
            status: 'failed',
            statusReason: input.error.message,
            ...(input.providerStatus !== undefined ? { providerStatus: input.providerStatus } : {}),
            ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
            errorJson: errorToJsonRecord(input.error),
          }, now))
          .where(eq(generationRecords.id, input.recordId))
          .returning()

        if (!updated) throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Generation record not found: ${input.recordId}`)

        try {
          await refundCreditsInTransaction(tx, {
            userId: updated.userId,
            generationId: updated.id,
            reservedCents: updated.costEstimate,
            idempotencyKey: `generation:${updated.id}:refund`,
            now: new Date(now),
          })
        } catch (error) {
          throw mapCreditLedgerError(error) ?? error
        }

        await markUsageRecordTerminal(tx, input.recordId, 'failed', now)
        return toGenerationRecord(updated)
      })
    },

    /**
     * 以「取消」终态收尾一条生成（status=cancelled）。
     *
     * 与 failGeneration 的关键区别：这里固定写 status=cancelled（绝不写 failed），
     * 让一条已被用户取消的记录在 worker 取消短路收尾后仍保持 cancelled，而不是被
     * 覆盖成 failed。errorJson 仍写入（保留 category/message/code 便于排查）。
     * 可选 providerCancelStatus 用于覆盖取消标志位（默认不动）。
     *
     * 防御性护栏：succeeded / failed 是终态，绝不可被改写成 cancelled。worker 可能
     * 拿到一条「已完成但残留取消标记」的陈旧任务（取消请求与完成几乎同时发生的竞态），
     * 此时必须拒绝，否则会把一条成功的生成及其产物标记成取消——数据损坏。processing /
     * submitting / cancelled 仍允许推进到 cancelled。
     */
    async cancelGeneration(input) {
      const now = input.now ?? nowIso()

      return db.transaction(async tx => {
        // 在落定取消前锁住记录。陈旧 worker 可能在 provider 成功后调用本方法；
        // 行锁与终态守卫让第一个终态迁移胜出，而不是改写成功结果。
        const [current] = await tx
          .select()
          .from(generationRecords)
          .where(eq(generationRecords.id, input.recordId))
          .for('update')

        if (current === undefined) {
          throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Generation record not found: ${input.recordId}`)
        }
        if (current.status === 'succeeded' || current.status === 'failed') {
          throw new GenerationRepositoryError('GENERATION_NOT_CANCELLABLE', `Generation not cancellable in status '${current.status}': ${input.recordId}`)
        }

        const [updated] = await tx
          .update(generationRecords)
          .set(generationPatchValues({
            status: 'cancelled',
            statusReason: input.error.message,
            errorJson: errorToJsonRecord(input.error),
            ...(input.providerCancelStatus !== undefined ? { providerCancelStatus: input.providerCancelStatus } : {}),
          }, now))
          .where(eq(generationRecords.id, input.recordId))
          .returning()

        if (!updated) {
          throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Generation record not found: ${input.recordId}`)
        }

        if (current.status !== 'cancelled') {
          await refundGenerationInTransaction(tx, updated, now)
        }
        return toGenerationRecord(updated)
      })
    },

    /**
     * 「我的作品库」：按用户列出 artifact，使用与 record 列表相同的 keyset 分页。
     *
     * 查询目标表是 generation_artifacts（已冗余 userId，见 schema），按
     * (createdAt desc, id desc) 稳定排序，可选 kind 过滤。多取一行（limit+1）
     * 仅用于判断是否还有下一页，不进入当前页返回。
     */
    async listArtifactsForUser(userId, options = {}) {
      const limit = clampLimit(options.limit)
      const cursor = options.cursor !== undefined ? decodeCursor(options.cursor) : undefined

      const conditions = [eq(generationArtifacts.userId, userId), isNull(generationArtifacts.deletedAt)]
      if (options.kind !== undefined) {
        conditions.push(eq(generationArtifacts.kind, options.kind))
      }
      if (cursor !== undefined) {
        // keyset 续读：取所有在 (createdAt, id) 字典序上严格小于游标的行（DESC）。
        conditions.push(sql`(${generationArtifacts.createdAt} < ${cursor.createdAt} OR (${generationArtifacts.createdAt} = ${cursor.createdAt} AND ${generationArtifacts.id} < ${cursor.id}))`)
      }

      const rows = await db
        .select({ artifact: generationArtifacts, thumbnail: assetDerivatives })
        .from(generationArtifacts)
        .leftJoin(
          userAssets,
          and(
            eq(userAssets.generationArtifactId, generationArtifacts.id),
            isNull(userAssets.deletedAt),
          ),
        )
        .leftJoin(
          assetDerivatives,
          and(
            eq(assetDerivatives.assetId, userAssets.id),
            eq(assetDerivatives.kind, 'thumbnail'),
            isNull(assetDerivatives.deletedAt),
          ),
        )
        .where(and(...conditions))
        .orderBy(desc(generationArtifacts.createdAt), desc(generationArtifacts.id))
        .limit(limit + 1)

      const hasMore = rows.length > limit
      const page = hasMore ? rows.slice(0, limit) : rows
      const items = page.map(row => toGenerationArtifactWithThumbnail(row.artifact, row.thumbnail))

      const last = page[page.length - 1]
      const nextCursor = hasMore && last !== undefined
        ? encodeCursor({ createdAt: last.artifact.createdAt.toISOString(), id: last.artifact.id })
        : undefined

      return { items, ...(nextCursor !== undefined ? { nextCursor } : {}) }
    },

    /**
     * 读取本地对象前确认 storageKey 属于当前用户。
     *
     * 这里同时覆盖 generation_artifacts 与 user_assets：两者都会生成
     * `/api/artifacts/local/*` URL。只按 storageKey 查文件系统是不安全的，
     * 因为 storageKey 是可猜测的业务路径；归属判断必须在数据库完成。
     */
    async getOwnedStorageObject(input) {
      const [artifact] = await db
        .select({ id: generationArtifacts.id, mimeType: generationArtifacts.mimeType })
        .from(generationArtifacts)
        .where(and(
          eq(generationArtifacts.userId, input.userId),
          eq(generationArtifacts.storageProvider, 'local'),
          eq(generationArtifacts.storageKey, input.storageKey),
          eq(generationArtifacts.status, 'stored'),
          isNull(generationArtifacts.deletedAt),
        ))
        .limit(1)

      if (artifact !== undefined) {
        return {
          id: artifact.id,
          source: 'generation_artifact' as const,
          ...(artifact.mimeType !== null ? { mimeType: artifact.mimeType } : {}),
        }
      }

      const [asset] = await db
        .select({ id: userAssets.id, mimeType: userAssets.mimeType, fileName: userAssets.fileName })
        .from(userAssets)
        .where(and(
          eq(userAssets.userId, input.userId),
          eq(userAssets.storageProvider, 'local'),
          eq(userAssets.storageKey, input.storageKey),
          isNull(userAssets.deletedAt),
        ))
        .limit(1)

      if (asset !== undefined) {
        return {
            id: asset.id,
            source: 'user_asset' as const,
            ...(asset.mimeType !== null ? { mimeType: asset.mimeType } : {}),
            ...(asset.fileName !== null ? { fileName: asset.fileName } : {}),
          }
      }

      const [derivative] = await db
        .select({ id: assetDerivatives.id, mimeType: assetDerivatives.mimeType })
        .from(assetDerivatives)
        .where(and(
          eq(assetDerivatives.userId, input.userId),
          eq(assetDerivatives.storageProvider, 'local'),
          eq(assetDerivatives.storageKey, input.storageKey),
          eq(assetDerivatives.status, 'ready'),
          isNull(assetDerivatives.deletedAt),
        ))
        .limit(1)

      return derivative === undefined
        ? undefined
        : {
            id: derivative.id,
            source: 'asset_derivative' as const,
            ...(derivative.mimeType !== null ? { mimeType: derivative.mimeType } : {}),
          }
    },

    /**
     * 请求取消一条生成。
     *
     * 取消语义随当前状态分两条路径，保证 UI 文案「已请求取消」与实际行为一致：
     *  - `submitting`（worker 尚未抢占 submit 任务）：直接翻成终态 `cancelled`——
     *    worker 之后看到 cancelled 记录会短路、不调用 provider。这是「真能停住」
     *    的取消。
     *  - `processing`（worker 已在处理）：provider 侧取消仍是未实现的工作，故仅
     *    置 cancelRequestedAt / providerCancelStatus='requested' / statusReason，
     *    保持 status=processing；worker 若在后续 poll 中看到 cancelRequestedAt
     *    也会短路。文案上不能承诺 provider 已停止。
     *
     * 非 owner 或不存在统一报 GENERATION_NOT_FOUND（不泄露存在性）；
     * 已是终态（succeeded/failed/cancelled）报 GENERATION_NOT_CANCELLABLE。
     */
    async requestGenerationCancel(input) {
      const now = input.now ?? nowIso()

      return db.transaction(async tx => {
        // 直接在 UPDATE 谓词里完成状态迁移。分开的「先读后写」序列会让 worker
        // 在两语句之间的竞态中胜出，从而错误地取消一条已经推进的记录。
        const submittingPatch: UpdateGenerationRecordPatch = {
          cancelRequestedAt: now,
          providerCancelStatus: 'requested',
          statusReason: '用户已请求取消',
          status: 'cancelled',
        }
        const [cancelled] = await tx
          .update(generationRecords)
          .set(generationPatchValues(submittingPatch, now))
          .where(and(
            eq(generationRecords.id, input.recordId),
            eq(generationRecords.userId, input.userId),
            eq(generationRecords.status, 'submitting'),
          ))
          .returning()

        if (cancelled !== undefined) {
          await refundGenerationInTransaction(tx, cancelled, now)
          return toGenerationRecord(cancelled)
        }

        const processingPatch: UpdateGenerationRecordPatch = {
          cancelRequestedAt: now,
          providerCancelStatus: 'requested',
          statusReason: '用户已请求取消',
        }
        const [requested] = await tx
          .update(generationRecords)
          .set(generationPatchValues(processingPatch, now))
          .where(and(
            eq(generationRecords.id, input.recordId),
            eq(generationRecords.userId, input.userId),
            eq(generationRecords.status, 'processing'),
          ))
          .returning()

        if (requested !== undefined) return toGenerationRecord(requested)

        const [row] = await tx
          .select({ id: generationRecords.id, status: generationRecords.status })
          .from(generationRecords)
          .where(and(eq(generationRecords.id, input.recordId), eq(generationRecords.userId, input.userId)))
          .limit(1)

        if (row === undefined) {
          throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Generation record not found: ${input.recordId}`)
        }
        throw new GenerationRepositoryError('GENERATION_NOT_CANCELLABLE', `Generation not cancellable in status '${row.status}': ${input.recordId}`)
      })
    },

    /**
     * 重跑一条生成：以原记录的 modelId + inputParams 起一条新 generation，
     * 并把新记录的 parentRecordId 指回原记录。
     *
     * 流程：
     *  1) ownership 校验：原记录必须存在且属于当前 user，否则 GENERATION_NOT_FOUND；
     *  2) 仅允许 failed/cancelled 的记录被重跑，其它活跃态（submitting/processing/
     *     succeeded）报 GENERATION_NOT_RETRYABLE；
     *  3) 走 createGeneration 起新记录（含 params 校验、成本估算、submit 任务入队、
     *     幂等兜底），再把新记录的 parentRecordId 回填为原记录 id。
     * 返回更新后的 CreateGenerationResult（record.parentRecordId 已指向原记录）。
     */
    async retryGeneration(input) {
      const [original] = await db
        .select()
        .from(generationRecords)
        .where(and(eq(generationRecords.id, input.recordId), eq(generationRecords.userId, input.userId)))
        .limit(1)

      if (original === undefined) {
        throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Generation not found: ${input.recordId}`)
      }
      if (original.status !== 'failed' && original.status !== 'cancelled') {
        throw new GenerationRepositoryError('GENERATION_NOT_RETRYABLE', `Generation not retryable in status '${original.status}': ${input.recordId}`)
      }

      const originalAssetRefs = refsFromRows(
        await readGenerationInputAssetRows(db, [original.id]),
      )

      // 起新记录：复用 createGeneration 的全部校验/成本/任务/幂等逻辑。
      const created = await this.createGeneration({
        userId: input.userId,
        modelId: original.modelId,
        params: original.inputParamsJson,
        ...(originalAssetRefs !== undefined ? {
          assetRefs: originalAssetRefs,
          allowDeletedAssetRefs: true,
        } : {}),
        ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
        ...(input.quota !== undefined ? { quota: input.quota } : {}),
      })

      // 幂等父记录守卫：createGeneration 命中既有幂等记录时，created.record 可能
      // 已经是某次先前 retry 的产物（parentRecordId 已被回填）。
      //  - parentRecordId 未定义：本次是首次 retry，回填为 original.id。
      //  - parentRecordId === original.id：同一原记录的幂等重放，原样返回。
      //  - parentRecordId 指向【另一条】原记录：同一个 idempotencyKey 被用来 retry
      //    了不同的源生成——拒绝并报 IDEMPOTENCY_CONFLICT，避免把既有 retry 记录
      //    重新挂到错误的源记录下（也避免静默返回别人的 retry 结果）。
      const existingParent = created.record.parentRecordId
      if (existingParent !== undefined && existingParent !== original.id) {
        throw new GenerationRepositoryError(
          'IDEMPOTENCY_CONFLICT',
          `Retry idempotency key '${input.idempotencyKey ?? '<none>'}' already belongs to generation ${existingParent}, cannot attach to ${original.id}`,
        )
      }
      if (existingParent === original.id) {
        return created
      }

      // 首次 retry：把新记录的 parentRecordId 回填为原记录 id，建立衍生关系。
      const updated = await this.updateGenerationRecord(created.record.id, { parentRecordId: original.id })

      return {
        record: {
          ...updated,
          ...(created.record.assetRefs !== undefined ? { assetRefs: created.record.assetRefs } : {}),
        },
        task: created.task,
        event: created.event,
      }
    },

    /** 列出某条 generation 的所有产物，按创建时间升序。 */
    async listArtifactsForRecord(recordId) {
      const rows = await db
        .select({ artifact: generationArtifacts, thumbnail: assetDerivatives })
        .from(generationArtifacts)
        .leftJoin(
          userAssets,
          and(
            eq(userAssets.generationArtifactId, generationArtifacts.id),
            isNull(userAssets.deletedAt),
          ),
        )
        .leftJoin(
          assetDerivatives,
          and(
            eq(assetDerivatives.assetId, userAssets.id),
            eq(assetDerivatives.kind, 'thumbnail'),
            isNull(assetDerivatives.deletedAt),
          ),
        )
        .where(eq(generationArtifacts.recordId, recordId))
        .orderBy(asc(generationArtifacts.createdAt), asc(generationArtifacts.id))

      return rows.map(row => toGenerationArtifactWithThumbnail(row.artifact, row.thumbnail))
    },

    /** 用一次稳定且有界的查询列出整页记录对应的产物。 */
    async listArtifactsForRecords(recordIds) {
      const uniqueRecordIds = [...new Set(recordIds)]
      if (uniqueRecordIds.length === 0) return []

      const rows = await db
        .select({ artifact: generationArtifacts, thumbnail: assetDerivatives })
        .from(generationArtifacts)
        .leftJoin(
          userAssets,
          and(
            eq(userAssets.generationArtifactId, generationArtifacts.id),
            isNull(userAssets.deletedAt),
          ),
        )
        .leftJoin(
          assetDerivatives,
          and(
            eq(assetDerivatives.assetId, userAssets.id),
            eq(assetDerivatives.kind, 'thumbnail'),
            isNull(assetDerivatives.deletedAt),
          ),
        )
        .where(inArray(generationArtifacts.recordId, uniqueRecordIds))
        .orderBy(
          asc(generationArtifacts.recordId),
          asc(generationArtifacts.createdAt),
          asc(generationArtifacts.id),
        )

      return rows.map(row => toGenerationArtifactWithThumbnail(row.artifact, row.thumbnail))
    },

    /** 列出某条 generation 下尚未落存的产物（pending 或 failed），供 artifact.persist 重试用。 */
    async listPendingArtifactsForRecord(recordId) {
      const rows = await db
        .select()
        .from(generationArtifacts)
        .where(and(
          eq(generationArtifacts.recordId, recordId),
          sql`${generationArtifacts.status} in ('pending', 'failed')`,
        ))
        .orderBy(asc(generationArtifacts.createdAt))

      return rows.map(toGenerationArtifact)
    },

    /** 标记产物已落存储：写入 storage* 字段、清掉 errorJson、状态翻 stored。 */
    async markArtifactStored(input) {
      const now = input.now ?? nowIso()
      return db.transaction(async tx => {
        const [updated] = await tx
          .update(generationArtifacts)
          .set({
            status: 'stored',
            storageProvider: input.storageProvider,
            storageKey: input.storageKey,
            storageUrl: input.storageUrl ?? null,
            byteSize: input.byteSize,
            mimeType: input.mimeType ?? null,
            errorJson: null,
            updatedAt: new Date(now),
          })
          .where(eq(generationArtifacts.id, input.artifactId))
          .returning()

        if (!updated) {
          throw new GenerationRepositoryError('ARTIFACT_NOT_FOUND', `Artifact not found: ${input.artifactId}`)
        }

        const [record] = await tx
          .select({ modelId: generationRecords.modelId, traceId: generationRecords.traceId })
          .from(generationRecords)
          .where(eq(generationRecords.id, updated.recordId))
          .limit(1)
        if (!record) {
          throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Generation not found: ${updated.recordId}`)
        }

        const [insertedAsset] = await tx
          .insert(userAssets)
          .values({
            id: `asset_generation_${updated.id}`,
            userId: updated.userId,
            kind: updated.kind,
            source: 'generation',
            generationArtifactId: updated.id,
            recordId: updated.recordId,
            modelId: record.modelId,
            originalUrl: null,
            mimeType: updated.mimeType,
            byteSize: updated.byteSize,
            storageProvider: updated.storageProvider,
            storageKey: updated.storageKey,
            storageUrl: null,
            status: 'ready',
            createdBy: updated.userId,
            updatedBy: updated.userId,
            createdAt: new Date(now),
            updatedAt: new Date(now),
          })
          // 只有确定性的投影 ID 才是重试幂等的。不要吞掉无关的唯一性/完整性
          // 违规——若资产投影无效，artifact 更新必须回滚。
          .onConflictDoNothing({ target: userAssets.id })
          .returning({ id: userAssets.id })

        const projectionId = `asset_generation_${updated.id}`
        const [activeAsset] = insertedAsset === undefined
          ? await tx
              .select({ id: userAssets.id })
              .from(userAssets)
              .where(and(eq(userAssets.id, projectionId), isNull(userAssets.deletedAt)))
              .limit(1)
          : [insertedAsset]

        if (activeAsset !== undefined) {
          await enqueueAssetThumbnail(tx, {
            id: projectionId,
            userId: updated.userId,
            kind: updated.kind as CreateUserAssetInput['kind'],
            source: 'generation',
            generationArtifactId: updated.id,
            recordId: updated.recordId,
            modelId: record.modelId,
            mimeType: updated.mimeType ?? undefined,
            byteSize: updated.byteSize ?? undefined,
            storageProvider: updated.storageProvider ?? undefined,
            storageKey: updated.storageKey ?? undefined,
            enqueueThumbnail: updated.storageProvider === 'local',
            ...(record.traceId !== null ? { traceId: record.traceId } : {}),
          }, now)
        }

        return toGenerationArtifact(updated)
      })
    },

    /** 标记产物落储失败：状态翻 failed、写结构化 errorJson，供后续重试或排查。 */
    async markArtifactFailed(input) {
      const now = input.now ?? nowIso()
      const [updated] = await db
        .update(generationArtifacts)
        .set({
          status: 'failed',
          errorJson: errorToJsonRecord(input.error),
          updatedAt: new Date(now),
        })
        .where(eq(generationArtifacts.id, input.artifactId))
        .returning()

      if (!updated) {
        throw new GenerationRepositoryError('ARTIFACT_NOT_FOUND', `Artifact not found: ${input.artifactId}`)
      }

      return toGenerationArtifact(updated)
    },

    /**
     * worker 并发安全地认领下一条可执行任务。
     *
     * 核心是原生 SQL 中的 `FOR UPDATE SKIP LOCKED`：多个 worker 同时拉取时，
     * 被其它 worker 锁住的行会被直接跳过，互不阻塞，也绝不会抢到同一条任务。
     * 候选集 = status='queued' 或（status='running' 且锁已过期）+ next_run_at
     * 已到。整个「SELECT-then-UPDATE」流程包在事务里，确保认领的原子性。
     *
     * 拿到行后再走 transitionTask('claim') 做状态机校验，保证 task-engine 的
     * 不变量（queued → running）不被破坏。
     */
    async claimNextQueuedTask(input) {
      return db.transaction(async tx => {
        const rows = await tx.execute<{ id: string }>(sql`
          select *
          from task_records
          where (status = 'queued'
             or (status = 'running' and locked_until <= ${input.now}))
            and next_run_at <= ${input.now}
          order by priority desc, created_at asc
          for update skip locked
          limit 1
        `)
        const [selected] = rows
        if (!selected) return undefined

        const [selectedTaskRow] = await tx
          .select()
          .from(taskRecords)
          .where(eq(taskRecords.id, selected.id))
          .limit(1)

        if (!selectedTaskRow) {
          throw new GenerationRepositoryError('TASK_NOT_FOUND', `Task not found: ${selected.id}`)
        }

        let claimedTask: ReturnType<typeof transitionTask>
        try {
          claimedTask = transitionTask(toTaskRecord(selectedTaskRow), {
            type: 'claim',
            workerId: input.workerId,
            now: input.now,
            lockedUntil: input.lockedUntil,
          })
        } catch (claimError) {
          // P2-05：损坏的 task 行（type/domain 配对错、非法状态、next_run_at 未来等）
          // 使 claim 状态机确定性抛错。若不处理，事务回滚后该行仍停在 queued 且
          // next_run_at 已到——下一次 claim 又被选中 → worker loop 无限退避，
          // 队列里排在它后面的所有任务都得不到消费。这里把该行强制置为 failed
          //（绕过状态机——正是状态机无法处理它），携带原始错误作终态落库，之后
          // 永不再被选中。toTaskRecord 与 transitionTask 都是纯函数，抛错是确定性的
          // 行级损坏；DB 写入错误仍在事务里向外抛，交给外层 backoff 重试。
          await tx
            .update(taskRecords)
            .set({
              status: 'failed',
              errorJson: {
                category: 'system',
                retriable: false,
                code: 'TASK_CLAIM_INVALID',
                message: `Cannot claim task ${selected.id}: ${claimError instanceof Error ? claimError.message : String(claimError)}`,
              },
              completedAt: new Date(input.now),
              updatedBy: input.workerId,
              updatedAt: new Date(input.now),
            })
            .where(eq(taskRecords.id, selected.id))
          return undefined
        }

        const [savedTask] = await tx
          .update(taskRecords)
          .set(taskInsertValues(claimedTask))
          .where(eq(taskRecords.id, claimedTask.id))
          .returning()

        if (!savedTask) {
          throw new GenerationRepositoryError('DATABASE_ERROR', `Failed to claim task: ${claimedTask.id}`)
        }

        return toTaskRecord(savedTask)
      })
    },

    /**
     * 延长运行中 task 的租约。
     *
     * 续租必须同时匹配 task id、worker 所有权和「尚未过期」三个条件。
     * 这样旧 worker 即使在网络抖动后恢复，也不能把已经被新 worker 重新
     * 认领的任务续回去。返回 undefined 表示锁已丢失或 task 不再运行。
     */
    async renewTaskLock(input) {
      const [saved] = await db
        .update(taskRecords)
        .set({
          lockedUntil: new Date(input.lockedUntil),
          updatedAt: new Date(input.now),
          updatedBy: input.workerId,
        })
        .where(and(
          eq(taskRecords.id, input.taskId),
          eq(taskRecords.status, 'running'),
          eq(taskRecords.lockedBy, input.workerId),
          gt(taskRecords.lockedUntil, new Date(input.now)),
        ))
        .returning()

      return saved ? toTaskRecord(saved) : undefined
    },

    /**
     * 持久化任务状态变更（认领后的推进、最终态写入等）。
     * updatedAt 缺省时补当前时间——保证下游永远能拿到非空 updatedAt。
     *
      * Worker 在写回结果时应传 expectedWorkerId。此条件是最后一道租约
      * 护栏：写回时必须仍由同一个 worker 持有未过期的锁；如果租约过期并被
      * 别的 worker 重新认领，或旧 worker 直到锁过期后才返回，结果只能被丢弃，
      * 不能覆盖新 worker 的状态。
     */
    async saveTask(task, options) {
      const conditions = [eq(taskRecords.id, task.id)]
      if (options?.expectedWorkerId !== undefined) {
        conditions.push(eq(taskRecords.lockedBy, options.expectedWorkerId))
        conditions.push(sql`${taskRecords.lockedUntil} > now()`)
      }

      const [saved] = await db
        .update(taskRecords)
        .set(taskInsertValues({ ...task, updatedAt: task.updatedAt ?? nowIso() }))
        .where(and(...conditions))
        .returning()

      if (!saved) {
        if (options?.expectedWorkerId !== undefined) return undefined
        throw new GenerationRepositoryError('TASK_NOT_FOUND', `Task not found: ${task.id}`)
      }

      return toTaskRecord(saved)
    },

    /** 按主键取单条任务；不存在返回 undefined。 */
    async getTask(id) {
      const [row] = await db
        .select()
        .from(taskRecords)
        .where(eq(taskRecords.id, id))
        .limit(1)

      return row ? toTaskRecord(row) : undefined
    },

    /**
     * 读取 append-only 的生成事件流，供 SSE 追更。event id 有意保持不透明；
     * repository 把它解析为 `(createdAt, id)` 游标，调用方无需依赖数据库
     * 排序细节。
     */
    async listGenerationEvents(input = {}) {
      const limit = Math.min(Math.max(input.limit ?? 100, 1), 500)
      const conditions = []
      if (input.userId !== undefined) conditions.push(eq(generationEvents.userId, input.userId))

      let afterCursor = input.afterCursor
      if (afterCursor === undefined && input.afterId !== undefined) {
        const [after] = await db
          .select({ id: generationEvents.id, createdAt: generationEvents.createdAt })
          .from(generationEvents)
          .where(eq(generationEvents.id, input.afterId))
          .limit(1)

        // 未知的 Last-Event-ID 无法安全映射为游标。客户端将以全新游标重连，
        // 而不是接收整个事件历史。
        if (after === undefined) return []
        afterCursor = {
          id: after.id,
          createdAt: after.createdAt.toISOString(),
        }
      }

      if (afterCursor !== undefined) {
        const afterCreatedAt = new Date(afterCursor.createdAt)
        if (Number.isNaN(afterCreatedAt.getTime()) || afterCursor.id.trim().length === 0) {
          throw new GenerationRepositoryError(
            'INVALID_CURSOR',
            'Generation event cursor is invalid.',
          )
        }
        const afterCreatedAtIso = afterCreatedAt.toISOString()
        conditions.push(sql`(${generationEvents.createdAt} > ${afterCreatedAtIso} OR (${generationEvents.createdAt} = ${afterCreatedAtIso} AND ${generationEvents.id} > ${afterCursor.id}))`)
      }

      const rows = await db
        .select()
        .from(generationEvents)
        .where(conditions.length === 0 ? undefined : and(...conditions))
        .orderBy(asc(generationEvents.createdAt), asc(generationEvents.id))
        .limit(limit)

      return rows.map(toGenerationEvent)
    },

    /**
     * 在打开重连流之前解析一个持久化 SSE 游标。
     * 按 userId 限定作用域，刻意让「属于另一用户的游标」与「已被清除的游标」
     * 在 HTTP 边界上无法区分。
     */
    async getGenerationEvent(id, userId) {
      const [row] = await db
        .select()
        .from(generationEvents)
        .where(userId === undefined
          ? eq(generationEvents.id, id)
          : and(eq(generationEvents.id, id), eq(generationEvents.userId, userId)))
        .limit(1)

      return row === undefined ? undefined : toGenerationEvent(row)
    },

    async getLatestGenerationEvent() {
      const [row] = await db
        .select()
        .from(generationEvents)
        .orderBy(desc(generationEvents.createdAt), desc(generationEvents.id))
        .limit(1)
      return row === undefined ? undefined : toGenerationEvent(row)
    },

    /**
     * 为一条 generation 创建分享。
     *
     * 流程：
     *  1) 先做 ownership 校验：记录必须存在且属于当前 user，否则按
     *     GENERATION_NOT_FOUND 报错（统一对外不暴露「不属于你」与「不存在」
     *     的区别）；
     *  2) 用 `onConflictDoNothing()` 插入——arbiter 是 `generation_shares_record_idx`
     *     这个 PARTIAL unique index（where deleted_at is null）。之所以用无目标
     *     形式的 ON CONFLICT：Postgres 只能通过无目标形式把 partial index 推断
     *     为 arbiter（插入行天然满足 `deleted_at is null`），所以这里不指定目标。
     *     由此实现「每条 generation 恰好一个活跃分享」的幂等语义；
     *  3) 命中既有分享（onConflictDoNothing 返回空）时，回查并返回那条既有分享。
     *
     * 分享被撤销后允许重新创建新的访问键；过期分享则复用原访问键并重新激活，
     * 避免 owner 页面反复创建分享时留下大量失效行。
     */
    async createGenerationShare(input) {
      const now = input.now ?? nowIso()

      // ownership 校验：记录必须存在 AND 属于当前 user，否则统一返回 NOT_FOUND。
      const [record] = await db
        .select({ id: generationRecords.id })
        .from(generationRecords)
        .where(and(eq(generationRecords.id, input.recordId), eq(generationRecords.userId, input.userId)))
        .limit(1)

      if (record === undefined) {
        throw new GenerationRepositoryError('GENERATION_NOT_FOUND', `Generation not found: ${input.recordId}`)
      }

       // 幂等：每条 generation 至多一个未撤销分享。arbiter 是 partial unique
       // index `generation_shares_record_idx`（where deleted_at/revoked_at is null）。
       // Postgres 仅在「无目标的 ON CONFLICT」下才能把 partial index 推断为
       // arbiter，因此这里不指定冲突目标列。
      const [inserted] = await db
        .insert(generationShares)
        .values({
          id: nextGenerationShareId(),
          recordId: input.recordId,
          userId: input.userId,
          includeParams: input.includeParams ?? false,
          expiresAt: parseDate(input.expiresAt),
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
        .onConflictDoNothing()
        .returning()

      if (inserted !== undefined) return toGenerationShare(inserted)

      // onConflictDoNothing 命中：说明该 record 已有未撤销分享，回查并返回它。
      const [existing] = await db
        .select()
        .from(generationShares)
        .where(eq(generationShares.recordId, input.recordId))
        .orderBy(desc(generationShares.createdAt))
        .limit(1)

      if (existing === undefined) {
        throw new GenerationRepositoryError('DATABASE_ERROR', 'Generation share could not be created')
      }

      const existingExpired = existing.expiresAt !== null && existing.expiresAt <= new Date(now)
      const needsUpdate = existingExpired || input.includeParams !== undefined || input.expiresAt !== undefined
      if (!needsUpdate) return toGenerationShare(existing)

      const [updated] = await db
        .update(generationShares)
        .set({
          includeParams: input.includeParams ?? existing.includeParams,
          // 对已过期分享再次调用 create 会重新激活它。若未提供新的过期时间，
          // owner 将显式获得一个永不过期的分享。
          expiresAt: input.expiresAt === undefined ? null : new Date(input.expiresAt),
          revokedAt: null,
          revokedBy: null,
          updatedAt: new Date(now),
          updatedBy: input.userId,
        })
        .where(and(
          eq(generationShares.id, existing.id),
          eq(generationShares.userId, input.userId),
          isNull(generationShares.revokedAt),
        ))
        .returning()

      return updated === undefined ? toGenerationShare(existing) : toGenerationShare(updated)
    },

    /** 按 (recordId, userId) 查询 owner 视角的分享记录；不存在返回 undefined。 */
    async getGenerationShareForRecord(input) {
      const [share] = await db
        .select()
        .from(generationShares)
        .where(and(
          eq(generationShares.recordId, input.recordId),
          eq(generationShares.userId, input.userId),
          isNull(generationShares.deletedAt),
          isNull(generationShares.revokedAt),
          or(isNull(generationShares.expiresAt), gt(generationShares.expiresAt, new Date())),
        ))
        .orderBy(desc(generationShares.createdAt))
        .limit(1)

      return share === undefined ? undefined : toGenerationShare(share)
    },

    /** owner 撤销当前活跃分享；不存在/已撤销统一返回 undefined。 */
    async revokeGenerationShare(input) {
      const now = input.now ?? nowIso()
      const [revoked] = await db
        .update(generationShares)
        .set({
          revokedAt: new Date(now),
          revokedBy: input.userId,
          updatedAt: new Date(now),
          updatedBy: input.userId,
        })
        .where(and(
          eq(generationShares.recordId, input.recordId),
          eq(generationShares.userId, input.userId),
          isNull(generationShares.deletedAt),
          isNull(generationShares.revokedAt),
        ))
        .returning()

      return revoked === undefined ? undefined : toGenerationShare(revoked)
    },

    /**
     * 公开分享页的聚合查询：share + record + artifacts。
     *
     * 该接口无需登录即可调用，因此返回结构在写入前会经 toPublicSharedRecord /
     * toPublicSharedArtifact 严格裁剪——剥除 owner id、cost、idempotency、task、
     * provider、outputResult、userId、errorJson、readUrl 等一切敏感或内部字段。
     * 调用方（API 路由）在拿到结果后，再自行从 storage 适配器拼出 readUrl 附加
     * 到 artifacts 上——repository 永远不调用 storage。
     */
    async getPublicSharedGeneration(shareId) {
      const now = new Date()
      const [row] = await db
        .select({ share: generationShares, record: generationRecords })
        .from(generationShares)
        .innerJoin(generationRecords, eq(generationShares.recordId, generationRecords.id))
        .where(activeShareCondition(shareId, now))
        .limit(1)

      if (row === undefined) return undefined

      const artifacts = await db
        .select()
        .from(generationArtifacts)
        .where(eq(generationArtifacts.recordId, row.record.id))
        .orderBy(asc(generationArtifacts.createdAt))

      const record = toGenerationRecord(row.record)
      return {
        share: {
          id: row.share.id,
          recordId: row.share.recordId,
          ...(row.share.expiresAt !== null ? { expiresAt: row.share.expiresAt.toISOString() } : {}),
          createdAt: row.share.createdAt.toISOString(),
          updatedAt: row.share.updatedAt.toISOString(),
        },
        record: toPublicSharedRecord(record, row.share.includeParams),
        artifacts: artifacts.map(artifact => toPublicSharedArtifact(toGenerationArtifact(artifact))),
      }
    },

    /**
     * 为公开分享的本地对象读取提供内部 key 查询。此方法不直接暴露给匿名
     * 客户端；调用方必须再次根据 storage.provider 选择安全的响应方式。
     */
    async getPublicSharedArtifact(shareId, artifactId) {
      const [row] = await db
        .select({ artifact: generationArtifacts })
        .from(generationShares)
        .innerJoin(generationRecords, eq(generationShares.recordId, generationRecords.id))
        .innerJoin(generationArtifacts, eq(generationArtifacts.recordId, generationRecords.id))
        .where(and(
          activeShareCondition(shareId, new Date()),
          eq(generationArtifacts.id, artifactId),
          eq(generationArtifacts.status, 'stored'),
          isNull(generationArtifacts.deletedAt),
        ))
        .limit(1)

      return row === undefined ? undefined : toGenerationArtifact(row.artifact)
    },

    async createUserAsset(input) {
      const now = input.now ?? new Date().toISOString()
      await db.transaction(async tx => {
        await tx.insert(userAssets).values({
          id: input.id,
          userId: input.userId,
          kind: input.kind,
          source: input.source,
          generationArtifactId: input.generationArtifactId ?? null,
          recordId: input.recordId ?? null,
          modelId: input.modelId ?? null,
          fileName: input.fileName ?? null,
          originalUrl: input.originalUrl ?? null,
          mimeType: input.mimeType ?? null,
          byteSize: input.byteSize ?? null,
          storageProvider: input.storageProvider ?? null,
          storageKey: input.storageKey ?? null,
          storageUrl: input.storageUrl ?? null,
          metadataJson: input.metadata ?? null,
          status: 'ready',
          createdBy: input.userId,
          updatedBy: input.userId,
          createdAt: new Date(now),
          updatedAt: new Date(now),
        })
        await enqueueAssetThumbnail(tx, input, now)
      })
    },

    async getAssetThumbnailSource(derivativeId) {
      const [row] = await db
        .select({ derivative: assetDerivatives, asset: userAssets })
        .from(assetDerivatives)
        .innerJoin(userAssets, eq(userAssets.id, assetDerivatives.assetId))
        .where(and(
          eq(assetDerivatives.id, derivativeId),
          eq(assetDerivatives.kind, 'thumbnail'),
          isNull(assetDerivatives.deletedAt),
          eq(userAssets.status, 'ready'),
          isNull(userAssets.deletedAt),
        ))
        .limit(1)

      if (row === undefined || (row.asset.kind !== 'image' && row.asset.kind !== 'video')) return undefined
      return {
        derivativeId: row.derivative.id,
        assetId: row.asset.id,
        userId: row.asset.userId,
        kind: row.asset.kind,
        source: row.asset.source as AssetThumbnailSource['source'],
        ...(row.asset.storageProvider !== null ? { storageProvider: row.asset.storageProvider } : {}),
        ...(row.asset.storageKey !== null ? { storageKey: row.asset.storageKey } : {}),
        ...(row.asset.originalUrl !== null ? { originalUrl: row.asset.originalUrl } : {}),
        ...(row.asset.fileName !== null ? { fileName: row.asset.fileName } : {}),
        ...(row.asset.mimeType !== null ? { mimeType: row.asset.mimeType } : {}),
        ...(row.asset.byteSize !== null ? { byteSize: row.asset.byteSize } : {}),
        status: row.derivative.status as AssetThumbnailSource['status'],
      }
    },

    async markAssetThumbnailProcessing(input) {
      const now = input.now ?? new Date().toISOString()
      const [updated] = await db
        .update(assetDerivatives)
        .set({ status: 'processing', errorJson: null, updatedAt: new Date(now) })
        .where(and(
          eq(assetDerivatives.id, input.derivativeId),
          eq(assetDerivatives.kind, 'thumbnail'),
          inArray(assetDerivatives.status, ['queued', 'processing', 'failed']),
          isNull(assetDerivatives.deletedAt),
        ))
        .returning({ id: assetDerivatives.id })
      return updated !== undefined
    },

    async completeAssetThumbnail(input) {
      const now = input.now ?? new Date().toISOString()
      const [updated] = await db
        .update(assetDerivatives)
        .set({
          status: 'ready',
          storageProvider: input.storageProvider,
          storageKey: input.storageKey,
          mimeType: input.mimeType,
          byteSize: input.byteSize,
          metadataJson: input.metadata ?? null,
          errorJson: null,
          updatedAt: new Date(now),
        })
        .where(and(
          eq(assetDerivatives.id, input.derivativeId),
          eq(assetDerivatives.kind, 'thumbnail'),
          isNull(assetDerivatives.deletedAt),
        ))
        .returning({ id: assetDerivatives.id })
      if (updated === undefined) {
        throw new GenerationRepositoryError('ASSET_DERIVATIVE_NOT_FOUND', `Asset derivative not found: ${input.derivativeId}`)
      }
    },

    async failAssetThumbnail(input) {
      const now = input.now ?? new Date().toISOString()
      const [updated] = await db
        .update(assetDerivatives)
        .set({
          status: input.retrying === true ? 'queued' : 'failed',
          errorJson: input.error,
          updatedAt: new Date(now),
        })
        .where(and(
          eq(assetDerivatives.id, input.derivativeId),
          eq(assetDerivatives.kind, 'thumbnail'),
          isNull(assetDerivatives.deletedAt),
        ))
        .returning({ id: assetDerivatives.id })
      if (updated === undefined) {
        throw new GenerationRepositoryError('ASSET_DERIVATIVE_NOT_FOUND', `Asset derivative not found: ${input.derivativeId}`)
      }
    },

    async listUnifiedAssets(userId, options = {}) {
      const limit = clampLimit(options.limit ?? 20)
      const sort = options.sort ?? 'time'
      const filters = assetCursorFilters(options)
      const cursor = options.cursor !== undefined
        ? decodeAssetCursor(options.cursor, { sort, filters })
        : undefined
      const fetchLimit = limit + 1
      const query = options.q?.trim()
      const matchingModelIds = options.modelIds?.filter(id => id.length > 0) ?? []
      const titleSortValue = sql<string>`lower(coalesce(${userAssets.fileName}, ${userAssets.modelId}, ${userAssets.id}))`
      const searchCondition = query
        ? or(
            ilike(userAssets.id, escapedLikePattern(query)),
            ilike(userAssets.fileName, escapedLikePattern(query)),
            ilike(userAssets.modelId, escapedLikePattern(query)),
            matchingModelIds.length > 0
              ? inArray(userAssets.modelId, matchingModelIds)
              : undefined,
          )
        : undefined
      const cursorCondition = cursor === undefined
        ? undefined
        : sort === 'time' && typeof cursor.value === 'string'
          ? or(
              lt(userAssets.createdAt, new Date(cursor.value)),
              and(eq(userAssets.createdAt, new Date(cursor.value)), lt(userAssets.id, cursor.id)),
            )
          : sort === 'title' && typeof cursor.value === 'string'
            ? or(
                gt(titleSortValue, cursor.value),
                and(eq(titleSortValue, cursor.value), gt(userAssets.id, cursor.id)),
              )
            : sort === 'size' && cursor.value === null
              ? and(isNull(userAssets.byteSize), lt(userAssets.id, cursor.id))
              : sort === 'size' && typeof cursor.value === 'number'
                ? or(
                    lt(userAssets.byteSize, cursor.value),
                    isNull(userAssets.byteSize),
                    and(eq(userAssets.byteSize, cursor.value), lt(userAssets.id, cursor.id)),
                  )
                : undefined
      const orderBy = sort === 'time'
        ? [desc(userAssets.createdAt), desc(userAssets.id)]
        : sort === 'title'
          ? [asc(titleSortValue), asc(userAssets.id)]
          : [sql`${userAssets.byteSize} desc nulls last`, desc(userAssets.id)]

      const rows = await db
        .select({
          asset: userAssets,
          artifactText: generationArtifacts.text,
          thumbnail: assetDerivatives,
          generationInputParams: generationRecords.inputParamsJson,
          titleSortValue,
        })
        .from(userAssets)
        .leftJoin(
          generationArtifacts,
          eq(userAssets.generationArtifactId, generationArtifacts.id),
        )
        .leftJoin(
          assetDerivatives,
          and(
            eq(assetDerivatives.assetId, userAssets.id),
            eq(assetDerivatives.kind, 'thumbnail'),
            isNull(assetDerivatives.deletedAt),
          ),
        )
        .leftJoin(
          generationRecords,
          and(
            eq(userAssets.recordId, generationRecords.id),
            eq(userAssets.userId, generationRecords.userId),
          ),
        )
        .where(
          and(
            eq(userAssets.userId, userId),
            eq(userAssets.status, 'ready'),
            isNull(userAssets.deletedAt),
            options.kind !== undefined ? eq(userAssets.kind, options.kind) : undefined,
            options.source !== undefined ? eq(userAssets.source, options.source) : undefined,
            searchCondition,
            cursorCondition,
          ),
        )
        .orderBy(...orderBy)
        .limit(fetchLimit)

      const pageRows = rows.slice(0, limit)
      const page = pageRows.map(row =>
        toUnifiedAssetItem(
          row.asset,
          row.artifactText,
          row.thumbnail,
          row.generationInputParams,
        ),
      )
      const lastRow = pageRows[pageRows.length - 1]
      const nextCursor = lastRow !== undefined && rows.length > limit
        ? encodeAssetCursor({
            sort,
            value: sort === 'time'
              ? lastRow.asset.createdAt.toISOString()
              : sort === 'title'
                ? lastRow.titleSortValue
                : lastRow.asset.byteSize,
            id: lastRow.asset.id,
            filters,
          })
        : undefined

      return { items: page, ...(nextCursor !== undefined ? { nextCursor } : {}) }
    },

    async getUserAsset(input) {
      const [row] = await db
        .select({
          asset: userAssets,
          artifactText: generationArtifacts.text,
          thumbnail: assetDerivatives,
          generationInputParams: generationRecords.inputParamsJson,
        })
        .from(userAssets)
        .leftJoin(
          generationArtifacts,
          eq(userAssets.generationArtifactId, generationArtifacts.id),
        )
        .leftJoin(
          assetDerivatives,
          and(
            eq(assetDerivatives.assetId, userAssets.id),
            eq(assetDerivatives.kind, 'thumbnail'),
            isNull(assetDerivatives.deletedAt),
          ),
        )
        .leftJoin(
          generationRecords,
          and(
            eq(userAssets.recordId, generationRecords.id),
            eq(userAssets.userId, generationRecords.userId),
          ),
        )
        .where(
          and(
            eq(userAssets.id, input.assetId),
            eq(userAssets.userId, input.userId),
            eq(userAssets.status, 'ready'),
            input.includeDeleted === true ? undefined : isNull(userAssets.deletedAt),
          ),
        )
        .limit(1)

      return row === undefined
        ? undefined
        : toUnifiedAssetItem(
            row.asset,
            row.artifactText,
            row.thumbnail,
            row.generationInputParams,
          )
    },

    async softDeleteUserAsset(input) {
      const now = input.now ?? new Date().toISOString()
      return db.transaction(async tx => {
        const rows = await tx
          .update(userAssets)
          .set({
            deletedAt: new Date(now),
            deletedBy: input.userId,
            updatedAt: new Date(now),
            updatedBy: input.userId,
          })
          .where(
            and(
              eq(userAssets.id, input.assetId),
              eq(userAssets.userId, input.userId),
              isNull(userAssets.deletedAt),
            ),
          )
          .returning({ id: userAssets.id })

        if (rows.length === 0) return false
        const derivatives = await tx
          .update(assetDerivatives)
          .set({
            deletedAt: new Date(now),
            deletedBy: input.userId,
            updatedAt: new Date(now),
            updatedBy: input.userId,
          })

          .where(and(
            eq(assetDerivatives.assetId, input.assetId),
            eq(assetDerivatives.userId, input.userId),
            isNull(assetDerivatives.deletedAt),
          ))
          .returning({ id: assetDerivatives.id })

        const derivativeIds = derivatives.map(derivative => derivative.id)
        if (derivativeIds.length > 0) {
          await tx
            .update(taskRecords)
            .set({
              status: 'cancelled',
              completedAt: new Date(now),
              errorJson: {
                category: 'cancelled',
                message: 'Thumbnail task cancelled because the source asset was deleted',
                retriable: false,
                code: 'THUMBNAIL_SOURCE_DELETED',
              },
              updatedAt: new Date(now),
              updatedBy: input.userId,
            })
            .where(and(
              eq(taskRecords.type, 'media.thumbnail'),
              eq(taskRecords.status, 'queued'),
              inArray(taskRecords.recordId, derivativeIds),
              isNull(taskRecords.deletedAt),
            ))
        }
        return true
      })
    },

    ...createContentRepository(db),
  }
}

interface PrepareGenerationRequestInput {
  modelId: string
  params: Record<string, unknown>
  assetRefs?: GenerationAssetRefInput
}

/** 解析模型 manifest、校验并规整参数、估算成本，产出创建生成所需的全套准备数据。 */
function prepareGenerationRequest(input: PrepareGenerationRequestInput): {
  estimate: GenerationEstimate & { manifest: FrozenModelManifest }
  prepared: PreparedGenerationParams
} {
  const manifest = getModelById(input.modelId)
  if (!manifest) {
    throw new GenerationRepositoryError('MODEL_NOT_FOUND', `Unknown model: ${input.modelId}`)
  }

  const model = mutableManifest(manifest)
  const prepared = prepareGenerationParams(model, input.params, input.assetRefs)

  return {
    estimate: {
      modelId: manifest.id,
      provider: manifest.provider,
      providerModel: manifest.providerModel,
      category: manifest.category,
      params: prepared.params,
      costEstimate: estimateGenerationCost(model, prepared.pricingParams),
      currency: 'CNY',
      manifest,
    },
    prepared,
  }
}

export function estimateGenerationRequest(
  input: PrepareGenerationRequestInput,
): GenerationEstimate & { manifest: FrozenModelManifest } {
  return prepareGenerationRequest(input).estimate
}

/** 用 manifest 官方定价表估算生成成本；estimateModelCost 不抛错（保守回退）。 */
function estimateGenerationCost(
  manifest: FrozenModelManifest,
  params: Readonly<Record<string, unknown>>,
): number {
  return estimateModelCost(manifest, params).cents
}
