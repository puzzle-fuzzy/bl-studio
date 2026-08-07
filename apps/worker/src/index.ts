/**
 * Bailian Studio worker 入口。
 *
 * 把 generation 仓库、provider 注册表与模型注册表装配进 WorkerLoop，
 * 并一直运行直到收到停止信号。
 */

import { getModelById } from '@bailian-studio/model-core'
import { createGenerationRepositoryFromUrl } from '@bailian-studio/generation-repository'
import { createMediaRepositoryFromUrl } from '@bailian-studio/media-repository'
import { createStorageFromEnv } from '@bailian-studio/storage'
import { WorkerLoop, type WorkerLoopConfig } from './worker-loop'
import { createFfmpegMediaProcessor } from './media-processor'
import { createProviderRegistry } from './providers'
import { verifyBailianRuntime } from './bailian-runtime'
import { readWorkerEnv } from './config'

// 为编程式使用而重新导出。
export { createTaskExecutor, type TaskProcessOutcome, type ModelRegistryLookup } from './task-executor'
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
  type ExtractAudioInput,
  type ExtractAudioOutput,
  type GenerateThumbnailInput,
  type GenerateThumbnailOutput,
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
export { DashScopeProviderRunner, type CreateDashScopeRunnerOptions } from './providers'
export { WorkerLoop, type WorkerLoopConfig } from './worker-loop'
export { verifyBailianRuntime, type BailianRuntimeSnapshot } from './bailian-runtime'
export { readWorkerEnv, type WorkerEnv } from './config'

async function main(): Promise<void> {
  const env = readWorkerEnv()
  const bailianRuntime = verifyBailianRuntime()

  const generationHandle = createGenerationRepositoryFromUrl(env.databaseUrl)
  const mediaHandle = createMediaRepositoryFromUrl(env.databaseUrl)

  const providerRegistry = createProviderRegistry({
    dashscope: {
      apiKey: env.dashscopeApiKey,
      ...(env.bailianWorkspaceId === undefined ? {} : { workspaceId: env.bailianWorkspaceId }),
      errorLocale: env.errorLocale,
      ...(env.dashscopeRequestTimeoutMs === undefined ? {} : { requestTimeoutMs: env.dashscopeRequestTimeoutMs }),
    },
  })
  const storage = createStorageFromEnv({ env: process.env })

  const config: WorkerLoopConfig = {
    workerId: env.workerId,
    repository: generationHandle.repository,
    mediaRepository: mediaHandle.repository,
    providerRegistry,
    modelRegistry: { getModelById },
    storage,
    mediaProcessor: createFfmpegMediaProcessor({
      ...(env.ffmpegPath === undefined ? {} : { ffmpegPath: env.ffmpegPath }),
    }),
    lockDurationMs: env.workerLockDurationMs ?? Math.max(90_000, (env.dashscopeRequestTimeoutMs ?? 60_000) + 15_000),
    ...(env.generationSubmitTimeoutMs === undefined ? {} : { generationSubmitTimeoutMs: env.generationSubmitTimeoutMs }),
    ...(env.providerAsyncMaxDurationMs === undefined ? {} : { providerAsyncMaxDurationMs: env.providerAsyncMaxDurationMs }),
    ...(env.artifactPersistTimeoutMs === undefined ? {} : { artifactPersistTimeoutMs: env.artifactPersistTimeoutMs }),
    ...((env.artifactFetchMaxBytes === undefined
      && env.artifactFetchTimeoutMs === undefined
      && env.artifactFetchMaxRedirects === undefined
      && env.artifactFetchAllowedHosts === undefined)
      ? {}
      : {
          artifactFetch: {
            ...(env.artifactFetchMaxBytes === undefined ? {} : { maxBytes: env.artifactFetchMaxBytes }),
            ...(env.artifactFetchTimeoutMs === undefined ? {} : { timeoutMs: env.artifactFetchTimeoutMs }),
            ...(env.artifactFetchMaxRedirects === undefined ? {} : { maxRedirects: env.artifactFetchMaxRedirects }),
            ...(env.artifactFetchAllowedHosts === undefined ? {} : { allowedHosts: env.artifactFetchAllowedHosts }),
          },
        }),
    ...(env.workerLockHeartbeatMs === undefined ? {} : { lockHeartbeatMs: env.workerLockHeartbeatMs }),
    ...(env.workerHeartbeatIntervalMs === undefined ? {} : { workerHeartbeatIntervalMs: env.workerHeartbeatIntervalMs }),
    pollIntervalMs: env.workerPollIntervalMs ?? 100,
    idleSleepMs: env.workerIdleSleepMs ?? 1000,
  }

  const loop = new WorkerLoop(config)

  const shutdown = (signal: NodeJS.Signals): void => {
    console.log(`[${env.workerId}] received ${signal}, stopping...`)
    loop.stop()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  try {
    console.log(`[${env.workerId}] DashScope runtime: ${bailianRuntime.enabledModelCount}/${bailianRuntime.modelCount} models enabled`)
    console.log(`[${env.workerId}] starting`)
    await loop.run()
    console.log(`[${env.workerId}] stopped`)
  } finally {
    await Promise.all([generationHandle.close(), mediaHandle.close()])
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error('Worker failed to start:', error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
