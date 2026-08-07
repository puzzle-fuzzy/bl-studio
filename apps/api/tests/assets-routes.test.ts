import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createIsolatedGenerationRepository,
  createTestUser,
  resetGenerationRepositoryTestDb,
  type GenerationRepository,
  type IsolatedGenerationRepository,
  type RecordAuditEventInput,
  type ListUnifiedAssetsOptions,
} from '@bailian-studio/generation-repository'
import type {
  StorageAdapter,
  StorageReadUrlInput,
  StorageWriteInput,
  StorageWriteResult,
} from '@bailian-studio/storage'
import { createTestApp } from '../src/test-app'
import { createFakeAuthService } from './fake-auth-service'

/** P1-16：测试夹具用真实 PNG 魔数头，避免被新加的 sniff 校验拒绝。 */
const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

let isolated!: IsolatedGenerationRepository
let currentUserId = 'asset_owner'
let app: ReturnType<typeof createTestApp>['app']
let storage!: TestStorage
const auditInputs: RecordAuditEventInput[] = []
const listInputs: ListUnifiedAssetsOptions[] = []

class TestStorage implements StorageAdapter {
  readonly provider = 'local' as const
  readonly keyPrefix = ''
  private readCount = 0
  readonly readInputs: StorageReadUrlInput[] = []

  async writeObject(input: StorageWriteInput): Promise<StorageWriteResult> {
    return {
      provider: 'local',
      key: input.key,
      byteSize: input.body.byteLength,
    }
  }

  async createReadUrl(input: StorageReadUrlInput): Promise<string> {
    this.readInputs.push(input)
    this.readCount += 1
    const download = input.downloadFileName === undefined ? '' : '&download=1'
    return `/signed/${input.key}?read=${this.readCount}&ttl=${input.expiresInSeconds}${download}`
  }
}

const authService = createFakeAuthService(() => ({
  id: currentUserId,
  email: `${currentUserId}@example.com`,
  displayName: null,
  role: 'user',
}))

function authed(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set('cookie', 'bailian_studio_session=fake-token')
  return new Request(url, { ...init, headers })
}

function auditedRepository(repository: GenerationRepository): GenerationRepository {
  return new Proxy(repository, {
    get(target, property, receiver) {
      if (property === 'recordAuditEvent') {
        return async (input: RecordAuditEventInput) => {
          auditInputs.push(input)
          return target.recordAuditEvent(input)
        }
      }
      if (property === 'listUnifiedAssets') {
        return async (userId: string, options: ListUnifiedAssetsOptions = {}) => {
          listInputs.push(options)
          return target.listUnifiedAssets(userId, options)
        }
      }
      return Reflect.get(target, property, receiver)
    },
  })
}

beforeAll(async () => {
  isolated = await createIsolatedGenerationRepository({ max: 1 })
})

afterAll(async () => {
  await isolated.close()
})

beforeEach(async () => {
  currentUserId = 'asset_owner'
  auditInputs.length = 0
  listInputs.length = 0
  await resetGenerationRepositoryTestDb(isolated.db)
  await createTestUser(isolated.db, currentUserId)
  storage = new TestStorage()
  app = createTestApp({
    authService,
    generationRepository: auditedRepository(isolated.repository),
    storage,
  }).app
})

describe('asset routes', () => {
  it('returns authenticated upload capabilities before the dynamic id route', async () => {
    const response = await app.handle(authed('http://localhost/api/assets/capabilities'))
    const body = await response.json() as {
      success: true
      data: {
        maxAssetSizeBytes: number
        maxMediaDurationSeconds?: number
        allowedMimeTypes: string[]
        allowedKinds: string[]
      }
    }

    expect(response.status).toBe(200)
    expect(body.data.maxAssetSizeBytes).toBeGreaterThan(0)
    expect(body.data.allowedMimeTypes).toContain('image/png')
    expect(body.data.allowedKinds).toEqual(['image', 'video', 'audio', 'text', 'archive'])
  })

  it('searches generated assets by model display name and hides storage coordinates', async () => {
    await isolated.repository.createUserAsset({
      id: 'asset_qwen',
      userId: currentUserId,
      kind: 'image',
      source: 'generation',
      modelId: 'qwen-image',
      storageProvider: 'local',
      storageKey: 'generations/qwen/result.png',
      mimeType: 'image/png',
    })
    await isolated.repository.createUserAsset({
      id: 'asset_other',
      userId: currentUserId,
      kind: 'video',
      source: 'upload',
      fileName: 'other.mp4',
      storageProvider: 'local',
      storageKey: 'uploads/other.mp4',
    })

    const response = await app.handle(authed('http://localhost/api/assets?q=Qwen%20Image'))
    const body = await response.json() as {
      success: true
      data: { items: Array<Record<string, unknown>> }
    }

    expect(response.status).toBe(200)
    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0]?.['id']).toBe('asset_qwen')
    expect(body.data.items[0]?.['url']).toContain('/signed/generations/qwen/result.png')
    expect(body.data.items[0]).not.toHaveProperty('storageKey')
    expect(body.data.items[0]).not.toHaveProperty('storageProvider')
    expect(body.data.items[0]).not.toHaveProperty('generationArtifactId')
  })

  it('validates and passes through asset sort while returning declared resolution metadata', async () => {
    await isolated.repository.createUserAsset({
      id: 'asset_metadata',
      userId: currentUserId,
      kind: 'image',
      source: 'generation',
      metadata: { width: 1328, height: 1328 },
    })

    const response = await app.handle(authed('http://localhost/api/assets?sort=title&source=generation'))
    const body = await response.json() as { data: { items: Array<Record<string, unknown>> } }

    expect(response.status).toBe(200)
    expect(listInputs.at(-1)).toMatchObject({ sort: 'title', source: 'generation' })
    expect(body.data.items[0]).toMatchObject({
      id: 'asset_metadata',
      declaredResolution: '1328×1328',
    })

    const defaultResponse = await app.handle(authed('http://localhost/api/assets'))
    expect(defaultResponse.status).toBe(200)
    expect(listInputs.at(-1)).toMatchObject({ sort: 'time' })

    const invalid = await app.handle(authed('http://localhost/api/assets?sort=recent'))
    expect(invalid.status).toBe(400)
    expect(listInputs).toHaveLength(2)
  })

  it('returns fresh detail download URLs, omits them from lists, and scopes details to the owner', async () => {
    await isolated.repository.createUserAsset({
      id: 'asset_detail',
      userId: currentUserId,
      kind: 'image',
      source: 'upload',
      fileName: '报告\r\nInjected: yes.png',
      storageProvider: 'local',
      storageKey: 'uploads/detail.png',
    })

    const first = await app.handle(authed('http://localhost/api/assets/asset_detail'))
    const second = await app.handle(authed('http://localhost/api/assets/asset_detail'))
    const firstBody = await first.json() as { data: { asset: { url: string; downloadUrl: string } } }
    const secondBody = await second.json() as { data: { asset: { url: string; downloadUrl: string } } }

    expect(firstBody.data.asset.url).not.toBe(secondBody.data.asset.url)
    expect(firstBody.data.asset.downloadUrl).not.toBe(secondBody.data.asset.downloadUrl)
    expect(storage.readInputs.filter(input => input.downloadFileName !== undefined)).toEqual([
      {
        key: 'uploads/detail.png',
        expiresInSeconds: 3600,
        downloadFileName: '报告_Injected: yes.png',
      },
      {
        key: 'uploads/detail.png',
        expiresInSeconds: 3600,
        downloadFileName: '报告_Injected: yes.png',
      },
    ])

    storage.readInputs.length = 0
    const list = await app.handle(authed('http://localhost/api/assets'))
    const listBody = await list.json() as { data: { items: Array<Record<string, unknown>> } }
    expect(listBody.data.items.find(item => item['id'] === 'asset_detail')).not.toHaveProperty('downloadUrl')
    expect(storage.readInputs.every(input => input.downloadFileName === undefined)).toBe(true)

    currentUserId = 'asset_intruder'
    await createTestUser(isolated.db, currentUserId)
    const denied = await app.handle(authed('http://localhost/api/assets/asset_detail'))
    expect(denied.status).toBe(404)
  })

  it('adds a MIME-derived extension when a generated asset has no stored filename', async () => {
    await isolated.repository.createUserAsset({
      id: 'asset_generated_download',
      userId: currentUserId,
      kind: 'image',
      source: 'generation',
      mimeType: 'image/png',
      storageProvider: 'local',
      storageKey: 'generations/generated/image-output',
    })

    const response = await app.handle(authed('http://localhost/api/assets/asset_generated_download'))

    expect(response.status).toBe(200)
    expect(storage.readInputs.filter(input => input.downloadFileName !== undefined)).toEqual([
      {
        key: 'generations/generated/image-output',
        expiresInSeconds: 3600,
        downloadFileName: 'asset-asset_generated_download.png',
      },
    ])
  })

  it('omits download URLs and download signing for external or mismatched storage', async () => {
    await isolated.repository.createUserAsset({
      id: 'asset_external',
      userId: currentUserId,
      kind: 'image',
      source: 'link',
      originalUrl: 'https://example.test/external.png',
    })
    await isolated.repository.createUserAsset({
      id: 'asset_provider_mismatch',
      userId: currentUserId,
      kind: 'image',
      source: 'upload',
      storageProvider: 'oss',
      storageKey: 'uploads/mismatch.png',
    })

    const externalResponse = await app.handle(authed('http://localhost/api/assets/asset_external'))
    const mismatchResponse = await app.handle(authed('http://localhost/api/assets/asset_provider_mismatch'))
    const externalBody = await externalResponse.json() as { data: { asset: Record<string, unknown> } }
    const mismatchBody = await mismatchResponse.json() as { data: { asset: Record<string, unknown> } }

    expect(externalResponse.status).toBe(200)
    expect(mismatchResponse.status).toBe(200)
    expect(externalBody.data.asset).not.toHaveProperty('downloadUrl')
    expect(mismatchBody.data.asset).not.toHaveProperty('downloadUrl')
    expect(storage.readInputs.filter(input => input.downloadFileName !== undefined)).toEqual([])
  })

  it('returns a persisted local thumbnail without exposing derivative coordinates', async () => {
    await isolated.repository.createUserAsset({
      id: 'asset_with_thumbnail',
      userId: currentUserId,
      kind: 'image',
      source: 'upload',
      storageProvider: 'local',
      storageKey: 'uploads/full.png',
      enqueueThumbnail: true,
    })
    const task = await isolated.repository.claimNextQueuedTask({
      workerId: 'thumbnail-test-worker',
      now: new Date().toISOString(),
      lockedUntil: new Date(Date.now() + 30_000).toISOString(),
    })
    const derivativeId = task?.input['derivativeId']
    if (typeof derivativeId !== 'string') throw new Error('thumbnail derivative task missing')
    await isolated.repository.completeAssetThumbnail({
      derivativeId,
      storageProvider: 'local',
      storageKey: `asset-thumbnails/asset_with_thumbnail/${derivativeId}.webp`,
      mimeType: 'image/webp',
      byteSize: 256,
    })

    const response = await app.handle(authed('http://localhost/api/assets/asset_with_thumbnail'))
    const body = await response.json() as { data: { asset: Record<string, unknown> } }

    expect(response.status).toBe(200)
    expect(body.data.asset).toMatchObject({
      thumbnailStatus: 'ready',
      thumbnailUrl: `/signed/asset-thumbnails/asset_with_thumbnail/${derivativeId}.webp?read=2&ttl=3600`,
    })
    expect(body.data.asset).not.toHaveProperty('thumbnailStorageKey')
    expect(body.data.asset).not.toHaveProperty('thumbnailStorageProvider')
  })

  it('soft-deletes an owned asset and records a non-sensitive audit event', async () => {
    await isolated.repository.createUserAsset({
      id: 'asset_delete',
      userId: currentUserId,
      kind: 'text',
      source: 'link',
      originalUrl: 'https://private.example.test/secret.txt?token=hidden',
    })

    const response = await app.handle(authed('http://localhost/api/assets/asset_delete', {
      method: 'DELETE',
    }))

    expect(response.status).toBe(204)
    expect(await isolated.repository.getUserAsset({
      userId: currentUserId,
      assetId: 'asset_delete',
    })).toBeUndefined()
    expect(await isolated.repository.getUserAsset({
      userId: currentUserId,
      assetId: 'asset_delete',
      includeDeleted: true,
    })).toBeDefined()
    expect(auditInputs.at(-1)).toMatchObject({
      action: 'asset.delete',
      outcome: 'succeeded',
      targetId: 'asset_delete',
    })
    expect(JSON.stringify(auditInputs)).not.toContain('private.example.test')
  })

  it('audits successful uploads and link imports without persisting URLs in metadata', async () => {
    const uploadForm = new FormData()
    uploadForm.set('file', new File([PNG_MAGIC], 'reference.png', { type: 'image/png' }))
    const uploadResponse = await app.handle(authed('http://localhost/api/assets/upload', {
      method: 'POST',
      body: uploadForm,
    }))
    expect(uploadResponse.status).toBe(200)

    const importResponse = await app.handle(authed('http://localhost/api/assets/import', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'video',
        url: 'https://private.example.test/video.mp4?token=hidden',
      }),
    }))
    expect(importResponse.status).toBe(200)
    expect(auditInputs.map(input => input.action)).toEqual(['asset.upload', 'asset.import'])
    expect(JSON.stringify(auditInputs)).not.toContain('private.example.test')
  })
})
