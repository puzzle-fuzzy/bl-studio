import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createCreditLedger, type CreditLedger } from '@bailian-studio/credit-ledger'
import {
  createIsolatedGenerationRepository,
  createTestUser,
  resetGenerationRepositoryTestDb,
  type IsolatedGenerationRepository,
} from '@bailian-studio/generation-repository'
import type { StorageAdapter, StorageReadUrlInput, StorageWriteInput, StorageWriteResult } from '@bailian-studio/storage'
import { createTestApp } from '../src/test-app'
import { createFakeAuthService } from './fake-auth-service'

let iso!: IsolatedGenerationRepository
let testCreditLedger!: CreditLedger
let app: ReturnType<typeof createTestApp>['app']

class FakeStorageAdapter implements StorageAdapter {
  readonly provider = 'local'
  readonly keyPrefix = ''
  writeObject(_input: StorageWriteInput): Promise<StorageWriteResult> {
    return Promise.reject(new Error('FakeStorageAdapter.writeObject is not used'))
  }
  createReadUrl(input: StorageReadUrlInput): Promise<string> {
    return Promise.resolve(`/signed/${input.key}?ttl=${input.expiresInSeconds}`)
  }
}

// Fake auth: any non-empty bailian_studio_session token authenticates as `currentUserId`.
// Tests mutate currentUserId to impersonate owner vs intruder.
let currentUserId = 'owner'
const fakeAuthService = createFakeAuthService(() => ({
  id: currentUserId,
  email: 'u@e.test',
  displayName: null,
  role: 'user',
}))

function authed(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set('cookie', 'bailian_studio_session=fake-token')
  return new Request(url, { ...init, headers })
}

const seededUsers = new Set<string>()
async function ensureUserSeeded(id: string): Promise<void> {
  if (seededUsers.has(id)) return
  seededUsers.add(id)
  await createTestUser(iso.databaseUrl, id)
  await testCreditLedger.grant({
    userId: id,
    amountCents: 1_000_000,
    reason: 'share route fixture',
    idempotencyKey: `fixture:${id}`,
    actorUserId: id,
  })
}

async function createGenerationAs(userId: string): Promise<string> {
  currentUserId = userId
  await ensureUserSeeded(userId)
  const response = await app.handle(authed('http://localhost/api/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ modelId: 'qwen-image', params: { prompt: 'lantern', n: 1, size: '1328*1328' } }),
  }))
  const body = await response.json() as { success: true; data: { record: { id: string } } }
  return body.data.record.id
}

beforeAll(async () => {
  iso = await createIsolatedGenerationRepository({ max: 1 })
  testCreditLedger = createCreditLedger({ db: iso.db })
})

beforeEach(async () => {
  await resetGenerationRepositoryTestDb(iso.databaseUrl)
  seededUsers.clear()
  app = createTestApp({
    authService: fakeAuthService,
    generationRepository: iso.repository,
    creditLedger: testCreditLedger,
    storage: new FakeStorageAdapter(),
  }).app
})

afterAll(async () => {
  await iso.close()
})

describe('generation share routes', () => {
  it('lets an owner create and fetch a generation share', async () => {
    const recordId = await createGenerationAs('owner')

    const create = await app.handle(authed(`http://localhost/api/generations/${recordId}/share`, { method: 'POST' }))
    const created = await create.json() as { success: true; data: { share: { id: string; recordId: string } } }
    expect(create.status).toBe(200)
    expect(created.data.share.recordId).toBe(recordId)

    const get = await app.handle(authed(`http://localhost/api/generations/${recordId}/share`))
    const fetched = await get.json() as { success: true; data: { share: { id: string } } }
    expect(fetched.data.share.id).toBe(created.data.share.id)
  })

  it('returns the existing share when create is repeated', async () => {
    const recordId = await createGenerationAs('owner')
    const first = await (await app.handle(authed(`http://localhost/api/generations/${recordId}/share`, { method: 'POST' }))).json() as { success: true; data: { share: { id: string } } }
    const second = await (await app.handle(authed(`http://localhost/api/generations/${recordId}/share`, { method: 'POST' }))).json() as { success: true; data: { share: { id: string } } }
    expect(second.data.share.id).toBe(first.data.share.id)
  })

  it('returns 404 when another user creates a share', async () => {
    const recordId = await createGenerationAs('owner')
    currentUserId = 'intruder'
    await ensureUserSeeded('intruder')

    const response = await app.handle(authed(`http://localhost/api/generations/${recordId}/share`, { method: 'POST' }))
    expect(response.status).toBe(404)
  })

  it('returns a public shared generation without exposing params or storage keys', async () => {
    const recordId = await createGenerationAs('owner')
    await iso.repository.completeGeneration({
      recordId,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://cdn.test/a.png', mimeType: 'image/png' }] },
      enqueueArtifactPersist: false,
    })
    const artifacts = await iso.repository.listArtifactsForRecord(recordId)
    await iso.repository.markArtifactStored({
      artifactId: artifacts[0]!.id,
      storageProvider: 'local',
      storageKey: `generations/${recordId}/${artifacts[0]!.id}.png`,
      byteSize: 123,
      mimeType: 'image/png',
    })
    const share = await (await app.handle(authed(`http://localhost/api/generations/${recordId}/share`, { method: 'POST' }))).json() as { success: true; data: { share: { id: string } } }

    const response = await app.handle(new Request(`http://localhost/api/shares/generations/${share.data.share.id}`))
    const body = await response.json() as { success: true; data: { record: { id: string }; artifacts: Array<{ readUrl?: string }> } }

    expect(response.status).toBe(200)
    expect(body.data.record.id).toBe(recordId)
    expect(body.data.artifacts[0]?.readUrl).toContain(`/api/shares/generations/${share.data.share.id}/artifacts/`)

    const json = JSON.stringify(body)
    expect(json).not.toContain('idempotencyKey')
    expect(json).not.toContain('costEstimate')
    expect(json).not.toContain('userId')
    expect(json).not.toContain('lantern')
    expect(json).not.toContain('storageKey')
  })

  it('serves a local shared artifact through the share-scoped route', async () => {
    const root = await mkdtemp(join(tmpdir(), 'bailian-studio-api-share-'))
    try {
      app = createTestApp({
        authService: fakeAuthService,
        generationRepository: iso.repository,
        storage: new FakeStorageAdapter(),
        artifactLocalRoot: root,
      }).app
      const recordId = await createGenerationAs('owner')
      await iso.repository.completeGeneration({
        recordId,
        costFinal: 20,
        output: { artifacts: [{ kind: 'text', sourceUrl: 'https://cdn.test/a.txt', mimeType: 'text/plain' }] },
        enqueueArtifactPersist: false,
      })
      const artifacts = await iso.repository.listArtifactsForRecord(recordId)
      const artifact = artifacts[0]
      if (artifact === undefined) throw new Error('expected shared artifact')
      const storageKey = `generations/${recordId}/${artifact.id}.txt`
      await iso.repository.markArtifactStored({
        artifactId: artifact.id,
        storageProvider: 'local',
        storageKey,
        byteSize: 5,
        mimeType: 'text/plain',
      })
      await mkdir(join(root, 'generations', recordId), { recursive: true })
      await writeFile(join(root, storageKey), 'hello')
      const share = await (await app.handle(authed(`http://localhost/api/generations/${recordId}/share`, { method: 'POST' }))).json() as { success: true; data: { share: { id: string } } }

      const publicResponse = await app.handle(new Request(`http://localhost/api/shares/generations/${share.data.share.id}`))
      const publicBody = await publicResponse.json() as { success: true; data: { artifacts: Array<{ readUrl?: string }> } }
      const readUrl = publicBody.data.artifacts[0]?.readUrl
      if (readUrl === undefined) throw new Error('expected public read url')

      const artifactResponse = await app.handle(new Request(`http://localhost${readUrl}`))
      expect(artifactResponse.status).toBe(200)
      expect(artifactResponse.headers.get('cache-control')).toBe('public, max-age=300')
      expect(artifactResponse.headers.get('content-length')).toBe('5')
      expect(await artifactResponse.text()).toBe('hello')

      app = createTestApp({
        authService: fakeAuthService,
        generationRepository: iso.repository,
        storage: new FakeStorageAdapter(),
        artifactLocalRoot: root,
        artifactConfig: { maxReadBytes: 4 },
      }).app
      const oversized = await app.handle(new Request(`http://localhost${readUrl}`))
      const oversizedBody = await oversized.json() as { success: false; error: { code: string } }
      expect(oversized.status).toBe(413)
      expect(oversizedBody.error.code).toBe('ARTIFACT_TOO_LARGE')
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('allows explicit params sharing and owner revocation', async () => {
    const recordId = await createGenerationAs('owner')
    const create = await app.handle(authed(`http://localhost/api/generations/${recordId}/share`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ includeParams: true }),
    }))
    const created = await create.json() as { success: true; data: { share: { id: string; includeParams: boolean } } }
    expect(created.data.share.includeParams).toBe(true)

    const publicResponse = await app.handle(new Request(`http://localhost/api/shares/generations/${created.data.share.id}`))
    const publicBody = await publicResponse.json() as { success: true; data: { record: { inputParams?: { prompt?: string } } } }
    expect(publicBody.data.record.inputParams?.prompt).toBe('lantern')

    const revoke = await app.handle(authed(`http://localhost/api/generations/${recordId}/share`, { method: 'DELETE' }))
    expect(revoke.status).toBe(200)

    const afterRevoke = await app.handle(new Request(`http://localhost/api/shares/generations/${created.data.share.id}`))
    expect(afterRevoke.status).toBe(404)
  })

  it('returns 404 for an unknown share id', async () => {
    const response = await app.handle(new Request('http://localhost/api/shares/generations/share_missing', {
      headers: { 'x-request-id': 'share-inline-error-1' },
    }))
    const body = await response.json() as { success: false; error: { code: string }; traceId?: string }
    expect(response.status).toBe(404)
    expect(body.error.code).toBe('SHARE_NOT_FOUND')
    expect(body.traceId).toBe('share-inline-error-1')
  })
})
