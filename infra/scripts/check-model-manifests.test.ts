import { describe, expect, it } from 'vitest'
import { checkModelManifests } from './check-model-manifests'

describe('model manifest onboarding gate', () => {
  it('checks the complete current catalog without a real Provider call', () => {
    const summary = checkModelManifests()

    expect(summary.registeredModels).toBeGreaterThanOrEqual(40)
    expect(summary.enabledModels).toBe(summary.registeredModels)
    expect(summary.operationRequirements).toBe(summary.enabledModels)
  })
})
