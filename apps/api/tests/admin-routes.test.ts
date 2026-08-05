import { beforeEach, describe, expect, it } from 'vitest'
import type { CreditLedger } from '@bailian-studio/credit-ledger'
import type { GenerationRepository } from '@bailian-studio/generation-repository'
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
} as unknown as CreditLedger

const fakeStorage: StorageAdapter = {
  provider: 'local',
  keyPrefix: '',
  writeObject: async input => ({ provider: 'local', key: input.key, byteSize: input.body.byteLength }),
  createReadUrl: async input => `/signed/${input.key}?ttl=${input.expiresInSeconds}`,
}

const fakeGenerationRepository = {
  recordAuditEvent: async (input: Record<string, unknown>) => {
    audits.push(input)
    return {} as never
  },
  listUnifiedAssets: async (userId: string, options: { limit?: number; kind?: string }) => {
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
} as unknown as GenerationRepository

const app = createTestApp({
  authService: fakeAuthService,
  creditLedger: fakeCreditLedger,
  generationRepository: fakeGenerationRepository,
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
  })

  it('returns 403 for non-admin users on every admin endpoint', async () => {
    currentUser = { id: 'user-1', role: 'user' }
    const paths = [
      ['GET', '/api/admin/users'],
      ['POST', '/api/admin/users'],
      ['GET', '/api/admin/users/u1'],
      ['PATCH', '/api/admin/users/u1'],
      ['DELETE', '/api/admin/users/u1'],
      ['GET', '/api/admin/users/u1/assets'],
    ] as const
    for (const [method, path] of paths) {
      const response = await app.handle(adminRequest(path, { method }))
      expect(response.status, `${method} ${path}`).toBe(403)
    }
  })

  it('lists users with pagination and search passthrough', async () => {
    const response = await app.handle(adminRequest('/api/admin/users?q=alice&limit=20'))
    expect(response.status).toBe(200)
    const body = await response.json() as { data: { items: unknown[] } }
    expect(Array.isArray(body.data.items)).toBe(true)
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
})
