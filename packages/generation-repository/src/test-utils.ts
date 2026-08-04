/**
 * Repository 层的测试/服务 wiring 工具。
 *
 * 这一组工厂是包边界规则的关键一环：services 层（api / worker）被架构规则
 * 禁止直接 import `@bailian-studio/db`，因此本包对外暴露这些「只持有一个数据库 URL」
 * 的工厂，让上层 wiring 持久化时完全不触碰 db 包。测试场景下也提供一次性
 * 隔离 DB（避免并行测试文件争抢同一个共享库）以及插入测试用户的 helper。
 */
import { createDb, users, type BailianStudioDb } from '@bailian-studio/db'
import { createIsolatedTestDb, requireDatabaseUrl, resetBailianStudioTestDb, type IsolatedTestDb } from '@bailian-studio/db/test'
import { createCreditLedger } from '@bailian-studio/credit-ledger'
import {
  createGenerationRepositoryFromUrl,
  type CreateGenerationRepositoryFromUrlOptions,
  type GenerationRepositoryHandle,
} from './factory'
import type { GenerationRepository } from './repository'

/** 取得测试用的 DATABASE_URL；若缺失则抛错（避免静默走到默认值）。 */
export function requireRepositoryDatabaseUrl(): string {
  return requireDatabaseUrl()
}

export type GenerationRepositoryTestDb = GenerationRepositoryHandle

/**
 * 基于一次性隔离数据库的 repository handle。
 *
 * 用于 service 级测试（api、worker）：既不让这些测试直接 import `@bailian-studio/db`
 * （包边界规则禁止），也避免并行测试文件争抢同一个共享数据库。
 */
export interface IsolatedGenerationRepository {
  repository: GenerationRepository
  /** 共享连接池——reset/seed 时复用它，避免每个用例各自开池导致的池抖动。 */
  db: BailianStudioDb
  /** 隔离数据库的 URL，供测试间重置使用。 */
  databaseUrl: string
  close(): Promise<void>
}

export async function createIsolatedGenerationRepository(
  options: CreateGenerationRepositoryFromUrlOptions = {},
): Promise<IsolatedGenerationRepository> {
  const testDb: IsolatedTestDb = await createIsolatedTestDb()
  const handle = createGenerationRepositoryFromUrl(testDb.url, options)
  return {
    repository: handle.repository,
    db: handle.db,
    databaseUrl: testDb.url,
    async close() {
      await handle.close()
      await testDb.close()
    },
  }
}

/**
 * 重置共享测试数据库（清表）。传入已有 db 可复用其连接池（测试中推荐这么做）；
 * 省略或传 URL 则临时开一个短命池。
 *
 * 之所以提供可选的 db 参数：每次 createDb 都会新建一个 postgres 池，而在
 * bun + Windows 上，close() 之后池底层 socket 不会同步释放。如果每个
 * beforeEach 都开新池，跨多个用例就会耗尽新连接、让后续用例卡死。
 * 复用单个池即可规避该问题。
 */
export async function resetGenerationRepositoryTestDb(
  urlOrDb: string | BailianStudioDb = requireRepositoryDatabaseUrl(),
): Promise<void> {
  const db = typeof urlOrDb === 'string' ? createDb({ url: urlOrDb, max: 1 }) : urlOrDb
  const ownsPool = typeof urlOrDb === 'string'
  try {
    await resetBailianStudioTestDb(db)
  }
  finally {
    if (ownsPool) await db.close()
  }
}

/**
 * 在隔离测试库里创建测试用户的 helper。
 * 用于服务级测试中——当外键约束要求 record 必须有合法 userId 时，先插一条用户。
 * 传入已有 db 可复用其连接池（推荐），传 URL 则临时开一个短命池。
 */
export async function createTestUser(
  urlOrDb: string | BailianStudioDb,
  userId: string,
  email?: string,
): Promise<void> {
  const db = typeof urlOrDb === 'string' ? createDb({ url: urlOrDb, max: 1 }) : urlOrDb
  const ownsPool = typeof urlOrDb === 'string'
  try {
    const now = new Date()
    await db.insert(users).values({
      id: userId,
      email: email ?? `${userId}@example.com`,
      passwordHash: 'test-hash',
      createdAt: now,
      updatedAt: now,
    })
  }
  finally {
    if (ownsPool) await db.close()
  }
}

/**
 * Seed deterministic test credits through the same ledger path used by the
 * admin grant endpoint. Keeping this helper in the repository test seam lets
 * service-level integration tests fund users without importing DB tables or
 * the credit package directly from a runtime app.
 */
export async function grantTestCredits(
  urlOrDb: string | BailianStudioDb,
  userId: string,
  amountCents: number,
  reason = 'integration test seed',
): Promise<void> {
  const db = typeof urlOrDb === 'string' ? createDb({ url: urlOrDb, max: 1 }) : urlOrDb
  const ownsPool = typeof urlOrDb === 'string'
  try {
    await createCreditLedger({ db }).grant({
      userId,
      amountCents,
      reason,
      idempotencyKey: `test-credit-${userId}-${amountCents}`,
      actorUserId: userId,
    })
  }
  finally {
    if (ownsPool) await db.close()
  }
}
