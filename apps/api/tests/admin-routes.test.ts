import type {
  AuditOutboxEvent,
  AuditOutboxRepository,
} from '@bailian-studio/audit-repository'
import type { CreditLedger } from '@bailian-studio/credit-ledger'
import type {
	AdminTaskRepository,
	AnalyticsRepository,
} from '@bailian-studio/admin-repository'
import type {
	AssetRepository,
  AuditRepository,
  GenerationRepository,
} from '@bailian-studio/generation-repository'
import type { StorageAdapter } from '@bailian-studio/storage'
import { beforeEach, describe, expect, it } from 'vitest'
import { createTestApp } from '../src/test-app'
import { createFakeAuthService } from './fake-auth-service'

let currentUser: { id: string; role: 'user' | 'admin' } = {
  id: 'admin-1',
  role: 'admin',
}
const audits: Array<Record<string, unknown>> = []
const failedAuditEvent: AuditOutboxEvent = {
  id: 'audit-outbox-failed-1',
  userId: 'user-1',
  action: 'asset.import',
  outcome: 'succeeded',
  targetType: 'creative_asset',
  targetId: 'asset-1',
  metadata: { source: 'generation', assetCount: 1 },
  occurredAt: '2026-08-30T00:00:00.000Z',
  status: 'failed',
  attempts: 5,
  availableAt: '2026-08-30T00:00:00.000Z',
  lastError: 'AUDIT_OUTBOX_DELIVERY_FAILED',
  createdAt: '2026-08-30T00:00:00.000Z',
  updatedAt: '2026-08-30T00:00:00.000Z',
}

const fakeAuditOutboxRepository: Pick<
  AuditOutboxRepository,
  'listFailed' | 'requeueFailed'
> = {
  listFailed: async () => [failedAuditEvent],
  requeueFailed: async ({ eventId }) => {
    if (eventId === 'active-event') {
      return {
        status: 'not_failed',
        event: { ...failedAuditEvent, id: eventId, status: 'processing' },
      }
    }
    if (eventId !== failedAuditEvent.id) return { status: 'not_found' }
    return {
      status: 'requeued',
      event: {
        ...failedAuditEvent,
        status: 'pending',
        attempts: 0,
        lastError: undefined,
      },
    }
  },
}

const fakeAuthService = createFakeAuthService(() => ({
  id: currentUser.id,
  email: 'admin@e.test',
  displayName: null,
  role: currentUser.role,
}))

const fakeCreditLedger = {
  getBalance: async ({ userId }: { userId: string }) => ({
    userId,
    availableCents: 5000,
    reservedCents: 0,
    totalCents: 5000,
  }),
  grant: async ({
    userId,
    amountCents,
  }: {
    userId: string
    amountCents: number
  }) => ({
    balance: {
      userId,
      availableCents: amountCents,
      reservedCents: 0,
      totalCents: amountCents,
    },
    entry: {
      id: 'entry-1',
      userId,
      availableDeltaCents: amountCents,
      reservedDeltaCents: 0,
    },
  }),
} as unknown as CreditLedger

const fakeStorage: StorageAdapter = {
  provider: 'local',
  keyPrefix: '',
  writeObject: async (input) => ({
    provider: 'local',
    key: input.key,
    byteSize: input.body.byteLength,
  }),
  createReadUrl: async (input) =>
    `/signed/${input.key}?ttl=${input.expiresInSeconds}`,
}

const fakeGenerationRepository = {
  listUnifiedAssets: async (
    _userId: string,
    options: { limit?: number; kind?: string },
  ) => {
    const count = options.limit ?? 1
    return {
      items: Array.from({ length: count }, (_, i) => ({
        id: `asset-${i}`,
        kind: options.kind ?? 'image',
        source: 'upload' as const,
        storageKey: `key-${i}`,
        thumbnailStatus: 'ready' as const,
        thumbnailStorageKey: `thumb-${i}`,
        thumbnailStorageProvider: 'local' as const,
        mimeType: 'image/png',
        byteSize: 100,
        fileName: `a${i}.png`,
        createdAt: new Date().toISOString(),
      })),
    }
  },
  getTask: async (id: string) =>
    id === 'task-1' ? { id, recordId: 'generation-1' } : undefined,
  getGenerationRecord: async (id: string) =>
    id === 'generation-1'
      ? {
          id,
          modelId: 'wanx2.1-t2i-turbo',
          category: 'image' as const,
          inputParams: { prompt: '一只戴墨镜的柴犬', size: '1024*1024' },
        }
      : undefined,
  getGenerationInputAssets: async (id: string) =>
    id === 'generation-1'
      ? [
          {
            generationId: id,
            parameterName: 'reference_images',
            position: 0,
            assetId: 'asset-reference-1',
            userId: 'user-1',
            kind: 'image' as const,
            source: 'upload' as const,
          },
        ]
      : [],
  getUserAsset: async ({ assetId }: { assetId: string }) =>
    assetId === 'asset-reference-1'
      ? {
          id: assetId,
          kind: 'image' as const,
          source: 'upload' as const,
          storageKey: 'inputs/reference-1.png',
          fileName: 'reference-1.png',
          createdAt: new Date().toISOString(),
        }
      : undefined,
  countGenerationCallsBetween: async () => ({
    total: 5,
    byModel: [
      { modelId: 'qwen-image', count: 3 },
      { modelId: 'vidu-reference-video', count: 2 },
    ],
    byHour: [
      { hour: 9, modelId: 'qwen-image', count: 2 },
      { hour: 10, modelId: 'qwen-image', count: 1 },
      { hour: 10, modelId: 'vidu-reference-video', count: 2 },
    ],
  }),
} as unknown as GenerationRepository

const fakeAuditRepository: AuditRepository = {
  recordAuditEvent: async (input) => {
    audits.push({ ...input })
    return {} as never
  },
}

const fakeAssetRepository: AssetRepository = {
  createUserAsset: async () => undefined,
  listUnifiedAssets: async (_userId, options = {}) => {
    const count = options.limit ?? 1
    return {
      items: Array.from({ length: count }, (_, i) => ({
        id: `asset-${i}`,
        kind: options.kind ?? 'image',
        source: 'upload' as const,
        storageKey: `key-${i}`,
        thumbnailStatus: 'ready' as const,
        thumbnailStorageKey: `thumb-${i}`,
        thumbnailStorageProvider: 'local' as const,
        mimeType: 'image/png',
        byteSize: 100,
        fileName: `a${i}.png`,
        createdAt: new Date().toISOString(),
      })),
    }
  },
  getUserAsset: async ({ assetId }) =>
    assetId === 'asset-reference-1'
      ? {
          id: assetId,
          kind: 'image' as const,
          source: 'upload' as const,
          storageKey: 'inputs/reference-1.png',
          fileName: 'reference-1.png',
          createdAt: new Date().toISOString(),
        }
      : undefined,
  softDeleteUserAsset: async () => false,
}

const fakeAdminTaskRepository: AdminTaskRepository = {
  getAdminTaskRequestContext: async id => {
    if (id === 'canvas-task-1') {
      return {
        task: { id, type: 'canvas.execute', domain: 'canvas', userId: 'user-1' } as never,
        canvas: {
          documentId: 'canvas-1',
          documentRevision: 3,
          cachePolicy: 'reuse',
          assets: [{
            id: 'asset-canvas-output-1',
            kind: 'image',
            source: 'generation',
            storageProvider: 'local',
            storageKey: 'outputs/canvas-1.png',
            thumbnailStatus: 'ready',
            thumbnailStorageProvider: 'local',
            thumbnailStorageKey: 'outputs/canvas-1-thumb.png',
            createdAt: '2026-08-30T00:00:03.000Z',
          }],
          nodes: [{
            nodeId: 'node-1',
            kind: 'image',
            modelId: 'qwen-image',
            params: { prompt: '一只戴墨镜的柴犬' },
            assetRefs: {},
            dependencyBindings: {},
            dependsOn: [],
            status: 'succeeded',
            generationId: 'generation-canvas-1',
            assetIds: ['asset-canvas-output-1'],
            cacheHit: false,
            generationStatus: 'succeeded',
            accountedCents: 120,
          }],
        },
      }
    }
    if (id !== 'task-1') return undefined
    return {
      task: { id, recordId: 'generation-1' } as never,
      record: {
        id: 'generation-1',
        modelId: 'wanx2.1-t2i-turbo',
        category: 'image',
        inputParams: { prompt: '一只戴墨镜的柴犬', size: '1024*1024' },
        inputAssets: [{
          generationId: 'generation-1',
          parameterName: 'reference_images',
          position: 0,
          assetId: 'asset-reference-1',
          userId: 'user-1',
          kind: 'image',
          source: 'upload',
        }],
      },
    }
  },
  listAdminTasks: async () => ({ items: [] }),
}

const fakeAnalyticsRepository: AnalyticsRepository = {
  countGenerationCallsBetween: async () => ({
    total: 5,
    byModel: [
      { modelId: 'qwen-image', count: 3 },
      { modelId: 'vidu-reference-video', count: 2 },
    ],
    byHour: [
      { hour: 9, modelId: 'qwen-image', count: 2 },
      { hour: 10, modelId: 'qwen-image', count: 1 },
      { hour: 10, modelId: 'vidu-reference-video', count: 2 },
    ],
  }),
  listModelCosts: async () => [],
  upsertModelCosts: async () => undefined,
  getCostMarginAnalytics: async () => [],
  getRetentionAnalytics: async () => ({ firstGeneration: 0, firstSuccess: 0, activeTwoDays: 0 }),
  getCanvasCostAnalytics: async () => ({
    executions: 2,
    generationCalls: 3,
    cacheHitNodes: 1,
    accountedCents: 420,
    byModel: [{ modelId: 'qwen-image', calls: 3, accountedCents: 420 }],
  }),
}

const app = createTestApp({
  authService: fakeAuthService,
  creditLedger: fakeCreditLedger,
  generationRepository: fakeGenerationRepository,
  auditRepository: fakeAuditRepository,
  assetRepository: fakeAssetRepository,
  auditOutboxRepository: fakeAuditOutboxRepository,
  adminTaskRepository: fakeAdminTaskRepository,
  analyticsRepository: fakeAnalyticsRepository,
  storage: fakeStorage,
}).app

function adminRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: {
      cookie: 'bailian_studio_session=fake-token',
      ...(init.headers ?? {}),
    },
  })
}

describe('admin routes', () => {
  beforeEach(() => {
    currentUser = { id: 'admin-1', role: 'admin' }
    audits.length = 0
    fakeAuthService.__setBanned(false)
  })

  it('exposes Canvas cost analytics with model display labels', async () => {
    const response = await app.handle(adminRequest('/api/admin/stats/analytics?days=7'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        canvas: {
          executions: 2,
          generationCalls: 3,
          cacheHitNodes: 1,
          accountedCents: 420,
          byModel: [{ modelId: 'qwen-image', label: 'Qwen Image', calls: 3, accountedCents: 420 }],
        },
      }),
    }))
  })

  it('returns 403 for non-admin users on every admin endpoint', async () => {
    currentUser = { id: 'user-1', role: 'user' }
    const paths = [
      ['GET', '/api/admin/users'],
      ['POST', '/api/admin/users'],
      ['GET', '/api/admin/users/u1'],
      ['PATCH', '/api/admin/users/u1'],
      ['DELETE', '/api/admin/users/u1'],
      ['POST', '/api/admin/users/u1/ban'],
      ['POST', '/api/admin/users/u1/unban'],
      ['POST', '/api/admin/users/batch-ban'],
      ['POST', '/api/admin/users/batch-grant-points'],
      ['GET', '/api/admin/users/u1/assets'],
      ['GET', '/api/admin/stats/overview'],
      ['GET', '/api/admin/model-costs'],
      ['GET', '/api/admin/stats/analytics'],
      ['GET', '/api/metrics'],
      ['GET', '/api/admin/gallery'],
      ['GET', '/api/admin/tasks/task-1/request-context'],
      ['GET', '/api/admin/audit/outbox/failed'],
      ['POST', '/api/admin/audit/outbox/audit-outbox-failed-1/requeue'],
      ['POST', '/api/admin/gallery/g1/hide'],
      ['POST', '/api/admin/gallery/g1/unhide'],
      ['GET', '/api/admin/gallery/generations/g1/artifacts/a1'],
    ] as const
    for (const [method, path] of paths) {
      const response = await app.handle(adminRequest(path, { method }))
      expect(response.status, `${method} ${path}`).toBe(403)
    }
  })

  it('exposes process metrics only to administrators', async () => {
    const adminResponse = await app.handle(adminRequest('/api/metrics'))
    expect(adminResponse.status).toBe(200)
    expect(await adminResponse.json()).toEqual(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          counters: expect.any(Object),
          timers: expect.any(Object),
        }),
      }),
    )

    currentUser = { id: 'user-1', role: 'user' }
    const userResponse = await app.handle(adminRequest('/api/metrics'))
    expect(userResponse.status).toBe(403)
  })

  it('lists users with pagination and search passthrough', async () => {
    const response = await app.handle(
      adminRequest('/api/admin/users?q=alice&limit=20'),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { items: unknown[] } }
    expect(Array.isArray(body.data.items)).toBe(true)
  })

  it('supports offset pagination (page/pageSize) and returns total', async () => {
    const response = await app.handle(
      adminRequest('/api/admin/users?page=2&pageSize=20'),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { total?: number } }
    expect(body.data.total).toBe(37)
  })

  it('lists failed audit outbox events and requeues only terminal failures', async () => {
    const list = await app.handle(
      adminRequest('/api/admin/audit/outbox/failed?limit=10'),
    )
    expect(list.status).toBe(200)
    expect(await list.json()).toEqual({
      success: true,
      data: { items: [failedAuditEvent] },
    })

    const requeue = await app.handle(
      adminRequest('/api/admin/audit/outbox/audit-outbox-failed-1/requeue', {
        method: 'POST',
      }),
    )
    expect(requeue.status).toBe(200)
    expect(await requeue.json()).toEqual(
      expect.objectContaining({
        success: true,
        data: {
          event: expect.objectContaining({
            id: failedAuditEvent.id,
            status: 'pending',
            attempts: 0,
          }),
        },
      }),
    )
    expect(audits).toContainEqual(
      expect.objectContaining({
        action: 'admin.audit.outbox.requeue',
        outcome: 'succeeded',
        targetId: failedAuditEvent.id,
      }),
    )

    const active = await app.handle(
      adminRequest('/api/admin/audit/outbox/active-event/requeue', {
        method: 'POST',
      }),
    )
    expect(active.status).toBe(409)
  })

  it('returns a stats overview with model labels and registrations', async () => {
    const response = await app.handle(adminRequest('/api/admin/stats/overview'))
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      data: {
        todayCalls: number
        callsByModel: Array<{ modelId: string; label: string; count: number }>
        callsByHour: Array<{ hour: number; modelId: string; count: number }>
        registrationsByDay: Array<{ date: string; count: number }>
        todayNewUsers: number
        totalUsers: number
      }
    }
    expect(body.data.todayCalls).toBe(5)
    expect(body.data.callsByModel[0]).toMatchObject({
      modelId: 'qwen-image',
      count: 3,
    })
    // modelId 应被 enrich 成模型展示名（至少非空字符串）
    expect(typeof body.data.callsByModel[0]?.label).toBe('string')
    expect(body.data.callsByModel[0]?.label.length ?? 0).toBeGreaterThan(0)
    expect(
      body.data.callsByHour.some(
        (row) =>
          row.hour === 10 &&
          row.modelId === 'vidu-reference-video' &&
          row.count === 2,
      ),
    ).toBe(true)
    expect(body.data.totalUsers).toBe(1)
    expect(body.data.todayNewUsers).toBe(0)
    expect(Array.isArray(body.data.registrationsByDay)).toBe(true)
  })

  it('creates a user and records an audit event', async () => {
    const response = await app.handle(
      adminRequest('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'new@x.test',
          password: 'password1',
          displayName: 'New',
          role: 'admin',
        }),
      }),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      data: { user: { email: string } }
    }
    expect(body.data.user.email).toBe('new@x.test')
    expect(
      audits.some(
        (a) => a.action === 'admin.user.create' && a.outcome === 'succeeded',
      ),
    ).toBe(true)
  })

  it('gets a user detail with credit balance', async () => {
    const response = await app.handle(adminRequest('/api/admin/users/u1'))
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      data: { user: { id: string }; balance: { availableCents: number } }
    }
    expect(body.data.user.id).toBe('u1')
    expect(body.data.balance.availableCents).toBe(5000)
  })

  it('updates a user and refuses self-demotion', async () => {
    const response = await app.handle(
      adminRequest('/api/admin/users/u2', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'admin' }),
      }),
    )
    expect(response.status).toBe(200)
    expect(
      audits.some(
        (a) => a.action === 'admin.user.update' && a.outcome === 'succeeded',
      ),
    ).toBe(true)

    // 尝试把自己（admin-1）降级为 user → 403
    const selfDemote = await app.handle(
      adminRequest('/api/admin/users/admin-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role: 'user' }),
      }),
    )
    expect(selfDemote.status).toBe(403)
  })

  it('soft-deletes a user (204) and refuses self-delete', async () => {
    const response = await app.handle(
      adminRequest('/api/admin/users/u3', { method: 'DELETE' }),
    )
    expect(response.status).toBe(204)
    expect(
      audits.some(
        (a) => a.action === 'admin.user.delete' && a.outcome === 'succeeded',
      ),
    ).toBe(true)

    const selfDelete = await app.handle(
      adminRequest('/api/admin/users/admin-1', { method: 'DELETE' }),
    )
    expect(selfDelete.status).toBe(403)
  })

  it('lists a target user assets with signed read urls', async () => {
    const response = await app.handle(
      adminRequest('/api/admin/users/u1/assets?kind=image'),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      data: { items: Array<{ url: string }> }
    }
    expect(body.data.items[0]?.url).toContain('/signed/')
  })

  it('returns generation request parameters and signed reference assets for administrators', async () => {
    const response = await app.handle(
      adminRequest('/api/admin/tasks/task-1/request-context'),
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      data: {
        context: {
          modelId: string
          inputParams: { prompt: string }
          inputAssets: Array<{ asset: { url?: string } }>
        } | null
      }
    }
    expect(body.data.context).toMatchObject({
      modelId: 'wanx2.1-t2i-turbo',
      inputParams: { prompt: '一只戴墨镜的柴犬' },
    })
    expect(body.data.context?.inputAssets[0]?.asset.url).toContain(
      '/signed/inputs/reference-1.png',
    )
  })

  it('returns Canvas node diagnostics from the admin task context endpoint', async () => {
    const response = await app.handle(
      adminRequest('/api/admin/tasks/canvas-task-1/request-context'),
    )
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toEqual({
      success: true,
      data: {
        context: expect.objectContaining({
          kind: 'canvas',
          documentId: 'canvas-1',
          documentRevision: 3,
          assets: [expect.objectContaining({
            id: 'asset-canvas-output-1',
            url: '/signed/outputs/canvas-1.png?ttl=3600',
            thumbnailUrl: '/signed/outputs/canvas-1-thumb.png?ttl=3600',
          })],
          nodes: [expect.objectContaining({
            nodeId: 'node-1',
            modelId: 'qwen-image',
            generationId: 'generation-canvas-1',
            assetIds: ['asset-canvas-output-1'],
            accountedCents: 120,
          })],
        }),
      },
    })
    expect(body.data.context.assets[0]).not.toHaveProperty('storageKey')
    expect(body.data.context.assets[0]).not.toHaveProperty('storageProvider')
  })

  it('bans and unbans a user via admin endpoints with audit', async () => {
    const ban = await app.handle(
      adminRequest('/api/admin/users/u9/ban', { method: 'POST' }),
    )
    expect(ban.status).toBe(200)
    expect(
      audits.some(
        (a) => a.action === 'admin.user.ban' && a.outcome === 'succeeded',
      ),
    ).toBe(true)
    // 封禁使 fake 的共享会话状态置为封禁，恢复后再验证解封端点。
    fakeAuthService.__setBanned(false)

    const unban = await app.handle(
      adminRequest('/api/admin/users/u9/unban', { method: 'POST' }),
    )
    expect(unban.status).toBe(200)
    expect(
      audits.some(
        (a) => a.action === 'admin.user.unban' && a.outcome === 'succeeded',
      ),
    ).toBe(true)
  })

  it('batch-bans / batch-unbans / batch-deletes users and refuses all-self batch', async () => {
    const ban = await app.handle(
      adminRequest('/api/admin/users/batch-ban', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userIds: ['u1', 'admin-1'] }),
      }),
    )
    expect(ban.status).toBe(200)
    const banBody = (await ban.json()) as { data: { affected: number } }
    // 自动剔除当前 admin 自身（admin-1），只处理 u1。
    expect(banBody.data.affected).toBe(1)
    expect(
      audits.some(
        (a) => a.action === 'admin.user.ban' && a.outcome === 'succeeded',
      ),
    ).toBe(true)
    fakeAuthService.__setBanned(false)

    const allSelfDelete = await app.handle(
      adminRequest('/api/admin/users/batch-delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userIds: ['admin-1'] }),
      }),
    )
    expect(allSelfDelete.status).toBe(403)

    const grant = await app.handle(
      adminRequest('/api/admin/users/batch-grant-points', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          userIds: ['u1', 'u2'],
          amountCents: 100,
          reason: 'test',
          idempotencyKey: 'batch-test',
        }),
      }),
    )
    expect(grant.status).toBe(200)
    expect(
      audits.some(
        (a) => a.action === 'points.grant' && a.outcome === 'succeeded',
      ),
    ).toBe(true)
  })
})
