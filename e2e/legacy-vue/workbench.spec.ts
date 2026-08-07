import { expect, test, type Page } from '@playwright/test'

test('注册后进入创作、提交 queued 任务并打开详情', async ({ page }) => {
  await registerTestUser(page)
  await expect(page.getByRole('region', { name: '创作工作台' })).toBeVisible()

  const prompt = page.getByRole('textbox', { name: '提示词 *' })
  await expect(prompt).toBeVisible()
  await prompt.fill('一盏放在木桌上的暖色台灯，安静的工作室氛围')

  const createResponsePromise = page.waitForResponse(response => (
    response.request().method() === 'POST'
      && response.url() === 'http://127.0.0.1:5003/api/generations'
  ))
  await page.getByRole('button', { name: '生成', exact: true }).click()
  const createResponse = await createResponsePromise
  expect(createResponse.ok()).toBe(true)

  const envelope = await createResponse.json() as {
    data?: { record?: { id?: string } }
  }
  const recordId = envelope.data?.record?.id
  expect(recordId).toMatch(/^gen_/)

  await expect(page.getByText(recordId!, { exact: true })).toBeVisible()
  await page.getByRole('link', { name: '查看详情' }).first().click()
  await expect(page).toHaveURL(new RegExp(`/generations/${recordId}$`))
  await expect(page.getByText('运行信息')).toBeVisible()
  await expect(page.getByText('提交中')).toBeVisible()
})

test('公开分享页面能展示只读结果投影', async ({ page }) => {
  const now = new Date().toISOString()
  await page.route('**/api/shares/generations/share_e2e', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          share: {
            id: 'share_e2e',
            recordId: 'gen_e2e_shared',
            createdAt: now,
            updatedAt: now,
          },
          record: {
            id: 'gen_e2e_shared',
            modelId: 'qwen-image',
            provider: 'dashscope',
            providerModel: 'qwen-image',
            category: 'image',
            status: 'succeeded',
            createdAt: now,
            updatedAt: now,
          },
          artifacts: [],
        },
      }),
    })
  })

  await page.goto('/share/generations/share_e2e')
  await expect(page.getByText('公开分享')).toBeVisible()
  await expect(page.getByText('Qwen Image', { exact: true })).toBeVisible()
  await expect(page.getByText('分享创建者未公开输入参数。')).toBeVisible()
})

test('登录表单支持键盘导航并保持可访问标签', async ({ page }) => {
  await page.goto('/login')

  const email = page.getByLabel('邮箱')
  const password = page.getByLabel('密码（至少 8 位）')
  const loginButton = page.getByRole('button', { name: '进入工作台', exact: true })
  const registerLink = page.getByRole('button', { name: '去注册', exact: true })

  await email.focus()
  await expect(email).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(password).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(loginButton).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(registerLink).toBeFocused()
})

test('资产库使用服务端视频缩略图并为无缩略图的视频保留可见封面媒体', async ({ page }) => {
  await registerTestUser(page)

  await page.route('**/api/assets*', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          items: [
            {
              id: 'asset_e2e_image',
              kind: 'image',
              source: 'upload',
              url: 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%222%22%20height=%222%22%3E%3C/svg%3E',
              fileName: 'cover.png',
              createdAt: new Date().toISOString(),
            },
            {
              id: 'asset_e2e_video',
              kind: 'video',
              source: 'upload',
              url: 'https://oss-cn-hangzhou.aliyuncs.com/bailian-studio/clip.mp4?Signature=test',
              thumbnailUrl: 'https://oss-cn-hangzhou.aliyuncs.com/bailian-studio/clip.mp4?x-oss-process=video%2Fsnapshot%2Ct_1000%2Cf_jpg%2Cw_400%2Cm_fast&Signature=test',
              fileName: 'clip.mp4',
              createdAt: new Date().toISOString(),
            },
            {
              id: 'asset_e2e_external_video',
              kind: 'video',
              source: 'link',
              url: 'https://cdn.example.test/video.mp4',
              fileName: 'external-clip.mp4',
              createdAt: new Date().toISOString(),
            },
          ],
        },
      }),
    })
  })

  await page.goto('/library')
  await expect(page.getByText('我的资产')).toBeVisible()
  await expect(page.locator('img[src^="data:image/svg+xml"]')).toHaveCount(1)
  await expect(page.locator('img[src="https://oss-cn-hangzhou.aliyuncs.com/bailian-studio/clip.mp4?x-oss-process=video%2Fsnapshot%2Ct_1000%2Cf_jpg%2Cw_400%2Cm_fast&Signature=test"]')).toHaveCount(1)
  await expect(page.locator('video[src="https://cdn.example.test/video.mp4"]')).toHaveCount(1)
  await expect(page.locator('video[src="https://cdn.example.test/video.mp4"]')).toHaveAttribute('preload', 'metadata')
})

test('失败任务详情能展示可行动错误并提供重跑入口', async ({ page }) => {
  await registerTestUser(page)

  const now = new Date().toISOString()
  await page.route('**/api/generations/gen_e2e_failed', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          id: 'gen_e2e_failed',
          userId: 'user_e2e',
          modelId: 'qwen-image',
          provider: 'dashscope',
          providerModel: 'qwen-image',
          category: 'image',
          inputParams: { prompt: '失败 smoke fixture' },
          status: 'failed',
          statusReason: '模型服务请求失败',
          errorJson: {
            code: 'PROVIDER_RATE_LIMIT',
            category: 'rate_limit',
            message: 'rate limit',
            retriable: true,
          },
          costEstimate: 0,
          providerCancelStatus: 'not_requested',
          createdAt: now,
          updatedAt: now,
        },
      }),
    })
  })
  await page.route('**/api/generations/gen_e2e_failed/artifacts', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { items: [] } }),
    })
  })
  await page.route('**/api/generations/gen_e2e_failed/diagnostics', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          generationId: 'gen_e2e_failed',
          traceId: 'trace_e2e_failed',
          tasks: [],
          providerRequests: [],
        },
      }),
    })
  })
  await page.route('**/api/generations/gen_e2e_failed/share', async route => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({
        success: false,
        error: { code: 'GENERATION_SHARE_NOT_FOUND', message: 'not found' },
      }),
    })
  })

  await page.goto('/generations/gen_e2e_failed')
  await expect(page.getByText('已失败')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('模型服务请求过于频繁，系统会稍后重试。')
  await expect(page.getByText('可重试')).toBeVisible()
  await expect(page.getByRole('button', { name: '重跑此任务' })).toBeVisible()
})

async function registerTestUser(page: Page): Promise<void> {
  const email = `e2e-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`
  const password = 'e2e-password-123'

  await page.goto('/login')
  await page.getByLabel('邮箱').fill(email)
  await page.getByLabel('密码（至少 8 位）').fill(password)
  await page.getByRole('button', { name: '进入工作台', exact: true }).click()

  // 新账号预期会先登录失败一次，随后同一表单切换到注册流程。
  // 这样 smoke 走的是真实用户流程，而不是手动注入 session cookie。
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: '去注册', exact: true }).click()
  await page.getByRole('button', { name: '创建并进入工作台', exact: true }).click()
  await expect(page).toHaveURL(/\/create(?:\?.*)?$/)
}
