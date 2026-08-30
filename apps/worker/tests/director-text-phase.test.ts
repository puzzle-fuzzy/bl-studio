import { describe, expect, it } from 'vitest'
import type { DirectorPhaseRunForWorker, DirectorRepository } from '@bailian-studio/director-repository'
import type { CreateGenerationInput, CreateGenerationResult, GenerationQuotaLimits } from '@bailian-studio/generation-repository'
import type { TaskRecord } from '@bailian-studio/task-engine'
import { createRecordingLogger, makeRecord, makeTask, FakeRepository } from './fixtures'
import { runTextPhase, type TextPhaseSpec } from '../src/director-text-phase'

/**
 * runTextPhase 是 characters/locations/storyboard/continuity/rebuild/dialogue
 * 六个阶段的共同执行骨架（此前为六份手工拷贝、无任何测试）。这里锁定它的
 * 状态流契约：幂等创建、轮询重试、成功解析、各失败分支的错误码族。
 */

function makeRun(outputSummary: Record<string, unknown> = {}): DirectorPhaseRunForWorker {
  return {
    id: 'run_1',
    projectId: 'proj_1',
    phase: 'characters',
    status: 'running',
    version: 1,
    inputSnapshot: {},
    outputSummary,
  } as unknown as DirectorPhaseRunForWorker
}

interface Harness {
  repo: FakeRepository & {
    createGenerationInputs: CreateGenerationInput[]
    createGenerationResult: CreateGenerationResult
  }
  director: FakeDirectorRepository
  task: TaskRecord
  run: (outputSummary?: Record<string, unknown>, quota?: GenerationQuotaLimits) => ReturnType<typeof runTextPhase<string>>
}

class FakeDirectorRepository {
  progress: Array<{ runId: string; outputSummary: Record<string, unknown> }> = []
  completed: Array<{ runId: string; outputSummary: Record<string, unknown> }> = []
  failures: Array<{ runId: string; code?: string }> = []
  readonly setPhaseRunProgress = (input: { runId: string; outputSummary: Record<string, unknown> }) => {
    this.progress.push(input)
    return Promise.resolve(undefined)
  }
  readonly completePhaseRun = (input: { runId: string; outputSummary: Record<string, unknown> }) => {
    this.completed.push(input)
    return Promise.resolve({ runId: input.runId })
  }
  readonly failPhaseRun = (input: { runId: string; error: { code?: string } }) => {
    this.failures.push({ runId: input.runId, code: input.error.code })
    return Promise.resolve({ runId: input.runId })
  }
}

const spec: TextPhaseSpec<string> = {
  phaseKey: 'characters',
  codePrefix: 'DIRECTOR_CHARACTERS',
  label: 'character',
  prompt: 'prompt-body',
  maxTokens: 4_096,
  temperature: 0.4,
  parse: text => (text === 'BAD'
    ? {
        ok: false,
        error: {
          category: 'provider',
          message: 'contract mismatch',
          retriable: false,
          code: 'DIRECTOR_CHARACTERS_OUTPUT_INVALID',
        },
      }
    : { ok: true, value: `parsed:${text}` }),
  buildCompletion: (generationId, modelId, text, value) => ({
    summary: { generationId, modelId, text, value },
    outputText: text,
  }),
}

function setup(): Harness {
  const repo = new FakeRepository() as FakeRepository & {
    createGenerationInputs: CreateGenerationInput[]
    createGenerationResult: CreateGenerationResult
  }
  ;(repo as unknown as { createGenerationInputs: CreateGenerationInput[] }).createGenerationInputs = []
  ;(repo as unknown as { createGenerationResult: CreateGenerationResult }).createGenerationResult = {
    record: makeRecord({ id: 'gen_1' }),
    task: makeTask(),
  } as unknown as CreateGenerationResult
  repo.createGeneration = (input: CreateGenerationInput) => {
    repo.createGenerationInputs.push(input)
    return Promise.resolve(repo.createGenerationResult)
  }

  const director = new FakeDirectorRepository()
  const task = makeTask({ id: 'task_1', traceId: 'trace_1' })
  const logger = createRecordingLogger()

  return {
    repo,
    director,
    task,
    run: (outputSummary, quota) => runTextPhase(
      makeRun(outputSummary),
      task,
      { repository: repo, directorRepository: director as unknown as DirectorRepository, logger, ...(quota === undefined ? {} : { generationQuota: quota }) },
      'qwen-plus',
      'user_1',
      spec,
    ),
  }
}

function errorOf(outcome: { status: string; error?: { code?: string; message?: string } }): { code?: string; message?: string } | undefined {
  return outcome.status === 'succeeded' ? undefined : outcome.error
}

describe('runTextPhase', () => {
  it('creates the generation idempotently, persists progress and retries', async () => {
    const h = setup()
    const outcome = await h.run()
    expect(outcome.status).toBe('retry')
    expect(errorOf(outcome)?.code).toBe('DIRECTOR_CHARACTERS_WAITING')

    expect(h.repo.createGenerationInputs).toHaveLength(1)
    const input = h.repo.createGenerationInputs[0]!
    expect(input.idempotencyKey).toBe('director:run_1:characters')
    expect(input.userId).toBe('user_1')
    expect(input.params.prompt).toBe('prompt-body')
    expect(input.traceId).toBe('trace_1')

    expect(h.director.progress).toHaveLength(1)
    expect(h.director.progress[0]!.outputSummary).toEqual({ generationId: 'gen_1', modelId: 'qwen-plus' })
  })

  it('forwards the shared generation quota into createGeneration', async () => {
    const h = setup()
    const quota: GenerationQuotaLimits = { dailyQuotaMode: 'attempts', dailyTaskLimit: 10 }
    await h.run({}, quota)
    expect(h.repo.createGenerationInputs[0]!.quota).toEqual(quota)
  })

  it('does not create a second generation when progress already carries one', async () => {
    const h = setup()
    const outcome = await h.run({ generationId: 'gen_1' })
    expect(h.repo.createGenerationInputs).toHaveLength(0)
    expect(outcome.status).toBe('failed')
  })

  it('fails with GENERATION_NOT_FOUND when the recorded generation is missing', async () => {
    const h = setup()
    const outcome = await h.run({ generationId: 'missing' })
    expect(outcome.status).toBe('failed')
    expect(errorOf(outcome)?.code).toBe('DIRECTOR_CHARACTERS_GENERATION_NOT_FOUND')
    expect(h.director.failures[0]?.code).toBe('DIRECTOR_CHARACTERS_GENERATION_NOT_FOUND')
  })

  it('parses a succeeded generation and completes the phase with the built summary', async () => {
    const h = setup()
    h.repo.records.set('gen_1', makeRecord({ id: 'gen_1', status: 'succeeded', outputResult: { artifacts: [{ kind: 'text', text: 'OUT' }] } }))
    const outcome = await h.run({ generationId: 'gen_1' })

    expect(outcome.status).toBe('succeeded')
    if (outcome.status !== 'succeeded') return
    expect(outcome.output?.artifacts).toEqual([{ kind: 'text', text: 'OUT' }])
    expect(h.director.completed).toHaveLength(1)
    expect(h.director.completed[0]!.outputSummary).toEqual({
      generationId: 'gen_1',
      modelId: 'qwen-plus',
      text: 'OUT',
      value: 'parsed:OUT',
    })
  })

  it('fails with OUTPUT_MISSING when a succeeded generation has no text artifact', async () => {
    const h = setup()
    h.repo.records.set('gen_1', makeRecord({ id: 'gen_1', status: 'succeeded', outputResult: {} }))
    const outcome = await h.run({ generationId: 'gen_1' })
    expect(errorOf(outcome)?.code).toBe('DIRECTOR_CHARACTERS_OUTPUT_MISSING')
  })

  it('propagates the parse error verbatim when the output violates the contract', async () => {
    const h = setup()
    h.repo.records.set('gen_1', makeRecord({ id: 'gen_1', status: 'succeeded', outputResult: { artifacts: [{ kind: 'text', text: 'BAD' }] } }))
    const outcome = await h.run({ generationId: 'gen_1' })
    expect(errorOf(outcome)?.code).toBe('DIRECTOR_CHARACTERS_OUTPUT_INVALID')
    expect(h.director.failures[0]?.code).toBe('DIRECTOR_CHARACTERS_OUTPUT_INVALID')
  })

  it('fails the phase when the generation itself failed or was cancelled', async () => {
    for (const status of ['failed', 'cancelled'] as const) {
      const h = setup()
      h.repo.records.set('gen_1', makeRecord({ id: 'gen_1', status, errorJson: { message: 'boom' } }))
      const outcome = await h.run({ generationId: 'gen_1' })
      expect(errorOf(outcome)?.code).toBe('DIRECTOR_CHARACTERS_GENERATION_FAILED')
      expect(errorOf(outcome)?.message).toBe('boom')
    }
  })

  it('keeps polling while the generation is still in flight', async () => {
    const h = setup()
    h.repo.records.set('gen_1', makeRecord({ id: 'gen_1', status: 'processing' }))
    const outcome = await h.run({ generationId: 'gen_1' })
    expect(outcome.status).toBe('retry')
    expect(errorOf(outcome)?.code).toBe('DIRECTOR_CHARACTERS_WAITING')
  })

  it('stops retrying once attempts reach the task limit', async () => {
    const h = setup()
    h.task.attempts = 3
    h.task.maxAttempts = 3
    const outcome = await h.run()
    expect(outcome.status).toBe('failed')
    expect(errorOf(outcome)?.code).toBe('DIRECTOR_CHARACTERS_RETRY_LIMIT')
  })
})
