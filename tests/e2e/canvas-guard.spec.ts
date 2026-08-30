import { expect, test } from '@playwright/test'

const studioOrigin = process.env.E2E_WEB_ORIGIN ?? 'http://127.0.0.1:5102'
const canvasOrigin = process.env.E2E_CANVAS_ORIGIN ?? 'http://127.0.0.1:5107'

test('Canvas protected route redirects to its scoped login page', async ({ page }) => {
  await page.goto(`${canvasOrigin}/canvas/`)

  await expect(page).toHaveURL(`${canvasOrigin}/canvas/login?cb=%2Fcanvas`)
  await expect(page.getByRole('main')).toContainText('账户访问')
  await expect(page.getByRole('textbox', { name: '邮箱地址' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '密码' })).toBeVisible()
  await expect(page.getByRole('button', { name: '登录工作台' })).toBeVisible()
})

test('Studio and Canvas login pages remain usable at mobile width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

  for (const url of [`${studioOrigin}/login`, `${canvasOrigin}/canvas/login`]) {
    await page.goto(url)
    await expect(page.getByRole('main')).toContainText('账户访问')
    await expect(page.getByRole('textbox', { name: '邮箱地址' })).toBeVisible()
    await expect(page.getByRole('textbox', { name: '密码' })).toBeVisible()

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }))
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1)
  }
})
