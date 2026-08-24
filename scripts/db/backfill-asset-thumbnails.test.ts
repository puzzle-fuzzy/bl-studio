import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  assetDerivatives,
  createDb,
  taskRecords,
  userAssets,
  users,
  type BailianStudioDb,
} from '../../packages/db/src'
import { createIsolatedTestDb, type IsolatedTestDb } from '../../packages/db/src/test-utils'
import { backfillAssetThumbnails } from './backfill-asset-thumbnails'

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

describe('asset thumbnail backfill', () => {
  it('queues only local and HTTPS-link image/video assets and is idempotent', async () => {
    const now = new Date('2026-08-01T00:00:00.000Z')
    await db.insert(users).values({
      id: 'user_thumbnail_backfill',
      email: 'thumbnail-backfill@example.test',
      passwordHash: 'hash',
      createdAt: now,
      updatedAt: now,
    })
    const base = {
      userId: 'user_thumbnail_backfill',
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    }
    await db.insert(userAssets).values([
      { ...base, id: 'asset_local_image', kind: 'image', source: 'upload', storageProvider: 'local', storageKey: 'uploads/local.png' },
      { ...base, id: 'asset_https_video', kind: 'video', source: 'link', originalUrl: 'https://cdn.example.test/movie.mp4' },
      { ...base, id: 'asset_http_image', kind: 'image', source: 'link', originalUrl: 'http://cdn.example.test/image.png' },
      { ...base, id: 'asset_oss_image', kind: 'image', source: 'upload', storageProvider: 'oss', storageKey: 'uploads/oss.png' },
      { ...base, id: 'asset_local_audio', kind: 'audio', source: 'upload', storageProvider: 'local', storageKey: 'uploads/audio.mp3' },
    ])

    await expect(backfillAssetThumbnails(database.url)).resolves.toBe(2)
    await expect(backfillAssetThumbnails(database.url)).resolves.toBe(0)

    const derivatives = await db.select().from(assetDerivatives)
    expect(derivatives.map(item => item.assetId).sort()).toEqual([
      'asset_https_video',
      'asset_local_image',
    ])
    const tasks = await db.select().from(taskRecords)
    expect(tasks).toHaveLength(2)
    expect(tasks.every(task => task.type === 'media.thumbnail' && task.domain === 'media')).toBe(true)
    expect(tasks.map(task => task.inputJson['assetId']).sort()).toEqual([
      'asset_https_video',
      'asset_local_image',
    ])
  })
})
