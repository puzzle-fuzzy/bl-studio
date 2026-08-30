import { AUDIT_ACTIONS, type AuditAction } from '@bailian-studio/db'

export { AUDIT_ACTIONS, type AuditAction }

/**
 * 面向用户的安全/审计事件。
 *
 * 这里刻意采用一个小而封闭的动作集合。Provider 请求审计是另一条独立关注点，
 * 因为它描述的是出站 provider 调用，而非用户意图或对产品资源的访问。
 *
 * P1-J：AUDIT_ACTIONS 唯一事实源已移至 @bailian-studio/db（audit-actions.ts）。
 * 此处仅为兼容性 re-export，消费方应逐步改为直接从 db 导入。
 */




export type AuditOutcome = 'succeeded' | 'failed'

export type AuditEventMetadataValue = string | number | boolean | null

export type AuditEventMetadata = Readonly<Record<string, AuditEventMetadataValue>>

export interface RecordAuditEventInput {
  userId?: string
  action: AuditAction
  outcome: AuditOutcome
  targetType?: string
  targetId?: string
  requestId?: string
  traceId?: string
  method?: string
  path?: string
  metadata?: AuditEventMetadata
  occurredAt?: string
}

export interface AuditLog {
  id: string
  userId?: string
  action: AuditAction
  outcome: AuditOutcome
  targetType?: string
  targetId?: string
  requestId?: string
  traceId?: string
  method?: string
  path?: string
  metadata?: AuditEventMetadata
  occurredAt: string
  createdAt: string
  updatedAt: string
}
