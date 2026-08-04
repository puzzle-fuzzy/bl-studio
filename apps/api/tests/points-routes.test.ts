import { beforeEach, describe, expect, it } from 'vitest'
import { AuthError } from '@bailian-studio/auth'
import type { CreditBalance, CreditLedger, GrantCreditsResult } from '@bailian-studio/credit-ledger'
import type { GenerationRepository } from '@bailian-studio/generation-repository'
import { CreditLedgerError } from '@bailian-studio/credit-ledger'
import { createTestApp } from '../src/test-app'
import { createFakeAuthService } from './fake-auth-service'

let currentUser: { id: string; role: 'user' | 'admin' } = { id: 'user-1', role: 'user' }
const balances = new Map<string, CreditBalance>()
const grants: Array<Parameters<CreditLedger['grant']>[0]> = []
const adjustments: Array<Parameters<CreditLedger['adjust']>[0]> = []
const audits: Array<Record<string, unknown>> = []

const fakeAuthService = createFakeAuthService(() => ({
  id: currentUser.id,
  email: 'u@e.test',
  displayName: null,
  role: currentUser.role,
}))

const fakeCreditLedger: CreditLedger = {
  getBalance: async ({ userId }) => balances.get(userId) ?? {
    userId,
    availableCents: 0,
    reservedCents: 0,
    totalCents: 0,
  },
  grant: async (input) => {
    grants.push(input)
    const previous = balances.get(input.userId) ?? { userId: input.userId, availableCents: 0, reservedCents: 0, totalCents: 0 }
    const balance = {
      ...previous,
      availableCents: previous.availableCents + input.amountCents,
      totalCents: previous.totalCents + input.amountCents,
    }
    balances.set(input.userId, balance)
    return {
      balance,
      entry: {
        id: 'entry-1',
        accountId: 'account-1',
        userId: input.userId,
        kind: 'grant',
        availableDeltaCents: input.amountCents,
        reservedDeltaCents: 0,
        availableBalanceCents: balance.availableCents,
        reservedBalanceCents: balance.reservedCents,
        idempotencyKey: input.idempotencyKey,
        reason: input.reason,
        actorUserId: input.actorUserId,
        createdAt: new Date().toISOString(),
      },
    } satisfies GrantCreditsResult
  },
  listEntries: async ({ userId }) => ({ items: [{
    id: 'entry-1', accountId: 'account-1', userId, kind: 'grant', availableDeltaCents: 100,
    reservedDeltaCents: 0, availableBalanceCents: 100, reservedBalanceCents: 0,
    idempotencyKey: 'seed', createdAt: new Date().toISOString(),
  }] }),
  adjust: async (input) => {
    adjustments.push(input)
    const previous = balances.get(input.userId) ?? { userId: input.userId, availableCents: 0, reservedCents: 0, totalCents: 0 }
    const balance = { ...previous, availableCents: previous.availableCents + input.amountCents, totalCents: previous.totalCents + input.amountCents }
    balances.set(input.userId, balance)
    return {
      balance,
      entry: {
        id: 'adjustment-1', accountId: 'account-1', userId: input.userId, kind: 'adjustment',
        availableDeltaCents: input.amountCents, reservedDeltaCents: 0,
        availableBalanceCents: balance.availableCents, reservedBalanceCents: balance.reservedCents,
        idempotencyKey: input.idempotencyKey, reason: input.reason, actorUserId: input.actorUserId,
        createdAt: new Date().toISOString(),
      },
    }
  },
  reconcile: async () => ({ checkedAccounts: 1, checkedEntries: 1, violations: [], healthy: true }),
  releaseStaleReservations: async () => ({ candidates: 0, released: 0, skipped: true, releasedEntryIds: [] }),
}

const fakeGenerationRepository = {
  recordAuditEvent: async (input: Record<string, unknown>) => {
    audits.push(input)
    return {} as never
  },
} as unknown as GenerationRepository

function authed(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set('cookie', 'bailian_studio_session=fake-token')
  return new Request(url, { ...init, headers })
}

function json(url: string, body: unknown, init: RequestInit = {}): Request {
  return authed(url, {
    ...init,
    method: init.method ?? 'POST',
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: JSON.stringify(body),
  })
}

describe('points routes', () => {
  beforeEach(() => {
    currentUser = { id: 'user-1', role: 'user' }
    balances.clear()
    grants.length = 0
    adjustments.length = 0
    audits.length = 0
  })

  it('returns the authenticated account balance', async () => {
    balances.set('user-1', { userId: 'user-1', availableCents: 1200, reservedCents: 300, totalCents: 1500 })
    const app = createTestApp({ authService: fakeAuthService, creditLedger: fakeCreditLedger, generationRepository: fakeGenerationRepository }).app

    const response = await app.handle(authed('http://localhost/api/account/points'))
    const body = await response.json() as { success: true; data: { balance: CreditBalance } }

    expect(response.status).toBe(200)
    expect(body.data.balance).toEqual({ userId: 'user-1', availableCents: 1200, reservedCents: 300, totalCents: 1500 })
  })

  it('rejects a non-admin grant before touching the ledger', async () => {
    const app = createTestApp({ authService: fakeAuthService, creditLedger: fakeCreditLedger, generationRepository: fakeGenerationRepository }).app
    const response = await app.handle(json('http://localhost/api/admin/users/target-1/points/grants', {
      amountCents: 100,
      reason: 'test account',
      idempotencyKey: 'grant-1',
    }))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(403)
    expect(body.error.code).toBe('AUTH_FORBIDDEN')
    expect(grants).toHaveLength(0)
  })

  it('returns the authenticated user ledger page', async () => {
    const app = createTestApp({ authService: fakeAuthService, creditLedger: fakeCreditLedger, generationRepository: fakeGenerationRepository }).app
    const response = await app.handle(authed('http://localhost/api/account/points/ledger?limit=10'))
    const body = await response.json() as { success: true; data: { items: unknown[] } }
    expect(response.status).toBe(200)
    expect(body.data.items).toHaveLength(1)
  })

  it('allows admins to make a reasoned signed adjustment', async () => {
    currentUser = { id: 'admin-1', role: 'admin' }
    const app = createTestApp({ authService: fakeAuthService, creditLedger: fakeCreditLedger, generationRepository: fakeGenerationRepository }).app
    const response = await app.handle(json('http://localhost/api/admin/users/target-1/points/adjustments', {
      amountCents: -50, reason: 'manual correction', idempotencyKey: 'adjustment-1',
    }))
    expect(response.status).toBe(200)
    expect(adjustments).toContainEqual(expect.objectContaining({ userId: 'target-1', actorUserId: 'admin-1', amountCents: -50 }))
    expect(audits).toContainEqual(expect.objectContaining({ action: 'points.adjustment', outcome: 'succeeded' }))
  })

  it('allows admins to grant points with actor and request identity', async () => {
    currentUser = { id: 'admin-1', role: 'admin' }
    const app = createTestApp({ authService: fakeAuthService, creditLedger: fakeCreditLedger, generationRepository: fakeGenerationRepository }).app
    const response = await app.handle(json(
      'http://localhost/api/admin/users/target-1/points/grants',
      { amountCents: 500, reason: '线上回归测试', idempotencyKey: 'grant-1' },
      { headers: { 'x-request-id': 'request-grant-1' } },
    ))
    const body = await response.json() as { success: true; data: { balance: CreditBalance } }

    expect(response.status).toBe(200)
    expect(body.data.balance.availableCents).toBe(500)
    expect(grants).toHaveLength(1)
    expect(grants[0]).toMatchObject({ userId: 'target-1', actorUserId: 'admin-1', requestId: 'request-grant-1' })
    expect(audits).toContainEqual(expect.objectContaining({ action: 'points.grant', outcome: 'succeeded', userId: 'admin-1', targetId: 'target-1' }))
  })

  it('maps credit idempotency conflicts to HTTP 409', async () => {
    currentUser = { id: 'admin-1', role: 'admin' }
    const conflictLedger: CreditLedger = {
      ...fakeCreditLedger,
      grant: async () => { throw new CreditLedgerError('POINTS_IDEMPOTENCY_CONFLICT', 'conflict') },
    }
    const app = createTestApp({ authService: fakeAuthService, creditLedger: conflictLedger, generationRepository: fakeGenerationRepository }).app
    const response = await app.handle(json('http://localhost/api/admin/users/target-1/points/grants', {
      amountCents: 100,
      reason: 'test account',
      idempotencyKey: 'grant-1',
    }))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(409)
    expect(body.error.code).toBe('POINTS_IDEMPOTENCY_CONFLICT')
  })

  it('rejects non-positive or malformed grants at the HTTP boundary', async () => {
    currentUser = { id: 'admin-1', role: 'admin' }
    const app = createTestApp({ authService: fakeAuthService, creditLedger: fakeCreditLedger, generationRepository: fakeGenerationRepository }).app
    const response = await app.handle(json('http://localhost/api/admin/users/target-1/points/grants', {
      amountCents: 0,
      reason: '',
      idempotencyKey: 'grant-invalid',
    }))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(grants).toHaveLength(0)
  })
})
