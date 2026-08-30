import { createDb, userAssets, users, type BailianStudioDb } from '@bailian-studio/db'
import { createIsolatedTestDb, requireDatabaseUrl, resetBailianStudioTestDb } from '@bailian-studio/db/test'
import { createTaskQueueTransactionStore } from '@bailian-studio/task-repository'
import { createMediaRepository, type MediaRepository } from './repository'

export function requireMediaDatabaseUrl(): string {
  return requireDatabaseUrl()
}

export interface MediaRepositoryTestDb {
  db: BailianStudioDb
  repository: MediaRepository
  close(): Promise<void>
}

export function createMediaRepositoryFromUrl(url: string): MediaRepositoryTestDb {
  const db = createDb({ url, max: 5 })
  return { db, repository: createMediaRepository({ db, taskQueueTransactionStore: createTaskQueueTransactionStore() }), close: () => db.close() }
}

export interface IsolatedMediaRepository {
  repository: MediaRepository
  db: BailianStudioDb
  databaseUrl: string
  close(): Promise<void>
}

export async function createIsolatedMediaRepository(): Promise<IsolatedMediaRepository> {
  const testDb = await createIsolatedTestDb()
  const handle = createMediaRepositoryFromUrl(testDb.url)
  return {
    repository: handle.repository,
    db: handle.db,
    databaseUrl: testDb.url,
    async close() {
      await handle.close()
      await testDb.close()
    },
  }
}

export async function resetMediaRepositoryTestDb(
  urlOrDb: string | BailianStudioDb = requireMediaDatabaseUrl(),
): Promise<void> {
  const db = typeof urlOrDb === 'string' ? createDb({ url: urlOrDb, max: 1 }) : urlOrDb
  const ownsPool = typeof urlOrDb === 'string'
  try {
    await resetBailianStudioTestDb(db)
  } finally {
    if (ownsPool) await db.close()
  }
}

export async function createMediaTestUser(
  urlOrDb: string | BailianStudioDb,
  input: { id?: string; email?: string } = {},
): Promise<{ id: string; email: string }> {
  const db = typeof urlOrDb === 'string' ? createDb({ url: urlOrDb, max: 1 }) : urlOrDb
  const ownsPool = typeof urlOrDb === 'string'
  const id = input.id ?? `user_${crypto.randomUUID().replace(/-/g, '')}`
  const email = input.email ?? `${id}@example.com`
  try {
    const now = new Date()
    await db.insert(users).values({
      id,
      email,
      passwordHash: 'test-hash',
      createdAt: now,
      updatedAt: now,
    })
    return { id, email }
  } finally {
    if (ownsPool) await db.close()
  }
}

export async function createMediaTestAsset(
  urlOrDb: string | BailianStudioDb,
  input: {
    id: string
    userId: string
    kind?: 'image' | 'video' | 'audio'
    fileName?: string
    mimeType?: string
    byteSize?: number
    storageProvider?: string
    storageKey?: string
  },
): Promise<void> {
  const db = typeof urlOrDb === 'string' ? createDb({ url: urlOrDb, max: 1 }) : urlOrDb
  const ownsPool = typeof urlOrDb === 'string'
  try {
    const now = new Date()
    await db.insert(userAssets).values({
      id: input.id,
      userId: input.userId,
      kind: input.kind ?? 'video',
      source: 'upload',
      fileName: input.fileName ?? 'video.mp4',
      mimeType: input.mimeType ?? 'video/mp4',
      byteSize: input.byteSize ?? 10,
      storageProvider: input.storageProvider ?? 'local',
      storageKey: input.storageKey ?? `user_uploads/${input.userId}/video.mp4`,
      storageUrl: null,
      metadataJson: {},
      status: 'ready',
      createdAt: now,
      updatedAt: now,
    })
  } finally {
    if (ownsPool) await db.close()
  }
}
