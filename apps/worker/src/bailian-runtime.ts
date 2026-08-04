import {
  getBailianContractSnapshot,
} from '@bailian-studio/bailian-adapter'

export interface BailianRuntimeSnapshot {
  readonly sdkVersion: string
  readonly catalogRevision: string
  readonly catalogHash: string
  readonly requirementsHash: string
  readonly maintenance: 'manual' | 'official-sync'
  readonly sourceImportedAt: string
  readonly totalRequirements: number
  readonly coveredRequirements: number
  readonly legacyRequirements: number
  readonly coveredConsumerIds: readonly string[]
}

/**
 * Worker 启动门禁：目录版本或覆盖矩阵不一致时直接阻止启动，同时返回可记录的
 * 不可变版本快照，便于从日志确认生产环境实际加载了哪次官网同步。
 */
export function verifyBailianRuntime(): BailianRuntimeSnapshot {
  const snapshot = getBailianContractSnapshot()
  return Object.freeze({
    sdkVersion: snapshot.sdkVersion,
    catalogRevision: snapshot.catalogRevision,
    catalogHash: snapshot.catalogHash,
    requirementsHash: snapshot.requirementsHash,
    maintenance: snapshot.maintenance,
    sourceImportedAt: snapshot.sourceImportedAt,
    totalRequirements: snapshot.coverage.totalRequirements,
    coveredRequirements: snapshot.coverage.coveredRequirements,
    legacyRequirements: snapshot.coverage.legacyRequirements,
    coveredConsumerIds: snapshot.coverage.coveredConsumerIds,
  })
}
