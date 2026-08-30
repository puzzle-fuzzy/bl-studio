/**
 * Generation 详情页的安全诊断投影。
 *
 * 诊断同时读取 generation、task 和 provider request 三类记录，但只返回
 * 排障所需的脱敏摘要；它不参与 generation 状态迁移，也不属于 Worker 的
 * 任务生命周期端口，因此从核心 GenerationRepository 单独拆出。
 */
import {
	generationRecords,
	providerRequestAudits,
	type BailianStudioDb,
} from "@bailian-studio/db";
import type { TaskQueueReadStore } from "@bailian-studio/task-repository";
import { asc, eq } from "drizzle-orm";
import { toProviderRequestAudit } from "./mappers";
import type { GenerationDiagnostics, TaskDiagnostics } from "./types";

export interface GenerationDiagnosticsRepository {
	getGenerationDiagnostics(
		id: string,
	): Promise<GenerationDiagnostics | undefined>;
}

export function createGenerationDiagnosticsRepository(
	db: BailianStudioDb,
	taskQueueReadStore: TaskQueueReadStore,
): GenerationDiagnosticsRepository {
	return {
		async getGenerationDiagnostics(id) {
			const [record] = await db
				.select()
				.from(generationRecords)
				.where(eq(generationRecords.id, id))
				.limit(1);

			if (record === undefined) return undefined;

			const [taskRows, auditRows] = await Promise.all([
				taskQueueReadStore.listTasksForRecord(db, { recordId: id }),
				db
					.select()
					.from(providerRequestAudits)
					.where(eq(providerRequestAudits.generationId, id))
					.orderBy(
						asc(providerRequestAudits.startedAt),
						asc(providerRequestAudits.id),
					),
			]);

			const tasks: TaskDiagnostics[] = taskRows.map((task) => {
				const error =
					task.errorJson === undefined
						? undefined
						: {
								category: task.errorJson.category,
								message: task.errorJson.message,
								retriable: task.errorJson.retriable,
								...(task.errorJson.code !== undefined
									? { code: task.errorJson.code }
									: {}),
							};
				const durationMs =
					task.startedAt !== undefined && task.completedAt !== undefined
						? Math.max(
								0,
								Date.parse(task.completedAt) - Date.parse(task.startedAt),
							)
						: undefined;

				return {
					id: task.id,
					type: task.type,
					status: task.status,
					attempts: task.attempts,
					maxAttempts: task.maxAttempts,
					createdAt: task.createdAt,
					...(task.startedAt !== undefined
						? { startedAt: task.startedAt }
						: {}),
					...(task.completedAt !== undefined
						? { completedAt: task.completedAt }
						: {}),
					updatedAt: task.updatedAt,
					...(error !== undefined ? { error } : {}),
					...(durationMs !== undefined ? { durationMs } : {}),
				};
			});

			const generationDurationMs =
				record.status === "succeeded" ||
				record.status === "failed" ||
				record.status === "cancelled"
					? Math.max(0, record.updatedAt.getTime() - record.createdAt.getTime())
					: undefined;

			return {
				generationId: record.id,
				...(record.traceId !== null ? { traceId: record.traceId } : {}),
				...(generationDurationMs !== undefined ? { generationDurationMs } : {}),
				tasks,
				providerRequests: auditRows.map(toProviderRequestAudit),
			};
		},
	};
}
