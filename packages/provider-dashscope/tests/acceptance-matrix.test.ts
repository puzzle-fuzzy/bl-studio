import { describe, expect, it } from 'vitest'
import { getModelById, listModels, qwenImage, type FrozenModelManifest } from '@bailian-studio/model-core'
import { runOfflineModelAcceptance } from '../src/acceptance'

describe('offline model acceptance matrix', () => {
  it('covers every enabled manifest with a valid request fixture', () => {
    const report = runOfflineModelAcceptance()

    expect(report.models).toHaveLength(listModels().length)
    expect(report.failures).toEqual([])
    expect(new Set(report.models.map(model => model.modelId))).toEqual(new Set(listModels().map(model => model.id)))
    expect(report.models.every(model => model.requestFixtureStatus === 'covered')).toBe(true)
    expect(report.models.every(model => model.responseFixtureStatus === 'covered')).toBe(true)
  })

  it('reports an unsupported provider instead of silently accepting it', () => {
    const unsupported = { ...qwenImage, provider: 'other' } as unknown as FrozenModelManifest
    const report = runOfflineModelAcceptance([unsupported])

    expect(report.failures).toEqual([
      expect.objectContaining({ modelId: 'qwen-image', code: 'UNSUPPORTED_PROVIDER' }),
    ])
  })

  it('keeps the matrix tied to the registry model identity', () => {
    expect(getModelById('qwen-image')?.id).toBe('qwen-image')
  })

  it('seeds one media fixture for unconditional grouped-media minimums', () => {
    const referenceModel = getModelById('wanx-2.7-reference-video')
    expect(referenceModel).toBeDefined()

    const report = runOfflineModelAcceptance([referenceModel!])

    expect(report.failures).toEqual([])
    expect(report.models[0]?.requestFixtureStatus).toBe('covered')
  })
})
