import { auditLogs, type BailianStudioDb } from "@bailian-studio/db";
import type { AuditRepository } from "./audit-port";
import { GenerationRepositoryError } from "./errors";
import { nextAuditLogId } from "./id";
import { toAuditLog } from "./mappers";

/** API 产品审计事件的独立写入实现。 */
export function createAuditRepository(db: BailianStudioDb): AuditRepository {
	return {
		/**
		 * 记录一条产品侧安全审计事件。
		 *
		 * metadata 已由 API 层完成 primitive-only 脱敏/限长；这里仍复制一份，
		 * 避免调用方后续修改同一个对象时影响 Drizzle 的序列化结果。
		 */
		async recordAuditEvent(input) {
			const occurredAt = input.occurredAt ?? new Date().toISOString();
			const [inserted] = await db
				.insert(auditLogs)
				.values({
					id: nextAuditLogId(),
					...(input.userId !== undefined ? { userId: input.userId } : {}),
					action: input.action,
					outcome: input.outcome,
					...(input.targetType !== undefined
						? { targetType: input.targetType }
						: {}),
					...(input.targetId !== undefined ? { targetId: input.targetId } : {}),
					...(input.requestId !== undefined
						? { requestId: input.requestId }
						: {}),
					...(input.traceId !== undefined ? { traceId: input.traceId } : {}),
					...(input.method !== undefined ? { method: input.method } : {}),
					...(input.path !== undefined ? { path: input.path } : {}),
					...(input.metadata !== undefined
						? { metadataJson: { ...input.metadata } }
						: {}),
					occurredAt: new Date(occurredAt),
					createdAt: new Date(occurredAt),
					updatedAt: new Date(occurredAt),
				})
				.returning();

			if (inserted === undefined) {
				throw new GenerationRepositoryError(
					"DATABASE_ERROR",
					`Failed to record audit event: ${input.action}`,
				);
			}

			return toAuditLog(inserted);
		},
	};
}
