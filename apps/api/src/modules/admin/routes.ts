import { Elysia } from 'elysia'
import { AuthError } from '@bailian-studio/auth'
import type { CreditBalance } from '@bailian-studio/credit-ledger'
import type { AdminGalleryItem, GenerationArtifact } from '@bailian-studio/generation-repository'
import { createLogger, validateInput } from '@bailian-studio/shared'
import { listModels } from '@bailian-studio/model-core'
import { resolveLocalStoragePath } from '@bailian-studio/storage'
import type { ApiDependencies } from '../../dependencies'
import { contentTypeForPath } from '../../lib/artifact-content-types'
import { auditErrorCode, recordApiAuditEvent } from '../../lib/audit'
import { requestErrorResponseBody } from '../../lib/http-errors'
import { getRequestTrace } from '../../lib/middleware'
import { LocalFileTooLargeError, createLocalFileResponse } from '../../lib/local-file-response'
import { requireAdminUser } from '../auth/session'
import { resolveArtifactReadUrlUseCase } from '../artifacts/service'
import { ListAssetsQuerySchema } from '../assets/service'
import { assetWithReadUrl } from '../assets/routes'
import {
  AdminGalleryArtifactParamsSchema,
  AnalyticsQuerySchema,
  BatchGallerySchema,
  BatchGrantPointsSchema,
  BatchUsersSchema,
  CreateUserSchema,
  ListAdminGalleryQuerySchema,
  ListAdminTasksQuerySchema,
  ListUsersQuerySchema,
  TargetGalleryRecordSchema,
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
  const adminLogger = createLogger('admin-gallery')

  type AdminGalleryCoverResponse = { id: string; kind: string; readUrl?: string; thumbnailUrl?: string }

  /** admin 画廊封面：本地存储指向 admin 专属产物路由（不检查 hiddenAt，可预览已隐藏作品）。 */
  async function adminGalleryCover(item: AdminGalleryItem): Promise<AdminGalleryCoverResponse | undefined> {
    if (item.cover === undefined) return undefined
    const resolved = await resolveArtifactReadUrlUseCase({ storage: deps.storage }).execute({
      artifact: item.cover,
      localReadUrl: deps.storage.provider === 'local'
        ? `/api/admin/gallery/generations/${encodeURIComponent(item.id)}/artifacts/${encodeURIComponent(item.cover.id)}`
        : undefined,
    })
    return {
      id: item.cover.id,
      kind: item.cover.kind,
      ...(resolved.readUrl !== undefined ? { readUrl: resolved.readUrl } : {}),
      ...(resolved.thumbnailUrl !== undefined ? { thumbnailUrl: resolved.thumbnailUrl } : {}),
    }
  }

  type AdminGalleryArtifactResponse = { id: string; kind: string; readUrl?: string; thumbnailUrl?: string; text?: string }

  /** admin 画廊产物预览项：text 内联正文，其余走 read-url 解析（本地指向 admin 专属产物路由）。 */
  async function adminGalleryArtifactItem(
    recordId: string,
    artifact: GenerationArtifact,
  ): Promise<AdminGalleryArtifactResponse> {
    if (artifact.kind === 'text' && artifact.text !== undefined) {
      return { id: artifact.id, kind: artifact.kind, text: artifact.text }
    }
    if (artifact.storageKey === undefined) {
      return { id: artifact.id, kind: artifact.kind }
    }
    const resolved = await resolveArtifactReadUrlUseCase({ storage: deps.storage }).execute({
      artifact,
      localReadUrl: deps.storage.provider === 'local'
        ? `/api/admin/gallery/generations/${encodeURIComponent(recordId)}/artifacts/${encodeURIComponent(artifact.id)}`
        : undefined,
    })
    return {
      id: artifact.id,
      kind: artifact.kind,
      ...(resolved.readUrl !== undefined ? { readUrl: resolved.readUrl } : {}),
      ...(resolved.thumbnailUrl !== undefined ? { thumbnailUrl: resolved.thumbnailUrl } : {}),
    }
  }

  /**
   * 封禁联动：隐藏该用户全部公开作品（hygiene 层）。enforcement 由画廊查询的
   * `users.bannedAt` 过滤保证；这里让作品即使解封后也保持隐藏，需 admin 手动恢复。
   * best-effort：失败不阻断封禁（连接信息不进日志）。
   */
  async function hideUserPublicWorksBestEffort(userId: string, actorId: string): Promise<void> {
    try {
      await deps.generationRepository.hideUserPublicWorks({ userId, actorId })
    } catch (error) {
      adminLogger.warn('gallery.hide_public_works_failed', {
        userId,
        errorName: error instanceof Error ? error.name : 'unknown',
      })
    }
  }

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
        // 封禁联动：隐藏其公开作品（hygiene，见 hideUserPublicWorksBestEffort 注释）。
        await hideUserPublicWorksBestEffort(userId, actor.id)
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
      // P1-19：affected 返回 repository 实际生效行数，而非请求目标数。
      const affected = await deps.authService.adminBatchBanUsers(targets)
      // 封禁联动：批量隐藏其公开作品（hygiene）。
      for (const userId of targets) await hideUserPublicWorksBestEffort(userId, actor.id)
      await recordApiAuditEvent(deps.generationRepository, request, {
        userId: actor.id,
        action: 'admin.user.ban',
        outcome: 'succeeded',
        targetType: 'user',
        metadata: { count: affected, requested: targets.length, excludedSelf: userIds.length - targets.length },
      })
      return { success: true, data: { affected, requested: targets.length } }
    })
    .post('/api/admin/users/batch-unban', async ({ request, body }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { userIds } = validateInput(BatchUsersSchema, body)
      const targets = userIds.filter(id => id !== actor.id)
      if (targets.length === 0) {
        throw new AuthError('AUTH_FORBIDDEN', '批量操作不能包含自己的账号')
      }
      const affected = await deps.authService.adminBatchUnbanUsers(targets)
      await recordApiAuditEvent(deps.generationRepository, request, {
        userId: actor.id,
        action: 'admin.user.unban',
        outcome: 'succeeded',
        targetType: 'user',
        metadata: { count: affected, requested: targets.length },
      })
      return { success: true, data: { affected, requested: targets.length } }
    })
    .post('/api/admin/users/batch-delete', async ({ request, body }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { userIds } = validateInput(BatchUsersSchema, body)
      const targets = userIds.filter(id => id !== actor.id)
      if (targets.length === 0) {
        throw new AuthError('AUTH_FORBIDDEN', '批量操作不能包含自己的账号')
      }
      try {
        const affected = await deps.authService.adminBatchDeleteUsers(targets)
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.user.delete',
          outcome: 'succeeded',
          targetType: 'user',
          metadata: { count: affected, requested: targets.length, excludedSelf: userIds.length - targets.length },
        })
        return { success: true, data: { affected, requested: targets.length } }
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
      // P1-19：逐用户 try/catch，单个用户失败不拖垮整批——成功用户照常入账并随
      // 响应返回；响应同时带出失败用户 id，供前端精确提示。
      const results: Array<{ userId: string; balance: CreditBalance }> = []
      const failedUserIds: string[] = []
      for (const userId of input.userIds) {
        try {
          const result = await deps.creditLedger.grant({
            userId,
            amountCents: input.amountCents,
            reason: input.reason,
            idempotencyKey: `${input.idempotencyKey}:${userId}`,
            actorUserId: actor.id,
            ...(requestId !== undefined ? { requestId } : {}),
          })
          results.push({ userId, balance: result.balance })
        } catch {
          failedUserIds.push(userId)
        }
      }
      const failedCount = failedUserIds.length
      await recordApiAuditEvent(deps.generationRepository, request, {
        userId: actor.id,
        action: 'points.grant',
        outcome: failedCount === 0 ? 'succeeded' : 'failed',
        targetType: 'user',
        metadata: {
          granted: results.length,
          failed: failedCount,
          amountCents: input.amountCents,
          // AuditEventMetadataValue 只接受标量，失败 id 列表以逗号拼接落审计。
          ...(failedCount > 0 ? { failedUserIds: failedUserIds.join(',') } : {}),
        },
      })
      return { success: true, data: { granted: results.length, failed: failedUserIds, results } }
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
    // -----------------------------------------------------------------------
    // 任务中心：全量 task_records（含进行中 + 已完成），keyset 分页 + 过滤。
    // 只读排障视角，不写审计（列表类查询与画廊列表一致）。
    // -----------------------------------------------------------------------
    .get('/api/admin/tasks', async ({ request, query }) => {
      await requireAdminUser(request, deps.authService)
      const input = validateInput(ListAdminTasksQuerySchema, query)
      const page = await deps.generationRepository.listAdminTasks({
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.type !== undefined ? { type: input.type } : {}),
        ...(input.domain !== undefined ? { domain: input.domain } : {}),
        ...(input.userId !== undefined ? { userId: input.userId } : {}),
        ...(input.recordId !== undefined ? { recordId: input.recordId } : {}),
      })
      return {
        success: true,
        data: {
          items: page.items,
          ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}),
        },
      }
    })
    // -----------------------------------------------------------------------
    // 社区画廊治理：含隐藏作品的列表 + 下架/恢复 + 产物预览（admin 专属，绕过 hiddenAt）。
    // -----------------------------------------------------------------------
    .get('/api/admin/gallery', async ({ request, query }) => {
      await requireAdminUser(request, deps.authService)
      const input = validateInput(ListAdminGalleryQuerySchema, query)
      const page = await deps.generationRepository.listAdminGalleryGenerations({
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
        ...(input.includeHidden === 'true' ? { includeHidden: true } : {}),
        ...(input.q !== undefined && input.q.length > 0 ? { q: input.q } : {}),
        ...(input.authorId !== undefined ? { authorId: input.authorId } : {}),
      })
      const items = await Promise.all(page.items.map(async item => ({
        id: item.id,
        modelId: item.modelId,
        category: item.category,
        author: item.author,
        ...(item.cover !== undefined ? { cover: await adminGalleryCover(item) } : {}),
        likeCount: item.likeCount,
        visibility: item.visibility,
        status: item.status,
        ...(item.hiddenAt !== undefined ? { hiddenAt: item.hiddenAt, hiddenBy: item.hiddenBy } : {}),
        createdAt: item.createdAt,
      })))
      return {
        success: true,
        data: {
          items,
          ...(page.nextCursor !== undefined ? { nextCursor: page.nextCursor } : {}),
        },
      }
    })
    .get('/api/admin/gallery/:id/artifacts', async ({ request, params }) => {
      await requireAdminUser(request, deps.authService)
      const { id } = validateInput(TargetGalleryRecordSchema, params)
      const artifacts = await deps.generationRepository.listAdminGalleryRecordArtifacts({ recordId: id })
      const items = await Promise.all(artifacts.map(artifact => adminGalleryArtifactItem(id, artifact)))
      return { success: true, data: { items } }
    })
    .post('/api/admin/gallery/:id/hide', async ({ request, params }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { id } = validateInput(TargetGalleryRecordSchema, params)
      try {
        await deps.generationRepository.setGalleryRecordHidden({ recordId: id, hidden: true, actorId: actor.id })
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.gallery.hide',
          outcome: 'succeeded',
          targetType: 'generation',
          targetId: id,
        })
        return { success: true, data: { hidden: true } }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.gallery.hide',
          outcome: 'failed',
          targetType: 'generation',
          targetId: id,
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/api/admin/gallery/:id/unhide', async ({ request, params }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { id } = validateInput(TargetGalleryRecordSchema, params)
      try {
        await deps.generationRepository.setGalleryRecordHidden({ recordId: id, hidden: false, actorId: actor.id })
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.gallery.unhide',
          outcome: 'succeeded',
          targetType: 'generation',
          targetId: id,
        })
        return { success: true, data: { hidden: false } }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.gallery.unhide',
          outcome: 'failed',
          targetType: 'generation',
          targetId: id,
          metadata: { errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    // 批量治理：只对「实际状态翻转」的记录写成功审计（复用单条 action，不新增审计码）；
    // 失败分支只写一条汇总 failed 审计。
    .post('/api/admin/gallery/batch-hide', async ({ request, body }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { ids } = validateInput(BatchGallerySchema, body)
      try {
        const affected = await deps.generationRepository.setGalleryRecordsHidden({ recordIds: ids, hidden: true, actorId: actor.id })
        for (const id of affected) {
          await recordApiAuditEvent(deps.generationRepository, request, {
            userId: actor.id,
            action: 'admin.gallery.hide',
            outcome: 'succeeded',
            targetType: 'generation',
            targetId: id,
          })
        }
        return { success: true, data: { affected: affected.length } }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.gallery.hide',
          outcome: 'failed',
          targetType: 'generation',
          metadata: { count: ids.length, errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/api/admin/gallery/batch-unhide', async ({ request, body }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { ids } = validateInput(BatchGallerySchema, body)
      try {
        const affected = await deps.generationRepository.setGalleryRecordsHidden({ recordIds: ids, hidden: false, actorId: actor.id })
        for (const id of affected) {
          await recordApiAuditEvent(deps.generationRepository, request, {
            userId: actor.id,
            action: 'admin.gallery.unhide',
            outcome: 'succeeded',
            targetType: 'generation',
            targetId: id,
          })
        }
        return { success: true, data: { affected: affected.length } }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'admin.gallery.unhide',
          outcome: 'failed',
          targetType: 'generation',
          metadata: { count: ids.length, errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .post('/api/admin/gallery/batch-delete', async ({ request, body }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { ids } = validateInput(BatchGallerySchema, body)
      try {
        const affected = await deps.generationRepository.softDeleteGalleryRecords({ recordIds: ids, actorId: actor.id })
        for (const id of affected) {
          await recordApiAuditEvent(deps.generationRepository, request, {
            userId: actor.id,
            action: 'generation.delete',
            outcome: 'succeeded',
            targetType: 'generation',
            targetId: id,
            metadata: { libraryState: 'deleted', scope: 'admin.gallery.batch' },
          })
        }
        return { success: true, data: { affected: affected.length } }
      } catch (error) {
        await recordApiAuditEvent(deps.generationRepository, request, {
          userId: actor.id,
          action: 'generation.delete',
          outcome: 'failed',
          targetType: 'generation',
          metadata: { count: ids.length, errorCode: auditErrorCode(error) },
        })
        throw error
      }
    })
    .get('/api/admin/gallery/generations/:id/artifacts/:artifactId', async ({ request, params, set }) => {
      const actor = await requireAdminUser(request, deps.authService)
      const { id, artifactId } = validateInput(AdminGalleryArtifactParamsSchema, params)

      const artifact = await deps.generationRepository.getAdminGalleryArtifact({ recordId: id, artifactId })
      if (artifact === undefined || artifact.storageKey === undefined) {
        set.status = 404
        return requestErrorResponseBody(request, 'GALLERY_ARTIFACT_NOT_FOUND', 'Gallery artifact not found', set)
      }

      const storage = deps.storage
      if (storage.provider !== 'local') {
        const resolved = await resolveArtifactReadUrlUseCase({ storage }).execute({ artifact, expiresInSeconds: 300 })
        if (resolved.readUrl === undefined) {
          set.status = 404
          return requestErrorResponseBody(request, 'GALLERY_ARTIFACT_NOT_FOUND', 'Gallery artifact not found', set)
        }
        return Response.redirect(resolved.readUrl, 302)
      }

      let path: string
      try {
        path = resolveLocalStoragePath(deps.artifactLocalRoot, decodeURIComponent(artifact.storageKey))
      } catch (error) {
        set.status = 400
        return requestErrorResponseBody(
          request,
          'INVALID_ARTIFACT_KEY',
          error instanceof Error ? error.message : 'Invalid artifact key',
          set,
        )
      }

      try {
        return await createLocalFileResponse({
          path,
          maxBytes: deps.artifactConfig.maxReadBytes,
          contentType: artifact.mimeType ?? contentTypeForPath(path),
          cacheControl: 'private, max-age=300',
        })
      } catch (error) {
        const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined
        if (error instanceof LocalFileTooLargeError) set.status = 413
        else set.status = code === 'ENOENT' ? 404 : 500
        return requestErrorResponseBody(
          request,
          error instanceof LocalFileTooLargeError
            ? 'ARTIFACT_TOO_LARGE'
            : code === 'ENOENT' ? 'GALLERY_ARTIFACT_NOT_FOUND' : 'ARTIFACT_READ_FAILED',
          error instanceof LocalFileTooLargeError
            ? 'Artifact exceeds the maximum response size'
            : code === 'ENOENT' ? 'Gallery artifact not found' : 'Failed to read gallery artifact',
          set,
        )
      }
    })
}
