/**
 * 面向用户的安全/审计事件。
 *
 * 这里刻意采用一个小而封闭的动作集合。Provider 请求审计是另一条独立关注点，
 * 因为它描述的是出站 provider 调用，而非用户意图或对产品资源的访问。
 */
export type AuditAction =
  | 'auth.register'
  | 'auth.verify-email'
  | 'auth.resend-verification'
  | 'auth.login'
  | 'auth.github'
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
  | 'admin.user.create'
  | 'admin.user.update'
  | 'admin.user.delete'

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
