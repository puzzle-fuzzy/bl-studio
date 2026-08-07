import { describe, expect, it } from 'vitest'
import type { AuthService } from '@bailian-studio/auth'
import type { GenerationRepository, RecordAuditEventInput } from '@bailian-studio/generation-repository'
import type { StorageAdapter, StorageReadUrlInput, StorageWriteInput, StorageWriteResult } from '@bailian-studio/storage'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTestApp } from '../src/test-app'
import { generateAvatarSvg } from '../src/lib/avatar'
import { createFakeAuthService } from './fake-auth-service'

/** P1-16：真实 PNG 魔数头，让「合法上传」用例通过 sniff 校验。 */
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** 本地适配器（无 deleteObject）：记录写与读请求，便于断言。 */
class TestStorage implements StorageAdapter {
  readonly provider = 'local' as const
  readonly keyPrefix = ''
  readonly writes: StorageWriteInput[] = []

  async writeObject(input: StorageWriteInput): Promise<StorageWriteResult> {
    this.writes.push(input)
    return { provider: 'local', key: input.key, byteSize: input.body.byteLength }
  }

  async createReadUrl(input: StorageReadUrlInput): Promise<string> {
    return `/signed/${input.key}?ttl=${input.expiresInSeconds}`
  }
}

function createTestContext(avatarKey: () => string | null | undefined) {
  const auditInputs: RecordAuditEventInput[] = []
  const repository = new Proxy({} as GenerationRepository, {
    get(_target, property) {
      if (property === 'recordAuditEvent') {
        return async (input: RecordAuditEventInput) => {
          auditInputs.push(input)
        }
      }
      return undefined
    },
  })
  const storage = new TestStorage()
  const baseAuth = createFakeAuthService(() => ({
    id: 'avatar_user',
    email: 'avatar_user@example.com',
    displayName: null,
    role: 'user' as const,
  }))
  const authService: AuthService = {
    ...baseAuth,
    getUserAvatarStorageKey: async () => avatarKey(),
  }
  const { app } = createTestApp({
    authService,
    generationRepository: repository,
    storage,
    artifactLocalRoot: join(tmpdir(), 'avatar-routes-test'),
  })
  return { app, storage, auditInputs }
}

function authed(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set('cookie', 'bailian_studio_session=fake-token')
  return new Request(url, { ...init, headers })
}

async function makeAvatarForm(fileName: string, fileType: string, body: string | Uint8Array<ArrayBuffer>): Promise<FormData> {
  const form = new FormData()
  form.set('file', new File([body], fileName, { type: fileType }))
  return form
}

describe('GET /api/avatars/:userId', () => {
  it('returns a deterministic identicon SVG when the user has no custom avatar', async () => {
    const { app } = createTestContext(() => null)
    const response = await app.handle(new Request('http://localhost/api/avatars/avatar_user'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/svg+xml')
    expect(await response.text()).toBe(generateAvatarSvg('avatar_user'))
  })

  it('falls back to the identicon for an unknown user', async () => {
    const { app } = createTestContext(() => undefined)
    const response = await app.handle(new Request('http://localhost/api/avatars/ghost'))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/svg+xml')
  })

  it('serves the uploaded custom avatar file when present', async () => {
    const root = join(tmpdir(), 'avatar-routes-test')
    await mkdir(join(root, 'avatars', 'avatar_user'), { recursive: true })
    await writeFile(join(root, 'avatars', 'avatar_user', 'a1.png'), 'fake-png-bytes')
    try {
      const { app } = createTestContext(() => 'avatars/avatar_user/a1.png')
      const response = await app.handle(new Request('http://localhost/api/avatars/avatar_user'))
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/png')
      expect(await response.text()).toBe('fake-png-bytes')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('gracefully falls back to the identicon when the stored file is missing (ENOENT)', async () => {
    const root = join(tmpdir(), 'avatar-routes-test')
    try {
      const { app } = createTestContext(() => 'avatars/avatar_user/missing.png')
      const response = await app.handle(new Request('http://localhost/api/avatars/avatar_user'))
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('image/svg+xml')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe('PATCH /api/auth/profile', () => {
  it('updates the display name and returns the refreshed user', async () => {
    const { app, auditInputs } = createTestContext(() => null)
    const response = await app.handle(authed('http://localhost/api/auth/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: ' 新昵称 ' }),
    }))
    expect(response.status).toBe(200)
    const body = await response.json() as { success: boolean; data: { user: { displayName: string } } }
    expect(body.success).toBe(true)
    expect(body.data.user.displayName).toBe('新昵称')
    expect(auditInputs).toContainEqual(expect.objectContaining({ action: 'auth.profile.update', outcome: 'succeeded' }))
  })

  it('rejects an empty display name with 400', async () => {
    const { app } = createTestContext(() => null)
    const response = await app.handle(authed('http://localhost/api/auth/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: '   ' }),
    }))
    expect(response.status).toBe(400)
  })

  it('requires authentication', async () => {
    const { app } = createTestContext(() => null)
    const response = await app.handle(new Request('http://localhost/api/auth/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'x' }),
    }))
    expect(response.status).toBe(401)
  })
})

describe('POST /api/auth/avatar', () => {
  it('accepts a PNG avatar and writes it to storage', async () => {
    const { app, storage, auditInputs } = createTestContext(() => null)
    const response = await app.handle(authed('http://localhost/api/auth/avatar', {
      method: 'POST',
      body: await makeAvatarForm('me.png', 'image/png', PNG_MAGIC),
    }))
    expect(response.status).toBe(200)
    const body = await response.json() as { success: boolean; data: { user: { hasAvatar: boolean } } }
    expect(body.data.user.hasAvatar).toBe(true)
    expect(storage.writes).toHaveLength(1)
    expect(storage.writes[0]?.key.startsWith('avatars/avatar_user/')).toBe(true)
    expect(auditInputs).toContainEqual(expect.objectContaining({ action: 'auth.avatar.update', outcome: 'succeeded' }))
  })

  it('rejects SVG files (XSS vector)', async () => {
    const { app, storage } = createTestContext(() => null)
    const response = await app.handle(authed('http://localhost/api/auth/avatar', {
      method: 'POST',
      body: await makeAvatarForm('x.svg', 'image/svg+xml', '<svg/>'),
    }))
    expect(response.status).toBe(400)
    expect(storage.writes).toHaveLength(0)
  })

  it('rejects files larger than 2MB', async () => {
    const { app, storage } = createTestContext(() => null)
    const big = makeAvatarForm('big.png', 'image/png', 'x'.repeat(2 * 1024 * 1024 + 1))
    const response = await app.handle(authed('http://localhost/api/auth/avatar', {
      method: 'POST',
      body: await big,
    }))
    expect(response.status).toBe(400)
    expect(storage.writes).toHaveLength(0)
  })

  it('requires authentication', async () => {
    const { app } = createTestContext(() => null)
    const response = await app.handle(new Request('http://localhost/api/auth/avatar', {
      method: 'POST',
      body: await makeAvatarForm('me.png', 'image/png', 'png'),
    }))
    expect(response.status).toBe(401)
  })
})

describe('DELETE /api/auth/avatar', () => {
  it('removes the custom avatar (idempotent even without one)', async () => {
    const { app, auditInputs } = createTestContext(() => null)
    const response = await app.handle(authed('http://localhost/api/auth/avatar', { method: 'DELETE' }))
    expect(response.status).toBe(200)
    const body = await response.json() as { success: boolean; data: { user: { hasAvatar: boolean } } }
    expect(body.data.user.hasAvatar).toBe(false)
    expect(auditInputs).toContainEqual(expect.objectContaining({ action: 'auth.avatar.remove', outcome: 'succeeded' }))
  })

  it('requires authentication', async () => {
    const { app } = createTestContext(() => null)
    const response = await app.handle(new Request('http://localhost/api/auth/avatar', { method: 'DELETE' }))
    expect(response.status).toBe(401)
  })
})
