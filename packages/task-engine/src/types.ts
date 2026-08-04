/**
 * task-engine 对外暴露的领域类型契约。
 *
 * 本包是【纯】状态机/调度计算（不依赖 DB、不依赖 Elysia/React），
 * TaskRecord 的字段在此定型后，由 @bailian-studio/generation-repository 负责
 * 持久化、由 @bailian-studio/worker 负责驱动状态流转。所有时间戳字段约定为
 * ISO 字符串（与仓库层 mappers 的 Date 转换对接）。
 */

/** task 的生命周期状态。合法转换图见 state-machine.ts 的 transitionTask。 */
export type TaskStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'

/** task 所属的顶层业务域。用于按域隔离路由与统计。 */
export type TaskDomain = 'generation' | 'artifact' | 'media' | 'system'

/** task 的具体类型。每个 type 必须配对固定的 domain（见 state-machine 的校验）。 */
export type TaskType = 'generation.submit' | 'generation.poll' | 'artifact.persist' | 'media.process' | 'media.thumbnail'

/**
 * 错误分类。用于 worker 侧的统一错误归类与可重试判定，
 * 不直接映射 HTTP 状态码（稳定错误码见 TaskError.code）。
 */
export type TaskErrorCategory =
  | 'validation'
  | 'auth'
  | 'quota'
  | 'rate_limit'
  | 'provider'
  | 'network'
  | 'timeout'
  | 'storage'
  | 'cancelled'
  | 'system'

/**
 * 单次 task 失败的归一化错误信息。retriable 决定 state-machine 是否尝试重试；
 * code 为可选的稳定错误码字符串（保留英文），便于上层日志与告警聚合。
 */
export interface TaskError {
  category: TaskErrorCategory
  message: string
  retriable: boolean
  code?: string
  /** 面向排障与 UI 的结构化上下文；不得参与重试控制流判断。 */
  details?: Readonly<Record<string, unknown>>
}

/**
 * task 的运行时记录。对应仓库层 generation_records 关联的 task 行。
 *
 * 锁与重试字段：
 *  - lockedBy / lockedUntil：claim 时写入的 worker 标识与锁截止时间。
 *    超过 lockedUntil 视为该 worker 失联，允许被其他 worker 重新 claim；
 *  - attempts / maxAttempts：已执行次数与上限，重试只在 attempts < maxAttempts 时允许；
 *  - nextRunAt：下一次可被 claim 的最早时间（重试退避见 retry.ts）。
 */
export interface TaskRecord {
  id: string
  type: TaskType
  domain: TaskDomain
  status: TaskStatus
  priority: number
  input: Record<string, unknown>
  output?: Record<string, unknown>
   lockedBy?: string
   lockedUntil?: string
   /** 最近一次被 worker 执行的开始时间。 */
   startedAt?: string
   /** 最近一次执行结束时间；queued/running 任务为空。 */
   completedAt?: string
   attempts: number
  maxAttempts: number
  nextRunAt: string
  errorJson?: TaskError
  recordId?: string
  userId?: string
  traceId?: string
  createdAt: string
  updatedAt: string
}

/**
 * 推动状态机前进的一次转换动作（命令）。每条 union 分支对应一个语义化动作，
 * 由 worker 侧根据 provider 执行结果选择触发；具体校验与状态计算在
 * state-machine.ts 的 transitionTask 中实现。
 */
export type TaskTransition =
  | { type: 'claim'; workerId: string; lockedUntil: string; now: string }
  | { type: 'succeed'; output?: Record<string, unknown>; now: string }
  | { type: 'retry'; error: TaskError; nextRunAt: string; now: string }
  | { type: 'fail'; error: TaskError; now: string }
  | { type: 'cancel'; error?: TaskError; now: string }
