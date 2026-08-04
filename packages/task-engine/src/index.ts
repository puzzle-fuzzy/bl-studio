/**
 * @bailian-studio/task-engine 的统一出口。
 *
 * 本包是【纯】状态机 + 退避计算（无 DB、无 Elysia/React），由
 * @bailian-studio/generation-repository 与 @bailian-studio/worker 消费：
 *  - transitionTask：task 的状态转换（queued → running → succeeded/failed/...）；
 *  - nextRunAt / calculateRetryDelayMs：重试的指数退避计算。
 */
export { transitionTask } from './state-machine'
export { calculateRetryDelayMs, nextRunAt } from './retry'
export type { RetryBackoffOptions } from './retry'
export type {
  TaskDomain,
  TaskError,
  TaskErrorCategory,
  TaskRecord,
  TaskStatus,
  TaskTransition,
  TaskType,
} from './types'
