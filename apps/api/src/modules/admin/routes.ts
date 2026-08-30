import { AuthError } from '@bailian-studio/auth'
import type { CreditBalance } from '@bailian-studio/credit-ledger'
import { listModels } from '@bailian-studio/model-core'
import { createLogger, validateInput } from '@bailian-studio/shared'
import { resolveLocalStoragePath } from '@bailian-studio/storage'
import { Elysia } from 'elysia'
import type { ApiDependencies } from '../../dependencies'
import { contentTypeForPath } from '../../lib/artifact-content-types'
import { auditErrorCode, recordApiAuditEvent } from '../../lib/audit'
import { requestErrorResponseBody } from '../../lib/http-errors'
import {
  createLocalFileResponse,
  LocalFileTooLargeError,
} from '../../lib/local-file-response'
import { getRequestTrace } from '../../lib/middleware'
import { resolveArtifactReadUrlUseCase } from '../artifacts/service'
import { assetWithReadUrl, ListAssetsQuerySchema } from '../assets/service'
import { requireAdminUser } from '../auth/session'
import { resolveGalleryArtifact, resolveGalleryCover } from '../gallery/service'
import {
  AdminGalleryArtifactParamsSchema,
  AdminTaskParamsSchema,
  AnalyticsQuerySchema,
  AuditOutboxEventParamsSchema,
  BatchGallerySchema,
  BatchGrantPointsSchema,
  BatchUsersSchema,
  CreateUserSchema,
  ListAdminGalleryQuerySchema,
  ListAdminTasksQuerySchema,
  ListFailedAuditOutboxQuerySchema,
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

  /** admin 画廊封面：本地存储指向 admin 专属产物路由（不检查 hiddenAt，可预览已隐藏作品）。 */

  /** admin 画廊产物预览项：text 内联正文，其余走 read-url 解析（本地指向 admin 专属产物路由）。 */
  /**
   * 封禁联动：隐藏该用户全部公开作品（hygiene 层）。enforcement 由画廊查询的
   * `users.bannedAt` 过滤保证；这里让作品即使解封后也保持隐藏，需 admin 手动恢复。
   * best-effort：失败不阻断封禁（连接信息不进日志）。
   */
  async function hideUserPublicWorksBestEffort(
    userId: string,
    actorId: string,
  ): Promise<void> {
    try {
      await deps.adminRepository.gallery.hideUserPublicWorks({
        userId,
        actorId,
      })
    } catch (error) {
      adminLogger.warn('gallery.hide_public_works_failed', {
        userId,
        errorName: error instanceof Error ? error.name : 'unknown',
      })
    }
  }

  return (
    new Elysia()
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
          await recordApiAuditEvent(deps.auditRepository, request, {
            userId: actor.id,
            action: 'admin.user.create',
            outcome: 'succeeded',
            targetType: 'user',
            targetId: user.id,
            metadata: { role: user.role },
          })
          return { success: true, data: { user } }
        } catch (error) {
          await recordApiAuditEvent(deps.auditRepository, request, {
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
          await recordApiAuditEvent(deps.auditRepository, request, {
            userId: actor.id,
            action: 'admin.user.update',
            outcome: 'succeeded',
            targetType: 'user',
            targetId: userId,
            ...(input.role !== undefined
              ? { metadata: { role: input.role } }
              : {}),
          })
          return { success: true, data: { user } }
        } catch (error) {
          await recordApiAuditEvent(deps.auditRepository, request, {
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
          await recordApiAuditEvent(deps.auditRepository, request, {
            userId: actor.id,
            action: 'admin.user.delete',
            outcome: 'succeeded',
            targetType: 'user',
            targetId: userId,
          })
          return new Response(null, { status: 204 })
        } catch (error) {
          await recordApiAuditEvent(deps.auditRepository, request, {
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
          await recordApiAuditEvent(deps.auditRepository, request, {
            userId: actor.id,
            action: 'admin.user.ban',
            outcome: 'succeeded',
            targetType: 'user',
            targetId: userId,
          })
          return { success: true, data: null }
        } catch (error) {
          await recordApiAuditEvent(deps.auditRepository, request, {
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
          await recordApiAuditEvent(deps.auditRepository, request, {
            userId: actor.id,
            action: 'admin.user.unban',
            outcome: 'succeeded',
            targetType: 'user',
            targetId: userId,
          })
          return { success: true, data: null }
        } catch (error) {
          await recordApiAuditEvent(deps.auditRepository, request, {
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
        const targets = userIds.filter((id) => id !== actor.id)
        if (targets.length === 0) {
          throw new AuthError('AUTH_FORBIDDEN', '批量操作不能包含自己的账号')
        }
        // P1-19：affected 返回 repository 实际生效行数，而非请求目标数。
        const affected = await deps.authService.adminBatchBanUsers(targets)
        // 封禁联动：批量隐藏其公开作品（hygiene）。
        for (const userId of targets)
          await hideUserPublicWorksBestEffort(userId, actor.id)
        await recordApiAuditEvent(deps.auditRepository, request, {
          userId: actor.id,
          action: 'admin.user.ban',
          outcome: 'succeeded',
          targetType: 'user',
          metadata: {
            count: affected,
            requested: targets.length,
            excludedSelf: userIds.length - targets.length,
          },
        })
        return { success: true, data: { affected, requested: targets.length } }
      })
      .post('/api/admin/users/batch-unban', async ({ request, body }) => {
        const actor = await requireAdminUser(request, deps.authService)
        const { userIds } = validateInput(BatchUsersSchema, body)
        const targets = userIds.filter((id) => id !== actor.id)
        if (targets.length === 0) {
          throw new AuthError('AUTH_FORBIDDEN', '批量操作不能包含自己的账号')
        }
        const affected = await deps.authService.adminBatchUnbanUsers(targets)
        await recordApiAuditEvent(deps.auditRepository, request, {
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
        const targets = userIds.filter((id) => id !== actor.id)
        if (targets.length === 0) {
          throw new AuthError('AUTH_FORBIDDEN', '批量操作不能包含自己的账号')
        }
        try {
          const affected = await deps.authService.adminBatchDeleteUsers(targets)
          await recordApiAuditEvent(deps.auditRepository, request, {
            userId: actor.id,
            action: 'admin.user.delete',
            outcome: 'succeeded',
            targetType: 'user',
            metadata: {
              count: affected,
              requested: targets.length,
              excludedSelf: userIds.length - targets.length,
            },
          })
          return {
            success: true,
            data: { affected, requested: targets.length },
          }
        } catch (error) {
          await recordApiAuditEvent(deps.auditRepository, request, {
            userId: actor.id,
            action: 'admin.user.delete',
            outcome: 'failed',
            targetType: 'user',
            metadata: {
              count: targets.length,
              errorCode: auditErrorCode(error),
            },
          })
          throw error
        }
      })
      .post(
        '/api/admin/users/batch-grant-points',
        async ({ request, body }) => {
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
          await recordApiAuditEvent(deps.auditRepository, request, {
            userId: actor.id,
            action: 'points.grant',
            outcome: failedCount === 0 ? 'succeeded' : 'failed',
            targetType: 'user',
            metadata: {
              granted: results.length,
              failed: failedCount,
              amountCents: input.amountCents,
              // AuditEventMetadataValue 只接受标量，失败 id 列表以逗号拼接落审计。
              ...(failedCount > 0
                ? { failedUserIds: failedUserIds.join(',') }
                : {}),
            },
          })
          return {
            success: true,
            data: { granted: results.length, failed: failedUserIds, results },
          }
        },
      )
      .get(
        '/api/admin/users/:userId/assets',
        async ({ request, params, query }) => {
          await requireAdminUser(request, deps.authService)
          const { userId } = validateInput(TargetUserSchema, params)
          const { limit, cursor, kind, source, q, sort } = validateInput(
            ListAssetsQuerySchema,
            query,
          )
          const normalizedQuery = q?.toLocaleLowerCase()
          const modelIds =
            normalizedQuery === undefined || normalizedQuery.length === 0
              ? []
              : listModels()
                  .filter((model) =>
                    model.displayName
                      .toLocaleLowerCase()
                      .includes(normalizedQuery),
                  )
                  .map((model) => model.id)
          const data = await deps.assetRepository.listUnifiedAssets(userId, {
            sort,
            ...(limit !== undefined ? { limit } : {}),
            ...(cursor !== undefined ? { cursor } : {}),
            ...(kind !== undefined ? { kind } : {}),
            ...(source !== undefined ? { source } : {}),
            ...(q !== undefined && q.length > 0 ? { q, modelIds } : {}),
          })
          const items = await Promise.all(
            data.items.map((item) => assetWithReadUrl(item, deps.storage)),
          )
          return { success: true, data: { ...data, items } }
        },
      )
      .get('/api/admin/stats/overview', async ({ request }) => {
        await requireAdminUser(request, deps.authService)
        const now = new Date()
        const startOfToday = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
        )
        const since14d = new Date(startOfToday.getTime() - 13 * 86_400_000)
        const [calls, userStats] = await Promise.all([
          deps.adminRepository.analytics.countGenerationCallsBetween(
            startOfToday.toISOString(),
            now.toISOString(),
          ),
          deps.authService.adminStats({
            since: since14d.toISOString(),
            until: now.toISOString(),
          }),
        ])
        const modelLabels = new Map(
          listModels().map((model) => [model.id, model.displayName]),
        )
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
            todayNewUsers:
              userStats.registrationsByDay.find((row) => row.date === todayStr)
                ?.count ?? 0,
            totalUsers: userStats.totalUsers,
          },
        }
      })
      .get('/api/admin/model-costs', async ({ request }) => {
        await requireAdminUser(request, deps.authService)
        const costs = await deps.adminRepository.analytics.listModelCosts()
        return { success: true, data: { costs } }
      })
      .put('/api/admin/model-costs', async ({ request, body }) => {
        await requireAdminUser(request, deps.authService)
        const { entries } = validateInput(UpsertModelCostsSchema, body)
        await deps.adminRepository.analytics.upsertModelCosts(entries)
        return { success: true, data: { updated: entries.length } }
      })
      .get('/api/admin/stats/analytics', async ({ request, query }) => {
        await requireAdminUser(request, deps.authService)
        const input = validateInput(AnalyticsQuerySchema, query)
        const to = input.to !== undefined ? new Date(input.to) : new Date()
        const days = input.days ?? 30
        const from =
          input.from !== undefined
            ? new Date(input.from)
            : new Date(to.getTime() - (days - 1) * 86_400_000)
        const sinceIso = from.toISOString()
        const toIso = to.toISOString()
        const [costMargin, retention, canvas, canvasOperations, userStats] = await Promise.all([
          deps.adminRepository.analytics.getCostMarginAnalytics({
            from: sinceIso,
            to: toIso,
          }),
          deps.adminRepository.analytics.getRetentionAnalytics({ since: sinceIso }),
          deps.adminRepository.analytics.getCanvasCostAnalytics({
            from: sinceIso,
            to: toIso,
          }),
          deps.adminRepository.analytics.getCanvasOperationsAnalytics({
            from: sinceIso,
            to: toIso,
          }),
          deps.authService.adminStats({ since: sinceIso, until: toIso }),
        ])
        const registered = userStats.registrationsByDay.reduce(
          (sum, row) => sum + row.count,
          0,
        )
        const modelLabels = new Map(
          listModels().map((model) => [model.id, model.displayName]),
        )
        return {
          success: true,
          data: {
            window: { from: sinceIso, to: toIso },
            costMargin: costMargin.map((row) => ({
              ...row,
              label: modelLabels.get(row.modelId) ?? row.modelId,
            })),
            retention: { registered, ...retention },
            canvas: {
              ...canvas,
              operations: canvasOperations,
              byModel: canvas.byModel.map((row) => ({
                ...row,
                label: modelLabels.get(row.modelId) ?? row.modelId,
              })),
            },
          },
        }
      })
      // 审计 outbox 运营恢复：仅管理员可见；列表只返回脱敏摘要，重放只接受终态 failed。
      .get('/api/admin/audit/outbox/failed', async ({ request, query }) => {
        await requireAdminUser(request, deps.authService)
        const input = validateInput(ListFailedAuditOutboxQuerySchema, query)
        const items = await deps.auditOutboxRepository.listFailed({
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
          ...(input.before !== undefined ? { before: input.before } : {}),
        })
        const pageSize = input.limit ?? 25
        const nextBefore =
          items.length === pageSize ? items.at(-1)?.updatedAt : undefined
        return {
          success: true,
          data: {
            items,
            ...(nextBefore !== undefined ? { nextBefore } : {}),
          },
        }
      })
      .post(
        '/api/admin/audit/outbox/:eventId/requeue',
        async ({ request, params, set }) => {
          const actor = await requireAdminUser(request, deps.authService)
          const { eventId } = validateInput(
            AuditOutboxEventParamsSchema,
            params,
          )
          try {
            const result = await deps.auditOutboxRepository.requeueFailed({
              eventId,
              operatorId: actor.id,
              now: new Date().toISOString(),
            })
            if (result.status === 'not_found') {
              set.status = 404
              return requestErrorResponseBody(
                request,
                'AUDIT_OUTBOX_NOT_FOUND',
                'Audit outbox event not found',
                set,
              )
            }
            if (result.status === 'not_failed') {
              set.status = 409
              return requestErrorResponseBody(
                request,
                'AUDIT_OUTBOX_NOT_FAILED',
                'Only failed audit outbox events can be requeued',
                set,
              )
            }
            await recordApiAuditEvent(deps.auditRepository, request, {
              userId: actor.id,
              action: 'admin.audit.outbox.requeue',
              outcome: 'succeeded',
              targetType: 'audit_event_outbox',
              targetId: eventId,
            })
            return { success: true, data: { event: result.event } }
          } catch (error) {
            await recordApiAuditEvent(deps.auditRepository, request, {
              userId: actor.id,
              action: 'admin.audit.outbox.requeue',
              outcome: 'failed',
              targetType: 'audit_event_outbox',
              targetId: eventId,
              metadata: { errorCode: auditErrorCode(error) },
            })
            throw error
          }
        },
      )
      // -----------------------------------------------------------------------
      // 任务中心：全量 task_records（含进行中 + 已完成），keyset 分页 + 过滤。
      // 只读排障视角，不写审计（列表类查询与画廊列表一致）。
      // -----------------------------------------------------------------------
      .get('/api/admin/tasks', async ({ request, query }) => {
        await requireAdminUser(request, deps.authService)
        const input = validateInput(ListAdminTasksQuerySchema, query)
        const page = await deps.adminRepository.tasks.listAdminTasks({
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
            ...(page.nextCursor !== undefined
              ? { nextCursor: page.nextCursor }
              : {}),
          },
        }
      })
      // 任务详情请求上下文：按需读取，避免在任务列表中泄露私有提示词或放大分页负载。
      .get(
        '/api/admin/tasks/:id/request-context',
        async ({ request, params, set }) => {
          await requireAdminUser(request, deps.authService)
          const { id } = validateInput(AdminTaskParamsSchema, params)
          const requestContext =
            await deps.adminRepository.tasks.getAdminTaskRequestContext(id)
          if (requestContext === undefined) {
            set.status = 404
            return requestErrorResponseBody(
              request,
              'TASK_NOT_FOUND',
              `Task not found: ${id}`,
              set,
            )
          }

          if (requestContext.canvas !== undefined) {
            const assets = await Promise.all(
              requestContext.canvas.assets.map(async (asset) =>
                assetWithReadUrl(
                  asset as Parameters<typeof assetWithReadUrl>[0],
                  deps.storage,
                ),
              ),
            )
            return {
              success: true,
              data: {
                context: {
                  kind: 'canvas' as const,
                  ...requestContext.canvas,
                  assets,
                },
              },
            }
          }

          const record = requestContext.record
          if (record === undefined) {
            return { success: true, data: { context: null } }
          }

          const inputAssets = await Promise.all(
            record.inputAssets.map(async (inputAsset) => {
              const asset = await deps.assetRepository.getUserAsset({
                userId: inputAsset.userId,
                assetId: inputAsset.assetId,
                includeDeleted: true,
              })
              if (asset === undefined) {
                return {
                  parameterName: inputAsset.parameterName,
                  position: inputAsset.position,
                  asset: {
                    id: inputAsset.assetId,
                    kind: inputAsset.kind,
                    source: inputAsset.source,
                  },
                }
              }

              const readable = await assetWithReadUrl(asset, deps.storage)
              return {
                parameterName: inputAsset.parameterName,
                position: inputAsset.position,
                asset: {
                  id: readable.id,
                  kind: readable.kind,
                  source: readable.source,
                  ...(readable.url !== undefined ? { url: readable.url } : {}),
                  ...('thumbnailUrl' in readable &&
                  readable.thumbnailUrl !== undefined
                    ? { thumbnailUrl: readable.thumbnailUrl }
                    : {}),
                  ...(readable.fileName !== undefined
                    ? { fileName: readable.fileName }
                    : {}),
                },
              }
            }),
          )

          return {
            success: true,
            data: {
              context: {
                recordId: record.id,
                modelId: record.modelId,
                category: record.category,
                inputParams: record.inputParams,
                inputAssets,
              },
            },
          }
        },
      )
      // -----------------------------------------------------------------------
      // 社区画廊治理：含隐藏作品的列表 + 下架/恢复 + 产物预览（admin 专属，绕过 hiddenAt）。
      // -----------------------------------------------------------------------
      .get('/api/admin/gallery', async ({ request, query }) => {
        await requireAdminUser(request, deps.authService)
        const input = validateInput(ListAdminGalleryQuerySchema, query)
        const page =
          await deps.adminRepository.gallery.listAdminGalleryGenerations({
            ...(input.limit !== undefined ? { limit: input.limit } : {}),
            ...(input.cursor !== undefined ? { cursor: input.cursor } : {}),
            ...(input.includeHidden === 'true' ? { includeHidden: true } : {}),
            ...(input.q !== undefined && input.q.length > 0
              ? { q: input.q }
              : {}),
            ...(input.authorId !== undefined
              ? { authorId: input.authorId }
              : {}),
          })
        const items = await Promise.all(
          page.items.map(async (item) => ({
            id: item.id,
            modelId: item.modelId,
            category: item.category,
            author: item.author,
            ...(item.cover !== undefined
              ? {
                  cover: await resolveGalleryCover(item, {
                    storage: deps.storage,
                    localUrlPrefix: '/api/admin/gallery',
                  }),
                }
              : {}),
            likeCount: item.likeCount,
            visibility: item.visibility,
            status: item.status,
            ...(item.hiddenAt !== undefined
              ? { hiddenAt: item.hiddenAt, hiddenBy: item.hiddenBy }
              : {}),
            createdAt: item.createdAt,
          })),
        )
        return {
          success: true,
          data: {
            items,
            ...(page.nextCursor !== undefined
              ? { nextCursor: page.nextCursor }
              : {}),
          },
        }
      })
      .get('/api/admin/gallery/:id/artifacts', async ({ request, params }) => {
        await requireAdminUser(request, deps.authService)
        const { id } = validateInput(TargetGalleryRecordSchema, params)
        const artifacts =
          await deps.adminRepository.gallery.listAdminGalleryRecordArtifacts({
            recordId: id,
          })
        const items = await Promise.all(
          artifacts.map((artifact) =>
            resolveGalleryArtifact(id, artifact, {
              storage: deps.storage,
              localUrlPrefix: '/api/admin/gallery',
            }),
          ),
        )
        return { success: true, data: { items } }
      })
      .post('/api/admin/gallery/:id/hide', async ({ request, params }) => {
        const actor = await requireAdminUser(request, deps.authService)
        const { id } = validateInput(TargetGalleryRecordSchema, params)
        try {
          await deps.adminRepository.gallery.setGalleryRecordHidden({
            recordId: id,
            hidden: true,
            actorId: actor.id,
          })
          await recordApiAuditEvent(deps.auditRepository, request, {
            userId: actor.id,
            action: 'admin.gallery.hide',
            outcome: 'succeeded',
            targetType: 'generation',
            targetId: id,
          })
          return { success: true, data: { hidden: true } }
        } catch (error) {
          await recordApiAuditEvent(deps.auditRepository, request, {
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
          await deps.adminRepository.gallery.setGalleryRecordHidden({
            recordId: id,
            hidden: false,
            actorId: actor.id,
          })
          await recordApiAuditEvent(deps.auditRepository, request, {
            userId: actor.id,
            action: 'admin.gallery.unhide',
            outcome: 'succeeded',
            targetType: 'generation',
            targetId: id,
          })
          return { success: true, data: { hidden: false } }
        } catch (error) {
          await recordApiAuditEvent(deps.auditRepository, request, {
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
          const affected =
            await deps.adminRepository.gallery.setGalleryRecordsHidden({
              recordIds: ids,
              hidden: true,
              actorId: actor.id,
            })
          for (const id of affected) {
            await recordApiAuditEvent(deps.auditRepository, request, {
              userId: actor.id,
              action: 'admin.gallery.hide',
              outcome: 'succeeded',
              targetType: 'generation',
              targetId: id,
            })
          }
          return { success: true, data: { affected: affected.length } }
        } catch (error) {
          await recordApiAuditEvent(deps.auditRepository, request, {
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
          const affected =
            await deps.adminRepository.gallery.setGalleryRecordsHidden({
              recordIds: ids,
              hidden: false,
              actorId: actor.id,
            })
          for (const id of affected) {
            await recordApiAuditEvent(deps.auditRepository, request, {
              userId: actor.id,
              action: 'admin.gallery.unhide',
              outcome: 'succeeded',
              targetType: 'generation',
              targetId: id,
            })
          }
          return { success: true, data: { affected: affected.length } }
        } catch (error) {
          await recordApiAuditEvent(deps.auditRepository, request, {
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
          const affected =
            await deps.adminRepository.gallery.softDeleteGalleryRecords({
              recordIds: ids,
              actorId: actor.id,
            })
          for (const id of affected) {
            await recordApiAuditEvent(deps.auditRepository, request, {
              userId: actor.id,
              action: 'generation.delete',
              outcome: 'succeeded',
              targetType: 'generation',
              targetId: id,
              metadata: {
                libraryState: 'deleted',
                scope: 'admin.gallery.batch',
              },
            })
          }
          return { success: true, data: { affected: affected.length } }
        } catch (error) {
          await recordApiAuditEvent(deps.auditRepository, request, {
            userId: actor.id,
            action: 'generation.delete',
            outcome: 'failed',
            targetType: 'generation',
            metadata: { count: ids.length, errorCode: auditErrorCode(error) },
          })
          throw error
        }
      })
      .get(
        '/api/admin/gallery/generations/:id/artifacts/:artifactId',
        async ({ request, params, set }) => {
          await requireAdminUser(request, deps.authService)
          const { id, artifactId } = validateInput(
            AdminGalleryArtifactParamsSchema,
            params,
          )

          const artifact =
            await deps.adminRepository.gallery.getAdminGalleryArtifact({
              recordId: id,
              artifactId,
            })
          if (artifact === undefined || artifact.storageKey === undefined) {
            set.status = 404
            return requestErrorResponseBody(
              request,
              'GALLERY_ARTIFACT_NOT_FOUND',
              'Gallery artifact not found',
              set,
            )
          }

          const storage = deps.storage
          if (storage.provider !== 'local') {
            const resolved = await resolveArtifactReadUrlUseCase({
              storage,
            }).execute({ artifact, expiresInSeconds: 300 })
            if (resolved.readUrl === undefined) {
              set.status = 404
              return requestErrorResponseBody(
                request,
                'GALLERY_ARTIFACT_NOT_FOUND',
                'Gallery artifact not found',
                set,
              )
            }
            return Response.redirect(resolved.readUrl, 302)
          }

          let path: string
          try {
            path = resolveLocalStoragePath(
              deps.artifactLocalRoot,
              decodeURIComponent(artifact.storageKey),
            )
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
            const code =
              typeof error === 'object' && error !== null && 'code' in error
                ? error.code
                : undefined
            if (error instanceof LocalFileTooLargeError) set.status = 413
            else set.status = code === 'ENOENT' ? 404 : 500
            return requestErrorResponseBody(
              request,
              error instanceof LocalFileTooLargeError
                ? 'ARTIFACT_TOO_LARGE'
                : code === 'ENOENT'
                  ? 'GALLERY_ARTIFACT_NOT_FOUND'
                  : 'ARTIFACT_READ_FAILED',
              error instanceof LocalFileTooLargeError
                ? 'Artifact exceeds the maximum response size'
                : code === 'ENOENT'
                  ? 'Gallery artifact not found'
                  : 'Failed to read gallery artifact',
              set,
            )
          }
        },
      )
  )
}
