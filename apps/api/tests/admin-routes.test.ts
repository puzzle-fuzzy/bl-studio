import { beforeEach, describe, expect, it } from 'vitest'
import type { CreditLedger } from '@bailian-studio/credit-ledger'
import type { GenerationRepository } from '@bailian-studio/generation-repository'
import type { AssetRepository, AuditRepository } from '@bailian-studio/generation-repository'
import type { StorageAdapter } from '@bailian-studio/storage'
import { createTestApp } from '../src/test-app'
import { createFakeAuthService } from './fake-auth-service'

let currentUser: { id: string; role: 'user' | 'admin' } = { id: 'admin-1', role: 'admin' }
const audits: Array<Record<string, unknown>> = []

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
  grant: async ({ userId, amountCents }: { userId: string; amountCents: number }) => ({
    balance: { userId, availableCents: amountCents, reservedCents: 0, totalCents: amountCents },
    entry: { id: 'entry-1', userId, availableDeltaCents: amountCents, reservedDeltaCents: 0 },
  }),
} as unknown as CreditLedger

const fakeStorage: StorageAdapter = {
  provider: 'local',
  keyPrefix: '',
  writeObject: async input => ({ provider: 'local', key: input.key, byteSize: input.body.byteLength }),
  createReadUrl: async input => `/signed/${input.key}?ttl=${input.expiresInSeconds}`,
}

const fakeGenerationRepository = {
  recordAuditEvent: async (input: Record<string, unknown>) => {
    audits.push({ ...input } as Record<string, unknown>)
    return {} as never
  },
  listUnifiedAssets: async (_userId: string, options: { limit?: number; kind?: string }) => {
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
  getTask: async (id: string) => id === 'task-1'
    ? { id, recordId: 'generation-1' }
    : undefined,
  getGenerationRecord: async (id: string) => id === 'generation-1'
    ? {
        id,
        modelId: 'wanx2.1-t2i-turbo',
        category: 'image' as const,
        inputParams: { prompt: '一只戴墨镜的柴犬', size: '1024*1024' },
      }
    : undefined,
  getGenerationInputAssets: async (id: string) => id === 'generation-1'
    ? [{
        generationId: id,
        parameterName: 'reference_images',
        position: 0,
        assetId: 'asset-reference-1',
        userId: 'user-1',
        kind: 'image' as const,
        source: 'upload' as const,
      }]
    : [],
  getUserAsset: async ({ assetId }: { assetId: string }) => assetId === 'asset-reference-1'
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
    audits.push({ ...input } as Record<string, unknown>)
    return {} as never
  },
}

const fakeAssetRepository = {
  createUserAsset: async () => undefined,
  listUnifiedAssets: (fakeGenerationRepository as unknown as AssetRepository).listUnifiedAssets,
  getUserAsset: (fakeGenerationRepository as unknown as AssetRepository).getUserAsset,
  softDeleteUserAsset: async () => false,
} as unknown as AssetRepository

const app = createTestApp({
  authService: fakeAuthService,
  creditLedger: fakeCreditLedger,
  generationRepository: fakeGenerationRepository,
  auditRepository: fakeAuditRepository,
  assetRepository: fakeAssetRepository,
  storage: fakeStorage,
}).app

function adminRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: { cookie: 'bailian_studio_session=fake-token', ...(init.headers ?? {}) },
  })
}

describe('admin routes', () => {
  beforeEach(() => {
    currentUser = { id: 'admin-1', role: 'admin' }
    audits.length = 0
    fakeAuthService.__setBanned(false)
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
    expect(await adminResponse.json()).toEqual(expect.objectContaining({
      success: true,
      data: expect.objectContaining({ counters: expect.any(Object), timers: expect.any(Object) }),
    }))

    currentUser = { id: 'user-1', role: 'user' }
    const userResponse = await app.handle(adminRequest('/api/metrics'))
    expect(userResponse.status).toBe(403)
  })

  it('lists users with pagination and search passthrough', async () => {
    const response = await app.handle(adminRequest('/api/admin/users?q=alice&limit=20'))
    expect(response.status).toBe(200)
    const body = await response.json() as { data: { items: unknown[] } }
    expect(Array.isArray(body.data.items)).toBe(true)
  })

  it('supports offset pagination (page/pageSize) and returns total', async () => {
    const response = await app.handle(adminRequest('/api/admin/users?page=2&pageSize=20'))
    expect(response.status).toBe(200)
    const body = await response.json() as { data: { total?: number } }
    expect(body.data.total).toBe(37)
  })

  it('returns a stats overview with model labels and registrations', async () => {
    const response = await app.handle(adminRequest('/api/admin/stats/overview'))
    expect(response.status).toBe(200)
    const body = await response.json() as {
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
    expect(body.data.callsByModel[0]).toMatchObject({ modelId: 'qwen-image', count: 3 })
    // modelId 应被 enrich 成模型展示名（至少非空字符串）
    expect(typeof body.data.callsByModel[0]?.label).toBe('string')
    expect(body.data.callsByModel[0]?.label.length ?? 0).toBeGreaterThan(0)
    expect(body.data.callsByHour.some(row => row.hour === 10 && row.modelId === 'vidu-reference-video' && row.count === 2)).toBe(true)
    expect(body.data.totalUsers).toBe(1)
    expect(body.data.todayNewUsers).toBe(0)
    expect(Array.isArray(body.data.registrationsByDay)).toBe(true)
  })

  it('creates a user and records an audit event', async () => {
    const response = await app.handle(adminRequest('/api/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'new@x.test', password: 'password1', displayName: 'New', role: 'admin' }),
    }))
    expect(response.status).toBe(200)
    const body = await response.json() as { data: { user: { email: string } } }
    expect(body.data.user.email).toBe('new@x.test')
    expect(audits.some(a => a.action === 'admin.user.create' && a.outcome === 'succeeded')).toBe(true)
  })

  it('gets a user detail with credit balance', async () => {
    const response = await app.handle(adminRequest('/api/admin/users/u1'))
    expect(response.status).toBe(200)
    const body = await response.json() as { data: { user: { id: string }; balance: { availableCents: number } } }
    expect(body.data.user.id).toBe('u1')
    expect(body.data.balance.availableCents).toBe(5000)
  })

  it('updates a user and refuses self-demotion', async () => {
    const response = await app.handle(adminRequest('/api/admin/users/u2', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    }))
    expect(response.status).toBe(200)
    expect(audits.some(a => a.action === 'admin.user.update' && a.outcome === 'succeeded')).toBe(true)

    // 尝试把自己（admin-1）降级为 user → 403
    const selfDemote = await app.handle(adminRequest('/api/admin/users/admin-1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'user' }),
    }))
    expect(selfDemote.status).toBe(403)
  })

  it('soft-deletes a user (204) and refuses self-delete', async () => {
    const response = await app.handle(adminRequest('/api/admin/users/u3', { method: 'DELETE' }))
    expect(response.status).toBe(204)
    expect(audits.some(a => a.action === 'admin.user.delete' && a.outcome === 'succeeded')).toBe(true)

    const selfDelete = await app.handle(adminRequest('/api/admin/users/admin-1', { method: 'DELETE' }))
    expect(selfDelete.status).toBe(403)
  })

  it('lists a target user assets with signed read urls', async () => {
    const response = await app.handle(adminRequest('/api/admin/users/u1/assets?kind=image'))
    expect(response.status).toBe(200)
    const body = await response.json() as { data: { items: Array<{ url: string }> } }
    expect(body.data.items[0]?.url).toContain('/signed/')
  })

  it('returns generation request parameters and signed reference assets for administrators', async () => {
    const response = await app.handle(adminRequest('/api/admin/tasks/task-1/request-context'))
    expect(response.status).toBe(200)
    const body = await response.json() as {
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
    expect(body.data.context?.inputAssets[0]?.asset.url).toContain('/signed/inputs/reference-1.png')
  })

  it('bans and unbans a user via admin endpoints with audit', async () => {
    const ban = await app.handle(adminRequest('/api/admin/users/u9/ban', { method: 'POST' }))
    expect(ban.status).toBe(200)
    expect(audits.some(a => a.action === 'admin.user.ban' && a.outcome === 'succeeded')).toBe(true)
    // 封禁使 fake 的共享会话状态置为封禁，恢复后再验证解封端点。
    fakeAuthService.__setBanned(false)

    const unban = await app.handle(adminRequest('/api/admin/users/u9/unban', { method: 'POST' }))
    expect(unban.status).toBe(200)
    expect(audits.some(a => a.action === 'admin.user.unban' && a.outcome === 'succeeded')).toBe(true)
  })

  it('batch-bans / batch-unbans / batch-deletes users and refuses all-self batch', async () => {
    const ban = await app.handle(adminRequest('/api/admin/users/batch-ban', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userIds: ['u1', 'admin-1'] }),
    }))
    expect(ban.status).toBe(200)
    const banBody = await ban.json() as { data: { affected: number } }
    // 自动剔除当前 admin 自身（admin-1），只处理 u1。
    expect(banBody.data.affected).toBe(1)
    expect(audits.some(a => a.action === 'admin.user.ban' && a.outcome === 'succeeded')).toBe(true)
    fakeAuthService.__setBanned(false)

    const allSelfDelete = await app.handle(adminRequest('/api/admin/users/batch-delete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userIds: ['admin-1'] }),
    }))
    expect(allSelfDelete.status).toBe(403)

    const grant = await app.handle(adminRequest('/api/admin/users/batch-grant-points', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userIds: ['u1', 'u2'], amountCents: 100, reason: 'test', idempotencyKey: 'batch-test' }),
    }))
    expect(grant.status).toBe(200)
    expect(audits.some(a => a.action === 'points.grant' && a.outcome === 'succeeded')).toBe(true)
  })
})
