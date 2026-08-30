import { expect, test } from '@playwright/test'

const canvasOrigin = process.env.E2E_CANVAS_ORIGIN ?? 'http://127.0.0.1:5107'

test('Canvas protected route redirects to its scoped login page', async ({ page }) => {
  await page.goto(`${canvasOrigin}/canvas/`)

  await expect(page).toHaveURL(`${canvasOrigin}/canvas/login?cb=%2Fcanvas`)
  await expect(page.getByRole('main')).toContainText('账户访问')
  await expect(page.getByRole('textbox', { name: '邮箱地址' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '密码' })).toBeVisible()
  await expect(page.getByRole('button', { name: '登录工作台' })).toBeVisible()
})
