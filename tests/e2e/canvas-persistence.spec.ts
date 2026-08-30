import { expect, test } from '@playwright/test'
import { hash as hashPassword } from '@node-rs/argon2'
import postgres, { type Sql } from 'postgres'

/**
 * Canvas 持久化闭环验收（真实 HTTP + 真实迁移数据库）。
 *
 * 覆盖前端持久化 hook 依赖的服务端契约：创建画布 → 保存新 revision →
 * 读取不可变版本历史 → 恢复历史版本生成新 revision → 拒绝过期 revision。
 * 不启动 Worker，也不调用模型 provider；这条验收只验证画布源数据的可靠性。
 */
const databaseUrl = process.env.DATABASE_URL
  ?? 'postgres://bailian-studio:bailian-studio@127.0.0.1:55432/bailian-studio_test'
const apiOrigin = process.env.E2E_API_ORIGIN
  ?? `http://127.0.0.1:${process.env.E2E_API_PORT ?? '5103'}`
const email = `canvas-persistence-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`
const userId = `user_canvas_persistence_${Date.now()}_${Math.random().toString(16).slice(2)}`
const password = 'canvas-persistence-password-123'

const initialSnapshot = {
  nodes: [],
  edges: [],
}

const editedSnapshot = {
  nodes: [{
    id: 'node-1',
    type: 'mediaNode',
    position: { x: 128, y: 256 },
    data: {
      kind: 'image',
      status: 'empty',
      prompt: '一盏夜灯',
      modelId: 'qwen-image',
      referenceAssetIds: [],
    },
  }],
  edges: [],
}

let sql: Sql

test.beforeAll(async () => {
  const passwordHash = await hashPassword(password)
  sql = postgres(databaseUrl, { max: 1 })
  const now = new Date()
  await sql`
    insert into users (
      id, email, password_hash, email_verified_at, display_name, role,
      created_by, updated_by, created_at, updated_at
    )
    values (
      ${userId}, ${email}, ${passwordHash}, ${now},
      ${'Canvas 持久化验收用户'}, ${'user'}, ${'e2e'}, ${'e2e'}, ${now}, ${now}
    )
  `
})

test.afterAll(async () => {
  await sql.end({ timeout: 5 })
})

test('canvas persistence loop: save → versions → restore → reject stale revision', async ({ request }) => {
  const login = await request.post(`${apiOrigin}/api/auth/login`, {
    data: { email, password },
  })
  expect(login.ok()).toBe(true)

  const create = await request.post(`${apiOrigin}/api/canvases`, {
    data: { title: 'Canvas 持久化验收', snapshot: initialSnapshot },
  })
  expect(create.status()).toBe(200)
  const createdBody = await create.json() as {
    data: {
      document: {
        id: string
        title: string
        revision: number
        currentVersionId: string
        snapshot: typeof initialSnapshot
      }
    }
  }
  const documentId = createdBody.data.document.id
  const versionOneId = createdBody.data.document.currentVersionId
  expect(createdBody.data.document).toMatchObject({
    title: 'Canvas 持久化验收',
    revision: 1,
    snapshot: initialSnapshot,
  })

  const list = await request.get(`${apiOrigin}/api/canvases`)
  expect(list.status()).toBe(200)
  const listBody = await list.json() as {
    data: { items: Array<{ id: string; revision: number; title: string }> }
  }
  expect(listBody.data.items).toContainEqual({
    id: documentId,
    revision: 1,
    title: 'Canvas 持久化验收',
    updatedAt: expect.any(String),
  })

  const save = await request.patch(`${apiOrigin}/api/canvases/${documentId}`, {
    data: {
      expectedRevision: 1,
      title: 'Canvas 已编辑',
      snapshot: editedSnapshot,
    },
  })
  expect(save.status()).toBe(200)
  const savedBody = await save.json() as {
    data: { document: { revision: number; title: string; currentVersionId: string; snapshot: typeof editedSnapshot } }
  }
  const versionTwoId = savedBody.data.document.currentVersionId
  expect(savedBody.data.document).toMatchObject({
    revision: 2,
    title: 'Canvas 已编辑',
    snapshot: editedSnapshot,
  })
  expect(versionTwoId).not.toBe(versionOneId)

  const versions = await request.get(`${apiOrigin}/api/canvases/${documentId}/versions?limit=10`)
  expect(versions.status()).toBe(200)
  const versionsBody = await versions.json() as {
    data: {
      versions: Array<{
        id: string
        documentId: string
        version: number
        snapshot: typeof initialSnapshot | typeof editedSnapshot
      }>
    }
  }
  expect(versionsBody.data.versions.map(version => version.version)).toEqual([2, 1])
  expect(versionsBody.data.versions).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: versionOneId, documentId, version: 1, snapshot: initialSnapshot }),
    expect.objectContaining({ id: versionTwoId, documentId, version: 2, snapshot: editedSnapshot }),
  ]))

  const restore = await request.post(`${apiOrigin}/api/canvases/${documentId}/restore`, {
    data: { expectedRevision: 2, versionId: versionOneId },
  })
  expect(restore.status()).toBe(200)
  const restoredBody = await restore.json() as {
    data: { document: { revision: number; snapshot: typeof initialSnapshot; currentVersionId: string } }
  }
  expect(restoredBody.data.document).toMatchObject({
    revision: 3,
    snapshot: initialSnapshot,
  })
  expect(restoredBody.data.document.currentVersionId).not.toBe(versionOneId)

  const staleSave = await request.patch(`${apiOrigin}/api/canvases/${documentId}`, {
    data: { expectedRevision: 2, snapshot: editedSnapshot },
  })
  expect(staleSave.status()).toBe(409)
  const staleBody = await staleSave.json() as {
    error: { code: string; details?: { expectedRevision?: number; currentRevision?: number } }
  }
  expect(staleBody.error).toMatchObject({
    code: 'CANVAS_REVISION_CONFLICT',
    details: { expectedRevision: 2, currentRevision: 3 },
  })

  const current = await request.get(`${apiOrigin}/api/canvases/${documentId}`)
  expect(current.status()).toBe(200)
  const currentBody = await current.json() as {
    data: { document: { revision: number; snapshot: typeof initialSnapshot } }
  }
  expect(currentBody.data.document).toMatchObject({ revision: 3, snapshot: initialSnapshot })
})
