import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createIsolatedGenerationRepository, createTestUser, grantTestCredits, type IsolatedGenerationRepository } from '@bailian-studio/generation-repository'
import { getModelById, type FrozenModelManifest } from '@bailian-studio/model-core'
import { ProviderRegistry } from '../src/providers'
import type { ProviderExecuteInput, ProviderExecuteOutput, ProviderRunner } from '../src/providers'
import { createTaskQueueRepository, type TaskQueueRepository } from '@bailian-studio/task-repository'
import { WorkerLoop } from '../src/worker-loop'
import { FakeStorageAdapter } from './fixtures'
import { FakeMediaProcessor } from './media-fixtures'

let iso: IsolatedGenerationRepository
let taskRepository!: TaskQueueRepository
const IMAGE_DATA_URL = 'data:image/png;base64,iVBORw0KGgo='
const VIDEO_DATA_URL = 'data:video/mp4;base64,AAAAIGZ0eXBpc29t'

beforeAll(async () => {
  iso = await createIsolatedGenerationRepository()
  taskRepository = createTaskQueueRepository({ db: iso.db })
  // 创建测试用户以满足外键约束
  await createTestUser(iso.databaseUrl, 'user_e2e')
  await createTestUser(iso.databaseUrl, 'user_e2e_poll')
  await createTestUser(iso.databaseUrl, 'user_e2e_multi')
  await grantTestCredits(iso.db, 'user_e2e', 1_000, 'worker integration seed')
  await grantTestCredits(iso.db, 'user_e2e_poll', 1_000, 'worker integration seed')
  await grantTestCredits(iso.db, 'user_e2e_multi', 1_000, 'worker integration seed')
})

afterAll(async () => {
  await iso?.close()
})

/**
 * 输出预先排队的 runner；supports() 恒为 true，
 * 因此 ProviderRegistry.resolve() 会为任何 manifest 选中它。
 */
class ScriptedRunner implements ProviderRunner {
  readonly providerId = 'scripted'
  private readonly outputs: ProviderExecuteOutput[]
  private readonly executeDelayMs: number
  private cursor = 0
  constructor(outputs: ProviderExecuteOutput[], executeDelayMs = 0) {
    this.outputs = outputs
    this.executeDelayMs = executeDelayMs
  }
  supports(_manifest: FrozenModelManifest): boolean {
    return true
  }
  async execute(_input: ProviderExecuteInput): Promise<ProviderExecuteOutput> {
    if (this.executeDelayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, this.executeDelayMs))
    }
    const next = this.outputs[this.cursor++]
    if (next === undefined) throw new Error('ScriptedRunner exhausted')
    return next
  }
}

function buildLoop(
  outputs: ProviderExecuteOutput[],
  workerId = 'e2e',
  executeDelayMs = 0,
  concurrency = 3,
): WorkerLoop {
  const registry = new ProviderRegistry()
  registry.register(new ScriptedRunner(outputs, executeDelayMs))
  return new WorkerLoop({
    workerId,
    repository: iso.repository,
    generationRecoveryRepository: iso.generationRecoveryRepository,
    taskRepository,
    providerRequestAuditRepository: iso.providerRequestAuditRepository,
    providerRegistry: registry,
    modelRegistry: { getModelById },
    storage: new FakeStorageAdapter(),
    mediaProcessor: new FakeMediaProcessor(),
    pollIntervalMs: 5,
    idleSleepMs: 5,
    concurrency,
  })
}

async function runUntilSucceeded(loop: WorkerLoop, recordId: string, timeoutMs: number): Promise<void> {
  const run = loop.run()
  try {
    const start = Date.now()
    while (Date.now() - start < timeoutMs) {
      const record = await iso.repository.getGenerationRecord(recordId)
      if (record?.status === 'succeeded') {
        // generation 状态会在可选的 artifact.persist 任务完成前先到达 succeeded。
        // 不要让下一个测试认领仍排队的该任务，否则集成测试套件会产生顺序依赖。
        const pendingArtifacts = await iso.repository.listPendingArtifactsForRecord(recordId)
    const generatedAsset = (await iso.assetRepository.listUnifiedAssets(record.userId, {
          source: 'generation',
        })).items.find(asset => asset.recordId === recordId)
        if (
          pendingArtifacts.length === 0
          && generatedAsset?.thumbnailStatus === 'ready'
        ) return
      }
      if (record?.status === 'failed') throw new Error(`record failed unexpectedly: ${record.statusReason ?? ''}`)
      await new Promise(r => setTimeout(r, 10))
    }
    throw new Error('runUntilSucceeded timed out')
  } finally {
    loop.stop()
    await run
  }
}

describe('worker e2e', () => {
  it('drives a completed provider result to a succeeded record', async () => {
    const created = await iso.repository.createGeneration({
      userId: 'user_e2e',
      modelId: 'qwen-image',
      params: { prompt: 'a red lantern', n: 1, size: '1328*1328' },
    })

    const loop = buildLoop([{
      success: true,
      costCents: 20,
      requiresPoll: false,
      output: { artifacts: [{ kind: 'image', sourceUrl: IMAGE_DATA_URL }], raw: { ok: true } },
    }])

    await runUntilSucceeded(loop, created.record.id, 5000)

    const final = await iso.repository.getGenerationRecord(created.record.id)
    expect(final?.status).toBe('succeeded')
    const artifacts = final?.outputResult?.artifacts
    expect(Array.isArray(artifacts)).toBe(true)
    if (Array.isArray(artifacts)) {
      expect(artifacts[0]).toMatchObject({ kind: 'image', sourceUrl: IMAGE_DATA_URL })
    }
    const generatedAsset = (await iso.assetRepository.listUnifiedAssets('user_e2e', {
      source: 'generation',
    })).items.find(asset => asset.recordId === created.record.id)
    expect(generatedAsset).toMatchObject({
      kind: 'image',
      source: 'generation',
      recordId: created.record.id,
      modelId: 'qwen-image',
      thumbnailStatus: 'ready',
    })
    expect(generatedAsset?.url).toBeUndefined()
  })

  it('drives a polling-then-completed async result to succeeded', async () => {
    const created = await iso.repository.createGeneration({
      userId: 'user_e2e_poll',
      modelId: 'wanx-text-to-video',
      params: { prompt: 'ocean', size: '1280*720', duration: 5 },
    })

    const loop = buildLoop([
      { success: true, costCents: 40, requiresPoll: true, providerTaskId: 'prov_1', nextPollAt: new Date(0).toISOString() },
      { success: true, costCents: 40, requiresPoll: false, output: { artifacts: [{ kind: 'video', sourceUrl: VIDEO_DATA_URL }], raw: {} } },
    ])

    await runUntilSucceeded(loop, created.record.id, 5000)

    const final = await iso.repository.getGenerationRecord(created.record.id)
    expect(final?.status).toBe('succeeded')
    expect(final?.providerTaskId).toBe('prov_1')
  })

  it('recovers a task after the first worker disappears with an expired lease', async () => {
    const created = await iso.repository.createGeneration({
      userId: 'user_e2e',
      modelId: 'qwen-image',
      params: { prompt: 'recovery lantern', n: 1, size: '1328*1328' },
    })
    const baseTime = Date.now()
    const taskBeforeCrash = await taskRepository.claimNextQueuedTask({
      workerId: 'worker-crashed',
      now: new Date(baseTime).toISOString(),
      lockedUntil: new Date(baseTime + 1_000).toISOString(),
    })

    expect(taskBeforeCrash?.id).toBe(created.task.id)
    expect(taskBeforeCrash?.lockedBy).toBe('worker-crashed')
    expect(await taskRepository.claimNextQueuedTask({
      workerId: 'worker-recovery',
      now: new Date(baseTime + 500).toISOString(),
      lockedUntil: new Date(baseTime + 60_000).toISOString(),
    })).toBeUndefined()

    const recoveredTask = await taskRepository.claimNextQueuedTask({
      workerId: 'worker-recovery',
      now: new Date(baseTime + 1_500).toISOString(),
      lockedUntil: new Date(Date.now() + 60_000).toISOString(),
    })
    expect(recoveredTask?.id).toBe(created.task.id)
    expect(recoveredTask?.lockedBy).toBe('worker-recovery')

    const loop = buildLoop([{
      success: true,
      costCents: 20,
      requiresPoll: false,
      output: { artifacts: [{ kind: 'image', sourceUrl: IMAGE_DATA_URL }], raw: { recovered: true } },
    }], 'worker-recovery')
    await loop.runTask(recoveredTask!)
    // runTask 只处理已认领的 generation.submit；继续运行同一 loop 以排空
    // artifact.persist/thumbnail 等后续任务，保证用例不会给下一个用例遗留 queued 行。
    await runUntilSucceeded(loop, created.record.id, 5000)

    const final = await iso.repository.getGenerationRecord(created.record.id)
    expect(final?.status).toBe('succeeded')
  })

  it('lets two real WorkerLoops consume two Postgres tasks without duplicate completion', async () => {
    const first = await iso.repository.createGeneration({
      userId: 'user_e2e_multi',
      modelId: 'qwen-image',
      params: { prompt: 'multi worker one', n: 1, size: '1328*1328' },
    })
    const second = await iso.repository.createGeneration({
      userId: 'user_e2e_multi',
      modelId: 'qwen-image',
      params: { prompt: 'multi worker two', n: 1, size: '1328*1328' },
    })

    // P1-26：本测试验证共享队列「不重复完成」的契约，不测并发分发；
    // 每个 runner 只预置 1 个 output，须用 concurrency=1 保证两 worker 各认领一条。
    await Promise.all([
      runUntilSucceeded(buildLoop([{
        success: true,
        costCents: 20,
        requiresPoll: false,
        output: { artifacts: [{ kind: 'image', sourceUrl: IMAGE_DATA_URL }], raw: { worker: 'a' } },
      }], 'worker-a', 50, 1), first.record.id, 5000),
      runUntilSucceeded(buildLoop([{
        success: true,
        costCents: 20,
        requiresPoll: false,
        output: { artifacts: [{ kind: 'image', sourceUrl: IMAGE_DATA_URL }], raw: { worker: 'b' } },
      }], 'worker-b', 50, 1), second.record.id, 5000),
    ])

    expect((await iso.repository.getGenerationRecord(first.record.id))?.status).toBe('succeeded')
    expect((await iso.repository.getGenerationRecord(second.record.id))?.status).toBe('succeeded')
  })
})
