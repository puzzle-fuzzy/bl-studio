import { randomUUID } from 'node:crypto'
import { and, desc, eq, inArray, lt, notExists, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import {
  creditAccounts,
  creditLedgerEntries,
  createDb,
  generationRecords,
  type BailianStudioDb,
  type BailianStudioDbTransaction,
} from '@bailian-studio/db'
import { MAX_CREDIT_AMOUNT_CENTS, type AdjustCreditsInput, type CreditAccount, type CreditBalance, type CreditLedgerEntry, type CreditLedgerKind, type CreditMutationResult, type CreditReconciliationReport, type GrantCreditsInput, type GrantCreditsResult, type ListCreditLedgerInput, type CreditLedgerPage, type ReleaseStaleReservationsInput, type ReleaseStaleReservationsResult } from './types'
import { CreditLedgerError } from './errors'

export type CreditAccountRow = typeof creditAccounts.$inferSelect
export type CreditLedgerEntryRow = typeof creditLedgerEntries.$inferSelect

export interface CreditLedger {
  getBalance(input: { userId: string }): Promise<CreditBalance>
  listEntries(input: ListCreditLedgerInput): Promise<CreditLedgerPage>
  grant(input: GrantCreditsInput): Promise<GrantCreditsResult>
  adjust(input: AdjustCreditsInput): Promise<CreditMutationResult>
  reconcile(): Promise<CreditReconciliationReport>
  releaseStaleReservations(input: ReleaseStaleReservationsInput): Promise<ReleaseStaleReservationsResult>
}

export interface CreateCreditLedgerOptions {
  db: BailianStudioDb
}

function nowOrDefault(now?: Date): Date {
  return now ?? new Date()
}

function nextId(prefix: string): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`
}

function toAccount(row: CreditAccountRow): CreditAccount {
  return {
    id: row.id,
    userId: row.userId,
    availableCents: row.availableCents,
    reservedCents: row.reservedCents,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function toEntry(row: CreditLedgerEntryRow): CreditLedgerEntry {
  return {
    id: row.id,
    accountId: row.accountId,
    userId: row.userId,
    ...(row.generationId !== null ? { generationId: row.generationId } : {}),
    kind: row.kind as CreditLedgerKind,
    availableDeltaCents: row.availableDeltaCents,
    reservedDeltaCents: row.reservedDeltaCents,
    availableBalanceCents: row.availableBalanceCents,
    reservedBalanceCents: row.reservedBalanceCents,
    idempotencyKey: row.idempotencyKey,
    ...(row.reason !== null ? { reason: row.reason } : {}),
    ...(row.actorUserId !== null ? { actorUserId: row.actorUserId } : {}),
    ...(row.requestId !== null ? { requestId: row.requestId } : {}),
    createdAt: row.createdAt.toISOString(),
  }
}

function toBalance(userId: string, account: CreditAccountRow): CreditBalance {
  return {
    userId,
    availableCents: account.availableCents,
    reservedCents: account.reservedCents,
    totalCents: account.availableCents + account.reservedCents,
  }
}

function validatePositiveAmount(amountCents: number): void {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > MAX_CREDIT_AMOUNT_CENTS) {
    throw new CreditLedgerError('POINTS_GRANT_INVALID', `amountCents must be an integer between 1 and ${MAX_CREDIT_AMOUNT_CENTS}`)
  }
}

function validateText(value: string, field: string): void {
  if (value.trim().length === 0 || value.length > 500) {
    throw new CreditLedgerError('POINTS_GRANT_INVALID', `${field} must be non-empty and at most 500 characters`)
  }
}

function validateSignedAmount(amountCents: number): void {
  if (!Number.isSafeInteger(amountCents) || amountCents === 0 || Math.abs(amountCents) > MAX_CREDIT_AMOUNT_CENTS) {
    throw new CreditLedgerError('POINTS_ADJUSTMENT_INVALID', `amountCents must be a non-zero integer within +/-${MAX_CREDIT_AMOUNT_CENTS}`)
  }
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined) return 50
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new CreditLedgerError('POINTS_ADJUSTMENT_INVALID', 'limit must be an integer between 1 and 100')
  }
  return limit
}

function encodeCursor(input: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ createdAt: input.createdAt.toISOString(), id: input.id }), 'utf8').toString('base64url')
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { createdAt?: unknown; id?: unknown }
    if (typeof decoded.createdAt !== 'string' || typeof decoded.id !== 'string' || !Number.isFinite(Date.parse(decoded.createdAt))) {
      throw new Error('invalid cursor')
    }
    return { createdAt: new Date(decoded.createdAt), id: decoded.id }
  } catch {
    throw new CreditLedgerError('POINTS_INVALID_CURSOR', 'Invalid credit ledger cursor')
  }
}

async function findLockedAccount(tx: BailianStudioDbTransaction, userId: string): Promise<CreditAccountRow> {
  const [row] = await tx
    .select()
    .from(creditAccounts)
    .where(eq(creditAccounts.userId, userId))
    .for('update')
    .limit(1)

  if (row === undefined) {
    throw new CreditLedgerError('POINTS_ACCOUNT_NOT_FOUND', `Credit account not found for user ${userId}`)
  }
  return row
}

export async function ensureCreditAccountInTransaction(
  tx: BailianStudioDbTransaction,
  input: { userId: string; now: Date },
): Promise<CreditAccount> {
  await tx.insert(creditAccounts).values({
    id: nextId('credit_account'),
    userId: input.userId,
    availableCents: 0,
    reservedCents: 0,
    createdAt: input.now,
    updatedAt: input.now,
  }).onConflictDoNothing({ target: creditAccounts.userId })

  const row = await findLockedAccount(tx, input.userId)
  return toAccount(row)
}

async function findIdempotentEntry(
  tx: BailianStudioDbTransaction,
  accountId: string,
  idempotencyKey: string,
): Promise<CreditLedgerEntryRow | undefined> {
  const [row] = await tx
    .select()
    .from(creditLedgerEntries)
    .where(and(eq(creditLedgerEntries.accountId, accountId), eq(creditLedgerEntries.idempotencyKey, idempotencyKey)))
    .limit(1)
  return row
}

function assertIdempotency(
  existing: CreditLedgerEntryRow,
  input: { kind: CreditLedgerKind; availableDeltaCents: number; reservedDeltaCents: number },
): void {
  if (
    existing.kind !== input.kind
    || existing.availableDeltaCents !== input.availableDeltaCents
    || existing.reservedDeltaCents !== input.reservedDeltaCents
  ) {
    throw new CreditLedgerError('POINTS_IDEMPOTENCY_CONFLICT', 'Idempotency key was already used with different credit mutation')
  }
}

async function appendMutation(
  tx: BailianStudioDbTransaction,
  input: {
    account: CreditAccountRow
    userId: string
    generationId?: string
    kind: CreditLedgerKind
    availableDeltaCents: number
    reservedDeltaCents: number
    idempotencyKey: string
    reason?: string
    actorUserId?: string
    requestId?: string
    now: Date
  },
): Promise<CreditMutationResult> {
  const existing = await findIdempotentEntry(tx, input.account.id, input.idempotencyKey)
  if (existing !== undefined) {
    assertIdempotency(existing, input)
    return {
      entry: toEntry(existing),
      balance: {
        userId: input.userId,
        availableCents: existing.availableBalanceCents,
        reservedCents: existing.reservedBalanceCents,
        totalCents: existing.availableBalanceCents + existing.reservedBalanceCents,
      },
    }
  }

  const available = input.account.availableCents + input.availableDeltaCents
  const reserved = input.account.reservedCents + input.reservedDeltaCents
  if (available < 0 || reserved < 0) {
    throw new CreditLedgerError('POINTS_INSUFFICIENT', '积分余额不足，无法完成本次操作。')
  }

  const [updated] = await tx
    .update(creditAccounts)
    .set({ availableCents: available, reservedCents: reserved, updatedAt: input.now })
    .where(eq(creditAccounts.id, input.account.id))
    .returning()
  if (updated === undefined) {
    throw new CreditLedgerError('POINTS_DATABASE_ERROR', 'Credit account update returned no row')
  }

  const [entry] = await tx.insert(creditLedgerEntries).values({
    id: nextId('credit_entry'),
    accountId: updated.id,
    userId: input.userId,
    ...(input.generationId !== undefined ? { generationId: input.generationId } : {}),
    kind: input.kind,
    availableDeltaCents: input.availableDeltaCents,
    reservedDeltaCents: input.reservedDeltaCents,
    availableBalanceCents: updated.availableCents,
    reservedBalanceCents: updated.reservedCents,
    idempotencyKey: input.idempotencyKey,
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    createdAt: input.now,
  }).returning()
  if (entry === undefined) {
    throw new CreditLedgerError('POINTS_DATABASE_ERROR', 'Credit ledger insert returned no row')
  }

  return { entry: toEntry(entry), balance: toBalance(input.userId, updated) }
}

export async function reserveCreditsInTransaction(
  tx: BailianStudioDbTransaction,
  input: { userId: string; generationId: string; amountCents: number; idempotencyKey: string; now: Date },
): Promise<CreditMutationResult> {
  validatePositiveAmount(input.amountCents)
  const account = await findLockedAccount(tx, input.userId)
  if (account.availableCents < input.amountCents) {
    throw new CreditLedgerError('POINTS_INSUFFICIENT', '积分不足，无法调用该模型。', {
      availableCents: account.availableCents,
      requiredCents: input.amountCents,
    })
  }
  return appendMutation(tx, {
    account,
    userId: input.userId,
    generationId: input.generationId,
    kind: 'reserve',
    availableDeltaCents: -input.amountCents,
    reservedDeltaCents: input.amountCents,
    idempotencyKey: input.idempotencyKey,
    now: input.now,
  })
}

export async function settleCreditsInTransaction(
  tx: BailianStudioDbTransaction,
  input: { userId: string; generationId: string; reservedCents: number; finalCents: number; idempotencyKey: string; now: Date },
): Promise<CreditMutationResult> {
  validatePositiveAmount(input.reservedCents)
  if (!Number.isSafeInteger(input.finalCents) || input.finalCents < 0 || input.finalCents > MAX_CREDIT_AMOUNT_CENTS) {
    throw new CreditLedgerError('POINTS_SETTLEMENT_ANOMALY', `finalCents must be an integer between 0 and ${MAX_CREDIT_AMOUNT_CENTS}`)
  }
  const account = await findLockedAccount(tx, input.userId)
  const cappedFinal = Math.min(input.finalCents, input.reservedCents)
  const result = await appendMutation(tx, {
    account,
    userId: input.userId,
    generationId: input.generationId,
    kind: 'settle',
    availableDeltaCents: input.reservedCents - cappedFinal,
    reservedDeltaCents: -input.reservedCents,
    idempotencyKey: input.idempotencyKey,
    now: input.now,
  })
  return input.finalCents > input.reservedCents ? { ...result, anomaly: true } : result
}

export async function refundCreditsInTransaction(
  tx: BailianStudioDbTransaction,
  input: { userId: string; generationId: string; reservedCents: number; idempotencyKey: string; reason?: string; actorUserId?: string; requestId?: string; now: Date },
): Promise<CreditMutationResult> {
  validatePositiveAmount(input.reservedCents)
  const account = await findLockedAccount(tx, input.userId)
  return appendMutation(tx, {
    account,
    userId: input.userId,
    generationId: input.generationId,
    kind: 'refund',
    availableDeltaCents: input.reservedCents,
    reservedDeltaCents: -input.reservedCents,
    idempotencyKey: input.idempotencyKey,
    ...(input.reason !== undefined ? { reason: input.reason } : {}),
    ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
    ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
    now: input.now,
  })
}

export function createCreditLedger(options: CreateCreditLedgerOptions): CreditLedger {
  return {
    async getBalance({ userId }) {
      return options.db.transaction(async tx => {
        const account = await ensureCreditAccountInTransaction(tx, { userId, now: new Date() })
        return {
          userId,
          availableCents: account.availableCents,
          reservedCents: account.reservedCents,
          totalCents: account.availableCents + account.reservedCents,
        }
      })
    },

    async listEntries(input) {
      const limit = normalizeLimit(input.limit)
      return options.db.transaction(async tx => {
        const [account] = await tx
          .select({ id: creditAccounts.id })
          .from(creditAccounts)
          .where(eq(creditAccounts.userId, input.userId))
          .limit(1)
        if (account === undefined) {
          throw new CreditLedgerError('POINTS_ACCOUNT_NOT_FOUND', `Credit account not found for user ${input.userId}`)
        }

        const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor)
        const condition = cursor === undefined
          ? eq(creditLedgerEntries.accountId, account.id)
          : and(
              eq(creditLedgerEntries.accountId, account.id),
              or(
                lt(creditLedgerEntries.createdAt, cursor.createdAt),
                and(eq(creditLedgerEntries.createdAt, cursor.createdAt), lt(creditLedgerEntries.id, cursor.id)),
              ),
            )
        const rows = await tx
          .select()
          .from(creditLedgerEntries)
          .where(condition)
          .orderBy(desc(creditLedgerEntries.createdAt), desc(creditLedgerEntries.id))
          .limit(limit + 1)
        const hasNext = rows.length > limit
        const pageRows = hasNext ? rows.slice(0, limit) : rows
        const last = pageRows.at(-1)
        return {
          items: pageRows.map(toEntry),
          ...(hasNext && last !== undefined ? { nextCursor: encodeCursor(last) } : {}),
        }
      })
    },

    async grant(input) {
      validatePositiveAmount(input.amountCents)
      validateText(input.reason, 'reason')
      validateText(input.idempotencyKey, 'idempotencyKey')
      const now = nowOrDefault(input.now)
      return options.db.transaction(async tx => {
        const account = await ensureCreditAccountInTransaction(tx, { userId: input.userId, now })
        const result = await appendMutation(tx, {
          account: await findLockedAccount(tx, input.userId),
          userId: input.userId,
          kind: 'grant',
          availableDeltaCents: input.amountCents,
          reservedDeltaCents: 0,
          idempotencyKey: input.idempotencyKey,
          reason: input.reason,
          actorUserId: input.actorUserId,
          ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
          now,
        })
        return { entry: result.entry, balance: result.balance }
      })
    },

    async adjust(input) {
      validateSignedAmount(input.amountCents)
      validateText(input.reason, 'reason')
      validateText(input.idempotencyKey, 'idempotencyKey')
      validateText(input.actorUserId, 'actorUserId')
      const now = nowOrDefault(input.now)
      return options.db.transaction(async tx => {
        await ensureCreditAccountInTransaction(tx, { userId: input.userId, now })
        return appendMutation(tx, {
          account: await findLockedAccount(tx, input.userId),
          userId: input.userId,
          kind: 'adjustment',
          availableDeltaCents: input.amountCents,
          reservedDeltaCents: 0,
          idempotencyKey: input.idempotencyKey,
          reason: input.reason,
          actorUserId: input.actorUserId,
          ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
          now,
        })
      })
    },

    async reconcile() {
      return options.db.transaction(async tx => {
        const accounts = await tx.select().from(creditAccounts)
        // P1-06：set-based —— 每账户只取最新一条快照（ROW_NUMBER 窗口函数），负余额
        // 由 DB 过滤（WHERE），不再把整本账本载入内存。内存占用从 O(全部条目) 降到
        // O(账户数 + 异常条数)，全表扫描仍由 Postgres 完成。
        // 注：drizzle 0.45 已移除 query builder 的 distinctOn，这里走原生 SQL。
        const latestRows = await tx.execute<{
          account_id: string
          id: string
          available_balance_cents: number
          reserved_balance_cents: number
        }>(sql`
          SELECT account_id, id, available_balance_cents, reserved_balance_cents
          FROM (
            SELECT credit_ledger_entries.*,
                   ROW_NUMBER() OVER (
                     PARTITION BY account_id
                     ORDER BY created_at DESC, id DESC
                   ) AS rn
            FROM credit_ledger_entries
          ) ranked
          WHERE rn = 1
        `)
        const negativeRows = await tx
          .select()
          .from(creditLedgerEntries)
          .where(or(lt(creditLedgerEntries.availableBalanceCents, 0), lt(creditLedgerEntries.reservedBalanceCents, 0)))
        const latestByAccount = new Map<string, CreditLedgerEntryRow>()
        for (const row of latestRows) {
          // execute() 走原生 SQL，列名是 snake_case；这里只取对账用到的字段，
          // 转回 CreditLedgerEntryRow 的 camelCase 形状（其余字段对账用不到）。
          latestByAccount.set(row.account_id, {
            id: row.id,
            accountId: row.account_id,
            availableBalanceCents: row.available_balance_cents,
            reservedBalanceCents: row.reserved_balance_cents,
          } as CreditLedgerEntryRow)
        }
        const violations: CreditReconciliationReport['violations'] = []

        for (const entry of negativeRows) {
          violations.push({
            code: 'NEGATIVE_BALANCE',
            userId: entry.userId,
            accountId: entry.accountId,
            message: `Ledger entry ${entry.id} contains a negative balance snapshot`,
          })
        }

        for (const account of accounts) {
          if (account.availableCents < 0 || account.reservedCents < 0) {
            violations.push({
              code: 'NEGATIVE_BALANCE',
              userId: account.userId,
              accountId: account.id,
              message: 'Credit account contains a negative balance',
            })
          }
          const latest = latestByAccount.get(account.id)
          if (latest === undefined) {
            if (account.availableCents !== 0 || account.reservedCents !== 0) {
              violations.push({
                code: 'ACCOUNT_BALANCE_MISMATCH',
                userId: account.userId,
                accountId: account.id,
                message: 'Credit account has a balance but no ledger entry',
              })
            }
            continue
          }
          if (latest.availableBalanceCents !== account.availableCents || latest.reservedBalanceCents !== account.reservedCents) {
            violations.push({
              code: 'ACCOUNT_BALANCE_MISMATCH',
              userId: account.userId,
              accountId: account.id,
              message: `Account balance differs from latest ledger snapshot ${latest.id}`,
            })
          }
        }

        return {
          checkedAccounts: accounts.length,
          checkedEntries: latestRows.length + negativeRows.length,
          violations,
          healthy: violations.length === 0,
        }
      })
    },

    async releaseStaleReservations(input) {
      if (!(input.olderThan instanceof Date) || !Number.isFinite(input.olderThan.getTime())) {
        throw new CreditLedgerError('POINTS_ADJUSTMENT_INVALID', 'olderThan must be a valid date')
      }
      const now = nowOrDefault(input.now)
      const settledAlias = alias(creditLedgerEntries, 'settled')
      return options.db.transaction(async tx => {
        // P1-06：候选判定整体下推到 SQL —— kind=reserve + 超时 + generation 已终态 +
        // NOT EXISTS（该 generation 尚无 settle/refund）。此前在 JS 里全表载入账本后
        // 内存建集合，账本增长后每次清扫 O(全部条目) 内存。
        const rows = await tx
          .select({ entry: creditLedgerEntries, generationStatus: generationRecords.status })
          .from(creditLedgerEntries)
          .innerJoin(generationRecords, eq(generationRecords.id, creditLedgerEntries.generationId))
          .where(and(
            eq(creditLedgerEntries.kind, 'reserve'),
            lt(creditLedgerEntries.createdAt, input.olderThan),
            inArray(generationRecords.status, ['succeeded', 'failed', 'cancelled']),
            notExists(
              tx
                .select({ one: sql`1` })
                .from(settledAlias)
                .where(and(
                  eq(settledAlias.generationId, creditLedgerEntries.generationId),
                  inArray(settledAlias.kind, ['settle', 'refund']),
                )),
            ),
          ))
        const candidates = rows.map(row => row.entry)

        if (!input.confirm) {
          return { candidates: candidates.length, released: 0, skipped: true, releasedEntryIds: [] }
        }

        const releasedEntryIds: string[] = []
        for (const entry of candidates) {
          const reservedCents = entry.reservedDeltaCents
          if (reservedCents <= 0 || entry.generationId === null) continue
          const result = await appendMutation(tx, {
            account: await findLockedAccount(tx, entry.userId),
            userId: entry.userId,
            generationId: entry.generationId,
            kind: 'refund',
            availableDeltaCents: reservedCents,
            reservedDeltaCents: -reservedCents,
            idempotencyKey: `stale-reservation:${entry.id}`,
            reason: 'stale reservation sweep',
            ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
            ...(input.requestId !== undefined ? { requestId: input.requestId } : {}),
            now,
          })
          releasedEntryIds.push(result.entry.id)
        }
        return { candidates: candidates.length, released: releasedEntryIds.length, skipped: false, releasedEntryIds }
      })
    },
  }
}

export function createCreditLedgerFromUrl(url: string, options: { max?: number } = {}): { ledger: CreditLedger; db: BailianStudioDb; close(): Promise<void> } {
  const db = createDb({ url, max: options.max ?? 5 })
  return { ledger: createCreditLedger({ db }), db, close: () => db.close() }
}
