import { describe, expect, it } from 'vitest'
import { getModelById, listModels, MODEL_REGISTRY } from '@bailian-studio/model-core'

describe('model registry', () => {
  it('freezes exported registry manifests at the top level', () => {
    const model = getModelById('qwen-image')

    expect(Object.isFrozen(MODEL_REGISTRY)).toBe(true)
    expect(model).toBeDefined()
    expect(Object.isFrozen(model)).toBe(true)
    expect(() => {
      Object.assign(model!, { id: 'mutated' })
    }).toThrow(TypeError)
    expect(getModelById('qwen-image')?.id).toBe('qwen-image')
  })

  it('freezes nested manifest arrays and pricing tiers', () => {
    const [model] = listModels()

    expect(model).toBeDefined()
    expect(Object.isFrozen(model!.parameters)).toBe(true)
    expect(Object.isFrozen(model!.pricing.tiers)).toBe(true)
    expect(Object.isFrozen(model!.pricing.tiers[0])).toBe(true)
    const mutableParameters = model!.parameters as unknown as Array<{ name: string; label: string; type: 'text' }>
    const firstTier = model!.pricing.tiers[0] as unknown as { priceCents: number }
    expect(() => {
      mutableParameters.push({ name: 'extra', label: 'Extra', type: 'text' })
    }).toThrow(TypeError)
    expect(() => {
      Object.assign(firstTier, { priceCents: 0 })
    }).toThrow(TypeError)
  })
})
