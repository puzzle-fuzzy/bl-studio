import { describe, expect, it } from 'vitest'
import { listModels } from '@bailian-studio/model-core'
import { verifyBailianRuntime } from '../src/bailian-runtime'

describe('Bailian worker runtime gate', () => {
  it('exposes the model-core catalog stats as the startup snapshot', () => {
    const runtime = verifyBailianRuntime()
    const models = listModels()
    expect(runtime.modelCount).toBe(models.length)
    expect(runtime.enabledModelCount).toBe(
      models.filter(model => model.availability.enabled).length,
    )
    expect(runtime.enabledModelCount).toBeGreaterThan(0)
    expect(runtime.enabledModelCount).toBeLessThanOrEqual(runtime.modelCount)
    expect(runtime.provider).toBe('dashscope')
    expect(runtime.maintenance).toBe('manual')
  })

  it('returns a frozen snapshot (git is the version — no SDK/catalog hash fields)', () => {
    const runtime = verifyBailianRuntime()
    expect(Object.isFrozen(runtime)).toBe(true)
    expect(Object.keys(runtime).sort()).toEqual([
      'enabledModelCount',
      'maintenance',
      'modelCount',
      'provider',
    ])
  })
})
