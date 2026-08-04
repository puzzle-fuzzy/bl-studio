import type { NormalizedGenerationOutput } from '@bailian-studio/generation-repository'
import type { FrozenModelManifest } from '@bailian-studio/model-core'
import type { TaskError } from '@bailian-studio/task-engine'

/** Task executor 对模型目录唯一需要的只读查询能力。 */
export interface ModelRegistryLookup {
  getModelById(id: string): FrozenModelManifest | undefined
}

/** WorkerLoop 消费的统一任务结果；各任务处理器共享同一判别联合。 */
export type TaskProcessOutcome =
  | { status: 'succeeded'; output: NormalizedGenerationOutput }
  | { status: 'polling'; nextPollAt: string }
  | { status: 'failed'; error: TaskError }
  | { status: 'retry'; nextRunAt: string; error: TaskError }
  | { status: 'cancelled'; error: TaskError }
