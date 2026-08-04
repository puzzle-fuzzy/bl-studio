import {
  BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE,
  BailianStudioBailianAdapterError,
  assertBailianCoverageBaseline,
  getBailianCoverageReport,
  getBailianRequirementsHash,
  getBailianSdkMeta,
} from '../../packages/bailian-adapter/src/index'

export interface BailianContractReport {
  readonly matchesBaseline: boolean
  readonly baselineError?: Readonly<Record<string, unknown>>
  readonly baseline: typeof BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE
  readonly actual: {
    readonly sdkVersion: string
    readonly catalogRevision: string
    readonly catalogHash: string
    readonly requirementsHash: string
    readonly maintenance: 'manual' | 'official-sync'
    readonly sourceImportedAt: string
    readonly latestModelReviewAt: string
    readonly totalRequirements: number
    readonly coveredRequirements: number
    readonly legacyRequirements: number
    readonly coveredConsumerIds: readonly string[]
    readonly legacyConsumerIds: readonly string[]
  }
}

/**
 * 生成升级输入而不隐藏漂移。与生产门禁不同，即使基线不匹配也会返回已安装
 * SDK 的实际快照，供 official-sync 自动升级流程直接记录精确值。
 */
export function buildBailianContractReport(): BailianContractReport {
  const meta = getBailianSdkMeta()
  const coverage = getBailianCoverageReport()
  let baselineError: Readonly<Record<string, unknown>> | undefined
  try {
    assertBailianCoverageBaseline()
  } catch (error) {
    baselineError = error instanceof BailianStudioBailianAdapterError
      ? error.toJSON()
      : { message: error instanceof Error ? error.message : String(error) }
  }

  return {
    matchesBaseline: baselineError === undefined,
    ...(baselineError === undefined ? {} : { baselineError }),
    baseline: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE,
    actual: {
      sdkVersion: meta.sdkVersion,
      catalogRevision: meta.catalogRevision,
      catalogHash: meta.catalogHash,
      requirementsHash: getBailianRequirementsHash(),
      maintenance: meta.maintenance,
      sourceImportedAt: meta.sourceImportedAt,
      latestModelReviewAt: meta.latestModelReviewAt,
      totalRequirements: coverage.summary.totalRequirements,
      coveredRequirements: coverage.summary.coveredRequirements,
      legacyRequirements: coverage.summary.uncoveredRequirements,
      coveredConsumerIds: coverage.covered.map(({ consumerId }) => consumerId),
      legacyConsumerIds: coverage.issues.map(({ consumerId }) => consumerId),
    },
  }
}

if (import.meta.main) {
  console.log(JSON.stringify(buildBailianContractReport(), null, 2))
}
