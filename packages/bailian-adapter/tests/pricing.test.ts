import { describe, expect, it } from 'vitest'
import { getModelById, qwenImage } from '@bailian-studio/model-core'
import {
  calculateOfficialBailianUsageCost,
  estimateBailianModelCost,
  estimateOfficialBailianCost,
  listOfficialBailianPricing,
} from '../src'

describe('@bailian-studio/bailian-adapter official pricing', () => {
  it('reads only official cn-beijing pricing for covered products', () => {
    const rates = listOfficialBailianPricing('happyhorse-text-to-video')
    expect(rates).toHaveLength(3)
    expect(rates.every((rate) => rate.region === 'cn-beijing')).toBe(true)
    expect(rates.map((rate) => rate.unitPrice)).toEqual(['0.45', '0.9', '1.2'])
    expect(listOfficialBailianPricing('fun-music-v1')).toMatchObject([
      { unit: 'second', unitSize: 1, unitPrice: '0.002' },
    ])
  })

  it('estimates covered model costs from exact official decimal rates', () => {
    expect(estimateOfficialBailianCost('keling-text-to-video', {
      mode: 'std', duration: 5, audio: false,
    })).toMatchObject({
      cents: 300,
      inputQuantity: 5,
      outputQuantity: 5,
      billableQuantity: 5,
    })
    expect(estimateOfficialBailianCost('keling-reference-video', {
      mode: 'pro', duration: 10, audio: false,
    }).cents).toBe(800)
    expect(estimateOfficialBailianCost('keling-reference-video', {
      mode: 'pro', duration: 10, audio: false, featureVideo: 'https://example.com/reference.mp4',
    }).cents).toBe(1200)
    expect(estimateOfficialBailianCost('happyhorse-text-to-video', {
      resolution: '480P', duration: 5,
    }).cents).toBe(225)
    expect(estimateOfficialBailianCost('happyhorse-video-edit', {
      resolution: '1080P', duration: 5,
    })).toMatchObject({ cents: 1600, inputQuantity: 5, outputQuantity: 5, billableQuantity: 10 })
    expect(estimateOfficialBailianCost('fun-music-v1', { duration: 60 }).cents).toBe(12)
    expect(estimateOfficialBailianCost('deepseek-v4-pro', {
      maxCompletionTokens: 4096,
    })).toMatchObject({
      cents: 10,
      outputQuantity: 4096,
      rate: { chargeItem: 'output', unitPrice: '24' },
    })
    expect(estimateOfficialBailianCost('deepseek-v4-flash', {
      maxCompletionTokens: 4096,
    })).toMatchObject({
      cents: 1,
      outputQuantity: 4096,
      rate: { chargeItem: 'output', unitPrice: '2' },
    })
  })

  it('tracks distinct actual input and output quantities for input-and-output billing', () => {
    expect(calculateOfficialBailianUsageCost(
      'happyhorse-video-edit',
      { resolution: '1080P' },
      { input_video_duration: 4.25, output_video_duration: 6.5 },
    )).toMatchObject({
      cents: 1720,
      inputQuantity: 4.25,
      outputQuantity: 6.5,
      billableQuantity: 10.75,
    })
  })

  it('uses official image pricing after the catalog reaches full coverage', () => {
    expect(estimateBailianModelCost(qwenImage, { n: 1 })).toMatchObject({
      cents: 25,
      source: 'sdk',
      official: { billableQuantity: 1 },
    })
  })

  it('keeps preflight-only multimodal estimates distinct from final official usage billing', () => {
    const screenplay = getModelById('qwen-omni-screenplay')
    if (screenplay === undefined) throw new Error('screenplay manifest is missing')
    expect(estimateBailianModelCost(screenplay, { estimatedDuration: 60 })).toMatchObject({
      cents: 60,
      source: 'manifest-estimate',
    })
  })
})
