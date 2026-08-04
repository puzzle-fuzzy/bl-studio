import { describe, expect, it } from 'vitest'
import { BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE } from '@bailian-studio/bailian-adapter'
import { verifyBailianRuntime } from '../src/bailian-runtime'

describe('Bailian worker runtime gate', () => {
  it('pins and exposes the loaded SDK catalog snapshot', () => {
    const runtime = verifyBailianRuntime()
    expect(runtime).toMatchObject({
      sdkVersion: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.sdkVersion,
      catalogRevision: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.catalogRevision,
      catalogHash: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.catalogHash,
      requirementsHash: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.requirementsHash,
      maintenance: 'official-sync',
      totalRequirements: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.totalRequirements,
      coveredRequirements: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.coveredRequirements,
      legacyRequirements: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.uncoveredRequirements,
      coveredConsumerIds: [...BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.coveredConsumerIds],
    })
    expect(runtime.sourceImportedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
