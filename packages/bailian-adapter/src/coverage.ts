import { createHash } from 'node:crypto'
import {
  bailian,
  type BailianSdkMeta,
  type ModelCoverageMatch,
  type ModelCoverageReport,
  type ResolvedModelOperation,
  type SupportedLocale,
} from '@puzzle-fuzzy/bailian-sdk'
import {
  listBailianCoverageRequirements,
  type BailianCoverageRequirementReference,
} from '@bailian-studio/model-core'
import { BailianStudioBailianAdapterError, coverageDriftError } from './errors'
import { BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE } from './generated/coverage-baseline'

export { BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE } from './generated/coverage-baseline'

const REQUIREMENTS: readonly BailianCoverageRequirementReference[] = Object.freeze(
  listBailianCoverageRequirements().map((requirement) => Object.freeze({ ...requirement })),
)
const REQUIREMENTS_HASH = hashRequirements(REQUIREMENTS)
const SDK_META: BailianSdkMeta = Object.freeze({ ...bailian.meta })
const REQUIREMENT_BY_CONSUMER_ID = new Map(
  REQUIREMENTS.map((requirement) => [requirement.consumerId, requirement]),
)

export interface BailianSdkIntegration {
  readonly kind: 'sdk'
  readonly requirement: BailianCoverageRequirementReference
  readonly match: ModelCoverageMatch
}

export interface BailianLegacyIntegration {
  readonly kind: 'legacy'
  readonly requirement: BailianCoverageRequirementReference
  readonly issue: ModelCoverageReport['issues'][number]
}

export type BailianIntegrationStatus = BailianSdkIntegration | BailianLegacyIntegration

export function getBailianSdkMeta(): BailianSdkMeta {
  return SDK_META
}

export function getBailianCoverageReport(): ModelCoverageReport {
  // Coverage report 是可变对象；每次返回新报告，防止调用方污染后续门禁判断。
  return bailian.models.checkCoverage(REQUIREMENTS)
}

export function getBailianRequirementsHash(): string {
  return REQUIREMENTS_HASH
}

export function getBailianIntegrationStatus(
  consumerId: string,
  locale: SupportedLocale = 'zh-CN',
): BailianIntegrationStatus {
  assertBailianCoverageBaseline()
  const requirement = requireConsumerRequirement(consumerId, locale)
  const report = getBailianCoverageReport()
  const match = report.covered.find((candidate) => candidate.consumerId === consumerId)
  if (match !== undefined) return { kind: 'sdk', requirement, match }

  const issue = report.issues.find((candidate) => candidate.consumerId === consumerId)
  if (issue === undefined) {
    throw coverageDriftError(`Coverage report omitted consumer model ${consumerId}`)
  }
  return { kind: 'legacy', requirement, issue }
}

export function isBailianSdkCovered(consumerId: string): boolean {
  return getBailianIntegrationStatus(consumerId).kind === 'sdk'
}

/** CI 和生产启动共同使用：已发布 SDK 与实际覆盖快照必须完全一致。 */
export function assertBailianCoverageBaseline(): void {
  const report = getBailianCoverageReport()
  const meta = getBailianSdkMeta()
  const expected = BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE
  const actualCovered = report.covered.map((match) => match.consumerId).sort()
  const expectedCovered = [...expected.coveredConsumerIds].sort()

  const summaryMatches =
    report.summary.totalRequirements === expected.totalRequirements
    && report.summary.coveredRequirements === expected.coveredRequirements
    && report.summary.uncoveredRequirements === expected.uncoveredRequirements
  const coveredMatches = JSON.stringify(actualCovered) === JSON.stringify(expectedCovered)
  const contractMatches =
    meta.sdkVersion === expected.sdkVersion
    && meta.catalogRevision === expected.catalogRevision
    && meta.catalogHash === expected.catalogHash
    && REQUIREMENTS_HASH === expected.requirementsHash

  if (!contractMatches || !summaryMatches || !coveredMatches) {
    throw coverageDriftError('Bailian Studio Bailian SDK coverage baseline changed', {
      expected: {
        sdkVersion: expected.sdkVersion,
        catalogRevision: expected.catalogRevision,
        catalogHash: expected.catalogHash,
        requirementsHash: expected.requirementsHash,
        totalRequirements: expected.totalRequirements,
        coveredRequirements: expected.coveredRequirements,
        uncoveredRequirements: expected.uncoveredRequirements,
        coveredConsumerIds: expectedCovered,
      },
      actual: {
        sdkVersion: meta.sdkVersion,
        catalogRevision: meta.catalogRevision,
        catalogHash: meta.catalogHash,
        requirementsHash: REQUIREMENTS_HASH,
        ...report.summary,
        coveredConsumerIds: actualCovered,
      },
    })
  }
}

export function requireBailianSdkOperation(
  consumerId: string,
  locale: SupportedLocale = 'zh-CN',
): ResolvedModelOperation {
  const requirement = requireCoveredRequirement(consumerId, locale)
  const operation = bailian.models.operation(
    requirement.providerModelId,
    requirement.capability,
    { mode: requirement.mode, region: requirement.region },
  )
  if (operation === undefined) {
    throw coverageDriftError(`Covered operation disappeared for ${consumerId}`)
  }
  return operation
}

export function requireCoveredRequirement(
  consumerId: string,
  locale: SupportedLocale,
): BailianCoverageRequirementReference {
  const status = getBailianIntegrationStatus(consumerId, locale)
  if (status.kind === 'sdk') return status.requirement
  throw new BailianStudioBailianAdapterError(
    'SDK_CONTRACT_UNCOVERED',
    {
      'zh-CN': `业务模型 ${consumerId} 尚未被百炼 SDK Contract v3 覆盖，禁止静默使用旧参数契约`,
      'en-US': `Consumer model ${consumerId} is not covered by Bailian SDK Contract v3; silent legacy fallback is forbidden`,
    },
    locale,
    { consumerId, coverageIssue: status.issue },
  )
}

function requireConsumerRequirement(
  consumerId: string,
  locale: SupportedLocale,
): BailianCoverageRequirementReference {
  const requirement = REQUIREMENT_BY_CONSUMER_ID.get(consumerId)
  if (requirement !== undefined) return requirement
  throw new BailianStudioBailianAdapterError(
    'UNKNOWN_CONSUMER_MODEL',
    {
      'zh-CN': `Bailian Studio 未注册业务模型 ${consumerId}`,
      'en-US': `Bailian Studio consumer model ${consumerId} is not registered`,
    },
    locale,
    { consumerId },
  )
}

function hashRequirements(
  requirements: readonly BailianCoverageRequirementReference[],
): string {
  const canonical = JSON.stringify(requirements
    .map((requirement) => ({
      consumerId: requirement.consumerId,
      providerModelId: requirement.providerModelId,
      capability: requirement.capability,
      mode: requirement.mode,
      region: requirement.region,
    }))
    .sort((left, right) => left.consumerId.localeCompare(right.consumerId)))
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`
}
