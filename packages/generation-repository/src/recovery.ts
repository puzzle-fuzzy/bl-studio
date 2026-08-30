/**
 * Generation 故障恢复读模型。
 *
 * 该查询联合 generation 与 task 数据，只服务于 Worker 的陈旧状态清扫；
 * 它不属于生成核心状态迁移，也不承担任务生命周期写入。
 */
import {
	generationRecords,
	type BailianStudioDb,
} from "@bailian-studio/db";
import type { TaskQueueReadStore } from "@bailian-studio/task-repository";
import { and, asc, inArray, lt } from "drizzle-orm";
import { toGenerationRecord } from "./mappers";
import type { GenerationRecord } from "./types";

/** 清扫器输入：找「任务已终态失败/取消、记录仍卡在 submitting/processing」的 generation。 */
export interface ListStuckGenerationRecordsInput {
	/** 判断「卡住」的时长下限，默认 10 分钟。 */
	staleAfterMs?: number;
	now?: string;
	limit?: number;
}

export interface GenerationRecoveryRepository {
	listStuckGenerationRecords(
		input?: ListStuckGenerationRecordsInput,
	): Promise<GenerationRecord[]>;
}

export function createGenerationRecoveryRepository(
	db: BailianStudioDb,
	taskQueueReadStore: TaskQueueReadStore,
): GenerationRecoveryRepository {
	return {
		async listStuckGenerationRecords(input) {
			const staleAfterMs = input?.staleAfterMs ?? 10 * 60 * 1000;
			const cutoff = new Date(
				Date.parse(input?.now ?? new Date().toISOString()) - staleAfterMs,
			).toISOString();
			const limit = Math.max(0, Math.trunc(input?.limit ?? 100));
			if (limit === 0) return [];
			const candidates = await db
				.select()
				.from(generationRecords)
				.where(
					and(
						inArray(generationRecords.status, ["submitting", "processing"]),
						lt(generationRecords.updatedAt, new Date(cutoff)),
					),
				)
				.orderBy(asc(generationRecords.updatedAt))
			const terminalRecordIds = new Set(
				await taskQueueReadStore.listRecordIdsWithTaskStatuses(db, {
					recordIds: candidates.map((row) => row.id),
					statuses: ["failed", "cancelled"],
				}),
			);
			return candidates
				.filter((row) => terminalRecordIds.has(row.id))
				.slice(0, limit)
				.map((row) => toGenerationRecord(row));
		},
	};
}
