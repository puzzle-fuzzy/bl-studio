import { defineConfig } from '@playwright/test'

const databaseUrl = 'postgres://bailian-studio:bailian-studio@127.0.0.1:55432/bailian-studio_test'

// 保持浏览器 smoke 测试自包含：API 使用隔离的测试数据库，
// Web 客户端通过固定 5003 端口访问 API，且不需要 provider key 或 Worker 进程，
// 因为测试在生成任务进入 queued 状态后就结束了。
const inheritedTestEnv: Record<string, string> = {
  DATABASE_URL: databaseUrl,
  AUTH_JWT_SECRET: 'e2e-only-secret-do-not-use-in-production',
  NODE_ENV: 'test',
  CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:5002',
  ERROR_LOCALE: 'zh-CN',
  GENERATION_DAILY_TASK_LIMIT: '0',
  GENERATION_DAILY_COST_LIMIT_CENTS: '0',
  API_RATE_LIMIT_ENABLED: 'true',
  VITE_API_ORIGIN: 'http://127.0.0.1:5003',
  VITE_WEB_ORIGIN: 'http://127.0.0.1:5002',
}

for (const [key, value] of Object.entries(inheritedTestEnv)) {
  process.env[key] ??= value
}

export default defineConfig({
  testDir: 'tests/e2e',
  // Vue 时代遗留的浏览器 spec 已随 React 重写而失效（无 data-testid、路由/文案全变），
  // 归档到 legacy-vue/ 保留历史价值；资产闭环由 asset-loop.spec.ts（纯 API 驱动）覆盖。
  testIgnore: 'legacy-vue/**',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: process.env.CI === 'true' ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5002',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'bun apps/api/src/index.ts',
      url: 'http://127.0.0.1:5003/api/health/live',
      reuseExistingServer: process.env.CI !== 'true',
      timeout: 120_000,
    },
    {
      command: 'bun run --cwd apps/web dev --host 127.0.0.1',
      url: 'http://127.0.0.1:5002/login',
      reuseExistingServer: process.env.CI !== 'true',
      timeout: 120_000,
    },
  ],
})
