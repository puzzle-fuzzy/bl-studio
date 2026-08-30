/**
 * Bailian Studio worker 入口。
 *
 * 把 generation 仓库、provider 注册表与模型注册表装配进 WorkerLoop，
 * 并一直运行直到收到停止信号。
 */

import { getModelById } from '@bailian-studio/dashscope-manifests'
import { createWorkerPersistenceRuntime } from '@bailian-studio/persistence-runtime'
import { createStorageFromEnv } from '@bailian-studio/storage'
import { readGenerationLimits } from '@bailian-studio/shared'
import { WorkerLoop, type WorkerLoopConfig } from './worker-loop'
import { createFfmpegMediaProcessor } from './media-processor'
import { createProviderRegistry } from './providers'
import { verifyBailianRuntime } from './bailian-runtime'
import { readWorkerEnv } from './config'

// 为编程式使用而重新导出。
export {
  createTaskExecutor,
  type TaskProcessOutcome,
  type ModelRegistryLookup,
} from './task-executor'
export type { TaskExecutor } from './task-executor'
export {
  persistArtifactsForRecord,
  DEFAULT_ARTIFACT_FETCH_MAX_BYTES,
  DEFAULT_ARTIFACT_FETCH_TIMEOUT_MS,
  type ArtifactFetchPolicy,
  type PersistArtifactsForRecordResult,
} from './artifact-persist'
export {
  ArtifactFetchError,
  fetchProviderArtifact,
  type ArtifactFetch,
  type ArtifactFetchErrorCode,
  type FetchProviderArtifactInput,
  type ProviderArtifactKind,
  type VerifiedArtifactResponse,
} from './artifact-fetch'
export {
  FfmpegMediaProcessor,
  createFfmpegMediaProcessor,
  ffmpegThumbnailArgs,
  ffmpegAssemblyArgs,
  type ExtractAudioInput,
  type ExtractAudioOutput,
  type GenerateThumbnailInput,
  type GenerateThumbnailOutput,
  type AssembleVideoInput,
  type AssembleVideoOutput,
  type MediaProcessor,
} from './media-processor'
export {
  createProviderRegistry,
  ProviderRegistry,
  type CreateProviderRegistryOptions,
  type ProviderCancelInput,
  type ProviderCancelOutput,
  type ProviderExecuteInput,
  type ProviderExecuteOutput,
  type ProviderError,
  type ProviderRunner,
} from './providers'
export {
  DashScopeProviderRunner,
  type CreateDashScopeRunnerOptions,
} from './providers'
export { WorkerLoop, type WorkerLoopConfig } from './worker-loop'
export {
  verifyBailianRuntime,
  type BailianRuntimeSnapshot,
} from './bailian-runtime'
export { readWorkerEnv, type WorkerEnv } from './config'

async function main(): Promise<void> {
  const env = readWorkerEnv()
  const bailianRuntime = verifyBailianRuntime()

  const persistence = createWorkerPersistenceRuntime({
    databaseUrl: env.databaseUrl,
    modelResolver: { getModelById },
  })

  const providerRegistry = createProviderRegistry({
    ...(env.dashscopeApiKey === undefined
      ? {}
      : {
          dashscope: {
            apiKey: env.dashscopeApiKey,
            ...(env.bailianWorkspaceId === undefined
              ? {}
              : { workspaceId: env.bailianWorkspaceId }),
            errorLocale: env.errorLocale,
            ...(env.dashscopeRequestTimeoutMs === undefined
              ? {}
              : { requestTimeoutMs: env.dashscopeRequestTimeoutMs }),
          },
        }),
  })
  const storage = createStorageFromEnv({ env: process.env })

  const config: WorkerLoopConfig = {
    workerId: env.workerId,
    repository: persistence.generationRepository,
    generationRecoveryRepository: persistence.generationRecoveryRepository,
    taskRepository: persistence.taskQueueRepository,
    assetRepository: persistence.assetRepository,
    providerRequestAuditRepository: persistence.providerRequestAuditRepository,
    auditOutboxRepository: persistence.auditOutboxRepository,
    directorRepository: persistence.directorRepository,
    mediaRepository: persistence.mediaRepository,
    providerRegistry,
    modelRegistry: { getModelById },
    storage,
    mediaProcessor: createFfmpegMediaProcessor({
      ...(env.ffmpegPath === undefined ? {} : { ffmpegPath: env.ffmpegPath }),
    }),
    lockDurationMs:
      env.workerLockDurationMs ??
      Math.max(90_000, (env.dashscopeRequestTimeoutMs ?? 60_000) + 15_000),
    ...(env.generationSubmitTimeoutMs === undefined
      ? {}
      : { generationSubmitTimeoutMs: env.generationSubmitTimeoutMs }),
    ...(env.providerAsyncMaxDurationMs === undefined
      ? {}
      : { providerAsyncMaxDurationMs: env.providerAsyncMaxDurationMs }),
    ...(env.artifactPersistTimeoutMs === undefined
      ? {}
      : { artifactPersistTimeoutMs: env.artifactPersistTimeoutMs }),
    ...(env.artifactFetchMaxBytes === undefined &&
    env.artifactFetchTimeoutMs === undefined &&
    env.artifactFetchMaxRedirects === undefined &&
    env.artifactFetchAllowedHosts === undefined
      ? {}
      : {
          artifactFetch: {
            ...(env.artifactFetchMaxBytes === undefined
              ? {}
              : { maxBytes: env.artifactFetchMaxBytes }),
            ...(env.artifactFetchTimeoutMs === undefined
              ? {}
              : { timeoutMs: env.artifactFetchTimeoutMs }),
            ...(env.artifactFetchMaxRedirects === undefined
              ? {}
              : { maxRedirects: env.artifactFetchMaxRedirects }),
            ...(env.artifactFetchAllowedHosts === undefined
              ? {}
              : { allowedHosts: env.artifactFetchAllowedHosts }),
          },
        }),
    ...(env.workerLockHeartbeatMs === undefined
      ? {}
      : { lockHeartbeatMs: env.workerLockHeartbeatMs }),
    ...(env.workerHeartbeatIntervalMs === undefined
      ? {}
      : { workerHeartbeatIntervalMs: env.workerHeartbeatIntervalMs }),
    ...(env.workerStaleGenerationSweepIntervalMs === undefined
      ? {}
      : {
          staleGenerationSweepIntervalMs:
            env.workerStaleGenerationSweepIntervalMs,
        }),
    pollIntervalMs: env.workerPollIntervalMs ?? 100,
    idleSleepMs: env.workerIdleSleepMs ?? 1000,
    // 导演流程在 worker 侧创建 generation，必须与 API 路径共用同一份每日限额，
    // 否则导演阶段任务成为绕过任务数/成本日限额的旁路。
    generationQuota: readGenerationLimits(process.env),
    // P1-27：接入 credit-ledger，worker 周期兜底释放「终态 generation 的僵尸 reserve」。
    creditLedger: persistence.creditLedger,
  }

  const loop = new WorkerLoop(config)

  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`[${env.workerId}] received ${signal}, stopping...`)
    loop.stop()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    console.log(
      `[${env.workerId}] DashScope runtime: ${bailianRuntime.enabledModelCount}/${bailianRuntime.modelCount} models enabled`,
    )
    console.log(`[${env.workerId}] starting`)
    await loop.run()
    console.log(`[${env.workerId}] stopped`)
  } finally {
    await persistence.close()
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(
      'Worker failed to start:',
      error instanceof Error ? error.message : error,
    )
    process.exit(1)
  })
}
