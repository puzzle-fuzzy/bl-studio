/**
 * Worker Loop。
 * 持续认领队列中的任务并通过 TaskExecutor 执行。
 * 负责自身的 poll/idle 计时与优雅停止标志。
 */

import type { CreditLedger } from '@bailian-studio/credit-ledger'
import type { DirectorRepository } from '@bailian-studio/director-repository'
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
  directorRepository?: DirectorRepository
  providerRegistry: ProviderRegistry
  modelRegistry: ModelRegistryLookup
  storage: StorageAdapter
  mediaRepository?: MediaRepository
  /** 由组合根创建的媒体处理器。 */
  mediaProcessor?: MediaProcessor
  /** 每条任务声明的锁时长（毫秒）。默认 90s。 */
  lockDurationMs?: number
  /** 续租运行中任务锁的间隔。默认 lockDurationMs 的三分之一。 */
  lockHeartbeatMs?: number
  /** 两次任务扫描之间的间隔（毫秒）。默认 100ms。 */
  pollIntervalMs?: number
  /** 无任务可认领时的休眠（毫秒）。默认 1000ms。 */
  idleSleepMs?: number
  /**
   * P1-26：单 worker 同时执行的任务上限（有界并发）。默认 3。
   * 锁/心跳/保存均按任务隔离，并发安全前提已具备；视频等长任务期间
   * 不再串行阻塞整进程。调 1 即回到纯串行。
   */
  concurrency?: number
  /** 一次迭代抛错后的退避（毫秒）。默认 5000ms。 */
  errorBackoffMs?: number
  /** generation submit 任务超过该时长即判定失败。 */
  generationSubmitTimeoutMs?: number
  /** provider 轮询生命周期超过该时长即判定失败。 */
  providerAsyncMaxDurationMs?: number
  /** 产物持久化任务超过该时长即判定失败。 */
  artifactPersistTimeoutMs?: number
  /** provider 产物下载安全策略。 */
  artifactFetch?: ArtifactFetchPolicy
  /** 更新 worker 存活行的间隔。默认 5s。 */
  workerHeartbeatIntervalMs?: number
  /** 卡住 generation 记录（任务已终态失败但记录停在 submitting/processing）的清扫间隔。默认 60s。 */
  staleGenerationSweepIntervalMs?: number
  /** 可选的 credit-ledger 句柄：周期兜底释放「generation 已终态但 reserve 从未结算/退款」的陈旧预留（P1-27）。 */
  creditLedger?: Pick<CreditLedger, 'releaseStaleReservations'>
  /** 可选的结构化日志器；默认 createLogger(`worker:<workerId>`)。 */
  logger?: Logger
  /** 可选的进程内指标收集器，用于任务/provider 计数器与计时。 */
  metrics?: MetricsCollector
  /** 输出 worker 指标快照的间隔（毫秒），默认 60s。 */
  metricsLogIntervalMs?: number
}

export class WorkerLoop {
  private running = false
  /** P1-26：当前在途任务数（认领后未落终态）。 */
  private inFlight = 0
  private readonly executor: TaskExecutor
  private readonly logger: Logger
  private readonly lockDurationMs: number
  private readonly lockHeartbeatMs: number
  private readonly pollIntervalMs: number
  private readonly idleSleepMs: number
  private readonly errorBackoffMs: number
  private readonly workerHeartbeatIntervalMs: number
  private readonly staleGenerationSweepIntervalMs: number
  private readonly concurrency: number
  private readonly creditLedger?: Pick<CreditLedger, 'releaseStaleReservations'>
  private readonly metrics: MetricsCollector
  private readonly metricsLogIntervalMs: number

  constructor(private readonly config: WorkerLoopConfig) {
    const metrics = config.metrics ?? new MetricsCollector()
    this.executor = createTaskExecutor({
      repository: config.repository,
      ...(config.directorRepository === undefined ? {} : { directorRepository: config.directorRepository }),
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
    // 任务租约与轮询节奏（默认值）：
    // - 锁 90s：任务执行期间持有；worker 崩溃后最迟 90s 由其它 worker 重新认领。
    // - 心跳 = 锁/3（约 30s）：执行期间周期性续租，网络抖动在锁过期前有重试机会。
    // - poll 100ms：任务入队后低延迟被消费；空闲 sleep 1s 避免无任务时空转。
    // - errorBackoff 5s：迭代抛错后退避，防止错误风暴打满 CPU。
    // - worker 存活心跳 5s：与任务租约分离，存活 ≠ 持有某任务锁。
    this.lockDurationMs = config.lockDurationMs ?? 90_000
    this.lockHeartbeatMs = config.lockHeartbeatMs
      ?? Math.max(1_000, Math.floor(this.lockDurationMs / 3))
    this.pollIntervalMs = config.pollIntervalMs ?? 100
    this.idleSleepMs = config.idleSleepMs ?? 1000
    this.errorBackoffMs = config.errorBackoffMs ?? 5_000
    this.workerHeartbeatIntervalMs = config.workerHeartbeatIntervalMs ?? 5_000
    this.staleGenerationSweepIntervalMs = config.staleGenerationSweepIntervalMs ?? 60_000
    this.concurrency = config.concurrency ?? 3
    this.creditLedger = config.creditLedger
    this.metricsLogIntervalMs = config.metricsLogIntervalMs ?? 60_000
  }

  /** 一直运行直到调用 stop()。优雅停止时 resolve（等待所有在途任务收尾）。 */
  async run(): Promise<void> {
    this.running = true
    const stopHeartbeat = this.startWorkerHeartbeat()
    const stopSweeper = this.startStaleGenerationSweeper()
    const stopReserveSweeper = this.startStaleReserveSweeper()
    const stopMetricsReporter = this.startMetricsReporter()
    try {
      while (this.running) {
        // P1-26：达到并发上限时不抢新任务，等一个槽位空出来。
        if (this.inFlight >= this.concurrency) {
          await sleep(this.pollIntervalMs)
          continue
        }
        try {
          const now = new Date()
          const lockedUntil = new Date(now.getTime() + this.lockDurationMs)
          const task = await this.config.repository.claimNextQueuedTask({
            workerId: this.config.workerId,
            now: now.toISOString(),
            lockedUntil: lockedUntil.toISOString(),
          })
          if (task === undefined) {
            await sleep(this.idleSleepMs)
            continue
          }
          this.inFlight += 1
          void this.runTask(task)
            .catch(error => {
              this.logger.error('task.background_failed', {
                taskId: task.id,
                traceId: task.traceId,
                recordId: task.recordId,
                error: errorMessage(error),
              })
            })
            .finally(() => {
              this.inFlight -= 1
            })
        } catch (error) {
          this.logger.error('worker.iteration_failed', { error: errorMessage(error) })
          await sleep(this.errorBackoffMs)
        }
      }
      // 优雅停止：等所有已认领的在途任务落终态，避免丢工作。
      while (this.inFlight > 0) {
        await sleep(this.pollIntervalMs)
      }
    } finally {
      await stopHeartbeat()
      stopSweeper()
      stopReserveSweeper()
      stopMetricsReporter()
    }
  }

  stop(): void {
    this.running = false
  }

  /** 供本地诊断与测试使用的只读快照；metrics 为进程内数据。 */
  metricsSnapshot(): MetricsSnapshot {
    return this.metrics.snapshot()
  }

  private startMetricsReporter(): () => void {
    const report = () => {
      const snapshot = this.metrics.snapshot()
      this.logger.info('worker.metrics_snapshot', {
        counters: snapshot.counters,
        timers: snapshot.timers,
      })
    }
    report()
    const timer = setInterval(report, this.metricsLogIntervalMs)
    return () => clearInterval(timer)
  }

  /**
   * 让存活状态与任务租约相互独立：worker 空闲时也可以存活，
   * 而进程即将消失时任务租约仍可能健康。
   * 仓库层失败只记录日志，绝不终止任务消费。
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

  /** 周期清扫「任务已终态失败/取消、记录仍卡在 submitting/processing」的 generation。 */
  private startStaleGenerationSweeper(): () => void {
    if (this.config.repository.listStuckGenerationRecords === undefined) {
      return () => {}
    }
    const timer = setInterval(() => {
      void this.sweepStaleGenerations()
    }, this.staleGenerationSweepIntervalMs)
    return () => clearInterval(timer)
  }

  private async sweepStaleGenerations(): Promise<void> {
    const repo = this.config.repository
    const listStuck = repo.listStuckGenerationRecords
    if (listStuck === undefined) return
    let records: Awaited<ReturnType<NonNullable<GenerationRepository['listStuckGenerationRecords']>>>
    try {
      records = await listStuck.call(repo, { now: currentIso() })
    } catch (error) {
      this.logger.error('stale_generations.list_failed', { error: errorMessage(error) })
      return
    }
    for (const record of records) {
      try {
        await repo.failGeneration({
          recordId: record.id,
          error: {
            category: 'system',
            message: 'Generation was swept because its task reached a terminal failure state but the record was left in flight',
            retriable: false,
            code: 'GENERATION_STALE_SWEPT',
          },
          now: currentIso(),
        })
        this.logger.warn('stale_generations.swept', { recordId: record.id, userId: record.userId })
      } catch (error) {
        this.logger.error('stale_generations.fail_failed', { recordId: record.id, error: errorMessage(error) })
      }
    }
  }

  /**
   * 周期兜底释放陈旧 reserve（P1-27）。正常路径下 reserve 会随 generation 结算
   * （settle/refund）自然释放；只有 worker 崩溃、结算中途失败等异常会让「终态
   * generation 的 reserve」变成僵尸预留。此处以与 stale-generation 相同的节奏清扫，
   * 阈值 1 小时给正常生成（视频动辄十几分钟）留足余量。
   */
  private startStaleReserveSweeper(): () => void {
    if (this.creditLedger === undefined) {
      return () => {}
    }
    const timer = setInterval(() => {
      void this.sweepStaleReservations()
    }, this.staleGenerationSweepIntervalMs)
    return () => clearInterval(timer)
  }

  private async sweepStaleReservations(): Promise<void> {
    const ledger = this.creditLedger
    if (ledger === undefined) return
    try {
      const olderThan = new Date(Date.now() - 60 * 60 * 1000)
      const result = await ledger.releaseStaleReservations({ olderThan, confirm: true })
      if (result.released > 0) {
        this.logger.warn('stale_reservations.released', {
          released: result.released,
          candidates: result.candidates,
          skipped: result.skipped,
        })
      }
    } catch (error) {
      this.logger.error('stale_reservations.sweep_failed', { error: errorMessage(error) })
    }
  }

  /** 处理单个任务。为针对性测试而暴露；run() 会按 concurrency 限制并行调用它。 */
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

      const taskError = thrownToTaskError(error)
      try {
        await this.saveTaskIfOwned(task, transitionTask(task, {
          type: 'fail',
          error: taskError,
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
      // P0-04：异常穿透到 catch（如 DB 抖动导致 getGenerationRecord 抛错）时，
      // 任务已 fail，但 generation 记录可能仍停在 submitting/processing——积分预扣
      // 永不释放、用户看到永久 pending。尽力同步记录终态 + 退款；failGeneration 对
      // 已终态记录幂等（直接返回），因此重复调用安全。失败只记日志（DB 全挂时
      // 这里也会失败，由 stale-generations 清扫兜底）。
      if (task.domain === 'generation' && task.recordId !== undefined) {
        try {
          await this.config.repository.failGeneration({
            recordId: task.recordId,
            error: taskError,
            now: currentIso(),
          })
        } catch (recordError) {
          this.logger.error('generation.record_fail_failed', {
            taskId: task.id,
            traceId: task.traceId,
            recordId: task.recordId,
            error: errorMessage(recordError),
          })
        }
      }
       this.logger.error('task.threw', { taskId: task.id, traceId: task.traceId, recordId: task.recordId, error: errorMessage(error) })
    }
  }

  /**
   * 只为通过真实认领路径获得的任务启动租约心跳。
   * 直接的单测调用可能传入没有锁元数据的未认领任务。
   */
  private startLease(task: TaskRecord): TaskLease {
    if (task.lockedBy === undefined || task.lockedUntil === undefined) {
      return {
        isLost: () => false,
        stop: async () => {},
      }
    }

    const workerId = task.lockedBy
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
            workerId,
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
          // 瞬时的心跳失败不应立即丢弃任务；在当前租约到期前，下一个心跳周期还有重试机会。
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

    // 按 lockHeartbeatMs 周期续租：任务执行期间持续向后刷新 lockedUntil，
    // 防止租约过期后被其它 worker 重新认领。
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

  /** 仅当认领该任务的 worker 仍持有任务行时才保存结果。 */
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

/** 把处理器产出转换为 task-engine 状态迁移（succeed / fail / retry / cancel）。 */
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
 * 为日志/存储渲染错误信息，沿 `.cause` 链上溯，让真正位于驱动层的消息浮出水面。
 * Drizzle 会把数据库错误包装成 DrizzleQueryError，其 `message` 只有 SQL + 参数；
 * 可操作的根因（例如 "relation task_records does not exist"）位于 `.cause` 上。
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
