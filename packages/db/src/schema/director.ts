/**
 * 短剧导演域：项目聚合根、剧本版本、阶段状态/运行史、剧本对话、角色、场景、
 * 资产绑定与分镜。视频生成 ID 等跨域引用是普通 text 列（无外键），保持
 * 编辑工作流与 provider 执行解耦。仅依赖 identity（users）。
 */

import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import { users } from './identity'

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

/** Persistent conversation turns for the screenplay editor. User and assistant
 * messages are append-only so the editor can reconstruct the creative intent
 * behind every screenplay version without coupling chat history to a phase run. */
export const directorScriptMessages = pgTable(
	"director_script_messages",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => directorProjects.id, { onDelete: "cascade" }),
		runId: text("run_id").references(() => directorPhaseRuns.id, {
			onDelete: "set null",
		}),
		scriptVersionId: text("script_version_id").references(() => directorScriptVersions.id, {
			onDelete: "set null",
		}),
		scriptVersion: integer("script_version"),
		role: text("role").notNull(),
		content: text("content").notNull(),
		createdBy: text("created_by").notNull().default("system"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
	},
	(table) => [
		check("director_script_messages_role_check", sql`${table.role} in ('user', 'assistant')`),
		index("director_script_messages_project_created_idx").on(
			table.projectId,
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
		videoGenerationId: text("video_generation_id"),
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

/**
 * 实体候选 —— 从剧本中 AI 提取的角色/场景/道具候选，经人工审核后确认。
 * "审核优先"模式（参考 bailian-studio-reset 语义分析）：
 *  - kind：character | scene | prop（实体类型）
 *  - status：provisional（AI 提取待审）→ accepted | rejected（人工决定）
 *  - mentionsJson：[{text, start, end}] 逐字引用 + 服务端计算的 UTF-16 偏移；
 *    服务端提取阶段从不信任 LLM 给的偏移，只存自己 indexOf 的结果。
 *  - accepted 后由 repository 原子提升为角色/场景导演实体，供后续阶段消费；
 *    prop 暂留在候选层，待道具实体模型落地后再提升。
 */
export const directorEntityCandidates = pgTable(
	"director_entity_candidates",
	{
		id: text("id").primaryKey(),
		projectId: text("project_id")
			.notNull()
			.references(() => directorProjects.id, { onDelete: "cascade" }),
		sourceRunId: text("source_run_id").references(() => directorPhaseRuns.id, {
			onDelete: "set null",
		}),
		kind: text("kind").notNull(),
		name: text("name").notNull(),
		description: text("description").notNull().default(""),
		traitsJson: jsonb("traits_json")
			.$type<string[]>()
			.notNull()
			.default([]),
		status: text("status").notNull().default("provisional"),
		mentionsJson: jsonb("mentions_json")
			.$type<Array<{ text: string; start: number; end: number }>>()
			.notNull()
			.default([]),
		reviewedBy: text("reviewed_by"),
		reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
		createdBy: text("created_by").notNull().default("system"),
		updatedBy: text("updated_by").notNull().default("system"),
		deletedAt: timestamp("deleted_at", { withTimezone: true }),
		deletedBy: text("deleted_by"),
		createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
		updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
	},
	(table) => [
		check(
			"director_entity_candidates_kind_check",
			sql`${table.kind} in ('character', 'scene', 'prop')`,
		),
		check(
			"director_entity_candidates_status_check",
			sql`${table.status} in ('provisional', 'accepted', 'rejected')`,
		),
		index("director_entity_candidates_project_kind_idx").on(
			table.projectId,
			table.kind,
			table.createdAt,
		),
		index("director_entity_candidates_project_status_idx").on(
			table.projectId,
			table.status,
		),
	],
);
