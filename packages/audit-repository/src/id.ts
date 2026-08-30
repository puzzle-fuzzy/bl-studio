import { randomUUID } from 'node:crypto'

export function nextMaterializedAuditLogId(): string {
  return `audit_${randomUUID()}`
}
