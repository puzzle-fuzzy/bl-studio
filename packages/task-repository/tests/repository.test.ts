import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import {
  createDb,
  taskInsertValues,
  taskRecords,
  type TaskRecordInput,
} from '@bailian-studio/db'
import { createIsolatedTestDb, resetBailianStudioTestDb } from '@bailian-studio/db/test'
import { transitionTask, type TaskRecord } from '@bailian-studio/task-engine'
import {
  createTaskQueueRepository,
  createTaskQueueTransactionStore,
  enqueueTask,
} from '../src/repository'

let isolated!: Awaited<ReturnType<typeof createIsolatedTestDb>>
let db!: ReturnType<typeof createDb>

function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  const createdAt = new Date(Date.now() - 1_000).toISOString()
  return {
    id: 'task-1',
    type: 'generation.submit',
    domain: 'generation',
    status: 'queued',
    priority: 0,
    input: { recordId: 'record-1' },
    attempts: 0,
    maxAttempts: 3,
    nextRunAt: createdAt,
    recordId: 'record-1',
    userId: 'user-1',
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  }
}

async function seedTask(task: TaskRecordInput): Promise<void> {
  await db.insert(taskRecords).values(taskInsertValues(task))
}

beforeAll(async () => {
  isolated = await createIsolatedTestDb()
  db = createDb({ url: isolated.url, max: 4 })
})

afterAll(async () => {
  await db.close()
  await isolated.close()
})

beforeEach(async () => {
  await resetBailianStudioTestDb(db)
})

describe('task queue repository', () => {
  it('enqueues a task inside the caller transaction and returns the domain record', async () => {
    const task = makeTask({ id: 'task-enqueued' })
    const enqueued = await db.transaction(tx => enqueueTask(tx, task))

    expect(enqueued).toMatchObject({
      id: task.id,
      type: task.type,
      domain: task.domain,
      status: 'queued',
    })
    expect((await db.select().from(taskRecords).where(eq(taskRecords.id, task.id)))).toHaveLength(1)
  })

  it('finds a task through the transaction store without exposing task table details', async () => {
    const task = makeTask({ id: 'task-find', type: 'media.process', domain: 'media', recordId: 'media-1' })
    await seedTask(task)

    const found = await db.transaction(tx =>
      createTaskQueueTransactionStore().findTask(tx, {
        recordId: 'media-1',
        type: 'media.process',
        statuses: ['queued'],
      }),
    )

    expect(found).toMatchObject({ id: task.id, recordId: 'media-1', type: 'media.process' })
  })

  it('cancels only queued matching tasks through the transaction store', async () => {
    await seedTask(makeTask({
      id: 'thumbnail-queued',
      type: 'media.thumbnail',
      domain: 'media',
      recordId: 'derivative-1',
    }))
    await seedTask(makeTask({
      id: 'thumbnail-running',
      type: 'media.thumbnail',
      domain: 'media',
      status: 'running',
      recordId: 'derivative-1',
      lockedBy: 'worker-1',
      lockedUntil: new Date(Date.now() + 60_000).toISOString(),
    }))

    const now = new Date().toISOString()
    const cancelled = await db.transaction(tx =>
      createTaskQueueTransactionStore().cancelQueuedTasks(tx, {
        recordIds: ['derivative-1'],
        type: 'media.thumbnail',
        error: {
          category: 'cancelled',
          message: 'source deleted',
          retriable: false,
          code: 'SOURCE_DELETED',
        },
        now,
        updatedBy: 'user-1',
      }),
    )

    expect(cancelled).toBe(1)
    await expect(createTaskQueueRepository({ db }).getTask('thumbnail-queued')).resolves.toMatchObject({
      status: 'cancelled',
      completedAt: now,
      errorJson: { code: 'SOURCE_DELETED' },
    })
    await expect(createTaskQueueRepository({ db }).getTask('thumbnail-running')).resolves.toMatchObject({
      status: 'running',
    })
  })

  it('claims distinct tasks under concurrency', async () => {
    const repository = createTaskQueueRepository({ db })
    await seedTask(makeTask({ id: 'task-a', priority: 1 }))
    await seedTask(makeTask({ id: 'task-b', priority: 0 }))

    const now = new Date().toISOString()
    const lockedUntil = new Date(Date.now() + 60_000).toISOString()
    const [first, second] = await Promise.all([
      repository.claimNextQueuedTask({ workerId: 'worker-a', now, lockedUntil }),
      repository.claimNextQueuedTask({ workerId: 'worker-b', now, lockedUntil }),
    ])

    expect(first?.id).toBeDefined()
    expect(second?.id).toBeDefined()
    expect(first?.id).not.toBe(second?.id)
    expect(first?.status).toBe('running')
    expect(second?.status).toBe('running')
    expect(new Set([first?.lockedBy, second?.lockedBy])).toEqual(new Set(['worker-a', 'worker-b']))
  })

  it('renews and saves only while the owner lease is valid', async () => {
    const repository = createTaskQueueRepository({ db })
    await seedTask(makeTask())

    const now = new Date()
    const claimed = await repository.claimNextQueuedTask({
      workerId: 'worker-a',
      now: now.toISOString(),
      lockedUntil: new Date(now.getTime() + 60_000).toISOString(),
    })
    if (claimed === undefined) throw new Error('expected task to be claimed')

    const renewed = await repository.renewTaskLock({
      taskId: claimed.id,
      workerId: 'worker-a',
      now: new Date(now.getTime() + 1_000).toISOString(),
      lockedUntil: new Date(now.getTime() + 120_000).toISOString(),
    })
    expect(renewed?.lockedUntil).toBe(new Date(now.getTime() + 120_000).toISOString())

    await expect(repository.saveTask(claimed, { expectedWorkerId: 'worker-b' })).resolves.toBeUndefined()

    const completed = transitionTask(renewed ?? claimed, {
      type: 'succeed',
      output: { providerTaskId: 'provider-1' },
      now: new Date(now.getTime() + 2_000).toISOString(),
    })
    const saved = await repository.saveTask(completed, { expectedWorkerId: 'worker-a' })
    expect(saved?.status).toBe('succeeded')
    expect(saved?.lockedBy).toBeUndefined()
    expect((await repository.getTask(claimed.id))?.output).toEqual({ providerTaskId: 'provider-1' })
  })

  it('quarantines a malformed task instead of blocking the queue', async () => {
    const repository = createTaskQueueRepository({ db })
    await seedTask({ ...makeTask({ id: 'task-invalid' }), type: 'invalid.task' })

    const claimed = await repository.claimNextQueuedTask({
      workerId: 'worker-a',
      now: new Date().toISOString(),
      lockedUntil: new Date(Date.now() + 60_000).toISOString(),
    })

    expect(claimed).toBeUndefined()
    const [failed] = await db.select().from(taskRecords).where(eq(taskRecords.id, 'task-invalid'))
    expect(failed?.status).toBe('failed')
    expect(failed?.errorJson).toMatchObject({ code: 'TASK_CLAIM_INVALID', retriable: false })
  })

  it('uses stable repository errors for missing tasks', async () => {
    const repository = createTaskQueueRepository({ db })

    await expect(repository.getTask('missing-task')).resolves.toBeUndefined()
    await expect(repository.saveTask(makeTask({ id: 'missing-task' }))).rejects.toMatchObject({
      code: 'TASK_NOT_FOUND',
    })
  })

  it('keeps the domain mapper defensive for malformed error JSON', async () => {
    const repository = createTaskQueueRepository({ db })
    await seedTask({ ...makeTask({ id: 'task-error-json' }), errorJson: { message: 'not a TaskError' } })

    const task = await repository.getTask('task-error-json')
    expect(task?.errorJson).toBeUndefined()
  })
})
