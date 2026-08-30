import type { NormalizedGenerationOutput } from '@bailian-studio/generation-repository'
import type { FrozenModelManifest } from '@bailian-studio/dashscope-manifests'
import type { ModelCatalog } from '@bailian-studio/model-core'
import type { TaskError } from '@bailian-studio/task-engine'

/**
 * Task executor 对模型目录唯一需要的只读查询能力。
 *
 * 该 port 的 concrete manifest 类型刻意保留在 provider runner 边界：
 * generation task 最终需要把同一份 manifest 交给 ProviderRegistry.resolve，
 * 由 concrete runner 读取 provider request/output/transport mapping。
 */
export interface ModelRegistryLookup {
  getModelById(id: string): FrozenModelManifest | undefined
}

/** Worker 编排层对模型目录的最小 provider-neutral 查询端口。 */
export type ModelCatalogLookup = Pick<ModelCatalog, 'getById'>

/** WorkerLoop 消费的统一任务结果；各任务处理器共享同一判别联合。 */
export type TaskProcessOutcome =
  | {
      status: 'succeeded'
      output: NormalizedGenerationOutput
      nextInput?: Record<string, unknown>
    }
  | {
      status: 'polling'
      nextPollAt: string
      nextInput?: Record<string, unknown>
    }
  | { status: 'failed'; error: TaskError; nextInput?: Record<string, unknown> }
  | {
      status: 'retry'
      nextRunAt: string
      error: TaskError
      nextInput?: Record<string, unknown>
    }
  | {
      status: 'cancelled'
      error: TaskError
      nextInput?: Record<string, unknown>
    }
