import { createDb, type BailianStudioDb, assetDerivatives, userAssets, users } from '@bailian-studio/db'
import { createIsolatedTestDb, type IsolatedTestDb } from '@bailian-studio/db/test'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createAdminAssetRepository, type AdminAssetRepository } from '../src'

let isolated: IsolatedTestDb
let db: BailianStudioDb
let assets: AdminAssetRepository

const USER_A = 'admin-assets-user-a'
const USER_B = 'admin-assets-user-b'

beforeAll(async () => {
  isolated = await createIsolatedTestDb()
  db = createDb({ url: isolated.url, max: 2 })
  await db.insert(users).values([
    {
      id: USER_A,
      email: 'admin-assets-a@example.test',
      passwordHash: 'test-hash',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
    {
      id: USER_B,
      email: 'admin-assets-b@example.test',
      passwordHash: 'test-hash',
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
  ])
  await db.insert(userAssets).values([
    {
      id: 'asset-alpha-a',
      userId: USER_A,
      kind: 'image',
      source: 'upload',
      fileName: 'alpha-a.png',
      mimeType: 'image/png',
      storageProvider: 'local',
      storageKey: 'uploads/alpha.png',
      metadataJson: { width: 1328, height: 1328, durationSeconds: 3 },
      status: 'ready',
      createdBy: USER_A,
      updatedBy: USER_A,
      createdAt: new Date('2026-08-02T00:00:00.000Z'),
      updatedAt: new Date('2026-08-02T00:00:00.000Z'),
    },
    {
      id: 'asset-alpha-b',
      userId: USER_A,
      kind: 'video',
      source: 'upload',
      fileName: 'alpha-b.mp4',
      mimeType: 'video/mp4',
      storageProvider: 'local',
      storageKey: 'uploads/alpha.mp4',
      status: 'ready',
      createdBy: USER_A,
      updatedBy: USER_A,
      createdAt: new Date('2026-08-03T00:00:00.000Z'),
      updatedAt: new Date('2026-08-03T00:00:00.000Z'),
    },
    {
      id: 'asset-private',
      userId: USER_B,
      kind: 'image',
      source: 'upload',
      fileName: 'brand-secret.png',
      status: 'ready',
      createdBy: USER_B,
      updatedBy: USER_B,
      createdAt: new Date('2026-08-04T00:00:00.000Z'),
      updatedAt: new Date('2026-08-04T00:00:00.000Z'),
    },
    {
      id: 'asset-deleted',
      userId: USER_A,
      kind: 'image',
      source: 'upload',
      fileName: 'deleted.png',
      status: 'ready',
      deletedAt: new Date('2026-08-05T00:00:00.000Z'),
      deletedBy: USER_A,
      createdBy: USER_A,
      updatedBy: USER_A,
      createdAt: new Date('2026-08-05T00:00:00.000Z'),
      updatedAt: new Date('2026-08-05T00:00:00.000Z'),
    },
  ])
  await db.insert(assetDerivatives).values({
    id: 'thumbnail-alpha-a',
    assetId: 'asset-alpha-a',
    userId: USER_A,
    kind: 'thumbnail',
    status: 'ready',
    storageProvider: 'local',
    storageKey: 'thumbnails/alpha.webp',
    createdBy: USER_A,
    updatedBy: USER_A,
    createdAt: new Date('2026-08-02T00:00:01.000Z'),
    updatedAt: new Date('2026-08-02T00:00:01.000Z'),
  })
  assets = createAdminAssetRepository(db)
})

afterAll(async () => {
  await db.close()
  await isolated.close()
})

describe('admin asset repository', () => {
  it('lists only the requested user assets with stable filtered cursors and metadata', async () => {
    const first = await assets.listUserAssets(USER_A, { sort: 'title', limit: 1, q: ' alpha ' })
    expect(first.items.map(item => item.id)).toEqual(['asset-alpha-a'])
    expect(first.items[0]).toMatchObject({
      declaredResolution: '1328×1328',
      durationSeconds: 3,
      storageKey: 'uploads/alpha.png',
      thumbnailStorageKey: 'thumbnails/alpha.webp',
    })
    expect(first.nextCursor).toBeDefined()

    const second = await assets.listUserAssets(USER_A, {
      sort: 'title',
      limit: 1,
      q: 'ALPHA',
      cursor: first.nextCursor,
    })
    expect(second.items.map(item => item.id)).toEqual(['asset-alpha-b'])
    expect(second.nextCursor).toBeUndefined()

    await expect(assets.listUserAssets(USER_A, { q: 'brand' })).resolves.toEqual({ items: [] })
  })

  it('keeps deleted asset lookup explicit and owner-scoped', async () => {
    await expect(assets.getUserAsset({ userId: USER_A, assetId: 'asset-deleted' })).resolves.toBeUndefined()
    await expect(assets.getUserAsset({
      userId: USER_A,
      assetId: 'asset-deleted',
      includeDeleted: true,
    })).resolves.toMatchObject({ id: 'asset-deleted' })
    await expect(assets.getUserAsset({
      userId: USER_B,
      assetId: 'asset-alpha-a',
      includeDeleted: true,
    })).resolves.toBeUndefined()
  })
})
