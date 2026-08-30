import { Elysia } from 'elysia'
import { z } from 'zod'
import { validateInput } from '@bailian-studio/shared'
import { getRequestTrace } from '../../lib/middleware'
import { auditErrorCode, recordApiAuditEvent } from '../../lib/audit'
import type { ApiDependencies } from '../../dependencies'
import { requireAdminUser, requireAuthUser } from '../auth/session'
import { AdjustPointsSchema, GrantPointsSchema, ListPointsLedgerQuerySchema } from './schemas'

const TargetUserSchema = z.object({ userId: z.string().trim().min(1).max(256) }).strict()

export function createPointsRoutes(deps: ApiDependencies) {
  return new Elysia()
    .get('/api/account/points', async ({ request }) => {
      const user = await requireAuthUser(request, deps.authService)
      const balance = await deps.creditLedger.getBalance({ userId: user.id })
      return { success: true, data: { balance } }
    })
    .get('/api/account/points/ledger', async ({ request, query }) => {
      const user = await requireAuthUser(request, deps.authService)
      const input = validateInput(ListPointsLedgerQuerySchema, query)
      const page = await deps.creditLedger.listEntries({
        userId: user.id,
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
      })
      return { success: true, data: page }
    })
    .get('/api/admin/users/:userId/points', async ({ request, params }) => {
      await requireAdminUser(request, deps.authService)
      const { userId } = validateInput(TargetUserSchema, params)
      const balance = await deps.creditLedger.getBalance({ userId })
      return { success: true, data: { balance } }
    })
    .get('/api/admin/users/:userId/points/ledger', async ({ request, params, query }) => {
      await requireAdminUser(request, deps.authService)
      const { userId } = validateInput(TargetUserSchema, params)
      const input = validateInput(ListPointsLedgerQuerySchema, query)
      const page = await deps.creditLedger.listEntries({
        userId,
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
      })
      return { success: true, data: page }
    })
    .get('/api/admin/points/reconciliation', async ({ request }) => {
      await requireAdminUser(request, deps.authService)
      const report = await deps.creditLedger.reconcile()
      return { success: true, data: report }
    })
    .post('/api/admin/users/:userId/points/grants', async ({ request, params, body }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { userId } = validateInput(TargetUserSchema, params)
      const input = validateInput(GrantPointsSchema, body)
      const requestId = getRequestTrace(request)?.requestId

      try {
        const result = await deps.creditLedger.grant({
          userId,
          amountCents: input.amountCents,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
          actorUserId: actor.id,
          ...(requestId !== undefined ? { requestId } : {}),
        })
        await recordApiAuditEvent(deps.auditRepository, request, {
          userId: actor.id,
          action: 'points.grant',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: userId,
          metadata: { amountCents: input.amountCents },
        })
        return { success: true, data: { balance: result.balance, entry: result.entry } }
      } catch (error) {
        await recordApiAuditEvent(deps.auditRepository, request, {
          userId: actor.id,
          action: 'points.grant',
          outcome: 'failed',
          targetType: 'user',
          targetId: userId,
          metadata: { amountCents: input.amountCents, errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/api/admin/users/:userId/points/adjustments', async ({ request, params, body }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { userId } = validateInput(TargetUserSchema, params)
      const input = validateInput(AdjustPointsSchema, body)
      const requestId = getRequestTrace(request)?.requestId
      const result = await deps.creditLedger.adjust({
        userId,
        amountCents: input.amountCents,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        actorUserId: actor.id,
        ...(requestId !== undefined ? { requestId } : {}),
      })
      await recordApiAuditEvent(deps.auditRepository, request, {
        userId: actor.id,
        action: 'points.adjustment',
        outcome: 'succeeded',
        targetType: 'user',
        targetId: userId,
        metadata: { amountCents: input.amountCents, reason: input.reason },
      })
      return { success: true, data: { balance: result.balance, entry: result.entry } }
    })
}
