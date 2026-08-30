/**
 * 运行隔离的浏览器验收。
 *
 * 从 deploy/env/.env.test 读取 PostgreSQL 连接信息，在同一个 PostgreSQL
 * 实例中创建本次运行独享的临时数据库，按提交的 migration 链初始化后再
 * 启动 Playwright。无论测试成功或失败，最后都会删除临时数据库，避免 E2E
 * 修改共享测试库的台账或数据，也避免开发 API 误读 E2E 数据。
 */

import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createIsolatedTestDb } from '../../packages/db/src/test-utils'

const repositoryRoot = resolve(import.meta.dirname, '../..')
const testEnvFile = resolve(repositoryRoot, 'deploy/env/.env.test')
if (existsSync(testEnvFile)) loadEnvFile(testEnvFile)

const playwrightCli = resolve(repositoryRoot, 'scripts/verify/playwright-cli.cjs')
const reuseExistingServer = process.env.E2E_REUSE_EXISTING_SERVER === 'true'

const baseDatabaseUrl = process.env.DATABASE_URL?.trim()
if (baseDatabaseUrl === undefined || baseDatabaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required. Configure deploy/env/.env.test before running E2E.')
}

assertLoopbackTestDatabase(baseDatabaseUrl)
const isolatedDb = reuseExistingServer ? undefined : await createIsolatedTestDb()
try {
  const exitCode = await run(process.execPath, [playwrightCli, 'test', '--config=playwright.config.ts', ...process.argv.slice(2)], {
    ...process.env,
    ...(isolatedDb === undefined ? {} : { DATABASE_URL: isolatedDb.url }),
  })
  process.exitCode = exitCode
} finally {
  if (isolatedDb !== undefined) await isolatedDb.close()
}

function assertLoopbackTestDatabase(databaseUrl: string): void {
  let parsed: URL
  try {
    parsed = new URL(databaseUrl)
  } catch {
    throw new Error('E2E DATABASE_URL must be an absolute PostgreSQL URL')
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(parsed.hostname.toLowerCase())) {
    throw new Error('E2E refuses a non-loopback DATABASE_URL; use deploy/env/.env.test with a local test database')
  }
  if (!/(test|e2e)/i.test(parsed.pathname)) {
    throw new Error('E2E refuses a database URL without a test/e2e database name')
  }
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv): Promise<number> {
  return new Promise((resolveExit, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    })

    child.once('error', reject)
    child.once('exit', (code, signal) => {
      resolveExit(signal === null ? (code ?? 1) : 1)
    })
  })
}
