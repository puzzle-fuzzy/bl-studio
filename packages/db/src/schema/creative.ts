/**
 * 创意素材域：项目、资产、版本、参考图绑定与生成上下文（含两个上下文关联表）。
 * 版本一旦用于生成即不可变；上下文快照与 generation_records 一对一。
 * 依赖 identity（users）与 generation（generation_records、user_assets）。
 */

import { sql } from 'drizzle-orm'
import { check, foreignKey, index, integer, jsonb, pgTable, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core'
import { users } from './identity'
import { generationRecords, userAssets } from './generation'

/**
 * 创意资产项目 —— 负责给素材提供可检索的工作边界，不代表剧本、分集或剪辑工程。
 *
 * 项目与资产通过 creativeProjectAssets 多对多关联：同一个角色、场景或道具可以
 * 被多个短剧/IP 项目复用；项目只是组织关系，不拥有资产本身。未来剧本和剧本分析
 * 可以挂在项目上，但不改变资产域的复用模型。
 */
export const creativeProjects = pgTable('creative_projects', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('draft'),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  check('creative_projects_status_check', sql`${table.status} in ('draft', 'active', 'archived')`),
  index('creative_projects_user_created_idx').on(table.userId, table.createdAt, table.id),
  index('creative_projects_user_updated_idx').on(table.userId, table.updatedAt),
])

/** 创意资产实体：角色、环境、道具或风格，不是某一张图片。 */
export const creativeAssets = pgTable('creative_assets', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull().default('draft'),
  metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().notNull().default({}),
  /** 仅由 collectAssetFromGeneration 使用；普通资产创建不需要幂等键。 */
  collectionIdempotencyKey: text('collection_idempotency_key'),
  collectionIdempotencyFingerprint: text('collection_idempotency_fingerprint'),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  check('creative_assets_type_check', sql`${table.type} in ('character', 'environment', 'prop', 'style')`),
  check('creative_assets_status_check', sql`${table.status} in ('draft', 'active', 'archived')`),
  index('creative_assets_user_type_created_idx').on(table.userId, table.type, table.createdAt),
  index('creative_assets_user_updated_idx').on(table.userId, table.updatedAt),
  uniqueIndex('creative_assets_user_collection_idempotency_idx')
    .on(table.userId, table.collectionIdempotencyKey)
    .where(sql`${table.collectionIdempotencyKey} is not null`),
])

/**
 * 多资产收录批次。只记录已经整体提交成功的批次；失败事务不会留下批次行，
 * 因而修正请求后仍可复用原 key 重试。
 */
export const creativeAssetCollectionBatches = pgTable('creative_asset_collection_batches', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  idempotencyKey: text('idempotency_key').notNull(),
  requestFingerprint: text('request_fingerprint').notNull(),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  uniqueIndex('creative_asset_collection_batches_user_key_idx').on(table.userId, table.idempotencyKey),
  index('creative_asset_collection_batches_user_created_idx').on(table.userId, table.createdAt),
])

/** 批次项保存返回顺序和资产映射，避免重试时重新解释输入。 */
export const creativeAssetCollectionBatchItems = pgTable('creative_asset_collection_batch_items', {
  id: text('id').primaryKey(),
  batchId: text('batch_id').notNull().references(() => creativeAssetCollectionBatches.id, { onDelete: 'cascade' }),
  itemIndex: integer('item_index').notNull(),
  assetId: text('asset_id').notNull().references(() => creativeAssets.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, table => [
  check('creative_asset_collection_batch_items_index_check', sql`${table.itemIndex} >= 0`),
  uniqueIndex('creative_asset_collection_batch_items_batch_index_idx').on(table.batchId, table.itemIndex),
  uniqueIndex('creative_asset_collection_batch_items_batch_asset_idx').on(table.batchId, table.assetId),
  index('creative_asset_collection_batch_items_asset_idx').on(table.assetId),
])

/**
 * 项目-资产整理关系。关系本身可软删除，便于用户把资产移出项目后再次加入，
 * 也为未来增加项目内排序、置顶或备注保留稳定的扩展点。
 */
export const creativeProjectAssets = pgTable('creative_project_assets', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => creativeProjects.id, { onDelete: 'cascade' }),
  assetId: text('asset_id').notNull().references(() => creativeAssets.id, { onDelete: 'cascade' }),
  sortOrder: integer('sort_order').notNull().default(0),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  check('creative_project_assets_sort_order_check', sql`${table.sortOrder} >= 0`),
  uniqueIndex('creative_project_assets_project_asset_idx')
    .on(table.projectId, table.assetId)
    .where(sql`${table.deletedAt} is null`),
  index('creative_project_assets_project_order_idx').on(table.projectId, table.sortOrder, table.createdAt),
  index('creative_project_assets_asset_idx').on(table.assetId),
])

/**
 * 创意资产版本 —— 版本一旦用于生成就不应被原地改写。
 * approved 状态在未软删除范围内至多存在一个，作为当前 canonical version。
 */
export const creativeAssetVersions = pgTable('creative_asset_versions', {
  id: text('id').primaryKey(),
  assetId: text('asset_id').notNull().references(() => creativeAssets.id, { onDelete: 'cascade' }),
  sourceGenerationId: text('source_generation_id').references(() => generationRecords.id, { onDelete: 'set null' }),
  version: integer('version').notNull(),
  status: text('status').notNull().default('draft'),
  semanticSpecJson: jsonb('semantic_spec_json').$type<Record<string, unknown>>().notNull().default({}),
  generationRecipeJson: jsonb('generation_recipe_json').$type<Record<string, unknown>>().notNull().default({}),
  notes: text('notes'),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  check('creative_asset_versions_version_check', sql`${table.version} > 0`),
  check(
    'creative_asset_versions_status_check',
    sql`${table.status} in ('draft', 'generating', 'candidate', 'approved', 'archived', 'rejected')`,
  ),
  uniqueIndex('creative_asset_versions_asset_version_idx').on(table.assetId, table.version),
  uniqueIndex('creative_asset_versions_asset_approved_idx')
    .on(table.assetId)
    .where(sql`${table.status} = 'approved' and ${table.deletedAt} is null`),
  index('creative_asset_versions_asset_status_idx').on(table.assetId, table.status, table.createdAt),
  index('creative_asset_versions_source_generation_idx').on(table.sourceGenerationId),
])

/**
 * 参考资料绑定 —— 把 user_assets 的物理文件绑定到某个创意资产版本，
 * 并用 role 明确它是正面、侧面、全景、细节还是交互状态，而不是依赖文件名。
 */
export const creativeAssetReferences = pgTable('creative_asset_references', {
  id: text('id').primaryKey(),
  assetVersionId: text('asset_version_id').notNull().references(() => creativeAssetVersions.id, { onDelete: 'cascade' }),
  userAssetId: text('user_asset_id').notNull().references(() => userAssets.id, { onDelete: 'restrict' }),
  role: text('role').notNull(),
  position: integer('position').notNull().default(0),
  metadataJson: jsonb('metadata_json').$type<Record<string, unknown>>().notNull().default({}),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletedBy: text('deleted_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  check(
    'creative_asset_references_role_check',
    sql`${table.role} in ('front', 'three_quarter', 'side', 'back', 'full_body', 'medium', 'face_closeup', 'wide', 'detail', 'isolated', 'interaction', 'mask', 'style_board', 'other')`,
  ),
  check('creative_asset_references_position_check', sql`${table.position} >= 0`),
  uniqueIndex('creative_asset_references_version_role_position_idx')
    .on(table.assetVersionId, table.role, table.position)
    .where(sql`${table.deletedAt} is null`),
  unique('creative_asset_references_version_id_key').on(table.assetVersionId, table.id),
  index('creative_asset_references_user_asset_idx').on(table.userAssetId),
  index('creative_asset_references_version_role_idx').on(table.assetVersionId, table.role),
])

/**
 * 生成上下文 —— generation_records 记录 provider 执行；本表记录这次执行
 * 在创意资产域中的意图、协议版本和快照。二者一对一，保证重跑/审计时不会
 * 只剩下 provider 参数而丢失“引用了哪个角色版本”的语义信息。
 */
export const creativeGenerationContexts = pgTable('creative_generation_contexts', {
  id: text('id').primaryKey(),
  generationId: text('generation_id').notNull().references(() => generationRecords.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  projectId: text('project_id').references(() => creativeProjects.id, { onDelete: 'set null' }),
  protocolVersion: integer('protocol_version').notNull().default(1),
  purpose: text('purpose').notNull(),
  fingerprint: text('fingerprint').notNull(),
  prompt: text('prompt').notNull().default(''),
  negativePrompt: text('negative_prompt'),
  modelId: text('model_id'),
  recipeJson: jsonb('recipe_json').$type<Record<string, unknown>>().notNull().default({}),
  capabilitySnapshotJson: jsonb('capability_snapshot_json').$type<Record<string, unknown>>().notNull().default({}),
  createdBy: text('created_by').notNull().default('system'),
  updatedBy: text('updated_by').notNull().default('system'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
}, table => [
  check('creative_generation_contexts_protocol_version_check', sql`${table.protocolVersion} > 0`),
  check(
    'creative_generation_contexts_purpose_check',
    sql`${table.purpose} in ('asset_reference_sheet', 'asset_variant', 'shot_image', 'shot_video', 'utility')`,
  ),
  uniqueIndex('creative_generation_contexts_generation_idx').on(table.generationId),
  index('creative_generation_contexts_project_created_idx').on(table.projectId, table.createdAt),
  index('creative_generation_contexts_user_created_idx').on(table.userId, table.createdAt),
  index('creative_generation_contexts_purpose_created_idx').on(table.purpose, table.createdAt),
])

/** 一次生成中使用的创意资产版本，role + position 是稳定的引用槽位。 */
export const creativeGenerationContextAssets = pgTable('creative_generation_context_assets', {
  id: text('id').primaryKey(),
  contextId: text('context_id').notNull().references(() => creativeGenerationContexts.id, { onDelete: 'cascade' }),
  assetVersionId: text('asset_version_id').notNull().references(() => creativeAssetVersions.id, { onDelete: 'restrict' }),
  role: text('role').notNull(),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, table => [
  check('creative_generation_context_assets_role_check', sql`${table.role} in ('character', 'environment', 'prop', 'style')`),
  check('creative_generation_context_assets_position_check', sql`${table.position} >= 0`),
  uniqueIndex('creative_generation_context_assets_context_role_position_idx').on(table.contextId, table.role, table.position),
  uniqueIndex('creative_generation_context_assets_context_version_role_idx').on(table.contextId, table.assetVersionId, table.role),
  unique('creative_generation_context_assets_id_version_key').on(table.id, table.assetVersionId),
  index('creative_generation_context_assets_version_idx').on(table.assetVersionId),
])

/**
 * 一次生成从资产版本中选择的具体参考图。单独建关联表避免把 referenceIds
 * 塞进 JSON，确保历史生成不会因为资产库后续增删参考图而改变含义。
 */
export const creativeGenerationContextReferences = pgTable('creative_generation_context_references', {
  id: text('id').primaryKey(),
  contextAssetId: text('context_asset_id').notNull().references(() => creativeGenerationContextAssets.id, { onDelete: 'cascade' }),
  assetVersionId: text('asset_version_id').notNull(),
  referenceId: text('reference_id').notNull().references(() => creativeAssetReferences.id, { onDelete: 'restrict' }),
  position: integer('position').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
}, table => [
  check('creative_generation_context_references_position_check', sql`${table.position} >= 0`),
  uniqueIndex('creative_generation_context_references_asset_position_idx').on(table.contextAssetId, table.position),
  uniqueIndex('creative_generation_context_references_asset_reference_idx').on(table.contextAssetId, table.referenceId),
  index('creative_generation_context_references_reference_idx').on(table.referenceId),
  foreignKey({
    columns: [table.contextAssetId, table.assetVersionId],
    foreignColumns: [creativeGenerationContextAssets.id, creativeGenerationContextAssets.assetVersionId],
    name: 'creative_generation_context_references_context_asset_version_fk',
  }),
  foreignKey({
    columns: [table.assetVersionId, table.referenceId],
    foreignColumns: [creativeAssetReferences.assetVersionId, creativeAssetReferences.id],
    name: 'creative_generation_context_references_version_reference_fk',
  }),
])
