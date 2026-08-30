import {
	providerRequestAudits,
	type BailianStudioDb,
} from "@bailian-studio/db";
import { eq } from "drizzle-orm";
import { GenerationRepositoryError } from "./errors";
import { nextProviderRequestAuditId } from "./id";
import { toProviderRequestAudit } from "./mappers";
import type { ProviderRequestAuditRepository } from "./provider-request-port";

/**
 * Worker 出站 provider 请求审计的写入实现。
 *
 * 生成详情仍可在 generation repository 内读取 providerRequests 投影；这里仅
 * 拥有 Worker 在外部调用前后需要的 started/finished 写入，避免 Worker 为了
 * 两个审计动作持有完整 GenerationRepository。
 */
export function createProviderRequestAuditRepository(
	db: BailianStudioDb,
): ProviderRequestAuditRepository {
	return {
		/** 先记录 started，再发起 provider 调用，保留崩溃后的外部调用证据。 */
		async startProviderRequest(input) {
			const startedAt = input.startedAt ?? new Date().toISOString();
			const [inserted] = await db
				.insert(providerRequestAudits)
				.values({
					id: nextProviderRequestAuditId(),
					generationId: input.generationId,
					...(input.taskId !== undefined ? { taskId: input.taskId } : {}),
					userId: input.userId,
					provider: input.provider,
					providerModel: input.providerModel,
					operation: input.operation,
					status: "started",
					...(input.idempotencyKey !== undefined
						? { idempotencyKey: input.idempotencyKey }
						: {}),
					...(input.providerTaskId !== undefined
						? { providerTaskId: input.providerTaskId }
						: {}),
					attempt: input.attempt,
					estimatedCostCents: input.estimatedCostCents,
					startedAt: new Date(startedAt),
					createdAt: new Date(startedAt),
					updatedAt: new Date(startedAt),
				})
				.returning();

			if (inserted === undefined) {
				throw new GenerationRepositoryError(
					"DATABASE_ERROR",
					`Failed to record provider request for generation: ${input.generationId}`,
				);
			}

			return toProviderRequestAudit(inserted);
		},

		/** 收尾一条 provider 请求审计；找不到行时返回 undefined。 */
		async finishProviderRequest(input) {
			const completedAt = input.completedAt ?? new Date().toISOString();
			const [updated] = await db
				.update(providerRequestAudits)
				.set({
					status: input.status,
					...(input.providerTaskId !== undefined
						? { providerTaskId: input.providerTaskId }
						: {}),
					...(input.providerRequestId !== undefined
						? { providerRequestId: input.providerRequestId }
						: {}),
					...(input.billedCostCents !== undefined
						? { billedCostCents: input.billedCostCents }
						: {}),
					...(input.error !== undefined
						? { errorJson: { ...input.error } }
						: {}),
					completedAt: new Date(completedAt),
					latencyMs: Math.max(0, Math.round(input.latencyMs)),
					updatedAt: new Date(completedAt),
				})
				.where(eq(providerRequestAudits.id, input.auditId))
				.returning();

			return updated === undefined
				? undefined
				: toProviderRequestAudit(updated);
		},
	};
}
