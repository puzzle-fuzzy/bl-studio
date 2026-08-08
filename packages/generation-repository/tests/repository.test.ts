import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  assetDerivatives,
  auditLogs,
  creditAccounts,
  creditLedgerEntries,
  createDb,
  generationArtifacts,
  generationEvents,
  generationInputAssets,
  generationRecords,
  providerRequestAudits,
  taskRecords,
  userAssets,
  usageRecords,
  users,
  type BailianStudioDb,
} from '@bailian-studio/db'
import { createIsolatedTestDb, resetBailianStudioTestDb, type IsolatedTestDb } from '@bailian-studio/db/test'
import { createGenerationRepository, GenerationRepositoryError, type GenerationRepository } from '../src'

let testDb!: IsolatedTestDb
let db!: BailianStudioDb
let repository!: GenerationRepository

beforeAll(async () => {
  testDb = await createIsolatedTestDb()
  db = createDb({ url: testDb.url, max: 5 })
  repository = createGenerationRepository({ db })
})

// 文件级（不嵌套在 describe 内），让连接对本文件的每个 describe 都保持打开——
// 若把 afterAll 嵌套在第一个 describe 里，会在兄弟 describe（"requestId tracking"）
// 运行前关闭数据库，导致 CONNECTION_ENDED。
afterAll(async () => {
  await db.close()
  await testDb.close()
})

async function seedCreditAccounts(excludeUserIds: readonly string[] = []): Promise<void> {
  const rows = await db.select({ id: users.id }).from(users)
  const excluded = new Set(excludeUserIds)
  const values = rows
    .filter(row => !excluded.has(row.id))
    .map(row => ({
      id: `credit-account-${row.id}`,
      userId: row.id,
      availableCents: 1_000_000,
      reservedCents: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }))
  if (values.length > 0) await db.insert(creditAccounts).values(values)
}

describe('generation repository', () => {
  beforeEach(async () => {
    await resetBailianStudioTestDb(db)
    // 创建测试用户以满足外键约束
    await db.insert(users).values([
      {
        id: 'user_1',
        email: 'user1@example.com',
        passwordHash: 'test-hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user_race',
        email: 'race@example.com',
        passwordHash: 'test-hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user_page',
        email: 'page@example.com',
        passwordHash: 'test-hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user_status',
        email: 'status@example.com',
        passwordHash: 'test-hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user_clamp',
        email: 'clamp@example.com',
        passwordHash: 'test-hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user_artifacts',
        email: 'artifacts@example.com',
        passwordHash: 'test-hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user_no_artifacts',
        email: 'noartifacts@example.com',
        passwordHash: 'test-hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user_store',
        email: 'store@example.com',
        passwordHash: 'test-hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user_a',
        email: 'a@example.com',
        passwordHash: 'test-hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user_b',
        email: 'b@example.com',
        passwordHash: 'test-hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user_cancel',
        email: 'cancel@example.com',
        passwordHash: 'test-hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user_cancel_processing',
        email: 'cancelproc@example.com',
        passwordHash: 'test-hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user_terminal_cancel_guard',
        email: 'terminalguard@example.com',
        passwordHash: 'test-hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'user_empty',
        email: 'empty@example.com',
        passwordHash: 'test-hash',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ])
    await seedCreditAccounts(['user_empty'])
  })

  it('creates and completes a local asset thumbnail through one durable task', async () => {
    const now = '2026-08-01T01:00:00.000Z'
    await repository.createUserAsset({
      id: 'asset_local_thumbnail',
      userId: 'user_1',
      kind: 'image',
      source: 'upload',
      fileName: 'portrait.png',
      mimeType: 'image/png',
      byteSize: 4096,
      storageProvider: 'local',
      storageKey: 'user_uploads/user_1/portrait.png',
      enqueueThumbnail: true,
      traceId: 'trace-thumbnail-1',
      now,
    })

    const [derivative] = await db.select().from(assetDerivatives)
    expect(derivative).toMatchObject({
      assetId: 'asset_local_thumbnail',
      userId: 'user_1',
      kind: 'thumbnail',
      status: 'queued',
    })
    if (derivative === undefined) throw new Error('thumbnail derivative missing')

    const [task] = await db.select().from(taskRecords).where(eq(taskRecords.recordId, derivative.id))
    expect(task).toMatchObject({
      type: 'media.thumbnail',
      domain: 'media',
      status: 'queued',
      userId: 'user_1',
      traceId: 'trace-thumbnail-1',
      inputJson: {
        assetId: 'asset_local_thumbnail',
        derivativeId: derivative.id,
      },
    })

    await expect(repository.getAssetThumbnailSource(derivative.id)).resolves.toMatchObject({
      assetId: 'asset_local_thumbnail',
      kind: 'image',
      storageProvider: 'local',
      storageKey: 'user_uploads/user_1/portrait.png',
      status: 'queued',
    })
    await expect(repository.getOwnedStorageObject({
      userId: 'user_1',
      storageKey: 'user_uploads/user_1/portrait.png',
    })).resolves.toMatchObject({
      id: 'asset_local_thumbnail',
      source: 'user_asset',
      fileName: 'portrait.png',
    })
    await expect(repository.markAssetThumbnailProcessing({ derivativeId: derivative.id, now }))
      .resolves.toBe(true)
    await repository.completeAssetThumbnail({
      derivativeId: derivative.id,
      storageProvider: 'local',
      storageKey: `asset-thumbnails/asset_local_thumbnail/${derivative.id}.webp`,
      mimeType: 'image/webp',
      byteSize: 512,
      metadata: { maxDimension: 640 },
      now,
    })

    await expect(repository.getUserAsset({ userId: 'user_1', assetId: 'asset_local_thumbnail' }))
      .resolves.toMatchObject({
        thumbnailStatus: 'ready',
        thumbnailStorageProvider: 'local',
        thumbnailStorageKey: `asset-thumbnails/asset_local_thumbnail/${derivative.id}.webp`,
      })
    await expect(repository.getOwnedStorageObject({
      userId: 'user_1',
      storageKey: `asset-thumbnails/asset_local_thumbnail/${derivative.id}.webp`,
    })).resolves.toMatchObject({
      id: derivative.id,
      source: 'asset_derivative',
      mimeType: 'image/webp',
    })
  })

  it('does not enqueue duplicate or insecure thumbnail sources', async () => {
    await repository.createUserAsset({
      id: 'asset_http_thumbnail',
      userId: 'user_1',
      kind: 'image',
      source: 'link',
      originalUrl: 'http://example.test/image.png',
      enqueueThumbnail: true,
    })
    await repository.createUserAsset({
      id: 'asset_oss_thumbnail',
      userId: 'user_1',
      kind: 'image',
      source: 'upload',
      storageProvider: 'oss',
      storageKey: 'uploads/image.png',
      enqueueThumbnail: true,
    })

    expect(await db.select().from(assetDerivatives)).toHaveLength(0)
    expect((await db.select().from(taskRecords)).filter(task => task.type === 'media.thumbnail')).toHaveLength(0)
  })

  it('cancels a queued thumbnail when its source asset is soft-deleted', async () => {
    await repository.createUserAsset({
      id: 'asset_thumbnail_deleted',
      userId: 'user_1',
      kind: 'video',
      source: 'upload',
      storageProvider: 'local',
      storageKey: 'uploads/deleted.mp4',
      enqueueThumbnail: true,
    })
    const [derivative] = await db.select().from(assetDerivatives)
    if (derivative === undefined) throw new Error('thumbnail derivative missing')

    await expect(repository.softDeleteUserAsset({
      userId: 'user_1',
      assetId: 'asset_thumbnail_deleted',
      now: '2026-08-01T02:00:00.000Z',
    })).resolves.toBe(true)

    const [deletedDerivative] = await db.select().from(assetDerivatives)
    const [task] = await db.select().from(taskRecords).where(eq(taskRecords.recordId, derivative.id))
    expect(deletedDerivative?.deletedAt?.toISOString()).toBe('2026-08-01T02:00:00.000Z')
    expect(task).toMatchObject({
      status: 'cancelled',
      errorJson: { code: 'THUMBNAIL_SOURCE_DELETED' },
    })
  })

  it('rejects generation creation when the user cannot cover the estimate', async () => {
    await expect(repository.createGeneration({
      userId: 'user_empty',
      modelId: 'qwen-image',
      params: { prompt: 'insufficient', n: 1, size: '1328*1328' },
    })).rejects.toMatchObject({ code: 'POINTS_INSUFFICIENT' })
  })

  it('serializes concurrent reservations so one request cannot overspend the account', async () => {
    await db.insert(creditAccounts).values({
      id: 'credit-account-user_empty',
      userId: 'user_empty',
      availableCents: 25,
      reservedCents: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    const results = await Promise.allSettled([
      repository.createGeneration({ userId: 'user_empty', modelId: 'qwen-image', params: { prompt: 'race-a' } }),
      repository.createGeneration({ userId: 'user_empty', modelId: 'qwen-image', params: { prompt: 'race-b' } }),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    expect(rejected?.reason).toMatchObject({ code: 'POINTS_INSUFFICIENT' })

    const [account] = await db
      .select({ availableCents: creditAccounts.availableCents, reservedCents: creditAccounts.reservedCents })
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, 'user_empty'))
    expect(account).toEqual({ availableCents: 0, reservedCents: 25 })
  })

  it('serializes concurrent daily quota admissions', async () => {
    const results = await Promise.allSettled([
      repository.createGeneration({
        userId: 'user_race',
        modelId: 'qwen-image',
        params: { prompt: 'quota-a' },
        quota: { dailyTaskLimit: 1, dailyQuotaMode: 'attempts' },
      }),
      repository.createGeneration({
        userId: 'user_race',
        modelId: 'qwen-image',
        params: { prompt: 'quota-b' },
        quota: { dailyTaskLimit: 1, dailyQuotaMode: 'attempts' },
      }),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    expect(rejected?.reason).toMatchObject({ code: 'GENERATION_DAILY_LIMIT_EXCEEDED' })
  })

  it('does not oversubscribe a successful-generation quota with pending reservations', async () => {
    const results = await Promise.allSettled([
      repository.createGeneration({
        userId: 'user_race',
        modelId: 'qwen-image',
        params: { prompt: 'successful-quota-a' },
        quota: { dailyTaskLimit: 1, dailyQuotaMode: 'successful' },
      }),
      repository.createGeneration({
        userId: 'user_race',
        modelId: 'qwen-image',
        params: { prompt: 'successful-quota-b' },
        quota: { dailyTaskLimit: 1, dailyQuotaMode: 'successful' },
      }),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find((result): result is PromiseRejectedResult => result.status === 'rejected')
    expect(rejected?.reason).toMatchObject({ code: 'GENERATION_DAILY_LIMIT_EXCEEDED' })
  })

  it('creates a generation record and queued submit task in one transaction', async () => {
    const result = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })

    expect(result.record.status).toBe('submitting')
    expect(result.record.costEstimate).toBe(25)
    expect(result.record.currency).toBe('CNY')
    expect(result.record.pricingVersion).toMatch(/^pricing-[0-9a-f]{16}$/)
    expect(result.record.modelManifestHash).toMatch(/^manifest-[0-9a-f]{16}$/)
    expect(result.task.status).toBe('queued')
    expect(result.task.type).toBe('generation.submit')
    expect(result.task.recordId).toBe(result.record.id)
    expect(result.task.errorJson).toBeUndefined()
    expect('errorJson' in result.task).toBe(true)
    const eventId = result.event.id
    expect(result.event).toMatchObject({
      id: expect.stringMatching(/^generation_event_/),
      recordId: result.record.id,
      userId: 'user_1',
      status: 'submitting',
      modelId: 'qwen-image',
    })

    await expect(repository.listGenerationEvents({ userId: 'user_1' })).resolves.toEqual([result.event])
    await expect(repository.listGenerationEvents({ afterId: eventId })).resolves.toEqual([])
    await expect(repository.getGenerationEvent(eventId)).resolves.toEqual(result.event)
    await expect(repository.getGenerationEvent(eventId, 'user_1')).resolves.toEqual(result.event)
    await expect(repository.getGenerationEvent(eventId, 'another-user')).resolves.toBeUndefined()
    await expect(repository.getGenerationEvent('generation_event_missing', 'user_1')).resolves.toBeUndefined()
    const fetched = await repository.getGenerationRecord(result.record.id)
    expect(fetched).toEqual(result.record)
  })

  it('continues an outbox scan after the cursor event row is deleted', async () => {
    const first = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'cursor owner that will be deleted' },
    })
    const cursorCreatedAt = new Date('2026-01-01T00:00:00.000Z')
    await db
      .update(generationEvents)
      .set({ createdAt: cursorCreatedAt })
      .where(eq(generationEvents.id, first.event.id))

    const cursor = {
      id: first.event.id,
      createdAt: cursorCreatedAt.toISOString(),
    }
    await db.delete(users).where(eq(users.id, 'user_1'))
    await expect(repository.getGenerationEvent(cursor.id)).resolves.toBeUndefined()

    const second = await repository.createGeneration({
      userId: 'user_a',
      modelId: 'qwen-image',
      params: { prompt: 'event after a purged cursor' },
    })

    await expect(repository.listGenerationEvents({ afterCursor: cursor })).resolves.toEqual([
      second.event,
    ])
  })

  it('persists ordered asset references while keeping media coordinates out of generation params', async () => {
    await repository.createUserAsset({
      id: 'asset_input_a',
      userId: 'user_1',
      kind: 'image',
      source: 'upload',
      storageProvider: 'oss',
      storageKey: 'users/user_1/a.png',
    })
    await repository.createUserAsset({
      id: 'asset_input_b',
      userId: 'user_1',
      kind: 'image',
      source: 'link',
      originalUrl: 'https://example.com/b.png',
    })

    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image-edit',
      params: { prompt: 'turn this into a paper collage' },
      assetRefs: { image: ['asset_input_b', 'asset_input_a'] },
      idempotencyKey: 'asset-ref-create',
    })

    expect(created.record.inputParams).not.toHaveProperty('image')
    expect(created.record.assetRefs).toEqual({
      image: ['asset_input_b', 'asset_input_a'],
    })
    expect(created.task.input).toEqual({ recordId: created.record.id })

    const storedBindings = await db
      .select({
        parameterName: generationInputAssets.parameterName,
        position: generationInputAssets.position,
        assetId: generationInputAssets.assetId,
      })
      .from(generationInputAssets)
      .where(eq(generationInputAssets.generationId, created.record.id))
      .orderBy(generationInputAssets.position)
    expect(storedBindings).toEqual([
      { parameterName: 'image', position: 0, assetId: 'asset_input_b' },
      { parameterName: 'image', position: 1, assetId: 'asset_input_a' },
    ])

    await expect(repository.getGenerationRecord(created.record.id))
      .resolves.toEqual(created.record)
    await expect(repository.listGenerationRecords('user_1'))
      .resolves.toMatchObject({ items: [created.record] })
    await expect(repository.getGenerationInputAssets(created.record.id))
      .resolves.toEqual([
        {
          generationId: created.record.id,
          parameterName: 'image',
          position: 0,
          assetId: 'asset_input_b',
          userId: 'user_1',
          kind: 'image',
          source: 'link',
          originalUrl: 'https://example.com/b.png',
        },
        {
          generationId: created.record.id,
          parameterName: 'image',
          position: 1,
          assetId: 'asset_input_a',
          userId: 'user_1',
          kind: 'image',
          source: 'upload',
          storageProvider: 'oss',
          storageKey: 'users/user_1/a.png',
        },
      ])
  })

  it('normalizes persisted single-asset bindings to ordered arrays', async () => {
    await repository.createUserAsset({
      id: 'asset_single_video',
      userId: 'user_1',
      kind: 'video',
      source: 'upload',
      storageProvider: 'oss',
      storageKey: 'users/user_1/single.mp4',
    })

    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'happyhorse-video-edit',
      params: { prompt: 'normalize this binding', duration: 5 },
      assetRefs: { video: 'asset_single_video' },
      idempotencyKey: 'single-binding-shape',
    })

    expect(created.record.assetRefs).toEqual({
      video: ['asset_single_video'],
    })
    await expect(repository.getGenerationRecord(created.record.id))
      .resolves.toMatchObject({ assetRefs: { video: ['asset_single_video'] } })

    const replay = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'happyhorse-video-edit',
      params: { prompt: 'normalize this binding', duration: 5 },
      assetRefs: { video: ['asset_single_video'] },
      idempotencyKey: 'single-binding-shape',
    })
    expect(replay.record.id).toBe(created.record.id)
    expect(replay.record.assetRefs).toEqual({
      video: ['asset_single_video'],
    })
  })

  it('filters owner task-library views and keeps hide/delete reversible', async () => {
    const createRecord = async (label: string) => repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: label, n: 1, size: '1328*1328' },
      idempotencyKey: `library-view:${label}`,
    })
    const completed = await createRecord('completed')
    const active = await createRecord('active')
    const hidden = await createRecord('hidden')
    const deleted = await createRecord('deleted')

    await repository.completeGeneration({
      recordId: completed.record.id,
      costFinal: 20,
      output: { artifacts: [] },
      now: '2026-07-31T11:00:00.000Z',
    })
    const hiddenRecord = await repository.setGenerationLibraryState({
      recordId: hidden.record.id,
      userId: 'user_1',
      state: 'hidden',
      now: '2026-07-31T11:01:00.000Z',
    })
    const deletedRecord = await repository.setGenerationLibraryState({
      recordId: deleted.record.id,
      userId: 'user_1',
      state: 'deleted',
      now: '2026-07-31T11:02:00.000Z',
    })

    expect(hiddenRecord.hiddenAt).toBe('2026-07-31T11:01:00.000Z')
    expect(hiddenRecord.deletedAt).toBeUndefined()
    expect(deletedRecord.deletedAt).toBe('2026-07-31T11:02:00.000Z')
    expect(deletedRecord.hiddenAt).toBeUndefined()

    const visibleIds = new Set(
      (await repository.listGenerationRecords('user_1')).items.map(item => item.id),
    )
    expect(visibleIds.has(completed.record.id)).toBe(true)
    expect(visibleIds.has(active.record.id)).toBe(true)
    expect(visibleIds.has(hidden.record.id)).toBe(false)
    expect(visibleIds.has(deleted.record.id)).toBe(false)

    expect(
      (await repository.listGenerationRecords('user_1', {
        views: ['completed'],
      })).items.map(item => item.id),
    ).toEqual([completed.record.id])
    expect(
      (await repository.listGenerationRecords('user_1', {
        views: ['active'],
      })).items.map(item => item.id),
    ).toEqual([active.record.id])
    expect(
      (await repository.listGenerationRecords('user_1', {
        views: ['hidden'],
      })).items.map(item => item.id),
    ).toEqual([hidden.record.id])
    expect(
      (await repository.listGenerationRecords('user_1', {
        views: ['deleted'],
      })).items.map(item => item.id),
    ).toEqual([deleted.record.id])

    const combinedIds = new Set(
      (await repository.listGenerationRecords('user_1', {
        views: ['completed', 'hidden'],
      })).items.map(item => item.id),
    )
    expect(combinedIds).toEqual(new Set([completed.record.id, hidden.record.id]))

    const restored = await repository.setGenerationLibraryState({
      recordId: deleted.record.id,
      userId: 'user_1',
      state: 'visible',
      now: '2026-07-31T11:03:00.000Z',
    })
    expect(restored.deletedAt).toBeUndefined()
    expect(restored.hiddenAt).toBeUndefined()

    await expect(repository.setGenerationLibraryState({
      recordId: completed.record.id,
      userId: 'user_other',
      state: 'deleted',
    })).rejects.toMatchObject({ code: 'GENERATION_NOT_FOUND' })
  })

  it('binds idempotency to ordered asset references and hides unavailable assets', async () => {
    for (const id of ['asset_idem_a', 'asset_idem_b']) {
      await repository.createUserAsset({
        id,
        userId: 'user_1',
        kind: 'image',
        source: 'upload',
        storageProvider: 'oss',
        storageKey: `users/user_1/${id}.png`,
      })
    }
    await repository.createUserAsset({
      id: 'asset_foreign',
      userId: 'user_b',
      kind: 'image',
      source: 'upload',
    })

    const first = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image-edit',
      params: { prompt: 'idempotent refs' },
      assetRefs: { image: ['asset_idem_a', 'asset_idem_b'] },
      idempotencyKey: 'asset-ref-idempotency',
    })
    const replay = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image-edit',
      params: { prompt: 'idempotent refs' },
      assetRefs: { image: ['asset_idem_a', 'asset_idem_b'] },
      idempotencyKey: 'asset-ref-idempotency',
    })
    expect(replay.record.id).toBe(first.record.id)

    await expect(repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image-edit',
      params: { prompt: 'idempotent refs' },
      assetRefs: { image: ['asset_idem_b', 'asset_idem_a'] },
      idempotencyKey: 'asset-ref-idempotency',
    })).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })

    await expect(repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image-edit',
      params: { prompt: 'foreign ref' },
      assetRefs: { image: 'asset_foreign' },
    })).rejects.toMatchObject({
      code: 'INVALID_GENERATION_PARAMS',
      details: { issues: [{ code: 'INVALID_ASSET_REFERENCE' }] },
    })
  })

  it('accepts an empty assetRefs map for text-only models (no media bindings)', async () => {
    // 前端对纯文生图/文生视频模型总是发 assetRefs:{}；空 map 应走纯参数校验而非报错。
    const result = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'a cat' },
      assetRefs: {},
    })
    expect(result.record.id).toBeTruthy()
    expect(result.record.modelId).toBe('qwen-image')
  })

  it('rejects unknown and non-media asset binding coordinates before writing', async () => {
    await repository.createUserAsset({
      id: 'asset_structural',
      userId: 'user_1',
      kind: 'image',
      source: 'upload',
      storageProvider: 'oss',
      storageKey: 'users/user_1/structural.png',
    })

    for (const field of ['missingParameter', 'prompt']) {
      await expect(repository.createGeneration({
        userId: 'user_1',
        modelId: 'qwen-image-edit',
        params: { prompt: 'invalid coordinate' },
        assetRefs: { [field]: 'asset_structural' },
      })).rejects.toMatchObject({
        code: 'INVALID_GENERATION_PARAMS',
        details: { issues: [{ field }] },
      })
    }

    expect(await db.select().from(generationRecords)).toHaveLength(0)
    expect(await db.select().from(generationInputAssets)).toHaveLength(0)
  })

  it('rejects wrong-kind, not-ready, and deleted asset bindings', async () => {
    await repository.createUserAsset({
      id: 'asset_wrong_kind',
      userId: 'user_1',
      kind: 'video',
      source: 'upload',
      storageProvider: 'oss',
      storageKey: 'users/user_1/wrong.mp4',
    })
    for (const id of ['asset_not_ready', 'asset_deleted']) {
      await repository.createUserAsset({
        id,
        userId: 'user_1',
        kind: 'image',
        source: 'upload',
        storageProvider: 'oss',
        storageKey: `users/user_1/${id}.png`,
      })
    }
    await db
      .update(userAssets)
      .set({ status: 'uploading' })
      .where(eq(userAssets.id, 'asset_not_ready'))
    await repository.softDeleteUserAsset({
      userId: 'user_1',
      assetId: 'asset_deleted',
    })

    for (const assetId of ['asset_wrong_kind', 'asset_not_ready', 'asset_deleted']) {
      await expect(repository.createGeneration({
        userId: 'user_1',
        modelId: 'qwen-image-edit',
        params: { prompt: 'unavailable source' },
        assetRefs: { image: assetId },
      })).rejects.toMatchObject({
        code: 'INVALID_GENERATION_PARAMS',
        details: { issues: [{ field: 'image' }] },
      })
    }

    expect(await db.select().from(generationRecords)).toHaveLength(0)
    expect(await db.select().from(generationInputAssets)).toHaveLength(0)
  })

  it('rolls back bindings and all generation side effects after a post-binding credit failure', async () => {
    await repository.createUserAsset({
      id: 'asset_rollback',
      userId: 'user_empty',
      kind: 'image',
      source: 'upload',
      storageProvider: 'oss',
      storageKey: 'users/user_empty/rollback.png',
    })

    await expect(repository.createGeneration({
      userId: 'user_empty',
      modelId: 'qwen-image-edit',
      params: { prompt: 'must roll back' },
      assetRefs: { image: 'asset_rollback' },
    })).rejects.toMatchObject({ code: 'POINTS_INSUFFICIENT' })

    expect(await db.select().from(generationRecords)).toHaveLength(0)
    expect(await db.select().from(generationInputAssets)).toHaveLength(0)
    expect(await db.select().from(taskRecords)).toHaveLength(0)
    expect(await db.select().from(generationEvents)).toHaveLength(0)
    expect(await db.select().from(usageRecords)).toHaveLength(0)
    expect(await db.select().from(creditLedgerEntries)).toHaveLength(0)
    expect(
      await db.select().from(creditAccounts).where(eq(creditAccounts.userId, 'user_empty')),
    ).toHaveLength(0)
  })

  it('enforces manifest media combination limits before opening a transaction', async () => {
    for (let index = 1; index <= 6; index += 1) {
      await repository.createUserAsset({
        id: `asset_group_image_${index}`,
        userId: 'user_1',
        kind: 'image',
        source: 'upload',
        storageProvider: 'oss',
        storageKey: `users/user_1/group-${index}.png`,
      })
    }
    for (let index = 1; index <= 3; index += 1) {
      await repository.createUserAsset({
        id: `asset_group_video_${index}`,
        userId: 'user_1',
        kind: 'video',
        source: 'upload',
        storageProvider: 'oss',
        storageKey: `users/user_1/group-${index}.mp4`,
      })
    }

    await expect(repository.createGeneration({
      userId: 'user_1',
      modelId: 'wanx-2.7-reference-video',
      params: { prompt: 'too many combined references' },
      assetRefs: {
        references: ['asset_group_image_1', 'asset_group_image_2', 'asset_group_image_3'],
        referenceVideos: ['asset_group_video_1', 'asset_group_video_2', 'asset_group_video_3'],
      },
    })).rejects.toMatchObject({ code: 'INVALID_GENERATION_PARAMS' })

    const featureOnly = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'keling-reference-video',
      params: { prompt: 'follow the feature video' },
      assetRefs: { featureVideo: 'asset_group_video_1' },
    })
    expect(featureOnly.record.assetRefs).toEqual({
      featureVideo: ['asset_group_video_1'],
    })

    await expect(repository.createGeneration({
      userId: 'user_1',
      modelId: 'keling-reference-video',
      params: { prompt: 'too many references with a feature video' },
      assetRefs: {
        references: [
          'asset_group_image_1',
          'asset_group_image_2',
          'asset_group_image_3',
          'asset_group_image_4',
          'asset_group_image_5',
        ],
        featureVideo: 'asset_group_video_1',
      },
    })).rejects.toMatchObject({ code: 'INVALID_GENERATION_PARAMS' })

    const records = await db
      .select({ id: generationRecords.id })
      .from(generationRecords)
      .where(eq(generationRecords.userId, 'user_1'))
    expect(records).toEqual([{ id: featureOnly.record.id }])
    const bindings = await db
      .select({
        parameterName: generationInputAssets.parameterName,
        assetId: generationInputAssets.assetId,
      })
      .from(generationInputAssets)
      .where(eq(generationInputAssets.generationId, featureOnly.record.id))
    expect(bindings).toEqual([
      { parameterName: 'featureVideo', assetId: 'asset_group_video_1' },
    ])
  })

  it('uses official SDK pricing for covered Bailian models', async () => {
    const keling = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'keling-text-to-video',
      params: { prompt: 'a paper boat', mode: 'std', duration: 5 },
    })
    const happyhorseEdit = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'happyhorse-video-edit',
      params: {
        video: 'https://example.com/input.mp4',
        prompt: 'change the color palette',
        resolution: '1080P',
        duration: 5,
      },
    })
    const music = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'fun-music-v1',
      params: { prompt: 'summer folk music', duration: 60 },
    })
    const deepseek = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'deepseek-v4-pro',
      params: { prompt: 'explain quantum entanglement' },
    })

    expect(keling.record.costEstimate).toBe(300)
    // HappyHorse 视频编辑按 5 秒输入 + 5 秒输出计费。
    expect(happyhorseEdit.record.costEstimate).toBe(1600)
    expect(music.record.costEstimate).toBe(12)
    expect(deepseek.record.costEstimate).toBe(10)
    expect(deepseek.record.inputParams).toMatchObject({
      prompt: 'explain quantum entanglement',
      maxCompletionTokens: 4096,
      enableThinking: true,
      reasoningEffort: 'high',
      temperature: 1,
      topP: 0.95,
      seed: 1234,
      resultFormat: 'message',
    })
  })

  it('returns the existing generation for an idempotency key', async () => {
    const first = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
      idempotencyKey: 'idem_1',
    })
    const second = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
      idempotencyKey: 'idem_1',
    })

    expect(second.record.id).toBe(first.record.id)
    expect(second.task.recordId).toBe(first.record.id)
  })

  it('returns the same generation for concurrent idempotent creates', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => repository.createGeneration({
      userId: 'user_race',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
      idempotencyKey: 'idem_race',
    })))

    expect(new Set(results.map(result => result.record.id)).size).toBe(1)
    expect(new Set(results.map(result => result.task.id)).size).toBe(1)
    expect((await repository.listGenerationRecords('user_race')).items).toHaveLength(1)

    const storedRecords = await db
      .select()
      .from(generationRecords)
      .where(eq(generationRecords.userId, 'user_race'))
    const storedTasks = await db
      .select()
      .from(taskRecords)
      .where(eq(taskRecords.recordId, results[0]!.record.id))

    expect(storedRecords).toHaveLength(1)
    expect(storedTasks).toHaveLength(1)

    // 锁必须在认领 `now`（真实当前时间，取自 nextRunAt）之后才过期；
    // 若 lockedUntil 在过去，会命中「重认领停滞任务」分支并再次被认领。
    const claimNow = results[0]!.task.nextRunAt
    const lockedUntil = new Date(new Date(claimNow).getTime() + 30_000).toISOString()
    const claimed = await repository.claimNextQueuedTask({
      workerId: 'worker-a',
      now: claimNow,
      lockedUntil,
    })
    const secondClaim = await repository.claimNextQueuedTask({
      workerId: 'worker-b',
      now: claimNow,
      lockedUntil,
    })

    expect(claimed?.id).toBe(results[0]!.task.id)
    expect(secondClaim).toBeUndefined()
  })

  it('rejects invalid model params before writing', async () => {
    await expect(repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { n: 1 },
    })).rejects.toMatchObject({ code: 'INVALID_GENERATION_PARAMS' })

    await expect(repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'qwen-image only supports one output', n: 2 },
    })).rejects.toMatchObject({
      code: 'INVALID_GENERATION_PARAMS',
      details: { issues: [{ code: 'OUT_OF_RANGE', field: 'n' }] },
    })

    await expect(repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image-2.0-pro',
      params: { prompt: 'fractional image count', n: 3.45874587458746 },
    })).rejects.toMatchObject({
      code: 'INVALID_GENERATION_PARAMS',
      details: { issues: [{ code: 'INVALID_VALUE', field: 'n' }] },
    })

    await expect(repository.createGeneration({
      userId: 'user_1',
      modelId: 'happyhorse-text-to-video',
      params: { prompt: 'fractional duration', duration: 4.94059405940594 },
    })).rejects.toMatchObject({
      code: 'INVALID_GENERATION_PARAMS',
      details: { issues: [{ code: 'INVALID_VALUE', field: 'duration' }] },
    })

    await expect(repository.listGenerationRecords('user_1')).resolves.toEqual({ items: [] })
    expect(await db.select().from(taskRecords)).toHaveLength(0)
  })

  it('claims one ready queued task atomically', async () => {
    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })

    // 锁必须在认领 `now`（真实当前时间，取自 nextRunAt）之后才过期；
    // 若 lockedUntil 在过去，会命中「重认领停滞任务」分支并再次被认领。
    const claimNow = created.task.nextRunAt
    const lockedUntil = new Date(new Date(claimNow).getTime() + 30_000).toISOString()
    const claimed = await repository.claimNextQueuedTask({
      workerId: 'worker-a',
      now: claimNow,
      lockedUntil,
    })
    const second = await repository.claimNextQueuedTask({
      workerId: 'worker-b',
      now: claimNow,
      lockedUntil,
    })

    expect(claimed?.status).toBe('running')
    expect(claimed?.lockedBy).toBe('worker-a')
    expect(claimed?.attempts).toBe(1)
    expect(second).toBeUndefined()
  })

  it('force-fails a corrupt task row on claim instead of poisoning the loop', async () => {
    const healthy = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })

    // 绕过状态机直接落一条 type/domain 配对错误的脏行（P2-05 的毒化源）：
    // type='generation.submit' 必须搭配 domain='generation'，这里写成 artifact，
    // claim 时 transitionTask 的 assertTaskTypeMatchesDomain 会确定性抛错。
    const now = new Date()
    const corruptId = 'task_corrupt_poison'
    await db.insert(taskRecords).values({
      id: corruptId,
      type: 'generation.submit',
      domain: 'artifact',
      status: 'queued',
      priority: 99, // 高于健康任务，保证它先被 claim 选中
      inputJson: {},
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: new Date(now.getTime() - 60_000),
      createdAt: now,
      updatedAt: now,
    })

    const claimNow = healthy.task.nextRunAt
    const lockedUntil = new Date(new Date(claimNow).getTime() + 30_000).toISOString()

    // 第一次 claim 命中毒行：被跳过（返回 undefined）且强制置为 failed 终态。
    const first = await repository.claimNextQueuedTask({
      workerId: 'worker-a',
      now: claimNow,
      lockedUntil,
    })
    expect(first).toBeUndefined()
    await expect(repository.getTask(corruptId)).resolves.toMatchObject({
      status: 'failed',
      errorJson: { code: 'TASK_CLAIM_INVALID' },
    })

    // 毒行已排除，队列里排在后面的健康任务能被正常认领——loop 不再被毒化。
    const second = await repository.claimNextQueuedTask({
      workerId: 'worker-a',
      now: claimNow,
      lockedUntil,
    })
    expect(second?.id).toBe(healthy.task.id)
    expect(second?.status).toBe('running')
  })

  it('renews a task lease only while the same worker still owns it', async () => {
    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })
    const claimNow = created.task.nextRunAt
    const firstLockUntil = new Date(new Date(claimNow).getTime() + 30_000).toISOString()
    const claimed = await repository.claimNextQueuedTask({
      workerId: 'worker-a',
      now: claimNow,
      lockedUntil: firstLockUntil,
    })
    if (!claimed) throw new Error('expected task')

    const renewedLockUntil = new Date(new Date(claimNow).getTime() + 60_000).toISOString()
    const renewed = await repository.renewTaskLock({
      taskId: claimed.id,
      workerId: 'worker-a',
      now: claimNow,
      lockedUntil: renewedLockUntil,
    })
    expect(renewed?.lockedBy).toBe('worker-a')
    expect(renewed?.lockedUntil).toBe(renewedLockUntil)

    await expect(repository.renewTaskLock({
      taskId: claimed.id,
      workerId: 'worker-b',
      now: claimNow,
      lockedUntil: renewedLockUntil,
    })).resolves.toBeUndefined()

    const afterExpiry = new Date(new Date(renewedLockUntil).getTime() + 1).toISOString()
    await expect(repository.renewTaskLock({
      taskId: claimed.id,
      workerId: 'worker-a',
      now: afterExpiry,
      lockedUntil: new Date(new Date(afterExpiry).getTime() + 60_000).toISOString(),
    })).resolves.toBeUndefined()
  })

  it('does not let an old worker save over a task re-claimed by another worker', async () => {
    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })
    const claimNow = created.task.nextRunAt
    const firstLockUntil = new Date(new Date(claimNow).getTime() + 30_000).toISOString()
    const claimed = await repository.claimNextQueuedTask({
      workerId: 'worker-a',
      now: claimNow,
      lockedUntil: firstLockUntil,
    })
    if (!claimed) throw new Error('expected task')

    const staleWrite = await repository.saveTask(
      { ...claimed, status: 'succeeded', output: { stale: true } },
      { expectedWorkerId: 'worker-b' },
    )
    expect(staleWrite).toBeUndefined()
    await expect(repository.getTask(claimed.id)).resolves.toMatchObject({ status: 'running' })

    const ownedWrite = await repository.saveTask(
      { ...claimed, status: 'succeeded', output: { stale: false } },
      { expectedWorkerId: 'worker-a' },
    )
    expect(ownedWrite?.status).toBe('succeeded')
  })

  it('does not save an owned result after the task lease has expired', async () => {
    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })
    const claimNow = created.task.nextRunAt
    const expiredLockUntil = new Date(new Date(claimNow).getTime() - 1_000).toISOString()
    const claimed = await repository.claimNextQueuedTask({
      workerId: 'worker-a',
      now: claimNow,
      lockedUntil: expiredLockUntil,
    })
    if (!claimed) throw new Error('expected task')

    const staleWrite = await repository.saveTask(
      { ...claimed, status: 'succeeded', output: { stale: true } },
      { expectedWorkerId: 'worker-a' },
    )

    expect(staleWrite).toBeUndefined()
    await expect(repository.getTask(claimed.id)).resolves.toMatchObject({ status: 'running' })
  })

  it('records and closes a provider request audit without storing raw provider payloads', async () => {
    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })
    const started = await repository.startProviderRequest({
      generationId: created.record.id,
      taskId: created.task.id,
      userId: created.record.userId,
      provider: created.record.provider,
      providerModel: created.record.providerModel,
      operation: 'submit',
      idempotencyKey: 'generation:gen_test:submit',
      attempt: 1,
      estimatedCostCents: created.record.costEstimate,
      startedAt: '2026-07-01T00:00:00.000Z',
    })

    expect(started).toMatchObject({
      generationId: created.record.id,
      taskId: created.task.id,
      operation: 'submit',
      status: 'started',
      idempotencyKey: 'generation:gen_test:submit',
      estimatedCostCents: created.record.costEstimate,
    })

    const finished = await repository.finishProviderRequest({
      auditId: started.id,
      status: 'succeeded',
      providerRequestId: 'request-123',
      billedCostCents: 20,
      completedAt: '2026-07-01T00:00:00.250Z',
      latencyMs: 250,
    })

    expect(finished).toMatchObject({
      status: 'succeeded',
      providerRequestId: 'request-123',
      billedCostCents: 20,
      latencyMs: 250,
    })

    const [row] = await db
      .select()
      .from(providerRequestAudits)
      .where(eq(providerRequestAudits.id, started.id))
    expect(row?.errorJson).toBeNull()
    expect(row?.providerRequestId).toBe('request-123')
    expect(row?.idempotencyKey).toBe('generation:gen_test:submit')
  })

  it('records bounded product audit events without request payloads', async () => {
    const event = await repository.recordAuditEvent({
      userId: 'user_1',
      action: 'generation.create',
      outcome: 'succeeded',
      targetType: 'generation',
      targetId: 'gen_audit_test',
      requestId: 'request-audit-1',
      traceId: 'trace-audit-1',
      method: 'POST',
      path: '/api/generations',
      metadata: { modelId: 'qwen-image', estimatedCostCents: 20 },
      occurredAt: '2026-07-01T00:00:00.000Z',
    })

    expect(event).toMatchObject({
      userId: 'user_1',
      action: 'generation.create',
      outcome: 'succeeded',
      targetId: 'gen_audit_test',
      path: '/api/generations',
      metadata: { modelId: 'qwen-image', estimatedCostCents: 20 },
      occurredAt: '2026-07-01T00:00:00.000Z',
    })

    const [row] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.id, event.id))
    expect(row?.metadataJson).toEqual({ modelId: 'qwen-image', estimatedCostCents: 20 })
    expect(row?.path).toBe('/api/generations')
  })

  it('keeps exactly one usage row per generation and settles it once', async () => {
    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })

    const reserved = await db
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.generationId, created.record.id))
    expect(reserved).toHaveLength(1)
    expect(reserved[0]).toMatchObject({
      status: 'reserved',
      estimatedCostCents: created.record.costEstimate,
      providerCostCents: null,
      chargedCostCents: null,
    })
    const reservedAccount = await db
      .select({ availableCents: creditAccounts.availableCents, reservedCents: creditAccounts.reservedCents })
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, 'user_1'))
    expect(reservedAccount).toEqual([{ availableCents: 999975, reservedCents: 25 }])

    await repository.completeGeneration({
      recordId: created.record.id,
      costFinal: 25,
      requestId: 'request-final-1',
      output: { artifacts: [] },
      enqueueArtifactPersist: false,
      now: '2026-07-01T00:00:01.000Z',
    })

    const settled = await db
      .select()
      .from(usageRecords)
      .where(eq(usageRecords.generationId, created.record.id))
    expect(settled).toHaveLength(1)
    expect(settled[0]).toMatchObject({
      status: 'settled',
      providerCostCents: 25,
      chargedCostCents: 25,
      providerRequestId: 'request-final-1',
    })
    const settledAccount = await db
      .select({ availableCents: creditAccounts.availableCents, reservedCents: creditAccounts.reservedCents })
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, 'user_1'))
    expect(settledAccount).toEqual([{ availableCents: 999975, reservedCents: 0 }])
    expect(await db
      .select({ kind: creditLedgerEntries.kind })
      .from(creditLedgerEntries)
      .where(eq(creditLedgerEntries.generationId, created.record.id)))
      .toEqual([{ kind: 'reserve' }, { kind: 'settle' }])

    if (repository.getGenerationUsage === undefined) throw new Error('expected usage aggregation')
    const usageWindowEnd = new Date(Date.parse(created.record.createdAt) + 60_000).toISOString()
    await expect(repository.getGenerationUsage({
      userId: 'user_1',
      since: created.record.createdAt,
      until: usageWindowEnd,
    })).resolves.toMatchObject({
      generationCount: 1,
      estimatedCents: created.record.costEstimate,
      chargedCents: 25,
      providerCostCents: 25,
    })
  })

  it('caps a provider settlement at the reserved estimate without overdrawing the account', async () => {
    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'provider overrun' },
    })

    const completed = await repository.completeGeneration({
      recordId: created.record.id,
      costFinal: 80,
      output: { artifacts: [] },
      enqueueArtifactPersist: false,
    })
    expect(completed.billingAnomaly).toEqual({ estimatedCents: 25, reportedCents: 80 })

    const [account] = await db
      .select({ availableCents: creditAccounts.availableCents, reservedCents: creditAccounts.reservedCents })
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, 'user_1'))
    expect(account).toEqual({ availableCents: 999_975, reservedCents: 0 })

    const [usage] = await db
      .select({
        chargedCostCents: usageRecords.chargedCostCents,
        providerCostCents: usageRecords.providerCostCents,
      })
      .from(usageRecords)
      .where(eq(usageRecords.generationId, created.record.id))
    expect(usage).toMatchObject({ chargedCostCents: 25, providerCostCents: 80 })
  })

  it('persists task retry and success states', async () => {
    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })
    const claimed = await repository.claimNextQueuedTask({
      workerId: 'worker-a',
      now: created.task.nextRunAt,
      lockedUntil: '2026-06-28T00:00:30.000Z',
    })
    if (!claimed) throw new Error('expected task')

    const saved = await repository.saveTask({ ...claimed, status: 'succeeded', output: { artifactCount: 0 } })

    if (!saved) throw new Error('expected task to be saved')
    expect(saved.status).toBe('succeeded')
    await expect(repository.getTask(saved.id)).resolves.toEqual(saved)
  })

  it('schedules generation polling while marking the generation processing', async () => {
    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'wanx-text-to-video',
      params: { prompt: 'river at sunrise', size: '1280*720', duration: 5 },
    })
    const nextRunAt = '2026-06-28T00:05:00.000Z'

    const result = await repository.scheduleGenerationPoll({
      recordId: created.record.id,
      providerTaskId: 'provider_task_1',
      providerStatus: 'PENDING',
      nextRunAt,
      now: '2026-06-28T00:00:00.000Z',
    })

    expect(result.record).toMatchObject({
      id: created.record.id,
      status: 'processing',
      providerTaskId: 'provider_task_1',
      providerStatus: 'PENDING',
    })
    expect(result.task).toMatchObject({
      type: 'generation.poll',
      domain: 'generation',
      status: 'queued',
      priority: 0,
      input: { recordId: created.record.id, providerTaskId: 'provider_task_1' },
      attempts: 0,
      maxAttempts: 3,
      nextRunAt,
      recordId: created.record.id,
      userId: 'user_1',
    })
    expect(result.task.lockedBy).toBeUndefined()
    expect(result.task.lockedUntil).toBeUndefined()
    await expect(repository.getGenerationRecord(created.record.id)).resolves.toMatchObject({
      status: 'processing',
      providerTaskId: 'provider_task_1',
      providerStatus: 'PENDING',
    })
    await expect(repository.getTask(result.task.id)).resolves.toEqual(result.task)
  })

  it('completes a generation and optionally queues artifact persistence', async () => {
    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })
    const now = '2026-06-28T00:10:00.000Z'
    const output = {
      artifacts: [{ type: 'image', url: 'https://example.test/lantern.png' }],
      usage: { images: 1 },
    }

    const result = await repository.completeGeneration({
      recordId: created.record.id,
      providerStatus: 'SUCCEEDED',
      costFinal: 18,
      output,
      raw: { requestId: 'req_1' },
      enqueueArtifactPersist: true,
      now,
    })

    expect(result.record).toMatchObject({
      costFinal: 18,
      id: created.record.id,
      status: 'succeeded',
      providerStatus: 'SUCCEEDED',
      outputResult: { ...output, raw: { requestId: 'req_1' } },
    })
    expect(result.record.errorJson).toBeUndefined()
    expect(result.task).toMatchObject({
      type: 'artifact.persist',
      domain: 'artifact',
      status: 'queued',
      priority: 0,
      input: { recordId: created.record.id },
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: now,
      recordId: created.record.id,
      userId: 'user_1',
    })
    await expect(repository.getTask(result.task!.id)).resolves.toEqual(result.task)
  })

  it('creates pending artifacts and an artifact.persist task when completing a generation', async () => {
    const created = await repository.createGeneration({
      userId: 'user_artifacts',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })

    const result = await repository.completeGeneration({
      recordId: created.record.id,
      costFinal: 20,
      output: {
        artifacts: [
          { kind: 'image', sourceUrl: 'https://provider.test/a.png', mimeType: 'image/png' },
          { kind: 'text', text: 'caption', mimeType: 'text/plain' },
        ],
      },
      enqueueArtifactPersist: true,
      now: '2026-06-29T00:00:00.000Z',
    })

    const artifacts = await repository.listArtifactsForRecord(created.record.id)
    expect(artifacts).toHaveLength(2)
    expect(artifacts[0]).toMatchObject({
      recordId: created.record.id,
      userId: 'user_artifacts',
      kind: 'image',
      sourceUrl: 'https://provider.test/a.png',
      status: 'pending',
    })
    expect(artifacts[1]).toMatchObject({
      kind: 'text',
      text: 'caption',
      status: 'pending',
    })
    expect(result.task?.type).toBe('artifact.persist')
  })

  it('lists artifacts for multiple records in one stable batch', async () => {
    const first = await repository.createGeneration({
      userId: 'user_artifacts',
      modelId: 'qwen-image',
      params: { prompt: 'first', n: 1, size: '1328*1328' },
    })
    const second = await repository.createGeneration({
      userId: 'user_artifacts',
      modelId: 'qwen-image',
      params: { prompt: 'second', n: 1, size: '1328*1328' },
    })
    await repository.completeGeneration({
      recordId: first.record.id,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://provider.test/first.png' }] },
    })
    await repository.completeGeneration({
      recordId: second.record.id,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://provider.test/second.png' }] },
    })

    const artifacts = await repository.listArtifactsForRecords([
      second.record.id,
      first.record.id,
      second.record.id,
    ])

    expect(artifacts).toHaveLength(2)
    expect(new Set(artifacts.map(artifact => artifact.recordId))).toEqual(
      new Set([first.record.id, second.record.id]),
    )
    await expect(repository.listArtifactsForRecords([])).resolves.toEqual([])
  })

  it('does not enqueue artifact persistence when completed output has no artifacts', async () => {
    const created = await repository.createGeneration({
      userId: 'user_no_artifacts',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })

    const result = await repository.completeGeneration({
      recordId: created.record.id,
      costFinal: 20,
      output: { artifacts: [] },
      enqueueArtifactPersist: true,
      now: '2026-06-29T00:00:00.000Z',
    })

    expect(result.task).toBeUndefined()
    const artifacts = await repository.listArtifactsForRecord(created.record.id)
    expect(artifacts).toEqual([])
  })

  it('marks artifacts stored and failed', async () => {
    const created = await repository.createGeneration({
      userId: 'user_store',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })
    await repository.completeGeneration({
      recordId: created.record.id,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://provider.test/a.png' }] },
      enqueueArtifactPersist: true,
      now: '2026-06-29T00:00:00.000Z',
    })
    const [artifact] = await repository.listPendingArtifactsForRecord(created.record.id)
    if (artifact === undefined) throw new Error('expected artifact')

    const stored = await repository.markArtifactStored({
      artifactId: artifact.id,
      storageProvider: 'local',
      storageKey: 'generations/gen/art.png',
      storageUrl: '/api/artifacts/local/generations/gen/art.png',
      byteSize: 12,
      mimeType: 'image/png',
      now: '2026-06-29T00:01:00.000Z',
    })

    expect(stored).toMatchObject({ status: 'stored', storageProvider: 'local', byteSize: 12 })
    const pendingAfterStored = await repository.listPendingArtifactsForRecord(created.record.id)
    expect(pendingAfterStored).toEqual([])

    const failed = await repository.markArtifactFailed({
      artifactId: artifact.id,
      error: { category: 'storage', message: 'upload failed', retriable: true, code: 'UPLOAD_FAILED' },
      now: '2026-06-29T00:02:00.000Z',
    })

    expect(failed).toMatchObject({ status: 'failed', errorJson: { code: 'UPLOAD_FAILED' } })
    const pendingAfterFailed = await repository.listPendingArtifactsForRecord(created.record.id)
    expect(pendingAfterFailed).toHaveLength(1)
  })

  it('projects a stored generation artifact into personal assets without persisting access URLs', async () => {
    const created = await repository.createGeneration({
      userId: 'user_store',
      modelId: 'qwen-image',
      params: { prompt: 'project this artifact', n: 1, size: '1328*1328' },
    })
    await repository.completeGeneration({
      recordId: created.record.id,
      costFinal: 20,
      output: {
        artifacts: [{
          kind: 'image',
          sourceUrl: 'https://provider.test/temporary-source.png?token=provider-secret',
        }],
      },
      enqueueArtifactPersist: true,
      now: '2026-07-10T00:00:00.000Z',
    })
    const [artifact] = await repository.listPendingArtifactsForRecord(created.record.id)
    if (artifact === undefined) throw new Error('expected artifact')

    await repository.markArtifactStored({
      artifactId: artifact.id,
      storageProvider: 'oss',
      storageKey: 'generations/user_store/projected.png',
      storageUrl: 'https://signed-storage.test/projected.png?signature=short-lived',
      byteSize: 1_024,
      mimeType: 'image/png',
      now: '2026-07-10T00:01:00.000Z',
    })

    const [asset] = await db
      .select()
      .from(userAssets)
      .where(eq(userAssets.id, `asset_generation_${artifact.id}`))

    expect(asset).toMatchObject({
      id: `asset_generation_${artifact.id}`,
      userId: 'user_store',
      kind: 'image',
      source: 'generation',
      generationArtifactId: artifact.id,
      recordId: created.record.id,
      modelId: 'qwen-image',
      mimeType: 'image/png',
      byteSize: 1_024,
      storageProvider: 'oss',
      storageKey: 'generations/user_store/projected.png',
      status: 'ready',
      createdBy: 'user_store',
      updatedBy: 'user_store',
    })
    expect(asset?.originalUrl).toBeNull()
    expect(asset?.storageUrl).toBeNull()
  })

  it('keeps the generation asset projection idempotent when artifact persistence retries', async () => {
    const created = await repository.createGeneration({
      userId: 'user_store',
      modelId: 'qwen-image',
      params: { prompt: 'retry-safe projection', n: 1, size: '1328*1328' },
    })
    await repository.completeGeneration({
      recordId: created.record.id,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://provider.test/retry.png' }] },
      enqueueArtifactPersist: true,
      now: '2026-07-11T00:00:00.000Z',
    })
    const [artifact] = await repository.listPendingArtifactsForRecord(created.record.id)
    if (artifact === undefined) throw new Error('expected artifact')

    const storedInput = {
      artifactId: artifact.id,
      storageProvider: 'local' as const,
      storageKey: 'generations/user_store/retry.png',
      storageUrl: '/api/artifacts/local/generations/user_store/retry.png',
      byteSize: 512,
      mimeType: 'image/png',
    }
    await repository.markArtifactStored({
      ...storedInput,
      now: '2026-07-11T00:01:00.000Z',
    })
    await repository.markArtifactStored({
      ...storedInput,
      now: '2026-07-11T00:02:00.000Z',
    })

    const assets = await db
      .select()
      .from(userAssets)
      .where(eq(userAssets.generationArtifactId, artifact.id))

    expect(assets).toHaveLength(1)
    expect(assets[0]).toMatchObject({
      id: `asset_generation_${artifact.id}`,
      storageKey: storedInput.storageKey,
    })
    expect((await db.select().from(assetDerivatives)).filter(row => row.assetId === assets[0]?.id)).toHaveLength(1)
    expect((await db.select().from(taskRecords)).filter(task => task.type === 'media.thumbnail')).toHaveLength(1)
  })

  it('画廊公开后：列表带已存储产物封面、详情返回产物（回归：产物状态是 stored 不是 succeeded）', async () => {
    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'gallery cover regression', n: 1, size: '1328*1328' },
    })
    await repository.completeGeneration({
      recordId: created.record.id,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://provider.test/cover.png' }] },
      enqueueArtifactPersist: true,
      now: '2026-07-20T00:00:00.000Z',
    })
    const [artifact] = await repository.listPendingArtifactsForRecord(created.record.id)
    if (artifact === undefined) throw new Error('expected artifact')
    await repository.markArtifactStored({
      artifactId: artifact.id,
      storageProvider: 'oss',
      storageKey: 'generations/user_1/cover.png',
      storageUrl: 'https://signed-storage.test/cover.png',
      byteSize: 1024,
      mimeType: 'image/png',
      now: '2026-07-20T00:01:00.000Z',
    })

    // 私有阶段：画廊不可见。
    const beforePublic = await repository.listGalleryGenerations({ viewerId: 'user_page' })
    expect(beforePublic.items).toHaveLength(0)

    await repository.setGenerationVisibility({
      userId: 'user_1',
      recordId: created.record.id,
      visibility: 'public',
      now: '2026-07-20T00:02:00.000Z',
    })

    // 列表：公开记录应带封面（首个已存储产物）。回归点：若过滤写成 'succeeded'，
    // cover 恒为 undefined，卡片首帧/封面不展示。
    const page = await repository.listGalleryGenerations({ viewerId: 'user_page' })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]?.id).toBe(created.record.id)
    expect(page.items[0]?.cover).toBeDefined()
    expect(page.items[0]?.cover?.status).toBe('stored')

    // 详情：应返回已存储产物（供弹窗渲染图片/视频）。同样回归点：'succeeded' 过滤
    // 会让 artifacts 恒空，弹窗无内容。
    const detail = await repository.getGalleryGeneration({ recordId: created.record.id, viewerId: 'user_page' })
    expect(detail).toBeDefined()
    expect(detail?.artifacts).toHaveLength(1)
    expect(detail?.artifacts[0]?.status).toBe('stored')
    expect(detail?.artifacts[0]?.storageKey).toBe('generations/user_1/cover.png')

    // 跨用户取单个产物也应命中（产物状态 stored）。
    const crossUserArtifact = await repository.getGalleryArtifact({
      recordId: created.record.id,
      artifactId: artifact.id,
    })
    expect(crossUserArtifact).toBeDefined()
    expect(crossUserArtifact?.status).toBe('stored')
  })

  // -------------------------------------------------------------------------
  // 社区治理 / 发现 / 收藏分页 / 社交通知（计划文档 §1、§3、§4）。
  // -------------------------------------------------------------------------

  async function createPublicGeneration(userId: string, prompt: string, at: string): Promise<string> {
    const created = await repository.createGeneration({
      userId,
      modelId: 'qwen-image',
      params: { prompt, n: 1, size: '1328*1328' },
    })
    await repository.completeGeneration({
      recordId: created.record.id,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://provider.test/cover.png' }] },
      enqueueArtifactPersist: true,
      now: at,
    })
    await repository.setGenerationVisibility({ userId, recordId: created.record.id, visibility: 'public', now: at })
    return created.record.id
  }

  it('收藏分页跨页不丢：游标用收藏时间编码（回归：第二页恒空）', async () => {
    const ids = [
      await createPublicGeneration('user_1', 'favorite page 1', '2026-07-01T00:00:00.000Z'),
      await createPublicGeneration('user_1', 'favorite page 2', '2026-07-02T00:00:00.000Z'),
      await createPublicGeneration('user_1', 'favorite page 3', '2026-07-03T00:00:00.000Z'),
    ]
    for (const id of ids) {
      await repository.setGenerationFavorite({ userId: 'user_page', recordId: id, favorited: true })
    }

    const page1 = await repository.listGenerationFavorites({ userId: 'user_page', limit: 2 })
    expect(page1.items).toHaveLength(2)
    expect(page1.nextCursor).toBeDefined()
    const page2 = await repository.listGenerationFavorites({ userId: 'user_page', limit: 2, cursor: page1.nextCursor })
    expect(page2.items).toHaveLength(1)

    const seen = new Set([...page1.items, ...page2.items].map(item => item.id))
    expect(seen.size).toBe(3)
    for (const id of ids) expect(seen.has(id)).toBe(true)
  })

  it('内容举报：只接受公开成功作品、同一用户不可重复举报、管理员可流转状态', async () => {
    const generationId = await createPublicGeneration('user_1', 'reportable work', '2026-07-04T00:00:00.000Z')

    const submitted = await repository.submitContentReport({
      reporterId: 'user_page',
      generationId,
      reason: 'unsafe',
      details: '请人工核查',
    })
    expect(submitted).toMatchObject({ generationId, reporterId: 'user_page', reason: 'unsafe', status: 'open' })

    await expect(repository.submitContentReport({
      reporterId: 'user_page',
      generationId,
      reason: 'other',
    })).rejects.toMatchObject({ code: 'CONTENT_REPORT_DUPLICATE' })

    const page = await repository.listContentReports({ status: 'open' })
    expect(page.items.map(item => item.id)).toEqual([submitted.id])

    const resolved = await repository.updateContentReport({
      reportId: submitted.id,
      status: 'resolved',
      resolvedBy: 'user_1',
      resolutionNote: '已下架处理',
    })
    expect(resolved).toMatchObject({ status: 'resolved', resolvedBy: 'user_1', resolutionNote: '已下架处理' })
    expect(resolved.resolvedAt).toBeDefined()

    await expect(repository.submitContentReport({
      reporterId: 'user_page',
      generationId,
      reason: 'other',
    })).rejects.toMatchObject({ code: 'CONTENT_REPORT_DUPLICATE' })
  })

  it('收藏列表与详情可见性一致：作者隐藏后从收藏列表消失', async () => {
    const id = await createPublicGeneration('user_1', 'hidden from favorites', '2026-07-05T00:00:00.000Z')
    await repository.setGenerationFavorite({ userId: 'user_page', recordId: id, favorited: true })

    const before = await repository.listGenerationFavorites({ userId: 'user_page' })
    expect(before.items.some(item => item.id === id)).toBe(true)

    await repository.setGalleryRecordHidden({ recordId: id, hidden: true, actorId: 'user_admin' })
    const after = await repository.listGenerationFavorites({ userId: 'user_page' })
    expect(after.items.some(item => item.id === id)).toBe(false)
  })

  it('admin 画廊治理：includeHidden / q / authorId 过滤 + 下架/恢复', async () => {
    const sunsetId = await createPublicGeneration('user_a', 'a beautiful sunset', '2026-07-06T00:00:00.000Z')
    const oceanId = await createPublicGeneration('user_b', 'deep blue ocean', '2026-07-07T00:00:00.000Z')

    // 初始：两条都可见。
    expect((await repository.listAdminGalleryGenerations({})).items).toHaveLength(2)
    expect((await repository.listAdminGalleryGenerations({ authorId: 'user_a' })).items.map(i => i.id)).toEqual([sunsetId])
    expect((await repository.listAdminGalleryGenerations({ q: 'ocean' })).items.map(i => i.id)).toEqual([oceanId])

    // 下架 sunset：includeHidden=false 只回 ocean；=true 两条都回（带 hiddenAt）。
    await repository.setGalleryRecordHidden({ recordId: sunsetId, hidden: true, actorId: 'user_admin' })
    expect((await repository.listAdminGalleryGenerations({})).items.map(i => i.id)).toEqual([oceanId])
    const hiddenView = await repository.listAdminGalleryGenerations({ includeHidden: true })
    expect(hiddenView.items).toHaveLength(2)
    const sunset = hiddenView.items.find(item => item.id === sunsetId)
    expect(sunset?.hiddenAt).toBeDefined()

    // 恢复后重新可见。
    await repository.setGalleryRecordHidden({ recordId: sunsetId, hidden: false, actorId: 'user_admin' })
    expect((await repository.listAdminGalleryGenerations({})).items).toHaveLength(2)
  })

  it('封禁联动：hideUserPublicWorks 隐藏用户全部公开作品，画廊不再可见', async () => {
    await createPublicGeneration('user_a', 'ban me one', '2026-07-08T00:00:00.000Z')
    await createPublicGeneration('user_a', 'ban me two', '2026-07-09T00:00:00.000Z')
    await createPublicGeneration('user_b', 'keep me', '2026-07-10T00:00:00.000Z')

    const hidden = await repository.hideUserPublicWorks({ userId: 'user_a', actorId: 'user_admin' })
    expect(hidden).toBe(2)

    const gallery = await repository.listGalleryGenerations({ viewerId: 'user_page' })
    expect(gallery.items).toHaveLength(1)
    expect(gallery.items[0]?.author.id).toBe('user_b')

    // admin 视角仍能看到（治理需保留在列，带 hiddenAt）。
    const adminView = await repository.listAdminGalleryGenerations({ includeHidden: true, authorId: 'user_a' })
    expect(adminView.items).toHaveLength(2)
    expect(adminView.items.every(item => item.hiddenAt !== undefined)).toBe(true)
  })

  it('admin 任务中心：全量列表 + keyset 分页 + 过滤 + author/recordContext join + error/durationMs 投影', async () => {
    // 直接插入一条生成记录（不经 repository，避免自动创建 submit/poll/persist 任务污染断言），
    // 用于验证 recordContext join（modelId + category）。
    const recordId = 'task_center_record'
    await db.insert(generationRecords).values({
      id: recordId,
      userId: 'user_1',
      modelId: 'qwen-image',
      provider: 'dashscope',
      providerModel: 'qwen-image-v1',
      category: 'image',
      status: 'succeeded',
      inputParamsJson: { prompt: 'task center record' },
      costEstimate: 20,
      providerCancelStatus: 'none',
      createdAt: new Date('2026-07-13T00:00:00.000Z'),
      updatedAt: new Date('2026-07-13T00:00:00.000Z'),
    })

    const insertTask = async (input: {
      id: string
      type: string
      domain: string
      status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'
      at: string
      userId?: string
      recordId?: string
      error?: Record<string, unknown>
      startedAt?: string
      completedAt?: string
    }) => {
      await db.insert(taskRecords).values({
        id: input.id,
        type: input.type,
        domain: input.domain,
        status: input.status,
        priority: 10,
        inputJson: {},
        attempts: input.error !== undefined ? 1 : 0,
        maxAttempts: 3,
        nextRunAt: new Date(input.at),
        ...(input.startedAt !== undefined ? { startedAt: new Date(input.startedAt) } : {}),
        ...(input.completedAt !== undefined ? { completedAt: new Date(input.completedAt) } : {}),
        ...(input.error !== undefined ? { errorJson: input.error } : {}),
        ...(input.recordId !== undefined ? { recordId: input.recordId } : {}),
        ...(input.userId !== undefined ? { userId: input.userId } : {}),
        traceId: `trace-${input.id}`,
        createdAt: new Date(input.at),
        updatedAt: new Date(input.at),
      })
    }

    await insertTask({
      id: 'task_old', type: 'generation.submit', domain: 'generation', status: 'succeeded', at: '2026-07-13T00:00:00.000Z',
      userId: 'user_1', recordId, startedAt: '2026-07-13T00:00:00.000Z', completedAt: '2026-07-13T00:00:05.000Z',
    })
    await insertTask({
      id: 'task_mid', type: 'generation.poll', domain: 'generation', status: 'failed', at: '2026-07-14T00:00:00.000Z',
      userId: 'user_page', recordId,
      error: { category: 'provider', message: 'upstream 500', retriable: true, code: 'PROVIDER_UPSTREAM' },
    })
    await insertTask({
      id: 'task_new', type: 'artifact.persist', domain: 'artifact', status: 'queued', at: '2026-07-15T00:00:00.000Z',
      userId: 'user_race', recordId,
    })

    // 默认倒序：最新在前。
    const all = await repository.listAdminTasks({})
    expect(all.items.map(item => item.id)).toEqual(['task_new', 'task_mid', 'task_old'])

    // join 投影：author（id + displayName）+ recordContext（modelId/category）。
    const newest = all.items.find(item => item.id === 'task_new')!
    expect(newest.author?.id).toBe('user_race')
    expect(newest.recordContext).toEqual({ modelId: 'qwen-image', category: 'image' })

    // 成功任务的 durationMs = completedAt − startedAt；失败任务（无时间）为 undefined。
    const succeeded = all.items.find(item => item.id === 'task_old')!
    expect(succeeded.durationMs).toBe(5000)
    expect(succeeded.error).toBeUndefined()

    // error 摘要投影（category/message/retriable/code，不含原始 JSON）。
    const failed = all.items.find(item => item.id === 'task_mid')!
    expect(failed.error).toEqual({
      category: 'provider',
      message: 'upstream 500',
      retriable: true,
      code: 'PROVIDER_UPSTREAM',
    })
    expect(failed.durationMs).toBeUndefined()

    // 各过滤条件。
    expect((await repository.listAdminTasks({ status: 'failed' })).items.map(item => item.id)).toEqual(['task_mid'])
    expect((await repository.listAdminTasks({ type: 'generation.submit' })).items.map(item => item.id)).toEqual(['task_old'])
    expect((await repository.listAdminTasks({ domain: 'artifact' })).items.map(item => item.id)).toEqual(['task_new'])
    expect((await repository.listAdminTasks({ userId: 'user_1' })).items.map(item => item.id)).toEqual(['task_old'])
    expect((await repository.listAdminTasks({ recordId })).items).toHaveLength(3)

    // keyset 翻页：limit 2 → 第二页取到第三条，跨页不丢不重。
    const page1 = await repository.listAdminTasks({ limit: 2 })
    expect(page1.items.map(item => item.id)).toEqual(['task_new', 'task_mid'])
    expect(page1.nextCursor).toBeDefined()
    const page2 = await repository.listAdminTasks({ limit: 2, cursor: page1.nextCursor })
    expect(page2.items.map(item => item.id)).toEqual(['task_old'])
    expect(page2.nextCursor).toBeUndefined()

    // 软删任务不列出。
    await db.update(taskRecords).set({ deletedAt: new Date(), deletedBy: 'user_admin' }).where(eq(taskRecords.id, 'task_old'))
    const afterDelete = await repository.listAdminTasks({})
    expect(afterDelete.items.map(item => item.id)).toEqual(['task_new', 'task_mid'])
  })

  it('admin 画廊预览：listAdminGalleryRecordArtifacts 只返 stored 未删，且不检查 hiddenAt', async () => {
    const insertRecord = async (id: string, visibility: 'public' | 'private', status: string): Promise<void> => {
      await db.insert(generationRecords).values({
        id,
        userId: 'user_1',
        modelId: 'qwen-image',
        provider: 'dashscope',
        providerModel: 'qwen-image-v1',
        category: 'image',
        status,
        inputParamsJson: { prompt: `preview ${id}` },
        costEstimate: 20,
        visibility,
        providerCancelStatus: 'none',
        createdAt: new Date('2026-07-13T00:00:00.000Z'),
        updatedAt: new Date('2026-07-13T00:00:00.000Z'),
      })
    }
    const insertArtifact = async (input: {
      id: string
      recordId: string
      kind?: string
      deleted?: boolean
      createdAt: string
    }): Promise<void> => {
      await db.insert(generationArtifacts).values({
        id: input.id,
        recordId: input.recordId,
        userId: 'user_1',
        kind: input.kind ?? 'image',
        status: 'stored',
        storageProvider: 'local',
        storageKey: `${input.id}.png`,
        ...(input.deleted === true ? { deletedAt: new Date(), deletedBy: 'user_admin' } : {}),
        createdAt: new Date(input.createdAt),
        updatedAt: new Date(input.createdAt),
      })
    }

    await insertRecord('preview_record', 'public', 'succeeded')
    await insertArtifact({ id: 'art_1', recordId: 'preview_record', createdAt: '2026-07-13T00:00:00.000Z' })
    await insertArtifact({ id: 'art_2', recordId: 'preview_record', createdAt: '2026-07-13T00:00:01.000Z' })
    await insertArtifact({ id: 'art_deleted', recordId: 'preview_record', deleted: true, createdAt: '2026-07-13T00:00:02.000Z' })

    // 只返 stored 未删，按 (createdAt,id) 升序；软删产物被排除。
    const artifacts = await repository.listAdminGalleryRecordArtifacts({ recordId: 'preview_record' })
    expect(artifacts.map(artifact => artifact.id)).toEqual(['art_1', 'art_2'])
    expect(artifacts[0]?.storageKey).toBe('art_1.png')

    // 关键：记录被下架（hiddenAt 置位）后，预览仍能取到产物（治理需预览已隐藏作品）。
    await repository.setGalleryRecordHidden({ recordId: 'preview_record', hidden: true, actorId: 'user_admin' })
    const afterHide = await repository.listAdminGalleryRecordArtifacts({ recordId: 'preview_record' })
    expect(afterHide.map(artifact => artifact.id)).toEqual(['art_1', 'art_2'])

    // 记录可见性/状态不匹配（非 public / 非 succeeded）→ 空列表。
    await insertRecord('preview_private', 'private', 'succeeded')
    await insertArtifact({ id: 'art_p', recordId: 'preview_private', createdAt: '2026-07-13T00:00:00.000Z' })
    expect((await repository.listAdminGalleryRecordArtifacts({ recordId: 'preview_private' }))).toHaveLength(0)
    await insertRecord('preview_failed', 'public', 'failed')
    await insertArtifact({ id: 'art_f', recordId: 'preview_failed', createdAt: '2026-07-13T00:00:00.000Z' })
    expect((await repository.listAdminGalleryRecordArtifacts({ recordId: 'preview_failed' }))).toHaveLength(0)
  })

  it('admin 批量治理：setGalleryRecordsHidden 只计实际翻转，softDeleteGalleryRecords 只删 public', async () => {
    const insertRecord = async (id: string, visibility: 'public' | 'private', status: string, hidden?: boolean): Promise<void> => {
      await db.insert(generationRecords).values({
        id,
        userId: 'user_1',
        modelId: 'qwen-image',
        provider: 'dashscope',
        providerModel: 'qwen-image-v1',
        category: 'image',
        status,
        inputParamsJson: { prompt: `batch ${id}` },
        costEstimate: 20,
        visibility,
        providerCancelStatus: 'none',
        ...(hidden === true ? { hiddenAt: new Date('2026-07-01T00:00:00.000Z'), hiddenBy: 'user_admin' } : {}),
        createdAt: new Date('2026-07-13T00:00:00.000Z'),
        updatedAt: new Date('2026-07-13T00:00:00.000Z'),
      })
    }

    await insertRecord('batch_a', 'public', 'succeeded')
    await insertRecord('batch_b', 'public', 'succeeded')
    await insertRecord('batch_already_hidden', 'public', 'succeeded', true)
    await insertRecord('batch_private', 'private', 'succeeded')
    await insertRecord('batch_failed', 'public', 'failed')

    // 批量下架：只命中未藏的 public 成功记录；已藏/非 public/非 succeeded 不计入。
    const hidden = await repository.setGalleryRecordsHidden({
      recordIds: ['batch_a', 'batch_b', 'batch_already_hidden', 'batch_private', 'batch_failed'],
      hidden: true,
      actorId: 'user_admin',
    })
    expect(hidden.sort()).toEqual(['batch_a', 'batch_b'])

    // 重复下架同一批：全部已藏 → 0 个实际变更。
    expect((await repository.setGalleryRecordsHidden({
      recordIds: ['batch_a', 'batch_b', 'batch_already_hidden'],
      hidden: true,
      actorId: 'user_admin',
    }))).toHaveLength(0)

    // 批量恢复：只命中已藏记录。
    const unhidden = await repository.setGalleryRecordsHidden({
      recordIds: ['batch_a', 'batch_b', 'batch_already_hidden', 'batch_private'],
      hidden: false,
      actorId: 'user_admin',
    })
    expect(new Set(unhidden)).toEqual(new Set(['batch_a', 'batch_b', 'batch_already_hidden']))

    // 批量软删：只删 public+succeeded；private 记录不受影响。
    const deleted = await repository.softDeleteGalleryRecords({
      recordIds: ['batch_a', 'batch_private', 'batch_failed'],
      actorId: 'user_admin',
    })
    expect(deleted).toEqual(['batch_a'])

    // 软删后 admin 画廊不再包含该记录；重复调用返回空。
    const gallery = await repository.listAdminGalleryGenerations({ includeHidden: true })
    expect(gallery.items.some(item => item.id === 'batch_a')).toBe(false)
    expect((await repository.softDeleteGalleryRecords({ recordIds: ['batch_a'], actorId: 'user_admin' }))).toHaveLength(0)
  })

  it('画廊发现：q 搜索 + hot 排序（按点赞数）+ authorId 过滤', async () => {
    const sunsetId = await createPublicGeneration('user_a', 'golden sunset over the sea', '2026-07-11T00:00:00.000Z')
    const oceanId = await createPublicGeneration('user_a', 'calm ocean waves', '2026-07-12T00:00:00.000Z')

    // q 搜索参数正文。
    const search = await repository.listGalleryGenerations({ viewerId: 'user_page', q: 'ocean' })
    expect(search.items.map(item => item.id)).toEqual([oceanId])

    // authorId 过滤。
    expect((await repository.listGalleryGenerations({ viewerId: 'user_page', authorId: 'user_a' })).items).toHaveLength(2)

    // hot 排序：sunset 2 赞 > ocean 0 赞。
    await repository.setGenerationLike({ userId: 'user_1', recordId: sunsetId, liked: true })
    await repository.setGenerationLike({ userId: 'user_page', recordId: sunsetId, liked: true })
    const hot = await repository.listGalleryGenerations({ viewerId: 'user_page', sort: 'hot' })
    expect(hot.items[0]?.id).toBe(sunsetId)
    expect(hot.items[0]?.likeCount).toBe(2)

    // hot 分页游标带 likeCount 复合键：翻页不丢。
    const hotPage1 = await repository.listGalleryGenerations({ viewerId: 'user_page', sort: 'hot', limit: 1 })
    expect(hotPage1.nextCursor).toBeDefined()
    const hotPage2 = await repository.listGalleryGenerations({
      viewerId: 'user_page',
      sort: 'hot',
      limit: 1,
      cursor: hotPage1.nextCursor,
    })
    expect(hotPage2.items).toHaveLength(1)
    expect(hotPage2.items[0]?.id).toBe(oceanId)
  })

  it('画廊过滤被封禁作者的作品（作者 bannedAt 非空 → 列表/详情/点赞均不可见）', async () => {
    const id = await createPublicGeneration('user_a', 'banned author work', '2026-07-13T00:00:00.000Z')
    await db.update(users).set({ bannedAt: new Date() }).where(eq(users.id, 'user_a'))

    expect((await repository.listGalleryGenerations({ viewerId: 'user_page' })).items).toHaveLength(0)
    expect(await repository.getGalleryGeneration({ recordId: id, viewerId: 'user_page' })).toBeUndefined()
    await expect(repository.setGenerationLike({ userId: 'user_page', recordId: id, liked: true }))
      .rejects.toMatchObject({ code: 'GENERATION_NOT_FOUND' })
  })

  it('社交通知：创建/列表/未读数/标记已读/越权', async () => {
    const recordId = await createPublicGeneration('user_1', 'notification record', '2026-07-14T00:00:00.000Z')
    await repository.createSocialNotification({
      recipientId: 'user_page',
      actorId: 'user_1',
      kind: 'like',
      recordId,
      title: '收到新点赞',
      body: '「Alice」点赞了你的公开作品',
    })
    await repository.createSocialNotification({
      recipientId: 'user_page',
      actorId: 'user_1',
      kind: 'favorite',
      recordId,
      title: '收到新收藏',
      body: '「Alice」收藏了你的公开作品',
    })

    const list = await repository.listNotifications({ userId: 'user_page' })
    expect(list.items).toHaveLength(2)
    expect(list.items.every(item => !item.read)).toBe(true)
    expect(list.items.map(item => item.kind).sort()).toEqual(['favorite', 'like'])
    expect(await repository.countUnreadNotifications('user_page')).toBe(2)

    const firstId = list.items[0]?.id
    if (firstId === undefined) throw new Error('expected notification id')
    expect(await repository.markNotificationRead({ userId: 'user_page', notificationId: firstId })).toBe(true)
    expect(await repository.countUnreadNotifications('user_page')).toBe(1)

    // 越权：他人标记我的通知 → false（不抛错，返回未命中）。
    expect(await repository.markNotificationRead({ userId: 'user_1', notificationId: firstId })).toBe(false)

    expect(await repository.markAllNotificationsRead('user_page')).toBe(1)
    expect(await repository.countUnreadNotifications('user_page')).toBe(0)
  })

  it('does not revive a soft-deleted generated asset when artifact persistence retries', async () => {
    const created = await repository.createGeneration({
      userId: 'user_store',
      modelId: 'qwen-image',
      params: { prompt: 'respect asset deletion', n: 1, size: '1328*1328' },
    })
    await repository.completeGeneration({
      recordId: created.record.id,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://provider.test/deleted.png' }] },
      enqueueArtifactPersist: true,
      now: '2026-07-12T00:00:00.000Z',
    })
    const [artifact] = await repository.listPendingArtifactsForRecord(created.record.id)
    if (artifact === undefined) throw new Error('expected artifact')
    const assetId = `asset_generation_${artifact.id}`
    const storedInput = {
      artifactId: artifact.id,
      storageProvider: 'oss' as const,
      storageKey: 'generations/user_store/deleted.png',
      byteSize: 256,
      mimeType: 'image/png',
    }

    await repository.markArtifactStored({
      ...storedInput,
      now: '2026-07-12T00:01:00.000Z',
    })
    await repository.softDeleteUserAsset({
      userId: 'user_store',
      assetId,
      now: '2026-07-12T00:02:00.000Z',
    })
    await repository.markArtifactStored({
      ...storedInput,
      now: '2026-07-12T00:03:00.000Z',
    })

    const rows = await db.select().from(userAssets).where(eq(userAssets.id, assetId))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.deletedAt?.toISOString()).toBe('2026-07-12T00:02:00.000Z')
    expect(await repository.getUserAsset({
      userId: 'user_store',
      assetId,
    })).toBeUndefined()
  })

  it('rolls back the artifact update when the generated asset projection cannot be inserted', async () => {
    const created = await repository.createGeneration({
      userId: 'user_store',
      modelId: 'qwen-image',
      params: { prompt: 'atomic projection', n: 1, size: '1328*1328' },
    })
    await repository.completeGeneration({
      recordId: created.record.id,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://provider.test/atomic.png' }] },
      enqueueArtifactPersist: true,
      now: '2026-07-13T00:00:00.000Z',
    })
    const [artifact] = await repository.listPendingArtifactsForRecord(created.record.id)
    if (artifact === undefined) throw new Error('expected artifact')

    await repository.createUserAsset({
      id: 'asset_legacy_projection',
      userId: 'user_store',
      kind: 'image',
      source: 'generation',
      generationArtifactId: artifact.id,
      recordId: created.record.id,
      modelId: 'qwen-image',
      now: '2026-07-13T00:00:30.000Z',
    })

    await expect(repository.markArtifactStored({
      artifactId: artifact.id,
      storageProvider: 'local',
      storageKey: 'generations/user_store/atomic.png',
      byteSize: 128,
      mimeType: 'image/png',
      now: '2026-07-13T00:01:00.000Z',
    })).rejects.toThrow()

    const [artifactAfterFailure] = await db
      .select()
      .from(generationArtifacts)
      .where(eq(generationArtifacts.id, artifact.id))
    expect(artifactAfterFailure).toMatchObject({
      status: 'pending',
      storageProvider: null,
      storageKey: null,
    })
    expect(
      await db
        .select()
        .from(userAssets)
        .where(eq(userAssets.id, `asset_generation_${artifact.id}`)),
    ).toEqual([])
  })

  it('fails a generation with provider error details', async () => {
    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })
    const error = {
      category: 'provider' as const,
      message: 'provider rejected the request',
      retriable: false,
      code: 'BadRequest',
    }

    const failed = await repository.failGeneration({
      recordId: created.record.id,
      error,
      providerStatus: 'FAILED',
      now: '2026-06-28T00:20:00.000Z',
    })

    expect(failed).toMatchObject({
      id: created.record.id,
      status: 'failed',
      statusReason: error.message,
      errorJson: error,
      providerStatus: 'FAILED',
    })
    await expect(repository.getGenerationRecord(created.record.id)).resolves.toMatchObject({
      status: 'failed',
      statusReason: error.message,
      errorJson: error,
      providerStatus: 'FAILED',
    })
    expect(await db
      .select({ status: usageRecords.status, providerCostCents: usageRecords.providerCostCents, chargedCostCents: usageRecords.chargedCostCents })
      .from(usageRecords)
      .where(eq(usageRecords.generationId, created.record.id)))
      .toEqual([{ status: 'failed', providerCostCents: null, chargedCostCents: 0 }])
    const refundedAccount = await db
      .select({ availableCents: creditAccounts.availableCents, reservedCents: creditAccounts.reservedCents })
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, 'user_1'))
    expect(refundedAccount).toEqual([{ availableCents: 1_000_000, reservedCents: 0 }])
    expect(await db
      .select({ kind: creditLedgerEntries.kind })
      .from(creditLedgerEntries)
      .where(eq(creditLedgerEntries.generationId, created.record.id)))
      .toEqual([{ kind: 'reserve' }, { kind: 'refund' }])

    await repository.failGeneration({
      recordId: created.record.id,
      error,
      providerStatus: 'FAILED',
      now: '2026-06-28T00:20:01.000Z',
    })
    expect(await db
      .select({ kind: creditLedgerEntries.kind })
      .from(creditLedgerEntries)
      .where(eq(creditLedgerEntries.generationId, created.record.id)))
      .toEqual([{ kind: 'reserve' }, { kind: 'refund' }])
  })

  it('does not clear omitted generation patch fields', async () => {
    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })

    const cancelRequestedAt = '2026-06-28T00:00:00.000Z'
    await repository.updateGenerationRecord(created.record.id, { cancelRequestedAt })
    const cancelled = await repository.updateGenerationRecord(created.record.id, { status: 'cancelled' })

    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.cancelRequestedAt).toBe(cancelRequestedAt)
    await expect(repository.getGenerationRecord(created.record.id)).resolves.toMatchObject({
      status: 'cancelled',
      cancelRequestedAt,
    })
  })

  it('uses typed repository errors for unknown models', async () => {
    await expect(repository.createGeneration({
      userId: 'user_1',
      modelId: 'missing-model',
      params: { prompt: 'x' },
    })).rejects.toBeInstanceOf(GenerationRepositoryError)
  })

  it('lists artifacts for a user without leaking another user artifacts', async () => {
    const generationA = await repository.createGeneration({ userId: 'user_a', modelId: 'qwen-image', params: { prompt: 'a' } })
    const generationB = await repository.createGeneration({ userId: 'user_b', modelId: 'qwen-image', params: { prompt: 'b' } })
    await repository.completeGeneration({ recordId: generationA.record.id, costFinal: 20, output: { artifacts: [{ kind: 'image', sourceUrl: 'https://example.test/a.png' }] } })
    await repository.completeGeneration({ recordId: generationB.record.id, costFinal: 20, output: { artifacts: [{ kind: 'image', sourceUrl: 'https://example.test/b.png' }] } })

    const result = await repository.listArtifactsForUser('user_a')

    expect(result.items).toHaveLength(1)
    expect(result.items[0]?.userId).toBe('user_a')
  })

  it('lists artifacts with keyset pagination', async () => {
    const userId = 'user_a'
    const generation = await repository.createGeneration({ userId, modelId: 'qwen-image', params: { prompt: 'a' } })
    await repository.completeGeneration({
      recordId: generation.record.id,
      costFinal: 20,
      output: {
        artifacts: [
          { kind: 'image', sourceUrl: 'https://example.test/1.png' },
          { kind: 'image', sourceUrl: 'https://example.test/2.png' },
          { kind: 'image', sourceUrl: 'https://example.test/3.png' },
        ],
      },
    })

    const first = await repository.listArtifactsForUser(userId, { limit: 2 })
    expect(first.items).toHaveLength(2)
    expect(first.nextCursor).toBeDefined()

    const second = await repository.listArtifactsForUser(userId, { limit: 2, cursor: first.nextCursor })
    expect(second.items).toHaveLength(1)
    expect(second.nextCursor).toBeUndefined()
  })

  it('paginates unified assets by time with duplicate timestamps and excludes soft-deleted rows', async () => {
    const userId = 'user_a'
    await repository.createUserAsset({ id: 'asset_old', userId, kind: 'image', source: 'upload', now: '2026-07-01T00:00:00.000Z' })
    await repository.createUserAsset({ id: 'asset_new_a', userId, kind: 'image', source: 'upload', now: '2026-07-03T00:00:00.000Z' })
    await repository.createUserAsset({ id: 'asset_new_b', userId, kind: 'image', source: 'upload', now: '2026-07-03T00:00:00.000Z' })
    await repository.createUserAsset({ id: 'asset_new_c', userId, kind: 'image', source: 'upload', now: '2026-07-03T00:00:00.000Z' })
    await repository.createUserAsset({ id: 'asset_mid', userId, kind: 'image', source: 'upload', now: '2026-07-02T00:00:00.000Z' })
    await repository.createUserAsset({ id: 'asset_deleted', userId, kind: 'image', source: 'upload', now: '2026-07-04T00:00:00.000Z' })
    await db
      .update(userAssets)
      .set({ deletedAt: new Date('2026-07-04T00:01:00.000Z') })
      .where(eq(userAssets.id, 'asset_deleted'))

    const first = await repository.listUnifiedAssets(userId, { limit: 2, sort: 'time' })
    expect(first.items.map(item => item.id)).toEqual(['asset_new_c', 'asset_new_b'])
    expect(first.nextCursor).toBeDefined()

    const second = await repository.listUnifiedAssets(userId, { limit: 2, sort: 'time', cursor: first.nextCursor })
    expect(second.items.map(item => item.id)).toEqual(['asset_new_a', 'asset_mid'])
    expect(second.nextCursor).toBeDefined()

    const third = await repository.listUnifiedAssets(userId, { limit: 2, sort: 'time', cursor: second.nextCursor })
    expect(third.items.map(item => item.id)).toEqual(['asset_old'])
    expect(third.nextCursor).toBeUndefined()

    const allIds = [...first.items, ...second.items, ...third.items].map(item => item.id)
    expect(allIds).toEqual(['asset_new_c', 'asset_new_b', 'asset_new_a', 'asset_mid', 'asset_old'])
    expect(new Set(allIds).size).toBe(allIds.length)
  })

  it('paginates unified assets by normalized title with the id as an ascending tie-breaker', async () => {
    const userId = 'user_a'
    await repository.createUserAsset({ id: 'asset_zulu', userId, kind: 'image', source: 'upload', fileName: 'Zulu.png', now: '2026-07-02T00:00:00.000Z' })
    await repository.createUserAsset({ id: 'asset_alpha_b', userId, kind: 'image', source: 'upload', fileName: 'ALPHA.png', now: '2026-07-03T00:00:00.000Z' })
    await repository.createUserAsset({ id: 'asset_alpha_a', userId, kind: 'image', source: 'upload', fileName: 'alpha.png', now: '2026-07-01T00:00:00.000Z' })
    await repository.createUserAsset({ id: 'asset_alpha_c', userId, kind: 'image', source: 'upload', fileName: 'Alpha.png', now: '2026-07-04T00:00:00.000Z' })

    const first = await repository.listUnifiedAssets(userId, { limit: 2, sort: 'title' })
    expect(first.items.map(item => item.id)).toEqual(['asset_alpha_a', 'asset_alpha_b'])
    expect(first.nextCursor).toBeDefined()

    const second = await repository.listUnifiedAssets(userId, { limit: 2, sort: 'title', cursor: first.nextCursor })
    expect(second.items.map(item => item.id)).toEqual(['asset_alpha_c', 'asset_zulu'])
    expect(second.nextCursor).toBeUndefined()

    const allIds = [...first.items, ...second.items].map(item => item.id)
    expect(allIds).toEqual(['asset_alpha_a', 'asset_alpha_b', 'asset_alpha_c', 'asset_zulu'])
    expect(new Set(allIds).size).toBe(allIds.length)
  })

  it('paginates unified assets by size with duplicate values and NULL sizes last', async () => {
    const userId = 'user_a'
    await repository.createUserAsset({ id: 'asset_big_a', userId, kind: 'image', source: 'upload', byteSize: 300 })
    await repository.createUserAsset({ id: 'asset_big_b', userId, kind: 'image', source: 'upload', byteSize: 300 })
    await repository.createUserAsset({ id: 'asset_big_c', userId, kind: 'image', source: 'upload', byteSize: 300 })
    await repository.createUserAsset({ id: 'asset_mid', userId, kind: 'image', source: 'upload', byteSize: 200 })
    await repository.createUserAsset({ id: 'asset_null_a', userId, kind: 'image', source: 'upload' })
    await repository.createUserAsset({ id: 'asset_null_b', userId, kind: 'image', source: 'upload' })

    const first = await repository.listUnifiedAssets(userId, { limit: 2, sort: 'size' })
    expect(first.items.map(item => item.id)).toEqual(['asset_big_c', 'asset_big_b'])
    expect(first.nextCursor).toBeDefined()

    const second = await repository.listUnifiedAssets(userId, { limit: 2, sort: 'size', cursor: first.nextCursor })
    expect(second.items.map(item => item.id)).toEqual(['asset_big_a', 'asset_mid'])
    expect(second.nextCursor).toBeDefined()

    const third = await repository.listUnifiedAssets(userId, { limit: 2, sort: 'size', cursor: second.nextCursor })
    expect(third.items.map(item => item.id)).toEqual(['asset_null_b', 'asset_null_a'])
    expect(third.nextCursor).toBeUndefined()

    const allIds = [...first.items, ...second.items, ...third.items].map(item => item.id)
    expect(allIds).toEqual([
      'asset_big_c',
      'asset_big_b',
      'asset_big_a',
      'asset_mid',
      'asset_null_b',
      'asset_null_a',
    ])
    expect(new Set(allIds).size).toBe(allIds.length)
  })

  it('rejects asset cursors reused with another sort or normalized filter set', async () => {
    const userId = 'user_a'
    await repository.createUserAsset({ id: 'asset_alpha', userId, kind: 'image', source: 'generation', fileName: 'Alpha.png' })
    await repository.createUserAsset({ id: 'asset_beta', userId, kind: 'image', source: 'generation', fileName: 'Alpha Beta.png' })

    const first = await repository.listUnifiedAssets(userId, {
      limit: 1,
      sort: 'title',
      kind: 'image',
      source: 'generation',
      q: '  ALPHA  ',
    })
    expect(first.nextCursor).toBeDefined()

    await expect(repository.listUnifiedAssets(userId, {
      limit: 1,
      sort: 'time',
      kind: 'image',
      source: 'generation',
      q: 'alpha',
      cursor: first.nextCursor,
    })).rejects.toMatchObject({ code: 'INVALID_CURSOR' })
    await expect(repository.listUnifiedAssets(userId, {
      limit: 1,
      sort: 'title',
      kind: 'video',
      source: 'generation',
      q: 'alpha',
      cursor: first.nextCursor,
    })).rejects.toMatchObject({ code: 'INVALID_CURSOR' })
    await expect(repository.listUnifiedAssets(userId, {
      limit: 1,
      sort: 'title',
      kind: 'image',
      source: 'generation',
      q: 'alpha',
      modelIds: ['another-model'],
      cursor: first.nextCursor,
    })).rejects.toMatchObject({ code: 'INVALID_CURSOR' })
    await expect(repository.listUnifiedAssets(userId, {
      limit: 1,
      sort: 'title',
      kind: 'image',
      source: 'generation',
      q: ' alpha ',
      cursor: first.nextCursor,
    })).resolves.toMatchObject({ items: [{ id: 'asset_alpha' }] })
  })

  it('rejects structurally invalid asset cursor payloads and sort value types', async () => {
    const filters = { kind: null, source: null, q: null, modelIds: [] }
    const cases: Array<{
      sort: 'time' | 'title' | 'size'
      payload: Record<string, unknown>
    }> = [
      {
        sort: 'time',
        payload: { v: 2, resource: 'assets', sort: 'time', value: '2026-07-01T00:00:00.000Z', id: 'asset_1', filters },
      },
      {
        sort: 'time',
        payload: { v: 1, resource: 'artifacts', sort: 'time', value: '2026-07-01T00:00:00.000Z', id: 'asset_1', filters },
      },
      {
        sort: 'time',
        payload: { v: 1, resource: 'assets', sort: 'time', value: 'not-an-iso-date', id: 'asset_1', filters },
      },
      {
        sort: 'time',
        payload: { v: 1, resource: 'assets', sort: 'time', value: '2026-07-01T00:00:00Z', id: 'asset_1', filters },
      },
      {
        sort: 'time',
        payload: { v: 1, resource: 'assets', sort: 'time', value: 123, id: 'asset_1', filters },
      },
      {
        sort: 'title',
        payload: { v: 1, resource: 'assets', sort: 'title', value: 123, id: 'asset_1', filters },
      },
      {
        sort: 'size',
        payload: { v: 1, resource: 'assets', sort: 'size', value: '300', id: 'asset_1', filters },
      },
    ]

    for (const testCase of cases) {
      const cursor = Buffer.from(JSON.stringify(testCase.payload), 'utf8').toString('base64url')
      await expect(repository.listUnifiedAssets('user_a', {
        sort: testCase.sort,
        cursor,
      })).rejects.toMatchObject({ code: 'INVALID_CURSOR' })
    }
  })

  it('derives honest declared resolution and duration metadata without exposing generation inputs', async () => {
    const generation = await repository.createGeneration({
      userId: 'user_a',
      modelId: 'wanx-text-to-video',
      params: { prompt: 'metadata precedence', size: '1280*720', duration: 5 },
    })
    await repository.createUserAsset({
      id: 'asset_stored_dimensions',
      userId: 'user_a',
      kind: 'video',
      source: 'generation',
      recordId: generation.record.id,
      metadata: { width: 1920, height: 1080, resolution: '640x360', durationSeconds: 3 },
    })
    await repository.createUserAsset({
      id: 'asset_stored_resolution',
      userId: 'user_a',
      kind: 'video',
      source: 'generation',
      recordId: generation.record.id,
      metadata: { width: 0, height: 1080, resolution: ' 960 x 540 ' },
    })
    await repository.createUserAsset({
      id: 'asset_stored_size',
      userId: 'user_a',
      kind: 'video',
      source: 'generation',
      recordId: generation.record.id,
      metadata: { size: '720*1280' },
    })
    await repository.createUserAsset({
      id: 'asset_request_fallback',
      userId: 'user_a',
      kind: 'video',
      source: 'generation',
      recordId: generation.record.id,
    })

    const result = await repository.listUnifiedAssets('user_a', { sort: 'title' })
    expect(result.items.map(item => ({
      id: item.id,
      declaredResolution: item.declaredResolution,
      durationSeconds: item.durationSeconds,
    }))).toEqual([
      { id: 'asset_request_fallback', declaredResolution: '1280×720', durationSeconds: 5 },
      { id: 'asset_stored_dimensions', declaredResolution: '1920×1080', durationSeconds: 3 },
      { id: 'asset_stored_resolution', declaredResolution: '960×540', durationSeconds: 5 },
      { id: 'asset_stored_size', declaredResolution: '720×1280', durationSeconds: 5 },
    ])
  })

  it('filters and searches the user asset projection without leaking another owner', async () => {
    await repository.createUserAsset({
      id: 'asset_brand_image',
      userId: 'user_a',
      kind: 'image',
      source: 'upload',
      fileName: 'brand-reference.png',
      now: '2026-07-04T00:00:00.000Z',
    })
    await repository.createUserAsset({
      id: 'asset_video_generation',
      userId: 'user_a',
      kind: 'video',
      source: 'generation',
      modelId: 'wanx-text-to-video',
      recordId: undefined,
      now: '2026-07-03T00:00:00.000Z',
    })
    await repository.createUserAsset({
      id: 'asset_private',
      userId: 'user_1',
      kind: 'image',
      source: 'upload',
      fileName: 'brand-secret.png',
      now: '2026-07-05T00:00:00.000Z',
    })

    const filename = await repository.listUnifiedAssets('user_a', { q: 'brand' })
    expect(filename.items.map(item => item.id)).toEqual(['asset_brand_image'])

    const modelDisplayName = await repository.listUnifiedAssets('user_a', {
      q: 'video model',
      modelIds: ['wanx-text-to-video'],
    })
    expect(modelDisplayName.items.map(item => item.id)).toEqual(['asset_video_generation'])

    const filtered = await repository.listUnifiedAssets('user_a', {
      kind: 'video',
      source: 'generation',
    })
    expect(filtered.items.map(item => item.id)).toEqual(['asset_video_generation'])
  })

  it('reads and soft-deletes only owned assets while preserving generation artifacts', async () => {
    const generation = await repository.createGeneration({
      userId: 'user_a',
      modelId: 'qwen-image',
      params: { prompt: 'asset history' },
    })
    await repository.completeGeneration({
      recordId: generation.record.id,
      costFinal: 20,
      output: {
        artifacts: [{ kind: 'text', text: '完整剧本内容' }],
      },
    })
    const [artifact] = await db
      .select()
      .from(generationArtifacts)
      .where(eq(generationArtifacts.recordId, generation.record.id))
    expect(artifact).toBeDefined()

    await repository.createUserAsset({
      id: 'asset_generation_text',
      userId: 'user_a',
      kind: 'text',
      source: 'generation',
      generationArtifactId: artifact!.id,
      recordId: generation.record.id,
      modelId: 'qwen-image',
      now: '2026-07-06T00:00:00.000Z',
    })

    const owned = await repository.getUserAsset({
      userId: 'user_a',
      assetId: 'asset_generation_text',
    })
    expect(owned?.text).toBe('完整剧本内容')
    expect(
      await repository.getUserAsset({
        userId: 'user_1',
        assetId: 'asset_generation_text',
      }),
    ).toBeUndefined()

    expect(
      await repository.softDeleteUserAsset({
        userId: 'user_1',
        assetId: 'asset_generation_text',
      }),
    ).toBe(false)
    expect(
      await repository.softDeleteUserAsset({
        userId: 'user_a',
        assetId: 'asset_generation_text',
        now: '2026-07-07T00:00:00.000Z',
      }),
    ).toBe(true)
    expect(
      await repository.getUserAsset({
        userId: 'user_a',
        assetId: 'asset_generation_text',
      }),
    ).toBeUndefined()

    const [artifactAfterDelete] = await db
      .select()
      .from(generationArtifacts)
      .where(eq(generationArtifacts.id, artifact!.id))
    expect(artifactAfterDelete?.text).toBe('完整剧本内容')
  })

  it('requestGenerationCancel flips submitting to cancelled and keeps processing on processing records', async () => {
    const userId = 'user_a'

    // submitting 路径：worker 尚未抢占，取消应直接翻成终态 cancelled。
    const submitting = await repository.createGeneration({ userId, modelId: 'qwen-image', params: { prompt: 'submit' } })
    expect(submitting.record.status).toBe('submitting')
    const cancelledNow = '2026-07-02T00:00:00.000Z'
    const cancelled = await repository.requestGenerationCancel({ recordId: submitting.record.id, userId, now: cancelledNow })

    expect(cancelled.status).toBe('cancelled')
    expect(cancelled.cancelRequestedAt).toBe(cancelledNow)
    expect(cancelled.providerCancelStatus).toBe('requested')
    expect(cancelled.statusReason).toBe('用户已请求取消')

    // processing 路径：worker 已在处理，provider 侧取消未实现，故仅置取消标志位，
    // status 仍是 processing。
    const processing = await repository.createGeneration({ userId, modelId: 'qwen-image', params: { prompt: 'proc' } })
    await repository.scheduleGenerationPoll({
      recordId: processing.record.id,
      providerTaskId: 'prov_task_1',
      nextRunAt: '2026-07-02T00:05:00.000Z',
      now: '2026-07-02T00:00:30.000Z',
    })
    const procCancelNow = '2026-07-02T00:01:00.000Z'
    const procCancelled = await repository.requestGenerationCancel({ recordId: processing.record.id, userId, now: procCancelNow })

    expect(procCancelled.status).toBe('processing')
    expect(procCancelled.cancelRequestedAt).toBe(procCancelNow)
    expect(procCancelled.providerCancelStatus).toBe('requested')
    expect(procCancelled.statusReason).toBe('用户已请求取消')
  })

  it('does not enqueue a poll after a cancellation request wins', async () => {
    const userId = 'user_a'
    const created = await repository.createGeneration({ userId, modelId: 'qwen-image', params: { prompt: 'cancel before poll' } })
    await repository.requestGenerationCancel({ recordId: created.record.id, userId })

    await expect(repository.scheduleGenerationPoll({
      recordId: created.record.id,
      providerTaskId: 'provider-task-after-cancel',
      nextRunAt: new Date().toISOString(),
    })).rejects.toMatchObject({ code: 'GENERATION_NOT_PROCESSABLE' })
    await expect(repository.getGenerationRecord(created.record.id)).resolves.toMatchObject({ status: 'cancelled' })
  })

  it('requestGenerationCancel rejects non-owner as not found and terminal status as not cancellable', async () => {
    const owner = 'user_a'
    const other = 'user_b'
    const created = await repository.createGeneration({ userId: owner, modelId: 'qwen-image', params: { prompt: 'a' } })

    await expect(repository.requestGenerationCancel({ recordId: created.record.id, userId: other }))
      .rejects.toMatchObject({ code: 'GENERATION_NOT_FOUND' })

    await repository.failGeneration({
      recordId: created.record.id,
      error: { category: 'provider', message: 'provider failed', retriable: false, code: 'PROVIDER_FAILED' },
    })

    await expect(repository.requestGenerationCancel({ recordId: created.record.id, userId: owner }))
      .rejects.toMatchObject({ code: 'GENERATION_NOT_CANCELLABLE' })
  })

  it('completion cannot resurrect a processing generation after cancellation was requested', async () => {
    const userId = 'user_a'
    const created = await repository.createGeneration({ userId, modelId: 'qwen-image', params: { prompt: 'race completion' } })
    await repository.markGenerationProcessing({ recordId: created.record.id, now: '2026-07-02T00:00:00.000Z' })
    await repository.requestGenerationCancel({ recordId: created.record.id, userId, now: '2026-07-02T00:00:01.000Z' })

    const completion = await repository.completeGeneration({
      recordId: created.record.id,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://provider.test/race.png' }] },
      enqueueArtifactPersist: true,
      now: '2026-07-02T00:00:02.000Z',
    })

    expect(completion.outcome).toBe('cancelled')
    expect(completion.record.status).toBe('cancelled')
    expect(await repository.listArtifactsForRecord(created.record.id)).toEqual([])
    expect(await db
      .select({ status: usageRecords.status })
      .from(usageRecords)
      .where(eq(usageRecords.generationId, created.record.id)))
      .toEqual([{ status: 'cancelled' }])
    const [account] = await db
      .select({ availableCents: creditAccounts.availableCents, reservedCents: creditAccounts.reservedCents })
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, userId))
    expect(account).toEqual({ availableCents: 1_000_000, reservedCents: 0 })
    expect(await db
      .select({ kind: creditLedgerEntries.kind })
      .from(creditLedgerEntries)
      .where(eq(creditLedgerEntries.generationId, created.record.id)))
      .toEqual([{ kind: 'reserve' }, { kind: 'refund' }])
  })

  it('completion remains idempotent after a prior successful completion', async () => {
    const created = await repository.createGeneration({ userId: 'user_a', modelId: 'qwen-image', params: { prompt: 'idempotent completion' } })
    const first = await repository.completeGeneration({
      recordId: created.record.id,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://provider.test/once.png' }] },
      enqueueArtifactPersist: true,
    })
    const second = await repository.completeGeneration({
      recordId: created.record.id,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://provider.test/duplicate.png' }] },
      enqueueArtifactPersist: true,
    })

    expect(first.outcome).toBe('completed')
    expect(second.outcome).toBe('already_completed')
    expect(await repository.listArtifactsForRecord(created.record.id)).toHaveLength(1)
  })

  it('provider failure cannot overwrite a processing cancellation request', async () => {
    const userId = 'user_a'
    const created = await repository.createGeneration({ userId, modelId: 'qwen-image', params: { prompt: 'race failure' } })
    await repository.markGenerationProcessing({ recordId: created.record.id })
    await repository.requestGenerationCancel({ recordId: created.record.id, userId })

    const failed = await repository.failGeneration({
      recordId: created.record.id,
      error: { category: 'provider', message: 'provider unavailable', retriable: false, code: 'PROVIDER_FAILED' },
    })

    expect(failed.status).toBe('cancelled')
    expect(await db
      .select({ status: usageRecords.status })
      .from(usageRecords)
      .where(eq(usageRecords.generationId, created.record.id)))
      .toEqual([{ status: 'cancelled' }])
  })

  it('cancelGeneration preserves a cancelled record as cancelled', async () => {
    const userId = 'user_cancel'
    const created = await repository.createGeneration({ userId, modelId: 'qwen-image', params: { prompt: 'cancel me' } })
    // submitting → 取消直接翻 cancelled（终态）。
    const requested = await repository.requestGenerationCancel({ recordId: created.record.id, userId, now: '2026-07-02T00:00:00.000Z' })
    expect(requested.status).toBe('cancelled')
    const [refundedAccount] = await db
      .select({ availableCents: creditAccounts.availableCents, reservedCents: creditAccounts.reservedCents })
      .from(creditAccounts)
      .where(eq(creditAccounts.userId, userId))
    expect(refundedAccount).toEqual({ availableCents: 1_000_000, reservedCents: 0 })
    expect(await db
      .select({ status: usageRecords.status })
      .from(usageRecords)
      .where(eq(usageRecords.generationId, created.record.id)))
      .toEqual([{ status: 'cancelled' }])

    // worker 看到这条已取消的记录时，应通过 cancelGeneration 收尾——保持 cancelled，
    // 而不是被 failGeneration 覆盖成 failed。
    const finalized = await repository.cancelGeneration({
      recordId: created.record.id,
      error: { category: 'cancelled', message: 'Generation was cancelled before provider execution', retriable: false, code: 'GENERATION_CANCELLED' },
      now: '2026-07-02T00:00:01.000Z',
    })

    expect(finalized.status).toBe('cancelled')
    expect(finalized.statusReason).toBe('Generation was cancelled before provider execution')
    expect(finalized.errorJson?.code).toBe('GENERATION_CANCELLED')
    expect(finalized.errorJson?.category).toBe('cancelled')
    expect(await db
      .select({ kind: creditLedgerEntries.kind })
      .from(creditLedgerEntries)
      .where(eq(creditLedgerEntries.generationId, created.record.id)))
      .toEqual([{ kind: 'reserve' }, { kind: 'refund' }])
  })

  it('cancelGeneration turns a processing cancel request into cancelled', async () => {
    const userId = 'user_cancel_processing'
    const created = await repository.createGeneration({ userId, modelId: 'qwen-image', params: { prompt: 'cancel me' } })
    await repository.markGenerationProcessing({ recordId: created.record.id, now: '2026-07-02T00:00:00.000Z' })
    // processing → 仅置取消标志位，status 仍是 processing。
    await repository.requestGenerationCancel({ recordId: created.record.id, userId, now: '2026-07-02T00:00:01.000Z' })

    // worker 看到这条 processing + cancelRequestedAt 的记录时，应通过 cancelGeneration
    // 翻成 cancelled（终态），并保留取消标志位。
    const finalized = await repository.cancelGeneration({
      recordId: created.record.id,
      error: { category: 'cancelled', message: 'Generation was cancelled before provider execution', retriable: false, code: 'GENERATION_CANCELLED' },
      now: '2026-07-02T00:00:02.000Z',
    })

    expect(finalized.status).toBe('cancelled')
    expect(finalized.providerCancelStatus).toBe('requested')
    expect(finalized.cancelRequestedAt).toBe('2026-07-02T00:00:01.000Z')
  })

  it('cancelGeneration does not rewrite a terminal succeeded record even when stale cancel metadata exists', async () => {
    // 防御性回归：worker 可能拿到一条「已完成但残留了取消标记」的陈旧任务（例如
    // 取消请求与完成几乎同时发生）。cancelGeneration 绝不能把 succeeded/failed 记录
    // 改写成 cancelled——那是数据损坏。
    const userId = 'user_terminal_cancel_guard'
    const created = await repository.createGeneration({ userId, modelId: 'qwen-image', params: { prompt: 'done' } })

    await repository.completeGeneration({
      recordId: created.record.id,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://example.test/done.png' }] },
      now: '2026-07-03T00:00:00.000Z',
    })
    // 残留的取消标记（模拟竞态：完成与取消几乎同时落地）。
    await repository.updateGenerationRecord(created.record.id, {
      cancelRequestedAt: '2026-07-03T00:00:01.000Z',
      providerCancelStatus: 'requested',
    })

    await expect(repository.cancelGeneration({
      recordId: created.record.id,
      error: { category: 'cancelled', message: 'stale cancel', retriable: false, code: 'GENERATION_CANCELLED' },
      now: '2026-07-03T00:00:02.000Z',
    })).rejects.toMatchObject({ code: 'GENERATION_NOT_CANCELLABLE' })

    // 记录仍是 succeeded，输出产物未被破坏。
    const record = await repository.getGenerationRecord(created.record.id)
    expect(record?.status).toBe('succeeded')
    expect(record?.outputResult?.artifacts).toHaveLength(1)
  })

  it('retryGeneration creates a new generation with the same model and params', async () => {
    const userId = 'user_a'
    const created = await repository.createGeneration({ userId, modelId: 'qwen-image', params: { prompt: 'a' } })
    await repository.failGeneration({
      recordId: created.record.id,
      error: { category: 'provider', message: 'provider failed', retriable: false, code: 'PROVIDER_FAILED' },
    })

    const retry = await repository.retryGeneration({ recordId: created.record.id, userId, idempotencyKey: 'retry-1' })

    expect(retry.record.id).not.toBe(created.record.id)
    expect(retry.record.modelId).toBe(created.record.modelId)
    expect(retry.record.inputParams).toEqual(created.record.inputParams)
    expect(retry.record.parentRecordId).toBe(created.record.id)
    expect(retry.task.type).toBe('generation.submit')
  })

  it('retryGeneration preserves historical asset bindings after the library item is hidden', async () => {
    const userId = 'user_a'
    for (const id of ['asset_retry_hidden_a', 'asset_retry_hidden_b']) {
      await repository.createUserAsset({
        id,
        userId,
        kind: 'image',
        source: 'upload',
        storageProvider: 'oss',
        storageKey: `users/user_a/${id}.png`,
      })
    }
    const created = await repository.createGeneration({
      userId,
      modelId: 'qwen-image-edit',
      params: { prompt: 'retry with the same source' },
      assetRefs: { image: ['asset_retry_hidden_b', 'asset_retry_hidden_a'] },
    })
    await repository.failGeneration({
      recordId: created.record.id,
      error: { category: 'provider', message: 'provider failed', retriable: false, code: 'PROVIDER_FAILED' },
    })
    await repository.softDeleteUserAsset({ userId, assetId: 'asset_retry_hidden_a' })
    await repository.softDeleteUserAsset({ userId, assetId: 'asset_retry_hidden_b' })

    await expect(repository.createGeneration({
      userId,
      modelId: 'qwen-image-edit',
      params: { prompt: 'new create must not see a hidden asset' },
      assetRefs: { image: ['asset_retry_hidden_b', 'asset_retry_hidden_a'] },
    })).rejects.toMatchObject({ code: 'INVALID_GENERATION_PARAMS' })

    const retried = await repository.retryGeneration({
      recordId: created.record.id,
      userId,
      idempotencyKey: 'retry-hidden-ref',
    })
    expect(retried.record.assetRefs).toEqual({
      image: ['asset_retry_hidden_b', 'asset_retry_hidden_a'],
    })
    expect(retried.record.parentRecordId).toBe(created.record.id)
    await expect(repository.getGenerationInputAssets(retried.record.id))
      .resolves.toMatchObject([
        {
          position: 0,
          assetId: 'asset_retry_hidden_b',
          storageKey: 'users/user_a/asset_retry_hidden_b.png',
        },
        {
          position: 1,
          assetId: 'asset_retry_hidden_a',
          storageKey: 'users/user_a/asset_retry_hidden_a.png',
        },
      ])
  })

  it('retryGeneration rejects non-owner as not found and active records as not retryable', async () => {
    const owner = 'user_a'
    const other = 'user_b'
    const created = await repository.createGeneration({ userId: owner, modelId: 'qwen-image', params: { prompt: 'a' } })

    await expect(repository.retryGeneration({ recordId: created.record.id, userId: other }))
      .rejects.toMatchObject({ code: 'GENERATION_NOT_FOUND' })

    // 仍是 submitting（活跃态），不可重跑。
    await expect(repository.retryGeneration({ recordId: created.record.id, userId: owner }))
      .rejects.toMatchObject({ code: 'GENERATION_NOT_RETRYABLE' })
  })

  it('retryGeneration does not reparent an idempotent retry from another original record', async () => {
    const userId = 'user_a'
    const first = await repository.createGeneration({ userId, modelId: 'qwen-image', params: { prompt: 'first' } })
    const second = await repository.createGeneration({ userId, modelId: 'qwen-image', params: { prompt: 'second' } })
    await repository.failGeneration({ recordId: first.record.id, error: { category: 'provider', message: 'failed', retriable: false, code: 'PROVIDER_FAILED' } })
    await repository.failGeneration({ recordId: second.record.id, error: { category: 'provider', message: 'failed', retriable: false, code: 'PROVIDER_FAILED' } })

    // 用同一个 idempotencyKey 重跑 first → 成功，并挂到 first。
    const retry = await repository.retryGeneration({ recordId: first.record.id, userId, idempotencyKey: 'same-key' })
    expect(retry.record.parentRecordId).toBe(first.record.id)

    // 用同一个 idempotencyKey 重跑 second：命中既有幂等记录（属于 first），
    // 应当拒绝为 IDEMPOTENCY_CONFLICT，而不是把 retry 记录重新挂到 second。
    await expect(repository.retryGeneration({ recordId: second.record.id, userId, idempotencyKey: 'same-key' }))
      .rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })

    const unchanged = await repository.getGenerationRecord(retry.record.id)
    expect(unchanged?.parentRecordId).toBe(first.record.id)
  })

  it('retryGeneration replays the same retry idempotently for the same original record', async () => {
    const userId = 'user_a'
    const created = await repository.createGeneration({ userId, modelId: 'qwen-image', params: { prompt: 'a' } })
    await repository.failGeneration({ recordId: created.record.id, error: { category: 'provider', message: 'failed', retriable: false, code: 'PROVIDER_FAILED' } })

    const first = await repository.retryGeneration({ recordId: created.record.id, userId, idempotencyKey: 'retry-replay' })
    const second = await repository.retryGeneration({ recordId: created.record.id, userId, idempotencyKey: 'retry-replay' })

    // 同 key + 同原记录 → 幂等返回同一条 retry 记录，parentRecordId 不变。
    expect(second.record.id).toBe(first.record.id)
    expect(second.record.parentRecordId).toBe(created.record.id)
  })

  describe('listGenerationRecords pagination', () => {
    async function seedUser(userId: string, count: number): Promise<void> {
      for (let i = 0; i < count; i++) {
        await repository.createGeneration({
          userId,
          modelId: 'qwen-image',
          params: { prompt: `p${i}`, n: 1, size: '1328*1328' },
        })
      }
    }

    it('pages through records with a cursor and exhausts cleanly', async () => {
      await seedUser('user_page', 5)

      const page1 = await repository.listGenerationRecords('user_page', { limit: 2 })
      const page2 = await repository.listGenerationRecords('user_page', { limit: 2, cursor: page1.nextCursor })
      const page3 = await repository.listGenerationRecords('user_page', { limit: 2, cursor: page2.nextCursor })

      expect(page1.items).toHaveLength(2)
      expect(page1.nextCursor).toBeDefined()
      expect(page2.items).toHaveLength(2)
      expect(page2.nextCursor).toBeDefined()
      expect(page3.items).toHaveLength(1)
      expect(page3.nextCursor).toBeUndefined()

      const allIds = [...page1.items, ...page2.items, ...page3.items].map(r => r.id)
      expect(allIds).toHaveLength(5)
      expect(new Set(allIds).size).toBe(5) // 无重叠、无跳过
      // 最新在前：page1 在降序排列中先于 page3。
      expect(page1.items[0]!.createdAt >= page3.items[0]!.createdAt).toBe(true)
    })

    it('filters by status', async () => {
      await seedUser('user_status', 3)

      const submitting = await repository.listGenerationRecords('user_status', { status: 'submitting' })
      const succeeded = await repository.listGenerationRecords('user_status', { status: 'succeeded' })

      expect(submitting.items).toHaveLength(3)
      expect(succeeded.items).toHaveLength(0)
    })

    it('clamps an oversized limit and returns no nextCursor when everything fits', async () => {
      await seedUser('user_clamp', 3)

      const result = await repository.listGenerationRecords('user_clamp', { limit: 1000 })

      expect(result.items).toHaveLength(3)
      expect(result.nextCursor).toBeUndefined()
    })

    it('rejects a malformed cursor', async () => {
      const badCursor = Buffer.from('not-json', 'utf8').toString('base64url')
      await expect(repository.listGenerationRecords('user_x', { cursor: badCursor }))
        .rejects.toMatchObject({ code: 'INVALID_CURSOR' })
    })
  })
})

describe('GenerationRepository requestId tracking', () => {
  beforeEach(async () => {
    await resetBailianStudioTestDb(db)
    // 创建测试用户以满足外键约束
    await db.insert(users).values({
      id: 'user-1',
      email: 'user-test@example.com',
      passwordHash: 'test-hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await seedCreditAccounts()
  })

  it('saves requestId when completing generation', async () => {
    const record = await repository.createGeneration({
      userId: 'user-1',
      modelId: 'qwen-image',
      params: { prompt: 'test' },
    })

    await repository.completeGeneration({
      recordId: record.record.id,
      costFinal: 20,
      output: { artifacts: [] },
      requestId: 'req-complete-123',
      now: '2025-01-06T00:00:00.000Z',
    })

    const updated = await repository.getGenerationRecord(record.record.id)
    expect(updated?.requestId).toBe('req-complete-123')
  })

  it('saves requestId when scheduling poll', async () => {
    const record = await repository.createGeneration({
      userId: 'user-1',
      modelId: 'wanx-text-to-video',
      params: { prompt: 'test' },
    })

    await repository.scheduleGenerationPoll({
      recordId: record.record.id,
      providerTaskId: 'prov-task-123',
      nextRunAt: '2025-01-06T01:00:00.000Z',
      requestId: 'req-poll-456',
      now: '2025-01-06T00:00:00.000Z',
    })

    const updated = await repository.getGenerationRecord(record.record.id)
    expect(updated?.requestId).toBe('req-poll-456')
  })

  it('saves requestId when failing generation', async () => {
    const record = await repository.createGeneration({
      userId: 'user-1',
      modelId: 'qwen-image',
      params: { prompt: 'test' },
    })

    await repository.failGeneration({
      recordId: record.record.id,
      error: { category: 'provider', message: 'Failed', retriable: false, code: 'ERR' },
      requestId: 'req-fail-789',
      now: '2025-01-06T00:00:00.000Z',
    })

    const updated = await repository.getGenerationRecord(record.record.id)
    expect(updated?.requestId).toBe('req-fail-789')
  })

  it('does not overwrite requestId when not provided', async () => {
    const record = await repository.createGeneration({
      userId: 'user-1',
      modelId: 'qwen-image',
      params: { prompt: 'test' },
    })

    // 第一次更新带 requestId
    await repository.scheduleGenerationPoll({
      recordId: record.record.id,
      providerTaskId: 'prov-task-123',
      nextRunAt: '2025-01-06T01:00:00.000Z',
      requestId: 'req-first-123',
      now: '2025-01-06T00:00:00.000Z',
    })

    // 第二次更新不带 requestId（不应覆盖）
    await repository.scheduleGenerationPoll({
      recordId: record.record.id,
      providerTaskId: 'prov-task-123',
      nextRunAt: '2025-01-06T02:00:00.000Z',
      // 未提供 requestId
      now: '2025-01-06T01:00:00.000Z',
    })

    const updated = await repository.getGenerationRecord(record.record.id)
    expect(updated?.requestId).toBe('req-first-123') // 保持原值
  })
})

describe('GenerationRepository generation shares', () => {
  beforeEach(async () => {
    await resetBailianStudioTestDb(db)
    await db.insert(users).values([
      { id: 'user_1', email: 'user1@example.com', passwordHash: 'h', createdAt: new Date(), updatedAt: new Date() },
      { id: 'user_race', email: 'race@example.com', passwordHash: 'h', createdAt: new Date(), updatedAt: new Date() },
    ])
    await seedCreditAccounts()
  })

  it('creates one active share per generation record', async () => {
    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })

    const first = await repository.createGenerationShare({
      recordId: created.record.id,
      userId: 'user_1',
      now: '2026-07-01T00:00:00.000Z',
    })
    const second = await repository.createGenerationShare({
      recordId: created.record.id,
      userId: 'user_1',
      now: '2026-07-01T00:01:00.000Z',
    })

    expect(second.id).toBe(first.id)
    expect(second.recordId).toBe(created.record.id)
    expect(second.userId).toBe('user_1')
    expect(first.id).toMatch(/^share_[0-9a-f]{32}$/)
  })

  it('does not create a share for another user record', async () => {
    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })

    await expect(repository.createGenerationShare({
      recordId: created.record.id,
      userId: 'user_race',
    })).rejects.toMatchObject({ code: 'GENERATION_NOT_FOUND' })
  })

  it('returns a strictly scoped public shared generation read model', async () => {
    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })
    await repository.completeGeneration({
      recordId: created.record.id,
      costFinal: 20,
      output: { artifacts: [{ kind: 'image', sourceUrl: 'https://cdn.test/a.png', mimeType: 'image/png' }] },
      enqueueArtifactPersist: false,
      now: '2026-07-01T00:00:00.000Z',
    })
    const share = await repository.createGenerationShare({
      recordId: created.record.id,
      userId: 'user_1',
      includeParams: true,
      now: '2026-07-01T00:01:00.000Z',
    })

    const publicRead = await repository.getPublicSharedGeneration(share.id)

    expect(publicRead?.share.id).toBe(share.id)
    expect(publicRead?.record.id).toBe(created.record.id)
    expect(publicRead?.record.inputParams?.prompt).toBe('lantern')
    expect(publicRead?.artifacts[0]?.kind).toBe('image')

    const json = JSON.stringify(publicRead)
    expect(json).not.toContain('idempotencyKey')
    expect(json).not.toContain('costEstimate')
    expect(json).not.toContain('costFinal')
    expect(json).not.toContain('outputResult')
    expect(json).not.toContain('userId')
  })

  it('hides params by default and supports expiry, reactivation, and revocation', async () => {
    const created = await repository.createGeneration({
      userId: 'user_1',
      modelId: 'qwen-image',
      params: { prompt: 'private lantern', n: 1, size: '1328*1328' },
    })

    const expired = await repository.createGenerationShare({
      recordId: created.record.id,
      userId: 'user_1',
      expiresAt: '2026-07-22T00:00:00.000Z',
      now: '2026-07-23T00:00:00.000Z',
    })
    const expiredRead = await repository.getPublicSharedGeneration(expired.id)
    expect(expiredRead).toBeUndefined()

    const reactivated = await repository.createGenerationShare({
      recordId: created.record.id,
      userId: 'user_1',
      expiresAt: '2099-01-01T00:00:00.000Z',
      now: '2026-07-23T00:01:00.000Z',
    })
    expect(reactivated.id).toBe(expired.id)
    const publicRead = await repository.getPublicSharedGeneration(reactivated.id)
    expect(publicRead?.record.inputParams).toBeUndefined()

    const revoked = await repository.revokeGenerationShare({
      recordId: created.record.id,
      userId: 'user_1',
      now: '2026-07-23T00:02:00.000Z',
    })
    expect(revoked?.revokedAt).toBe('2026-07-23T00:02:00.000Z')
    expect(await repository.getPublicSharedGeneration(reactivated.id)).toBeUndefined()

    const replacement = await repository.createGenerationShare({
      recordId: created.record.id,
      userId: 'user_1',
      now: '2026-07-23T00:03:00.000Z',
    })
    expect(replacement.id).not.toBe(reactivated.id)
  })
})

describe('GenerationRepository worker heartbeats', () => {
  beforeEach(async () => {
    await resetBailianStudioTestDb(db)
  })

  it('tracks active, stale, and stopping worker states without touching generation data', async () => {
    if (
      repository.registerWorkerHeartbeat === undefined
      || repository.touchWorkerHeartbeat === undefined
      || repository.stopWorkerHeartbeat === undefined
      || repository.getWorkerHealth === undefined
    ) {
      throw new Error('worker heartbeat repository methods are missing')
    }

    await repository.registerWorkerHeartbeat({
      workerId: 'worker-a',
      startedAt: '2026-07-01T00:00:00.000Z',
      now: '2026-07-01T00:00:01.000Z',
    })
    expect((await repository.getWorkerHealth({
      now: '2026-07-01T00:00:10.000Z',
      staleAfterMs: 15_000,
    })).status).toBe('ok')

    await repository.touchWorkerHeartbeat('worker-a', '2026-07-01T00:00:20.000Z')
    expect((await repository.getWorkerHealth({
      now: '2026-07-01T00:00:30.000Z',
      staleAfterMs: 5_000,
    })).status).toBe('failed')

    const stopped = await repository.stopWorkerHeartbeat('worker-a', '2026-07-01T00:00:31.000Z')
    expect(stopped?.status).toBe('stopping')
    expect((await repository.getWorkerHealth({
      now: '2026-07-01T00:00:31.000Z',
      staleAfterMs: 60_000,
    })).status).toBe('failed')
  })
})
