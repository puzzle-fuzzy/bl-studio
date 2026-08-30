/**
 * 导演文本阶段（LLM 生成 + 解析）的通用执行骨架。
 *
 * characters / locations / storyboard / continuity / rebuild / dialogue 六个阶段
 * 共享同一状态流：幂等创建 generation → 记录进度 → 轮询 → 读取文本输出 → 解析
 * （含 scope 校验）→ 完成阶段。阶段差异全部收敛到 TextPhaseSpec 的三个回调
 * （prompt / parse / buildCompletion），错误码族由 codePrefix 派生，保持与
 * 历史 six-copy 实现完全一致的对外行为（码值、消息文案、轮询节奏均不变）。
 *
 * analyze（含 script-chat 副作用）、bgm（音频资产 finalize）、videos（逐镜头
 * 视频）与 assemble（媒体任务）不适用本骨架，仍由 handler 特化实现。
 */
import type { DirectorPhaseRunForWorker, DirectorRepository } from '@bailian-studio/director-repository'
import type { GenerationQuotaLimits, GenerationRepository } from '@bailian-studio/generation-repository'
import { nextRunAt, type TaskError, type TaskRecord } from '@bailian-studio/task-engine'
import type { Logger } from '@bailian-studio/shared'
import type { TaskProcessOutcome } from './task-contracts'

export const PHASE_POLL_DELAY_MS = 5_000

/** 阶段执行所需的最小依赖；DirectorPhaseTaskHandlerDeps 结构化满足本类型。 */
export interface TextPhaseDeps {
  readonly repository: GenerationRepository
  readonly directorRepository?: DirectorRepository
  readonly logger: Logger
  /** 与 API 路径共用的原子准入限额；缺省不设限。 */
  readonly generationQuota?: GenerationQuotaLimits
}

export interface TextPhaseSpec<P> {
  /** 幂等键片段：`director:{runId}:{phaseKey}`。 */
  readonly phaseKey: string
  /** 错误码前缀：`{codePrefix}_GENERATION_CREATE_FAILED` 等由骨架派生。 */
  readonly codePrefix: string
  /** 进度文案中的阶段名（小写），如 'character'、'prompt rebuild'。 */
  readonly label: string
  readonly prompt: string
  readonly maxTokens: number
  readonly temperature: number
  /**
   * 解析已成功 generation 的文本输出（含分镜 scope 校验）。
   * 返回 ok:false 时以给定 TaskError 终止阶段。
   */
  readonly parse: (text: string) => { ok: true; value: P } | { ok: false; error: TaskError }
  /** 由解析结果构造阶段 outputSummary 与任务产物文本。 */
  readonly buildCompletion: (generationId: string, modelId: string, text: string, value: P) => {
    summary: Record<string, unknown>
    outputText: string
  }
}

export async function runTextPhase<P>(
  run: DirectorPhaseRunForWorker,
  task: TaskRecord,
  deps: TextPhaseDeps,
  modelId: string,
  userId: string,
  spec: TextPhaseSpec<P>,
): Promise<TaskProcessOutcome> {
  const generationId = stringInput(run.outputSummary ?? {}, 'generationId')
  if (generationId === undefined) {
    try {
      const generation = await deps.repository.createGeneration({
        userId,
        modelId,
        params: {
          prompt: spec.prompt,
          maxTokens: spec.maxTokens,
          temperature: spec.temperature,
          topP: 0.8,
        },
        idempotencyKey: `director:${run.id}:${spec.phaseKey}`,
        traceId: task.traceId,
        ...(deps.generationQuota === undefined ? {} : { quota: deps.generationQuota }),
      })
      await deps.directorRepository?.setPhaseRunProgress({
        runId: run.id,
        outputSummary: { generationId: generation.record.id, modelId },
      })
      deps.logger.info('director.phase_generation_queued', {
        taskId: task.id,
        phaseRunId: run.id,
        generationId: generation.record.id,
        phase: run.phase,
      })
      return retryUntilGenerationCompletes(task, `Director ${spec.label} generation is queued`, spec.codePrefix)
    }
    catch (error) {
      return failPhase(run.id, {
        category: 'validation',
        message: error instanceof Error ? error.message : String(error),
        retriable: false,
        code: `${spec.codePrefix}_GENERATION_CREATE_FAILED`,
      }, deps)
    }
  }

  const generation = await deps.repository.getGenerationRecord(generationId)
  if (generation === undefined) {
    return failPhase(run.id, {
      category: 'validation',
      message: `${capitalize(spec.label)} generation record not found: ${generationId}`,
      retriable: false,
      code: `${spec.codePrefix}_GENERATION_NOT_FOUND`,
    }, deps)
  }
  if (generation.status === 'succeeded') {
    const outputText = readTextOutput(generation.outputResult)
    if (outputText === undefined) {
      return failPhase(run.id, {
        category: 'provider',
        message: `${capitalize(spec.label)} generation completed without text output`,
        retriable: false,
        code: `${spec.codePrefix}_OUTPUT_MISSING`,
      }, deps)
    }
    const parsed = spec.parse(outputText)
    if (!parsed.ok) {
      return failPhase(run.id, parsed.error, deps)
    }
    const completion = spec.buildCompletion(generationId, modelId, outputText, parsed.value)
    return completePhase(run.id, completion.summary, deps, completion.outputText)
  }
  if (generation.status === 'failed' || generation.status === 'cancelled') {
    return failPhase(run.id, {
      category: 'provider',
      message: generation.errorJson?.message === undefined
        ? `${capitalize(spec.label)} generation ${generation.status}`
        : String(generation.errorJson.message),
      retriable: false,
      code: `${spec.codePrefix}_GENERATION_FAILED`,
    }, deps)
  }

  return retryUntilGenerationCompletes(task, `${capitalize(spec.label)} generation is ${generation.status}`, spec.codePrefix)
}

export async function completePhase(
  runId: string,
  outputSummary: Record<string, unknown>,
  deps: TextPhaseDeps,
  outputText: string,
): Promise<TaskProcessOutcome> {
  const completed = await deps.directorRepository?.completePhaseRun({ runId, outputSummary })
  if (completed === undefined) {
    return failed({
      category: 'system',
      message: `Director phase run could not be completed: ${runId}`,
      retriable: false,
      code: 'DIRECTOR_PHASE_COMPLETE_FAILED',
    })
  }
  deps.logger.info('director.phase.succeeded', {
    phaseRunId: runId,
    outputKeys: Object.keys(outputSummary).sort(),
  })
  return { status: 'succeeded', output: { artifacts: [{ kind: 'text', text: outputText }] } }
}

export async function failPhase(
  runId: string,
  error: TaskError,
  deps: TextPhaseDeps,
): Promise<TaskProcessOutcome> {
  await deps.directorRepository?.failPhaseRun({
    runId,
    error: {
      code: error.code ?? 'DIRECTOR_PHASE_FAILED',
      message: error.message,
      ...(error.retriable === undefined ? {} : { retriable: error.retriable }),
    },
  })
  deps.logger.error('director.phase.failed', {
    phaseRunId: runId,
    category: error.category,
    code: error.code,
    retriable: error.retriable,
    errorMessage: error.message,
  })
  return failed(error)
}

export function retryUntilGenerationCompletes(task: TaskRecord, message: string, codePrefix = 'DIRECTOR_ANALYSIS'): TaskProcessOutcome {
  if (task.attempts >= task.maxAttempts) {
    return failed({ category: 'timeout', message: `${message}; retry limit reached`, retriable: false, code: `${codePrefix}_RETRY_LIMIT` })
  }
  return {
    status: 'retry',
    nextRunAt: nextRunAt(new Date(Date.now() + PHASE_POLL_DELAY_MS).toISOString(), task.attempts),
    error: { category: 'network', message, retriable: true, code: `${codePrefix}_WAITING` },
  }
}

export function failed(error: TaskError): TaskProcessOutcome {
  return { status: 'failed', error }
}

export function readTextOutput(output: Record<string, unknown> | undefined): string | undefined {
  const artifacts = output?.['artifacts']
  if (!Array.isArray(artifacts)) return undefined
  for (const artifact of artifacts) {
    if (typeof artifact !== 'object' || artifact === null) continue
    const text = (artifact as { text?: unknown }).text
    if (typeof text === 'string' && text.trim().length > 0) return text
  }
  return undefined
}

export function stringInput(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function capitalize(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1)
}
