/**
 * 测试期数据库辅助工具。
 *
 * 提供两类能力：
 *  1. 共享测试库（bailian-studio_test）的快速重置 —— resetBailianStudioTestDb 一次性
 *     TRUNCATE 所有业务表，适合单测之间的隔离。
 *  2. 每个测试文件独享一个物理隔离库 —— createIsolatedTestDb 在 setup 阶段
 *     建一个全新 DB 并应用全部 migration，teardown 时 DROP。这种按 DB 隔离
 *     的方式彻底消除了旧"共享库 + TRUNCATE"方案在并发场景下的死锁问题
 *     （concurrent TRUNCATE 与 INSERT 会相互阻塞）。
 *
 * 这些工具仅用于测试环境，dev 库（bailian-studio_dev）不走这里。
 */

import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import type { BailianStudioDb } from './client'

/**
 * 读取并校验 DATABASE_URL 环境变量。
 *
 * 缺失时抛错并附上提示（启动测试 DB、参考 deploy/env/.env.example），避免后续
 * 在连接阶段才以含糊的错误暴露出来——早失败更易定位。
 */
export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL
  if (!url) {
  throw new Error('DATABASE_URL is required. Run `bun run db:test:up` and configure deploy/env/.env.test.')
  }
  return url
}

/**
 * 重置共享测试库：按外键安全顺序 TRUNCATE 所有业务表并重置自增列。
 *
 * 表顺序无关紧要，因为用了 `CASCADE`；`RESTART IDENTITY` 把序列清零，
 * 保证多次测试运行间 id 空间一致。仅用于共享测试库（bailian-studio_test）的
 * "刷新"场景，独占库（createIsolatedTestDb）不需要 TRUNCATE。
 */
export async function resetBailianStudioTestDb(db: BailianStudioDb): Promise<void> {
  await db.execute(sql`truncate table audit_logs, worker_heartbeats, generation_shares, sessions, generation_artifacts, provider_request_audits, usage_records, task_records, generation_records, users restart identity cascade`)
}

/**
 * 一个测试文件独占的临时数据库。
 *
 * 每个文件拿到自己的物理 DB，并行测试之间永远不争锁——这正是从旧的"共享
 * 库 + TRUNCATE"切换到隔离 DB 的动机：旧方案在并发 TRUNCATE 与 INSERT
 * 冲突时会死锁。
 */
export interface IsolatedTestDb {
  /** 独占库的连接串，测试代码用它构造 Drizzle 实例。 */
  url: string
  /**
   * 删除这个临时库。必须在所有到该库的连接关闭之后调用，否则 DROP 会被
   * 阻塞（Postgres 不允许删除存在活跃连接的库）。
   */
  close(): Promise<void>
}

/**
 * 创建一个全新的、与本次调用绑定的物理数据库，并应用完整 schema。
 *
 * 实现要点：
 *  - 库名用 UUID 派生（`bailian-studio_iso_<uuid>`），保证全局唯一、无碰撞；
 *  - 通过连接到 `postgres` 维护库（admin 连接）执行 `CREATE DATABASE`；
 *  - 然后切换到新库连接，串行执行 drizzle migration 把 schema 铺上去。
 *
 * 为什么按 DB 隔离而不是按 schema 隔离？drizzle 生成的 migration 中硬编码
 * 了 `public.` 前缀的外键引用，schema 级隔离会让这些 FK 跨 schema 失效，
 * 所以只能走 DB 级隔离。
 */
export async function createIsolatedTestDb(): Promise<IsolatedTestDb> {
  const baseUrl = requireDatabaseUrl()
  const dbName = `bailian-studio_iso_${randomUUID().replace(/-/g, '_')}`

  const adminUrl = new URL(baseUrl)
  adminUrl.pathname = '/postgres'

  const adminClient = postgres(adminUrl.toString(), { max: 1 })
  try {
    await adminClient.unsafe(`CREATE DATABASE "${dbName}"`)
  } finally {
    await adminClient.end()
  }

  const dbUrl = new URL(baseUrl)
  dbUrl.pathname = `/${dbName}`
  await applyMigrations(dbUrl.toString())

  return {
    url: dbUrl.toString(),
    async close() {
      const dropClient = postgres(adminUrl.toString(), { max: 1 })
      try {
        await dropClient.unsafe(`DROP DATABASE IF EXISTS "${dbName}"`)
      } finally {
        await dropClient.end()
      }
    },
  }
}

/**
 * 顺序应用 packages/db/drizzle 下的全部 migration。
 *
 * drizzle 的多语句 migration 用 `--> statement-breakpoint` 标记切分点；
 * Postgres 的简单查询协议不支持一条 query 里跑多条 DDL（除非显式开启多语句），
 * 因此这里按切分点拆成单条语句逐条执行，确保 CREATE TABLE / CREATE INDEX
 * /ALTER 等不会互相干扰。文件按文件名字典序排序，对应 drizzle 的时间戳命名
 * 约定（0000_、0001_、...）从而保证先后顺序。
 */
async function applyMigrations(dbUrl: string): Promise<void> {
  const client = postgres(dbUrl, { max: 1 })
  const db = drizzle(client)
  try {
    const migrationsDir = path.join(fileURLToPath(new URL('.', import.meta.url)), '..', 'drizzle')
    const files = readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort()

    for (const file of files) {
      const content = readFileSync(path.join(migrationsDir, file), 'utf8')
      const statements = content
        .split('--> statement-breakpoint')
        .map(statement => statement.trim())
        .filter(statement => statement.length > 0)

      for (const statement of statements) {
        await db.execute(sql.raw(statement))
      }
    }
  } finally {
    await client.end()
  }
}
