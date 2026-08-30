import {
  auditEventOutbox,
  auditLogs,
  type BailianStudioDb,
  type BailianStudioDbTransaction,
} from '@bailian-studio/db'
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { nextMaterializedAuditLogId } from './id'
import type {
  AuditOutboxEvent,
  AuditOutboxRepository,
  ClaimAuditOutboxInput,
  DeliverAuditOutboxInput,
  DrainAuditOutboxInput,
  DrainAuditOutboxResult,
  FailAuditOutboxInput,
  ListFailedAuditOutboxInput,
  RequeueFailedAuditOutboxInput,
} from './types'

const DEFAULT_CLAIM_LIMIT = 25
const MAX_CLAIM_LIMIT = 100
const DEFAULT_CLAIM_TIMEOUT_MS = 60_000
const DEFAULT_MAX_ATTEMPTS = 5
const DEFAULT_RETRY_DELAY_MS = 5_000
const MAX_RETRY_DELAY_MS = 60 * 60 * 1_000
const MAX_ERROR_CODE_LENGTH = 128

function nowDate(value?: string): Date {
  const date = value === undefined ? new Date() : new Date(value)
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid audit outbox timestamp')
  return date
}

function positiveInteger(value: number | undefined, fallback: number, max?: number): number {
  if (value === undefined) return fallback
  if (!Number.isSafeInteger(value) || value < 1 || (max !== undefined && value > max)) {
    throw new Error(`Expected a positive integer${max === undefined ? '' : ` <= ${max}`}`)
  }
  return value
}

function toEvent(row: typeof auditEventOutbox.$inferSelect): AuditOutboxEvent {
  return {
    id: row.id,
    ...(row.userId === null ? {} : { userId: row.userId }),
    action: row.action as AuditOutboxEvent['action'],
    outcome: row.outcome as AuditOutboxEvent['outcome'],
    ...(row.targetType === null ? {} : { targetType: row.targetType }),
    ...(row.targetId === null ? {} : { targetId: row.targetId }),
    ...(row.metadataJson === null ? {} : { metadata: row.metadataJson }),
    occurredAt: row.occurredAt.toISOString(),
    status: row.status as AuditOutboxEvent['status'],
    attempts: row.attempts,
    availableAt: row.availableAt.toISOString(),
    ...(row.claimedBy === null ? {} : { claimedBy: row.claimedBy }),
    ...(row.claimedAt === null ? {} : { claimedAt: row.claimedAt.toISOString() }),
    ...(row.processedAt === null ? {} : { processedAt: row.processedAt.toISOString() }),
    ...(row.lastError === null ? {} : { lastError: row.lastError }),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function boundedErrorCode(value: string | undefined): string {
  const code = value?.trim()
  return code === undefined || code.length === 0
    ? 'AUDIT_OUTBOX_DELIVERY_FAILED'
    : code.slice(0, MAX_ERROR_CODE_LENGTH)
}

function retryDelay(attempts: number, baseDelayMs: number): number {
  const exponential = baseDelayMs * (2 ** Math.max(0, attempts - 1))
  return Math.min(MAX_RETRY_DELAY_MS, exponential)
}

async function lockOwnedEvent(
  tx: BailianStudioDbTransaction,
  input: { eventId: string; consumerId: string },
): Promise<typeof auditEventOutbox.$inferSelect | undefined> {
  const [row] = await tx
    .select()
    .from(auditEventOutbox)
    .where(and(
      eq(auditEventOutbox.id, input.eventId),
      eq(auditEventOutbox.status, 'processing'),
      eq(auditEventOutbox.claimedBy, input.consumerId),
    ))
    .limit(1)
    .for('update')
  return row
}

export function createAuditOutboxRepository({ db }: { db: BailianStudioDb }): AuditOutboxRepository {
  const repository: AuditOutboxRepository = {
    async listFailed(input: ListFailedAuditOutboxInput = {}): Promise<AuditOutboxEvent[]> {
      const limit = positiveInteger(input.limit, DEFAULT_CLAIM_LIMIT, MAX_CLAIM_LIMIT)
      const before = input.before === undefined ? undefined : nowDate(input.before)
      const rows = await db
        .select()
        .from(auditEventOutbox)
        .where(before === undefined
          ? eq(auditEventOutbox.status, 'failed')
          : and(
              eq(auditEventOutbox.status, 'failed'),
              lt(auditEventOutbox.updatedAt, before),
            ))
        .orderBy(desc(auditEventOutbox.updatedAt), desc(auditEventOutbox.id))
        .limit(limit)
      return rows.map(toEvent)
    },

    async requeueFailed(input: RequeueFailedAuditOutboxInput) {
      const now = nowDate(input.now)
      return db.transaction(async tx => {
        const [event] = await tx
          .select()
          .from(auditEventOutbox)
          .where(eq(auditEventOutbox.id, input.eventId))
          .limit(1)
          .for('update')
        if (event === undefined) return { status: 'not_found' as const }
        if (event.status !== 'failed') return { status: 'not_failed' as const, event: toEvent(event) }

        const [requeued] = await tx
          .update(auditEventOutbox)
          .set({
            status: 'pending',
            attempts: 0,
            availableAt: now,
            claimedBy: null,
            claimedAt: null,
            processedAt: null,
            lastError: null,
            updatedBy: input.operatorId,
            updatedAt: now,
          })
          .where(and(
            eq(auditEventOutbox.id, input.eventId),
            eq(auditEventOutbox.status, 'failed'),
          ))
          .returning()
        return requeued === undefined
          ? { status: 'not_found' as const }
          : { status: 'requeued' as const, event: toEvent(requeued) }
      })
    },

    async claim(input: ClaimAuditOutboxInput): Promise<AuditOutboxEvent[]> {
      const now = nowDate(input.now)
      const limit = positiveInteger(input.limit, DEFAULT_CLAIM_LIMIT, MAX_CLAIM_LIMIT)
      const claimTimeoutMs = positiveInteger(input.claimTimeoutMs, DEFAULT_CLAIM_TIMEOUT_MS)
      const staleBefore = new Date(now.getTime() - claimTimeoutMs)

      return db.transaction(async tx => {
        const selectedRows = await tx.execute<{ id: string }>(sql`
          select id
          from audit_event_outbox
          where (
            (status = 'pending' and available_at <= ${now.toISOString()})
            or (status = 'processing' and claimed_at is not null and claimed_at <= ${staleBefore.toISOString()})
          )
          order by created_at asc, id asc
          for update skip locked
          limit ${limit}
        `)
        const selectedIds = selectedRows.map(row => row.id)
        if (selectedIds.length === 0) return []

        const rows = await tx
          .select()
          .from(auditEventOutbox)
          .where(inArray(auditEventOutbox.id, selectedIds))
        const rowsById = new Map(rows.map(row => [row.id, row] as const))
        const claimed: AuditOutboxEvent[] = []

        for (const id of selectedIds) {
          const row = rowsById.get(id)
          if (row === undefined) continue
          const [updated] = await tx
            .update(auditEventOutbox)
            .set({
              status: 'processing',
              attempts: sql`${auditEventOutbox.attempts} + 1`,
              claimedBy: input.consumerId,
              claimedAt: now,
              lastError: null,
              updatedBy: input.consumerId,
              updatedAt: now,
            })
            .where(eq(auditEventOutbox.id, id))
            .returning()
          if (updated !== undefined) claimed.push(toEvent(updated))
        }
        return claimed
      })
    },

    async deliver(input: DeliverAuditOutboxInput): Promise<boolean> {
      const now = nowDate(input.now)
      return db.transaction(async tx => {
        const event = await lockOwnedEvent(tx, input)
        if (event === undefined) return false

        await tx
          .insert(auditLogs)
          .values({
            id: nextMaterializedAuditLogId(),
            outboxEventId: event.id,
            ...(event.userId === null ? {} : { userId: event.userId }),
            action: event.action,
            outcome: event.outcome,
            ...(event.targetType === null ? {} : { targetType: event.targetType }),
            ...(event.targetId === null ? {} : { targetId: event.targetId }),
            ...(event.metadataJson === null ? {} : { metadataJson: { ...event.metadataJson } }),
            occurredAt: event.occurredAt,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing({
            target: auditLogs.outboxEventId,
            where: sql`${auditLogs.outboxEventId} is not null`,
          })

        await tx
          .update(auditEventOutbox)
          .set({
            status: 'succeeded',
            claimedBy: null,
            claimedAt: null,
            processedAt: now,
            updatedBy: input.consumerId,
            updatedAt: now,
          })
          .where(and(
            eq(auditEventOutbox.id, input.eventId),
            eq(auditEventOutbox.status, 'processing'),
            eq(auditEventOutbox.claimedBy, input.consumerId),
          ))
        return true
      })
    },

    async fail(input: FailAuditOutboxInput): Promise<'pending' | 'failed' | 'skipped'> {
      const now = nowDate(input.now)
      const maxAttempts = positiveInteger(input.maxAttempts, DEFAULT_MAX_ATTEMPTS)
      const baseDelayMs = positiveInteger(input.retryDelayMs, DEFAULT_RETRY_DELAY_MS)

      return db.transaction(async tx => {
        const event = await lockOwnedEvent(tx, input)
        if (event === undefined) return 'skipped'
        const terminal = event.attempts >= maxAttempts
        const nextAvailableAt = new Date(now.getTime() + retryDelay(event.attempts, baseDelayMs))
        await tx
          .update(auditEventOutbox)
          .set({
            status: terminal ? 'failed' : 'pending',
            availableAt: nextAvailableAt,
            claimedBy: null,
            claimedAt: null,
            lastError: boundedErrorCode(input.errorCode),
            updatedBy: input.consumerId,
            updatedAt: now,
          })
          .where(and(
            eq(auditEventOutbox.id, input.eventId),
            eq(auditEventOutbox.status, 'processing'),
            eq(auditEventOutbox.claimedBy, input.consumerId),
          ))
        return terminal ? 'failed' : 'pending'
      })
    },

    async drain(input: DrainAuditOutboxInput): Promise<DrainAuditOutboxResult> {
      const events = await repository.claim(input)
      let delivered = 0
      let retried = 0
      let failed = 0
      for (const event of events) {
        try {
          if (await repository.deliver({ eventId: event.id, consumerId: input.consumerId, now: input.now })) {
            delivered += 1
          }
        } catch {
          const result = await repository.fail({
            eventId: event.id,
            consumerId: input.consumerId,
            now: input.now,
            ...(input.maxAttempts === undefined ? {} : { maxAttempts: input.maxAttempts }),
            ...(input.retryDelayMs === undefined ? {} : { retryDelayMs: input.retryDelayMs }),
          })
          if (result === 'failed') failed += 1
          else if (result === 'pending') retried += 1
        }
      }
      return { claimed: events.length, delivered, retried, failed }
    },
  }

  return repository
}
