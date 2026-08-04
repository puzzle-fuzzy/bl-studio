import { describe, expect, it } from 'vitest'
import {
  getBailianCoverageReport,
  requireBailianSdkOperation,
  validateBailianResponse,
} from '../src'

const coveredResponses = getBailianCoverageReport().covered.flatMap(({ consumerId, responsePhases }) => {
  const operation = requireBailianSdkOperation(consumerId).operation

  return responsePhases.map((phase) => {
    const contract = operation.responseContracts.find((candidate) => candidate.phase === phase)
    if (contract === undefined) {
      throw new Error(`Missing response contract for ${consumerId}:${phase}`)
    }
    return { consumerId, phase, contract }
  })
})

const validFixtures = coveredResponses.flatMap(({ consumerId, phase, contract }) => (
  contract.examples.valid.map((fixture) => ({
    consumerId,
    phase,
    name: fixture.name,
    response: fixture.response,
  }))
))

const invalidFixtures = coveredResponses.flatMap(({ consumerId, phase, contract }) => (
  contract.examples.invalid.map((fixture) => ({
    consumerId,
    phase,
    name: fixture.name,
    response: fixture.response,
    expectedPath: fixture.expectedPath,
  }))
))

describe('@bailian-studio/bailian-adapter response contract fixtures', () => {
  it('keeps every covered response phase backed by complete valid and invalid SDK fixtures', () => {
    expect(coveredResponses.length).toBeGreaterThan(0)
    expect(validFixtures.length).toBeGreaterThanOrEqual(coveredResponses.length)
    expect(invalidFixtures.length).toBeGreaterThanOrEqual(coveredResponses.length)

    for (const { consumerId, phase, contract } of coveredResponses) {
      expect(contract.examples.valid.length, `${consumerId}:${phase} valid fixtures`).toBeGreaterThan(0)
      expect(contract.examples.invalid.length, `${consumerId}:${phase} invalid fixtures`).toBeGreaterThan(0)
    }
  })

  it('accepts every complete valid response fixture from the SDK', () => {
    for (const fixture of validFixtures) {
      const result = validateBailianResponse(fixture.consumerId, fixture.phase, fixture.response)
      if (!result.valid) {
        throw new Error(`${fixture.consumerId}:${fixture.phase}:${fixture.name} failed: ${JSON.stringify(result.issues)}`)
      }
      expect(result.issues).toEqual([])
    }
  })

  it('rejects every provider-specific invalid response at its expected field path', () => {
    for (const fixture of invalidFixtures) {
      const result = validateBailianResponse(fixture.consumerId, fixture.phase, fixture.response)
      if (result.valid) {
        throw new Error(`${fixture.consumerId}:${fixture.phase}:${fixture.name} unexpectedly passed`)
      }
      expect(result.issues.some((issue) => issue.path === fixture.expectedPath),
        `${fixture.consumerId}:${fixture.phase}:${fixture.name}`).toBe(true)
      expect(result.issues.every((issue) => issue.code === 'RESPONSE_SCHEMA_MISMATCH')).toBe(true)
    }
  })
})
