import { and, asc, eq, gt, inArray, ne, sql } from 'drizzle-orm'
import {
  taskInsertValues,
  taskRecords,
  type BailianStudioDb,
  type BailianStudioDbTransaction,
} from '@bailian-studio/db'
import { transitionTask } from '@bailian-studio/task-engine'
import { toTaskRecord } from './mappers'
import {
  TaskRepositoryError,
  type ClaimNextQueuedTaskInput,
  type FindTaskInput,
  type RenewTaskLockInput,
  type SaveTaskOptions,
  type TaskQueueRepository,
  type TaskQueueTransactionStore,
  type TaskQueueQuerySource,
} from './types'
import type { TaskRecord } from '@bailian-studio/task-engine'

export interface CreateTaskQueueRepositoryOptions {
  db: BailianStudioDb
}

/** 在调用方事务中写入任务，保持业务记录与任务的复合原子性。 */
export async function enqueueTask(
  tx: BailianStudioDbTransaction,
  task: TaskRecord,
): Promise<TaskRecord> {
  const [inserted] = await tx
    .insert(taskRecords)
    .values(taskInsertValues(task))
    .returning()

  if (inserted === undefined) {
    throw new TaskRepositoryError('DATABASE_ERROR', `Failed to insert task: ${task.id}`)
  }

  return toTaskRecord(inserted)
}

/** 在调用方事务内读取一条任务，封闭 task_records 的查询与领域映射细节。 */
async function findTask(
  source: TaskQueueQuerySource,
  input: FindTaskInput,
): Promise<TaskRecord | undefined> {
  const conditions = []
  if (input.recordId !== undefined) conditions.push(eq(taskRecords.recordId, input.recordId))
  if (input.type !== undefined) conditions.push(eq(taskRecords.type, input.type))
  if (input.statuses !== undefined && input.statuses.length > 0) {
    conditions.push(inArray(taskRecords.status, [...input.statuses]))
  }
  if (input.excludeTaskId !== undefined) {
    conditions.push(ne(taskRecords.id, input.excludeTaskId))
  }

  const [row] = await source
    .select()
    .from(taskRecords)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(asc(taskRecords.createdAt), asc(taskRecords.id))
    .limit(1)

  return row === undefined ? undefined : toTaskRecord(row)
}

/**
 * 创建业务 repository 使用的事务内任务写入端口。
 *
 * 端口本身无状态，单独提供工厂是为了让组合根可以把同一份写入能力显式
 * 注入 generation、media、director，而不是让各 repository 隐式持有函数依赖。
 */
export function createTaskQueueTransactionStore(): TaskQueueTransactionStore {
  return { enqueueTask, findTask }
}

/**
 * 创建任务队列 repository。
 *
 * 业务记录与初始任务的复合写入仍由业务 repository 在自己的 transaction 中完成；
 * 本对象负责跨业务域共享的 claim/lease/save 生命周期，避免 Worker 依赖上帝接口。
 */
export function createTaskQueueRepository(options: CreateTaskQueueRepositoryOptions): TaskQueueRepository {
  const { db } = options

  return {
    async claimNextQueuedTask(input: ClaimNextQueuedTaskInput) {
      return db.transaction(async tx => {
        const rows = await tx.execute<{ id: string }>(sql`
          select *
          from task_records
          where (status = 'queued'
             or (status = 'running' and locked_until <= ${input.now}))
            and next_run_at <= ${input.now}
          order by priority desc, created_at asc
          for update skip locked
          limit 1
        `)
        const [selected] = rows
        if (selected === undefined) return undefined

        const [selectedTaskRow] = await tx
          .select()
          .from(taskRecords)
          .where(eq(taskRecords.id, selected.id))
          .limit(1)

        if (selectedTaskRow === undefined) {
          throw new TaskRepositoryError('TASK_NOT_FOUND', `Task not found: ${selected.id}`)
        }

        let claimedTask: ReturnType<typeof transitionTask>
        try {
          claimedTask = transitionTask(toTaskRecord(selectedTaskRow), {
            type: 'claim',
            workerId: input.workerId,
            now: input.now,
            lockedUntil: input.lockedUntil,
          })
        } catch (claimError) {
          // 损坏的任务行不能一直卡在队首；它是确定性的终态失败，不应让 worker
          // 每轮重复 claim 后退避，阻塞后续正常任务。
          await tx
            .update(taskRecords)
            .set({
              status: 'failed',
              errorJson: {
                category: 'system',
                retriable: false,
                code: 'TASK_CLAIM_INVALID',
                message: `Cannot claim task ${selected.id}: ${claimError instanceof Error ? claimError.message : String(claimError)}`,
              },
              completedAt: new Date(input.now),
              updatedBy: input.workerId,
              updatedAt: new Date(input.now),
            })
            .where(eq(taskRecords.id, selected.id))
          return undefined
        }

        const [savedTask] = await tx
          .update(taskRecords)
          .set(taskInsertValues(claimedTask))
          .where(eq(taskRecords.id, claimedTask.id))
          .returning()

        if (savedTask === undefined) {
          throw new TaskRepositoryError('DATABASE_ERROR', `Failed to claim task: ${claimedTask.id}`)
        }

        return toTaskRecord(savedTask)
      })
    },

    async renewTaskLock(input: RenewTaskLockInput) {
      const [saved] = await db
        .update(taskRecords)
        .set({
          lockedUntil: new Date(input.lockedUntil),
          updatedAt: new Date(input.now),
          updatedBy: input.workerId,
        })
        .where(and(
          eq(taskRecords.id, input.taskId),
          eq(taskRecords.status, 'running'),
          eq(taskRecords.lockedBy, input.workerId),
          gt(taskRecords.lockedUntil, new Date(input.now)),
        ))
        .returning()

      return saved === undefined ? undefined : toTaskRecord(saved)
    },

    async saveTask(task, options?: SaveTaskOptions) {
      const conditions = [eq(taskRecords.id, task.id)]
      if (options?.expectedWorkerId !== undefined) {
        conditions.push(eq(taskRecords.lockedBy, options.expectedWorkerId))
        conditions.push(sql`${taskRecords.lockedUntil} > now()`)
      }

      const [saved] = await db
        .update(taskRecords)
        .set(taskInsertValues({ ...task, updatedAt: task.updatedAt ?? new Date().toISOString() }))
        .where(and(...conditions))
        .returning()

      if (saved === undefined) {
        if (options?.expectedWorkerId !== undefined) return undefined
        throw new TaskRepositoryError('TASK_NOT_FOUND', `Task not found: ${task.id}`)
      }

      return toTaskRecord(saved)
    },

    async getTask(id) {
      const [row] = await db
        .select()
        .from(taskRecords)
        .where(eq(taskRecords.id, id))
        .limit(1)

      return row === undefined ? undefined : toTaskRecord(row)
    },
  }
}
