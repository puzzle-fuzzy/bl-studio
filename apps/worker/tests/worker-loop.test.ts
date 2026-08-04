import { describe, expect, it } from 'vitest'
import type { TaskRecord } from '@bailian-studio/task-engine'
import { ProviderRegistry } from '../src/providers'
import type { ProviderExecuteOutput } from '../src/providers'
import { WorkerLoop } from '../src/worker-loop'
import {
  createRecordingLogger,
  FakeProviderRunner,
  FakeRepository,
  FakeStorageAdapter,
  makeImageOutput,
  makeRecord,
  makeTask,
  qwenImage,
  type RecordingLogger,
} from './fixtures'

interface LoopHarness {
  loop: WorkerLoop
  repo: FakeRepository
  runner: FakeProviderRunner
  logger: RecordingLogger
}

const TEST_TIMEOUT_MS = 365 * 24 * 60 * 60 * 1000

function buildLoop(overrides: Partial<ConstructorParameters<typeof WorkerLoop>[0]> = {}): LoopHarness {
  const repo = new FakeRepository()
  const runner = new FakeProviderRunner()
  const registry = new ProviderRegistry()
  registry.register(runner)
  const logger = createRecordingLogger()

  const loop = new WorkerLoop({
    workerId: 'worker-test',
    repository: repo,
    providerRegistry: registry,
    modelRegistry: { getModelById: () => qwenImage },
    storage: new FakeStorageAdapter(),
    logger,
    idleSleepMs: 1,
    pollIntervalMs: 1,
    errorBackoffMs: 1,
    generationSubmitTimeoutMs: TEST_TIMEOUT_MS,
    providerAsyncMaxDurationMs: TEST_TIMEOUT_MS,
    artifactPersistTimeoutMs: TEST_TIMEOUT_MS,
    ...overrides,
  })

  return { loop, repo, runner, logger }
}

/** 若 promise 在 `ms` 内未落定则 reject，让失控的循环快速失败。 */
async function resolveWithin(p: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<void>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`run() did not stop within ${ms}ms`)), ms)
  })
  try {
    await Promise.race([p, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

describe('WorkerLoop', () => {
  it('registers, refreshes, and stops its liveness heartbeat', async () => {
    const { loop, repo } = buildLoop({ workerHeartbeatIntervalMs: 1, idleSleepMs: 1 })

    const running = loop.run()
    await new Promise(resolve => setTimeout(resolve, 10))
    loop.stop()
    await resolveWithin(running, 500)

    expect(repo.workerHeartbeatEvents[0]).toEqual({ kind: 'register', workerId: 'worker-test' })
    expect(repo.workerHeartbeatEvents.some(event => event.kind === 'touch')).toBe(true)
    expect(repo.workerHeartbeatEvents.at(-1)).toEqual({ kind: 'stop', workerId: 'worker-test' })
  })

  it('logs the task outcome when a task succeeds', async () => {
    const { loop, repo, runner, logger } = buildLoop()
    repo.records.set('rec_1', makeRecord())
    runner.outputs.push({ success: true, output: makeImageOutput(), costCents: 20, requiresPoll: false })

    await loop.runTask(makeTask())

    const entry = logger.entries.find(e => e.message === 'task.outcome')
    expect(entry).toBeDefined()
    expect(entry?.meta?.outcome).toBe('succeeded')
    expect(repo.savedTasks).toHaveLength(1)
    expect(repo.savedTasks[0]?.status).toBe('succeeded')
  })

  it('saves a cancelled task via task-engine cancel transition when the record was pre-cancelled', async () => {
    const { loop, repo, runner, logger } = buildLoop()
    // 记录已被取消 → TaskExecutor 走取消短路，产出 cancelled outcome。
    // WorkerLoop 应通过 task-engine 的 cancel 转换把 task 存成 cancelled（而非 failed）。
    repo.records.set('rec_1', makeRecord({ status: 'cancelled', cancelRequestedAt: '2026-07-02T00:00:00.000Z' }))
    runner.outputs.push({ success: true, output: makeImageOutput(), costCents: 20, requiresPoll: false })

    await loop.runTask(makeTask())

    const entry = logger.entries.find(e => e.message === 'task.outcome')
    expect(entry).toBeDefined()
    expect(entry?.meta?.outcome).toBe('cancelled')
    expect(repo.savedTasks).toHaveLength(1)
    expect(repo.savedTasks[0]?.status).toBe('cancelled')
    // cancel 转换会清掉锁字段。
    expect(repo.savedTasks[0]?.lockedBy).toBeUndefined()
    expect(repo.savedTasks[0]?.lockedUntil).toBeUndefined()
  })

  it('logs task.threw when processing throws', async () => {
    const { loop, repo, logger } = buildLoop()

    repo.getGenerationRecord = () => Promise.reject(new Error('database unavailable'))
    await loop.runTask(makeTask())

    const entry = logger.entries.find(e => e.message === 'task.threw')
    expect(entry).toBeDefined()
    expect(typeof entry?.meta?.error).toBe('string')
    expect(repo.savedTasks).toHaveLength(1)
    expect(repo.savedTasks[0]?.status).toBe('failed')
  })

  it('persists malformed task input as a stable validation failure', async () => {
    const { loop, repo, logger } = buildLoop()

    await loop.runTask(makeTask({ input: {} }))

    const entry = logger.entries.find(e => e.message === 'task.outcome')
    expect(entry?.meta?.outcome).toBe('failed')
    expect(repo.savedTasks).toHaveLength(1)
    expect(repo.savedTasks[0]).toMatchObject({
      status: 'failed',
      errorJson: { code: 'TASK_RECORD_ID_INVALID', category: 'validation' },
    })
  })

  it('stops a running loop that has no claimable tasks', async () => {
    const { loop } = buildLoop()

    const runPromise = loop.run()
    loop.stop()
    await resolveWithin(runPromise, 500)
    // 未抛错地 resolve 本身就是断言。
    expect(true).toBe(true)
  })

  it('logs and survives an iteration error, then stops', async () => {
    const { loop, repo, logger } = buildLoop()
    repo.claimError = new Error('database is down')

    const runPromise = loop.run()
    loop.stop()
    await resolveWithin(runPromise, 500)

    const entry = logger.entries.find(e => e.message === 'worker.iteration_failed')
    expect(entry).toBeDefined()
    expect(entry?.meta?.error).toBe('database is down')
  })

  it('finishes the in-flight task before shutting down (graceful stop)', async () => {
    // 一个会阻塞直到我们 resolve 一个 deferred 的 provider。我们在任务执行中途调用 stop()，
    // 并断言 run() resolve 前循环仍会完成该任务（保存为 succeeded）——不会丢失任何工作。
    const { loop, repo, runner } = buildLoop()
    repo.records.set('rec_1', makeRecord())

    let resolveExecution: () => void = () => { throw new Error('defer not armed') }
    runner.execute = () => new Promise<ProviderExecuteOutput>((resolve => {
      resolveExecution = () => resolve({ success: true, output: makeImageOutput(), costCents: 20, requiresPoll: false })
    }))

    repo.claimQueue.push(makeTask())
    const runPromise = loop.run()

    // 给循环一个 tick 去认领任务并进入阻塞的 provider 调用。
    await new Promise(r => setTimeout(r, 20))
    loop.stop()              // 任务中途请求停止
    expect(repo.savedTasks).toHaveLength(0)   // 任务仍在执行中
    resolveExecution()       // 让 provider 完成
    await resolveWithin(runPromise, 500)

    // 尽管调用了 stop()，执行中的任务仍被完成并保存——优雅停止。
    expect(repo.savedTasks).toHaveLength(1)
    expect(repo.savedTasks[0]?.status).toBe('succeeded')
  })

  it('renews the claimed task lease while provider execution is in flight', async () => {
    const { loop, repo, runner } = buildLoop({ lockDurationMs: 30, lockHeartbeatMs: 5 })
    repo.records.set('rec_1', makeRecord())

    let resolveExecution: () => void = () => { throw new Error('defer not armed') }
    runner.execute = () => new Promise<ProviderExecuteOutput>(resolve => {
      resolveExecution = () => resolve({ success: true, output: makeImageOutput(), costCents: 20, requiresPoll: false })
    })

    const task = makeTask({
      lockedBy: 'worker-test',
      lockedUntil: '2026-07-02T00:00:30.000Z',
    })
    const runPromise = loop.runTask(task)

    await new Promise(resolve => setTimeout(resolve, 20))
    expect(repo.renewedTaskLocks.length).toBeGreaterThan(0)
    expect(repo.renewedTaskLocks[0]).toMatchObject({
      taskId: task.id,
      workerId: 'worker-test',
    })

    resolveExecution()
    await runPromise
    expect(repo.savedTasks[0]?.status).toBe('succeeded')
  })

  it('discards a provider result after the worker loses its lease', async () => {
    const { loop, repo, runner, logger } = buildLoop({ lockDurationMs: 30, lockHeartbeatMs: 5 })
    repo.records.set('rec_1', makeRecord())
    repo.renewTaskLockLost = true

    let resolveExecution: () => void = () => { throw new Error('defer not armed') }
    runner.execute = () => new Promise<ProviderExecuteOutput>(resolve => {
      resolveExecution = () => resolve({ success: true, output: makeImageOutput(), costCents: 20, requiresPoll: false })
    })

    const task = makeTask({
      lockedBy: 'worker-test',
      lockedUntil: '2026-07-02T00:00:30.000Z',
    })
    const runPromise = loop.runTask(task)

    await new Promise(resolve => setTimeout(resolve, 20))
    expect(logger.entries.some(entry => entry.message === 'task.lock_lost')).toBe(true)

    resolveExecution()
    await runPromise
    expect(repo.savedTasks).toHaveLength(0)
  })

  it('two workers sharing a queue source each claim a distinct task', async () => {
    // 模拟仓库层的 FOR UPDATE SKIP LOCKED 契约：两个 WorkerLoop 从共享的认领源拉取时，
    // 绝不会同时处理同一个任务。共享源把每个任务恰好交给一个认领者。
    const sharedQueue: TaskRecord[] = [
      makeTask({ id: 'task_a', input: { recordId: 'rec_a' }, recordId: 'rec_a' }),
      makeTask({ id: 'task_b', input: { recordId: 'rec_b' }, recordId: 'rec_b' }),
    ]

    // 一个从共享队列原子 shift 的认领函数——每个任务恰好出队一次，
    // 对应 SQL 的 skip-locked 认领语义。
    const claim = async (): Promise<TaskRecord | undefined> => sharedQueue.shift()

    const makeWorker = (workerId: string): LoopHarness => {
      const repo = new FakeRepository()
      repo.records.set('rec_a', makeRecord({ id: 'rec_a' }))
      repo.records.set('rec_b', makeRecord({ id: 'rec_b' }))
      // 覆写 claimNextQueuedTask，使其从共享源取任务。
      repo.claimNextQueuedTask = claim
      const runner = new FakeProviderRunner()
      runner.outputs.push(
        { success: true, output: makeImageOutput(), costCents: 20, requiresPoll: false },
        { success: true, output: makeImageOutput(), costCents: 20, requiresPoll: false },
      )
      const registry = new ProviderRegistry()
      registry.register(runner)
      const logger = createRecordingLogger()
      const loop = new WorkerLoop({
        workerId,
        repository: repo,
        providerRegistry: registry,
        modelRegistry: { getModelById: () => qwenImage },
        storage: new FakeStorageAdapter(),
        logger,
        idleSleepMs: 1,
        pollIntervalMs: 1,
        errorBackoffMs: 1,
        generationSubmitTimeoutMs: TEST_TIMEOUT_MS,
        providerAsyncMaxDurationMs: TEST_TIMEOUT_MS,
        artifactPersistTimeoutMs: TEST_TIMEOUT_MS,
      })
      return { loop, repo, runner, logger }
    }

    const w1 = makeWorker('worker-1')
    const w2 = makeWorker('worker-2')

    // 并发运行两者；每个任务恰好被一个 worker 认领。
    const r1 = w1.loop.run()
    const r2 = w2.loop.run()
    await new Promise(r => setTimeout(r, 30))   // 让两者排空队列
    w1.loop.stop()
    w2.loop.stop()
    await Promise.all([resolveWithin(r1, 500), resolveWithin(r2, 500)])

    const processedIds = [
      ...w1.repo.savedTasks.map(t => t.id),
      ...w2.repo.savedTasks.map(t => t.id),
    ]
    expect(processedIds).toHaveLength(2)
    expect(new Set(processedIds).size).toBe(2)   // 没有重复处理
    expect(processedIds.sort()).toEqual(['task_a', 'task_b'])
  })
})
