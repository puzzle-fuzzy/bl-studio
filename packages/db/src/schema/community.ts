/**
 * 社区域：点赞、收藏、提示词库、用户反馈、内容举报、社交通知。
 * 依赖 identity（users）与 generation（generation_records）。
 */

import { sql } from 'drizzle-orm'
import { check, index, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { users } from './identity'
import { generationRecords } from './generation'

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
