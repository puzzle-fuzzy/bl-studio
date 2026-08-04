import { describe, expect, it } from 'vitest'
import type { GenerationInputAsset, GenerationRecord } from '@bailian-studio/generation-repository'
import { getModelById, type FrozenModelManifest } from '@bailian-studio/model-core'
import { MetricsCollector } from '@bailian-studio/shared'
import type { TaskError } from '@bailian-studio/task-engine'
import { createTaskExecutor, type TaskProcessOutcome } from '../src/task-executor'
import { ProviderRegistry } from '../src/providers'
import {
  createRecordingLogger,
  FakeProviderRunner,
  FakeRepository,
  FakeStorageAdapter,
  cancelledCodes,
  failedCodes,
  makeArtifact,
  makeImageOutput,
  makeRecord,
  makeTask,
  qwenImage,
  type RecordingLogger,
} from './fixtures'
import { FakeMediaProcessor, FakeMediaRepository, makeMediaTask } from './media-fixtures'

interface Harness {
  repo: FakeRepository
  runner: FakeProviderRunner
  storage: FakeStorageAdapter
  logger: RecordingLogger
  metrics: MetricsCollector
  processTask(task: ReturnType<typeof makeTask>): Promise<TaskProcessOutcome>
}

function setup(opts: {
  record?: GenerationRecord
  manifestMissing?: boolean
  submitTimeoutMs?: number
  asyncMaxDurationMs?: number
  artifactPersistTimeoutMs?: number
  manifest?: FrozenModelManifest
} = {}): Harness {
  const repo = new FakeRepository()
  repo.records.set('rec_1', opts.record ?? makeRecord())

  const runner = new FakeProviderRunner()
  const storage = new FakeStorageAdapter()
  const registry = new ProviderRegistry()
  registry.register(runner)

  const logger = createRecordingLogger()
  const metrics = new MetricsCollector()
  const executor = createTaskExecutor({
    repository: repo,
    providerRegistry: registry,
    modelRegistry: { getModelById: () => opts.manifestMissing === true ? undefined : opts.manifest ?? qwenImage },
    storage,
    logger,
    metrics,
    // fixtures 使用历史固定时间戳；让正常行为测试避开生产超时窗口，
    // 并在超时测试中覆盖该值。
    generationSubmitTimeoutMs: opts.submitTimeoutMs ?? 365 * 24 * 60 * 60 * 1000,
    providerAsyncMaxDurationMs: opts.asyncMaxDurationMs ?? 365 * 24 * 60 * 60 * 1000,
    artifactPersistTimeoutMs: opts.artifactPersistTimeoutMs ?? 365 * 24 * 60 * 60 * 1000,
  })

  return { repo, runner, storage, logger, metrics, processTask: (task) => executor.processTask(task) }
}

describe('TaskExecutor.processTask', () => {
  it('resolves durable asset references only for submit and forwards the reserved estimate', async () => {
    const manifest = getModelById('qwen-image-edit')
    if (manifest === undefined) throw new Error('qwen-image-edit manifest missing from registry')
    const { repo, runner, processTask } = setup({
      manifest,
      record: makeRecord({
        modelId: manifest.id,
        providerModel: manifest.providerModel,
        inputParams: { prompt: 'turn it into a poster' },
        costEstimate: 73,
      }),
    })
    const linkedAsset = {
      generationId: 'rec_1',
      parameterName: 'image',
      position: 0,
      assetId: 'asset_1',
      userId: 'user_1',
      kind: 'image',
      source: 'link',
      originalUrl: 'https://assets.example.com/reference.png',
    } satisfies GenerationInputAsset
    repo.generationInputAssets.set('rec_1', [linkedAsset])
    runner.outputs.push({
      success: true,
      output: makeImageOutput(),
      costCents: 73,
      requiresPoll: false,
    })

    await expect(processTask(makeTask())).resolves.toMatchObject({ status: 'succeeded' })

    expect(repo.generationInputAssetReads).toEqual(['rec_1'])
    expect(runner.inputs[0]).toMatchObject({
      estimatedCostCents: 73,
      inputParams: {
        prompt: 'turn it into a poster',
        image: ['https://assets.example.com/reference.png'],
      },
    })
  })

  it('does not resolve or re-sign generation assets while polling', async () => {
    const manifest = getModelById('qwen-image-edit')
    if (manifest === undefined) throw new Error('qwen-image-edit manifest missing from registry')
    const { repo, runner, storage, processTask } = setup({
      manifest,
      record: makeRecord({
        modelId: manifest.id,
        providerModel: manifest.providerModel,
        providerTaskId: 'provider-task-1',
        inputParams: { prompt: 'turn it into a poster' },
        costEstimate: 73,
      }),
    })
    repo.generationInputAssets.set('rec_1', [{
      generationId: 'rec_1',
      parameterName: 'image',
      position: 0,
      assetId: 'asset_1',
      userId: 'user_1',
      kind: 'image',
      source: 'link',
      originalUrl: '/api/assets/local/reference.png',
    }])
    runner.outputs.push({
      success: true,
      output: makeImageOutput(),
      costCents: 73,
      requiresPoll: false,
    })

    await expect(processTask(makeTask({ type: 'generation.poll' }))).resolves.toMatchObject({
      status: 'succeeded',
    })

    expect(repo.generationInputAssetReads).toEqual([])
    expect(storage.readUrls).toEqual([])
    expect(runner.inputs[0]).toMatchObject({
      providerTaskId: 'provider-task-1',
      estimatedCostCents: 73,
      inputParams: { prompt: 'turn it into a poster' },
    })
    expect(runner.inputs[0]?.inputParams).not.toHaveProperty('image')
  })

  it('fails a submit before audit/provider execution when an asset cannot become a public HTTP URL', async () => {
    const manifest = getModelById('qwen-image-edit')
    if (manifest === undefined) throw new Error('qwen-image-edit manifest missing from registry')
    const { repo, runner, processTask } = setup({
      manifest,
      record: makeRecord({
        modelId: manifest.id,
        providerModel: manifest.providerModel,
        inputParams: { prompt: 'turn it into a poster' },
      }),
    })
    repo.generationInputAssets.set('rec_1', [{
      generationId: 'rec_1',
      parameterName: 'image',
      position: 0,
      assetId: 'asset_1',
      userId: 'user_1',
      kind: 'image',
      source: 'link',
      originalUrl: '/api/assets/local/reference.png',
    }])

    await expect(processTask(makeTask())).resolves.toMatchObject({
      status: 'failed',
      error: {
        category: 'validation',
        code: 'GENERATION_INPUT_ASSET_URL_INVALID',
        retriable: false,
      },
    })

    expect(runner.inputs).toEqual([])
    expect(repo.providerRequests).toEqual([])
    expect(failedCodes(repo.mutations)).toEqual(['GENERATION_INPUT_ASSET_URL_INVALID'])
  })

  it('retries submit without provider execution when input asset signing is temporarily unavailable', async () => {
    const manifest = getModelById('qwen-image-edit')
    if (manifest === undefined) throw new Error('qwen-image-edit manifest missing from registry')
    const { repo, runner, storage, processTask } = setup({
      manifest,
      record: makeRecord({
        modelId: manifest.id,
        providerModel: manifest.providerModel,
        inputParams: { prompt: 'turn it into a poster' },
      }),
    })
    repo.generationInputAssets.set('rec_1', [{
      generationId: 'rec_1',
      parameterName: 'image',
      position: 0,
      assetId: 'asset_1',
      userId: 'user_1',
      kind: 'image',
      source: 'upload',
      storageProvider: 'local',
      storageKey: 'users/user_1/assets/reference.png',
    }])
    storage.readUrlFactory = () => {
      throw new Error('storage secret and signed URL must not escape')
    }

    await expect(processTask(makeTask({ attempts: 1, maxAttempts: 3 }))).resolves.toMatchObject({
      status: 'retry',
      error: {
        category: 'system',
        code: 'GENERATION_INPUT_ASSET_STORAGE_UNAVAILABLE',
        message: 'Unable to create a provider-readable URL for generation input asset',
        retriable: true,
      },
    })
    expect(runner.inputs).toEqual([])
    expect(repo.providerRequests).toEqual([])
    expect(repo.mutations).toEqual([])
  })

  it('returns a stable validation error for a malformed task record', async () => {
    const { repo, processTask } = setup()

    await expect(processTask(makeTask({ input: {} }))).resolves.toMatchObject({
      status: 'failed',
      error: { code: 'TASK_RECORD_ID_INVALID', category: 'validation' },
    })
    expect(repo.mutations).toEqual([])
  })

  it('fails when the generation record is missing', async () => {
    const { repo, logger, processTask } = setup()
    repo.records.delete('rec_1')

    const outcome = await processTask(makeTask())

    expect(outcome.status).toBe('failed')
    expect(failedCodes(repo.mutations)).toEqual(['RECORD_NOT_FOUND'])
    expect(logger.entries.some(e => e.message === 'record.not_found')).toBe(true)
  })

  it('fails when the model manifest is missing', async () => {
    const { repo, logger, processTask } = setup({ manifestMissing: true })

    const outcome = await processTask(makeTask())

    expect(outcome.status).toBe('failed')
    expect(failedCodes(repo.mutations)).toEqual(['MANIFEST_NOT_FOUND'])
    expect(logger.entries.some(e => e.message === 'manifest.not_found')).toBe(true)
  })

  it('fails an overdue submit task without invoking the provider', async () => {
    const { repo, runner, logger, processTask } = setup({
      record: makeRecord({ createdAt: '2020-01-01T00:00:00.000Z' }),
      submitTimeoutMs: 1,
    })

    const outcome = await processTask(makeTask())

    expect(outcome).toMatchObject({
      status: 'failed',
      error: { category: 'timeout', code: 'GENERATION_SUBMIT_TIMEOUT' },
    })
    expect(runner.inputs).toHaveLength(0)
    expect(failedCodes(repo.mutations)).toEqual(['GENERATION_SUBMIT_TIMEOUT'])
    expect(logger.entries.some(e => e.message === 'task.timeout')).toBe(true)
  })

  it('fails an overdue provider poll without invoking the provider', async () => {
    const { repo, runner, processTask } = setup({
      record: makeRecord({ createdAt: '2020-01-01T00:00:00.000Z', providerTaskId: 'provider-task-1' }),
      asyncMaxDurationMs: 1,
    })

    const outcome = await processTask(makeTask({ type: 'generation.poll' }))

    expect(outcome).toMatchObject({
      status: 'failed',
      error: { category: 'timeout', code: 'PROVIDER_ASYNC_TIMEOUT' },
    })
    expect(runner.inputs).toHaveLength(0)
    expect(failedCodes(repo.mutations)).toEqual(['PROVIDER_ASYNC_TIMEOUT'])
  })

  it('fails an overdue artifact persistence task before touching storage', async () => {
    const { repo, storage, processTask } = setup({ artifactPersistTimeoutMs: 1 })

    const outcome = await processTask(makeTask({ type: 'artifact.persist', domain: 'artifact' }))

    expect(outcome).toMatchObject({
      status: 'failed',
      error: { category: 'timeout', code: 'ARTIFACT_PERSIST_TIMEOUT' },
    })
    expect(storage.writes).toHaveLength(0)
  })

  it('completes the record when the provider returns synchronously', async () => {
    const { repo, runner, logger, metrics, processTask } = setup()
    runner.outputs.push({
      success: true,
      output: makeImageOutput(),
      costCents: 20,
      requiresPoll: false,
      providerStatus: 'SUCCEEDED',
    })

    const outcome = await processTask(makeTask())

    expect(outcome.status).toBe('succeeded')
    expect(repo.mutations.map(m => m.kind)).toEqual(['complete'])
    const completeMutation = repo.mutations.find(m => m.kind === 'complete')
    if (completeMutation?.kind !== 'complete') throw new Error('expected complete mutation')
    expect(completeMutation.input.costFinal).toBe(20)
    expect(repo.providerRequests).toHaveLength(1)
    expect(repo.providerRequests[0]).toMatchObject({
      operation: 'submit',
      status: 'succeeded',
      billedCostCents: 20,
    })
    expect(runner.inputs[0]?.providerTaskId).toBeUndefined()
    expect(logger.entries.some(e => e.message === 'task.succeeded')).toBe(true)
    expect(metrics.snapshot().counters['worker.task|outcome=succeeded,type=generation.submit']).toBe(1)
    expect(metrics.snapshot().counters['worker.provider_request|operation=submit,status=succeeded']).toBe(1)
    expect(metrics.snapshot().timers['worker.task.duration|type=generation.submit']?.count).toBe(1)
  })

  it('uses the generation-scoped submission key for provider retries', async () => {
    const { repo, runner, processTask } = setup()
    runner.outputs.push(
      { success: false, costCents: 0, requiresPoll: false, error: {
        code: 'PROVIDER_TIMEOUT', message: 'temporary', retryable: true, category: 'timeout',
      } },
      { success: true, output: makeImageOutput(), costCents: 20, requiresPoll: false },
    )

    await expect(processTask(makeTask({ attempts: 1 }))).resolves.toMatchObject({ status: 'retry' })
    await expect(processTask(makeTask({ attempts: 2 }))).resolves.toMatchObject({ status: 'succeeded' })

    expect(runner.inputs.map(input => input.idempotencyKey)).toEqual([
      'generation:rec_1:submit',
      'generation:rec_1:submit',
    ])
    expect(repo.providerRequests.map(request => request.idempotencyKey)).toEqual([
      'generation:rec_1:submit',
      'generation:rec_1:submit',
    ])
  })

  it('emits an operational signal when provider cost exceeds the reserved estimate', async () => {
    const { repo, runner, logger, metrics, processTask } = setup()
    repo.completionBillingAnomaly = { estimatedCents: 20, reportedCents: 80 }
    runner.outputs.push({
      success: true,
      output: makeImageOutput(),
      costCents: 80,
      requiresPoll: false,
      providerStatus: 'SUCCEEDED',
    })

    await expect(processTask(makeTask())).resolves.toMatchObject({ status: 'succeeded' })
    expect(logger.entries).toContainEqual(expect.objectContaining({
      level: 'warn',
      message: 'billing.anomaly',
      meta: expect.objectContaining({ estimatedCents: 20, reportedCents: 80 }),
    }))
    expect(metrics.snapshot().counters['worker.billing_anomaly|modelId=qwen-image']).toBe(1)
  })

  it('schedules a poll when the provider asks to keep polling', async () => {
    const { repo, runner, logger, processTask } = setup()
    runner.outputs.push({
      success: true,
      costCents: 0,
      requiresPoll: true,
      providerTaskId: 'prov_task_1',
      nextPollAt: '2026-06-28T00:00:10.000Z',
    })

    const outcome = await processTask(makeTask())

    expect(outcome.status).toBe('polling')
    if (outcome.status !== 'polling') throw new Error('unreachable')
    expect(outcome.nextPollAt).toBe('2026-06-28T00:00:10.000Z')
    expect(repo.mutations.map(m => m.kind)).toEqual(['schedulePoll'])
    expect(repo.providerRequests).toHaveLength(1)
    expect(repo.providerRequests[0]).toMatchObject({
      operation: 'submit',
      status: 'succeeded',
      providerTaskId: 'prov_task_1',
    })
    expect(repo.providerRequests[0]?.billedCostCents).toBeUndefined()
    expect(logger.entries.some(e => e.message === 'task.polling')).toBe(true)
  })

  it('fails when the provider requests polling without a providerTaskId', async () => {
    const { repo, runner, processTask } = setup({ record: makeRecord({ providerTaskId: undefined }) })
    // 模拟一个绕过 TypeScript 边界的第三方 runner，验证运行时仍会防御非法状态。
    runner.outputs.push({ success: true, costCents: 0, requiresPoll: true } as never)

    const outcome = await processTask(makeTask())

    expect(outcome.status).toBe('failed')
    expect(failedCodes(repo.mutations)).toEqual(['MISSING_PROVIDER_TASK_ID'])
  })

  it('fails the record when the provider reports an explicit failure', async () => {
    const { repo, runner, processTask } = setup()
    runner.outputs.push({
      success: false,
      costCents: 0,
      requiresPoll: false,
      error: { code: 'PROVIDER_VALIDATION_ERROR', message: 'bad params', retryable: false, category: 'validation' },
    })

    const outcome = await processTask(makeTask())

    expect(outcome.status).toBe('failed')
    expect(failedCodes(repo.mutations)).toEqual(['PROVIDER_VALIDATION_ERROR'])
    const failMutation = repo.mutations.find(m => m.kind === 'fail')
    if (failMutation?.kind !== 'fail') throw new Error('expected fail mutation')
    expect(failMutation.input.error.category).toBe('validation')
  })

  it('retries a structured retryable provider result without failing the record', async () => {
    const { repo, runner, processTask } = setup()
    runner.outputs.push({
      success: false,
      costCents: 0,
      requiresPoll: false,
      error: {
        code: 'Throttling.RateQuota',
        message: 'Rate limit exceeded',
        retryable: true,
        category: 'rate_limit',
        details: { requestId: 'request-rate-limit' },
      },
    })

    const outcome = await processTask(makeTask({ attempts: 1, maxAttempts: 3 }))

    expect(outcome).toMatchObject({
      status: 'retry',
      error: {
        code: 'Throttling.RateQuota',
        category: 'rate_limit',
        details: { requestId: 'request-rate-limit' },
      },
    })
    expect(repo.mutations).toEqual([])
  })

  it('fails a retryable provider result after its retry budget is exhausted', async () => {
    const { repo, runner, processTask } = setup()
    runner.outputs.push({
      success: false,
      costCents: 0,
      requiresPoll: false,
      error: { code: 'PROVIDER_BUSY', message: 'busy', retryable: true, category: 'provider' },
    })

    const outcome = await processTask(makeTask({ attempts: 3, maxAttempts: 3 }))

    expect(outcome.status).toBe('failed')
    expect(failedCodes(repo.mutations)).toEqual(['PROVIDER_BUSY'])
  })

  it('retries a retryable exception by rescheduling the same task', async () => {
    const { repo, runner, logger, processTask } = setup({
      record: makeRecord({ providerTaskId: 'prov_task_1' }),
    })
    runner.throwError = new Error('upstream network timeout')

    const outcome = await processTask(makeTask({ attempts: 1 }))

    expect(outcome.status).toBe('retry')
    // 没有任何仓库 mutation：'retry' 结果通过 transitionTask 重新调度当前任务
    // （由 worker loop 处理），而不是走 scheduleGenerationPoll。
    expect(repo.mutations.map(m => m.kind)).toEqual([])
    expect(logger.entries.some(e => e.message === 'task.retry')).toBe(true)
  })

  it('preserves structured exception diagnostics on retry outcomes', async () => {
    const { runner, processTask } = setup()
    runner.throwError = Object.assign(new Error('upstream unavailable'), {
      info: {
        category: 'provider',
        retriable: true,
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'upstream unavailable',
        details: { requestId: 'request-upstream' },
      },
    })

    await expect(processTask(makeTask({ attempts: 1, maxAttempts: 3 }))).resolves.toMatchObject({
      status: 'retry',
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        details: { requestId: 'request-upstream' },
      },
    })
  })

  it('retries a submit-stage exception even without a providerTaskId (re-calls submit)', async () => {
    // 一条瞬时网络错误消息若缺少旧的子串启发式所寻找的字面词
    // （"fetch failed" / "ECONNRESET"），也必须被重试；
    // 且 submit 阶段的失败应通过重新调度 submit 来重试，
    // 而不能因缺少可恢复的 providerTaskId 而被永久判失败。
    const { repo, runner, processTask } = setup({ record: makeRecord({ providerTaskId: undefined }) })
    runner.throwError = new Error('fetch failed: ECONNRESET')

    const outcome = await processTask(makeTask({ attempts: 0 }))

    expect(outcome.status).toBe('retry')
    expect(repo.mutations.map(m => m.kind)).toEqual([])
  })

  it('fails on a non-retryable (auth) exception', async () => {
    const { repo, runner, processTask } = setup({ record: makeRecord({ providerTaskId: 'prov_task_1' }) })
    runner.throwError = new Error('unauthorized: invalid api key')

    const outcome = await processTask(makeTask({ attempts: 0 }))

    expect(outcome.status).toBe('failed')
    expect(failedCodes(repo.mutations)).toEqual(['TASK_EXECUTION_ERROR'])
  })

  it('forwards the providerTaskId and completes on a generation.poll task', async () => {
    const { repo, runner, processTask } = setup({ record: makeRecord({ providerTaskId: 'prov_task_1' }) })
    runner.outputs.push({
      success: true,
      output: makeImageOutput(),
      costCents: 20,
      requiresPoll: false,
      providerStatus: 'SUCCEEDED',
    })

    const outcome = await processTask(makeTask({ type: 'generation.poll' }))

    expect(outcome.status).toBe('succeeded')
    expect(runner.inputs[0]?.providerTaskId).toBe('prov_task_1')
    expect(repo.mutations.map(m => m.kind)).toEqual(['complete'])
  })

  it('does not report success when the repository says cancellation won the completion race', async () => {
    const { repo, runner, processTask } = setup()
    repo.completionOutcome = 'cancelled'
    runner.outputs.push({
      success: true,
      output: makeImageOutput(),
      costCents: 20,
      requiresPoll: false,
      providerStatus: 'SUCCEEDED',
    })

    const outcome = await processTask(makeTask())

    expect(outcome.status).toBe('cancelled')
    if (outcome.status !== 'cancelled') throw new Error('unreachable')
    expect(outcome.error.code).toBe('GENERATION_CANCELLED')
    expect(repo.mutations.map(m => m.kind)).toEqual(['complete'])
  })

  it('persists pending artifacts without invoking a provider runner', async () => {
    const { repo, runner, storage, processTask } = setup()
    repo.artifacts.set('artifact_1', makeArtifact({ text: 'stored text' }))

    const outcome = await processTask(makeTask({ type: 'artifact.persist', domain: 'artifact' }))

    expect(outcome.status).toBe('succeeded')
    expect(runner.inputs).toHaveLength(0)
    expect(storage.writes).toHaveLength(1)
    expect(storage.writes[0]?.key).toBe('generations/rec_1/artifact_1.txt')
    expect(new TextDecoder().decode(storage.writes[0]?.body)).toBe('stored text')
    expect(repo.artifacts.get('artifact_1')?.status).toBe('stored')
    expect(repo.mutations.map(m => m.kind)).toEqual(['markArtifactStored'])
  })

  it('skips provider execution and cancels the record when it was cancelled before submit', async () => {
    const { repo, runner, processTask } = setup({
      record: makeRecord({ status: 'cancelled', cancelRequestedAt: '2026-07-02T00:00:00.000Z' }),
    })
    // 即便 runner 队列里有一个成功输出，executor 也不应调用它。
    runner.outputs.push({
      success: true,
      output: makeImageOutput(),
      costCents: 20,
      requiresPoll: false,
      providerStatus: 'SUCCEEDED',
    })

    const outcome = await processTask(makeTask())

    // 取消短路产出 cancelled outcome（不是 failed），且记录走 cancelGeneration（不是 failGeneration）。
    expect(outcome.status).toBe('cancelled')
    if (outcome.status !== 'cancelled') throw new Error('unreachable')
    expect(outcome.error.code).toBe('GENERATION_CANCELLED')
    expect(outcome.error.category).toBe('cancelled')
    expect(runner.inputs).toHaveLength(0)
    expect(cancelledCodes(repo.mutations)).toEqual(['GENERATION_CANCELLED'])
    expect(failedCodes(repo.mutations)).toEqual([])
  })

  it('skips provider execution and cancels when cancelRequestedAt is set even if status is processing', async () => {
    const { repo, runner, processTask } = setup({
      record: makeRecord({
        status: 'processing',
        cancelRequestedAt: '2026-07-02T00:00:00.000Z',
        providerCancelStatus: 'requested',
      }),
    })
    runner.outputs.push({
      success: true,
      output: makeImageOutput(),
      costCents: 20,
      requiresPoll: false,
      providerStatus: 'SUCCEEDED',
    })

    const outcome = await processTask(makeTask())

    expect(outcome.status).toBe('cancelled')
    expect(runner.inputs).toHaveLength(0)
    expect(cancelledCodes(repo.mutations)).toEqual(['GENERATION_CANCELLED'])
    expect(failedCodes(repo.mutations)).toEqual([])
  })

  it('actively cancels a submitted provider task before closing the local record', async () => {
    const { repo, runner, processTask } = setup({
      record: makeRecord({
        status: 'processing',
        providerTaskId: 'provider-task-1',
        cancelRequestedAt: '2026-07-02T00:00:00.000Z',
        providerCancelStatus: 'requested',
      }),
    })
    runner.cancelOutput = { status: 'cancelled', requestId: 'cancel-request-1' }

    const outcome = await processTask(makeTask({ type: 'generation.poll' }))

    expect(outcome.status).toBe('cancelled')
    expect(runner.cancelInputs).toHaveLength(1)
    expect(runner.cancelInputs[0]?.providerTaskId).toBe('provider-task-1')
    expect(repo.providerRequests).toHaveLength(1)
    expect(repo.providerRequests[0]).toMatchObject({
      operation: 'cancel',
      status: 'succeeded',
      providerRequestId: 'cancel-request-1',
    })
    expect(repo.mutations).toContainEqual(expect.objectContaining({
      kind: 'cancelGeneration',
      input: expect.objectContaining({ providerCancelStatus: 'succeeded' }),
    }))
  })

  it('skips provider execution without mutating the record when a stale task points at a succeeded generation', async () => {
    // 陈旧任务：记录已完成（succeeded）但残留了 cancelRequestedAt（取消请求与完成
    // 几乎同时落地的竞态）。worker 绝不应调用 provider，也不应改写记录——只把任务
    // 以 cancelled + STALE_GENERATION_TASK 收尾。
    const { repo, runner, processTask } = setup({
      record: makeRecord({
        status: 'succeeded',
        cancelRequestedAt: '2026-07-03T00:00:00.000Z',
        providerCancelStatus: 'requested',
        outputResult: { artifacts: [{ kind: 'image', sourceUrl: 'https://example.test/done.png' }] },
      }),
    })
    runner.outputs.push({
      success: true,
      output: makeImageOutput(),
      costCents: 20,
      requiresPoll: false,
      providerStatus: 'SUCCEEDED',
    })

    const outcome = await processTask(makeTask({ type: 'generation.poll' }))

    expect(outcome.status).toBe('cancelled')
    if (outcome.status !== 'cancelled') throw new Error('unreachable')
    expect(outcome.error.code).toBe('STALE_GENERATION_TASK')
    expect(runner.inputs).toHaveLength(0)
    // 关键：没有任何记录变更（既不 cancelGeneration 也不 failGeneration）。
    expect(repo.mutations.map(m => m.kind)).toEqual([])
  })

  it('extracts audio for media.process tasks and completes the media job', async () => {
    const repo = new FakeRepository()
    const mediaRepo = new FakeMediaRepository()
    const processor = new FakeMediaProcessor()
    const storage = new FakeStorageAdapter()
    const registry = new ProviderRegistry()
    const executor = createTaskExecutor({
      repository: repo,
      mediaRepository: mediaRepo,
      mediaProcessor: processor,
      providerRegistry: registry,
      modelRegistry: { getModelById: () => qwenImage },
      storage,
      logger: createRecordingLogger(),
    })

    const outcome = await executor.processTask(makeMediaTask())

    expect(outcome.status).toBe('succeeded')
    expect(mediaRepo.processingJobIds).toEqual(['media_job_1'])
    expect(processor.inputs[0]).toMatchObject({
      jobId: 'media_job_1',
      sourceBody: expect.any(Uint8Array),
      sourceFileName: 'video.mp4',
      format: 'mp3',
    })
    expect(storage.writes).toHaveLength(1)
    expect(storage.writes[0]?.contentType).toBe('audio/mpeg')
    expect(mediaRepo.completed[0]?.outputAsset.kind).toBe('audio')
    expect(mediaRepo.failed).toHaveLength(0)
  })

  it('marks the media job failed when media processing fails', async () => {
    const mediaRepo = new FakeMediaRepository()
    const processor = new FakeMediaProcessor()
    processor.throwError = taskErrorCarrier({
      category: 'system',
      message: 'ffmpeg missing',
      retriable: false,
      code: 'FFMPEG_NOT_CONFIGURED',
    })
    const executor = createTaskExecutor({
      repository: new FakeRepository(),
      mediaRepository: mediaRepo,
      mediaProcessor: processor,
      providerRegistry: new ProviderRegistry(),
      modelRegistry: { getModelById: () => qwenImage },
      storage: new FakeStorageAdapter(),
      logger: createRecordingLogger(),
    })

    const outcome = await executor.processTask(makeMediaTask())

    expect(outcome.status).toBe('failed')
    expect(mediaRepo.failed[0]?.error.code).toBe('FFMPEG_NOT_CONFIGURED')
    expect(mediaRepo.completed).toHaveLength(0)
  })
})

function taskErrorCarrier(error: TaskError): Error & { taskError: TaskError } {
  const carrier = new Error(error.message) as Error & { taskError: TaskError }
  carrier.taskError = error
  return carrier
}
