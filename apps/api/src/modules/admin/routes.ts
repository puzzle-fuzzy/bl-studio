import { Elysia } from 'elysia'
import { AuthError } from '@bailian-studio/auth'
import { validateInput } from '@bailian-studio/shared'
import { listModels } from '@bailian-studio/model-core'
import type { ApiDependencies } from '../../dependencies'
import { auditErrorCode, recordApiAuditEvent } from '../../lib/audit'
import { requireAdminUser } from '../auth/session'
import { ListAssetsQuerySchema } from '../assets/service'
import { assetWithReadUrl } from '../assets/routes'
import { CreateUserSchema, ListUsersQuerySchema, TargetUserSchema, UpdateUserSchema } from './schemas'

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
}
