import type { NormalizedGenerationOutput } from '@bailian-studio/generation-repository'
import type { FrozenModelManifest } from '@bailian-studio/dashscope-manifests'
import type { TaskError } from '@bailian-studio/task-engine'

/** Task executor 对模型目录唯一需要的只读查询能力。 */
export interface ModelRegistryLookup {
  getModelById(id: string): FrozenModelManifest | undefined
}

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
