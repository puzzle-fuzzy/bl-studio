/**
 * Repository 内部各实体的 id 生成器。
 *
 * 三类内部 id（gen_/task_/art_）采用「时间戳 + 进程内自增序」的组合形式：
 * 单调递增、可大致按时间排序、且在单进程内不会冲突；但它们并不对外公开，
 * 仅用于内部引用与索引。
 *
 * 注意：share_id 走完全不同的策略——它是公开访问密钥（详见 nextGenerationShareId）。
 */
import { randomUUID } from 'node:crypto'

let recordSeq = 0
let taskSeq = 0
let artifactSeq = 0
let providerRequestAuditSeq = 0
let usageRecordSeq = 0
let auditLogSeq = 0
let generationEventSeq = 0
let assetDerivativeSeq = 0
let creativeGenerationContextSeq = 0
let creativeGenerationContextAssetSeq = 0
let creativeGenerationContextReferenceSeq = 0

export function nextGenerationRecordId(): string {
  recordSeq += 1
  return `gen_${Date.now()}_${recordSeq}`
}

/**
 * 不透明且不可猜测的公开 share id。与 gen_/task_/art_ 内部 id 不同，share id
 * 是公开访问密钥——分享页无需登录即可查看且创建后不可撤销，因此它必须不能
 * 是顺序的、可枚举的，所以这里直接用 randomUUID 提供足够的熵。
 */
export function nextGenerationShareId(): string {
  return `share_${randomUUID().replace(/-/g, '')}`
}

export function nextTaskRecordId(): string {
  taskSeq += 1
  return `task_${Date.now()}_${taskSeq}`
}

export function nextArtifactId(): string {
  artifactSeq += 1
  return `art_${Date.now()}_${artifactSeq}`
}

export function nextProviderRequestAuditId(): string {
  providerRequestAuditSeq += 1
  return `provider_req_${Date.now()}_${providerRequestAuditSeq}`
}

export function nextUsageRecordId(): string {
  usageRecordSeq += 1
  return `usage_${Date.now()}_${usageRecordSeq}`
}

export function nextAuditLogId(): string {
  auditLogSeq += 1
  return `audit_${Date.now()}_${auditLogSeq}`
}

export function nextGenerationEventId(): string {
  generationEventSeq += 1
  return `generation_event_${Date.now()}_${generationEventSeq}`
}

export function nextAssetDerivativeId(): string {
  assetDerivativeSeq += 1
  return `asset_derivative_${Date.now()}_${assetDerivativeSeq}`
}

export function nextCreativeGenerationContextId(): string {
  creativeGenerationContextSeq += 1
  return `creative_context_${Date.now()}_${creativeGenerationContextSeq}`
}

export function nextCreativeGenerationContextAssetId(): string {
  creativeGenerationContextAssetSeq += 1
  return `creative_context_asset_${Date.now()}_${creativeGenerationContextAssetSeq}`
}

export function nextCreativeGenerationContextReferenceId(): string {
  creativeGenerationContextReferenceSeq += 1
  return `creative_context_reference_${Date.now()}_${creativeGenerationContextReferenceSeq}`
}
