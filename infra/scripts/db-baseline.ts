/**
 * 将已就绪的当前 schema 标记为已纳入已入库的 Drizzle 迁移历史。
 *
 * `drizzle-kit push` 不会填充 `drizzle.__drizzle_migrations`。对一次性数据库这没问题，
 * 但会导致下一次 `drizzle-kit migrate` 试图对现有 schema 重放 0000。
 * 本命令刻意保持保守：只创建台账表、校验当前应用表存在，然后按仓库记录
 * 精确的 SHA-256/hash 与时间戳配对。它绝不改动应用数据行或 schema 表。
 *
 * 开发环境使用 `pnpm run db:baseline`，或显式设置 DATABASE_URL；全新数据库请改用
 * `pnpm run db:migrate`。
 */

import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import postgres from 'postgres'

const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const migrationDir = resolve(root, 'packages/db/drizzle')
const databaseUrl = process.env['DATABASE_URL']?.trim()

if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required. Refusing to baseline an implicit database.')
}

const journal = JSON.parse(await readFile(resolve(migrationDir, 'meta/_journal.json'), 'utf8')) as {
  entries: Array<{ tag: string; when: number }>
}

const migrations = await Promise.all(
  journal.entries.map(async entry => {
    const file = resolve(migrationDir, `${entry.tag}.sql`)
    const contents = await readFile(file)
    return {
      tag: entry.tag,
      folderMillis: entry.when,
      hash: createHash('sha256').update(contents).digest('hex'),
    }
  }),
)

const sql = postgres(databaseUrl, { max: 1 })
try {
  const requiredTables = new Set([
    'users',
    'sessions',
    'generation_records',
    'generation_artifacts',
    'generation_shares',
    'provider_request_audits',
    'usage_records',
    'user_assets',
    'media_jobs',
    'task_records',
  ])

  const tables = await sql<{ table_name: string }[]>`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
  `
  const actualTables = new Set(tables.map(row => row.table_name))
  const missingTables = [...requiredTables].filter(table => !actualTables.has(table))
  if (missingTables.length > 0) {
    throw new Error(`Refusing to baseline: missing application tables: ${missingTables.join(', ')}`)
  }
  await sql`create schema if not exists drizzle`
  await sql`
    create table if not exists drizzle.__drizzle_migrations (
      id serial primary key,
      hash text not null,
      created_at bigint
    )
  `

  const existing = await sql<{ count: string }[]>`
    select count(*)::text as count from drizzle.__drizzle_migrations
  `
  if (Number(existing[0]?.count ?? 0) > 0) {
    throw new Error('Migration bookkeeping is already populated; refusing to rewrite it.')
  }

  await sql.begin(async transaction => {
    for (const migration of migrations) {
      await transaction`
        insert into drizzle.__drizzle_migrations (hash, created_at)
        values (${migration.hash}, ${migration.folderMillis})
      `
    }
  })

  console.log(`Baselined ${migrations.length} migrations for ${redactDatabaseUrl(databaseUrl)}.`)
} finally {
  await sql.end({ timeout: 5 })
}

function redactDatabaseUrl(value: string): string {
  try {
    const parsed = new URL(value)
    parsed.password = '***'
    return parsed.toString()
  } catch {
    return '<invalid database url>'
  }
}
