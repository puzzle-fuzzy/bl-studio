import {
  assertBailianCoverageBaseline,
  getBailianCoverageReport,
  getBailianRequirementsHash,
  getBailianSdkMeta,
} from './coverage'

export interface BailianContractSnapshot {
  readonly sdkVersion: string
  readonly catalogRevision: string
  readonly catalogHash: string
  readonly requirementsHash: string
  readonly maintenance: 'manual' | 'official-sync'
  readonly sourceImportedAt: string
  readonly latestModelReviewAt: string
  readonly coverage: {
    readonly totalRequirements: number
    readonly coveredRequirements: number
    readonly legacyRequirements: number
    readonly coveredConsumerIds: readonly string[]
    readonly legacyConsumerIds: readonly string[]
  }
}

/**
 * 返回已通过 Bailian Studio 契约门禁的目录快照。API、Worker 和可观测性代码共用
 * 此视图，避免各自拼装版本与官网同步状态后逐渐产生不同语义。
 */
export function getBailianContractSnapshot(): BailianContractSnapshot {
  assertBailianCoverageBaseline()
  const meta = getBailianSdkMeta()
  const report = getBailianCoverageReport()
  return Object.freeze({
    sdkVersion: meta.sdkVersion,
    catalogRevision: meta.catalogRevision,
    catalogHash: meta.catalogHash,
    requirementsHash: getBailianRequirementsHash(),
    maintenance: meta.maintenance,
    sourceImportedAt: meta.sourceImportedAt,
    latestModelReviewAt: meta.latestModelReviewAt,
    coverage: Object.freeze({
      totalRequirements: report.summary.totalRequirements,
      coveredRequirements: report.summary.coveredRequirements,
      legacyRequirements: report.summary.uncoveredRequirements,
      coveredConsumerIds: Object.freeze(report.covered.map(({ consumerId }) => consumerId)),
      legacyConsumerIds: Object.freeze(report.issues.map(({ consumerId }) => consumerId)),
    }),
  })
}
