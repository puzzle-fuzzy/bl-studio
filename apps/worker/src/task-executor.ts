/**
 * Worker 任务分发器。
 *
 * 本文件只识别 task type 并把任务交给对应处理器；生成状态机、artifact 持久化和
 * media 处理分别位于独立模块，避免不同业务生命周期共享一个大型实现文件。
 */

import type {
  AssetRepository,
  GenerationQuotaLimits,
  GenerationRepository,
  ProviderRequestAuditRepository,
} from '@bailian-studio/generation-repository'
import type { DirectorRepository } from '@bailian-studio/director-repository'
import type { MediaRepository } from '@bailian-studio/media-repository'
import {
  createLogger,
  MetricsCollector,
  type Logger,
} from '@bailian-studio/shared'
import type { StorageAdapter } from '@bailian-studio/storage'
import type { TaskRecord } from '@bailian-studio/task-engine'
import { processArtifactPersistTask } from './artifact-task-handler'
import type { ArtifactFetchPolicy } from './artifact-persist'
import { processGenerationTask } from './generation-task-handler'
import { processDirectorPhaseTask } from './director-phase-task-handler'
import { processMediaTask } from './media-task-handler'
import type { MediaProcessor } from './media-processor'
import type { ProviderRegistry } from './providers'
import { processThumbnailTask } from './thumbnail-task-handler'
import { processCanvasExecutionTask } from './canvas-task-handler'
import type { ModelRegistryLookup, TaskProcessOutcome } from './task-contracts'

export type { ModelRegistryLookup, TaskProcessOutcome } from './task-contracts'

export interface TaskExecutorDeps {
  readonly repository: GenerationRepository
  readonly assetRepository?: AssetRepository
  readonly providerRequestAuditRepository: ProviderRequestAuditRepository
  readonly directorRepository?: DirectorRepository
  readonly providerRegistry: ProviderRegistry
  readonly modelRegistry: ModelRegistryLookup
  readonly storage: StorageAdapter
  readonly mediaRepository?: MediaRepository
  readonly mediaProcessor?: MediaProcessor
  /** generation submit 任务超过该时长即判定失败。 */
  readonly generationSubmitTimeoutMs?: number
  /** provider 轮询生命周期超过该时长即判定失败。 */
  readonly providerAsyncMaxDurationMs?: number
  /** 产物持久化任务超过该时长即判定失败。 */
  readonly artifactPersistTimeoutMs?: number
  /** provider 产物下载安全策略。 */
  readonly artifactFetch?: ArtifactFetchPolicy
  /**
   * 导演流程等 worker 侧创建 generation 时的原子准入限额；
   * 缺省即不设限——与 API 路径共用同一解析器时两侧语义一致。
   */
  readonly generationQuota?: GenerationQuotaLimits
  /** 可选的进程内计数器/计时器，用于任务与 provider 诊断。 */
  readonly metrics?: MetricsCollector
  readonly logger?: Logger
}

export class TaskExecutor {
  private readonly logger: Logger
  private readonly metrics: MetricsCollector

  constructor(private readonly deps: TaskExecutorDeps) {
    this.logger = deps.logger ?? createLogger('task-executor')
    this.metrics = deps.metrics ?? new MetricsCollector()
  }

  async processTask(task: TaskRecord): Promise<TaskProcessOutcome> {
    const startedAt = Date.now()
    try {
      const outcome = await this.executeTask(task)
      this.recordTaskMetrics(task, outcome.status, Date.now() - startedAt)
      return outcome
    } catch (error) {
      this.recordTaskMetrics(task, 'threw', Date.now() - startedAt)
      throw error
    }
  }

  private async executeTask(task: TaskRecord): Promise<TaskProcessOutcome> {
    if (task.type === 'canvas.execute') {
      return processCanvasExecutionTask(task, {
        repository: this.deps.repository,
        ...(this.deps.assetRepository === undefined
          ? {}
          : { assetRepository: this.deps.assetRepository }),
        ...(this.deps.generationQuota === undefined
          ? {}
          : { generationQuota: this.deps.generationQuota }),
        logger: this.logger,
      })
    }
    if (task.type === 'director.phase') {
      return processDirectorPhaseTask(task, {
        repository: this.deps.repository,
        ...(this.deps.directorRepository === undefined
          ? {}
          : { directorRepository: this.deps.directorRepository }),
        ...(this.deps.mediaRepository === undefined
          ? {}
          : { mediaRepository: this.deps.mediaRepository }),
        ...(this.deps.generationQuota === undefined
          ? {}
          : { generationQuota: this.deps.generationQuota }),
        modelRegistry: this.deps.modelRegistry,
        logger: this.logger,
      })
    }
    if (task.type === 'media.thumbnail') {
      return processThumbnailTask(task, {
        repository: this.deps.repository,
        storage: this.deps.storage,
        logger: this.logger,
        ...(this.deps.mediaProcessor === undefined
          ? {}
          : { mediaProcessor: this.deps.mediaProcessor }),
        ...(this.deps.artifactFetch === undefined
          ? {}
          : { artifactFetch: this.deps.artifactFetch }),
      })
    }

    if (task.type === 'media.process') {
      return processMediaTask(task, {
        storage: this.deps.storage,
        logger: this.logger,
        ...(this.deps.mediaRepository === undefined
          ? {}
          : { mediaRepository: this.deps.mediaRepository }),
        ...(this.deps.mediaProcessor === undefined
          ? {}
          : { mediaProcessor: this.deps.mediaProcessor }),
      })
    }

    const recordId = readRecordId(task)
    if (recordId === undefined) {
      return {
        status: 'failed',
        error: {
          category: 'validation',
          message: `Task ${task.id} is missing a string recordId in its input`,
          retriable: false,
          code: 'TASK_RECORD_ID_INVALID',
        },
      }
    }
    if (task.type === 'artifact.persist') {
      return processArtifactPersistTask(recordId, task, {
        repository: this.deps.repository,
        storage: this.deps.storage,
        logger: this.logger,
        metrics: this.metrics,
        ...(this.deps.artifactPersistTimeoutMs === undefined
          ? {}
          : { maxDurationMs: this.deps.artifactPersistTimeoutMs }),
        ...(this.deps.artifactFetch === undefined
          ? {}
          : { artifactFetch: this.deps.artifactFetch }),
      })
    }

    return processGenerationTask(recordId, task, {
      repository: this.deps.repository,
      providerRequestAuditRepository: this.deps.providerRequestAuditRepository,
      providerRegistry: this.deps.providerRegistry,
      modelRegistry: this.deps.modelRegistry,
      storage: this.deps.storage,
      logger: this.logger,
      metrics: this.metrics,
      ...(this.deps.generationSubmitTimeoutMs === undefined
        ? {}
        : { submitTimeoutMs: this.deps.generationSubmitTimeoutMs }),
      ...(this.deps.providerAsyncMaxDurationMs === undefined
        ? {}
        : { asyncMaxDurationMs: this.deps.providerAsyncMaxDurationMs }),
    })
  }

  private recordTaskMetrics(
    task: TaskRecord,
    outcome: string,
    durationMs: number,
  ): void {
    this.metrics.increment('worker.task', { type: task.type, outcome })
    this.metrics.timing('worker.task.duration', durationMs, {
      type: task.type,
    })
    this.logger.info('task.duration', {
      taskId: task.id,
      traceId: task.traceId,
      recordId: task.recordId,
      taskType: task.type,
      outcome,
      durationMs,
    })
  }
}

export function createTaskExecutor(deps: TaskExecutorDeps): TaskExecutor {
  return new TaskExecutor(deps)
}

function readRecordId(task: TaskRecord): string | undefined {
  const value = task.input['recordId']
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
