import { defineConfig } from '@playwright/test'

const databaseUrl = 'postgres://bailian-studio:bailian-studio@127.0.0.1:55432/bailian-studio_test'

// Keep the browser smoke self-contained: the API uses the isolated test DB,
// the Web client talks to the API on the fixed 5003 port, and no provider key
// or Worker process is needed because the test stops at a queued generation.
const inheritedTestEnv: Record<string, string> = {
  DATABASE_URL: databaseUrl,
  AUTH_JWT_SECRET: 'e2e-only-secret-do-not-use-in-production',
  NODE_ENV: 'test',
  CORS_ALLOWED_ORIGINS: 'http://127.0.0.1:5002',
  BAILIAN_CONTRACT_LOCALE: 'zh-CN',
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
  testDir: '.',
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
      command: 'bun --cwd .. apps/api/src/index.ts',
      url: 'http://127.0.0.1:5003/api/health/live',
      reuseExistingServer: process.env.CI !== 'true',
      timeout: 120_000,
    },
    {
      command: 'bun run --cwd ../apps/web dev --host 127.0.0.1',
      url: 'http://127.0.0.1:5002/login',
      reuseExistingServer: process.env.CI !== 'true',
      timeout: 120_000,
    },
  ],
})
