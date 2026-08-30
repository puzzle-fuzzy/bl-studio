/**
 * 管理分析持久化接缝：模型成本配置、成本毛利聚合和留存漏斗。
 *
 * 这是运营读模型，不参与生成提交或任务状态迁移；分析 SQL 与 admin gallery
 * 和 admin task 查询分开，避免一个 repository 同时拥有三种治理语义。
 */

import { CanvasExecutionTaskInputSchema } from "@bailian-studio/canvas-contracts";
import type { BailianStudioDbTransaction } from "@bailian-studio/db";
import {
	type BailianStudioDb,
	generationRecords,
	modelCosts,
	taskRecords,
} from "@bailian-studio/db";
import {
	and,
	asc,
	desc,
	eq,
	gte,
	isNull,
	lt,
	type SQL,
	sql,
} from "drizzle-orm";
import type {
	CostMarginRow,
	CanvasCostAnalytics,
	CanvasOperationsAnalytics,
	GenerationCallStats,
	ModelCost,
	RetentionAnalytics,
} from "./types";

export interface AnalyticsRepository {
	countGenerationCallsBetween(
		since: string,
		until: string,
	): Promise<GenerationCallStats>;
	listModelCosts(): Promise<ModelCost[]>;
	upsertModelCosts(
		entries: Array<{ modelId: string; unitCostCents: number }>,
	): Promise<void>;
	getCostMarginAnalytics(input: {
		from: string;
		to: string;
	}): Promise<CostMarginRow[]>;
	getRetentionAnalytics(input: { since: string }): Promise<RetentionAnalytics>;
	getCanvasCostAnalytics(input: {
		from: string;
		to: string;
	}): Promise<CanvasCostAnalytics>;
	getCanvasOperationsAnalytics(input: {
		from: string;
		to: string;
	}): Promise<CanvasOperationsAnalytics>;
}

export function createAnalyticsRepository(
	db: BailianStudioDb,
): AnalyticsRepository {
	async function countGenerationCallsBetween(
		since: string,
		until: string,
	): Promise<GenerationCallStats> {
		return readGenerationCallStats(db, new Date(since), new Date(until));
	}

	async function listModelCosts(): Promise<ModelCost[]> {
		const rows = await db
			.select()
			.from(modelCosts)
			.orderBy(asc(modelCosts.modelId));
		return rows.map((row) => ({
			modelId: row.modelId,
			unitCostCents: row.unitCostCents,
			currency: row.currency,
			updatedAt: row.updatedAt.toISOString(),
		}));
	}

	async function upsertModelCosts(
		entries: Array<{ modelId: string; unitCostCents: number }>,
	): Promise<void> {
		if (entries.length === 0) return;
		const now = new Date();
		await db.transaction(async (tx) => {
			for (const entry of entries) {
				await tx
					.insert(modelCosts)
					.values({
						modelId: entry.modelId,
						unitCostCents: entry.unitCostCents,
						updatedAt: now,
						createdAt: now,
					})
					.onConflictDoUpdate({
						target: modelCosts.modelId,
						set: {
							unitCostCents: entry.unitCostCents,
							updatedAt: now,
							updatedBy: "admin.model-costs",
						},
					});
			}
		});
	}

	async function getCostMarginAnalytics(input: {
		from: string;
		to: string;
	}): Promise<CostMarginRow[]> {
		const rows = await db
			.select({
				modelId: generationRecords.modelId,
				calls: sql<number>`count(*)::int`,
				revenueCents: sql<number>`coalesce(sum(coalesce(${generationRecords.costFinal}, ${generationRecords.costEstimate})), 0)::int`,
			})
			.from(generationRecords)
			.where(
				and(
					eq(generationRecords.status, "succeeded"),
					gte(generationRecords.createdAt, new Date(input.from)),
					lt(generationRecords.createdAt, new Date(input.to)),
					isNull(generationRecords.deletedAt),
				),
			)
			.groupBy(generationRecords.modelId)
			.orderBy(
				desc(
					sql`coalesce(sum(coalesce(${generationRecords.costFinal}, ${generationRecords.costEstimate})), 0)`,
				),
			);

		const costRows = await db.select().from(modelCosts);
		const unitCostByModel = new Map(
			costRows.map((row) => [row.modelId, row.unitCostCents]),
		);
		return rows.map((row) => {
			const unitCostCents = unitCostByModel.get(row.modelId) ?? 0;
			const costCents = row.calls * unitCostCents;
			return {
				modelId: row.modelId,
				calls: row.calls,
				revenueCents: row.revenueCents,
				unitCostCents,
				costCents,
				marginCents: row.revenueCents - costCents,
			};
		});
	}

	async function getRetentionAnalytics(input: {
		since: string;
	}): Promise<RetentionAnalytics> {
		const since = new Date(input.since);
		const [firstGeneration, firstSuccess, activeTwoDays] = await Promise.all([
			countDistinctUsersWithGeneration(db, since, "any"),
			countDistinctUsersWithGeneration(db, since, "succeeded"),
			countDistinctUsersActiveTwoDays(db, since),
		]);
		return { firstGeneration, firstSuccess, activeTwoDays };
	}

	async function getCanvasCostAnalytics(input: {
		from: string;
		to: string;
	}): Promise<CanvasCostAnalytics> {
		const taskWindow = and(
			eq(taskRecords.type, "canvas.execute"),
			eq(taskRecords.domain, "canvas"),
			gte(taskRecords.createdAt, new Date(input.from)),
			lt(taskRecords.createdAt, new Date(input.to)),
			isNull(taskRecords.deletedAt),
		);
		const generationJoin = and(
			eq(taskRecords.traceId, generationRecords.traceId),
			isNull(generationRecords.deletedAt),
		);
		const [summaryRows, modelRows, taskRows] = await Promise.all([
			db
				.select({
					executions: sql<number>`count(distinct ${taskRecords.id})::int`,
					generationCalls: sql<number>`count(${generationRecords.id})::int`,
					accountedCents: sql<number>`coalesce(sum(coalesce(${generationRecords.costFinal}, ${generationRecords.costEstimate})), 0)::int`,
				})
				.from(taskRecords)
				.leftJoin(generationRecords, generationJoin)
				.where(taskWindow),
			db
				.select({
					modelId: generationRecords.modelId,
					calls: sql<number>`count(*)::int`,
					accountedCents: sql<number>`coalesce(sum(coalesce(${generationRecords.costFinal}, ${generationRecords.costEstimate})), 0)::int`,
				})
				.from(taskRecords)
				.innerJoin(generationRecords, generationJoin)
				.where(taskWindow)
				.groupBy(generationRecords.modelId)
				.orderBy(desc(sql`coalesce(sum(coalesce(${generationRecords.costFinal}, ${generationRecords.costEstimate})), 0)`)),
			db
				.select({ input: taskRecords.inputJson })
				.from(taskRecords)
				.where(taskWindow),
		]);
		const cacheHitNodes = taskRows.reduce((total, row) => {
			const parsed = CanvasExecutionTaskInputSchema.safeParse(row.input);
			if (!parsed.success) return total;
			return total + Object.values(parsed.data.nodeRuns).filter(run => run.cacheHit === true).length;
		}, 0);
		const summary = summaryRows[0];
		return {
			executions: summary?.executions ?? 0,
			generationCalls: summary?.generationCalls ?? 0,
			cacheHitNodes,
			accountedCents: summary?.accountedCents ?? 0,
			byModel: modelRows.map(row => ({
				modelId: row.modelId,
				calls: row.calls,
				accountedCents: row.accountedCents,
			})),
		};
	}

	async function getCanvasOperationsAnalytics(input: {
		from: string;
		to: string;
	}): Promise<CanvasOperationsAnalytics> {
		const rows = await db
			.select({
				status: taskRecords.status,
				startedAt: taskRecords.startedAt,
				completedAt: taskRecords.completedAt,
				errorJson: taskRecords.errorJson,
				input: taskRecords.inputJson,
			})
			.from(taskRecords)
			.where(
				and(
					eq(taskRecords.type, "canvas.execute"),
					eq(taskRecords.domain, "canvas"),
					gte(taskRecords.createdAt, new Date(input.from)),
					lt(taskRecords.createdAt, new Date(input.to)),
					isNull(taskRecords.deletedAt),
				),
			);
		const statusCounts = new Map(
			CANVAS_TASK_STATUSES.map((status) => [status, 0]),
		);
		const durations: number[] = [];
		const failureReasons = new Map<string, number>();
		const nodeFailureReasons = new Map<string, number>();

		for (const row of rows) {
			const status = row.status as CanvasOperationsAnalytics["byStatus"][number]["status"];
			if (statusCounts.has(status as (typeof CANVAS_TASK_STATUSES)[number])) {
				const knownStatus = status as (typeof CANVAS_TASK_STATUSES)[number];
				statusCounts.set(knownStatus, (statusCounts.get(knownStatus) ?? 0) + 1);
			}
			if (row.startedAt !== null && row.completedAt !== null) {
				durations.push(
					Math.max(0, row.completedAt.getTime() - row.startedAt.getTime()),
				);
			}
			if (status === "failed") {
				incrementReason(failureReasons, errorReason(row.errorJson));
			}

			const parsed = CanvasExecutionTaskInputSchema.safeParse(row.input);
			if (!parsed.success) continue;
			for (const run of Object.values(parsed.data.nodeRuns)) {
				if (run.status === "failed") {
					incrementReason(nodeFailureReasons, run.errorCode ?? "UNKNOWN");
				}
			}
		}

		durations.sort((left, right) => left - right);
		const succeededExecutions = statusCounts.get("succeeded") ?? 0;
		const terminalExecutions =
			succeededExecutions +
			(statusCounts.get("failed") ?? 0) +
			(statusCounts.get("cancelled") ?? 0);
		return {
			executions: rows.length,
			byStatus: CANVAS_TASK_STATUSES.map((status) => ({
				status,
				count: statusCounts.get(status) ?? 0,
			})),
			terminalExecutions,
			succeededExecutions,
			successRate:
				terminalExecutions === 0
					? 0
					: succeededExecutions / terminalExecutions,
			averageDurationMs:
				durations.length === 0
					? null
					: Math.round(
							durations.reduce((sum, duration) => sum + duration, 0) /
								durations.length,
						),
			p95DurationMs:
				durations.length === 0
					? null
					: durations[
							Math.min(
								durations.length - 1,
								Math.ceil(durations.length * 0.95) - 1,
							)
						] ?? null,
			failureReasons: sortReasons(failureReasons),
			nodeFailureReasons: sortReasons(nodeFailureReasons),
		};
	}

	return {
		countGenerationCallsBetween,
		listModelCosts,
		upsertModelCosts,
		getCostMarginAnalytics,
		getRetentionAnalytics,
		getCanvasCostAnalytics,
		getCanvasOperationsAnalytics,
	};
}

const CANVAS_TASK_STATUSES = [
	"queued",
	"running",
	"succeeded",
	"failed",
	"cancelled",
] as const;

function incrementReason(map: Map<string, number>, reason: string): void {
	map.set(reason, (map.get(reason) ?? 0) + 1);
}

function errorReason(error: Record<string, unknown> | null): string {
	if (typeof error?.code === "string" && error.code.length > 0) {
		return error.code;
	}
	if (typeof error?.category === "string" && error.category.length > 0) {
		return error.category;
	}
	return "UNKNOWN";
}

function sortReasons(map: Map<string, number>): Array<{ reason: string; count: number }> {
	return [...map.entries()]
		.sort(([leftReason, leftCount], [rightReason, rightCount]) =>
			rightCount - leftCount || leftReason.localeCompare(rightReason),
		)
		.map(([reason, count]) => ({ reason, count }));
}

async function readGenerationCallStats(
	db: BailianStudioDb | BailianStudioDbTransaction,
	since: Date,
	until: Date,
): Promise<GenerationCallStats> {
	const where = and(
		gte(generationRecords.createdAt, since),
		lt(generationRecords.createdAt, until),
	);
	const hourExpr = sql`extract(hour from ${generationRecords.createdAt})::int`;
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
	]);

	return {
		total: totalRow?.count ?? 0,
		byModel,
		byHour: byHour.map((row) => ({
			hour: row.hour,
			modelId: row.modelId,
			count: row.count,
		})),
	};
}

async function countDistinctUsersWithGeneration(
	db: BailianStudioDb,
	since: Date,
	status: "any" | "succeeded",
): Promise<number> {
	const conditions: SQL[] = [
		gte(generationRecords.createdAt, since),
		isNull(generationRecords.deletedAt),
	];
	if (status === "succeeded") {
		conditions.push(eq(generationRecords.status, "succeeded"));
	}
	const [row] = await db
		.select({
			count: sql<number>`count(distinct ${generationRecords.userId})::int`,
		})
		.from(generationRecords)
		.where(and(...conditions));
	return row?.count ?? 0;
}

async function countDistinctUsersActiveTwoDays(
	db: BailianStudioDb,
	since: Date,
): Promise<number> {
	const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(
		db
			.select({ userId: generationRecords.userId })
			.from(generationRecords)
			.where(
				and(
					gte(generationRecords.createdAt, since),
					isNull(generationRecords.deletedAt),
				),
			)
			.groupBy(generationRecords.userId)
			.having(sql`count(distinct ${generationRecords.createdAt}::date) >= 2`)
			.as("active_users"),
	);
	return row?.count ?? 0;
}
