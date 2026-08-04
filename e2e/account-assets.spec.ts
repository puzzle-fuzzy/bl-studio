import { rm, mkdtemp } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { join, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, test, type Page, type Response } from '@playwright/test'
import { hash as hashPassword } from '@node-rs/argon2'
import postgres from 'postgres'

const databaseUrl = 'postgres://bailian-studio:bailian-studio@127.0.0.1:55432/bailian-studio_test'
const apiOrigin = 'http://127.0.0.1:5103'
const email = `vue-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`
const userId = `user_vue_e2e_${Date.now()}_${Math.random().toString(16).slice(2)}`
const password = 'vue-e2e-password-123'
const imageBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z8V0AAAAASUVORK5CYII=',
  'base64',
)

let mediaFixtureRoot: string
let videoPath: string

interface AssetResponse {
  id: string
  kind: 'image' | 'video' | 'audio' | 'text' | 'archive'
  source: 'upload' | 'link' | 'generation' | 'derived'
  fileName?: string
  url?: string
}

function describeSpawnFailure(result: {
  status: number | null
  stderr?: string | Buffer | null
  error?: Error
}): string {
  const stderr = typeof result.stderr === 'string'
    ? result.stderr.trim()
    : result.stderr?.toString().trim() ?? ''
  return result.error?.message || stderr || `exit status ${result.status ?? 'unknown'}`
}

test.beforeAll(async () => {
  mediaFixtureRoot = await mkdtemp(join(tmpdir(), 'bailian-studio-vue-fixtures-'))
  videoPath = join(mediaFixtureRoot, 'e2e-video.mp4')
  const ffmpeg = spawnSync(
    process.env.FFMPEG_PATH?.trim() || 'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=64x64:d=0.4',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-y',
      videoPath,
    ],
    { encoding: 'utf8' },
  )
  if (ffmpeg.status !== 0) {
    throw new Error(`Unable to create the E2E video fixture: ${describeSpawnFailure(ffmpeg)}`)
  }

  const passwordHash = await hashPassword(password)

  const sql = postgres(databaseUrl, { max: 1 })
  const now = new Date()
  const creditAccountId = `credit_${userId}`
  try {
    await sql.begin(async transaction => {
      await transaction`
        insert into users (
          id, email, password_hash, email_verified_at, display_name, role,
          created_by, updated_by, created_at, updated_at
        )
        values (
          ${userId}, ${email}, ${passwordHash}, ${now},
          ${'Vue E2E 验收用户'}, ${'user'}, ${'e2e'}, ${'e2e'}, ${now}, ${now}
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
          ${'Vue browser acceptance seed'}, ${userId}, ${now}
        )
      `
    })
  } finally {
    await sql.end({ timeout: 5 })
  }
})

test.afterAll(async () => {
  const sql = postgres(databaseUrl, { max: 1 })
  try {
    await sql.begin(async transaction => {
      await transaction`
        delete from task_records
        where user_id = ${userId}
           or record_id in (
             select id from generation_records where user_id = ${userId}
           )
      `
      await transaction`delete from audit_logs where user_id = ${userId}`
      await transaction`delete from users where id = ${userId} and email = ${email}`
    })

    const [leftovers] = await sql`
      select
        (select count(*)::int from users where id = ${userId}) as users,
        (select count(*)::int from task_records where user_id = ${userId}) as tasks,
        (select count(*)::int from audit_logs where user_id = ${userId}) as audits
    `
    if (leftovers === undefined || leftovers.users !== 0 || leftovers.tasks !== 0 || leftovers.audits !== 0) {
      throw new Error(`E2E database cleanup was incomplete for ${userId}`)
    }
  } finally {
    await sql.end({ timeout: 5 })
  }

  if (mediaFixtureRoot && basename(mediaFixtureRoot).startsWith('bailian-studio-vue-fixtures-')) {
    await rm(mediaFixtureRoot, { recursive: true, force: true })
  }
  const storageRoot = process.env.E2E_STORAGE_ROOT
  if (storageRoot && basename(storageRoot).startsWith('bailian-studio-vue-e2e-')) {
    await rm(storageRoot, { recursive: true, force: true })
  }
})

test('verified account can upload, reuse, generate with, and clear private assets', async ({ page }) => {
  await page.route('https://fixture.invalid/**', route =>
    route.fulfill({ status: 200, contentType: 'image/png', body: imageBytes }),
  )

  await test.step('login a verified seeded user and preserve the protected route on refresh', async () => {
    await page.goto('/auth/login?cb=%2Fmodels%2Fqwen-image-edit')
    await page.getByLabel('邮箱').fill(email)
    await page.locator('#auth-password').fill(password)
    await page.getByRole('button', { name: /登录/ }).click()

    await expect(page).toHaveURL(/\/models\/qwen-image-edit$/)
    await expect(page.getByTestId('generation-model-picker-trigger')).toContainText('Qwen Image Edit')
    await page.reload()
    await expect(page).toHaveURL(/\/models\/qwen-image-edit$/)
    await expect(page.getByRole('link', { name: /03\s*资产/ })).toBeVisible()
  })

  let imageAsset!: AssetResponse
  let videoAsset!: AssetResponse
  let linkAsset!: AssetResponse

  await test.step('upload and preview a real image', async () => {
    await page.getByRole('link', { name: /03\s*资产/ }).click()
    await expect(page.getByRole('heading', { name: '资产中心' })).toBeVisible()

    imageAsset = await uploadAsset(page, {
      name: 'e2e-image.png',
      mimeType: 'image/png',
      buffer: imageBytes,
    })
    const drawer = page.getByRole('dialog', { name: '资产预览' })
    const image = drawer.getByRole('img', { name: 'e2e-image.png' })
    await expect(image).toBeVisible()
    await expect(image).toHaveAttribute(
      'src',
      /^http:\/\/127\.0\.0\.1:5103\/api\/artifacts\/local\//,
    )
    await drawer.getByRole('button', { name: '关闭资产预览' }).click()
  })

  await test.step('upload and preview a real video', async () => {
    videoAsset = await uploadAsset(page, videoPath)
    expect(videoAsset.kind).toBe('video')

    const drawer = page.getByRole('dialog', { name: '资产预览' })
    const video = drawer.locator('video')
    await expect(video).toBeVisible()
    await expect(video).toHaveAttribute('controls', '')
    await expect(video).toHaveAttribute(
      'src',
      /^http:\/\/127\.0\.0\.1:5103\/api\/artifacts\/local\//,
    )
    await drawer.getByRole('button', { name: '关闭资产预览' }).click()
  })

  await test.step('import an HTTP link as a formal asset', async () => {
    await page.getByRole('button', { name: '上传或导入' }).click()
    const picker = page.getByRole('dialog', { name: '选择素材' })
    await picker.getByRole('tab', { name: '粘贴链接' }).click()
    await picker.getByLabel('链接 URL').fill('https://fixture.invalid/e2e-reference.png')
    const responsePromise = page.waitForResponse(response =>
      response.url() === `${apiOrigin}/api/assets/import`
      && response.request().method() === 'POST',
    )
    await picker.getByRole('button', { name: '导入并选择' }).click()
    linkAsset = await readAsset(await responsePromise)
    expect(linkAsset).toMatchObject({ kind: 'image', source: 'link' })
    await picker.getByTestId('confirm-asset-selection').click()

    const drawer = page.getByRole('dialog', { name: '资产预览' })
    await expect(drawer.getByText('链接', { exact: true })).toBeVisible()
    await drawer.getByRole('button', { name: '关闭资产预览' }).click()
  })

  let generationId: string
  await test.step('reuse the uploaded image and persist the same stable asset reference', async () => {
    await page.goto('/models/qwen-image-edit')
    await expect(page.getByTestId('generation-model-picker-trigger')).toContainText('Qwen Image Edit')
    await page.getByTestId('parameter-image').click()
    const picker = page.getByRole('dialog', { name: '选择图片' })
    await picker.getByTestId(`pick-asset-${imageAsset.id}`).click()
    await picker.getByTestId('confirm-asset-selection').click()

    const selectedPreview = page.getByTestId(`reference-image-tile-${imageAsset.id}`)
    await expect(selectedPreview.getByRole('img', { name: 'e2e-image.png' })).toHaveAttribute(
      'src',
      /^http:\/\/127\.0\.0\.1:5103\/api\/artifacts\/local\//,
    )
    await page.getByTestId('parameter-prompt').fill('把参考图改成蓝色海报')

    const createPromise = page.waitForResponse(response =>
      response.url() === `${apiOrigin}/api/generations`
      && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: '开始生成' }).click()
    const createResponse = await createPromise
    expect(createResponse.ok()).toBe(true)
    const created = await createResponse.json() as {
      data: {
        record: {
          id: string
          inputParams: Record<string, unknown>
          assetRefs: Record<string, string[]>
        }
      }
    }
    generationId = created.data.record.id
    expect(created.data.record.assetRefs.image).toEqual([imageAsset.id])
    expect(created.data.record.inputParams).not.toHaveProperty('image')

    const detailResponse = await page.request.get(`${apiOrigin}/api/generations/${generationId}`)
    expect(detailResponse.ok()).toBe(true)
    const detail = await detailResponse.json() as {
      data: {
        inputParams: Record<string, unknown>
        assetRefs: Record<string, string[]>
      }
    }
    expect(detail.data.assetRefs.image).toEqual([imageAsset.id])
    expect(detail.data.inputParams).not.toHaveProperty('image')
  })

  await test.step('logout clears the private shell and protects direct refreshes', async () => {
    await page.getByTestId('account-menu-trigger').click()
    await page.getByRole('menuitem', { name: '退出登录' }).click()
    await expect(page).toHaveURL(/\/auth\/login\?cb=/)
    await expect(page.getByRole('link', { name: /03\s*资产/ })).toHaveCount(0)

    const privateResponse = await page.request.get(`${apiOrigin}/api/assets`)
    expect(privateResponse.status()).toBe(401)
    await page.goto('/assets')
    await expect(page).toHaveURL(url =>
      url.pathname === '/auth/login' && url.searchParams.get('cb') === '/assets',
    )
    await expect(page.getByTestId('asset-library-view')).toHaveCount(0)
  })

  expect(videoAsset.id).toMatch(/^asset_/)
  expect(linkAsset.id).toMatch(/^asset_/)
})

async function uploadAsset(
  page: Page,
  file: string | { name: string; mimeType: string; buffer: Buffer },
): Promise<AssetResponse> {
  await page.getByRole('button', { name: '上传或导入' }).click()
  const picker = page.getByRole('dialog', { name: '选择素材' })
  await expect(picker.getByRole('tab', { name: '上传', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  const responsePromise = page.waitForResponse(response =>
    response.url() === `${apiOrigin}/api/assets/upload`
    && response.request().method() === 'POST',
  )
  await picker.getByTestId('asset-upload-input').setInputFiles(file)
  const asset = await readAsset(await responsePromise)
  await picker.getByTestId('confirm-asset-selection').click()
  return asset
}

async function readAsset(response: Response): Promise<AssetResponse> {
  expect(response.ok()).toBe(true)
  const body = await response.json() as { data: { asset: AssetResponse } }
  return body.data.asset
}
