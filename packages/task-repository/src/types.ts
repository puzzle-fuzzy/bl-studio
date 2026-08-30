import type { BailianStudioDb, BailianStudioDbTransaction } from '@bailian-studio/db'
import type { TaskError, TaskRecord, TaskStatus, TaskType } from '@bailian-studio/task-engine'

/** Worker 认领下一条可执行任务所需的租约信息。 */
export interface ClaimNextQueuedTaskInput {
  workerId: string
  now: string
  lockedUntil: string
}

/** 延长一条运行中任务的租约。 */
export interface RenewTaskLockInput {
  taskId: string
  workerId: string
  now: string
  lockedUntil: string
}

/** 保存任务时可选的 owner 护栏。 */
export interface SaveTaskOptions {
  expectedWorkerId?: string
}

/** 业务事务内读取任务时可复用的窄筛选条件。 */
export interface FindTaskInput {
  recordId?: string
  type?: TaskType
  statuses?: readonly TaskStatus[]
  excludeTaskId?: string
}

export type TaskQueueQuerySource = BailianStudioDb | BailianStudioDbTransaction

/** 在业务事务内取消仍处于 queued 的一组任务。 */
export interface CancelQueuedTasksInput {
  recordIds: readonly string[]
  type: TaskType
  error?: TaskError
  now: string
  updatedBy: string
}

export type TaskRepositoryErrorCode = 'TASK_NOT_FOUND' | 'DATABASE_ERROR'

export class TaskRepositoryError extends Error {
  constructor(
    public readonly code: TaskRepositoryErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'TaskRepositoryError'
  }
}

/** 任务队列的最小持久化接口；由 task-repository 实现并显式注入 worker。 */
export interface TaskQueueRepository {
  claimNextQueuedTask(input: ClaimNextQueuedTaskInput): Promise<TaskRecord | undefined>
  renewTaskLock(input: RenewTaskLockInput): Promise<TaskRecord | undefined>
  saveTask(task: TaskRecord, options?: SaveTaskOptions): Promise<TaskRecord | undefined>
  getTask(id: string): Promise<TaskRecord | undefined>
}

/**
 * 复合业务事务中的任务写入端口。
 *
 * 事务由 generation/media/director repository 开启，本包只负责 task_records
 * 的序列化、插入和回读，避免各业务域复制 Drizzle 写入细节。
 */
export interface TaskQueueTransactionStore {
  enqueueTask(tx: BailianStudioDbTransaction, task: TaskRecord): Promise<TaskRecord>
  findTask(
    source: TaskQueueQuerySource,
    input: FindTaskInput,
  ): Promise<TaskRecord | undefined>
  cancelQueuedTasks(
    tx: BailianStudioDbTransaction,
    input: CancelQueuedTasksInput,
  ): Promise<number>
}
