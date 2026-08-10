/**
 * Repository 层的领域类型定义。
 *
 * 约定：
 *  - 所有时间戳字段在领域类型中以 ISO 字符串形式表达（mappers.ts 负责 Date ↔ string）。
 *  - 公开（导出）的 input/output 接口都在这里集中声明，repository.ts 仅消费。
 *
 * 其中两块概念值得特别关注（详见各类型 doc）：
 *  1. `processing` 状态：repository 内部的中间态，不在 event-bus 的
 *     GenerationStatus 联合中；
 *  2. `Public*` 系列：分享页对外只读模型，严格 scope 掉一切 owner / cost /
 *     task / provider / outputResult 等敏感字段。
 */
import type { GenerationStatus } from '@bailian-studio/event-bus'
import type { ModelCategory, ModelProvider } from '@bailian-studio/model-core'
import type { TaskError, TaskRecord } from '@bailian-studio/task-engine'
import type { ProviderRequestAudit } from './provider-request-types'

/**
 * Repository 实际使用的状态联合：在 event-bus 公开的状态集合之上，额外加了一个
 * `processing` 中间态。
 *
 * 注意 `processing` 与 `provider_processing` 不是一回事：
 *  - `processing` 是 repository 内部的「worker 已认领 submit 任务」标志，
 *    仅在本层使用，不属于 event-bus 的 GenerationStatus 联合；
 *  - `provider_processing` 才是面向前端/事件总线的「provider 正在处理」语义。
 * SSE 管线对非终态状态一视同仁地当作 generation.status 事件转发，所以前端
 * 看不到这个内部区分。
 */
export type RepositoryGenerationStatus = GenerationStatus | 'processing'
export type GenerationLibraryState = 'visible' | 'hidden' | 'deleted'
/** 公开的持久化绑定始终保留有序数组形态。 */
export type GenerationAssetRefs = Record<string, string[]>
/** 创建请求接受标量作为单个有序资产绑定的简写。 */
export type GenerationAssetRefInput = Record<string, string | string[]>

/** 一条生成记录的完整领域模型（跨边界传递时时间戳为 ISO 字符串）。 */
export interface GenerationRecord {
  id: string
  userId: string
  modelId: string
  provider: ModelProvider
  providerModel: string
  category: ModelCategory
  inputParams: Record<string, unknown>
  /** 以 Manifest 媒体参数名为键的稳定 user-asset 绑定。 */
  assetRefs?: GenerationAssetRefs
  /** 作品可见性：'private'（仅本人）| 'public'（社区画廊可见）。默认 private。 */
  visibility: GalleryVisibility
  /** 对比批次 ID：同一次"同 prompt 多模型对比生成"的多条记录共用。 */
  batchId?: string
  status: RepositoryGenerationStatus
  statusReason?: string
  providerTaskId?: string
  providerStatus?: string
  requestId?: string  // DashScope API 请求唯一标识，用于问题排查
  traceId?: string  // 一次生成生命周期的链路标识
  outputResult?: Record<string, unknown>
  errorJson?: Record<string, unknown>
  costEstimate: number
  currency: 'CNY'
  pricingVersion: string
  modelManifestHash: string
  costFinal?: number
  parentRecordId?: string
  idempotencyKey?: string
  cancelRequestedAt?: string
  providerCancelStatus: 'not_requested' | 'requested' | 'succeeded' | 'failed' | 'unsupported'
  hiddenAt?: string
  deletedAt?: string
  createdAt: string
  updatedAt: string
}

/**
 * 只改变生成在 owner 任务库中的呈现方式。
 * 它绝不会取消 provider 执行、删除产物或改变计费。
 */
export interface SetGenerationLibraryStateInput {
  recordId: string
  userId: string
  state: GenerationLibraryState
  now?: string
}

/** 创建生成请求的输入。idempotencyKey 由 (userId, idempotencyKey) 唯一索引兜底。 */
export interface CreateGenerationInput {
  userId: string
  modelId: string
  params: Record<string, unknown>
  assetRefs?: GenerationAssetRefInput
  idempotencyKey?: string
  /** 对比批次 ID：一次"同 prompt 多模型对比生成"的多条记录共用（可空）。 */
  batchId?: string
  /** API 创建请求可传入的链路 ID；缺省时由 repository 生成。 */
  traceId?: string
  /** 在创建事务内部做原子校验的准入限额。 */
  quota?: GenerationQuotaLimits
  /**
   * 内部重试接缝：资产从库中隐藏后，历史绑定仍然可用。
   * HTTP 创建请求永远不会设置该标志。
   */
  allowDeletedAssetRefs?: boolean
}

export interface GenerationInputAsset {
  generationId: string
  parameterName: string
  position: number
  assetId: string
  userId: string
  kind: ArtifactKind
  source: 'upload' | 'link' | 'generation' | 'derived'
  storageProvider?: ArtifactStorageProvider
  storageKey?: string
  originalUrl?: string
}

export interface GenerationQuotaLimits {
  dailyTaskLimit?: number
  dailyCostLimitCents?: number
  dailyQuotaMode: 'attempts' | 'successful'
}

export interface WorkerHeartbeat {
  workerId: string
  status: 'running' | 'stopping'
  startedAt: string
  lastSeenAt: string
  stoppedAt?: string
  updatedAt: string
}

export interface WorkerHealth {
  status: 'ok' | 'failed'
  workers: WorkerHeartbeat[]
}

export interface RegisterWorkerHeartbeatInput {
  workerId: string
  startedAt: string
  now?: string
}

export interface CreateGenerationResult {
  record: GenerationRecord
  task: TaskRecord
  /** 与 record/task 一起提交的持久化初始 status 事件（即创建事件的 outbox 记录）。 */
  event: GenerationEvent
}

export interface GenerationEvent {
  id: string
  recordId: string
  userId: string
  status: string
  modelId: string
  updatedAt: string
  createdAt: string
}

export interface GenerationEventCursor {
  id: string
  createdAt: string
}

export interface ListGenerationEventsOptions {
  userId?: string
  /** 返回严格晚于该持久化 event id 的事件。 */
  afterId?: string
  /**
   * 返回严格晚于某个已解析持久化位置的事件。
   * 内部 outbox 消费者使用此形式，使游标进度在 retention 或 owner 删除
   * 引用的 event 行后仍然有效。
   */
  afterCursor?: GenerationEventCursor
  limit?: number
}

/** 只面向任务诊断的安全错误摘要，不包含 input/output/raw。 */
export interface TaskDiagnosticError {
  category: TaskError['category']
  message: string
  retriable: boolean
  code?: string
}

/** 任务生命周期的安全投影，用于详情页排障。 */
export interface TaskDiagnostics {
  id: string
  type: TaskRecord['type']
  status: TaskRecord['status']
  attempts: number
  maxAttempts: number
  createdAt: string
  startedAt?: string
  completedAt?: string
  updatedAt: string
  error?: TaskDiagnosticError
  durationMs?: number
}

/** 一条 generation 的链路诊断投影；不包含 prompt、provider raw 或存储 URL。 */
export interface GenerationDiagnostics {
  generationId: string
  traceId?: string
  generationDurationMs?: number
  tasks: TaskDiagnostics[]
  providerRequests: ProviderRequestAudit[]
}

/**
 * Provider 返回结果在 repository 层的归一化形态。`artifacts` 是规范化的产物
 * 列表，`usage`/`raw` 是计费/调试用的原始字段，会被一并写入 outputResult。
 */
export interface NormalizedGenerationOutput {
  artifacts: Array<Record<string, unknown>>
  usage?: unknown
  raw?: unknown
}

export type ArtifactKind = 'image' | 'video' | 'audio' | 'text' | 'archive'
export type ArtifactStatus = 'pending' | 'stored' | 'failed'
export type ArtifactStorageProvider = 'oss' | 'local'

/** 单个生成产物的领域模型。 */
export interface GenerationArtifact {
  id: string
  recordId: string
  userId: string
  kind: ArtifactKind
  sourceUrl?: string
  text?: string
  mimeType?: string
  storageProvider?: ArtifactStorageProvider
  storageKey?: string
  storageUrl?: string
  byteSize?: number
  status: ArtifactStatus
  errorJson?: Record<string, unknown>
  thumbnailStatus?: 'queued' | 'processing' | 'ready' | 'failed'
  thumbnailStorageProvider?: ArtifactStorageProvider
  thumbnailStorageKey?: string
  createdAt: string
  updatedAt: string
}

/** 供 API 读取本地对象前做归属校验的最小查询入参。 */
export interface GetOwnedStorageObjectInput {
  userId: string
  storageKey: string
}

/** 不把 storageKey 以外的内部行字段暴露给服务层，避免形成二次数据投影。 */
export interface OwnedStorageObject {
  id: string
  mimeType?: string
  /** 当拥有对象是用户资产时，其原始面向用户的名称。 */
  fileName?: string
  source: 'generation_artifact' | 'user_asset' | 'asset_derivative'
}

/** 标记某 artifact 已落存储的入参。 */
export interface MarkArtifactStoredInput {
  artifactId: string
  storageProvider: ArtifactStorageProvider
  storageKey: string
  storageUrl?: string
  byteSize: number
  mimeType?: string
  now?: string
}

/** 标记某 artifact 落储失败的入参。 */
export interface MarkArtifactFailedInput {
  artifactId: string
  error: TaskError
  now?: string
}

/**
 * 将记录翻到 `processing`（repository 内部中间态）的入参。
 * 不属于 event-bus 的 GenerationStatus 联合——见 RepositoryGenerationStatus。
 */
export interface MarkGenerationProcessingInput {
  recordId: string
  providerTaskId?: string
  providerStatus?: string
  requestId?: string
  raw?: unknown
  now?: string
}

/**
 * 排程一次 provider 轮询：除了把记录翻到 `processing`，还会入队一条
 * generation.poll 任务，其 nextRunAt 由调用方根据 provider 的轮询间隔决定。
 */
export interface ScheduleGenerationPollInput extends MarkGenerationProcessingInput {
  providerTaskId: string
  /**
   * 当前轮询任务在执行过程中再次安排下一次轮询时，排除自身，避免把
   * running 的当前任务误认为已经存在的轮询任务。
   */
  excludeTaskId?: string
  /**
   * 轮询任务的 nextRunAt。P1-22 的续跑路径（submit 重跑且记录已持有
   * providerTaskId）不关心调度时机——已有非终态 poll 任务会被直接复用，
   * 缺省时按「立即可认领」处理。
   */
  nextRunAt?: string
}

/** 完成生成（status=succeeded）的入参；可选择是否入队 artifact.persist 任务。 */
export interface CompleteGenerationInput {
  recordId: string
  providerStatus?: string
  requestId?: string
  /** Provider 完成后确认的最终费用，整数分（CNY）。 */
  costFinal: number
  output: NormalizedGenerationOutput
  raw?: unknown
  enqueueArtifactPersist?: boolean
  now?: string
}

export interface CompleteGenerationResult {
  /**
   * 状态迁移结果。`cancelled` 表示取消请求赢得了行锁，provider 输出被有意丢弃；
   * `already_completed` 是在此前成功完成后的一次幂等重放。
   * 调用方不得把这两种情况当作一次新的结算。
   */
  outcome: 'completed' | 'cancelled' | 'already_completed' | 'already_failed'
  record: GenerationRecord
  task?: TaskRecord
  /** provider 报告的最终费用超过了面向用户的预留上限。 */
  billingAnomaly?: { estimatedCents: number; reportedCents: number }
}

/** 失败结束生成（status=failed）的入参。 */
export interface FailGenerationInput {
  recordId: string
  error: TaskError
  providerStatus?: string
  requestId?: string
  raw?: unknown
  now?: string
}

/**
 * 以「取消」终态收尾一条生成（status=cancelled）。
 *
 * 与 FailGenerationInput 的关键区别：本方法【只写 cancelled】，绝不写 failed——
 * 这样一条已被用户取消的记录即便被 worker 看到、走取消短路，也不会被 failGeneration
 * 覆盖成 failed。errorJson 仍写入（便于排查），但 status 固定为 cancelled。
 */
export interface CancelGenerationInput {
  recordId: string
  error: TaskError
  /** 可选：覆盖 providerCancelStatus（默认不动）。 */
  providerCancelStatus?: GenerationRecord['providerCancelStatus']
  now?: string
}

/**
 * updateGenerationRecord 允许更新的字段子集。使用 `'key' in patch` 形式判断，
 * 因此显式传 `undefined` 也会被当作「要把该字段清空」处理（映射为 SQL NULL）。
 */
export type UpdateGenerationRecordPatch = Partial<Pick<
  GenerationRecord,
  | 'status'
  | 'statusReason'
  | 'providerTaskId'
  | 'providerStatus'
  | 'requestId'
  | 'outputResult'
  | 'errorJson'
  | 'costFinal'
  | 'parentRecordId'
  | 'idempotencyKey'
  | 'cancelRequestedAt'
  | 'providerCancelStatus'
>>

/**
 * 「我的作品库」按用户列出 artifact 的查询选项。
 * 复用 record 列表同款 keyset 分页：cursor 来自上一页返回的 nextCursor。
 */
export interface ListGenerationArtifactsOptions {
  /** 每页大小；会被 clamp 到 [1, 100]，默认 20。 */
  limit?: number
  /** 不透明游标：来自上一页返回的 `nextCursor`。 */
  cursor?: string
  /** 可选类型过滤（如 'image'、'video'）。 */
  kind?: ArtifactKind
}

/** 「我的作品库」列表结果。有更多行时携带 nextCursor。 */
export interface ListGenerationArtifactsResult {
  items: GenerationArtifact[]
  /** 还有更多行时出现；将其作为下一页的 `cursor` 传回即可续读。 */
  nextCursor?: string
}

/**
 * 请求取消一条生成。`now` 缺省时用当前时间，仅用于可注入测试。
 * 本方法只翻 cancel 标志位（cancelRequestedAt / providerCancelStatus），
 * 不在 provider 侧真正发起取消——那一步可由后续 worker 扩展完成。
 */
export interface RequestGenerationCancelInput {
  recordId: string
  userId: string
  now?: string
}

/**
 * 重跑一条生成：以原记录的 modelId + inputParams 起一条新 generation，
 * 并把新记录的 parentRecordId 指回原记录。idempotencyKey 仍走原有幂等语义。
 */
export interface RetryGenerationInput {
  recordId: string
  userId: string
  idempotencyKey?: string
  now?: string
  quota?: GenerationQuotaLimits
}

// --- 生成分享（Generation sharing） ------------------------------------------

/** 一条生成分享记录。每条 generation 恰好对应一个分享（靠部分唯一索引保证）。 */
export interface GenerationShare {
  id: string
  recordId: string
  userId: string
  includeParams: boolean
  expiresAt?: string
  revokedAt?: string
  createdAt: string
  updatedAt: string
}

export interface CreateGenerationShareInput {
  recordId: string
  userId: string
  /** 显式为 true 才向匿名 read model 返回 inputParams。 */
  includeParams?: boolean
  /** NULL/undefined 表示不设置自动过期。 */
  expiresAt?: string
  now?: string
}

export interface GetGenerationShareForRecordInput {
  recordId: string
  userId: string
}

export interface RevokeGenerationShareInput {
  recordId: string
  userId: string
  now?: string
}

/**
 * 严格 scope 后的公开只读模型：不包含 owner id、cost、idempotency、task、
 * provider、outputResult 等任何敏感或内部字段。`outputResult` 是有意省略的——
 * 对外可见的输出就是 artifacts 列表本身。
 */
export interface PublicSharedGenerationRecord {
  id: string
  modelId: string
  provider: ModelProvider
  providerModel: string
  category: ModelCategory
  /** 只有 owner 创建分享时显式 includeParams=true 才存在。 */
  inputParams?: Record<string, unknown>
  status: RepositoryGenerationStatus
  createdAt: string
  updatedAt: string
}

/**
 * 公开的 artifact 投影：没有 userId、没有 errorJson，也没有 readUrl。readUrl
 * 由 API 层从 storage 适配器拼出来后再附加——repository 永远不调用 storage。
 */
export interface PublicSharedGenerationArtifact {
  id: string
  kind: ArtifactKind
  mimeType?: string
  byteSize?: number
  status: ArtifactStatus
  createdAt: string
}

/** 分享页对外返回的整体结构：分享元信息 + 记录 + 产物列表。 */
export interface PublicSharedGeneration {
  share: { id: string; recordId: string; expiresAt?: string; createdAt: string; updatedAt: string }
  record: PublicSharedGenerationRecord
  artifacts: PublicSharedGenerationArtifact[]
}

// ---------------------------------------------------------------------------
// 社区画廊：作品可见性 / 画廊列表 / 收藏点赞。
// ---------------------------------------------------------------------------

/** 作品可见性：'private'（仅本人可见）| 'public'（出现在社区画廊）。 */
export type GalleryVisibility = 'private' | 'public'

/** 画廊条目（列表卡片）：author + 精选脱敏参数 + 封面产物 + 交互状态。 */
export interface GalleryItem {
  id: string
  modelId: string
  category: ModelCategory
  author: { id: string; displayName: string | null }
  /**
   * 精选脱敏参数：仅文本参数（媒体/参考图值在入库时已进 assetRefs，不在
   * inputParamsJson 中），供跨用户"用同参数生成"。
   */
  inputParams: Record<string, unknown>
  /** 封面产物（该记录首个已存 artifact，含 storage 坐标；API 层拼 readUrl 后脱敏）。 */
  cover?: GenerationArtifact
  likeCount: number
  likedByViewer: boolean
  favoritedByViewer: boolean
  createdAt: string
}

export interface ListGalleryResult {
  items: GalleryItem[]
  nextCursor?: string
}

/** 画廊详情：记录脱敏投影 + 全部产物 + 交互状态。 */
export interface GalleryDetail {
  record: PublicSharedGenerationRecord
  artifacts: GenerationArtifact[]
  author: { id: string; displayName: string | null }
  likeCount: number
  likedByViewer: boolean
  favoritedByViewer: boolean
}

/** 画廊列表排序：'latest' 按发布时间倒序（默认），'hot' 按点赞数倒序。 */
export type GallerySort = 'latest' | 'hot'

/** admin 画廊治理条目：admin 视角，含隐藏态与作者状态，供下架/恢复决策。 */
export interface AdminGalleryItem {
  id: string
  modelId: string
  category: ModelCategory
  author: { id: string; displayName: string | null }
  /** 封面产物（首个已存 artifact，含 storage 坐标；API 层拼 readUrl 后脱敏）。 */
  cover?: GenerationArtifact
  likeCount: number
  visibility: GalleryVisibility
  status: string
  hiddenAt?: string
  hiddenBy?: string
  createdAt: string
}

export interface ListAdminGalleryResult {
  items: AdminGalleryItem[]
  nextCursor?: string
}

// ---------------------------------------------------------------------------
// 管理后台 · 任务中心：全量 task_records 列表（含进行中 + 已完成）。
// ---------------------------------------------------------------------------

/** admin 任务列表项：作者投影 + 记录上下文 + 错误摘要（供运营排障）。 */
export interface AdminTaskItem {
  id: string
  type: TaskRecord['type']
  domain: TaskRecord['domain']
  status: TaskRecord['status']
  priority: number
  attempts: number
  maxAttempts: number
  nextRunAt: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
  recordId?: string
  userId?: string
  traceId?: string
  /** 作者投影（left join users；用户已删时缺失）。 */
  author?: { id: string; displayName: string | null }
  /** 关联生成记录上下文（recordId 命中 generation_records 时）。 */
  recordContext?: { modelId: string; category: ModelCategory }
  error?: TaskDiagnosticError
  /** 最近一次执行耗时（completedAt − startedAt），毫秒。 */
  durationMs?: number
}

export interface ListAdminTasksResult {
  items: AdminTaskItem[]
  nextCursor?: string
}

// ---------------------------------------------------------------------------
// 提示词资产库（服务端命名库）。
// ---------------------------------------------------------------------------

/** 提示词库条目：提示词 + 模型 + 文本参数（媒体/参考图值不入库）。 */
export interface PromptLibraryItem {
  id: string
  userId: string
  name: string
  modelId: string
  prompt: string
  params: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface ListPromptLibraryResult {
  items: PromptLibraryItem[]
  nextCursor?: string
}

// ---------------------------------------------------------------------------
// 管理分析：每模型成本毛利 + 留存漏斗。
// ---------------------------------------------------------------------------

/** admin 维护的每模型成本单价。 */
export interface ModelCost {
  modelId: string
  unitCostCents: number
  currency: string
  updatedAt: string
}

/** 成本毛利一行：某模型在窗口内成功生成的成本/收入/毛利（分）。 */
export interface CostMarginRow {
  modelId: string
  calls: number
  revenueCents: number
  unitCostCents: number
  costCents: number
  marginCents: number
}

/** 留存漏斗（窗口内）：注册→首生成→首成功→活跃（≥2 个不同日）。 */
export interface RetentionAnalytics {
  firstGeneration: number
  firstSuccess: number
  activeTwoDays: number
}

// ---------------------------------------------------------------------------
// 用户反馈通道。
// ---------------------------------------------------------------------------

export type FeedbackKind = 'feedback' | 'bug' | 'suggestion' | 'complaint'
export type FeedbackStatus = 'open' | 'reviewing' | 'resolved' | 'closed'

export interface UserFeedback {
  id: string
  userId: string | null
  kind: FeedbackKind
  content: string
  status: FeedbackStatus
  resolvedBy?: string
  resolvedAt?: string
  createdAt: string
  updatedAt: string
}

export interface ListFeedbackResult {
  items: UserFeedback[]
  nextCursor?: string
}

// ---------------------------------------------------------------------------
// 内容举报。
// ---------------------------------------------------------------------------

export type ContentReportReason = 'unsafe' | 'copyright' | 'privacy' | 'spam' | 'other'
export type ContentReportStatus = 'open' | 'reviewing' | 'resolved' | 'dismissed'

export interface ContentReport {
  id: string
  generationId: string
  reporterId: string
  reason: ContentReportReason
  details?: string
  status: ContentReportStatus
  resolvedBy?: string
  resolutionNote?: string
  resolvedAt?: string
  createdAt: string
  updatedAt: string
}

export interface ListContentReportsResult {
  items: ContentReport[]
  nextCursor?: string
}

// ---------------------------------------------------------------------------
// 社交通知（作品被点赞/收藏 → 通知作者）。
// ---------------------------------------------------------------------------

export type NotificationKind = 'like' | 'favorite' | 'system'

export interface NotificationItem {
  id: string
  kind: NotificationKind
  /** 触发动作的用户（点赞/收藏的人）；系统通知为空。 */
  actorId?: string
  /** 关联的公开作品记录。 */
  recordId?: string
  title: string
  body: string
  read: boolean
  createdAt: string
}

export interface ListNotificationsResult {
  items: NotificationItem[]
  nextCursor?: string
}
