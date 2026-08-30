import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createIsolatedGenerationRepository,
  createTestUser,
  resetGenerationRepositoryTestDb,
  type IsolatedGenerationRepository,
} from '@bailian-studio/generation-repository'
import { createCreditLedger, type CreditLedger } from '@bailian-studio/credit-ledger'
import { createCreativeAssetRepository } from '@bailian-studio/creative-asset-repository'
import type { StorageAdapter, StorageReadUrlInput, StorageWriteInput, StorageWriteResult } from '@bailian-studio/storage'
import { createTestApp } from '../src/test-app'
import { createFakeAuthService } from './fake-auth-service'
import { replayGenerationEvents } from '../src/modules/generations/routes'
import type { GenerationEvent, GenerationRepository } from '@bailian-studio/generation-repository'

let iso!: IsolatedGenerationRepository
let testCreditLedger!: CreditLedger
let app: ReturnType<typeof createTestApp>['app']

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

// 假认证服务：任意非空 cookie token 都会以 `currentUserId` 身份通过认证。
// 测试通过修改 `currentUserId` 来模拟不同用户（所有者 vs 其他用户）。
let currentUserId = 'user_1'
const fakeAuthService = createFakeAuthService(() => ({
  id: currentUserId,
  email: 'u@e.test',
  displayName: null,
  role: 'user',
}))

const fakeCreditLedger: CreditLedger = {
  getBalance: async ({ userId }) => ({ userId, availableCents: 1_000_000, reservedCents: 0, totalCents: 1_000_000 }),
  grant: async () => { throw new Error('not used') },
  listEntries: async () => ({ items: [] }),
  adjust: async () => { throw new Error('not used') },
  reconcile: async () => ({ checkedAccounts: 0, checkedEntries: 0, violations: [], healthy: true }),
  releaseStaleReservations: async () => ({ candidates: 0, released: 0, skipped: true, releasedEntryIds: [] }),
}

/** 构造携带会话 cookie（已认证）的 Request。 */
function authed(url: string, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  headers.set('cookie', 'bailian_studio_session=fake-token')
  return new Request(url, { ...init, headers })
}

/**
 * 从长连接 SSE 流中读取文本，直到累计内容包含 `needle`，然后取消读取并返回已读文本。
 * SSE 流现在永不主动结束，所以不能 `await response.text()`（会挂死），必须增量读。
 */
async function readUntil(response: Response, needle: string): Promise<string> {
  const reader = response.body?.getReader()
  if (reader === undefined) throw new Error('expected readable body')
  try {
    return await readUntilReader(reader, needle)
  }
  finally {
    reader.cancel()
  }
}

async function readUntilReader(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string): Promise<string> {
  const decoder = new TextDecoder()
  let text = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (value !== undefined) text += decoder.decode(value, { stream: true })
    if (text.includes(needle)) return text
  }
  return text
}

// generation_records.userId 有外键指向 users.id，因此在插入任何 generation 前，
// currentUserId 对应的 users 行必须存在。按用户懒初始化（所有插入都经由
// postGeneration），并在重置 DB 时清空该集合。
const seededUsers = new Set<string>()
async function ensureCurrentUserSeeded(): Promise<void> {
  if (seededUsers.has(currentUserId)) return
  seededUsers.add(currentUserId)
  await createTestUser(iso.databaseUrl, currentUserId)
  await testCreditLedger.grant({
    userId: currentUserId,
    amountCents: 1_000_000,
    reason: 'generation route fixture',
    idempotencyKey: `fixture:${currentUserId}`,
    actorUserId: currentUserId,
  })
}

async function postGeneration(body: Record<string, unknown>): Promise<Response> {
  await ensureCurrentUserSeeded()
  return app.handle(authed('http://localhost/api/generations', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

beforeAll(async () => {
  iso = await createIsolatedGenerationRepository({ max: 1 })
  testCreditLedger = createCreditLedger({ db: iso.db })
})

describe('generation routes', () => {
  beforeEach(async () => {
    currentUserId = 'user_1'
    await resetGenerationRepositoryTestDb(iso.databaseUrl)
    seededUsers.clear()
    const context = createTestApp({
      authService: fakeAuthService,
      creditLedger: fakeCreditLedger,
      generationRepository: iso.repository,
      creativeAssetRepository: createCreativeAssetRepository({ db: iso.db }),
      storage: new FakeStorageAdapter(),
    })
    app = context.app
  })

  afterAll(async () => {
    await iso.close()
  })

  it('creates a generation record and queued submit task', async () => {
    const response = await postGeneration({
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })
    const body = await response.json() as { success: true; data: { record: { id: string; status: string; modelId: string }; task: { type: string; status: string } } }

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.record.status).toBe('submitting')
    expect(body.data.record.modelId).toBe('qwen-image')
    expect(body.data.task.type).toBe('generation.submit')
    expect(body.data.task.status).toBe('queued')
  })

  it('creates, lists, and reads a generation with ordered stable asset references', async () => {
    currentUserId = 'user_asset_refs'
    await ensureCurrentUserSeeded()
    await iso.assetRepository.createUserAsset({
      id: 'api_asset_a',
      userId: currentUserId,
      kind: 'image',
      source: 'upload',
      storageProvider: 'oss',
      storageKey: 'users/user_asset_refs/a.png',
    })
    await iso.assetRepository.createUserAsset({
      id: 'api_asset_b',
      userId: currentUserId,
      kind: 'image',
      source: 'link',
      originalUrl: 'https://example.com/b.png',
    })

    const response = await postGeneration({
      modelId: 'qwen-image-edit',
      params: { prompt: 'combine these assets' },
      assetRefs: { image: ['api_asset_b', 'api_asset_a'] },
      idempotencyKey: 'api-asset-refs',
    })
    const body = await response.json() as {
      success: true
      data: { record: { id: string; inputParams: Record<string, unknown>; assetRefs: Record<string, string[]> } }
    }
    expect(response.status).toBe(200)
    expect(body.data.record.inputParams).not.toHaveProperty('image')
    expect(body.data.record.assetRefs).toEqual({ image: ['api_asset_b', 'api_asset_a'] })

    const listResponse = await app.handle(authed('http://localhost/api/generations'))
    const listBody = await listResponse.json() as {
      success: true
      data: { items: Array<{ id: string; assetRefs?: Record<string, string[]> }> }
    }
    expect(listBody.data.items[0]?.assetRefs).toEqual({ image: ['api_asset_b', 'api_asset_a'] })

    const detailResponse = await app.handle(authed(`http://localhost/api/generations/${body.data.record.id}`))
    const detailBody = await detailResponse.json() as {
      success: true
      data: { assetRefs?: Record<string, string[]> }
    }
    expect(detailBody.data.assetRefs).toEqual({ image: ['api_asset_b', 'api_asset_a'] })
    expect(JSON.stringify(detailBody)).not.toContain('users/user_asset_refs/a.png')
    expect(JSON.stringify(detailBody)).not.toContain('https://example.com/b.png')
  })

  it('estimates asset-backed media requests and rejects another owner asset without disclosure', async () => {
    currentUserId = 'asset_owner'
    await ensureCurrentUserSeeded()
    await iso.assetRepository.createUserAsset({
      id: 'asset_owned',
      userId: currentUserId,
      kind: 'image',
      source: 'upload',
    })

    const estimateResponse = await app.handle(authed('http://localhost/api/generations/estimate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        modelId: 'qwen-image-edit',
        params: { prompt: 'estimate with refs' },
        assetRefs: { image: 'asset_owned' },
      }),
    }))
    expect(estimateResponse.status).toBe(200)

    currentUserId = 'asset_requester'
    await ensureCurrentUserSeeded()
    const response = await postGeneration({
      modelId: 'qwen-image-edit',
      params: { prompt: 'must not disclose ownership' },
      assetRefs: { image: 'asset_owned' },
    })
    const body = await response.json() as {
      success: false
      error: { code: string; details?: { issues?: Array<{ message: string }> } }
    }
    expect(response.status).toBe(400)
    expect(body.error.code).toBe('INVALID_GENERATION_PARAMS')
    expect(body.error.details?.issues?.[0]?.message).toBe('The selected asset is unavailable')
  })

  it('compiles a creative asset context consistently for estimate and submit', async () => {
    currentUserId = 'user_creative_submit'
    await ensureCurrentUserSeeded()
    const creativeRepository = createCreativeAssetRepository({ db: iso.db })
    const project = await creativeRepository.createProject({ userId: currentUserId, title: '短剧素材项目' })
    const asset = await creativeRepository.createAsset({
      userId: currentUserId,
      projectId: project.id,
      type: 'character',
      name: '林默',
    })
    const versioned = await creativeRepository.createVersion({
      userId: currentUserId,
      assetId: asset.id,
      semanticSpec: { identity: { name: '林默' } },
      generationRecipe: {},
    })
    const versionId = versioned.versions[0]?.id
    if (versionId === undefined) throw new Error('expected creative asset version')
    await iso.assetRepository.createUserAsset({
      id: 'creative-submit-reference',
      userId: currentUserId,
      kind: 'image',
      source: 'upload',
      storageProvider: 'oss',
      storageKey: 'creative/user_creative_submit/linmo.png',
    })
    const withReference = await creativeRepository.addReference({
      userId: currentUserId,
      assetVersionId: versionId,
      userAssetId: 'creative-submit-reference',
      role: 'front',
      position: 0,
      metadata: {},
    })
    const referenceId = withReference.versions[0]?.references[0]?.id
    if (referenceId === undefined) throw new Error('expected creative reference')
    await creativeRepository.transitionVersion({ userId: currentUserId, assetVersionId: versionId, status: 'generating' })
    await creativeRepository.transitionVersion({ userId: currentUserId, assetVersionId: versionId, status: 'candidate' })
    await creativeRepository.transitionVersion({ userId: currentUserId, assetVersionId: versionId, status: 'approved' })

    const creativeContext = {
      protocolVersion: 1,
      purpose: 'shot_image',
      projectId: project.id,
      prompt: '让 @图1 站在雨中',
      assetBindings: [{ assetVersionId: versionId, role: 'character', position: 0, referenceIds: [referenceId] }],
      recipe: { source: 'generation-route-test' },
      capabilitySnapshot: {},
    }
    const body = { modelId: 'qwen-image-edit', params: { prompt: creativeContext.prompt }, creativeContext }
    const estimateResponse = await app.handle(authed('http://localhost/api/generations/estimate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }))
    expect(estimateResponse.status).toBe(200)

    const submitResponse = await postGeneration(body)
    const submitted = await submitResponse.json() as {
      success: true
      data: { record: { inputParams: Record<string, unknown>; assetRefs: Record<string, string[]> } }
    }
    expect(submitResponse.status).toBe(200)
    expect(submitted.data.record.inputParams).toMatchObject({ prompt: '让 <<<image_1>>> 站在雨中' })
    expect(submitted.data.record.assetRefs).toEqual({ image: ['creative-submit-reference'] })
  })

  it('rejects a generation before provider submission when the estimate is unaffordable', async () => {
    currentUserId = 'user_without_points'
    seededUsers.add(currentUserId)
    await createTestUser(iso.databaseUrl, currentUserId)

    const response = await postGeneration({ modelId: 'qwen-image', params: { prompt: 'no budget' } })
    const body = await response.json() as { success: false; error: { code: string; details?: { requiredCents?: number } } }

    expect(response.status).toBe(402)
    expect(body.error.code).toBe('POINTS_INSUFFICIENT')
    expect(body.error.details?.requiredCents).toBe(25)
    const listed = await app.handle(authed('http://localhost/api/generations'))
    const listBody = await listed.json() as { success: true; data: { items: unknown[] } }
    expect(listBody.data.items).toHaveLength(0)
  })

  it('estimates cost and returns the current daily usage before creation', async () => {
    currentUserId = 'user_estimate'
    await ensureCurrentUserSeeded()

    const response = await app.handle(authed('http://localhost/api/generations/estimate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        modelId: 'qwen-image',
        params: { prompt: 'lantern', n: 1, size: '1328*1328' },
      }),
    }))
    const body = await response.json() as {
      success: true
      data: { estimate: { costEstimate: number; currency: string; credits: { availableCents: number; canAfford: boolean }; usage: { generationCount: number } } }
    }

    expect(response.status).toBe(200)
    expect(body.data.estimate.costEstimate).toBeGreaterThanOrEqual(0)
    expect(body.data.estimate.currency).toBe('CNY')
    expect(body.data.estimate.credits.canAfford).toBe(true)
    expect(body.data.estimate.usage.generationCount).toBe(0)
  })

  it('enforces the configured per-user daily task limit before inserting', async () => {
    currentUserId = 'user_daily_limit'
    const context = createTestApp({
      authService: fakeAuthService,
      generationRepository: iso.repository,
      storage: new FakeStorageAdapter(),
      generationLimits: { dailyTaskLimit: 1, dailyQuotaMode: 'attempts' },
    })
    app = context.app
    const first = await postGeneration({ modelId: 'qwen-image', params: { prompt: 'first', n: 1, size: '1328*1328' } })
    expect(first.status).toBe(200)

    const second = await postGeneration({ modelId: 'qwen-image', params: { prompt: 'second', n: 1, size: '1328*1328' } })
    const body = await second.json() as { success: false; error: { code: string } }
    expect(second.status).toBe(429)
    expect(body.error.code).toBe('GENERATION_DAILY_LIMIT_EXCEEDED')
  })

  it('rejects invalid model params', async () => {
    const response = await postGeneration({ modelId: 'qwen-image', params: { n: 1 } })
    const body = await response.json() as {
      success: false
      error: {
        code: string
        details?: {
          issues?: Array<{
            code: string
            field: string
            messages: { 'zh-CN': string; 'en-US': string }
            expected?: { 'zh-CN': string; 'en-US': string }
          }>
        }
      }
    }

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('INVALID_GENERATION_PARAMS')
    expect(body.error.details?.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'REQUIRED_PARAMETER',
        field: 'prompt',
        messages: {
          'zh-CN': '提示词为必填参数',
          'en-US': 'prompt is required',
        },
        expected: {
          'zh-CN': '请提供非空值',
          'en-US': 'Provide a non-empty value',
        },
      }),
    ]))
  })

  it('rejects unknown models', async () => {
    const response = await postGeneration({ modelId: 'missing-model', params: { prompt: 'lantern' } })
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('MODEL_NOT_FOUND')
  })

  it('rejects invalid request bodies', async () => {
    const response = await postGeneration({ params: { prompt: 'lantern' } })
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('VALIDATION_ERROR')
  })

  it('lists generation records for the authenticated user', async () => {
    currentUserId = 'user_list'
    await postGeneration({
      modelId: 'wanx-text-to-video',
      params: { prompt: 'ocean', size: '1280*720', duration: 5 },
    })

    const response = await app.handle(authed('http://localhost/api/generations'))
    const body = await response.json() as { success: true; data: { items: Array<{ userId: string; modelId: string }> } }

    expect(response.status).toBe(200)
    expect(body.data.items).toEqual([
      expect.objectContaining({ userId: 'user_list', modelId: 'wanx-text-to-video' }),
    ])
  })

  it('adds OSS thumbnails to list previews while preserving provider originals', async () => {
    currentUserId = 'user_thumbnail_list'
    const create = await postGeneration({
      modelId: 'qwen-image',
      params: { prompt: 'portrait', n: 1, size: '1328*1328' },
    })
    const created = await create.json() as { success: true; data: { record: { id: string } } }
    await iso.repository.completeGeneration({
      recordId: created.data.record.id,
      costFinal: 20,
      output: {
        artifacts: [{
          kind: 'image',
          sourceUrl: 'https://provider.test/full-resolution.png',
          mimeType: 'image/png',
        }],
      },
    })
    const [artifact] = await iso.repository.listArtifactsForRecord(created.data.record.id)
    if (artifact === undefined) throw new Error('expected artifact row')
    await iso.repository.markArtifactStored({
      artifactId: artifact.id,
      storageProvider: 'oss',
      storageKey: `generations/${created.data.record.id}/${artifact.id}.png`,
      byteSize: 3_500_000,
      mimeType: 'image/png',
    })
    app = createTestApp({
      authService: fakeAuthService,
      creditLedger: fakeCreditLedger,
      generationRepository: iso.repository,
      storage: new FakeStorageAdapter('oss'),
    }).app

    const response = await app.handle(authed('http://localhost/api/generations'))
    const body = await response.json() as {
      success: true
      data: {
        items: Array<{
          outputResult?: { artifacts: Array<{ sourceUrl?: string; thumbnailUrl?: string }> }
        }>
      }
    }
    const output = body.data.items[0]?.outputResult?.artifacts[0]

    expect(response.status).toBe(200)
    expect(output?.sourceUrl).toBe('https://provider.test/full-resolution.png')
    expect(output?.thumbnailUrl).toContain(
      'x-oss-process=image%2Fresize%2Cm_lfit%2Cw_640%2Ch_640%2Fformat%2Cwebp%2Fquality%2CQ_80',
    )
  })

  it('paginates generation records through the API', async () => {
    currentUserId = 'user_paging'
    for (let i = 0; i < 3; i++) {
      await postGeneration({ modelId: 'qwen-image', params: { prompt: `p${i}`, n: 1, size: '1328*1328' } })
    }

    const page1Response = await app.handle(authed('http://localhost/api/generations?limit=2'))
    const page1 = await page1Response.json() as { success: true; data: { items: Array<{ id: string }>; nextCursor?: string } }
    expect(page1.data.items).toHaveLength(2)
    expect(page1.data.nextCursor).toBeDefined()

    const page2Response = await app.handle(authed(`http://localhost/api/generations?limit=2&cursor=${page1.data.nextCursor}`))
    const page2 = await page2Response.json() as { success: true; data: { items: Array<{ id: string }>; nextCursor?: string } }
    expect(page2.data.items).toHaveLength(1)
    expect(page2.data.nextCursor).toBeUndefined()

    const ids = new Set([...page1.data.items, ...page2.data.items].map(item => item.id))
    expect(ids.size).toBe(3)
  })

  it('rejects a malformed pagination cursor with 400', async () => {
    const badCursor = Buffer.from('not-json', 'utf8').toString('base64url')
    const response = await app.handle(authed(`http://localhost/api/generations?cursor=${badCursor}`))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(400)
    expect(body.error.code).toBe('INVALID_CURSOR')
  })

  it('returns the same generation for a repeated idempotency key', async () => {
    currentUserId = 'user_idem'
    const request = () => postGeneration({
      modelId: 'qwen-image',
      idempotencyKey: 'idem_1',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })

    const first = await (await request()).json() as { success: true; data: { record: { id: string } } }
    const second = await (await request()).json() as { success: true; data: { record: { id: string } } }

    expect(second.data.record.id).toBe(first.data.record.id)
  })

  it('requires authentication when listing generation records', async () => {
    const response = await app.handle(new Request('http://localhost/api/generations'))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('AUTH_UNAUTHORIZED')
  })

  it('exposes queued generation events over the SSE route', async () => {
    currentUserId = 'user_sse'
    await postGeneration({ modelId: 'qwen-image', params: { prompt: 'lantern', n: 1, size: '1328*1328' } })

    const response = await app.handle(authed('http://localhost/api/generations/events'))
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    // 长连接流：读到 generation.status 即可，无需等待流结束（流现在永不结束）。
    const text = await readUntil(response, 'event: generation.status')

    expect(text).toContain('event: generation.status')
    expect(text).toContain('"userId":"user_sse"')
  })

  it('requires authentication when reading generation events', async () => {
    const response = await app.handle(new Request('http://localhost/api/generations/events'))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('AUTH_UNAUTHORIZED')
  })

  it('signals a stale reconnect cursor via a cursor-expired SSE event instead of an opaque 410', async () => {
    // P1-17：410 响应体浏览器读不到，会带同一 Last-Event-ID 无限重试；改为
    // 200 SSE 流内发 `cursor-expired` 事件后关闭，前端据此重建 EventSource。
    currentUserId = 'user_sse_expired'
    const response = await app.handle(authed('http://localhost/api/generations/events', {
      headers: { 'last-event-id': 'generation_event_missing' },
    }))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const text = await readUntil(response, 'event: cursor-expired')
    expect(text).toContain('event: cursor-expired')
  })

  it('delivers live events to an open SSE stream without reconnect', async () => {
    currentUserId = 'user_sse_live'
    // 先打开长连接，随后再 publish 一个事件——流应在无需重连的情况下推送它。
    const response = await app.handle(authed('http://localhost/api/generations/events'))
    const reader = response.body?.getReader()
    if (reader === undefined) throw new Error('expected readable body')

    // 读取并丢弃首个 chunk（connected 事件），然后触发一次新的生成。
    await reader.read()
    const created = await postGeneration({ modelId: 'qwen-image', params: { prompt: 'live', n: 1, size: '1328*1328' } })
    const createdBody = await created.json() as { success: true; data: { record: { id: string } } }

    // 持续读，直到拿到包含新 recordId 的 generation.status。
    const text = await readUntilReader(reader, createdBody.data.record.id)
    expect(text).toContain('event: generation.status')
    expect(text).toContain(createdBody.data.record.id)
    reader.cancel()
  })

  it('does not replay a live-delivered generation event on reconnect', async () => {
    currentUserId = 'user_sse_replay'
    // 打开第一个长连接并订阅。
    const firstResponse = await app.handle(authed('http://localhost/api/generations/events'))
    const firstReader = firstResponse.body?.getReader()
    if (firstReader === undefined) throw new Error('expected readable body')

    // 丢弃 connected，然后 publish 一个事件。因为第一个连接在线，事件实时送达它、
    // 且【不写入缓冲】。
    await firstReader.read()
    const created = await postGeneration({ modelId: 'qwen-image', params: { prompt: 'replay', n: 1, size: '1328*1328' } })
    const createdBody = await created.json() as { success: true; data: { record: { id: string } } }
    const liveText = await readUntilReader(firstReader, createdBody.data.record.id)
    expect(liveText).toContain('event: generation.status')
    firstReader.cancel()

    // 重连（第二个连接）：因为事件当时已被实时送达、未进缓冲，所以这里只能拿到
    // connected，不应再重放已交付的 generation.status。
    const secondResponse = await app.handle(authed('http://localhost/api/generations/events'))
    const secondText = await readUntil(secondResponse, 'event: connected')

    expect(secondText).toContain('event: connected')
    expect(secondText).not.toContain('event: generation.status')
    expect(secondText).not.toContain(createdBody.data.record.id)
  })

  it('drains generation events only once through the SSE route', async () => {
    currentUserId = 'user_sse_once'
    await postGeneration({ modelId: 'qwen-image', params: { prompt: 'lantern', n: 1, size: '1328*1328' } })

    const firstResponse = await app.handle(authed('http://localhost/api/generations/events'))
    const firstText = await readUntil(firstResponse, 'event: generation.status')

    // 第二次连接：缓冲已被第一次 drain 排空，只会拿到 connected。
    const secondResponse = await app.handle(authed('http://localhost/api/generations/events'))
    const secondText = await readUntil(secondResponse, 'event: connected')

    expect(firstText).toContain('event: generation.status')
    expect(secondText).not.toContain('event: generation.status')
    expect(secondText).toContain('event: connected')
  })

  it('replays persisted events after the Last-Event-ID cursor', async () => {
    currentUserId = 'user_sse_resume'
    const first = await postGeneration({ modelId: 'qwen-image', params: { prompt: 'first', n: 1, size: '1328*1328' } })
    const firstBody = await first.json() as { success: true; data: { record: { id: string } } }

    const firstResponse = await app.handle(authed('http://localhost/api/generations/events'))
    const firstText = await readUntil(firstResponse, firstBody.data.record.id)
    expect(firstText).toContain('id: generation_event_')
    const cursor = await iso.repository.getLatestGenerationEvent()
    if (cursor === undefined) throw new Error('expected persisted generation event')

    const second = await postGeneration({ modelId: 'qwen-image', params: { prompt: 'second', n: 1, size: '1328*1328' } })
    const secondBody = await second.json() as { success: true; data: { record: { id: string } } }
    const resumed = await app.handle(authed('http://localhost/api/generations/events', {
      headers: { 'last-event-id': cursor.id },
    }))
    const resumedText = await readUntil(resumed, secondBody.data.record.id)

    expect(resumedText).toContain('event: generation.status')
    expect(resumedText).toContain(secondBody.data.record.id)
    expect(resumedText).not.toContain(firstBody.data.record.id)
  })

  describe('replayGenerationEvents pagination (P1-17)', () => {
    function fakeEvent(id: string, createdAt: string): GenerationEvent {
    return { id, recordId: `r_${id}`, userId: 'user_sse', status: 'pending', modelId: 'qwen-image', updatedAt: createdAt, createdAt }
  }

  function pageRepository(pages: GenerationEvent[][]) {
    const calls: Array<Record<string, unknown>> = []
    let index = 0
    return {
      calls,
      async listGenerationEvents(input: Parameters<GenerationRepository['listGenerationEvents']>[0]) {
        calls.push({ ...input })
        if (index >= pages.length) return []
        const page = pages[index]
        index += 1
        return page ?? []
      },
    }
  }

  it('returns a single short page in one call with afterId', async () => {
    const repo = pageRepository([[fakeEvent('e1', '2026-01-01T00:00:00.000Z')]])
    const events = await replayGenerationEvents(repo, { userId: 'user_sse', afterId: 'prev' })
    expect(events).toHaveLength(1)
    expect(repo.calls).toHaveLength(1)
    expect(repo.calls[0]).toMatchObject({ userId: 'user_sse', afterId: 'prev', limit: 500 })
  })

  it('keeps paging past a full 500-event page using the last event as afterCursor', async () => {
    const firstPage = Array.from({ length: 500 }, (_, i) => fakeEvent(`p1_${i}`, `2026-01-01T00:00:${String(i).padStart(2, '0')}.000Z`))
    const secondPage = [fakeEvent('p2_0', '2026-01-01T00:01:00.000Z')]
    const repo = pageRepository([firstPage, secondPage])

    const events = await replayGenerationEvents(repo, { userId: 'user_sse', afterId: 'prev' })
    expect(events).toHaveLength(501)
    expect(repo.calls).toHaveLength(2)
    const secondCall = repo.calls[1] as { afterCursor?: { id: string; createdAt: string } }
    expect(secondCall.afterCursor).toEqual({ id: 'p1_499', createdAt: firstPage[499]!.createdAt })
  })

  it('stops after REPLAY_MAX_PAGES even if every page is full', async () => {
    const fullPage = Array.from({ length: 500 }, (_, i) => fakeEvent(`f_${i}`, '2026-01-01T00:00:00.000Z'))
    const repo = pageRepository(Array.from({ length: 30 }, () => fullPage))

    const events = await replayGenerationEvents(repo, { userId: 'user_sse', afterId: 'prev' })
    expect(events).toHaveLength(500 * 20)
    expect(repo.calls).toHaveLength(20)
  })
})

  it('returns a single generation record with input params for the owner', async () => {
    currentUserId = 'user_detail'
    const create = await postGeneration({ modelId: 'qwen-image', params: { prompt: 'lantern', n: 1, size: '1328*1328' } })
    const created = await create.json() as { success: true; data: { record: { id: string } } }

    await iso.repository.completeGeneration({
      recordId: created.data.record.id,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://cdn.test/a.png' }] },
    })

    const response = await app.handle(authed(`http://localhost/api/generations/${created.data.record.id}`))
    const body = await response.json() as {
      success: true
      data: {
        id: string
        inputParams: { prompt?: unknown }
        outputResult?: { artifacts: Array<{ kind: string; sourceUrl?: string }> }
        status: string
      }
    }

    expect(response.status).toBe(200)
    expect(body.data.id).toBe(created.data.record.id)
    expect(body.data.inputParams.prompt).toBe('lantern')
    expect(body.data.outputResult?.artifacts[0]?.sourceUrl).toBe('https://cdn.test/a.png')
    expect(body.data.status).toBe('succeeded')
  })

  it('returns owner-only diagnostics with the generation trace and safe task summaries', async () => {
    currentUserId = 'user_diagnostics'
    await ensureCurrentUserSeeded()
    const createResponse = await app.handle(authed('http://localhost/api/generations', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-request-id': 'trace_diagnostics_1' },
      body: JSON.stringify({
        modelId: 'qwen-image',
        params: { prompt: 'diagnostic prompt', n: 1, size: '1328*1328' },
      }),
    }))
    const created = await createResponse.json() as { success: true; data: { record: { id: string; traceId?: string } } }

    const response = await app.handle(authed(`http://localhost/api/generations/${created.data.record.id}/diagnostics`))
    const body = await response.json() as {
      success: true
      data: {
        generationId: string
        traceId?: string
        tasks: Array<{ type: string; input?: unknown; durationMs?: number }>
        providerRequests: unknown[]
      }
    }

    expect(response.status).toBe(200)
    expect(created.data.record.traceId).toBe('trace_diagnostics_1')
    expect(body.data.generationId).toBe(created.data.record.id)
    expect(body.data.traceId).toBe('trace_diagnostics_1')
    expect(body.data.tasks[0]?.type).toBe('generation.submit')
    expect(body.data.tasks[0]?.input).toBeUndefined()
    expect(body.data.providerRequests).toEqual([])
  })

  it('lists persisted artifacts with read URLs for the owner', async () => {
    currentUserId = 'user_artifacts'
    const create = await postGeneration({ modelId: 'qwen-image', params: { prompt: 'lantern', n: 1, size: '1328*1328' } })
    const created = await create.json() as { success: true; data: { record: { id: string } } }

    await iso.repository.completeGeneration({
      recordId: created.data.record.id,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://cdn.test/a.png', mimeType: 'image/png' }] },
    })
    const [artifact] = await iso.repository.listArtifactsForRecord(created.data.record.id)
    if (artifact === undefined) throw new Error('expected artifact row')
    await iso.repository.markArtifactStored({
      artifactId: artifact.id,
      storageProvider: 'local',
      storageKey: `generations/${created.data.record.id}/${artifact.id}.png`,
      byteSize: 123,
      mimeType: 'image/png',
    })

    const response = await app.handle(authed(`http://localhost/api/generations/${created.data.record.id}/artifacts`))
    const body = await response.json() as {
      success: true
      data: { items: Array<{ id: string; status: string; readUrl?: string; storageKey?: string }> }
    }

    expect(response.status).toBe(200)
    expect(body.data.items).toHaveLength(1)
    expect(body.data.items[0]).toMatchObject({
      id: artifact.id,
      status: 'stored',
      storageKey: `generations/${created.data.record.id}/${artifact.id}.png`,
      readUrl: `/signed/generations/${created.data.record.id}/${artifact.id}.png?ttl=3600`,
    })
  })

  it("returns 404 for another user's artifacts", async () => {
    currentUserId = 'artifact_owner'
    const create = await postGeneration({ modelId: 'qwen-image', params: { prompt: 'secret', n: 1, size: '1328*1328' } })
    const created = await create.json() as { success: true; data: { record: { id: string } } }

    currentUserId = 'artifact_other' // 模拟另一个用户
    const response = await app.handle(authed(`http://localhost/api/generations/${created.data.record.id}/artifacts`))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('GENERATION_NOT_FOUND')
  })

  it("returns 404 for another user's generation record", async () => {
    currentUserId = 'user_owner'
    const create = await postGeneration({ modelId: 'qwen-image', params: { prompt: 'secret', n: 1, size: '1328*1328' } })
    const created = await create.json() as { success: true; data: { record: { id: string } } }

    currentUserId = 'user_other'
    const response = await app.handle(authed(`http://localhost/api/generations/${created.data.record.id}`))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('GENERATION_NOT_FOUND')
  })

  it('returns 404 for a missing generation id', async () => {
    const response = await app.handle(authed('http://localhost/api/generations/gen_does_not_exist'))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('GENERATION_NOT_FOUND')
  })

  it('requires authentication when reading a single generation', async () => {
    const response = await app.handle(new Request('http://localhost/api/generations/some_id'))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(401)
    expect(body.error.code).toBe('AUTH_UNAUTHORIZED')
  })

  it('hides, soft-deletes, restores, and filters owner generation records', async () => {
    currentUserId = 'user_library_state'
    const create = await postGeneration({
      modelId: 'qwen-image',
      params: { prompt: 'library state', n: 1, size: '1328*1328' },
    })
    const created = await create.json() as {
      success: true
      data: { record: { id: string; status: string } }
    }
    const recordId = created.data.record.id

    const setState = async (state: 'visible' | 'hidden' | 'deleted') => app.handle(
      authed(`http://localhost/api/generations/${recordId}/library-state`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state }),
      }),
    )

    const hidden = await setState('hidden')
    const hiddenBody = await hidden.json() as {
      success: true
      data: { record: { status: string; hiddenAt?: string; deletedAt?: string } }
    }
    expect(hidden.status).toBe(200)
    expect(hiddenBody.data.record.status).toBe(created.data.record.status)
    expect(hiddenBody.data.record.hiddenAt).toBeDefined()
    expect(hiddenBody.data.record.deletedAt).toBeUndefined()

    const defaultList = await app.handle(
      authed('http://localhost/api/generations?limit=20'),
    )
    const defaultListBody = await defaultList.json() as {
      success: true
      data: { items: Array<{ id: string }> }
    }
    expect(defaultListBody.data.items.some(item => item.id === recordId)).toBe(false)

    const hiddenList = await app.handle(
      authed('http://localhost/api/generations?limit=20&views=hidden'),
    )
    const hiddenListBody = await hiddenList.json() as {
      success: true
      data: { items: Array<{ id: string }> }
    }
    expect(hiddenListBody.data.items.map(item => item.id)).toContain(recordId)

    const deleted = await setState('deleted')
    const deletedBody = await deleted.json() as {
      success: true
      data: { record: { hiddenAt?: string; deletedAt?: string } }
    }
    expect(deletedBody.data.record.hiddenAt).toBeUndefined()
    expect(deletedBody.data.record.deletedAt).toBeDefined()

    const deletedList = await app.handle(
      authed('http://localhost/api/generations?limit=20&views=hidden,deleted'),
    )
    const deletedListBody = await deletedList.json() as {
      success: true
      data: { items: Array<{ id: string; hiddenAt?: string; deletedAt?: string }> }
    }
    const deletedItem = deletedListBody.data.items.find(item => item.id === recordId)
    expect(deletedItem?.hiddenAt).toBeUndefined()
    expect(deletedItem?.deletedAt).toBeDefined()

    const restored = await setState('visible')
    const restoredBody = await restored.json() as {
      success: true
      data: { record: { hiddenAt?: string; deletedAt?: string } }
    }
    expect(restoredBody.data.record.hiddenAt).toBeUndefined()
    expect(restoredBody.data.record.deletedAt).toBeUndefined()
  })

  it('returns 404 when changing another user generation library state', async () => {
    currentUserId = 'library_state_owner'
    const create = await postGeneration({
      modelId: 'qwen-image',
      params: { prompt: 'private task', n: 1, size: '1328*1328' },
    })
    const created = await create.json() as {
      success: true
      data: { record: { id: string } }
    }

    currentUserId = 'library_state_other'
    const response = await app.handle(
      authed(
        `http://localhost/api/generations/${created.data.record.id}/library-state`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ state: 'deleted' }),
        },
      ),
    )
    const body = await response.json() as {
      success: false
      error: { code: string }
    }

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('GENERATION_NOT_FOUND')
  })

  it('cancels an active generation for the owner and sets the requested flag', async () => {
    currentUserId = 'user_cancel'
    const create = await postGeneration({ modelId: 'qwen-image', params: { prompt: 'lantern', n: 1, size: '1328*1328' } })
    const created = await create.json() as { success: true; data: { record: { id: string } } }

    const response = await app.handle(authed(`http://localhost/api/generations/${created.data.record.id}/cancel`, { method: 'POST' }))
    const body = await response.json() as { success: true; data: { record: { status: string; providerCancelStatus: string; statusReason: string } } }

    expect(response.status).toBe(200)
    // 新建的记录处于 submitting，取消会直接翻成终态 cancelled。
    expect(body.data.record.status).toBe('cancelled')
    expect(body.data.record.providerCancelStatus).toBe('requested')
    expect(body.data.record.statusReason).toBe('用户已请求取消')
  })

  it('returns 404 when cancelling another user generation (IDOR guard)', async () => {
    currentUserId = 'cancel_owner'
    const create = await postGeneration({ modelId: 'qwen-image', params: { prompt: 'lantern', n: 1, size: '1328*1328' } })
    const created = await create.json() as { success: true; data: { record: { id: string } } }

    currentUserId = 'cancel_other'
    const response = await app.handle(authed(`http://localhost/api/generations/${created.data.record.id}/cancel`, { method: 'POST' }))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('GENERATION_NOT_FOUND')
  })

  it('returns 409 when cancelling an already-failed generation', async () => {
    currentUserId = 'user_cancel_failed'
    const create = await postGeneration({ modelId: 'qwen-image', params: { prompt: 'lantern', n: 1, size: '1328*1328' } })
    const created = await create.json() as { success: true; data: { record: { id: string } } }
    await iso.repository.failGeneration({
      recordId: created.data.record.id,
      error: { category: 'provider', message: 'boom', retriable: false, code: 'BOOM' },
    })

    const response = await app.handle(authed(`http://localhost/api/generations/${created.data.record.id}/cancel`, { method: 'POST' }))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(409)
    expect(body.error.code).toBe('GENERATION_NOT_CANCELLABLE')
  })

  it('retries a failed generation for the owner and creates a new record', async () => {
    currentUserId = 'user_retry'
    const create = await postGeneration({ modelId: 'qwen-image', params: { prompt: 'lantern', n: 1, size: '1328*1328' } })
    const created = await create.json() as { success: true; data: { record: { id: string } } }
    await iso.repository.failGeneration({
      recordId: created.data.record.id,
      error: { category: 'provider', message: 'boom', retriable: false, code: 'BOOM' },
    })

    const response = await app.handle(authed(`http://localhost/api/generations/${created.data.record.id}/retry`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: 'retry-1' }),
    }))
    const body = await response.json() as { success: true; data: { record: { id: string; parentRecordId: string; modelId: string } } }

    expect(response.status).toBe(200)
    expect(body.data.record.id).not.toBe(created.data.record.id)
    expect(body.data.record.parentRecordId).toBe(created.data.record.id)
    expect(body.data.record.modelId).toBe('qwen-image')
  })

  it('returns 404 when retrying another user generation (IDOR guard)', async () => {
    currentUserId = 'retry_owner'
    const create = await postGeneration({ modelId: 'qwen-image', params: { prompt: 'lantern', n: 1, size: '1328*1328' } })
    const created = await create.json() as { success: true; data: { record: { id: string } } }
    await iso.repository.failGeneration({
      recordId: created.data.record.id,
      error: { category: 'provider', message: 'boom', retriable: false, code: 'BOOM' },
    })

    currentUserId = 'retry_other'
    const response = await app.handle(authed(`http://localhost/api/generations/${created.data.record.id}/retry`, { method: 'POST' }))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(404)
    expect(body.error.code).toBe('GENERATION_NOT_FOUND')
  })

  it('returns 409 when retrying an active generation', async () => {
    currentUserId = 'user_retry_active'
    const create = await postGeneration({ modelId: 'qwen-image', params: { prompt: 'lantern', n: 1, size: '1328*1328' } })
    const created = await create.json() as { success: true; data: { record: { id: string } } }

    const response = await app.handle(authed(`http://localhost/api/generations/${created.data.record.id}/retry`, { method: 'POST' }))
    const body = await response.json() as { success: false; error: { code: string } }

    expect(response.status).toBe(409)
    expect(body.error.code).toBe('GENERATION_NOT_RETRYABLE')
  })
})
