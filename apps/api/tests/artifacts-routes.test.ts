import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createIsolatedGenerationRepository,
  createTestUser,
  resetGenerationRepositoryTestDb,
  type IsolatedGenerationRepository,
} from '@bailian-studio/generation-repository'
import { createMediaRepositoryFromUrl } from '@bailian-studio/media-repository/test-utils'
import { createCreditLedger, type CreditLedger } from '@bailian-studio/credit-ledger'
import type { StorageAdapter, StorageReadUrlInput, StorageWriteInput, StorageWriteResult } from '@bailian-studio/storage'
import { createTestApp } from '../src/test-app'
import { createFakeAuthService } from './fake-auth-service'

let roots: string[] = []
let app: ReturnType<typeof createTestApp>['app']
let testCreditLedger!: CreditLedger

afterEach(async () => {
  await Promise.all(roots.map(root => rm(root, { recursive: true, force: true })))
  roots = []
})

async function makeRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'bailian-studio-api-artifacts-'))
  roots.push(root)
  app = createTestApp({
    authService: fakeAuthService,
    generationRepository: iso.repository,
    storage: new FakeStorageAdapter(),
    artifactLocalRoot: root,
  }).app
  return root
}

describe('artifact routes', () => {
  it('requires authentication for local artifact reads', async () => {
    const root = await makeRoot()
    await mkdir(join(root, 'generations/gen_1'), { recursive: true })
    await writeFile(join(root, 'generations/gen_1/artifact_1.txt'), 'hello')

    const response = await app.handle(new Request('http://localhost/api/artifacts/local/generations/gen_1/artifact_1.txt'))

    expect(response.status).toBe(401)
  })

  it('serves a local artifact only when the key belongs to the current user', async () => {
    const root = await makeRoot()
    await prepareLocalRouteTest()
    await seedLocalAsset('generations/gen_1/artifact_1.txt', 'text/plain')
    await mkdir(join(root, 'generations/gen_1'), { recursive: true })
    await writeFile(join(root, 'generations/gen_1/artifact_1.txt'), 'hello')

    const response = await app.handle(authed('http://localhost/api/artifacts/local/generations/gen_1/artifact_1.txt'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(response.headers.get('content-length')).toBe('5')
    expect(await response.text()).toBe('hello')

    currentUserId = 'artifact_intruder'
    await ensureCurrentUserSeeded()
    const denied = await app.handle(authed('http://localhost/api/artifacts/local/generations/gen_1/artifact_1.txt'))
    expect(denied.status).toBe(404)
  })

  it('adds a sanitized attachment header only for marked local download URLs', async () => {
    const root = await makeRoot()
    await prepareLocalRouteTest()
    await seedLocalAsset(
      'uploads/report.txt',
      'text/plain',
      'asset_report',
      '报告\r\nX-Evil: injected.txt',
    )
    await mkdir(join(root, 'uploads'), { recursive: true })
    await writeFile(join(root, 'uploads/report.txt'), 'hello')

    const inline = await app.handle(authed('http://localhost/api/artifacts/local/uploads/report.txt'))
    const download = await app.handle(authed(
      'http://localhost/api/artifacts/local/uploads/report.txt?download=1&filename=attacker.exe',
    ))

    expect(inline.headers.get('content-disposition')).toBeNull()
    expect(download.status).toBe(200)
    expect(download.headers.get('content-disposition')).toBe(
      `attachment; filename="X-Evil_injected.txt"; filename*=UTF-8''%E6%8A%A5%E5%91%8A_X-Evil%3A%20injected.txt`,
    )
    expect(await download.text()).toBe('hello')
  })

  it('adds a MIME-derived extension to unnamed local asset downloads', async () => {
    const root = await makeRoot()
    await prepareLocalRouteTest()
    await seedLocalAsset('generations/gen_1/video-output', 'video/mp4', 'generated_video')
    await mkdir(join(root, 'generations/gen_1'), { recursive: true })
    await writeFile(join(root, 'generations/gen_1/video-output'), 'video')

    const response = await app.handle(authed(
      'http://localhost/api/artifacts/local/generations/gen_1/video-output?download=1',
    ))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="asset-generated_video.mp4"; filename*=UTF-8''asset-generated_video.mp4`,
    )
    expect(await response.text()).toBe('video')
  })

  it('uses the path-derived content type for unnamed legacy local downloads', async () => {
    const root = await makeRoot()
    await prepareLocalRouteTest()
    await iso.assetRepository.createUserAsset({
      id: 'legacy_image',
      userId: currentUserId,
      kind: 'image',
      source: 'generation',
      storageProvider: 'local',
      storageKey: 'generations/gen_1/legacy-image.png',
    })
    await mkdir(join(root, 'generations/gen_1'), { recursive: true })
    await writeFile(join(root, 'generations/gen_1/legacy-image.png'), 'image')

    const response = await app.handle(authed(
      'http://localhost/api/artifacts/local/generations/gen_1/legacy-image.png?download=1',
    ))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('image/png')
    expect(response.headers.get('content-disposition')).toBe(
      `attachment; filename="asset-legacy_image.png"; filename*=UTF-8''asset-legacy_image.png`,
    )
  })

  it('returns 404 for a missing owned local artifact', async () => {
    await makeRoot()
    await prepareLocalRouteTest()
    await seedLocalAsset('generations/missing.txt', 'text/plain')

    const response = await app.handle(authed('http://localhost/api/artifacts/local/generations/missing.txt', {
      headers: { 'x-request-id': 'artifact-inline-error-1' },
    }))
    const body = await response.json() as { success: false; error: { code: string }; traceId?: string }

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('ARTIFACT_NOT_FOUND')
    expect(body.traceId).toBe('artifact-inline-error-1')
  })

  it('rejects unsafe local artifact keys', async () => {
    await makeRoot()
    await prepareLocalRouteTest()

    const response = await app.handle(authed('http://localhost/api/artifacts/local/..%2Fsecret.txt'))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('INVALID_ARTIFACT_KEY')
  })

  it('returns 400 for an empty artifact key', async () => {
    await makeRoot()
    await prepareLocalRouteTest()

    const response = await app.handle(authed('http://localhost/api/artifacts/local/'))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('INVALID_ARTIFACT_KEY')
  })

  it('derives the content-type from the artifact extension', async () => {
    const root = await makeRoot()
    await prepareLocalRouteTest()
    await mkdir(join(root, 'gen'), { recursive: true })

    const cases = [
      { file: 'a.png', content: 'img', expected: 'image/png' },
      { file: 'b.jpg', content: 'img', expected: 'image/jpeg' },
      { file: 'c.mp4', content: 'vid', expected: 'video/mp4' },
      { file: 'd.json', content: '{}', expected: 'application/json; charset=utf-8' },
      { file: 'e.bin', content: 'x', expected: 'application/octet-stream' },
    ]
    for (const [index, { file, content, expected }] of cases.entries()) {
      await seedLocalAsset(`gen/${file}`, expected, `local_extension_${index}`)
      await writeFile(join(root, 'gen', file), content)
      const response = await app.handle(authed(`http://localhost/api/artifacts/local/gen/${file}`))
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe(expected)
    }
  })

  it('streams local artifacts and enforces the configured response limit', async () => {
    const root = await makeRoot()
    await prepareLocalRouteTest()
    await seedLocalAsset('gen/stream.txt', 'text/plain', 'stream_asset')
    await mkdir(join(root, 'gen'), { recursive: true })
    await writeFile(join(root, 'gen', 'stream.txt'), 'hello')

    app = createTestApp({
      authService: fakeAuthService,
      generationRepository: iso.repository,
      storage: new FakeStorageAdapter(),
      artifactLocalRoot: root,
      artifactConfig: { maxReadBytes: 4 },
    }).app
    const response = await app.handle(authed('http://localhost/api/artifacts/local/gen/stream.txt'))
    const body = await response.json() as { success: false; error: { code: string; details?: { bytes: number; limit: number } } }

    expect(response.status).toBe(413)
    expect(body.error.code).toBe('ARTIFACT_TOO_LARGE')
    expect(body.error.details).toEqual({ bytes: 5, limit: 4 })
  })
})

// 「我的作品库」列表端点（GET /api/artifacts）需要 auth + repository + storage
// 三件套，与 generations-routes 测试共用同一套 fake 脚手架模式。
let iso!: IsolatedGenerationRepository

class FakeStorageAdapter implements StorageAdapter {
  constructor(readonly provider: 'local' | 'oss' = 'local') {}
  readonly keyPrefix = ''
  writeObject(_input: StorageWriteInput): Promise<StorageWriteResult> {
    return Promise.reject(new Error('FakeStorageAdapter.writeObject is not used'))
  }
  createReadUrl(input: StorageReadUrlInput): Promise<string> {
    const process = input.process === undefined ? '' : `&x-oss-process=${encodeURIComponent(input.process)}`
    return Promise.resolve(`/signed/${input.key}?ttl=${input.expiresInSeconds}${process}`)
  }
}

// 假认证：任意非空 cookie token 都会以 `currentUserId` 身份通过认证。
let currentUserId = 'user_1'
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
async function ensureCurrentUserSeeded(): Promise<void> {
  if (seededUsers.has(currentUserId)) return
  seededUsers.add(currentUserId)
  await createTestUser(iso.databaseUrl, currentUserId)
  await testCreditLedger.grant({
    userId: currentUserId,
    amountCents: 1_000_000,
    reason: 'artifact route fixture',
    idempotencyKey: `fixture:${currentUserId}`,
    actorUserId: currentUserId,
  })
}

async function prepareLocalRouteTest(): Promise<void> {
  currentUserId = 'artifact_owner'
  await ensureCurrentUserSeeded()
  app = createTestApp({
    authService: fakeAuthService,
    generationRepository: iso.repository,
    storage: new FakeStorageAdapter(),
    artifactLocalRoot: roots.at(-1),
  }).app
}

async function seedLocalAsset(
  storageKey: string,
  mimeType: string,
  id = `local_${storageKey.replaceAll('/', '_')}`,
  fileName?: string,
): Promise<void> {
  await iso.assetRepository.createUserAsset({
    id,
    userId: currentUserId,
    kind: mimeType.startsWith('video/') ? 'video' : mimeType.startsWith('audio/') ? 'audio' : 'image',
    source: 'upload',
    ...(fileName !== undefined ? { fileName } : {}),
    mimeType,
    storageProvider: 'local',
    storageKey,
  })
}

beforeAll(async () => {
  iso = await createIsolatedGenerationRepository({ max: 1 })
  testCreditLedger = createCreditLedger({ db: iso.db })
})

afterAll(async () => {
  await iso.close()
})

describe('artifact library routes', () => {
  beforeEach(async () => {
    currentUserId = 'user_1'
    await resetGenerationRepositoryTestDb(iso.databaseUrl)
    seededUsers.clear()
    app = createTestApp({
      authService: fakeAuthService,
      generationRepository: iso.repository,
      creditLedger: testCreditLedger,
      storage: new FakeStorageAdapter(),
    }).app
  })

  it('returns only the current user artifacts with read urls', async () => {
    // 为 owner 与另一用户各创建一条带产物的生成。
    currentUserId = 'library_owner'
    await ensureCurrentUserSeeded()
    const ownerGen = await iso.repository.createGeneration({ userId: 'library_owner', modelId: 'qwen-image', params: { prompt: 'a' } })
    await iso.repository.completeGeneration({
      recordId: ownerGen.record.id,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://cdn.test/a.png' }] },
    })
    const [ownerArtifact] = await iso.repository.listArtifactsForRecord(ownerGen.record.id)
    if (ownerArtifact === undefined) throw new Error('expected owner artifact')
    await iso.repository.markArtifactStored({
      artifactId: ownerArtifact.id,
      storageProvider: 'local',
      storageKey: `generations/${ownerGen.record.id}/${ownerArtifact.id}.png`,
      byteSize: 100,
      mimeType: 'image/png',
    })

    currentUserId = 'library_other'
    await ensureCurrentUserSeeded()
    const otherGen = await iso.repository.createGeneration({ userId: 'library_other', modelId: 'qwen-image', params: { prompt: 'b' } })
    await iso.repository.completeGeneration({
      recordId: otherGen.record.id,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://cdn.test/b.png' }] },
    })

    currentUserId = 'library_owner'
    const response = await app.handle(authed('http://localhost/api/artifacts'))
    const body = await response.json() as {
      success: true
      data: { items: Array<{ userId: string; readUrl?: string; status: string }> }
    }

    expect(response.status).toBe(200)
    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0]?.userId).toBe('library_owner')
    expect(body.data.items[0]?.readUrl).toContain('/signed/')
    expect(body.data.items[0]?.status).toBe('stored')
  })

  it('lists derived media assets for Library filtering and reuse', async () => {
    currentUserId = 'library_owner'
    await ensureCurrentUserSeeded()
    await seedLocalAsset('uploads/source-video.mp4', 'video/mp4', 'source_video_1')

    const mediaHandle = createMediaRepositoryFromUrl(iso.databaseUrl)
    try {
      const created = await mediaHandle.repository.createMediaJob({
        userId: currentUserId,
        operation: 'video.extract_audio',
        source: { assetId: 'source_video_1', kind: 'video' },
      })
      await mediaHandle.repository.completeMediaJob({
        jobId: created.job.id,
        outputAsset: {
          id: 'derived_audio_1',
          kind: 'audio',
          fileName: 'video.mp3',
          mimeType: 'audio/mpeg',
          byteSize: 2048,
          storageProvider: 'local',
          storageKey: `media-jobs/${created.job.id}/derived_audio_1.mp3`,
        },
      })
    } finally {
      await mediaHandle.close()
    }

    const response = await app.handle(authed('http://localhost/api/assets?kind=audio&source=derived'))
    const body = await response.json() as {
      success: true
      data: { items: Array<{ id: string; kind: string; source: string; url?: string }> }
    }

    expect(response.status).toBe(200)
    expect(body.data.items).toEqual([
      expect.objectContaining({
        id: 'derived_audio_1',
        kind: 'audio',
        source: 'derived',
      }),
    ])
    expect(body.data.items[0]?.url).toContain('/signed/media-jobs/')
  })

  it('returns a signed read URL for stored image assets in the unified Library list', async () => {
    currentUserId = 'library_owner'
    await ensureCurrentUserSeeded()
    await iso.assetRepository.createUserAsset({
      id: 'uploaded_image_1',
      userId: currentUserId,
      kind: 'image',
      source: 'upload',
      fileName: 'cover.png',
      mimeType: 'image/png',
      storageProvider: 'local',
      storageKey: 'uploads/library_owner/cover.png',
    })

    const response = await app.handle(authed('http://localhost/api/assets?kind=image&source=upload'))
    const body = await response.json() as {
      success: true
      data: { items: Array<{ id: string; kind: string; source: string; url?: string }> }
    }

    expect(response.status).toBe(200)
    expect(body.data.items).toEqual([
      expect.objectContaining({
        id: 'uploaded_image_1',
        kind: 'image',
        source: 'upload',
        url: '/signed/uploads/library_owner/cover.png?ttl=3600',
      }),
    ])
  })

  it('returns a real OSS image thumbnail without replacing the original asset URL', async () => {
    currentUserId = 'library_owner'
    await ensureCurrentUserSeeded()
    app = createTestApp({
      authService: fakeAuthService,
      generationRepository: iso.repository,
      storage: new FakeStorageAdapter('oss'),
    }).app
    await iso.assetRepository.createUserAsset({
      id: 'uploaded_image_oss_1',
      userId: currentUserId,
      kind: 'image',
      source: 'upload',
      fileName: 'portrait.png',
      mimeType: 'image/png',
      storageProvider: 'oss',
      storageKey: 'user_uploads/library_owner/portrait.png',
    })

    const response = await app.handle(authed('http://localhost/api/assets?kind=image&source=upload'))
    const body = await response.json() as {
      success: true
      data: { items: Array<{ id: string; url?: string; thumbnailUrl?: string }> }
    }

    expect(response.status).toBe(200)
    expect(body.data.items[0]).toEqual(expect.objectContaining({
      id: 'uploaded_image_oss_1',
      url: '/signed/user_uploads/library_owner/portrait.png?ttl=3600',
      thumbnailUrl: '/signed/user_uploads/library_owner/portrait.png?ttl=3600&x-oss-process=image%2Fresize%2Cm_lfit%2Cw_640%2Ch_640%2Fformat%2Cwebp%2Fquality%2CQ_80',
    }))
  })

  it('returns a separately signed OSS video thumbnail URL without changing the original media URL', async () => {
    currentUserId = 'library_owner'
    await ensureCurrentUserSeeded()
    app = createTestApp({
      authService: fakeAuthService,
      generationRepository: iso.repository,
      storage: new FakeStorageAdapter('oss'),
    }).app
    await iso.assetRepository.createUserAsset({
      id: 'uploaded_video_1',
      userId: currentUserId,
      kind: 'video',
      source: 'upload',
      fileName: 'clip.mp4',
      mimeType: 'video/mp4',
      storageProvider: 'oss',
      storageKey: 'user_uploads/library_owner/clip.mp4',
    })

    const response = await app.handle(authed('http://localhost/api/assets?kind=video&source=upload'))
    const body = await response.json() as {
      success: true
      data: { items: Array<{ id: string; url?: string; thumbnailUrl?: string }> }
    }

    expect(response.status).toBe(200)
    expect(body.data.items[0]).toEqual(expect.objectContaining({
      id: 'uploaded_video_1',
      url: '/signed/user_uploads/library_owner/clip.mp4?ttl=3600',
      thumbnailUrl: '/signed/user_uploads/library_owner/clip.mp4?ttl=3600&x-oss-process=video%2Fsnapshot%2Ct_1000%2Cf_jpg%2Cw_400%2Cm_fast',
    }))
  })

  it('requires authentication', async () => {
    const response = await app.handle(new Request('http://localhost/api/artifacts'))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('AUTH_UNAUTHORIZED')
  })

  it('rejects an invalid artifact kind filter with 400', async () => {
    currentUserId = 'user_1'
    await ensureCurrentUserSeeded()

    const response = await app.handle(authed('http://localhost/api/artifacts?kind=not-a-kind'))
    const body = await response.json() as { success: false; error: { code: string; message: string } }

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
    expect(body.error.message).toContain('not-a-kind')
  })
})
