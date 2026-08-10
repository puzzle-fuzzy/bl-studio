/**
 * Bailian Studio 数据库 Schema 定义。
 *
 * 核心架构（按业务域）：
 *  1. users / sessions —— 自托管邮箱+密码认证与可撤销 JWT 会话（@bailian-studio/auth）。
 *  2. generation_records / generation_artifacts / task_records —— 生成任务
 *     生命周期的中枢：提交→轮询→产物持久化（@bailian-studio/generation-repository）。
 *  3. generation_shares —— 把一条生成记录公开分享，支持过期/撤销，每记录至多一份活跃分享。
 *
 * 设计理念：
 *  - 软删除：业务表统一带 deletedAt/deletedBy；唯一索引多为 `WHERE deletedAt
 *    IS NULL` 形态的部分唯一索引，让已删除记录不再占用唯一性名额。
 *  - 审计列：所有业务表都带 createdBy/updatedBy（默认 'system'）+ createdAt/
 *    updatedAt（`withTimezone: true`，存 UTC）。这套审计列在每张表里语义一致，
 *    因此下文不再逐字段注释；只在与默认语义不同或有特殊不变量处才加注。
 *  - 幂等性：generation_records 通过 `(userId, idempotencyKey)` 部分唯一索引
 *    防重复提交（idempotencyKey IS NOT NULL 才计入）。
 *  - 级联删除：FK `onDelete: 'cascade'` 让删用户/记录时自动清理从属行；
 *    `onDelete: 'set null'` 用于自引用的衍生关系（parentRecordId）。
 *  - 分布式锁：task_records 用 lockedBy/lockedUntil 实现 worker 抢占，配合
 *    `SELECT ... FOR UPDATE SKIP LOCKED`（见 repository）做到无锁竞争认领。
 *
 * 数据流（生成主链路）：
 *   用户请求 → generation_records(submitting) + task_records(generation.submit)
 *   worker 抢占 → markProcessing → providerTaskId → task_records(generation.poll) 轮询
 *   完成后 → generation_records(succeeded) → 可选 task_records(artifact.persist)
 *   产物落库 → generation_artifacts(succeeded)
 *
 * @see @bailian-studio/generation-repository 封装 generation_records 与 task_records 的 CRUD 与状态机
 * @see ./notify.ts generation_events outbox 与 pg_notify trigger 装配
 */

import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core'

/**
 * 用户表 —— 自托管认证的用户主表。
 *
 * 邮箱在"未软删除"范围内唯一（部分唯一索引），删除后允许同邮箱重新注册；
 * 密码以 argon2id 哈希存储（@node-rs/argon2），明文永不落库。所有业务表通过
 * userId 关联到此处。
 */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  /** argon2id 密码哈希（由 @node-rs/argon2 生成），永不存明文。GitHub OAuth 用户存随机不可用哈希。 */
  passwordHash: text('password_hash').notNull(),
  /** 是否启用邮箱密码登录；GitHub-only 账号在通过重置密码设置前为 false。 */
  passwordAuthEnabled: boolean('password_auth_enabled').notNull().default(true),
  /** 为空表示邮箱尚未验证；已有用户由迁移回填为创建时间。 */
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  /** GitHub OAuth 用户 ID（数字），邮箱登录用户为 NULL。 */
  githubId: text('github_id'),
  displayName: text('display_name'),
  /**
   * 自定义头像的存储 key（storage adapter 命名空间下）。为空表示未上传，
   * 使用由 userId 确定性生成的 identicon 默认头像（GET /api/avatars/:userId）。
   */
  avatarStorageKey: text('avatar_storage_key'),
  role: text('role').notNull().default('user'),
  /**
   * 封禁时间，非空即封禁。封禁 ≠ 软删除：封禁保留邮箱占用与账号数据，
   * 只是禁止登录/签发新会话/提交新生成；在途任务放行完成。见
   * `docs/05-community-features.md` B 节。
   */
  bannedAt: timestamp('banned_at', { withTimezone: true }),
  bannedBy: text('banned_by'),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  check('users_role_check', sql`${table.role} in ('user', 'admin')`),
  // 部分唯一索引：仅对未软删除的邮箱强制唯一，故已删除邮箱可被重新注册。
  uniqueIndex('users_email_idx').on(table.email).where(sql`${table.deletedAt} is null`),
  // GitHub ID 同样只对未软删除行强制唯一。
  uniqueIndex('users_github_id_idx').on(table.githubId).where(sql`${table.deletedAt} is null`),
])

/**
 * 邮箱验证和密码重置使用的一次性动作令牌。
 *
 * 只保存原始 token 的 SHA-256，不保存能够直接使用的凭据。消费动作与对应的
 * 用户状态变更必须在同一个事务中完成。
 */
export const authActionTokens = pgTable('auth_action_tokens', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  purpose: text('purpose').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  check('auth_action_tokens_purpose_check', sql`${table.purpose} in ('email_verification', 'password_reset')`),
  uniqueIndex('auth_action_tokens_hash_idx').on(table.tokenHash),
  index('auth_action_tokens_user_purpose_idx').on(table.userId, table.purpose, table.createdAt),
  index('auth_action_tokens_expiry_idx').on(table.expiresAt),
])

/**
 * 会话表 —— 与 JWT 配合实现可撤销会话。
 *
 * 登录时签发 JWT（载荷含 sessionId）并在本表插入一行；每次请求校验 JWT
 * 签名 + 本表仍有有效行；登出/吊销即删除（或软删除）该行，使 token 在 exp
 * 之前即失效。这是"可撤销"语义的关键：单纯 JWT 无法做到未到期主动失效。
 */
export const sessions = pgTable('sessions', {
  /** 会话标识，对应 JWT 的 jti，UUID 格式。 */
  id: text('id').primaryKey(),
  /** 关联用户，删用户时级联清掉其所有会话。 */
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  index('sessions_user_idx').on(table.userId),
])

/**
 * 用户与资源访问审计表。
 *
 * 与 provider_request_audits 不同，这张表记录产品侧的安全事件：谁在何时
 * 登录、创建/取消生成、读取 artifact 或管理分享。它不保存请求体、prompt、
 * 凭据、signed URL 或原始 provider 数据。userId 使用 set null，确保用户被
 * 删除后仍能保留不可抵赖的安全时间线。
 */
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  outcome: text('outcome').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  requestId: text('request_id'),
  traceId: text('trace_id'),
  method: text('method'),
  /** 仅保存 pathname，不保存 query string。 */
  path: text('path'),
  metadataJson: jsonb('metadata_json').$type<Record<string, string | number | boolean | null>>(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  check('audit_logs_action_check', sql`${table.action} in ('auth.register', 'auth.verify-email', 'auth.resend-verification', 'auth.login', 'auth.github', 'auth.forgot-password', 'auth.reset-password', 'auth.change-password', 'auth.logout', 'auth.logout-all', 'auth.profile.update', 'auth.avatar.update', 'auth.avatar.remove', 'generation.create', 'generation.cancel', 'generation.retry', 'generation.hide', 'generation.delete', 'generation.restore', 'artifact.read', 'asset.upload', 'asset.import', 'asset.delete', 'share.create', 'share.revoke', 'points.grant', 'points.adjustment', 'admin.user.create', 'admin.user.update', 'admin.user.delete', 'admin.user.ban', 'admin.user.unban', 'gallery.like', 'gallery.favorite', 'gallery.visibility-change', 'admin.gallery.hide', 'admin.gallery.unhide', 'feedback.submit', 'feedback.update', 'prompt-library.create', 'prompt-library.delete', 'content.report.submit', 'admin.content-report.update')`),
  check('audit_logs_outcome_check', sql`${table.outcome} in ('succeeded', 'failed')`),
  index('audit_logs_user_occurred_idx').on(table.userId, table.occurredAt),
  index('audit_logs_action_occurred_idx').on(table.action, table.occurredAt),
  index('audit_logs_target_occurred_idx').on(table.targetType, table.targetId, table.occurredAt),
  index('audit_logs_request_idx').on(table.requestId),
])

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
  /** 提供商侧取消状态：'none' | 'requested' | 'cancelled' | 'failed'。 */
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
])

/**
 * 用户积分账户与不可变余额账本。账户行是并发锁/快照；
 * 账本条目是只追加的审计事实。
 */
export const creditAccounts = pgTable('credit_accounts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  availableCents: integer('available_cents').notNull().default(0),
  reservedCents: integer('reserved_cents').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  check('credit_accounts_available_non_negative', sql`${table.availableCents} >= 0`),
  check('credit_accounts_reserved_non_negative', sql`${table.reservedCents} >= 0`),
])

export const creditLedgerEntries = pgTable('credit_ledger_entries', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull().references(() => creditAccounts.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  generationId: text('generation_id').references(() => generationRecords.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  availableDeltaCents: integer('available_delta_cents').notNull(),
  reservedDeltaCents: integer('reserved_delta_cents').notNull(),
  availableBalanceCents: integer('available_balance_cents').notNull(),
  reservedBalanceCents: integer('reserved_balance_cents').notNull(),
  idempotencyKey: text('idempotency_key').notNull(),
  reason: text('reason'),
  actorUserId: text('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
  requestId: text('request_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, table => [
  check('credit_ledger_kind_check', sql`${table.kind} in ('grant', 'recharge', 'reserve', 'settle', 'refund', 'adjustment')`),
  uniqueIndex('credit_ledger_account_idempotency_idx').on(table.accountId, table.idempotencyKey),
  index('credit_ledger_account_created_idx').on(table.accountId, table.createdAt),
  index('credit_ledger_generation_idx').on(table.generationId),
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
 * 社区画廊点赞 —— 对公开作品的公开互动（计数 + 已赞态）。
 * 仅允许对 visibility='public' 的记录点赞（API 层校验）；复合唯一索引让
 * toggle 幂等（onConflictDoNothing）。删用户/记录时级联清理。
 */
export const generationLikes = pgTable('generation_likes', {
  recordId: text('record_id').notNull().references(() => generationRecords.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, table => [
  uniqueIndex('generation_likes_record_user_idx').on(table.recordId, table.userId),
  index('generation_likes_user_created_idx').on(table.userId, table.createdAt),
])

/**
 * 个人收藏 —— 书签语义：可收藏自己或他人、公开或私有的作品，仅本人可见。
 */
export const generationFavorites = pgTable('generation_favorites', {
  recordId: text('record_id').notNull().references(() => generationRecords.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, table => [
  uniqueIndex('generation_favorites_record_user_idx').on(table.recordId, table.userId),
  index('generation_favorites_user_created_idx').on(table.userId, table.createdAt),
])

/**
 * 提示词资产库 —— 服务端命名库：存"提示词 + 模型 + 文本参数"，
 * 媒体/参考图参数不入库（跨用户复用不泄露个人素材）。
 */
export const promptLibrary = pgTable('prompt_library', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  modelId: text('model_id').notNull(),
  prompt: text('prompt').notNull(),
  paramsJson: jsonb('params_json').$type<Record<string, unknown>>().notNull(),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  index('prompt_library_user_updated_idx').on(table.userId, table.updatedAt),
])

/**
 * 用户反馈 —— 应用内意见反馈通道（提建议/报 bug 等），admin 在后台流转状态。
 */
export const userFeedback = pgTable('user_feedback', {
  id: text('id').primaryKey(),
  /** 提交者；用户被删后保留（set null），不破坏反馈时间线。 */
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  kind: text('kind').notNull(),
  content: text('content').notNull(),
  /** open | reviewing | resolved | closed。 */
  status: text('status').notNull().default('open'),
  resolvedBy: text('resolved_by'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  check('user_feedback_kind_check', sql`${table.kind} in ('feedback', 'bug', 'suggestion', 'complaint')`),
  check('user_feedback_status_check', sql`${table.status} in ('open', 'reviewing', 'resolved', 'closed')`),
  index('user_feedback_status_created_idx').on(table.status, table.createdAt),
])

/**
 * 内容举报 —— 与普通用户反馈分离，支持对公开作品的人工审核队列。
 * 当前只支持 generation 目标；删除用户/作品时级联清理，避免保留无法解释的孤立内容事件。
 */
export const contentReports = pgTable('content_reports', {
  id: text('id').primaryKey(),
  generationId: text('generation_id').notNull().references(() => generationRecords.id, { onDelete: 'cascade' }),
  reporterId: text('reporter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reason: text('reason').notNull(),
  details: text('details'),
  /** open | reviewing | resolved | dismissed */
  status: text('status').notNull().default('open'),
  resolvedBy: text('resolved_by').references(() => users.id, { onDelete: 'set null' }),
  resolutionNote: text('resolution_note'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  check('content_reports_reason_check', sql`${table.reason} in ('unsafe', 'copyright', 'privacy', 'spam', 'other')`),
  check('content_reports_status_check', sql`${table.status} in ('open', 'reviewing', 'resolved', 'dismissed')`),
  uniqueIndex('content_reports_reporter_generation_idx')
    .on(table.reporterId, table.generationId)
    .where(sql`${table.deletedAt} is null`),
  index('content_reports_status_created_idx').on(table.status, table.createdAt),
  index('content_reports_generation_created_idx').on(table.generationId, table.createdAt),
])

/**
 * 社交通知：作品被点赞/收藏时通知作者（服务端落库 + SSE 实时推送）。
 * kind：like/favorite（社交通知）/ system（预留系统通知）；actorId 为触发者，
 * recordId 关联公开作品；readAt 为空表示未读。删除用户/记录时级联清理。
 */
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  /** 收件人。 */
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** like | favorite | system。 */
  kind: text('kind').notNull(),
  /** 触发者（点赞/收藏的人）；系统通知为空。 */
  actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
  /** 关联的公开作品记录。 */
  recordId: text('record_id').references(() => generationRecords.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  check('notifications_kind_check', sql`${table.kind} in ('like', 'favorite', 'system')`),
  index('notifications_user_created_idx').on(table.userId, table.createdAt),
])

/**
 * 每模型成本单价（admin 维护）—— 供成本毛利分析：成本 = 调用数 × unitCostCents。
 * 播种脚本 infra/scripts/seed-model-costs.ts 从 infra/seed/model-costs.json 初始化。
 */
export const modelCosts = pgTable('model_costs', {
  modelId: text('model_id').primaryKey(),
  unitCostCents: integer('unit_cost_cents').notNull(),
  currency: text('currency').notNull().default('CNY'),
  updatedBy: text('updated_by').notNull().default('system'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, table => [
  check('model_costs_unit_cost_non_negative', sql`${table.unitCostCents} >= 0`),
])

export const mediaJobs = pgTable('media_jobs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  operation: text('operation').notNull(),
  status: text('status').notNull(),
  sourceAssetId: text('source_asset_id'),
  sourceKind: text('source_kind').notNull(),
  outputAssetId: text('output_asset_id'),
  inputJson: jsonb('input_json').$type<Record<string, unknown>>().notNull(),
  outputJson: jsonb('output_json').$type<Record<string, unknown>>(),
  errorJson: jsonb('error_json').$type<Record<string, unknown>>(),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  index('media_jobs_user_created_idx').on(table.userId, table.createdAt),
  index('media_jobs_status_updated_idx').on(table.status, table.updatedAt),
  index('media_jobs_source_asset_idx').on(table.sourceAssetId),
])

/**
 * 任务记录表 —— 异步任务队列的核心表。
 *
 * 配合 `SELECT ... FOR UPDATE SKIP LOCKED`（在 repository.claimNextQueuedTask
 * 中）实现无锁竞争的并发安全任务抢占：多个 worker 同时取任务时各自跳过
 * 已被对方锁住的行，互不阻塞。主要任务类型：
 *  - generation.submit：提交生成请求到 provider；
 *  - generation.poll：周期性轮询 provider 任务状态；
 *  - artifact.persist：把产物从临时 URL 拉取并存入自家存储；
 *  - generation.cancel：发起取消。
 *
 * 重试由 attempts/maxAttempts 控制，下次执行时间由 nextRunAt 决定（用于
 * 退避与定时任务）。
 */
export const taskRecords = pgTable('task_records', {
  id: text('id').primaryKey(),
  /** 任务类型：generation.submit | generation.poll | artifact.persist | generation.cancel 等。 */
  type: text('type').notNull(),
  /** 任务域：generation | artifact，用于按域分组/过滤。 */
  domain: text('domain').notNull(),
  /**
   * 任务状态：queued | running | succeeded | failed | cancelled。
   * 注意：重试不落 'retry' 状态——状态机失败重试时任务回到 queued（由 attempts/
   * maxAttempts + nextRunAt 控制退避），'retry' 仅存在于注释里（P2-11，已统一）。
   * 状态机见 task engine 包；repository 是唯一合法的变更入口。
   */
  status: text('status').notNull(),
  /** 优先级（数值越大越优先），同状态下按优先级出队。 */
  priority: integer('priority').notNull(),
  /** 任务输入参数，结构由 type 决定（如 recordId、provider 任务 ID 等）。 */
  inputJson: jsonb('input_json').$type<Record<string, unknown>>().notNull(),
  /** 任务输出结果，成功后回填。 */
  outputJson: jsonb('output_json').$type<Record<string, unknown>>(),
   /** 当前持有该任务的 worker 实例标识，用于抢占与诊断。 */
   lockedBy: text('locked_by'),
   /** 锁过期时间；超时后视为僵尸任务可被重新抢占（见 claim 的清理逻辑）。 */
   lockedUntil: timestamp('locked_until', { withTimezone: true }),
   /** 最近一次执行开始时间；retry 会在下一次 claim 时刷新。 */
   startedAt: timestamp('started_at', { withTimezone: true }),
   /** 最近一次执行结束时间；queued/running 任务为空。 */
   completedAt: timestamp('completed_at', { withTimezone: true }),
  /** 已尝试次数，失败时递增；达到 maxAttempts 后不再重试。 */
  attempts: integer('attempts').notNull(),
  /** 最大尝试次数上限，防止异常任务无限重试。 */
  maxAttempts: integer('max_attempts').notNull(),
  /** 下次可执行时间，支持延迟重试（退避）与定时任务；claim 按此时间过滤。 */
  nextRunAt: timestamp('next_run_at', { withTimezone: true }).notNull(),
  /** 失败时的错误详情（错误码、message、堆栈摘要等）。 */
  errorJson: jsonb('error_json').$type<Record<string, unknown>>(),
  /** 关联的业务记录 ID（通常是 generation_records.id），用于反查关联任务。 */
  recordId: text('record_id'),
  /** 关联用户 ID（冗余自业务记录），便于按用户筛选与权限校验。 */
  userId: text('user_id'),
  /** 分布式链路追踪 ID，串起整条请求生命周期的日志。 */
  traceId: text('trace_id'),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
 }, table => [
   check('task_records_status_check', sql`${table.status} in ('queued', 'running', 'succeeded', 'failed', 'cancelled')`),
   check('task_records_attempts_check', sql`${table.attempts} >= 0`),
   check('task_records_max_attempts_check', sql`${table.maxAttempts} > 0`),
   // 任务队列的核心索引：claim 按 status → nextRunAt → priority → createdAt
  // 顺序筛选并抢占。FOR UPDATE SKIP LOCKED 在此索引上高效工作。
  index('task_records_queue_idx').on(table.status, table.nextRunAt, table.priority, table.createdAt),
  // P1-31：claim 排序子句是 `order by priority desc, created_at asc`（见
  // claimNextQueuedTask）。组合索引在 secondary 列方向上不匹配 → 每次 claim 都堆排序。
  // 补一个列方向匹配的 partial index，让 queued 入队排序直接用索引。
  index('task_records_queue_priority_idx')
    .on(table.priority.desc(), table.createdAt)
    .where(sql`${table.status} = 'queued'`),
  // 僵尸任务清理：按锁持有者 + 锁过期时间扫描需要回收的任务。
  index('task_records_lock_idx').on(table.lockedBy, table.lockedUntil),
  // 业务记录反查：列出某条生成记录的全部关联任务。
  index('task_records_record_idx').on(table.recordId),
  // 管理后台任务中心：keyset (created_at, id) 倒序翻页。
  index('task_records_created_idx').on(table.createdAt, table.id),
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

/**
 * Worker 存活心跳。它与 task lease heartbeat 不同：lease 只证明某个任务仍被
 * 某个 worker 持有，本表用于 API 判断是否至少有一个 worker 仍能消费新任务。
 */
export const workerHeartbeats = pgTable('worker_heartbeats', {
  workerId: text('worker_id').primaryKey(),
  status: text('status').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  stoppedAt: timestamp('stopped_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  index('worker_heartbeats_status_seen_idx').on(table.status, table.lastSeenAt),
])

/**
 * Director projects are the aggregate root for the manual short-drama
 * pipeline. The phase tables below deliberately live outside generation_records:
 * a director project is an editorial workflow, while generation_records are
 * provider executions and their artifacts.
 */
export const directorProjects = pgTable(
	"director_projects",
	{
		id: text("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => users.id, { onDelete: "cascade" }),
		title: text("title").notNull(),
		storyText: text("story_text").notNull(),
		synopsis: text("synopsis"),
		status: text("status").notNull().default("draft"),
		settingsJson: jsonb("settings_json")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		createdBy: text("created_by").notNull().default("system"),
		updatedBy: text("updated_by").notNull().default("system"),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		deletedBy: text("deleted_by"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
	},
	(table) => [
		check(
			"director_projects_status_check",
			sql`${table.status} in ('draft', 'active', 'completed', 'archived')`,
		),
		index("director_projects_user_created_idx").on(
			table.userId,
			table.createdAt,
			table.id,
		),
		index("director_projects_user_updated_idx").on(
			table.userId,
			table.updatedAt,
		),
	],
);

/** Immutable screenplay snapshots. A project keeps its current text for
 * compatibility, while every meaningful screenplay change creates a new
 * version that downstream phase runs can reference explicitly. */
export const directorScriptVersions = pgTable(
	"director_script_versions",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => directorProjects.id, { onDelete: "cascade" }),
		version: integer("version").notNull(),
		storyText: text("story_text").notNull(),
		synopsis: text("synopsis"),
		createdBy: text("created_by").notNull().default("system"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
	},
	(table) => [
		check("director_script_versions_version_check", sql`${table.version} > 0`),
		uniqueIndex("director_script_versions_project_version_idx").on(
			table.projectId,
			table.version,
		),
		index("director_script_versions_project_created_idx").on(
			table.projectId,
			table.createdAt,
		),
	],
);

/** Current UI state for every phase. Keeping this materialized avoids deriving
 * the project navigator from a growing run-history table on every request. */
export const directorPhaseStates = pgTable(
	"director_phase_states",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => directorProjects.id, { onDelete: "cascade" }),
		phase: text("phase").notNull(),
		status: text("status").notNull().default("not_started"),
		version: integer("version").notNull().default(0),
		activeRunId: text("active_run_id"),
		lastErrorJson: jsonb("last_error_json").$type<{
			code: string;
			message: string;
			retriable?: boolean;
		}>(),
		createdBy: text("created_by").notNull().default("system"),
		updatedBy: text("updated_by").notNull().default("system"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
	},
	(table) => [
		check(
			"director_phase_states_status_check",
			sql`${table.status} in ('not_started', 'ready', 'queued', 'running', 'needs_review', 'failed', 'completed', 'cancelled')`,
		),
		check("director_phase_states_version_check", sql`${table.version} >= 0`),
		uniqueIndex("director_phase_states_project_phase_idx").on(
			table.projectId,
			table.phase,
		),
		index("director_phase_states_project_status_idx").on(
			table.projectId,
			table.status,
		),
	],
);

/** Append-only execution history. A rerun creates a new version and never
 * overwrites the previous input/output snapshot. */
export const directorPhaseRuns = pgTable(
	"director_phase_runs",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => directorProjects.id, { onDelete: "cascade" }),
		scriptVersionId: text("script_version_id")
			.notNull()
			.references(() => directorScriptVersions.id),
		phase: text("phase").notNull(),
		status: text("status").notNull().default("pending"),
		version: integer("version").notNull(),
		inputSnapshotJson: jsonb("input_snapshot_json")
			.$type<Record<string, unknown>>()
			.notNull(),
		outputSummaryJson: jsonb("output_summary_json").$type<
			Record<string, unknown>
		>(),
		errorJson: jsonb("error_json").$type<Record<string, unknown>>(),
		staleAt: timestamp("stale_at", { withTimezone: true }),
		staleReason: text("stale_reason"),
		taskId: text("task_id"),
		createdBy: text("created_by").notNull().default("system"),
		updatedBy: text("updated_by").notNull().default("system"),
		startedAt: timestamp("started_at", { withTimezone: true }),
		completedAt: timestamp("completed_at", { withTimezone: true }),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
	},
	(table) => [
		check(
			"director_phase_runs_status_check",
			sql`${table.status} in ('pending', 'running', 'succeeded', 'failed', 'cancelled')`,
		),
		check("director_phase_runs_version_check", sql`${table.version} > 0`),
		uniqueIndex("director_phase_runs_active_idx")
			.on(table.projectId, table.phase)
			.where(sql`${table.status} in ('pending', 'running')`),
		index("director_phase_runs_project_phase_created_idx").on(
			table.projectId,
			table.phase,
			table.createdAt,
		),
	],
);

export const directorCharacters = pgTable(
	"director_characters",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => directorProjects.id, { onDelete: "cascade" }),
		sourceRunId: text("source_run_id").references(() => directorPhaseRuns.id, {
			onDelete: "set null",
		}),
		name: text("name").notNull(),
		role: text("role"),
		description: text("description").notNull(),
		traitsJson: jsonb("traits_json").$type<string[]>().notNull().default([]),
		referenceAssetIdsJson: jsonb("reference_asset_ids_json")
			.$type<string[]>()
			.notNull()
			.default([]),
		metadataJson: jsonb("metadata_json")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		locked: boolean("locked").notNull().default(false),
		version: integer("version").notNull().default(1),
		staleAt: timestamp("stale_at", { withTimezone: true }),
		staleReason: text("stale_reason"),
		createdBy: text("created_by").notNull().default("system"),
		updatedBy: text("updated_by").notNull().default("system"),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		deletedBy: text("deleted_by"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
	},
	(table) => [
		index("director_characters_project_idx").on(
			table.projectId,
			table.createdAt,
		),
		index("director_characters_project_locked_idx").on(
			table.projectId,
			table.locked,
		),
	],
);

export const directorLocations = pgTable(
	"director_locations",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => directorProjects.id, { onDelete: "cascade" }),
		sourceRunId: text("source_run_id").references(() => directorPhaseRuns.id, {
			onDelete: "set null",
		}),
		name: text("name").notNull(),
		description: text("description").notNull(),
		atmosphere: text("atmosphere"),
		referenceAssetIdsJson: jsonb("reference_asset_ids_json")
			.$type<string[]>()
			.notNull()
			.default([]),
		metadataJson: jsonb("metadata_json")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		locked: boolean("locked").notNull().default(false),
		version: integer("version").notNull().default(1),
		staleAt: timestamp("stale_at", { withTimezone: true }),
		staleReason: text("stale_reason"),
		createdBy: text("created_by").notNull().default("system"),
		updatedBy: text("updated_by").notNull().default("system"),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		deletedBy: text("deleted_by"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
	},
	(table) => [
		index("director_locations_project_idx").on(
			table.projectId,
			table.createdAt,
		),
		index("director_locations_project_locked_idx").on(
			table.projectId,
			table.locked,
		),
	],
);

export const directorAssets = pgTable(
	"director_assets",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => directorProjects.id, { onDelete: "cascade" }),
		sourceRunId: text("source_run_id").references(() => directorPhaseRuns.id, {
			onDelete: "set null",
		}),
		kind: text("kind").notNull(),
		ownerType: text("owner_type"),
		ownerId: text("owner_id"),
		assetId: text("asset_id"),
		version: integer("version").notNull().default(1),
		staleAt: timestamp("stale_at", { withTimezone: true }),
		staleReason: text("stale_reason"),
		metadataJson: jsonb("metadata_json")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		createdBy: text("created_by").notNull().default("system"),
		updatedBy: text("updated_by").notNull().default("system"),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		deletedBy: text("deleted_by"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
	},
	(table) => [
		check(
			"director_assets_kind_check",
			sql`${table.kind} in ('uploaded_reference', 'character_reference', 'location_reference', 'storyboard_frame', 'shot_video', 'music', 'final_video')`,
		),
		index("director_assets_project_kind_idx").on(
			table.projectId,
			table.kind,
			table.createdAt,
		),
		index("director_assets_owner_idx").on(
			table.projectId,
			table.ownerType,
			table.ownerId,
		),
	],
);

export const directorShots = pgTable(
	"director_shots",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => directorProjects.id, { onDelete: "cascade" }),
		sourceRunId: text("source_run_id").references(() => directorPhaseRuns.id, {
			onDelete: "set null",
		}),
		sequence: integer("sequence").notNull(),
		sceneNumber: integer("scene_number"),
		slugline: text("slugline"),
		narrative: text("narrative").notNull(),
		cameraJson: jsonb("camera_json")
			.$type<Record<string, unknown>>()
			.notNull()
			.default({}),
		durationSeconds: integer("duration_seconds"),
		environmentPrompt: text("environment_prompt"),
		videoPrompt: text("video_prompt"),
		negativePrompt: text("negative_prompt"),
		dialogueJson: jsonb("dialogue_json").$type<Record<string, unknown>>(),
		referenceAssetIdsJson: jsonb("reference_asset_ids_json")
			.$type<string[]>()
			.notNull()
			.default([]),
		continuityJson: jsonb("continuity_json").$type<Record<string, unknown>>(),
		status: text("status").notNull().default("not_started"),
		activeVideoAssetId: text("active_video_asset_id"),
		version: integer("version").notNull().default(1),
		staleAt: timestamp("stale_at", { withTimezone: true }),
		staleReason: text("stale_reason"),
		errorJson: jsonb("error_json").$type<Record<string, unknown>>(),
		createdBy: text("created_by").notNull().default("system"),
		updatedBy: text("updated_by").notNull().default("system"),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		deletedBy: text("deleted_by"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
	},
	(table) => [
		check(
			"director_shots_status_check",
			sql`${table.status} in ('not_started', 'needs_review', 'ready', 'generating', 'succeeded', 'failed', 'locked')`,
		),
		check("director_shots_sequence_check", sql`${table.sequence} > 0`),
		index("director_shots_project_sequence_idx").on(
			table.projectId,
			table.sequence,
		),
		index("director_shots_project_status_idx").on(
			table.projectId,
			table.status,
		),
	],
);
