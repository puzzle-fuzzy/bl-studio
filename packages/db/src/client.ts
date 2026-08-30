/**
 * Postgres + Drizzle 连接工厂。
 *
 * 这是 @bailian-studio/db 在运行时对外暴露的入口：所有需要直连数据库的代码
 * （@bailian-studio/generation-repository、@bailian-studio/auth，以及它们各自的
 * `create…FromUrl(url)` 工厂）最终都通过 createDb 拿到一个装配好 schema 的
 * Drizzle 实例。服务层（apps/api、apps/worker）受 package 边界规则
 * 限制不得直接 import @bailian-studio/db，因此实际调用点位于各 repository/auth 包
 * 内部，服务消费这些包暴露的工厂。
 *
 * 底层连接由 postgres-js 提供；Drizzle 在其上注入本包 schema.ts 中定义的
 * 表关系，使查询构建器具备完整的表/列类型推断。
 */

import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema'

/**
 * 本包对外暴露的 Drizzle 实例类型。ReturnType<typeof createDb> 会让 TS 自动
 * 推断出 Drizzle + schema 的最终类型，调用方（如 repository）据此得到表关系
 * 的强类型支持，无需手动维护类型定义。
 */
export type BailianStudioDb = ReturnType<typeof createDb>
export type BailianStudioDbTransaction = Parameters<Parameters<BailianStudioDb['transaction']>[0]>[0]

export interface CreateDbOptions {
  /** Postgres 连接串，形如 `postgres://user:pass@host:port/db`。 */
  url: string
  /** 连接池上限，默认 5；一个进程应在组合根创建一次并由所有 repository 复用。 */
  max?: number
}

/**
 * 创建一个 Drizzle 实例并附带 close() 方法。
 *
 * `Object.assign(db, { close })` 把 postgres-js 的 `client.end()` 挂到 Drizzle
 * 实例上，调用方（尤其是测试与 worker 优雅停机）即可通过同一个对象关闭底层
 * 连接池，而不必再持有原始 client 引用。
 *
 * @param options.url  Postgres 连接串
 * @param options.max  连接池上限（默认 5）；通常由进程组合根统一设置
 */
export function createDb(options: CreateDbOptions) {
  const client = postgres(options.url, { max: options.max ?? 5 })
  const db = drizzle(client, { schema })

  return Object.assign(db, {
    close: () => client.end(),
  })
}
