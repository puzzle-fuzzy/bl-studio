import { beforeEach, describe, expect, it } from 'vitest'
import type { GenerationRepository } from '@bailian-studio/generation-repository'
import type { StorageAdapter } from '@bailian-studio/storage'
import { createTestApp } from '../src/test-app'
import { createFakeAuthService } from './fake-auth-service'

let currentUser: { id: string; role: 'user' | 'admin' } = { id: 'user-1', role: 'user' }
let notifications: Array<{
  id: string
  userId: string
  kind: string
  title: string
  body: string
  read: boolean
  createdAt: string
  recordId?: string
}> = []

const fakeAuthService = createFakeAuthService(() => ({
  id: currentUser.id,
  email: 'u@e.test',
  displayName: null,
  role: currentUser.role,
}))

const fakeStorage: StorageAdapter = {
  provider: 'local',
  keyPrefix: '',
  writeObject: async input => ({ provider: 'local', key: input.key, byteSize: input.body.byteLength }),
  createReadUrl: async input => `/signed/${input.key}?ttl=${input.expiresInSeconds}`,
}

const fakeGenerationRepository = {
  recordAuditEvent: async () => {},
  listNotifications: async ({ userId }: { userId: string }) => ({
    items: notifications
      .filter(item => item.userId === userId)
      .map(({ userId: _userId, ...rest }) => rest),
  }),
  countUnreadNotifications: async (userId: string) =>
    notifications.filter(item => item.userId === userId && !item.read).length,
  markNotificationRead: async ({ userId, notificationId }: { userId: string; notificationId: string }) => {
    const target = notifications.find(item => item.id === notificationId && item.userId === userId)
    if (target === undefined) return false
    target.read = true
    return true
  },
  markAllNotificationsRead: async (userId: string) => {
    const targets = notifications.filter(item => item.userId === userId && !item.read)
    for (const item of targets) item.read = true
    return targets.length
  },
} as unknown as GenerationRepository

const app = createTestApp({
  authService: fakeAuthService,
  generationRepository: fakeGenerationRepository,
  storage: fakeStorage,
}).app

function authed(path: string, init: RequestInit = {}): Request {
  return new Request(`http://localhost${path}`, {
    ...init,
    headers: { cookie: 'bailian_studio_session=fake-token', ...(init.headers ?? {}) },
  })
}

describe('notifications routes', () => {
  beforeEach(() => {
    currentUser = { id: 'user-1', role: 'user' }
    notifications = [
      { id: 'n-1', userId: 'user-1', kind: 'like', title: '收到新点赞', body: '点赞', read: false, createdAt: '2026-07-01T00:00:00.000Z', recordId: 'r-1' },
      { id: 'n-2', userId: 'user-1', kind: 'favorite', title: '收到新收藏', body: '收藏', read: false, createdAt: '2026-07-02T00:00:00.000Z' },
      { id: 'n-3', userId: 'other-user', kind: 'like', title: '别人的', body: 'x', read: false, createdAt: '2026-07-03T00:00:00.000Z' },
    ]
  })

  it('未登录访问通知接口 → 401', async () => {
    const response = await app.handle(new Request('http://localhost/api/notifications'))
    expect(response.status).toBe(401)
  })

  it('列表只返回本人通知', async () => {
    const response = await app.handle(authed('/api/notifications'))
    const body = await response.json() as { success: boolean; data: { items: unknown[] } }
    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.items).toHaveLength(2)
  })

  it('未读数只统计本人未读', async () => {
    const response = await app.handle(authed('/api/notifications/unread-count'))
    const body = await response.json() as { data: { count: number } }
    expect(body.data.count).toBe(2)
  })

  it('标记已读；越权标记他人通知 → 404', async () => {
    const ok = await app.handle(authed('/api/notifications/n-1/read', { method: 'POST' }))
    expect(ok.status).toBe(200)
    const other = await app.handle(authed('/api/notifications/n-3/read', { method: 'POST' }))
    expect(other.status).toBe(404)
  })

  it('全部已读', async () => {
    const response = await app.handle(authed('/api/notifications/read-all', { method: 'POST' }))
    const body = await response.json() as { data: { marked: number } }
    expect(body.data.marked).toBe(2)
  })
})
