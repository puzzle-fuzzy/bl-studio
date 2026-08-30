/**
 * API 审计写入 port。
 *
 * 审计是跨模块的横切能力，不应要求路由持有完整的 GenerationRepository。
 * 先在共享包中固定最小契约，底层实现仍可由现有 repository 兼容提供。
 */
import type { AuditLog, RecordAuditEventInput } from "./audit-types";

export interface AuditRepository {
	recordAuditEvent(input: RecordAuditEventInput): Promise<AuditLog>;
}
