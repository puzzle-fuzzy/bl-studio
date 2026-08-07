import { describe, expect, it } from 'vitest'
import { checkModelManifests } from './check-model-manifests'

describe('model manifest onboarding gate', () => {
  it('checks the complete current catalog without a real Provider call', () => {
    const summary = checkModelManifests()

    expect(summary.registeredModels).toBeGreaterThanOrEqual(40)
    // 允许暂未开通的禁用模型（如 vidu 全家）：注册数 ≥ 启用数，需求面只覆盖启用模型。
    expect(summary.registeredModels).toBeGreaterThanOrEqual(summary.enabledModels)
    expect(summary.enabledModels).toBeGreaterThan(0)
    expect(summary.operationRequirements).toBe(summary.enabledModels)
  })
})
