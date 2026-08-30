/**
 * 生成域：生成记录生命周期中枢、产物、分享、用户资产与衍生、生成入参引用、
 * 事件 outbox、provider 请求审计、用量结算。
 * 依赖 identity（users）与 ops（task_records，经 provider_request_audits 外键）。
 */

import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { users } from './identity'
import { taskRecords } from './ops'

/**
 * 生成记录表 —— 整个生成流程的中枢业务表。
 *
 * 每行记录一个生成请求的完整生命周期：从 submitting 提交、processing
 * 处理中、到 succeeded/failed/cancelled 终态。涵盖文本生成图像/视频/音频等
 * 多种媒体类型；输入参数与输出结果各以 JSONB 落库以适配多变的 provider
 * schema。状态字段变更会写入 generation_events（见 notify.ts 的触发器）。
 */
export const generationRecords = pgTable('generation_records', {
  id: text('id').primaryKey(),
  /** 归属用户，删用户时级联清掉其全部生成记录。 */
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** 模型 ID，对应 MODEL_REGISTRY 中的条目（如 'qwen-image'）。 */
  modelId: text('model_id').notNull(),
  /** 提供商名称（如 'dashscope'），决定 worker 走哪条 runner。 */
  provider: text('provider').notNull(),
  /** 提供商侧的模型标识（如 'qwen-image-v1'），用于实际 API 调用。 */
  providerModel: text('provider_model').notNull(),
  /** 生成类别：'image' | 'video' | 'audio' | 'text'，驱动前端展示与分类查询。 */
  category: text('category').notNull(),
  /** 输入参数（提示词、尺寸、风格等），结构随 provider/模型而变。 */
  inputParamsJson: jsonb('input_params_json').$type<Record<string, unknown>>().notNull(),
  /**
   * 生命周期状态：submitting | processing | succeeded | failed | cancelled。
   * 注意 `processing` 是 repository 内部中间态（worker 已抢占 submit 任务），
   * 不属于 event bus 包 的 GenerationStatus union；前端通过 SSE 透明
    * 接收，不做特判。该列状态变更会触发 notify.ts 安装的 outbox 捕获器。
   */
  status: text('status').notNull(),
  /** 状态变更原因说明（如失败时的简述）。 */
  statusReason: text('status_reason'),
  /** 提供商返回的任务 ID，用于 worker 周期性 poll 任务进度。 */
  providerTaskId: text('provider_task_id'),
  /** 提供器侧任务状态（如 'pending'/'running'/'completed'/'failed'）。 */
  providerStatus: text('provider_status'),
   /** DashScope API 请求 ID，用于跨 provider 排查问题、关联日志。 */
   requestId: text('request_id'),
   /** 一次生成生命周期的链路 ID；历史记录无法还原时保持为空。 */
   traceId: text('trace_id'),
  /** 输出结果（媒体 URL、元数据等），结构随 provider 而变。 */
  outputResultJson: jsonb('output_result_json').$type<Record<string, unknown>>(),
  /** 失败时的错误详情（错误码、message、原始响应等）。 */
  errorJson: jsonb('error_json').$type<Record<string, unknown>>(),
  /** 预估费用（整数分 CNY），提交时按模型定价规则计算。 */
  costEstimate: integer('cost_estimate').notNull(),
  /** 与价格快照一起捕获的货币；当前仅支持 CNY。 */
  currency: text('currency').notNull().default('CNY'),
  /** 本次估价使用的确定性定价指纹。 */
  pricingVersion: text('pricing_version').notNull().default('legacy-unknown'),
  /** 本次请求使用的确定性完整 manifest 指纹。 */
  modelManifestHash: text('model_manifest_hash').notNull().default('legacy-unknown'),
  /** 最终费用（整数分 CNY），完成时回填。 */
  costFinal: integer('cost_final'),
  /**
   * 父记录 ID，支持生成衍生关系（如图像变体、视频续集）。删父记录时置空
   * 而非级联，避免删除原作时连带动静衍生物一起消失。
   */
  parentRecordId: text('parent_record_id').references((): AnyPgColumn => generationRecords.id, { onDelete: 'set null' }),
  /**
   * 作品可见性：'private'（仅本人可见）| 'public'（出现在社区画廊，所有
   * 登录同事可见）。默认 private，用户主动公开。画廊查询只展示 status 为
   * succeeded、未删未藏且 visibility='public' 的记录。
   */
  visibility: text('visibility').notNull().default('private'),
  /**
   * 对比批次 ID：同一次"同 prompt 多模型对比生成"提交的多条记录共用同一
   * batchId，供前端"本次对比"分组筛选。非对比提交为空。
   */
  batchId: text('batch_id'),
  /**
   * 幂等键，由客户端提供。配合下方的部分唯一索引，保证同一用户同一 key
   * 不会被重复提交成两条记录。
   */
  idempotencyKey: text('idempotency_key'),
  cancelRequestedAt: timestamp('cancel_requested_at', { withTimezone: true }),
  /** 提供商侧取消状态（与 generation-repository types.ts 的联合一致）：'not_requested' | 'requested' | 'succeeded' | 'failed' | 'unsupported'。 */
  providerCancelStatus: text('provider_cancel_status').notNull(),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  /** 仅从默认任务列表收起，不影响生成执行、产物或费用。 */
  hiddenAt: timestamp('hidden_at', { withTimezone: true }),
  hiddenBy: text('hidden_by'),
  /** 软删除：记录与产物仍保留，可从“已删除”筛选中恢复。 */
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  // 用户列表的主查询路径：按用户 + 创建时间倒序分页（P2-09：keyset 决胜列 id 一并入索引，
  // 同毫秒多行时平局比较走索引而非内存）。
  index('generation_records_user_created_idx').on(table.userId, table.createdAt, table.id),
  // 幂等保障：同一用户 + 同一 idempotencyKey 只能有一条记录（NULL 不计入）。
  uniqueIndex('generation_records_user_idempotency_key_idx')
    .on(table.userId, table.idempotencyKey)
    .where(sql`${table.idempotencyKey} is not null`),
  // 轮询查询：worker 按状态 + 更新时间扫描待处理/重试任务。
  index('generation_records_status_updated_idx').on(table.status, table.updatedAt),
  // 用户任务列表按展示状态筛选；createdAt 保持 keyset 分页顺序。
  index('generation_records_user_library_idx').on(
    table.userId,
    table.deletedAt,
    table.hiddenAt,
    table.createdAt,
  ),
  // 衍生关系反查：由父记录找其衍生物。
  index('generation_records_parent_record_idx').on(table.parentRecordId),
  check('generation_records_visibility_check', sql`${table.visibility} in ('private', 'public')`),
  // 社区画廊主查询路径：公开 + 成功 + 未删未藏，按创建时间倒序 keyset 分页。
  index('generation_records_public_gallery_idx').on(table.visibility, table.status, table.deletedAt, table.createdAt),
  // 对比批次反查：一次对比生成的 N 条记录分组。
  index('generation_records_batch_id_idx').on(table.batchId),
  // Canvas 管理成本分析按父任务 traceId 关联子 generation，单独索引该横切关联键。
  index('generation_records_trace_idx').on(table.traceId),
])

/**
 * 生成产物表 —— 一次生成任务输出的媒体文件元数据。
 *
 * 一条 generation_record 可对应多条产物（多图、视频多段等）。产物通常先以
 * provider 返回的临时 sourceUrl 落库，随后由 artifact.persist 任务异步拉取
 * 并写入存储后端（local/OSS），最终回填 storageProvider/storageKey/storageUrl。
 */
export const generationArtifacts = pgTable('generation_artifacts', {
  id: text('id').primaryKey(),
  /** 所属生成记录，删记录时级联清掉产物。 */
  recordId: text('record_id').notNull().references(() => generationRecords.id, { onDelete: 'cascade' }),
  /** 所属用户（冗余自 record，方便按用户直接查询产物与做权限校验）。 */
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** 产物类型：image | video | audio | text | metadata。 */
  kind: text('kind').notNull(),
  /** provider 返回的原始链接，可能是临时 URL，需异步持久化到自家存储。 */
  sourceUrl: text('source_url'),
  /** 文本类产物的正文内容（直接落库，不走存储）。 */
  text: text('text'),
  mimeType: text('mime_type'),
  /** 实际存储后端：local | oss | s3 | cos。pending 态产物此列为空。 */
  storageProvider: text('storage_provider'),
  /** 对象在存储后端中的 key（持久化后回填）。 */
  storageKey: text('storage_key'),
  /** 持久化后对外可访问的 URL（由存储适配器的 createReadUrl 生成）。 */
  storageUrl: text('storage_url'),
  byteSize: integer('byte_size'),
  /** 持久化状态：pending | persisting | succeeded | failed。 */
  status: text('status').notNull(),
  /** 持久化失败时的错误详情。 */
  errorJson: jsonb('error_json').$type<Record<string, unknown>>(),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  // 详情页按记录加载产物的主索引。
  index('generation_artifacts_record_created_idx').on(table.recordId, table.createdAt),
  // 用户级产物查询（"我的作品"列表）。
  index('generation_artifacts_user_created_idx').on(table.userId, table.createdAt),
  // worker 扫描待持久化产物：按状态 + 更新时间。
  index('generation_artifacts_status_updated_idx').on(table.status, table.updatedAt),
  // 防重持久化：同一记录下同一 storageKey 只能有一条（NULL 不计入）。
  uniqueIndex('generation_artifacts_record_storage_key_idx')
    .on(table.recordId, table.storageKey)
    .where(sql`${table.storageKey} is not null`),
])

/**
 * 生成分享表 —— 把一条 generation_record 公开分享。
 *
 * v2 设计的关键不变量：
 *  - 分享默认不公开输入参数；只有 owner 明确选择时才返回 inputParams；
 *  - 分享可设置过期时间，也可由 owner 主动撤销；撤销后原访问键永久失效；
 *  - 每条记录至多一份活跃分享：靠 recordId 上的部分唯一索引
 *    `WHERE deletedAt IS NULL AND revokedAt IS NULL` 强制；
 *  - 公开访问键不可枚举：id 形如 `share_<32hex>`，由owner 创建时生成；
 *  - 删除用户或生成记录时级联清掉对应分享。
 *
 * 公开读取（GET /api/shares/generations/:shareId）无需登录，但 API 层只返回
 * 严格裁剪过的只读视图（默认不含 prompt、storageKey、owner/cost 等），见
 * repository 的 PublicShared* 类型。
 */
export const generationShares = pgTable('generation_shares', {
  /** 公开访问键，不透明随机串（share_<32hex>），不可枚举。 */
  id: text('id').primaryKey(),
  /** 被分享的生成记录，删记录时级联删除分享。 */
  recordId: text('record_id').notNull().references(() => generationRecords.id, { onDelete: 'cascade' }),
  /** owner 用户（冗余自 record，便于 owner 查询自己的分享），删用户级联。 */
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** 是否允许公开 read model 返回原始输入参数；默认关闭，避免 prompt 泄露。 */
  includeParams: boolean('include_params').notNull().default(false),
  /** 公开访问截止时间；NULL 表示不自动过期。 */
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  /** owner 主动撤销时间；撤销后公开读取必须失效。 */
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: text('revoked_by'),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  // 每条记录至多一个未撤销分享；过期分享可由 owner 重新激活，仍复用原访问键。
  uniqueIndex('generation_shares_record_idx')
    .on(table.recordId)
    .where(sql`${table.deletedAt} is null and ${table.revokedAt} is null`),
  // owner 按"我的分享"列表查询。
  index('generation_shares_user_created_idx').on(table.userId, table.createdAt),
  // 公开读取和 owner 管理都需要快速筛选未撤销分享。
  index('generation_shares_revoked_expires_idx').on(table.revokedAt, table.expiresAt),
])

/**
 * 用户资产表 —— 用户主动上传或通过 URL 导入的媒体文件。
 *
 * 与 generation_artifacts 的区别：
 *  - user_assets 记录用户主动提供的文件，以及辅助动作产生的派生文件；
 *  - source 字段区分上传（upload）、URL 导入（link）与派生结果（derived）；
 *  - 上传即 ready，无需经过异步 persist 流程（因为文件本来就在用户本地）。
 *
 * metadataJson 为扩展预留，可记录 ASR 任务 ID、编辑参数等附加上下文。
 */
export const userAssets = pgTable('user_assets', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  source: text('source').notNull(), // 'upload' | 'link' | 'generation' | 'derived'
  generationArtifactId: text('generation_artifact_id').references(() => generationArtifacts.id, { onDelete: 'set null' }),
  recordId: text('record_id').references(() => generationRecords.id, { onDelete: 'set null' }),
  modelId: text('model_id'),
  fileName: text('file_name'),
  originalUrl: text('original_url'),
  mimeType: text('mime_type'),
  byteSize: integer('byte_size'),
  storageProvider: text('storage_provider'),
  storageKey: text('storage_key'),
  storageUrl: text('storage_url'),
  metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>(),
  status: text('status').notNull().default('ready'),
  errorJson: jsonb('error_json').$type<Record<string, unknown>>(),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  index('user_assets_user_created_idx').on(table.userId, table.createdAt),
  index('user_assets_kind_idx').on(table.kind),
  index('user_assets_source_idx').on(table.source),
  index('user_assets_record_idx').on(table.recordId),
  uniqueIndex('user_assets_generation_artifact_idx')
    .on(table.generationArtifactId)
    .where(sql`${table.generationArtifactId} is not null and ${table.deletedAt} is null`),
  // 资产列表标题排序：lower(coalesce(file_name, model_id, id)) 升序（P2-08）。
  index('user_assets_user_title_idx').on(
    table.userId,
    sql`lower(coalesce(${table.fileName}, ${table.modelId}, ${table.id}))`,
  ),
  // 资产列表大小排序：byte_size 降序、空值置后（P2-08）。
  index('user_assets_user_size_idx').on(
    table.userId,
    table.byteSize.desc().nullsLast(),
  ),
])

/**
 * 资产衍生品：由用户资产派生、归属基础设施的可复用预览。单独建表可避免把
 * user_assets 绑定到某一种预览实现，并为未来的 proxy、poster、waveform
 * 等衍生类型留出空间。
 */
export const assetDerivatives = pgTable('asset_derivatives', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull().references(() => userAssets.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  status: text('status').notNull(),
  storageProvider: text('storage_provider'),
  storageKey: text('storage_key'),
  mimeType: text('mime_type'),
  byteSize: integer('byte_size'),
  metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>(),
  errorJson: jsonb('error_json').$type<Record<string, unknown>>(),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  check('asset_derivatives_kind_check', sql`${table.kind} in ('thumbnail')`),
  check('asset_derivatives_status_check', sql`${table.status} in ('queued', 'processing', 'ready', 'failed')`),
  uniqueIndex('asset_derivatives_asset_kind_idx')
    .on(table.assetId, table.kind)
    .where(sql`${table.deletedAt} is null`),
  index('asset_derivatives_status_updated_idx').on(table.status, table.updatedAt),
  index('asset_derivatives_user_created_idx').on(table.userId, table.createdAt),
])

/** 用户生成请求中媒体参数到稳定资产 ID 的持久引用。 */
export const generationInputAssets = pgTable('generation_input_assets', {
  generationId: text('generation_id').notNull().references(() => generationRecords.id, { onDelete: 'cascade' }),
  parameterName: text('parameter_name').notNull(),
  position: integer('position').notNull().default(0),
  assetId: text('asset_id').notNull().references(() => userAssets.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, table => [
  uniqueIndex('generation_input_assets_parameter_idx').on(table.generationId, table.parameterName, table.position),
  index('generation_input_assets_asset_idx').on(table.assetId),
])

/**
 * Generation 事件 outbox。每次用户可见的 generation 状态变更都在同一数据库
 * 事务内追加到这里。API 的 LISTEN 连接只是唤醒信号；重连的客户端借助本表与
 * 其 SSE Last-Event-ID 追赶进度，不依赖进程内内存。
 */
export const generationEvents = pgTable('generation_events', {
  id: text('id').primaryKey(),
  recordId: text('record_id').notNull().references(() => generationRecords.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').notNull(),
  modelId: text('model_id').notNull(),
  /** 状态变更时 generation record 的 updated_at。 */
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  /** 追加顺序的平局决胜字段，供不透明 SSE cursor 使用。 */
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, table => [
  index('generation_events_user_created_idx').on(table.userId, table.createdAt, table.id),
  index('generation_events_created_idx').on(table.createdAt, table.id),
  index('generation_events_record_created_idx').on(table.recordId, table.createdAt),
])

/**
 * Provider 请求审计表 —— 每一次真实的 submit / poll / chat / cancel 调用一行。
 *
 * 这张表只保存稳定的排障与计费关联字段，不保存 API key、请求 body 或 provider
 * 原始响应。`started` 记录允许我们识别 worker 在外部调用期间崩溃的请求；完成后
 * 由 repository 更新为 succeeded / failed / unsupported，并写入 provider requestId
 * 与耗时。历史 generation 记录无法安全还原每一次 provider 调用，因此新表只对
 * 迁移后的新请求开始积累真实审计数据，不伪造历史行。
 */
export const providerRequestAudits = pgTable('provider_request_audits', {
  id: text('id').primaryKey(),
  generationId: text('generation_id').notNull().references(() => generationRecords.id, { onDelete: 'cascade' }),
  taskId: text('task_id').references(() => taskRecords.id, { onDelete: 'set null' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  providerModel: text('provider_model').notNull(),
  /** submit | poll | chat | cancel */
  operation: text('operation').notNull(),
  /** started | succeeded | failed | unsupported */
  status: text('status').notNull(),
  /** 稳定的、跨 submit 重试复用的 generation 级身份。 */
  idempotencyKey: text('idempotency_key'),
  providerTaskId: text('provider_task_id'),
  providerRequestId: text('provider_request_id'),
  attempt: integer('attempt').notNull(),
  /** 本次调用对应的产品侧估价；整数分 CNY。仅作审计上下文，不可跨 poll 行直接求和。 */
  estimatedCostCents: integer('estimated_cost_cents').notNull(),
  /** 只有 provider 已确认完成并返回可结算费用时才写入。 */
  billedCostCents: integer('billed_cost_cents'),
  errorJson: jsonb('error_json').$type<Record<string, unknown>>(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  latencyMs: integer('latency_ms'),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  index('provider_request_audits_generation_started_idx').on(table.generationId, table.startedAt),
  index('provider_request_audits_task_idx').on(table.taskId),
  index('provider_request_audits_request_idx').on(table.providerRequestId),
  index('provider_request_audits_idempotency_idx').on(table.idempotencyKey),
  index('provider_request_audits_status_started_idx').on(table.status, table.startedAt),
])

/**
 * Generation 级用量结算表 —— 每条 generation 恰好一行，避免按 provider poll
 * 次数重复计算成本。创建时写入 estimatedCostCents，provider 完成后回填
 * finalCostCents；失败/取消保留估价但没有最终费用。历史 generation 由迁移脚本
 * 按 generation_records 一对一回填，后续月度统计只读这张表。
 */
export const usageRecords = pgTable('usage_records', {
  id: text('id').primaryKey(),
  generationId: text('generation_id').notNull().references(() => generationRecords.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  modelId: text('model_id').notNull(),
  provider: text('provider').notNull(),
  providerModel: text('provider_model').notNull(),
  category: text('category').notNull(),
  /** reserved | settled | failed | cancelled */
  status: text('status').notNull(),
  /** 创建请求时的估价，整数分 CNY。 */
  estimatedCostCents: integer('estimated_cost_cents').notNull(),
  /** provider 完成后确认的最终费用（整数分 CNY），仅在其成功后写入。 */
  providerCostCents: integer('provider_cost_cents'),
  /** 面向用户的结算费用；保留期为空，退款后为 0。 */
  chargedCostCents: integer('charged_cost_cents'),
  /** 最终结算对应的 provider requestId；不是 poll 请求数。 */
  providerRequestId: text('provider_request_id'),
  settledAt: timestamp('settled_at', { withTimezone: true }),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  uniqueIndex('usage_records_generation_idx').on(table.generationId),
  index('usage_records_user_created_idx').on(table.userId, table.createdAt),
  index('usage_records_status_created_idx').on(table.status, table.createdAt),
])
