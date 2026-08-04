/**
 * Drizzle 行 ↔ 领域类型 之间的双向映射。
 *
 * 领域类型（types.ts）约定：所有跨边界传递的时间戳都是 ISO 字符串；而
 * Drizzle/Postgres 这一层使用的是 `Date` 对象。本模块的 mapper 集中负责
 * 这层互转，从而把「DB 用 Date、外部用 ISO」的差异封闭在 repository 内部，
 * 上层永远只看到 string。
 *
 * 此外这里也负责把 DB 行的 nullable 字段映射成领域类型的 optional 字段，
 * 以及对 errorJson 做结构化判定后再返回（避免把任意 JSON 当成 TaskError 用）。
 */
import type { InferSelectModel } from 'drizzle-orm'
import { auditLogs, generationArtifacts, generationEvents, generationRecords, generationShares, providerRequestAudits, taskRecords, workerHeartbeats } from '@bailian-studio/db'
import type { TaskRecord, TaskError } from '@bailian-studio/task-engine'
import type { AuditLog, AuditEventMetadata } from './audit-types'
import type { ProviderRequestAudit } from './provider-request-types'
import type { GenerationArtifact, GenerationAssetRefs, GenerationEvent, GenerationRecord, GenerationShare, WorkerHeartbeat } from './types'

export type GenerationRecordRow = InferSelectModel<typeof generationRecords>
export type GenerationArtifactRow = InferSelectModel<typeof generationArtifacts>
export type GenerationEventRow = InferSelectModel<typeof generationEvents>
export type GenerationShareRow = InferSelectModel<typeof generationShares>
export type TaskRecordRow = InferSelectModel<typeof taskRecords>
export type ProviderRequestAuditRow = InferSelectModel<typeof providerRequestAudits>
export type WorkerHeartbeatRow = InferSelectModel<typeof workerHeartbeats>
export type AuditLogRow = InferSelectModel<typeof auditLogs>

/**
 * 类型守卫：判断 value 是否是一个结构合法的 TaskError。
 * 用于在把 errorJson 还原回领域类型前做安全校验，避免任意 JSON 被当成 TaskError。
 */
function isTaskError(value: unknown): value is TaskError {
  return value !== null &&
         typeof value === 'object' &&
         !Array.isArray(value) &&
         'category' in value &&
         'message' in value &&
         'retriable' in value
}

/** DB 行 → 领域 GenerationRecord；Date 字段统一 toISOString()。 */
export function toGenerationRecord(
  row: GenerationRecordRow,
  assetRefs?: GenerationAssetRefs,
): GenerationRecord {
  return {
    id: row.id,
    userId: row.userId,
    modelId: row.modelId,
    provider: row.provider as GenerationRecord['provider'],
    providerModel: row.providerModel,
    category: row.category as GenerationRecord['category'],
    inputParams: row.inputParamsJson,
    ...(assetRefs !== undefined && Object.keys(assetRefs).length > 0
      ? { assetRefs }
      : {}),
    status: row.status as GenerationRecord['status'],
    statusReason: row.statusReason ?? undefined,
    providerTaskId: row.providerTaskId ?? undefined,
    providerStatus: row.providerStatus ?? undefined,
    requestId: row.requestId ?? undefined,
    traceId: row.traceId ?? undefined,
    outputResult: row.outputResultJson ?? undefined,
    errorJson: row.errorJson ?? undefined,
    costEstimate: row.costEstimate,
    currency: row.currency as GenerationRecord['currency'],
    pricingVersion: row.pricingVersion,
    modelManifestHash: row.modelManifestHash,
    costFinal: row.costFinal ?? undefined,
    parentRecordId: row.parentRecordId ?? undefined,
    idempotencyKey: row.idempotencyKey ?? undefined,
    cancelRequestedAt: row.cancelRequestedAt?.toISOString(),
    providerCancelStatus: row.providerCancelStatus as GenerationRecord['providerCancelStatus'],
    ...(row.hiddenAt !== null ? { hiddenAt: row.hiddenAt.toISOString() } : {}),
    ...(row.deletedAt !== null ? { deletedAt: row.deletedAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** DB 行 → worker liveness 领域模型；Date 字段统一 toISOString()。 */
export function toWorkerHeartbeat(row: WorkerHeartbeatRow): WorkerHeartbeat {
  return {
    workerId: row.workerId,
    status: row.status as WorkerHeartbeat['status'],
    startedAt: row.startedAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    stoppedAt: row.stoppedAt?.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function toGenerationEvent(row: GenerationEventRow): GenerationEvent {
  return {
    id: row.id,
    recordId: row.recordId,
    userId: row.userId,
    status: row.status,
    modelId: row.modelId,
    updatedAt: row.updatedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  }
}

/** DB 行 → 领域 GenerationShare；Date 字段统一 toISOString()。 */
export function toGenerationShare(row: GenerationShareRow): GenerationShare {
  return {
    id: row.id,
    recordId: row.recordId,
    userId: row.userId,
    includeParams: row.includeParams,
    ...(row.expiresAt !== null ? { expiresAt: row.expiresAt.toISOString() } : {}),
    ...(row.revokedAt !== null ? { revokedAt: row.revokedAt.toISOString() } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** DB 行 → 领域 GenerationArtifact；Date 字段统一 toISOString()。 */
export function toGenerationArtifact(row: GenerationArtifactRow): GenerationArtifact {
  return {
    id: row.id,
    recordId: row.recordId,
    userId: row.userId,
    kind: row.kind as GenerationArtifact['kind'],
    sourceUrl: row.sourceUrl ?? undefined,
    text: row.text ?? undefined,
    mimeType: row.mimeType ?? undefined,
    storageProvider: row.storageProvider === null ? undefined : row.storageProvider as GenerationArtifact['storageProvider'],
    storageKey: row.storageKey ?? undefined,
    storageUrl: row.storageUrl ?? undefined,
    byteSize: row.byteSize ?? undefined,
    status: row.status as GenerationArtifact['status'],
    errorJson: row.errorJson ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/**
 * DB 行 → 领域 TaskRecord；Date 字段统一 toISOString()。
 * errorJson 仅在结构上通过 isTaskError 守卫后才赋值，否则置 undefined，
 * 避免把脏数据或历史遗留格式当成 TaskError 暴露给上层。
 */
export function toTaskRecord(row: TaskRecordRow): TaskRecord {
  return {
    id: row.id,
    type: row.type as TaskRecord['type'],
    domain: row.domain as TaskRecord['domain'],
    status: row.status as TaskRecord['status'],
    priority: row.priority,
    input: row.inputJson,
    output: row.outputJson ?? undefined,
    lockedBy: row.lockedBy ?? undefined,
    lockedUntil: row.lockedUntil?.toISOString(),
    startedAt: row.startedAt?.toISOString(),
    completedAt: row.completedAt?.toISOString(),
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    nextRunAt: row.nextRunAt.toISOString(),
    errorJson: row.errorJson === null || !isTaskError(row.errorJson) ? undefined : row.errorJson,
    recordId: row.recordId ?? undefined,
    userId: row.userId ?? undefined,
    traceId: row.traceId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** DB 行 → provider 请求审计领域模型；错误字段只接受稳定摘要结构。 */
export function toProviderRequestAudit(row: ProviderRequestAuditRow): ProviderRequestAudit {
  const error = row.errorJson
  const normalizedError = error !== null &&
    typeof error === 'object' &&
    !Array.isArray(error) &&
    typeof error['code'] === 'string' &&
    typeof error['category'] === 'string' &&
    typeof error['message'] === 'string' &&
    typeof error['retriable'] === 'boolean'
    ? {
        code: error['code'],
        category: error['category'],
        message: error['message'],
        retriable: error['retriable'],
      }
    : undefined

  return {
    id: row.id,
    generationId: row.generationId,
    ...(row.taskId !== null ? { taskId: row.taskId } : {}),
    userId: row.userId,
    provider: row.provider,
    providerModel: row.providerModel,
    operation: row.operation as ProviderRequestAudit['operation'],
    status: row.status as ProviderRequestAudit['status'],
    ...(row.idempotencyKey !== null ? { idempotencyKey: row.idempotencyKey } : {}),
    ...(row.providerTaskId !== null ? { providerTaskId: row.providerTaskId } : {}),
    ...(row.providerRequestId !== null ? { providerRequestId: row.providerRequestId } : {}),
    attempt: row.attempt,
    estimatedCostCents: row.estimatedCostCents,
    ...(row.billedCostCents !== null ? { billedCostCents: row.billedCostCents } : {}),
    ...(normalizedError !== undefined ? { error: normalizedError } : {}),
    startedAt: row.startedAt.toISOString(),
    ...(row.completedAt !== null ? { completedAt: row.completedAt.toISOString() } : {}),
    ...(row.latencyMs !== null ? { latencyMs: row.latencyMs } : {}),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

/** DB 行 → 用户/资源审计事件；metadata 仅返回受约束的 primitive map。 */
export function toAuditLog(row: AuditLogRow): AuditLog {
  const metadata = row.metadataJson
  return {
    id: row.id,
    ...(row.userId !== null ? { userId: row.userId } : {}),
    action: row.action as AuditLog['action'],
    outcome: row.outcome as AuditLog['outcome'],
    ...(row.targetType !== null ? { targetType: row.targetType } : {}),
    ...(row.targetId !== null ? { targetId: row.targetId } : {}),
    ...(row.requestId !== null ? { requestId: row.requestId } : {}),
    ...(row.traceId !== null ? { traceId: row.traceId } : {}),
    ...(row.method !== null ? { method: row.method } : {}),
    ...(row.path !== null ? { path: row.path } : {}),
    ...(metadata !== null && metadata !== undefined ? { metadata: metadata as AuditEventMetadata } : {}),
    occurredAt: row.occurredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
