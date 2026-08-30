import { createDb, type BailianStudioDb } from '@bailian-studio/db'
import { createIsolatedTestDb, type IsolatedTestDb } from '@bailian-studio/db/test'
import { createAuthService, type AuthService, type AuthServiceOptions } from './service'

/**
 * AuthService 的 URL 工厂。
 *
 * URL 工厂适合独立运行或测试场景：services（api/worker）受边界规则限制，不能直接
 * import @bailian-studio/db 来建库连接。多模块进程的组合根应创建一个共享数据库句柄，
 * 然后直接调用 createAuthService({ db, ... })，避免每个 service 各自拥有连接池。
 */

export type CreateAuthServiceFromUrlOptions = Omit<AuthServiceOptions, 'db'> & {
  /** 数据库连接池上限；默认 5。 */
  max?: number
}

/** 由 URL 工厂创建的句柄：组装好的 AuthService + 库句柄 + 关闭函数。 */
export interface AuthServiceHandle {
  authService: AuthService
  db: BailianStudioDb
  close(): Promise<void>
}

/**
 * 用一个数据库 URL 构造独立的 AuthService（内部建库连接 + 组装 service）。
 * 返回的 handle.close() 用于关闭连接池；如果进程还需要其它持久化模块，优先在
 * 组合根复用已有 db 并调用 createAuthService，避免把本句柄当成共享池的 owner。
 */
export function createAuthServiceFromUrl(
  url: string,
  options: CreateAuthServiceFromUrlOptions,
): AuthServiceHandle {
  const { max = 5, ...authOptions } = options
  const db = createDb({ url, max })
  return {
    db,
    authService: createAuthService({ db, ...authOptions }),
    close: () => db.close(),
  }
}

/**
 * 基于一次性隔离数据库的 AuthService，专供服务级测试（如 api 包）使用——
 * 这些测试同样受边界规则限制、不能直接 import @bailian-studio/db，且需要完全隔离、
 * 用完即弃的数据库实例。
 */
export interface IsolatedAuthService {
  authService: AuthService
  databaseUrl: string
  close(): Promise<void>
}

/**
 * 创建一个用临时隔离数据库支撑的 AuthService，用于服务级测试。
 * 内部先用 createIsolatedTestDb() 建临时库，再走 createAuthServiceFromUrl 接线；
 * close() 会同时关闭连接池与临时库。
 */
export async function createIsolatedAuthService(
  options: CreateAuthServiceFromUrlOptions,
): Promise<IsolatedAuthService> {
  const testDb: IsolatedTestDb = await createIsolatedTestDb()
  const handle = createAuthServiceFromUrl(testDb.url, options)
  return {
    authService: handle.authService,
    databaseUrl: testDb.url,
    async close() {
      await handle.close()
      await testDb.close()
    },
  }
}
