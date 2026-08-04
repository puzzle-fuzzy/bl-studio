/**
 * Mark an already-provisioned current schema as covered by the checked-in
 * Drizzle migration history.
 *
 * `drizzle-kit push` does not populate `drizzle.__drizzle_migrations`. That is
 * fine for a disposable database, but it makes the next `drizzle-kit migrate`
 * try to replay 0000 against a live schema. This command is intentionally
 * conservative: it only creates the bookkeeping table, verifies that the
 * current application tables exist, then records the exact SHA-256/hash
 * timestamp pair from the repository.
 * It never changes application rows or schema tables.
 *
 * Use `pnpm run db:baseline` (dev) or set DATABASE_URL explicitly. For a fresh
 * database, use `pnpm run db:migrate` instead.
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
