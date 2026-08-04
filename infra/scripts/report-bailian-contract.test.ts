import { describe, expect, it } from 'vitest'
import { buildBailianContractReport } from './report-bailian-contract'

describe('Bailian contract snapshot report', () => {
  it('exposes a complete, internally consistent official-sync snapshot', () => {
    const report = buildBailianContractReport()
    expect(report.matchesBaseline).toBe(true)
    expect(report.actual).toMatchObject({
      sdkVersion: report.baseline.sdkVersion,
      catalogRevision: report.baseline.catalogRevision,
      catalogHash: report.baseline.catalogHash,
      requirementsHash: report.baseline.requirementsHash,
      maintenance: 'official-sync',
      totalRequirements: report.baseline.totalRequirements,
      coveredRequirements: report.baseline.coveredRequirements,
      legacyRequirements: report.baseline.uncoveredRequirements,
      coveredConsumerIds: [...report.baseline.coveredConsumerIds],
      legacyConsumerIds: [],
    })
    expect(report.actual.sourceImportedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(report.actual.latestModelReviewAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(report.actual.coveredConsumerIds).toHaveLength(report.actual.coveredRequirements)
    expect(report.actual.legacyConsumerIds).toHaveLength(report.actual.legacyRequirements)
    expect(new Set([
      ...report.actual.coveredConsumerIds,
      ...report.actual.legacyConsumerIds,
    ]).size).toBe(report.actual.totalRequirements)
    expect(report.actual.requirementsHash).toBe(report.baseline.requirementsHash)
  })
})
