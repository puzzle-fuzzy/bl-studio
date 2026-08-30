/**
 * 用户生成用量读模型。
 *
 * 用量读取与 generation 生命周期写入分开声明，避免 API 的报表查询继续
 * 依赖完整 GenerationRepository；写入结算仍由 generation repository 负责。
 */
import {
	type BailianStudioDb,
	type BailianStudioDbTransaction,
	usageRecords,
} from "@bailian-studio/db";
import { and, eq, gte, lt, sql } from "drizzle-orm";

export interface DailyGenerationUsage {
	/** 生成尝试次数，包含 failed 与 cancelled 的记录。 */
	attemptCount: number;
	/** provider 侧成功的生成数（usage 状态为 settled）。 */
	successfulCount: number;
	/** 已废弃的 attemptCount 传输别名。 */
	generationCount: number;
	estimatedCents: number;
	chargedCents: number;
	providerCostCents: number;
}

export interface DailyGenerationUsageInput {
	userId: string;
	since: string;
	until: string;
}

/** 用于每日限额与月度报表的时间窗口聚合。 */
export type GenerationUsage = DailyGenerationUsage;
export type GenerationUsageInput = DailyGenerationUsageInput;

export interface UsageRepository {
	getGenerationUsage(input: GenerationUsageInput): Promise<GenerationUsage>;
}

export async function readGenerationUsage(
	db: BailianStudioDb | BailianStudioDbTransaction,
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
		.where(
			and(
				eq(usageRecords.userId, input.userId),
				gte(usageRecords.createdAt, new Date(input.since)),
				lt(usageRecords.createdAt, new Date(input.until)),
			),
		);

	return {
		attemptCount: usage?.attemptCount ?? 0,
		successfulCount: usage?.successfulCount ?? 0,
		generationCount: usage?.attemptCount ?? 0,
		estimatedCents: usage?.estimatedCents ?? 0,
		chargedCents: usage?.chargedCents ?? 0,
		providerCostCents: usage?.providerCostCents ?? 0,
	};
}

export function createUsageRepository(db: BailianStudioDb): UsageRepository {
	return {
		getGenerationUsage: (input) => readGenerationUsage(db, input),
	};
}
