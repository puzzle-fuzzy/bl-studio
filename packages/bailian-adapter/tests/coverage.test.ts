import { describe, expect, it } from 'vitest'
import {
  BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE,
  assertBailianCoverageBaseline,
  getBailianContractSnapshot,
  getBailianCoverageReport,
  getBailianIntegrationStatus,
  getBailianSdkMeta,
  requireBailianSdkOperation,
} from '../src'

describe('@bailian-studio/bailian-adapter coverage boundary', () => {
  it('pins the exact SDK, catalog, requirement hash, and 45/45 official baseline', () => {
    expect(() => assertBailianCoverageBaseline()).not.toThrow()
    const report = getBailianCoverageReport()
    expect(report.summary).toEqual({
      totalRequirements: 45,
      coveredRequirements: 45,
      uncoveredRequirements: 0,
    })
    expect(report.covered.map((match) => match.consumerId)).toEqual(
      [...BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.coveredConsumerIds],
    )
    expect(getBailianContractSnapshot()).toMatchObject({
      sdkVersion: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.sdkVersion,
      catalogRevision: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.catalogRevision,
      catalogHash: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.catalogHash,
      requirementsHash: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.requirementsHash,
    })
    expect(Object.isFrozen(getBailianSdkMeta())).toBe(true)
    expect(getBailianCoverageReport()).not.toBe(getBailianCoverageReport())
  })

  it('routes every registered consumer operation through the official SDK', () => {
    expect(getBailianCoverageReport().summary.uncoveredRequirements).toBe(0)
    for (const consumerId of BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.coveredConsumerIds) {
      expect(getBailianIntegrationStatus(consumerId).kind).toBe('sdk')
      expect(() => requireBailianSdkOperation(consumerId)).not.toThrow()
    }
  })

  it('uses the requested locale for an unknown consumer model', () => {
    expect(() => getBailianIntegrationStatus('missing-model', 'en-US')).toThrow(
      'Bailian Studio consumer model missing-model is not registered',
    )
  })
})
