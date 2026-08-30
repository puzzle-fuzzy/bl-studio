import type { AuditAction } from '@bailian-studio/db'

export type AuditOutboxStatus = 'pending' | 'processing' | 'succeeded' | 'failed'
export type AuditOutcome = 'succeeded' | 'failed'
export type AuditMetadata = Record<string, string | number | boolean | null>

export interface AuditOutboxEvent {
  id: string
  userId?: string
  action: AuditAction
  outcome: AuditOutcome
  targetType?: string
  targetId?: string
  metadata?: AuditMetadata
  occurredAt: string
  status: AuditOutboxStatus
  attempts: number
  availableAt: string
  claimedBy?: string
  claimedAt?: string
  processedAt?: string
  lastError?: string
  createdAt: string
  updatedAt: string
}

export interface ClaimAuditOutboxInput {
  consumerId: string
  now?: string
  limit?: number
  claimTimeoutMs?: number
}

export interface DeliverAuditOutboxInput {
  eventId: string
  consumerId: string
  now?: string
}

export interface FailAuditOutboxInput {
  eventId: string
  consumerId: string
  now?: string
  maxAttempts?: number
  retryDelayMs?: number
  errorCode?: string
}

export interface DrainAuditOutboxInput extends Omit<ClaimAuditOutboxInput, 'consumerId'> {
  consumerId: string
  maxAttempts?: number
  retryDelayMs?: number
}

export interface DrainAuditOutboxResult {
  claimed: number
  delivered: number
  retried: number
  failed: number
}

export interface ListFailedAuditOutboxInput {
  limit?: number
  before?: string
}

export interface RequeueFailedAuditOutboxInput {
  eventId: string
  operatorId: string
  now?: string
}

export type RequeueFailedAuditOutboxResult =
  | { status: 'requeued'; event: AuditOutboxEvent }
  | { status: 'not_found' }
  | { status: 'not_failed'; event: AuditOutboxEvent }

export interface AuditOutboxRepository {
  listFailed(input?: ListFailedAuditOutboxInput): Promise<AuditOutboxEvent[]>
  requeueFailed(input: RequeueFailedAuditOutboxInput): Promise<RequeueFailedAuditOutboxResult>
  claim(input: ClaimAuditOutboxInput): Promise<AuditOutboxEvent[]>
  deliver(input: DeliverAuditOutboxInput): Promise<boolean>
  fail(input: FailAuditOutboxInput): Promise<'pending' | 'failed' | 'skipped'>
  drain(input: DrainAuditOutboxInput): Promise<DrainAuditOutboxResult>
}
