/**
 * 身份与认证域：用户、一次性动作令牌、可撤销会话、产品侧安全审计。
 * 本文件是 schema 依赖图的根——不依赖其他域文件。
 */

import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

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
 * 产品审计事件 outbox。
 *
 * 业务事务先把不可变的、已脱敏的审计事件写进这里，提交后再由独立消费者
 * 投递到 audit_logs。这样业务成功与审计事件不会因为 API 进程在提交后崩溃
 * 而分离；status/attempts/availableAt 为后续重试和死信处理保留明确落点。
 * outboxEventId 由消费端写入 audit_logs，作为 at-least-once 投递的幂等键。
 */
export const auditEventOutbox = pgTable('audit_event_outbox', {
  id: text('id').primaryKey(),
  userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
  action: text('action').notNull(),
  outcome: text('outcome').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  metadataJson: jsonb('metadata_json').$type<Record<string, string | number | boolean | null>>(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
  status: text('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  availableAt: timestamp('available_at', { withTimezone: true }).notNull(),
  claimedBy: text('claimed_by'),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  check('audit_event_outbox_outcome_check', sql`${table.outcome} in ('succeeded', 'failed')`),
  check('audit_event_outbox_status_check', sql`${table.status} in ('pending', 'processing', 'succeeded', 'failed')`),
  check('audit_event_outbox_attempts_check', sql`${table.attempts} >= 0`),
  index('audit_event_outbox_status_available_idx').on(table.status, table.availableAt, table.createdAt),
  index('audit_event_outbox_target_idx').on(table.targetType, table.targetId, table.createdAt),
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
  /** 由 outbox 消费端写入；允许 NULL 以兼容直接记录的历史/失败审计。 */
  outboxEventId: text('outbox_event_id'),
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
  check('audit_logs_action_check', sql`${table.action} in ('auth.register', 'auth.verify-email', 'auth.resend-verification', 'auth.login', 'auth.github', 'auth.forgot-password', 'auth.reset-password', 'auth.change-password', 'auth.logout', 'auth.logout-all', 'auth.profile.update', 'auth.avatar.update', 'auth.avatar.remove', 'generation.create', 'generation.cancel', 'generation.retry', 'generation.hide', 'generation.delete', 'generation.restore', 'artifact.read', 'asset.upload', 'asset.import', 'asset.delete', 'share.create', 'share.revoke', 'points.grant', 'points.adjustment', 'admin.user.create', 'admin.user.update', 'admin.user.delete', 'admin.user.ban', 'admin.user.unban', 'admin.audit.outbox.requeue', 'gallery.like', 'gallery.favorite', 'gallery.visibility-change', 'admin.gallery.hide', 'admin.gallery.unhide', 'feedback.submit', 'feedback.update', 'prompt-library.create', 'prompt-library.delete', 'content.report.submit', 'admin.content-report.update')`),
  check('audit_logs_outcome_check', sql`${table.outcome} in ('succeeded', 'failed')`),
  index('audit_logs_user_occurred_idx').on(table.userId, table.occurredAt),
  index('audit_logs_action_occurred_idx').on(table.action, table.occurredAt),
  index('audit_logs_target_occurred_idx').on(table.targetType, table.targetId, table.occurredAt),
  index('audit_logs_request_idx').on(table.requestId),
  uniqueIndex('audit_logs_outbox_event_idx').on(table.outboxEventId).where(sql`${table.outboxEventId} is not null`),
])
