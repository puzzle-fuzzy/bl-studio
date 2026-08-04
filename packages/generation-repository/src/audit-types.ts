/**
 * User-facing security/audit events.
 *
 * This is deliberately a small, closed action set. Provider request audits
 * remain a separate concern because they describe outbound provider calls,
 * not user intent or access to product resources.
 */
export type AuditAction =
  | 'auth.register'
  | 'auth.verify-email'
  | 'auth.resend-verification'
  | 'auth.login'
  | 'auth.forgot-password'
  | 'auth.reset-password'
  | 'auth.change-password'
  | 'auth.logout'
  | 'auth.logout-all'
  | 'generation.create'
  | 'generation.cancel'
  | 'generation.retry'
  | 'generation.hide'
  | 'generation.delete'
  | 'generation.restore'
  | 'artifact.read'
  | 'asset.upload'
  | 'asset.import'
  | 'asset.delete'
  | 'share.create'
  | 'share.revoke'
  | 'points.grant'
  | 'points.adjustment'

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
