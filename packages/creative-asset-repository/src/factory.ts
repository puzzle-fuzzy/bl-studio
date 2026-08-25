import { createDb, type BailianStudioDb } from '@bailian-studio/db'
import { createCreativeAssetRepository } from './repository'
import type { CreativeAssetRepository } from './types'

export interface CreativeAssetRepositoryHandle {
  db: BailianStudioDb
  repository: CreativeAssetRepository
  close(): Promise<void>
}

export function createCreativeAssetRepositoryFromUrl(
  url: string,
  options: { max?: number } = {},
): CreativeAssetRepositoryHandle {
  const db = createDb({ url, max: options.max ?? 5 })
  return {
    db,
    repository: createCreativeAssetRepository({ db }),
    close: () => db.close(),
  }
}
