/**
 * task_records 表的统一序列化（P1-C：消除三份分叉副本）。
 *
 * 此前 generation-repository（taskInsertValues）、media-repository（taskValues）
 * 和 director-repository（手写 inline）各自维护一份序列化，字段约定已分叉。
 * 本模块是唯一事实源——新增 TaskRecord 字段或状态机不变量只需改这里。
 *
 * 注意：TaskRecord 类型用结构化定义而非从 task-engine 导入，因为 db 包
 * 的边界规则禁止依赖 task-engine（保持 db 为纯叶子）。恢复后也不应改为
 * 导入 task-engine——结构化类型在这里是正确的设计选择。
 */
// biome-ignore lint/style/useImportType: taskRecords 是值（Drizzle 表定义），非纯类型
import { taskRecords } from './schema'

/** TaskRecord 的结构化投影（与 task-engine 的 TaskRecord 兼容）。 */
export interface TaskRecordInput {
  id: string
  type: string
  domain: string
  status: string
  priority: number
  input: object
  output?: object
  lockedBy?: string
  lockedUntil?: string
  startedAt?: string
  completedAt?: string
  attempts: number
  maxAttempts: number
  nextRunAt: string
  errorJson?: object
  recordId?: string
  userId?: string
  traceId?: string
  createdAt: string
  updatedAt: string
}

/** TaskRecord → task_records 行的序列化（唯一实现）。 */
export function taskInsertValues(task: TaskRecordInput): typeof taskRecords.$inferInsert {
  return {
    id: task.id,
    type: task.type,
    domain: task.domain,
    status: task.status,
    priority: task.priority,
    inputJson: task.input as Record<string, unknown>,
    outputJson: (task.output as Record<string, unknown> | undefined) ?? null,
    lockedBy: task.lockedBy ?? null,
    lockedUntil: task.lockedUntil === undefined ? null : new Date(task.lockedUntil),
    startedAt: task.startedAt === undefined ? null : new Date(task.startedAt),
    completedAt: task.completedAt === undefined ? null : new Date(task.completedAt),
    attempts: task.attempts,
    maxAttempts: task.maxAttempts,
    nextRunAt: new Date(task.nextRunAt),
    errorJson: (task.errorJson as Record<string, unknown> | undefined) ?? null,
    recordId: task.recordId ?? null,
    userId: task.userId ?? null,
    traceId: task.traceId ?? null,
    createdBy: 'system',
    updatedBy: 'system',
    createdAt: new Date(task.createdAt),
    updatedAt: new Date(task.updatedAt),
  }
}
