import { createDb, type BailianStudioDb } from '@bailian-studio/db'
import { createTaskQueueRepository } from './repository'
import type { TaskQueueRepository } from './types'

export interface TaskQueueRepositoryHandle {
  db: BailianStudioDb
  repository: TaskQueueRepository
  close(): Promise<void>
}

export function createTaskQueueRepositoryFromUrl(
  url: string,
  options: { max?: number } = {},
): TaskQueueRepositoryHandle {
  const db = createDb({ url, max: options.max ?? 5 })
  return {
    db,
    repository: createTaskQueueRepository({ db }),
    close: () => db.close(),
  }
}
