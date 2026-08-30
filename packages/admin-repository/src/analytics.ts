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

	return {
		countGenerationCallsBetween,
		listModelCosts,
		upsertModelCosts,
		getCostMarginAnalytics,
		getRetentionAnalytics,
		getCanvasCostAnalytics,
	};
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
