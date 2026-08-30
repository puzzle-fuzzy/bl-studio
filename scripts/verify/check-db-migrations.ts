/**
 * P0-06 门禁：schema.ts ↔ 迁移链对账（进 `bun run verify`）。
 *
 * drizzle-kit generate 会离线对比 schema.ts 与最新 migration snapshot：
 *  - 无变更 → 不写任何文件，packages/db/drizzle 保持干净 → 通过；
 *  - 有变更 → 生成新迁移 + 更新 _journal.json → git 状态变脏 → 门禁失败。
 *
 * 判定的是「已提交的 schema + 已提交的迁移」是否一致。本地建议 commit 后跑；
 * CI 在全新 checkout 上跑，避免未提交的迁移被本地状态掩盖，也避免
 * `drizzle-kit push`（按 schema 现算 diff）掩盖了生产 `migrate`（只认已提交迁移）的漂移。
 *
 * 漂移时修复：`bunx drizzle-kit generate --config packages/db/drizzle.config.ts`，
 * 并把生成的迁移与 schema.ts 改动一并提交。已命名 CHECK（如 audit_logs_action_check）
 * 的表达式变更 drizzle 检测不到，仍按仓库约定手工 DROP/ADD 进迁移。
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

function fail(message: string): never {
  console.error(`\n✗ ${message}`)
  process.exit(1)
}

console.log('==> 运行 drizzle-kit generate（离线对比 schema.ts 与最新迁移 snapshot）')
// 经 `bun x` 走 bun 的 bin 解析（.bin/drizzle-kit 是 shell shim，不能直接 node 执行）。
const generate = spawnSync(
  'bun',
  ['x', 'drizzle-kit', 'generate', '--config', 'packages/db/drizzle.config.ts'],
  { cwd: repoRoot, stdio: 'inherit' },
)
if (generate.status !== 0) {
  fail(`drizzle-kit generate 失败（exit ${generate.status ?? 'signal'}）`)
}

const status = spawnSync(
  'git',
  ['status', '--porcelain', '--', 'packages/db/drizzle'],
  { cwd: repoRoot, encoding: 'utf8' },
)
if (status.status !== 0) {
  fail('无法读取 git status（check-db-migrations 需在 git 仓库内运行）')
}

const dirty = status.stdout.trim()
if (dirty !== '') {
  console.error(dirty)
  fail(
      'schema.ts 与迁移链漂移：packages/db/drizzle 有未提交的变更。先执行\n' +
      '  bunx drizzle-kit generate --config packages/db/drizzle.config.ts\n' +
      '并把生成的迁移文件与 schema.ts 改动一并提交。',
  )
}

console.log('==> ✓ schema.ts 与迁移链一致（generate 无输出）')
