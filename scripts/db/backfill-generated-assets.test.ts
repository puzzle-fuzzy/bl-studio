import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  createDb,
  generationArtifacts,
  generationRecords,
  userAssets,
  users,
  type BailianStudioDb,
} from '../../packages/db/src'
import { createIsolatedTestDb, type IsolatedTestDb } from '../../packages/db/src/test-utils'
import { backfillGeneratedAssets } from './backfill-generated-assets'

let database: IsolatedTestDb
let db: BailianStudioDb

beforeAll(async () => {
  database = await createIsolatedTestDb()
  db = createDb({ url: database.url, max: 1 })
})

afterAll(async () => {
  await db.close()
  await database.close()
})

describe('account and generated-asset data migration', () => {
  it('keeps new users unverified and ships the one-time legacy-account update', async () => {
    const now = new Date('2026-07-25T00:00:00.000Z')
    await db.insert(users).values({
      id: 'user_pending',
      email: 'pending@example.test',
      passwordHash: 'hash',
      createdAt: now,
      updatedAt: now,
    })

    const pending = (await db.select().from(users)).find(user => user.id === 'user_pending')
    expect(pending?.emailVerifiedAt).toBeNull()

    const migration = readFileSync(
      new URL('../../packages/db/drizzle/0027_account_assets_foundation.sql', import.meta.url),
      'utf8',
    )
    expect(migration).toContain('SET "email_verified_at" = COALESCE("email_verified_at", "created_at")')
    expect(migration).toContain('WHERE "deleted_at" IS NULL')
  })

  it('projects stored and legacy artifacts once without retaining unstable provider URLs', async () => {
    const now = new Date('2026-07-25T01:00:00.000Z')
    await db.insert(users).values({
      id: 'user_generated_asset',
      email: 'asset@example.test',
      passwordHash: 'hash',
      emailVerifiedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(generationRecords).values({
      id: 'generation_asset_1',
      userId: 'user_generated_asset',
      modelId: 'qwen-image',
      provider: 'dashscope',
      providerModel: 'qwen-image',
      category: 'image',
      inputParamsJson: { prompt: 'blueprint' },
      status: 'succeeded',
      costEstimate: 10,
      providerCancelStatus: 'not_requested',
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(generationArtifacts).values([
      {
        id: 'artifact_asset_stored',
        recordId: 'generation_asset_1',
        userId: 'user_generated_asset',
        kind: 'image',
        sourceUrl: 'https://provider.invalid/temporary.png',
        mimeType: 'image/png',
        byteSize: 2048,
        storageProvider: 'local',
        storageKey: 'generations/asset.png',
        storageUrl: 'https://signed.example/generations/asset.png?expires=300&signature=stored',
        status: 'stored',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'artifact_asset_legacy',
        recordId: 'generation_asset_1',
        userId: 'user_generated_asset',
        kind: 'archive',
        sourceUrl: 'https://provider.invalid/temporary.zip',
        mimeType: 'application/zip',
        byteSize: 4096,
        storageProvider: 'local',
        storageKey: 'generations/asset.zip',
        storageUrl: 'https://signed.example/generations/asset.zip?expires=300&signature=legacy',
        status: 'succeeded',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'artifact_asset_failed',
        recordId: 'generation_asset_1',
        userId: 'user_generated_asset',
        kind: 'video',
        sourceUrl: 'https://provider.invalid/failed.mp4',
        mimeType: 'video/mp4',
        status: 'failed',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'artifact_asset_url_only',
        recordId: 'generation_asset_1',
        userId: 'user_generated_asset',
        kind: 'image',
        sourceUrl: 'https://provider.invalid/url-only.png?expires=60',
        mimeType: 'image/png',
        status: 'succeeded',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'artifact_asset_existing',
        recordId: 'generation_asset_1',
        userId: 'user_generated_asset',
        kind: 'audio',
        sourceUrl: 'https://provider.invalid/existing.mp3',
        mimeType: 'audio/mpeg',
        storageProvider: 'local',
        storageKey: 'generations/existing.mp3',
        storageUrl: '/api/artifacts/artifact_asset_existing/content',
        status: 'stored',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'artifact_asset_deleted',
        recordId: 'generation_asset_1',
        userId: 'user_generated_asset',
        kind: 'text',
        sourceUrl: 'https://provider.invalid/deleted.txt',
        mimeType: 'text/plain',
        storageProvider: 'local',
        storageKey: 'generations/deleted.txt',
        storageUrl: '/api/artifacts/artifact_asset_deleted/content',
        status: 'stored',
        createdAt: now,
        updatedAt: now,
      },
    ])
    await db.insert(userAssets).values([
      {
        id: 'asset_generation_artifact_asset_existing',
        userId: 'user_generated_asset',
        kind: 'audio',
        source: 'generation',
        generationArtifactId: 'artifact_asset_existing',
        recordId: 'generation_asset_1',
        modelId: 'qwen-image',
        originalUrl: 'https://provider.invalid/existing.mp3',
        storageProvider: 'local',
        storageKey: 'generations/existing.mp3',
        storageUrl: 'https://signed.example/generations/existing.mp3?expires=300&signature=existing',
        status: 'ready',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'asset_generation_artifact_asset_deleted',
        userId: 'user_generated_asset',
        kind: 'text',
        source: 'generation',
        generationArtifactId: 'artifact_asset_deleted',
        recordId: 'generation_asset_1',
        modelId: 'qwen-image',
        originalUrl: 'https://provider.invalid/deleted.txt',
        storageProvider: 'local',
        storageKey: 'generations/deleted.txt',
        storageUrl: 'https://signed.example/generations/deleted.txt?expires=300&signature=deleted',
        status: 'ready',
        deletedAt: now,
        deletedBy: 'user_generated_asset',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'asset_generation_legacy_orphan',
        userId: 'user_generated_asset',
        kind: 'image',
        source: 'generation',
        originalUrl: 'https://provider.invalid/orphan.png?signature=provider',
        storageUrl: 'https://signed.example/generations/orphan.png?expires=300&signature=orphan',
        status: 'ready',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'asset_link_control',
        userId: 'user_generated_asset',
        kind: 'image',
        source: 'link',
        originalUrl: 'https://provider.invalid/link-input.png?signature=user-input',
        status: 'ready',
        createdAt: now,
        updatedAt: now,
      },
    ])

    await expect(backfillGeneratedAssets(database.url)).resolves.toBe(2)
    await expect(backfillGeneratedAssets(database.url)).resolves.toBe(0)

    const generatedRows = (await db.select().from(userAssets))
      .filter(asset => asset.source === 'generation')
    expect(generatedRows).toHaveLength(5)
    expect(generatedRows.every(asset => asset.originalUrl === null)).toBe(true)
    expect(generatedRows.every(asset => asset.storageUrl === null)).toBe(true)
    expect(generatedRows.find(asset => asset.generationArtifactId === 'artifact_asset_stored')).toMatchObject({
      id: 'asset_generation_artifact_asset_stored',
      userId: 'user_generated_asset',
      source: 'generation',
      recordId: 'generation_asset_1',
      modelId: 'qwen-image',
      storageKey: 'generations/asset.png',
      originalUrl: null,
    })
    expect(generatedRows.find(asset => asset.generationArtifactId === 'artifact_asset_legacy')).toMatchObject({
      id: 'asset_generation_artifact_asset_legacy',
      kind: 'archive',
      originalUrl: null,
    })
    expect(generatedRows.find(asset => asset.generationArtifactId === 'artifact_asset_failed')).toBeUndefined()
    expect(generatedRows.find(asset =>
      asset.generationArtifactId === 'artifact_asset_url_only'
    )).toBeUndefined()
    expect(generatedRows.find(asset => asset.generationArtifactId === 'artifact_asset_existing')).toMatchObject({
      originalUrl: null,
      deletedAt: null,
    })
    expect(generatedRows.find(asset => asset.generationArtifactId === 'artifact_asset_deleted')).toMatchObject({
      originalUrl: null,
      deletedAt: now,
      deletedBy: 'user_generated_asset',
    })
    expect((await db.select().from(userAssets))
      .find(asset => asset.id === 'asset_link_control')).toMatchObject({
        source: 'link',
        originalUrl: 'https://provider.invalid/link-input.png?signature=user-input',
      })
  })
})
