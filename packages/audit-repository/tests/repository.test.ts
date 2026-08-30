import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  auditEventOutbox,
  auditLogs,
  createDb,
  users,
} from '@bailian-studio/db'
import { createIsolatedTestDb, resetBailianStudioTestDb } from '@bailian-studio/db/test'
import { and, eq } from 'drizzle-orm'
import { createAuditOutboxRepository } from '../src/repository'

const now = new Date('2026-08-30T00:00:00.000Z')
const userId = 'audit-outbox-owner'

let isolated!: Awaited<ReturnType<typeof createIsolatedTestDb>>
let db!: ReturnType<typeof createDb>

async function createUser(): Promise<void> {
  await db.insert(users).values({
    id: userId,
    email: `${userId}@example.com`,
    passwordHash: 'test-hash',
    createdAt: now,
    updatedAt: now,
  })
}

async function enqueueEvent(id: string, action = 'asset.import'): Promise<void> {
  await db.insert(auditEventOutbox).values({
    id,
    userId,
    action,
    outcome: 'succeeded',
    targetType: 'creative_asset',
    targetId: 'creative-asset-1',
    metadataJson: { source: 'generation', assetCount: 1 },
    occurredAt: now,
    status: 'pending',
    attempts: 0,
    availableAt: now,
    createdBy: userId,
    updatedBy: userId,
    createdAt: now,
    updatedAt: now,
  })
}

beforeAll(async () => {
  isolated = await createIsolatedTestDb()
  db = createDb({ url: isolated.url, max: 4 })
})

afterAll(async () => {
  await db.close()
  await isolated.close()
})

beforeEach(async () => {
  await resetBailianStudioTestDb(db)
  await createUser()
})

describe('audit outbox repository', () => {
  it('claims an event once under concurrency and materializes it idempotently', async () => {
    await enqueueEvent('audit-outbox-concurrent-1')
    const first = createAuditOutboxRepository({ db })
    const second = createAuditOutboxRepository({ db })
    const [firstClaim, secondClaim] = await Promise.all([
      first.claim({ consumerId: 'audit-worker-a', now: now.toISOString() }),
      second.claim({ consumerId: 'audit-worker-b', now: now.toISOString() }),
    ])
    const claims = [...firstClaim, ...secondClaim]
    expect(claims).toHaveLength(1)
    const claimed = claims[0]
    if (claimed === undefined || claimed.claimedBy === undefined) throw new Error('expected claimed outbox event')

    const claimedBy = claimed.claimedBy
    const owner = claimedBy === 'audit-worker-a' ? first : second
    const other = claimedBy === 'audit-worker-a' ? second : first
    await expect(owner.deliver({
      eventId: claimed.id,
      consumerId: claimedBy,
      now: new Date(now.getTime() + 1_000).toISOString(),
    })).resolves.toBe(true)
    await expect(other.deliver({
      eventId: claimed.id,
      consumerId: claimedBy,
      now: new Date(now.getTime() + 2_000).toISOString(),
    })).resolves.toBe(false)

    const [outbox] = await db.select().from(auditEventOutbox).where(eq(auditEventOutbox.id, claimed.id))
    const materialized = await db.select().from(auditLogs).where(eq(auditLogs.outboxEventId, claimed.id))
    expect(outbox).toMatchObject({ status: 'succeeded', attempts: 1, claimedBy: null })
    expect(materialized).toHaveLength(1)
    expect(materialized[0]).toMatchObject({
      outboxEventId: claimed.id,
      action: 'asset.import',
      targetId: 'creative-asset-1',
    })
  })

  it('reclaims stale work and moves malformed deliveries to terminal failure', async () => {
    await enqueueEvent('audit-outbox-stale-1')
    await db
      .update(auditEventOutbox)
      .set({
        status: 'processing',
        attempts: 1,
        claimedBy: 'dead-audit-worker',
        claimedAt: new Date(now.getTime() - 10_000),
      })
      .where(eq(auditEventOutbox.id, 'audit-outbox-stale-1'))

    const repository = createAuditOutboxRepository({ db })
    const reclaimed = await repository.claim({
      consumerId: 'audit-worker-recovery',
      now: now.toISOString(),
      claimTimeoutMs: 1_000,
    })
    expect(reclaimed).toMatchObject([{ id: 'audit-outbox-stale-1', attempts: 2, claimedBy: 'audit-worker-recovery' }])
    await expect(repository.requeueFailed({
      eventId: 'audit-outbox-stale-1',
      operatorId: userId,
      now: now.toISOString(),
    })).resolves.toMatchObject({ status: 'not_failed' })

    await enqueueEvent('audit-outbox-malformed-1', 'unknown.audit.action')
    const drain = await repository.drain({
      consumerId: 'audit-worker-recovery',
      now: now.toISOString(),
      maxAttempts: 1,
      limit: 1,
    })
    expect(drain).toEqual({ claimed: 1, delivered: 0, retried: 0, failed: 1 })
    const [failed] = await db
      .select()
      .from(auditEventOutbox)
      .where(and(
        eq(auditEventOutbox.id, 'audit-outbox-malformed-1'),
        eq(auditEventOutbox.status, 'failed'),
      ))
    expect(failed?.lastError).toBe('AUDIT_OUTBOX_DELIVERY_FAILED')

    await expect(repository.listFailed({ limit: 10 })).resolves.toMatchObject([
      { id: 'audit-outbox-malformed-1', status: 'failed', attempts: 1 },
    ])
    await expect(repository.requeueFailed({
      eventId: 'audit-outbox-malformed-1',
      operatorId: userId,
      now: new Date(now.getTime() + 1_000).toISOString(),
    })).resolves.toMatchObject({
      status: 'requeued',
      event: { id: 'audit-outbox-malformed-1', status: 'pending', attempts: 0 },
    })
  })
})
