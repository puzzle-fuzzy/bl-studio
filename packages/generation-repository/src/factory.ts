/**
 * 运行时 repository 装配。
 *
 * 本模块刻意不提供测试数据库 helper。API 与 worker 的进程组合由
 * @bailian-studio/persistence-runtime 统一创建共享数据库句柄，再把同一 db 注入
 * 各持久化模块；独立使用时仍可通过本文件的 URL 工厂快速组装一个 repository。
 */
import { createDb, type BailianStudioDb } from '@bailian-studio/db'
import { createGenerationRepository, type GenerationRepositoryCompat } from './repository'

export interface CreateGenerationRepositoryFromUrlOptions {
  max?: number
}

export interface GenerationRepositoryHandle {
  db: BailianStudioDb
  /** URL 工厂保留完整兼容形状；生产组合根应使用窄 repository port。 */
  repository: GenerationRepositoryCompat
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
