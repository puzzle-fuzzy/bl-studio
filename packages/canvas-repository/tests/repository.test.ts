import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { createDb, users, type BailianStudioDb } from '@bailian-studio/db'
import { createIsolatedTestDb, type IsolatedTestDb } from '@bailian-studio/db/test'
import { RepositoryError } from '@bailian-studio/shared'
import { CanvasRepositoryError, createCanvasRepository, type CanvasRepository } from '../src'

let isolated: IsolatedTestDb
let db: BailianStudioDb
let repository: CanvasRepository

beforeAll(async () => {
  isolated = await createIsolatedTestDb()
  db = createDb({ url: isolated.url, max: 2 })
  await db.insert(users).values({
    id: 'canvas-repository-test',
    email: 'canvas-repository-test@example.test',
    passwordHash: 'test-hash',
    createdAt: new Date(),
    updatedAt: new Date(),
  })
  repository = createCanvasRepository(db)
})

afterAll(async () => {
  await db?.close()
  await isolated?.close()
})

describe('canvas repository', () => {
  it('creates immutable versions and enforces optimistic revisions', async () => {
    const document = await repository.createDocument({
      userId: 'canvas-repository-test',
      title: '版本测试',
      snapshot: { nodes: [], edges: [] },
      now: new Date('2026-08-30T00:00:00.000Z'),
    })
    expect(document.revision).toBe(1)

    const saved = await repository.saveDocument({
      userId: 'canvas-repository-test',
      documentId: document.id,
      expectedRevision: 1,
      title: '重命名后的画布',
      snapshot: {
        nodes: [{
          id: 'node-1',
          type: 'mediaNode',
          position: { x: 1, y: 2 },
          data: { kind: 'image' },
        }],
        edges: [],
      },
    })
    expect(saved.revision).toBe(2)
    expect(saved.title).toBe('重命名后的画布')

    await expect(repository.saveDocument({
      userId: 'canvas-repository-test',
      documentId: document.id,
      expectedRevision: 1,
      snapshot: { nodes: [], edges: [] },
    })).rejects.toMatchObject({ code: 'CANVAS_REVISION_CONFLICT' })

    const history = await repository.listVersions({ userId: 'canvas-repository-test', documentId: document.id })
    expect(history.versions.map(version => version.version)).toEqual([2, 1])
    const restored = await repository.restoreVersion({
      userId: 'canvas-repository-test',
      documentId: document.id,
      versionId: document.currentVersionId,
      expectedRevision: 2,
    })
    expect(restored.revision).toBe(3)
    expect(restored.snapshot.nodes).toHaveLength(0)
  })

  it('does not expose another user\'s document', async () => {
    const document = await repository.createDocument({ userId: 'canvas-repository-test' })
    expect(await repository.getDocument({ userId: 'someone-else', documentId: document.id })).toBeUndefined()
    await expect(repository.listVersions({ userId: 'someone-else', documentId: document.id }))
      .rejects.toBeInstanceOf(CanvasRepositoryError)
  })

  it('lists version history with a stable keyset cursor', async () => {
    const userId = 'canvas-version-pagination-test'
    await db.insert(users).values({
      id: userId,
      email: 'canvas-version-pagination-test@example.test',
      passwordHash: 'test-hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const document = await repository.createDocument({ userId })
    await repository.saveDocument({
      userId,
      documentId: document.id,
      expectedRevision: 1,
      snapshot: { nodes: [], edges: [] },
    })
    await repository.saveDocument({
      userId,
      documentId: document.id,
      expectedRevision: 2,
      snapshot: { nodes: [], edges: [] },
    })

    const first = await repository.listVersions({ userId, documentId: document.id, limit: 2 })
    expect(first.versions.map(version => version.version)).toEqual([3, 2])
    expect(first.nextCursor).toBeDefined()

    const second = await repository.listVersions({
      userId,
      documentId: document.id,
      limit: 2,
      cursor: first.nextCursor,
    })
    expect(second.versions.map(version => version.version)).toEqual([1])
    expect(second.nextCursor).toBeUndefined()
  })

  it('rejects malformed version cursors', async () => {
    const document = await repository.createDocument({ userId: 'canvas-repository-test' })
    await expect(repository.listVersions({
      userId: 'canvas-repository-test',
      documentId: document.id,
      cursor: 'not-a-cursor',
    })).rejects.toMatchObject({ code: 'CANVAS_INVALID_CURSOR' })
  })

  it('lists documents with a stable keyset cursor', async () => {
    const userId = 'canvas-pagination-test'
    await db.insert(users).values({
      id: userId,
      email: 'canvas-pagination-test@example.test',
      passwordHash: 'test-hash',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    const now = new Date('2026-08-31T00:00:00.000Z')
    await repository.createDocument({ userId, title: '第一个', now })
    await repository.createDocument({ userId, title: '第二个', now })
    await repository.createDocument({ userId, title: '第三个', now })

    const first = await repository.listDocuments({ userId, limit: 2 })
    expect(first.items).toHaveLength(2)
    expect(first.nextCursor).toBeDefined()

    const second = await repository.listDocuments({ userId, limit: 2, cursor: first.nextCursor })
    expect(second.items).toHaveLength(1)
    expect(second.nextCursor).toBeUndefined()
    expect(new Set([...first.items, ...second.items].map(item => item.id)).size).toBe(3)
  })

  it('rejects malformed document cursors', async () => {
    await expect(repository.listDocuments({
      userId: 'canvas-repository-test',
      cursor: 'not-a-cursor',
    })).rejects.toMatchObject({ code: 'CANVAS_INVALID_CURSOR' })
  })

  it('exposes repository errors through the shared error base', () => {
    expect(new CanvasRepositoryError('CANVAS_NOT_FOUND', 'missing')).toBeInstanceOf(RepositoryError)
  })
})
