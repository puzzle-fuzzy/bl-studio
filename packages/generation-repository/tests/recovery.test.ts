import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  createDb,
  generationRecords,
  taskInsertValues,
  taskRecords,
  users,
  type TaskRecordInput,
} from '@bailian-studio/db'
import { createIsolatedTestDb, resetBailianStudioTestDb } from '@bailian-studio/db/test'
import { createTaskQueueReadStore } from '@bailian-studio/task-repository'
import type { TaskRecord } from '@bailian-studio/task-engine'
import { createGenerationRecoveryRepository } from '../src/recovery'

const now = '2026-08-31T00:00:00.000Z'
const old = '2026-08-30T00:00:00.000Z'
const userId = 'recovery-owner'

let isolated!: Awaited<ReturnType<typeof createIsolatedTestDb>>
let db!: ReturnType<typeof createDb>

beforeAll(async () => {
  isolated = await createIsolatedTestDb()
  db = createDb({ url: isolated.url, max: 2 })
})

afterAll(async () => {
  await db.close()
  await isolated.close()
})

beforeEach(async () => {
  await resetBailianStudioTestDb(db)
  await db.insert(users).values({
    id: userId,
    email: `${userId}@example.com`,
    passwordHash: 'test-hash',
    createdAt: new Date(old),
    updatedAt: new Date(old),
  })
})

async function seedGeneration(id: string, updatedAt: string): Promise<void> {
  await db.insert(generationRecords).values({
    id,
    userId,
    modelId: 'qwen-image',
    provider: 'dashscope',
    providerModel: 'qwen-image-v1',
    category: 'image',
    inputParamsJson: { prompt: id },
    status: 'processing',
    costEstimate: 10,
    providerCancelStatus: 'not_requested',
    createdAt: new Date(old),
    updatedAt: new Date(updatedAt),
  })
}

async function seedTask(task: TaskRecordInput): Promise<void> {
  await db.insert(taskRecords).values(taskInsertValues(task))
}

describe('generation recovery repository', () => {
  it('filters stale generations through the task read port without task table access', async () => {
    await seedGeneration('stuck-generation', old)
    await seedGeneration('stale-without-terminal-task', old)
    await seedGeneration('fresh-generation', now)
    await seedTask({
      id: 'failed-generation-task',
      type: 'generation.submit',
      domain: 'generation',
      status: 'failed',
      priority: 0,
      input: { recordId: 'stuck-generation' },
      attempts: 1,
      maxAttempts: 3,
      nextRunAt: old,
      recordId: 'stuck-generation',
      userId,
      errorJson: {
        category: 'provider',
        message: 'provider failed',
        retriable: false,
      },
      createdAt: old,
      updatedAt: old,
    } satisfies TaskRecord)

    const repository = createGenerationRecoveryRepository(db, createTaskQueueReadStore())
    const records = await repository.listStuckGenerationRecords({
      now,
      staleAfterMs: 10 * 60 * 1000,
      limit: 100,
    })

    expect(records.map(record => record.id)).toEqual(['stuck-generation'])
  })
})
