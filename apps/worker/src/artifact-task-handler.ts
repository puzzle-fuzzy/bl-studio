import type { GenerationRepository } from '@bailian-studio/generation-repository'
import type { Logger, MetricsCollector } from '@bailian-studio/shared'
import type { StorageAdapter } from '@bailian-studio/storage'
import type { TaskError, TaskRecord } from '@bailian-studio/task-engine'
import { persistArtifactsForRecord } from './artifact-persist'
import type { TaskProcessOutcome } from './task-contracts'
import { readCarriedTaskError } from './task-error-guard'

export interface ArtifactTaskHandlerDeps {
  readonly repository: GenerationRepository
  readonly storage: StorageAdapter
  readonly logger: Logger
  readonly metrics?: MetricsCollector
  readonly maxDurationMs?: number
}

export const DEFAULT_ARTIFACT_PERSIST_TIMEOUT_MS = 15 * 60 * 1000

export async function processArtifactPersistTask(
  recordId: string,
  task: TaskRecord,
  deps: ArtifactTaskHandlerDeps,
): Promise<TaskProcessOutcome> {
  const maxDurationMs = deps.maxDurationMs ?? DEFAULT_ARTIFACT_PERSIST_TIMEOUT_MS
  if (isExpired(task.createdAt, maxDurationMs)) {
    const error: TaskError = {
      category: 'timeout',
      message: `Artifact persistence exceeded its ${Math.round(maxDurationMs / 60_000)} minute timeout`,
      retriable: false,
      code: 'ARTIFACT_PERSIST_TIMEOUT',
    }
    deps.logger.error('artifact.persist.timeout', {
      taskId: task.id,
      traceId: task.traceId,
      recordId,
      timeoutMs: maxDurationMs,
    })
    deps.metrics?.increment('worker.artifact_persist', { status: 'timeout' })
    return { status: 'failed', error }
  }

  try {
    const result = await persistArtifactsForRecord({
      recordId,
      repository: deps.repository,
      storage: deps.storage,
    })
    const output = {
      artifacts: [],
      raw: { storedCount: result.storedCount },
    }
    deps.logger.info('artifact.persist.succeeded', {
      taskId: task.id,
      traceId: task.traceId,
      recordId,
      storedCount: result.storedCount,
    })
    deps.metrics?.increment('worker.artifact_persist', { status: 'succeeded' })
    deps.metrics?.increment('worker.artifact_persist.stored', undefined, result.storedCount)
    return { status: 'succeeded', output }
  } catch (error) {
    const taskError = artifactTaskErrorFromThrown(error)
    deps.logger.error('artifact.persist.failed', {
      taskId: task.id,
      traceId: task.traceId,
      recordId,
      errorCode: taskError.code,
      message: taskError.message,
      retriable: taskError.retriable,
    })
    deps.metrics?.increment('worker.artifact_persist', { status: 'failed', code: taskError.code ?? 'unknown' })
    deps.metrics?.increment('worker.artifact_failure', { code: taskError.code ?? 'unknown', retriable: taskError.retriable ? 'true' : 'false' })
    return { status: 'failed', error: taskError }
  }
}

function isExpired(createdAt: string, maxDurationMs: number): boolean {
  const createdAtMs = Date.parse(createdAt)
  return Number.isFinite(createdAtMs) && Date.now() - createdAtMs > maxDurationMs
}

function artifactTaskErrorFromThrown(error: unknown): TaskError {
  return readCarriedTaskError(error) ?? {
    category: 'storage',
    message: error instanceof Error ? error.message : String(error),
    retriable: false,
    code: 'ARTIFACT_PERSIST_FAILED',
  }
}
