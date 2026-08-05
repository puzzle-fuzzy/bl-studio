import { Elysia } from 'elysia'
import { AuthError } from '@bailian-studio/auth'
import { validateInput } from '@bailian-studio/shared'
import { listModels } from '@bailian-studio/model-core'
import type { ApiDependencies } from '../../dependencies'
import { auditErrorCode, recordApiAuditEvent } from '../../lib/audit'
import { getRequestTrace } from '../../lib/middleware'
import { requireAdminUser } from '../auth/session'
import { ListAssetsQuerySchema } from '../assets/service'
import { assetWithReadUrl } from '../assets/routes'
import {
  AnalyticsQuerySchema,
  BatchGrantPointsSchema,
  BatchUsersSchema,
  CreateUserSchema,
  ListUsersQuerySchema,
  TargetUserSchema,
  UpdateUserSchema,
  UpsertModelCostsSchema,
} from './schemas'

/**
 * 管理后台模块：用户管理（创建/列表/详情/改/软删）+ 查看指定用户全部资产。
 * 全部端点要求 `requireAdminUser`；积分相关端点已存在于 points 模块
 * （/api/admin/users/:userId/points、/points/grants 等），此处不重复。
 *
 * 安全红线：不能改/删自己的管理员身份（防运营事故）。
 */
export function createAdminRoutes(deps: ApiDependencies) {
  return new Elysia()
    .get('/api/admin/users', async ({ request, query }) => {
      await requireAdminUser(request, deps.authService)
      const input = validateInput(ListUsersQuerySchema, query)
      const page = await deps.authService.listActiveUsers(input)
      return { success: true, data: page }
    })
    .post('/api/admin/users', async ({ request, body }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const input = validateInput(CreateUserSchema, body)
      try {
        const user = await deps.authService.adminCreateUser(input)
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.user.create',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: user.id,
          metadata: { role: user.role },
        })
        return { success: true, data: { user } }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.user.create',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .get('/api/admin/users/:userId', async ({ request, params }) => {
      await requireAdminUser(request, deps.authService)
      const { userId } = validateInput(TargetUserSchema, params)
      const user = await deps.authService.adminGetUser(userId)
      const balance = await deps.creditLedger.getBalance({ userId })
      return { success: true, data: { user, balance } }
    })
    .patch('/api/admin/users/:userId', async ({ request, params, body }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { userId } = validateInput(TargetUserSchema, params)
      const input = validateInput(UpdateUserSchema, body)
      // 防事故：不允许移除自己的管理员角色。
      if (actor.id === userId && input.role === 'user') {
        throw new AuthError('AUTH_FORBIDDEN', '不能移除自己的管理员权限')
      }
      try {
        const user = await deps.authService.adminUpdateUser(userId, input)
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.user.update',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: userId,
          ...(input.role !== undefined ? { metadata: { role: input.role } } : {}),
        })
        return { success: true, data: { user } }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.user.update',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .delete('/api/admin/users/:userId', async ({ request, params }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { userId } = validateInput(TargetUserSchema, params)
      // 防事故：不允许删除自己的账号。
      if (actor.id === userId) {
        throw new AuthError('AUTH_FORBIDDEN', '不能删除自己的账号')
      }
      try {
        await deps.authService.softDeleteUser(userId)
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.user.delete',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: userId,
        })
        return new Response(null, { status: 204 })
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.user.delete',
          outcome: 'failed',
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/api/admin/users/:userId/ban', async ({ request, params }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { userId } = validateInput(TargetUserSchema, params)
      if (actor.id === userId) {
        throw new AuthError('AUTH_FORBIDDEN', '不能封禁自己的账号')
      }
      try {
        await deps.authService.adminBanUser(userId)
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.user.ban',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: userId,
        })
        return { success: true, data: null }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.user.ban',
          outcome: 'failed',
          targetType: 'user',
          targetId: userId,
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/api/admin/users/:userId/unban', async ({ request, params }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { userId } = validateInput(TargetUserSchema, params)
      try {
        await deps.authService.adminUnbanUser(userId)
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.user.unban',
          outcome: 'succeeded',
          targetType: 'user',
          targetId: userId,
        })
        return { success: true, data: null }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.user.unban',
          outcome: 'failed',
          targetType: 'user',
          targetId: userId,
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/api/admin/users/batch-ban', async ({ request, body }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { userIds } = validateInput(BatchUsersSchema, body)
      const targets = userIds.filter(id => id !== actor.id)
      if (targets.length === 0) {
        throw new AuthError('AUTH_FORBIDDEN', '批量操作不能包含自己的账号')
      }
      await deps.authService.adminBatchBanUsers(targets)
      await recordApiAuditEvent(deps.generationRepository, request, {
        userId: actor.id,
        action: 'admin.user.ban',
        outcome: 'succeeded',
        targetType: 'user',
        metadata: { count: targets.length, excludedSelf: userIds.length - targets.length },
      })
      return { success: true, data: { affected: targets.length } }
    })
    .post('/api/admin/users/batch-unban', async ({ request, body }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { userIds } = validateInput(BatchUsersSchema, body)
      const targets = userIds.filter(id => id !== actor.id)
      if (targets.length === 0) {
        throw new AuthError('AUTH_FORBIDDEN', '批量操作不能包含自己的账号')
      }
      await deps.authService.adminBatchUnbanUsers(targets)
      await recordApiAuditEvent(deps.generationRepository, request, {
        userId: actor.id,
        action: 'admin.user.unban',
        outcome: 'succeeded',
        targetType: 'user',
        metadata: { count: targets.length },
      })
      return { success: true, data: { affected: targets.length } }
    })
    .post('/api/admin/users/batch-delete', async ({ request, body }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { userIds } = validateInput(BatchUsersSchema, body)
      const targets = userIds.filter(id => id !== actor.id)
      if (targets.length === 0) {
        throw new AuthError('AUTH_FORBIDDEN', '批量操作不能包含自己的账号')
      }
      try {
        await deps.authService.adminBatchDeleteUsers(targets)
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.user.delete',
          outcome: 'succeeded',
          targetType: 'user',
          metadata: { count: targets.length, excludedSelf: userIds.length - targets.length },
        })
        return { success: true, data: { affected: targets.length } }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.user.delete',
          outcome: 'failed',
          targetType: 'user',
          metadata: { count: targets.length, errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/api/admin/users/batch-grant-points', async ({ request, body }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const input = validateInput(BatchGrantPointsSchema, body)
      const requestId = getRequestTrace(request)?.requestId
      try {
        const results = await Promise.all(input.userIds.map(async userId => {
          const result = await deps.creditLedger.grant({
            userId,
            amountCents: input.amountCents,
            reason: input.reason,
            idempotencyKey: `${input.idempotencyKey}:${userId}`,
            actorUserId: actor.id,
            ...(requestId !== undefined ? { requestId } : {}),
          })
          return { userId, balance: result.balance }
        }))
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'points.grant',
          outcome: 'succeeded',
          targetType: 'user',
          metadata: { count: input.userIds.length, amountCents: input.amountCents },
        })
        return { success: true, data: { granted: input.userIds.length, results } }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'points.grant',
          outcome: 'failed',
          targetType: 'user',
          metadata: { count: input.userIds.length, amountCents: input.amountCents, errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .get('/api/admin/users/:userId/assets', async ({ request, params, query }) => {
      await requireAdminUser(request, deps.authService)
      const { userId } = validateInput(TargetUserSchema, params)
      const { limit, cursor, kind, source, q, sort } = validateInput(ListAssetsQuerySchema, query)
      const normalizedQuery = q?.toLocaleLowerCase()
      const modelIds = normalizedQuery === undefined || normalizedQuery.length === 0
        ? []
        : listModels()
            .filter(model => model.displayName.toLocaleLowerCase().includes(normalizedQuery))
            .map(model => model.id)
      const data = await deps.generationRepository.listUnifiedAssets(userId, {
        sort,
        ...(limit !== undefined ? { limit } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
        ...(kind !== undefined ? { kind } : {}),
        ...(source !== undefined ? { source } : {}),
        ...(q !== undefined && q.length > 0 ? { q, modelIds } : {}),
      })
      const items = await Promise.all(data.items.map(item => assetWithReadUrl(item, deps.storage)))
      return { success: true, data: { ...data, items } }
    })
    .get('/api/admin/stats/overview', async ({ request }) => {
      await requireAdminUser(request, deps.authService)
      const now = new Date()
      const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      const since14d = new Date(startOfToday.getTime() - 13 * 86_400_000)
      const [calls, userStats] = await Promise.all([
        deps.generationRepository.countGenerationCallsBetween(startOfToday.toISOString(), now.toISOString()),
        deps.authService.adminStats({ since: since14d.toISOString(), until: now.toISOString() }),
      ])
      const modelLabels = new Map(listModels().map(model => [model.id, model.displayName]))
      const todayStr = startOfToday.toISOString().slice(0, 10)
      return {
        success: true,
        data: {
          todayCalls: calls.total,
          callsByModel: calls.byModel.map(({ modelId, count }) => ({
            modelId,
            label: modelLabels.get(modelId) ?? modelId,
            count,
          })),
          callsByHour: calls.byHour,
          registrationsByDay: userStats.registrationsByDay,
          todayNewUsers: userStats.registrationsByDay.find(row => row.date === todayStr)?.count ?? 0,
          totalUsers: userStats.totalUsers,
        },
      }
    })
    .get('/api/admin/model-costs', async ({ request }) => {
      await requireAdminUser(request, deps.authService)
      const costs = await deps.generationRepository.listModelCosts()
      return { success: true, data: { costs } }
    })
    .put('/api/admin/model-costs', async ({ request, body }) => {
      await requireAdminUser(request, deps.authService)
      const { entries } = validateInput(UpsertModelCostsSchema, body)
      await deps.generationRepository.upsertModelCosts(entries)
      return { success: true, data: { updated: entries.length } }
    })
    .get('/api/admin/stats/analytics', async ({ request, query }) => {
      await requireAdminUser(request, deps.authService)
      const input = validateInput(AnalyticsQuerySchema, query)
      const to = input.to !== undefined ? new Date(input.to) : new Date()
      const days = input.days ?? 30
      const from = input.from !== undefined ? new Date(input.from) : new Date(to.getTime() - (days - 1) * 86_400_000)
      const sinceIso = from.toISOString()
      const toIso = to.toISOString()
      const [costMargin, retention, userStats] = await Promise.all([
        deps.generationRepository.getCostMarginAnalytics({ from: sinceIso, to: toIso }),
        deps.generationRepository.getRetentionAnalytics({ since: sinceIso }),
        deps.authService.adminStats({ since: sinceIso, until: toIso }),
      ])
      const registered = userStats.registrationsByDay.reduce((sum, row) => sum + row.count, 0)
      const modelLabels = new Map(listModels().map(model => [model.id, model.displayName]))
      return {
        success: true,
        data: {
          window: { from: sinceIso, to: toIso },
          costMargin: costMargin.map(row => ({
            ...row,
            label: modelLabels.get(row.modelId) ?? row.modelId,
          })),
          retention: { registered, ...retention },
        },
      }
    })
}
