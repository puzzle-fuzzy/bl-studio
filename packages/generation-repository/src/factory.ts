/**
 * 运行时 repository 装配。
 *
 * 本模块刻意不提供测试数据库 helper。API 与 worker 的组合根只需一个
 * DATABASE_URL 即可构造 repository，无需直接 import 测试脚手架或数据库包。
 */
import { createDb, type BailianStudioDb } from '@bailian-studio/db'
import { createGenerationRepository, type GenerationRepository } from './repository'

export interface CreateGenerationRepositoryFromUrlOptions {
  max?: number
}

export interface GenerationRepositoryHandle {
  db: BailianStudioDb
  repository: GenerationRepository
  close(): Promise<void>
}

export function createGenerationRepositoryFromUrl(
  url: string,
  options: CreateGenerationRepositoryFromUrlOptions = {},
): GenerationRepositoryHandle {
  const db = createDb({ url, max: options.max ?? 5 })
  return {
    db,
    repository: createGenerationRepository({ db }),
    close: () => db.close(),
  }
}
