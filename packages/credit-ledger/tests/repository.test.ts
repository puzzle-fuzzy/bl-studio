import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createDb, creditAccounts, generationRecords, users, type BailianStudioDb } from '@bailian-studio/db'
import { createIsolatedTestDb, type IsolatedTestDb } from '@bailian-studio/db/test'
import { CreditLedgerError, createCreditLedger, reserveCreditsInTransaction } from '../src'

let isolated!: IsolatedTestDb
let db!: BailianStudioDb

beforeAll(async () => {
  isolated = await createIsolatedTestDb()
  db = createDb({ url: isolated.url, max: 2 })
})

afterAll(async () => {
  await db.close()
  await isolated.close()
})

async function createUsers(suffix: string): Promise<{ userId: string; adminId: string }> {
  const now = new Date()
  const userId = `credit-user-${suffix}`
  const adminId = `credit-admin-${suffix}`
  await db.insert(users).values([
    { id: userId, email: `${userId}@example.com`, passwordHash: 'test-hash', createdAt: now, updatedAt: now },
    { id: adminId, email: `${adminId}@example.com`, passwordHash: 'test-hash', role: 'admin', createdAt: now, updatedAt: now },
  ])
  return { userId, adminId }
}

describe('credit ledger repository', () => {
  it('grants credits once for an idempotency key', async () => {
    const { userId, adminId } = await createUsers('grant')
    const ledger = createCreditLedger({ db })

    const first = await ledger.grant({
      userId,
      actorUserId: adminId,
      amountCents: 1000,
      reason: 'test grant',
      idempotencyKey: 'grant-1',
    })
    const second = await ledger.grant({
      userId,
      actorUserId: adminId,
      amountCents: 1000,
      reason: 'test grant',
      idempotencyKey: 'grant-1',
    })

    expect(second.entry.id).toBe(first.entry.id)
    expect((await ledger.getBalance({ userId })).availableCents).toBe(1000)
  })

  it('rejects non-positive grant amounts', async () => {
    const { userId, adminId } = await createUsers('invalid')
    const ledger = createCreditLedger({ db })

    await expect(ledger.grant({
      userId,
      actorUserId: adminId,
      amountCents: 0,
      reason: 'invalid grant',
      idempotencyKey: 'grant-0',
    })).rejects.toBeInstanceOf(CreditLedgerError)
  })

  it('rejects amounts that cannot be represented by PostgreSQL integer cents', async () => {
    const { userId, adminId } = await createUsers('overflow')
    const ledger = createCreditLedger({ db })

    await expect(ledger.grant({
      userId,
      actorUserId: adminId,
      amountCents: 2_147_483_648,
      reason: 'overflow grant',
      idempotencyKey: 'grant-overflow',
    })).rejects.toMatchObject({ code: 'POINTS_GRANT_INVALID' })
  })

  it('paginates ledger entries and applies idempotent signed adjustments', async () => {
    const { userId, adminId } = await createUsers('ops')
    const ledger = createCreditLedger({ db })
    await ledger.grant({ userId, actorUserId: adminId, amountCents: 1000, reason: 'seed', idempotencyKey: 'ops-seed' })
    const adjustment = await ledger.adjust({ userId, actorUserId: adminId, amountCents: -200, reason: 'correction', idempotencyKey: 'ops-adjust' })
    const replay = await ledger.adjust({ userId, actorUserId: adminId, amountCents: -200, reason: 'correction', idempotencyKey: 'ops-adjust' })

    expect(replay.entry.id).toBe(adjustment.entry.id)
    const first = await ledger.listEntries({ userId, limit: 1 })
    expect(first.items).toHaveLength(1)
    expect(typeof first.nextCursor).toBe('string')
    const second = await ledger.listEntries({ userId, limit: 1, cursor: first.nextCursor })
    expect(second.items).toHaveLength(1)
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id)
    expect((await ledger.getBalance({ userId })).availableCents).toBe(800)
  })

  it('reports account/ledger mismatches without mutating data', async () => {
    const { userId, adminId } = await createUsers('reconcile')
    const ledger = createCreditLedger({ db })
    await ledger.grant({ userId, actorUserId: adminId, amountCents: 500, reason: 'seed', idempotencyKey: 'reconcile-seed' })
    await expect(ledger.reconcile()).resolves.toMatchObject({ healthy: true, violations: [] })

    await db.update(creditAccounts).set({ availableCents: 400 }).where(eq(creditAccounts.userId, userId))
    const report = await ledger.reconcile()
    expect(report.healthy).toBe(false)
    expect(report.violations).toContainEqual(expect.objectContaining({ userId, code: 'ACCOUNT_BALANCE_MISMATCH' }))
  })

  it('only releases terminal stale reservations after explicit confirmation', async () => {
    const { userId, adminId } = await createUsers('stale')
    const ledger = createCreditLedger({ db })
    await ledger.grant({ userId, actorUserId: adminId, amountCents: 300, reason: 'seed', idempotencyKey: 'stale-seed' })
    const old = new Date('2026-01-01T00:00:00.000Z')
    await db.insert(generationRecords).values({
      id: 'generation-stale-reservation', userId, modelId: 'qwen-image', provider: 'dashscope',
      providerModel: 'qwen-image', category: 'image', inputParamsJson: { prompt: 'stale' },
      status: 'failed', costEstimate: 100, providerCancelStatus: 'not_requested', createdAt: old, updatedAt: old,
    })
    await db.transaction(tx => reserveCreditsInTransaction(tx, {
      userId, generationId: 'generation-stale-reservation', amountCents: 100,
      idempotencyKey: 'stale-reserve', now: old,
    }))

    await expect(ledger.releaseStaleReservations({ olderThan: new Date('2026-02-01T00:00:00.000Z'), confirm: false }))
      .resolves.toMatchObject({ candidates: 1, released: 0, skipped: true })
    expect((await ledger.getBalance({ userId })).reservedCents).toBe(100)
    await expect(ledger.releaseStaleReservations({
      olderThan: new Date('2026-02-01T00:00:00.000Z'), confirm: true, actorUserId: adminId,
    })).resolves.toMatchObject({ candidates: 1, released: 1, skipped: false })
    await expect(ledger.releaseStaleReservations({ olderThan: new Date('2026-02-01T00:00:00.000Z'), confirm: true }))
      .resolves.toMatchObject({ candidates: 0, released: 0 })
    await expect(ledger.getBalance({ userId })).resolves.toMatchObject({ availableCents: 300, reservedCents: 0 })
  })
})
