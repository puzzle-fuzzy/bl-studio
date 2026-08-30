import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'

// 本地 E2E 由统一的 deploy/env/.env.test 提供配置；CI 则通过 job env 注入同名变量。
// 使用 Node 原生 loader，避免为测试配置额外引入一套 dotenv 读取路径。
const testEnvFile = resolve(process.cwd(), 'deploy/env/.env.test')
if (existsSync(testEnvFile)) process.loadEnvFile(testEnvFile)

function resolveOrigin(value: string | undefined, fallbackPort: number): string {
  const origin = value?.trim()
  return origin === undefined || origin.length === 0
    ? `http://127.0.0.1:${String(fallbackPort)}`
    : origin.replace(/\/$/, '')
}

function portFromOrigin(origin: string): string {
  const parsed = new URL(origin)
  return parsed.port || (parsed.protocol === 'https:' ? '443' : '80')
}

const databaseUrl = process.env.DATABASE_URL
  ?? 'postgres://bailian-studio:bailian-studio@127.0.0.1:55432/bailian-studio_test'
// E2E 默认使用独立端口，避免误复用正在运行的开发服务和开发数据库。
// 如需接入外部 CI 编排器，可通过 origin 变量覆盖完整地址。
const apiOrigin = resolveOrigin(process.env.E2E_API_ORIGIN, 5103)
const studioOrigin = resolveOrigin(process.env.E2E_WEB_ORIGIN, 5102)
const canvasOrigin = resolveOrigin(process.env.E2E_CANVAS_ORIGIN, 5107)
const apiPort = portFromOrigin(apiOrigin)

// 保持浏览器 smoke 测试自包含：API 使用隔离的测试数据库，
// Web/Canvas 客户端通过独立测试端口访问 API，且不需要 provider key 或 Worker 进程，
// 因为测试在生成任务进入 queued 状态后就结束了。
const inheritedTestEnv: Record<string, string> = {
  API_HOST: '127.0.0.1',
  API_PORT: apiPort,
  DATABASE_URL: databaseUrl,
  AUTH_JWT_SECRET: process.env.AUTH_JWT_SECRET ?? 'e2e-only-secret-do-not-use-in-production',
  NODE_ENV: 'test',
  AUTH_PUBLIC_WEB_ORIGIN: studioOrigin,
  CORS_ALLOWED_ORIGINS: `${studioOrigin},${canvasOrigin}`,
  ERROR_LOCALE: process.env.ERROR_LOCALE ?? 'zh-CN',
  GENERATION_DAILY_TASK_LIMIT: process.env.GENERATION_DAILY_TASK_LIMIT ?? '0',
  GENERATION_DAILY_COST_LIMIT_CENTS: process.env.GENERATION_DAILY_COST_LIMIT_CENTS ?? '0',
  API_RATE_LIMIT_ENABLED: process.env.API_RATE_LIMIT_ENABLED ?? 'true',
  VITE_API_ORIGIN: apiOrigin,
  VITE_WEB_ORIGIN: studioOrigin,
}

for (const [key, value] of Object.entries(inheritedTestEnv)) {
  process.env[key] ??= value
}
process.env.E2E_API_ORIGIN ??= apiOrigin
process.env.E2E_WEB_ORIGIN ??= studioOrigin
process.env.E2E_CANVAS_ORIGIN ??= canvasOrigin

const inheritedProcessEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
)
const webServerEnv = { ...inheritedProcessEnv, ...inheritedTestEnv }
const reuseExistingServer = process.env.E2E_REUSE_EXISTING_SERVER === 'true'

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
    baseURL: studioOrigin,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'bun apps/api/src/index.ts',
      url: `${apiOrigin}/api/health/live`,
      env: webServerEnv,
      reuseExistingServer,
      timeout: 120_000,
    },
    {
      command: `bun run --cwd apps/studio dev --host 127.0.0.1 --port ${portFromOrigin(studioOrigin)}`,
      url: `${studioOrigin}/login`,
      env: webServerEnv,
      reuseExistingServer,
      timeout: 120_000,
    },
    {
      command: `bun run --cwd apps/canvas dev --host 127.0.0.1 --port ${portFromOrigin(canvasOrigin)}`,
      url: `${canvasOrigin}/canvas/login`,
      env: webServerEnv,
      reuseExistingServer,
      timeout: 120_000,
    },
  ],
})
