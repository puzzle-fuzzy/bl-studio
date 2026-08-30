import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { createDb, users, type BailianStudioDb } from '@bailian-studio/db'
import { createIsolatedTestDb, type IsolatedTestDb } from '@bailian-studio/db/test'
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

    await expect(repository.saveDocument({
      userId: 'canvas-repository-test',
      documentId: document.id,
      expectedRevision: 1,
      snapshot: { nodes: [], edges: [] },
    })).rejects.toMatchObject({ code: 'CANVAS_REVISION_CONFLICT' })

    const history = await repository.listVersions({ userId: 'canvas-repository-test', documentId: document.id })
    expect(history.map(version => version.version)).toEqual([2, 1])
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
})
