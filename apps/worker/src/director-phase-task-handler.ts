import type { DirectorPhaseRunForWorker, DirectorRepository } from '@bailian-studio/director-repository'
import type { GenerationRepository } from '@bailian-studio/generation-repository'
import type { Logger } from '@bailian-studio/shared'
import { nextRunAt } from '@bailian-studio/task-engine'
import type { TaskError, TaskRecord } from '@bailian-studio/task-engine'
import { parseDirectorAnalysisOutput } from './director-analysis'
import type { TaskProcessOutcome } from './task-contracts'

const MAX_ANALYSIS_STORY_LENGTH = 9_000
const PHASE_POLL_DELAY_MS = 5_000

export interface DirectorPhaseTaskHandlerDeps {
  readonly repository: GenerationRepository
  readonly directorRepository?: DirectorRepository
  readonly logger: Logger
}

export async function processDirectorPhaseTask(
  task: TaskRecord,
  deps: DirectorPhaseTaskHandlerDeps,
): Promise<TaskProcessOutcome> {
  const phaseRunId = stringInput(task.input, 'phaseRunId')
  if (phaseRunId === undefined) {
    return failed({
      category: 'validation',
      message: `Task ${task.id} is missing a string phaseRunId in its input`,
      retriable: false,
      code: 'DIRECTOR_PHASE_RUN_ID_INVALID',
    })
  }
  if (deps.directorRepository === undefined) {
    return failed({
      category: 'system',
      message: 'Director repository is not configured in this worker',
      retriable: false,
      code: 'DIRECTOR_REPOSITORY_UNAVAILABLE',
    })
  }

  const run = await deps.directorRepository.getPhaseRunForWorker(phaseRunId)
  if (run === undefined) {
    return failed({
      category: 'validation',
      message: `Director phase run not found: ${phaseRunId}`,
      retriable: false,
      code: 'DIRECTOR_PHASE_RUN_NOT_FOUND',
    })
  }
  if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled') {
    return { status: 'cancelled', error: staleRunError(run.status) }
  }

  await deps.directorRepository.markPhaseRunRunning({ runId: phaseRunId })
  const modelId = stringInput(task.input, 'modelId') ?? stringInput(run.outputSummary ?? {}, 'modelId')
  const snapshot = runInputSnapshot(run)

  if (run.phase !== 'analyze') {
    return failPhase(run.id, {
      category: 'validation',
      message: `Director phase is not implemented yet: ${run.phase}`,
      retriable: false,
      code: 'DIRECTOR_PHASE_NOT_IMPLEMENTED',
    }, deps)
  }
  if (modelId === undefined) {
    return failPhase(run.id, {
      category: 'validation',
      message: 'A text model is required to analyze the screenplay',
      retriable: false,
      code: 'DIRECTOR_MODEL_ID_REQUIRED',
    }, deps)
  }
  if (task.userId === undefined) {
    return failPhase(run.id, {
      category: 'auth',
      message: 'Director phase task is missing its owner',
      retriable: false,
      code: 'DIRECTOR_USER_ID_REQUIRED',
    }, deps)
  }
  if (snapshot.storyText.length > MAX_ANALYSIS_STORY_LENGTH) {
    return failPhase(run.id, {
      category: 'validation',
      message: `Screenplay is too long for the first analysis executor (${MAX_ANALYSIS_STORY_LENGTH} characters maximum)`,
      retriable: false,
      code: 'DIRECTOR_ANALYSIS_INPUT_TOO_LONG',
    }, deps)
  }

  const generationId = stringInput(run.outputSummary ?? {}, 'generationId')
  if (generationId === undefined) {
    try {
      const generation = await deps.repository.createGeneration({
        userId: task.userId,
        modelId,
        params: {
          prompt: analysisPrompt(snapshot.title, snapshot.synopsis, snapshot.storyText),
          maxTokens: 4_096,
          temperature: 0.4,
          topP: 0.8,
        },
        idempotencyKey: `director:${run.id}:analysis`,
        traceId: task.traceId,
      })
      await deps.directorRepository.setPhaseRunProgress({
        runId: run.id,
        outputSummary: { generationId: generation.record.id, modelId },
      })
      deps.logger.info('director.phase_generation_queued', {
        taskId: task.id,
        phaseRunId: run.id,
        generationId: generation.record.id,
        phase: run.phase,
      })
      return retryUntilGenerationCompletes(task, 'Director analysis generation is queued')
    } catch (error) {
      return failPhase(run.id, {
        category: 'validation',
        message: error instanceof Error ? error.message : String(error),
        retriable: false,
        code: 'DIRECTOR_ANALYSIS_GENERATION_CREATE_FAILED',
      }, deps)
    }
  }

  const generation = await deps.repository.getGenerationRecord(generationId)
  if (generation === undefined) {
    return failPhase(run.id, {
      category: 'validation',
      message: `Analysis generation record not found: ${generationId}`,
      retriable: false,
      code: 'DIRECTOR_ANALYSIS_GENERATION_NOT_FOUND',
    }, deps)
  }
  if (generation.status === 'succeeded') {
    const analysisText = readTextOutput(generation.outputResult)
    if (analysisText === undefined) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Analysis generation completed without text output',
        retriable: false,
        code: 'DIRECTOR_ANALYSIS_OUTPUT_MISSING',
      }, deps)
    }
    const analysis = parseDirectorAnalysisOutput(analysisText)
    if (analysis === undefined) {
      return failPhase(run.id, {
        category: 'provider',
        message: 'Analysis generation returned text that does not match the Director analysis contract',
        retriable: false,
        code: 'DIRECTOR_ANALYSIS_OUTPUT_INVALID',
      }, deps)
    }
    return completePhase(run.id, { generationId, modelId, analysisText, analysis }, deps)
  }
  if (generation.status === 'failed' || generation.status === 'cancelled') {
    return failPhase(run.id, {
      category: 'provider',
      message: generation.errorJson?.message === undefined
        ? `Analysis generation ${generation.status}`
        : String(generation.errorJson.message),
      retriable: false,
      code: 'DIRECTOR_ANALYSIS_GENERATION_FAILED',
    }, deps)
  }

  return retryUntilGenerationCompletes(task, `Analysis generation is ${generation.status}`)
}

function runInputSnapshot(run: DirectorPhaseRunForWorker): {
  title: string
  synopsis: string | null
  storyText: string
} {
  const snapshot = run.inputSnapshot
  return {
    title: stringInput(snapshot, 'title') ?? 'Untitled screenplay',
    synopsis: typeof snapshot['synopsis'] === 'string' ? snapshot['synopsis'] : null,
    storyText: stringInput(snapshot, 'storyText') ?? '',
  }
}

function analysisPrompt(title: string, synopsis: string | null, storyText: string): string {
  return [
    '你是一名专业短剧编剧与导演顾问。请分析下面的剧本。',
    '只返回一个 JSON 对象，不要 Markdown、代码围栏、解释文字或额外字段。',
    'JSON 必须符合以下结构：',
    '{"summary":"一句话梗概","theme":"主题","audience":"受众","structure":[{"name":"结构段落","purpose":"作用","beats":["关键节拍"]}],"characters":[{"name":"角色名","role":"角色功能","description":"角色描述","traits":["特质"]}],"locations":[{"name":"场景名","description":"场景描述","atmosphere":"氛围"}],"continuityRisks":["连续性风险"],"visualMotifs":["视觉母题"]}',
    '不要编造原文没有的关键事实；如果信息不足，使用空数组或明确写出不确定性。',
    `项目：${title}`,
    synopsis === null ? '' : `简介：${synopsis}`,
    `剧本：\n${storyText}`,
  ].filter(Boolean).join('\n\n')
}

function readTextOutput(output: Record<string, unknown> | undefined): string | undefined {
  const artifacts = output?.['artifacts']
  if (!Array.isArray(artifacts)) return undefined
  for (const artifact of artifacts) {
    if (typeof artifact !== 'object' || artifact === null) continue
    const text = (artifact as { text?: unknown }).text
    if (typeof text === 'string' && text.trim().length > 0) return text
  }
  return undefined
}

function retryUntilGenerationCompletes(task: TaskRecord, message: string): TaskProcessOutcome {
  if (task.attempts >= task.maxAttempts) {
    return failed({ category: 'timeout', message: `${message}; retry limit reached`, retriable: false, code: 'DIRECTOR_ANALYSIS_RETRY_LIMIT' })
  }
  return {
    status: 'retry',
    nextRunAt: nextRunAt(new Date(Date.now() + PHASE_POLL_DELAY_MS).toISOString(), task.attempts),
    error: { category: 'network', message, retriable: true, code: 'DIRECTOR_ANALYSIS_WAITING' },
  }
}

async function completePhase(
  runId: string,
  outputSummary: Record<string, unknown>,
  deps: DirectorPhaseTaskHandlerDeps,
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
  return { status: 'succeeded', output: { artifacts: [{ kind: 'text', text: outputSummary['analysisText'] }] } }
}

async function failPhase(
  runId: string,
  error: TaskError,
  deps: DirectorPhaseTaskHandlerDeps,
): Promise<TaskProcessOutcome> {
  await deps.directorRepository?.failPhaseRun({
    runId,
    error: {
      code: error.code ?? 'DIRECTOR_PHASE_FAILED',
      message: error.message,
      ...(error.retriable === undefined ? {} : { retriable: error.retriable }),
    },
  })
  return failed(error)
}

function failed(error: TaskError): TaskProcessOutcome {
  return { status: 'failed', error }
}

function stringInput(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function staleRunError(status: string): TaskError {
  return {
    category: 'validation',
    message: `Director phase run is already ${status}`,
    retriable: false,
    code: 'DIRECTOR_PHASE_RUN_STALE',
  }
}
