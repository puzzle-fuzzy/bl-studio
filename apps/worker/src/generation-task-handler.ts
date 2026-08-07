import type {
  FailGenerationInput,
  GenerationRecord,
  GenerationRepository,
  NormalizedGenerationOutput,
  ProviderRequestAudit,
  ProviderRequestErrorSummary,
  ProviderRequestOperation,
  FinishProviderRequestInput,
} from '@bailian-studio/generation-repository'
import type { NormalizedArtifact, NormalizedOutput } from '@bailian-studio/provider-dashscope'
import type { Logger, MetricsCollector } from '@bailian-studio/shared'
import type { StorageAdapter } from '@bailian-studio/storage'
import { nextRunAt } from '@bailian-studio/task-engine'
import type { TaskError, TaskRecord } from '@bailian-studio/task-engine'
import { resolveGenerationInputParams } from './generation-input-assets'
import {
  classifyThrownProviderError,
  providerErrorToTaskError,
} from './provider-error-mapping'
import type { ProviderExecuteOutput, ProviderRegistry } from './providers'
import type { ModelRegistryLookup, TaskProcessOutcome } from './task-contracts'

export interface GenerationTaskHandlerDeps {
  readonly repository: GenerationRepository
  readonly providerRegistry: ProviderRegistry
  readonly modelRegistry: ModelRegistryLookup
  readonly storage: StorageAdapter
  readonly logger: Logger
  readonly metrics?: MetricsCollector
  readonly submitTimeoutMs?: number
  readonly asyncMaxDurationMs?: number
}

export const DEFAULT_GENERATION_SUBMIT_TIMEOUT_MS = 2 * 60 * 1000
export const DEFAULT_PROVIDER_ASYNC_MAX_DURATION_MS = 30 * 60 * 1000

export async function processGenerationTask(
  recordId: string,
  task: TaskRecord,
  deps: GenerationTaskHandlerDeps,
): Promise<TaskProcessOutcome> {
  const record = await deps.repository.getGenerationRecord(recordId)
  if (record === undefined) {
    deps.logger.warn('record.not_found', { taskId: task.id, recordId, traceId: task.traceId })
    return failRecord(recordId, {
      category: 'validation',
      message: `Generation record not found: ${recordId}`,
      retriable: false,
      code: 'RECORD_NOT_FOUND',
    }, deps)
  }

  if (record.status === 'succeeded' || record.status === 'failed') {
    deps.logger.warn('task.stale_terminal_record', {
      taskId: task.id,
      recordId,
      traceId: record.traceId,
      status: record.status,
    })
    return {
      status: 'cancelled',
      error: {
        category: 'validation',
        message: `Generation task is stale because record is already ${record.status}`,
        retriable: false,
        code: 'STALE_GENERATION_TASK',
      },
    }
  }

  if (record.status === 'cancelled' || record.cancelRequestedAt !== undefined) {
    return cancelBeforeExecution(record, task, deps)
  }

  // P1-22：submit 任务重跑但记录已持有 providerTaskId —— 上一次 submit 已成功向
  // provider 提交（轮询链路已建），只是本任务在落成功态前崩溃/锁丢失。此时绝不能
  // 再次向 provider 重复 submit（幂等窗口过期后会产生第二个 provider 任务 → 双份
  // 成本），而是确认轮询任务存在并续跑轮询。放在超时检查之前：provider 任务已在
  // 途，不该按 submit 超时（从 createdAt 起算）判失败。
  if (task.type === 'generation.submit' && record.providerTaskId !== undefined) {
    return continuePolling(record, task, record.providerTaskId, deps)
  }

  const timeoutMs = task.type === 'generation.poll'
    ? deps.asyncMaxDurationMs ?? DEFAULT_PROVIDER_ASYNC_MAX_DURATION_MS
    : deps.submitTimeoutMs ?? DEFAULT_GENERATION_SUBMIT_TIMEOUT_MS
  // P1-24：超时从任务认领时间（startedAt）起算，而不是 record.createdAt——后者
  // 包含排队时间，队列积压时任务还没轮到就被判超时失败。startedAt 在每次 claim
  // 时更新（含僵尸复活重认领），衡量的是本次执行时长。
  if (isExpired(task.startedAt ?? record.createdAt, timeoutMs)) {
    const error: TaskError = {
      category: 'timeout',
      message: task.type === 'generation.poll'
        ? `Provider execution exceeded its ${Math.round(timeoutMs / 60_000)} minute timeout`
        : `Generation submission exceeded its ${Math.round(timeoutMs / 60_000)} minute timeout`,
      retriable: false,
      code: task.type === 'generation.poll' ? 'PROVIDER_ASYNC_TIMEOUT' : 'GENERATION_SUBMIT_TIMEOUT',
    }
    deps.logger.error('task.timeout', {
      taskId: task.id,
      recordId,
      traceId: record.traceId,
      taskType: task.type,
      timeoutMs,
    })
    return failRecord(recordId, error, deps)
  }

  const manifest = deps.modelRegistry.getModelById(record.modelId)
  if (manifest === undefined) {
    deps.logger.warn('manifest.not_found', {
      taskId: task.id,
      recordId,
      traceId: record.traceId,
      modelId: record.modelId,
    })
    return failRecord(recordId, {
      category: 'validation',
      message: `Model manifest not found: ${record.modelId}`,
      retriable: false,
      code: 'MANIFEST_NOT_FOUND',
    }, deps)
  }

  deps.logger.info('task.start', {
    taskId: task.id,
    recordId,
    traceId: record.traceId,
    taskType: task.type,
    modelId: record.modelId,
    attempt: task.attempts,
  })

  try {
    const runner = deps.providerRegistry.resolve(manifest)
    const providerTaskId = task.type === 'generation.poll' ? record.providerTaskId : undefined
    const inputParams = task.type === 'generation.submit'
      ? await resolveGenerationInputParams({
          manifest,
          persistedParams: record.inputParams,
          assets: await deps.repository.getGenerationInputAssets(record.id),
          storage: deps.storage,
        })
      : record.inputParams
    const auditStartedAt = Date.now()
    const operation = providerOperation(manifest, task)
    const idempotencyKey = providerTaskId === undefined && operation === 'submit'
      ? `generation:${record.id}:submit`
      : undefined
    const audit = await startProviderRequestAudit(record, task, operation, providerTaskId, idempotencyKey, deps)
    if (audit === undefined) {
      return {
        status: 'retry',
        nextRunAt: nextRunAt(currentIso(), task.attempts),
        error: {
          category: 'system',
          message: 'Provider request audit could not be started; provider execution was skipped',
          retriable: true,
          code: 'PROVIDER_AUDIT_START_FAILED',
        },
      }
    }

    // P1-23：runner.execute 是唯一可能产生「可重试 provider 传输错误」的地方。
    // 执行成功后的一切本地结算/持久化失败都不能触发重跑 provider——同步/stream 模型
    // 没有幂等键，重跑 = 已计费的调用重复计费。因此把 execute 的异常单独接住（可
    // 正常按 provider 错误分类，允许重试），execute 之后的本地持久化异常则一律按
    // 基础设施错误判失败（failGeneration 会退款），绝不 retry。
    let result: ProviderExecuteOutput
    try {
      result = await runner.execute({
        manifest,
        inputParams,
        taskId: task.id,
        estimatedCostCents: record.costEstimate,
        ...(providerTaskId !== undefined ? { providerTaskId } : {}),
        ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
      })
    } catch (error) {
      const info = classifyThrownProviderError(error)
      await finishProviderRequestAudit(audit, auditStartedAt, {
        status: 'failed',
        error: {
          code: info.code ?? 'PROVIDER_ERROR',
          category: info.category,
          message: info.message,
          retriable: info.retriable,
        },
      }, deps)
      recordProviderMetrics(deps.metrics, operation, 'failed', Date.now() - auditStartedAt)
      return applyUnexpectedError(record.id, task, error, deps)
    }

    await finishProviderRequestAudit(audit, auditStartedAt, result.success
      ? {
          status: 'succeeded',
          ...(result.providerTaskId !== undefined ? { providerTaskId: result.providerTaskId } : {}),
          ...(result.requestId !== undefined ? { providerRequestId: result.requestId } : {}),
          ...(result.requiresPoll ? {} : { billedCostCents: result.costCents }),
        }
      : {
          status: 'failed',
          ...(result.providerTaskId !== undefined ? { providerTaskId: result.providerTaskId } : {}),
          ...(result.requestId !== undefined ? { providerRequestId: result.requestId } : {}),
          error: providerRequestError(result.error),
        }, deps)
    recordProviderMetrics(deps.metrics, operation, result.success ? 'succeeded' : 'failed', Date.now() - auditStartedAt)
    try {
      return await applyProviderResult(record, task, result, manifest, deps)
    } catch (error) {
      return applyInfrastructureError(recordId, task, error, deps)
    }
  } catch (error) {
    return applyUnexpectedError(recordId, task, error, deps)
  }
}

/**
 * 将 provider 执行结果应用到 generation 状态机：
 * 成功且无需轮询则 complete；需轮询则调度 poll；可重试失败返回 retry；否则 fail。
 */
async function applyProviderResult(
  record: GenerationRecord,
  task: TaskRecord,
  result: ProviderExecuteOutput,
  manifest: { readonly taskMode: string },
  deps: GenerationTaskHandlerDeps,
): Promise<TaskProcessOutcome> {
  const now = currentIso()

  if (result.success) {
    if (!result.requiresPoll) {
      if (result.output === undefined) {
        return failRecord(record.id, {
          category: 'provider',
          message: 'Provider reported completion without an output',
          retriable: false,
          code: 'MISSING_PROVIDER_OUTPUT',
        }, deps)
      }
      const output = toRepositoryOutput(result.output)
      const completion = await deps.repository.completeGeneration({
        recordId: record.id,
        costFinal: result.costCents,
        output,
        enqueueArtifactPersist: output.artifacts.length > 0,
        ...(result.providerStatus !== undefined ? { providerStatus: result.providerStatus } : {}),
        ...(result.requestId !== undefined ? { requestId: result.requestId } : {}),
        now,
      })
      if (completion.outcome === 'cancelled') {
        const error: TaskError = {
          category: 'cancelled',
          message: 'Generation was cancelled before provider completion; provider output was discarded',
          retriable: false,
          code: 'GENERATION_CANCELLED',
        }
        deps.logger.info('task.cancelled_after_provider_completion', {
          taskId: task.id,
          recordId: record.id,
          traceId: record.traceId,
          modelId: record.modelId,
        })
        return { status: 'cancelled', error }
      }
      if (completion.outcome === 'already_failed') {
        const error: TaskError = {
          category: 'cancelled',
          message: 'Generation task completed after the generation had already failed',
          retriable: false,
          code: 'STALE_GENERATION_TASK',
        }
        return { status: 'cancelled', error }
      }
      if (completion.billingAnomaly !== undefined) {
        deps.logger.warn('billing.anomaly', {
          taskId: task.id,
          recordId: record.id,
          traceId: record.traceId,
          modelId: record.modelId,
          estimatedCents: completion.billingAnomaly.estimatedCents,
          reportedCents: completion.billingAnomaly.reportedCents,
        })
        deps.metrics?.increment('worker.billing_anomaly', { modelId: record.modelId })
      }
      deps.logger.info('task.succeeded', {
        taskId: task.id,
        recordId: record.id,
        traceId: record.traceId,
        modelId: record.modelId,
      })
      return { status: 'succeeded', output }
    }

    const providerTaskId = result.providerTaskId ?? record.providerTaskId
    if (providerTaskId === undefined) {
      return failRecord(record.id, {
        category: 'provider',
        message: 'Provider requested polling but did not return a providerTaskId',
        retriable: false,
        code: 'MISSING_PROVIDER_TASK_ID',
      }, deps)
    }

    const nextRunAt = result.nextPollAt ?? nextPollAt()
    await deps.repository.scheduleGenerationPoll({
      recordId: record.id,
      providerTaskId,
      nextRunAt,
      ...(result.providerStatus !== undefined ? { providerStatus: result.providerStatus } : {}),
      ...(result.requestId !== undefined ? { requestId: result.requestId } : {}),
      now,
    })
    deps.logger.info('task.polling', {
      taskId: task.id,
      recordId: record.id,
      traceId: record.traceId,
      providerTaskId,
      nextRunAt,
    })
    return { status: 'polling', nextPollAt: nextRunAt }
  }

  const error = providerErrorToTaskError(result.error)
  // P0-05：stream（chat）任务不重试——这类请求没有幂等键，超时/断流时 provider 可能
  // 已处理但响应丢失，重发整条 prompt 会重复计费（异步 submit 有幂等键兜底，这里没有）。
  // stream 产物是文本、成本低，直接 fail 优于冒险重试。如需在起点失败时安全重试，
  // 应先在 provider 侧返回「是否已消费任何 token」的信号。
  const retriable = error.retriable && manifest.taskMode !== 'stream'
  if (retriable && task.attempts < task.maxAttempts) {
    const retryAt = nextRunAt(currentIso(), task.attempts)
    deps.logger.warn('task.retry', {
      taskId: task.id,
      recordId: record.id,
      traceId: record.traceId,
      nextRunAt: retryAt,
      attempt: task.attempts,
      message: error.message,
      category: error.category,
      ...(error.code !== undefined ? { code: error.code } : {}),
    })
    return { status: 'retry', nextRunAt: retryAt, error }
  }

  const failedRecord = await deps.repository.failGeneration({
    recordId: record.id,
    error,
    ...(result.providerStatus !== undefined ? { providerStatus: result.providerStatus } : {}),
    ...(result.requestId !== undefined ? { requestId: result.requestId } : {}),
    now,
  })
  if (failedRecord.status === 'cancelled') {
    return {
      status: 'cancelled',
      error: {
        category: 'cancelled',
        message: 'Generation was cancelled before provider failure was finalized',
        retriable: false,
        code: 'GENERATION_CANCELLED',
      },
    }
  }
  if (failedRecord.status === 'succeeded' || failedRecord.status === 'failed') {
    return {
      status: 'cancelled',
      error: {
        category: 'validation',
        message: `Generation task is stale because record is already ${failedRecord.status}`,
        retriable: false,
        code: 'STALE_GENERATION_TASK',
      },
    }
  }
  deps.logger.error('task.failed', {
    taskId: task.id,
    recordId: record.id,
    traceId: record.traceId,
    errorCode: error.code,
    message: error.message,
  })
  return { status: 'failed', error }
}

/**
 * P1-23：provider 已执行（已按结果记审计）之后发生的本地持久化/基础设施错误。
 * 这些错误消息里可能带 "timeout"/"invalid"/"network" 等关键词，若走 DashScope
 * 分类器会被误标成可重试 → 重跑 provider → 同步/stream 模型重复计费。这里一律
 * 归 system、不可重试，直接 fail（failGeneration 会退款），把「已计费的调用」收口。
 */
async function applyInfrastructureError(
  recordId: string,
  task: TaskRecord,
  error: unknown,
  deps: GenerationTaskHandlerDeps,
): Promise<TaskProcessOutcome> {
  const taskError: TaskError = {
    category: 'system',
    message: `Local infrastructure error while finalizing generation: ${errorMessage(error)}`,
    retriable: false,
    code: 'WORKER_INFRASTRUCTURE_ERROR',
  }
  deps.logger.error('task.infrastructure_error', {
    taskId: task.id,
    recordId,
    traceId: task.traceId,
    error: errorMessage(error),
  })
  await failRecord(recordId, taskError, deps)
  return { status: 'failed', error: taskError }
}

async function applyUnexpectedError(
  recordId: string,
  task: TaskRecord,
  error: unknown,
  deps: GenerationTaskHandlerDeps,
): Promise<TaskProcessOutcome> {
  const info = classifyThrownProviderError(error)

  if (info.retriable && task.attempts < task.maxAttempts) {
    const retryAt = nextRunAt(currentIso(), task.attempts)
    deps.logger.warn('task.retry', {
      taskId: task.id,
      recordId,
      traceId: task.traceId,
      nextRunAt: retryAt,
      attempt: task.attempts,
      message: info.message,
      category: info.category,
      ...(info.code !== undefined ? { code: info.code } : {}),
    })
    return {
      status: 'retry',
      nextRunAt: retryAt,
      error: {
        category: info.category,
        message: info.message,
        retriable: true,
        code: info.code ?? 'TASK_RETRY',
        ...(info.details !== undefined ? { details: info.details } : {}),
      },
    }
  }

  const taskError: TaskError = {
    category: info.category,
    message: info.message,
    retriable: false,
    code: info.code ?? 'TASK_EXECUTION_ERROR',
    ...(info.details !== undefined ? { details: info.details } : {}),
  }
  deps.logger.error('task.exception', {
    taskId: task.id,
    recordId,
    traceId: task.traceId,
    message: info.message,
    category: info.category,
    retriable: info.retriable,
  })
  await failRecord(recordId, taskError, deps)
  return { status: 'failed', error: taskError }
}

/**
 * P1-22：submit 已提交 provider、但 submit 任务在落成功态前丢失时的续跑路径。
 * 调用 scheduleGenerationPoll（内部已对非终态 poll 任务查重），把 submit 任务
 * 收敛为「已在轮询中」的结果，绝不重复执行 provider。
 */
async function continuePolling(
  record: GenerationRecord,
  task: TaskRecord,
  providerTaskId: string,
  deps: GenerationTaskHandlerDeps,
): Promise<TaskProcessOutcome> {
  try {
    const result = await deps.repository.scheduleGenerationPoll({
      recordId: record.id,
      providerTaskId,
      now: currentIso(),
    })
    deps.logger.info('task.polling_recovered', {
      taskId: task.id,
      recordId: record.id,
      traceId: record.traceId,
      providerTaskId,
    })
    return { status: 'polling', nextPollAt: result.task.nextRunAt }
  } catch (error) {
    // 记录已不在 submitting/processing（被其它路径推进到终态）时 scheduleGenerationPoll
    // 会抛错。此时重试让下一次 claim 重新判定，而不是把 submit 判成失败。
    deps.logger.warn('task.poll_recovery_failed', {
      taskId: task.id,
      recordId: record.id,
      traceId: record.traceId,
      error: errorMessage(error),
    })
    return {
      status: 'retry',
      nextRunAt: nextRunAt(currentIso(), task.attempts),
      error: {
        category: 'system',
        message: 'Could not confirm the polling task for an already-submitted generation',
        retriable: true,
        code: 'POLL_RECOVERY_FAILED',
      },
    }
  }
}

async function cancelBeforeExecution(
  record: GenerationRecord,
  task: TaskRecord,
  deps: GenerationTaskHandlerDeps,
): Promise<TaskProcessOutcome> {
  let providerCancelStatus = record.providerCancelStatus
  let providerMessage = ''
  let providerDetails: Readonly<Record<string, unknown>> | undefined

  if (record.providerTaskId !== undefined) {
    const manifest = deps.modelRegistry.getModelById(record.modelId)
    if (manifest === undefined) {
      providerCancelStatus = 'failed'
      providerMessage = '；模型 manifest 不存在，未能调用 provider 取消'
    } else {
      try {
        const runner = deps.providerRegistry.resolve(manifest)
        if (runner.cancel === undefined) {
          providerCancelStatus = 'unsupported'
          providerMessage = '；当前 provider runner 不支持主动取消'
        } else {
          const auditStartedAt = Date.now()
          const audit = await startProviderRequestAudit(record, task, 'cancel', record.providerTaskId, undefined, deps)
          try {
            const result = await runner.cancel({ manifest, providerTaskId: record.providerTaskId })
            await finishProviderRequestAudit(audit, auditStartedAt, result.status === 'cancelled'
              ? {
                  status: 'succeeded',
                  ...(result.requestId !== undefined ? { providerRequestId: result.requestId } : {}),
                }
              : result.status === 'unsupported'
                ? {
                    status: 'unsupported',
                    ...(result.requestId !== undefined ? { providerRequestId: result.requestId } : {}),
                  }
                : {
                    status: 'failed',
                    ...(result.requestId !== undefined ? { providerRequestId: result.requestId } : {}),
                    error: providerRequestError(result.error),
                  }, deps)
            recordProviderMetrics(deps.metrics, 'cancel', result.status === 'cancelled'
              ? 'succeeded'
              : result.status === 'unsupported' ? 'unsupported' : 'failed', Date.now() - auditStartedAt)
            if (result.status === 'cancelled') {
              providerCancelStatus = 'succeeded'
              providerMessage = '；provider 已接受取消'
            } else if (result.status === 'unsupported') {
              providerCancelStatus = 'unsupported'
              providerMessage = `；provider 未完成主动取消：${result.reason}`
              providerDetails = {
                providerCancelReason: result.reason,
                ...(result.requestId !== undefined ? { providerRequestId: result.requestId } : {}),
              }
            } else {
              providerCancelStatus = 'failed'
              providerMessage = `；provider 取消失败：${result.error.message}`
              providerDetails = {
                providerErrorCode: result.error.code,
                ...(result.error.details ?? {}),
                ...(result.requestId !== undefined ? { providerRequestId: result.requestId } : {}),
              }
            }
          } catch (error) {
            const info = classifyThrownProviderError(error)
            await finishProviderRequestAudit(audit, auditStartedAt, {
              status: 'failed',
              error: {
                code: info.code ?? 'PROVIDER_CANCEL_EXCEPTION',
                category: info.category,
                message: info.message,
                retriable: info.retriable,
              },
            }, deps)
            recordProviderMetrics(deps.metrics, 'cancel', 'failed', Date.now() - auditStartedAt)
            throw error
          }
        }
      } catch (error) {
        providerCancelStatus = 'failed'
        providerMessage = `；调用 provider 取消时发生异常：${error instanceof Error ? error.message : String(error)}`
        deps.logger.error('provider.cancel.failed', {
          taskId: task.id,
          recordId: record.id,
          traceId: record.traceId,
          providerTaskId: record.providerTaskId,
          error: errorMessage(error),
        })
        providerDetails = {
          providerErrorCode: 'PROVIDER_CANCEL_EXCEPTION',
        }
      }
    }
  }

  const error: TaskError = {
    category: 'cancelled',
    message: `Generation was cancelled before provider execution${providerMessage}`,
    retriable: false,
    code: 'GENERATION_CANCELLED',
    ...(providerDetails !== undefined ? { details: providerDetails } : {}),
  }
  deps.logger.info('task.cancelled_before_execution', {
    taskId: task.id,
    recordId: record.id,
    traceId: record.traceId,
    status: record.status,
    providerTaskId: record.providerTaskId,
    providerCancelStatus,
  })
  return cancelRecord(record.id, error, deps, providerCancelStatus)
}

type ProviderRequestFinishPatch = Omit<FinishProviderRequestInput, 'auditId' | 'completedAt' | 'latencyMs'>

async function startProviderRequestAudit(
  record: GenerationRecord,
  task: TaskRecord,
  operation: ProviderRequestOperation,
  providerTaskId: string | undefined,
  idempotencyKey: string | undefined,
  deps: GenerationTaskHandlerDeps,
): Promise<ProviderRequestAudit | undefined> {
  try {
    return await deps.repository.startProviderRequest({
      generationId: record.id,
      taskId: task.id,
      userId: record.userId,
      provider: record.provider,
      providerModel: record.providerModel,
      operation,
      ...(idempotencyKey !== undefined ? { idempotencyKey } : {}),
      ...(providerTaskId !== undefined ? { providerTaskId } : {}),
      attempt: task.attempts,
      estimatedCostCents: record.costEstimate,
    })
  } catch (error) {
    deps.logger.error('provider.audit_start_failed', {
      taskId: task.id,
      recordId: record.id,
      traceId: record.traceId,
      operation,
      error: errorMessage(error),
    })
    return undefined
  }
}

async function finishProviderRequestAudit(
  audit: ProviderRequestAudit | undefined,
  startedAt: number,
  patch: ProviderRequestFinishPatch,
  deps: GenerationTaskHandlerDeps,
): Promise<void> {
  if (audit === undefined) return

  try {
    const updated = await deps.repository.finishProviderRequest({
      auditId: audit.id,
      ...patch,
      completedAt: currentIso(),
      latencyMs: Date.now() - startedAt,
    })
    if (updated === undefined) {
      deps.logger.warn('provider.audit_missing', { auditId: audit.id })
    }
  } catch (error) {
    // provider 结果已经存在。finish 写入失败绝不能把一次已计费的 provider 调用
    // 变成第二次 provider 重试；同时要让这次丢失保持可见（记录日志）。
    deps.logger.error('provider.audit_finish_failed', {
      auditId: audit.id,
      error: errorMessage(error),
    })
  }
}

function providerOperation(
  manifest: { readonly taskMode: string },
  task: TaskRecord,
): ProviderRequestOperation {
  if (task.type === 'generation.poll') return 'poll'
  return manifest.taskMode === 'stream' ? 'chat' : 'submit'
}

function providerRequestError(error: {
  readonly code: string
  readonly category: string
  readonly message: string
  readonly retryable: boolean
}): ProviderRequestErrorSummary {
  return {
    code: error.code,
    category: error.category,
    message: error.message,
    retriable: error.retryable,
  }
}

function recordProviderMetrics(
  metrics: MetricsCollector | undefined,
  operation: ProviderRequestOperation,
  status: 'succeeded' | 'failed' | 'unsupported',
  durationMs: number,
): void {
  if (metrics === undefined) return
  metrics.increment('worker.provider_request', { operation, status })
  metrics.timing('worker.provider_request.duration', durationMs, { operation, status })
}

async function failRecord(
  recordId: string,
  error: TaskError,
  deps: GenerationTaskHandlerDeps,
): Promise<TaskProcessOutcome> {
  const input: FailGenerationInput = { recordId, error, now: currentIso() }
  const failedRecord = await deps.repository.failGeneration(input)
  if (failedRecord.status === 'cancelled') {
    return {
      status: 'cancelled',
      error: {
        category: 'cancelled',
        message: 'Generation was cancelled before failure was finalized',
        retriable: false,
        code: 'GENERATION_CANCELLED',
      },
    }
  }
  if (failedRecord.status === 'succeeded' || failedRecord.status === 'failed') {
    return {
      status: 'cancelled',
      error: {
        category: 'validation',
        message: `Generation task is stale because record is already ${failedRecord.status}`,
        retriable: false,
        code: 'STALE_GENERATION_TASK',
      },
    }
  }
  return { status: 'failed', error }
}

async function cancelRecord(
  recordId: string,
  error: TaskError,
  deps: GenerationTaskHandlerDeps,
  providerCancelStatus?: GenerationRecord['providerCancelStatus'],
): Promise<TaskProcessOutcome> {
  await deps.repository.cancelGeneration({
    recordId,
    error,
    now: currentIso(),
    ...(providerCancelStatus !== undefined ? { providerCancelStatus } : {}),
  })
  return { status: 'cancelled', error }
}

function toRepositoryOutput(output: NormalizedOutput): NormalizedGenerationOutput {
  return {
    artifacts: output.artifacts.map(artifactToRecord),
    ...(output.usage !== undefined ? { usage: output.usage } : {}),
    raw: output.raw,
  }
}

function artifactToRecord(artifact: NormalizedArtifact): Record<string, unknown> {
  return {
    kind: artifact.kind,
    ...(artifact.sourceUrl !== undefined ? { sourceUrl: artifact.sourceUrl } : {}),
    ...(artifact.text !== undefined ? { text: artifact.text } : {}),
    ...(artifact.mimeType !== undefined ? { mimeType: artifact.mimeType } : {}),
    ...(artifact.providerMeta !== undefined ? { providerMeta: artifact.providerMeta } : {}),
  }
}

function currentIso(): string {
  return new Date().toISOString()
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function nextPollAt(): string {
  return shiftSeconds(currentIso(), 5)
}

function shiftSeconds(iso: string, seconds: number): string {
  return new Date(Date.parse(iso) + seconds * 1000).toISOString()
}

function isExpired(createdAt: string, maxDurationMs: number): boolean {
  const createdAtMs = Date.parse(createdAt)
  return Number.isFinite(createdAtMs) && Date.now() - createdAtMs > maxDurationMs
}
