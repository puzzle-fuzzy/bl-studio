/**
 * Worker Loop.
 * Continuously claims queued tasks and runs them through the TaskExecutor.
 * Owns its poll/idle timing and graceful shutdown flag.
 */

import type { FrozenModelManifest } from '@bailian-studio/model-core'
import type { GenerationRepository } from '@bailian-studio/generation-repository'
import type { MediaRepository } from '@bailian-studio/media-repository'
import { createLogger, MetricsCollector, type Logger, type MetricsSnapshot } from '@bailian-studio/shared'
import type { StorageAdapter } from '@bailian-studio/storage'
import { transitionTask, type TaskError, type TaskRecord } from '@bailian-studio/task-engine'
import type { ProviderRegistry } from './providers'
import { createTaskExecutor, type ModelRegistryLookup, type TaskExecutor, type TaskProcessOutcome } from './task-executor'
import type { MediaProcessor } from './media-processor'
import type { ArtifactFetchPolicy } from './artifact-persist'

export interface WorkerLoopConfig {
  workerId: string
  repository: GenerationRepository
  providerRegistry: ProviderRegistry
  modelRegistry: ModelRegistryLookup
  storage: StorageAdapter
  mediaRepository?: MediaRepository
  /** Media processor created by the composition root. */
  mediaProcessor?: MediaProcessor
  /** Lock duration claimed on each task (ms). Defaults to 90s. */
  lockDurationMs?: number
  /** Interval for renewing a running task lock. Defaults to one third of lockDurationMs. */
  lockHeartbeatMs?: number
  /** Pause between task scans (ms). Defaults to 100ms. */
  pollIntervalMs?: number
  /** Sleep when no task is claimable (ms). Defaults to 1000ms. */
  idleSleepMs?: number
  /** Backoff after an iteration throws (ms). Defaults to 5000ms. */
  errorBackoffMs?: number
  /** Maximum age of a generation submit task before it is failed. */
  generationSubmitTimeoutMs?: number
  /** Maximum age of a provider polling lifecycle before it is failed. */
  providerAsyncMaxDurationMs?: number
  /** Maximum age of an artifact persistence task before it is failed. */
  artifactPersistTimeoutMs?: number
  /** Provider artifact download security policy. */
  artifactFetch?: ArtifactFetchPolicy
  /** Interval for updating the worker liveness row. Defaults to 5s. */
  workerHeartbeatIntervalMs?: number
  /** Optional structured logger; defaults to createLogger(`worker:<workerId>`). */
  logger?: Logger
  /** Optional in-process metrics collector for task/provider counters and timings. */
  metrics?: MetricsCollector
}

export class WorkerLoop {
  private running = false
  private readonly executor: TaskExecutor
  private readonly logger: Logger
  private readonly lockDurationMs: number
  private readonly lockHeartbeatMs: number
  private readonly pollIntervalMs: number
  private readonly idleSleepMs: number
  private readonly errorBackoffMs: number
  private readonly workerHeartbeatIntervalMs: number
  private readonly metrics: MetricsCollector

  constructor(private readonly config: WorkerLoopConfig) {
    const metrics = config.metrics ?? new MetricsCollector()
    this.executor = createTaskExecutor({
      repository: config.repository,
      providerRegistry: config.providerRegistry,
      modelRegistry: config.modelRegistry,
      storage: config.storage,
      ...(config.mediaRepository !== undefined ? { mediaRepository: config.mediaRepository } : {}),
      ...(config.mediaProcessor !== undefined ? { mediaProcessor: config.mediaProcessor } : {}),
      ...(config.generationSubmitTimeoutMs !== undefined
        ? { generationSubmitTimeoutMs: config.generationSubmitTimeoutMs }
        : {}),
      ...(config.providerAsyncMaxDurationMs !== undefined
        ? { providerAsyncMaxDurationMs: config.providerAsyncMaxDurationMs }
        : {}),
      ...(config.artifactPersistTimeoutMs !== undefined
        ? { artifactPersistTimeoutMs: config.artifactPersistTimeoutMs }
        : {}),
      ...(config.artifactFetch === undefined ? {} : { artifactFetch: config.artifactFetch }),
      ...(config.logger !== undefined ? { logger: config.logger } : {}),
      metrics,
    })
    this.logger = config.logger ?? createLogger(`worker:${config.workerId}`)
    this.metrics = metrics
    this.lockDurationMs = config.lockDurationMs ?? 90_000
    this.lockHeartbeatMs = config.lockHeartbeatMs
      ?? Math.max(1_000, Math.floor(this.lockDurationMs / 3))
    this.pollIntervalMs = config.pollIntervalMs ?? 100
    this.idleSleepMs = config.idleSleepMs ?? 1000
    this.errorBackoffMs = config.errorBackoffMs ?? 5_000
    this.workerHeartbeatIntervalMs = config.workerHeartbeatIntervalMs ?? 5_000
  }

  /** Run until stop() is called. Resolves on clean shutdown. */
  async run(): Promise<void> {
    this.running = true
    const stopHeartbeat = this.startWorkerHeartbeat()
    try {
      while (this.running) {
        try {
          await this.processOnce()
        } catch (error) {
          this.logger.error('worker.iteration_failed', { error: errorMessage(error) })
          await sleep(this.errorBackoffMs)
        }
      }
    } finally {
      await stopHeartbeat()
    }
  }

  stop(): void {
    this.running = false
  }

  /** Read-only snapshot for local diagnostics and tests; metrics are process-local. */
  metricsSnapshot(): MetricsSnapshot {
    return this.metrics.snapshot()
  }

  /**
   * Keep liveness separate from task leases: a worker can be alive while idle,
   * and a task lease can be healthy while the process is about to disappear.
   * Repository failures are logged but never terminate task consumption.
   */
  private startWorkerHeartbeat(): () => Promise<void> {
    const register = this.config.repository.registerWorkerHeartbeat
    const touch = this.config.repository.touchWorkerHeartbeat
    const stop = this.config.repository.stopWorkerHeartbeat

    if (register === undefined) {
      this.logger.warn('worker.heartbeat_unavailable', { reason: 'repository_method_missing' })
      return async () => {}
    }

    const startedAt = currentIso()
    try {
      const registration = register.call(this.config.repository, { workerId: this.config.workerId, startedAt })
      void registration.catch(error => {
        this.logger.error('worker.heartbeat_register_failed', { error: errorMessage(error) })
      })
    } catch (error) {
      this.logger.error('worker.heartbeat_register_failed', { error: errorMessage(error) })
    }

    const touchHeartbeat = async (): Promise<void> => {
      if (touch === undefined) return
      try {
        const heartbeat = await touch.call(this.config.repository, this.config.workerId)
        if (heartbeat === undefined) {
          this.logger.warn('worker.heartbeat_missing', { workerId: this.config.workerId })
        }
      } catch (error) {
        this.logger.error('worker.heartbeat_failed', {
          workerId: this.config.workerId,
          error: errorMessage(error),
        })
      }
    }

    const timer = setInterval(() => {
      void touchHeartbeat()
    }, this.workerHeartbeatIntervalMs)

    return async () => {
      clearInterval(timer)
      if (stop === undefined) return
      try {
        await stop.call(this.config.repository, this.config.workerId)
      } catch (error) {
        this.logger.error('worker.heartbeat_stop_failed', {
          workerId: this.config.workerId,
          error: errorMessage(error),
        })
      }
    }
  }

  private async processOnce(): Promise<void> {
    const now = new Date()
    const lockedUntil = new Date(now.getTime() + this.lockDurationMs)

    const task = await this.config.repository.claimNextQueuedTask({
      workerId: this.config.workerId,
      now: now.toISOString(),
      lockedUntil: lockedUntil.toISOString(),
    })

    if (task === undefined) {
      await sleep(this.idleSleepMs)
      return
    }

    await this.runTask(task)
    await sleep(this.pollIntervalMs)
  }

  /** Process a single task. Exposed for targeted testing. */
  async runTask(task: TaskRecord): Promise<void> {
    const lease = this.startLease(task)

    try {
      const outcome = await this.executor.processTask(task)
      await lease.stop()
      if (lease.isLost()) return

      const saved = await this.saveTaskIfOwned(task, applyTaskOutcome(task, outcome))
       if (saved) this.logger.info('task.outcome', { taskId: task.id, traceId: task.traceId, recordId: task.recordId, outcome: outcome.status })
    } catch (error) {
      await lease.stop()
      if (lease.isLost()) return

      try {
        await this.saveTaskIfOwned(task, transitionTask(task, {
          type: 'fail',
          error: thrownToTaskError(error),
          now: currentIso(),
        }))
      } catch (persistError) {
        this.logger.error('task.persist_failed', {
          taskId: task.id,
          traceId: task.traceId,
          recordId: task.recordId,
          error: errorMessage(persistError),
        })
      }
       this.logger.error('task.threw', { taskId: task.id, traceId: task.traceId, recordId: task.recordId, error: errorMessage(error) })
    }
  }

  /**
   * Start a lease heartbeat only for tasks obtained through the real claim path.
   * Direct unit-test calls may provide an unclaimed task without lock metadata.
   */
  private startLease(task: TaskRecord): TaskLease {
    if (task.lockedBy === undefined || task.lockedUntil === undefined) {
      return {
        isLost: () => false,
        stop: async () => {},
      }
    }

    let lost = false
    let activeRenewal: Promise<void> | undefined
    let stopped = false

    const renew = async (): Promise<void> => {
      if (stopped || activeRenewal !== undefined) return

      activeRenewal = (async () => {
        const now = new Date()
        try {
          const renewed = await this.config.repository.renewTaskLock({
            taskId: task.id,
            workerId: task.lockedBy!,
            now: now.toISOString(),
            lockedUntil: new Date(now.getTime() + this.lockDurationMs).toISOString(),
          })

          if (renewed === undefined) {
            lost = true
            this.logger.error('task.lock_lost', {
              taskId: task.id,
              traceId: task.traceId,
              recordId: task.recordId,
              workerId: task.lockedBy,
            })
          }
        } catch (error) {
          // A transient heartbeat failure should not immediately discard the task;
          // the next tick gets another chance before the current lease expires.
          this.logger.warn('task.lock_renew_failed', {
            taskId: task.id,
            traceId: task.traceId,
            recordId: task.recordId,
            workerId: task.lockedBy,
            error: errorMessage(error),
          })
        } finally {
          activeRenewal = undefined
        }
      })()

      await activeRenewal
    }

    const timer = setInterval(() => { void renew() }, this.lockHeartbeatMs)
    return {
      isLost: () => lost,
      stop: async () => {
        stopped = true
        clearInterval(timer)
        if (activeRenewal !== undefined) await activeRenewal
      },
    }
  }

  /** Save a result only while the claimed worker still owns the task row. */
  private async saveTaskIfOwned(task: TaskRecord, nextTask: TaskRecord): Promise<boolean> {
    const saved = await this.config.repository.saveTask(
      nextTask,
      task.lockedBy === undefined ? undefined : { expectedWorkerId: task.lockedBy },
    )
    if (saved !== undefined) return true

    this.logger.warn('task.result_discarded_lock_lost', {
      taskId: task.id,
      traceId: task.traceId,
      recordId: task.recordId,
      workerId: task.lockedBy,
    })
    return false
  }
}

interface TaskLease {
  isLost(): boolean
  stop(): Promise<void>
}

function applyTaskOutcome(task: TaskRecord, outcome: TaskProcessOutcome): TaskRecord {
  const now = currentIso()
  switch (outcome.status) {
    case 'succeeded':
      return transitionTask(task, {
        type: 'succeed',
        output: {
          artifacts: outcome.output.artifacts,
          ...(outcome.output.usage !== undefined ? { usage: outcome.output.usage } : {}),
          ...(outcome.output.raw !== undefined ? { raw: outcome.output.raw } : {}),
        },
        now,
      })
    case 'polling':
      return transitionTask(task, { type: 'succeed', output: { nextPollAt: outcome.nextPollAt }, now })
    case 'failed':
      return transitionTask(task, { type: 'fail', error: outcome.error, now })
    case 'retry':
      return transitionTask(task, { type: 'retry', error: outcome.error, nextRunAt: outcome.nextRunAt, now })
    case 'cancelled':
      // 取消走 task-engine 的 cancel 转换（而非 fail），让 task 状态与 generation
      // 记录都正确反映 cancelled 终态。
      return transitionTask(task, { type: 'cancel', error: outcome.error, now })
  }
}

/**
 * Render an error for logs/storage, walking the `.cause` chain so the real
 * driver-level message surfaces. Drizzle wraps DB errors in DrizzleQueryError
 * whose `message` is just the SQL + params; the actionable cause (e.g.
 * "relation task_records does not exist") lives on `.cause`.
 */
function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const parts: string[] = [error.message]
  let current: unknown = error.cause
  while (current instanceof Error && current.message !== parts[parts.length - 1]) {
    parts.push(current.message)
    current = current.cause
  }
  return parts.join(' · caused by: ')
}

function thrownToTaskError(error: unknown): TaskError {
  return {
    category: 'system',
    message: errorMessage(error),
    retriable: false,
    code: 'TASK_EXECUTOR_THROWN',
  }
}

function currentIso(): string {
  return new Date().toISOString()
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
