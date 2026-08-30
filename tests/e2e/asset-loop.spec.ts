import { expect, test } from '@playwright/test'
import { hash as hashPassword } from '@node-rs/argon2'
import postgres, { type Sql } from 'postgres'

/**
 * 资产闭环验收（API 驱动，真实 HTTP + 真实测试 DB）。
 *
 * 覆盖 Vue 时代遗留浏览器 spec 早已失效、且 e2e 此前完全没碰的链路：
 * 上传真实图片资产 → 在生成提交里通过 assetRefs 引用 → 成功后产物作为
 * library 资产落库 → 登出后私密数据直访被拒。e2e 不启动 worker，因此
 * "succeeded + 产物 + 生成资产" 这一步直接 seed 进测试 DB，其余全部走真实 API。
 *
 * 刻意不用浏览器：React 重写后前端测试只覆盖纯函数层（见 CLAUDE.md），
 * 此处聚焦真实 API 契约与持久化闭环，比 UI 选择器稳定得多。
 */
const databaseUrl = process.env.DATABASE_URL
  ?? 'postgres://bailian-studio:bailian-studio@127.0.0.1:55432/bailian-studio_test'
const apiOrigin = process.env.E2E_API_ORIGIN ?? 'http://127.0.0.1:5003'
const email = `asset-loop-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`
const userId = `user_asset_loop_${Date.now()}_${Math.random().toString(16).slice(2)}`
const password = 'asset-loop-password-123'
// 1×1 透明 PNG
const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8V0AAAAASUVORK5CYII=',
  'base64',
)

let sql: Sql

test.beforeAll(async () => {
  const passwordHash = await hashPassword(password)
  sql = postgres(databaseUrl, { max: 1 })
  const now = new Date()
  const creditAccountId = `credit_${userId}`
  await sql.begin(async transaction => {
    await transaction`
      insert into users (
        id, email, password_hash, email_verified_at, display_name, role,
        created_by, updated_by, created_at, updated_at
      )
      values (
        ${userId}, ${email}, ${passwordHash}, ${now},
        ${'Asset Loop 验收用户'}, ${'user'}, ${'e2e'}, ${'e2e'}, ${now}, ${now}
      )
    `
    await transaction`
      insert into credit_accounts (
        id, user_id, available_cents, reserved_cents, created_at, updated_at
      )
      values (${creditAccountId}, ${userId}, ${10_000}, ${0}, ${now}, ${now})
    `
    await transaction`
      insert into credit_ledger_entries (
        id, account_id, user_id, kind, available_delta_cents, reserved_delta_cents,
        available_balance_cents, reserved_balance_cents, idempotency_key, reason,
        actor_user_id, created_at
      )
      values (
        ${`ledger_${userId}`}, ${creditAccountId}, ${userId}, ${'grant'},
        ${10_000}, ${0}, ${10_000}, ${0}, ${`e2e-seed-${userId}`},
        ${'Asset loop acceptance seed'}, ${userId}, ${now}
      )
    `
  })
})

test.afterAll(async () => {
  await sql.begin(async transaction => {
    // task_records 无外键，必须显式删；generation_input_assets.asset_id 是
    // RESTRICT 外键，须在删用户/资产前先清掉，其余表随 users 级联。
    await transaction`
      delete from task_records
      where user_id = ${userId}
         or record_id in (
           select id from generation_records where user_id = ${userId}
         )
    `
    await transaction`
      delete from generation_input_assets
      where generation_id in (
        select id from generation_records where user_id = ${userId}
      )
    `
    await transaction`delete from audit_logs where user_id = ${userId}`
    await transaction`delete from users where id = ${userId} and email = ${email}`
  })
  await sql.end({ timeout: 5 })
})

test('asset closed loop: upload → reference in generation → succeeded artifact becomes library asset → logout protects', async ({ request }) => {
  // 1. 登录已验证的 seeded 用户
  const login = await request.post(`${apiOrigin}/api/auth/login`, {
    data: { email, password },
  })
  expect(login.ok()).toBe(true)

  // 2. 通过真实上传端点落地一张图片资产
  const upload = await request.post(`${apiOrigin}/api/assets/upload`, {
    multipart: {
      file: { name: 'asset-loop.png', mimeType: 'image/png', buffer: imageBytes },
      kind: 'image',
    },
  })
  expect(upload.ok()).toBe(true)
  const uploadedBody = await upload.json() as {
    data: { asset: { id: string; kind: string; source: string } }
  }
  const uploadedAssetId = uploadedBody.data.asset.id
  expect(uploadedAssetId).toMatch(/^asset_/)
  expect(uploadedBody.data.asset).toMatchObject({ kind: 'image', source: 'upload' })

  // 3. 用 assetRefs 引用该资产创建一次生成（媒体参数只进 assetRefs，不残留 params）
  const create = await request.post(`${apiOrigin}/api/generations`, {
    data: {
      modelId: 'qwen-image-edit',
      params: { prompt: '把参考图改成蓝色海报' },
      assetRefs: { image: [uploadedAssetId] },
    },
  })
  expect(create.ok()).toBe(true)
  const createdBody = await create.json() as {
    data: {
      record: {
        id: string
        inputParams: Record<string, unknown>
        assetRefs: Record<string, string[]>
      }
    }
  }
  const generationId = createdBody.data.record.id
  expect(generationId).toMatch(/^generation_|^gen_/)
  expect(createdBody.data.record.assetRefs.image).toEqual([uploadedAssetId])
  expect(createdBody.data.record.inputParams).not.toHaveProperty('image')

  // 4. e2e 不启 worker：直接把该次生成 seed 成 succeeded + 产物 + 生成资产
  const now = new Date()
  const artifactId = `artifact_${generationId}`
  const generatedAssetId = `asset_${generationId}`
  await sql.begin(async transaction => {
    await transaction`
      update generation_records
      set status = 'succeeded', status_reason = null,
          output_result_json = ${sql.json({ kind: 'images-from-message-content', note: 'e2e seeded success' })},
          cost_final = 30,
          updated_at = ${now}
      where id = ${generationId}
    `
    await transaction`
      insert into generation_artifacts (
        id, record_id, user_id, kind, mime_type, storage_provider, storage_key,
        status, created_by, updated_by, created_at, updated_at
      )
      values (
        ${artifactId}, ${generationId}, ${userId}, ${'image'}, ${'image/png'},
        ${'local'}, ${'generations/asset-loop/result.png'}, ${'stored'},
        ${'e2e'}, ${'e2e'}, ${now}, ${now}
      )
    `
    await transaction`
      insert into user_assets (
        id, user_id, kind, source, generation_artifact_id, record_id, model_id,
        file_name, mime_type, storage_provider, storage_key, status,
        created_by, updated_by, created_at, updated_at
      )
      values (
        ${generatedAssetId}, ${userId}, ${'image'}, ${'generation'}, ${artifactId},
        ${generationId}, ${'qwen-image-edit'}, ${'result.png'}, ${'image/png'},
        ${'local'}, ${'generations/asset-loop/result.png'}, ${'ready'},
        ${'e2e'}, ${'e2e'}, ${now}, ${now}
      )
    `
    await transaction`
      update task_records
      set status = 'succeeded',
          output_json = ${sql.json({ ok: true })},
          completed_at = ${now}, updated_at = ${now}
      where record_id = ${generationId}
    `
  })

  // 5. 详情读到 seed 后的 succeeded 状态，且 assetRefs 契约保持稳定
  const detail = await request.get(`${apiOrigin}/api/generations/${generationId}`)
  expect(detail.ok()).toBe(true)
  const detailBody = await detail.json() as {
    data: { id: string; status: string; assetRefs: Record<string, string[]> }
  }
  expect(detailBody.data.id).toBe(generationId)
  expect(detailBody.data.status).toBe('succeeded')
  expect(detailBody.data.assetRefs.image).toEqual([uploadedAssetId])

  // 6. 产物可列出，且解析出可读 URL
  const artifacts = await request.get(`${apiOrigin}/api/generations/${generationId}/artifacts`)
  expect(artifacts.ok()).toBe(true)
  const artifactsBody = await artifacts.json() as {
    data: { items: Array<{ id: string; kind: string; readUrl?: string }> }
  }
  expect(artifactsBody.data.items[0]).toMatchObject({ id: artifactId, kind: 'image' })
  expect(artifactsBody.data.items[0]?.readUrl).toBeTruthy()

  // 7. 生成资产与上传资产同时进入资产库（source 区分）
  const assets = await request.get(`${apiOrigin}/api/assets`)
  expect(assets.ok()).toBe(true)
  const assetsBody = await assets.json() as {
    data: { items: Array<{ id: string; kind: string; source: string }> }
  }
  const generatedAsset = assetsBody.data.items.find(item => item.id === generatedAssetId)
  expect(generatedAsset).toMatchObject({ kind: 'image', source: 'generation' })
  const uploadedAsset = assetsBody.data.items.find(item => item.id === uploadedAssetId)
  expect(uploadedAsset).toMatchObject({ kind: 'image', source: 'upload' })

  // 8. 登出后私密端点全部拒绝
  await request.post(`${apiOrigin}/api/auth/logout`)
  expect((await request.get(`${apiOrigin}/api/assets`)).status()).toBe(401)
  expect((await request.get(`${apiOrigin}/api/generations/${generationId}`)).status()).toBe(401)
})
