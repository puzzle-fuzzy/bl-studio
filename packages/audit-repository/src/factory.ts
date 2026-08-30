import { createDb, type BailianStudioDb } from '@bailian-studio/db'
import { createAuditOutboxRepository } from './repository'
import type { AuditOutboxRepository } from './types'

export interface AuditOutboxRepositoryHandle {
  db: BailianStudioDb
  repository: AuditOutboxRepository
  close(): Promise<void>
}

export function createAuditOutboxRepositoryFromUrl(
  url: string,
  options: { max?: number } = {},
): AuditOutboxRepositoryHandle {
  const db = createDb({ url, max: options.max ?? 5 })
  return {
    db,
    repository: createAuditOutboxRepository({ db }),
    close: () => db.close(),
  }
}
