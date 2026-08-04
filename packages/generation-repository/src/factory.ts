/**
 * Runtime repository wiring.
 *
 * This module deliberately has no test-database helpers. API and worker
 * composition roots can construct a repository from one DATABASE_URL without
 * importing the test harness or the database package directly.
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
