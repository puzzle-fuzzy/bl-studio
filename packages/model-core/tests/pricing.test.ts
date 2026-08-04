import { describe, expect, it } from 'vitest'
import { calculateUsagePriceCents, estimatePriceCents, type ModelManifest } from '../src'

const baseManifest: ModelManifest = {
  id: 'priced-image',
  provider: 'dashscope',
  providerModel: 'qwen-image',
  displayName: 'Priced Image',
  category: 'image',
  taskMode: 'sync',
  capabilities: ['text_prompt'],
  parameters: [],
  request: { kind: 'dashscope-image-message', endpoint: '/images', bindings: {} },
  output: { kind: 'images-from-message-content' },
  pricing: {
    unit: 'per_image',
    quantityKey: 'n',
    currency: 'CNY',
    tiers: [
      { condition: {}, priceCents: 10 },
      { condition: { size: '2048*2048' }, priceCents: 25 },
    ],
  },
  availability: { enabled: true, stage: 'stable' },
}

describe('estimatePriceCents', () => {
  it('uses default tier and quantity', () => {
    expect(estimatePriceCents(baseManifest, { n: 3 })).toBe(30)
  })

  it('uses matching tier', () => {
    expect(estimatePriceCents(baseManifest, { n: 2, size: '2048*2048' })).toBe(50)
  })

  it('scales per_token tiers (cents per 1M tokens) down to an integer-cent estimate', () => {
    const textManifest: ModelManifest = {
      ...baseManifest,
      id: 'priced-text',
      category: 'text',
      request: { kind: 'dashscope-chat', endpoint: '/text-generation/generation', promptParam: 'prompt', bindings: {} },
      output: { kind: 'text', path: 'output.text' },
      pricing: { unit: 'per_token', quantityKey: 'maxTokens', currency: 'CNY', tiers: [{ condition: {}, priceCents: 200 }] },
    }
    // 200 cents per 1M tokens, 1024 tokens → 0.2048 cents → rounded to 0 (integer)
    expect(estimatePriceCents(textManifest, { maxTokens: 1024 })).toBe(0)
    expect(Number.isInteger(estimatePriceCents(textManifest, { maxTokens: 1024 }))).toBe(true)
  })

  it('rounds sub-cent per-second rates to integer cents (never a float into the integer column)', () => {
    // Reproduces the screenplay-flash crash: priceCents 0.5 × 63s = 31.5, which used
    // to be returned as a float and rejected by the integer cost_estimate column.
    const screenplayManifest: ModelManifest = {
      ...baseManifest,
      id: 'priced-screenplay',
      category: 'video',
      request: { kind: 'dashscope-chat', endpoint: '/chat/completions', promptParam: 'prompt', stream: true, bindings: {} },
      output: { kind: 'text', path: 'output.text' },
      pricing: { unit: 'per_second', quantityKey: 'estimatedDuration', currency: 'CNY', tiers: [{ condition: {}, priceCents: 0.5 }] },
    }
    expect(estimatePriceCents(screenplayManifest, { estimatedDuration: 63 })).toBe(32)
  })
})

describe('calculateUsagePriceCents', () => {
  it('calculates chat token usage from manifest-declared input and output rates', () => {
    const chatManifest: ModelManifest = {
      ...baseManifest,
      id: 'priced-chat',
      taskMode: 'stream',
      request: { kind: 'dashscope-chat', endpoint: '/chat', promptParam: 'prompt', bindings: {} },
      pricing: {
        unit: 'per_second',
        quantityKey: 'estimatedDuration',
        currency: 'CNY',
        tiers: [{ condition: {}, priceCents: 1 }],
        actualUsage: {
          kind: 'chat_tokens',
          inputTextPriceCentsPerMillion: 700,
          inputAudioPriceCentsPerMillion: 5300,
          outputTextPriceCentsPerMillion: 4000,
        },
      },
    }

    expect(calculateUsagePriceCents(chatManifest, {
      promptTokensDetails: { textTokens: 1_000_000, audioTokens: 500_000 },
      completionTokensDetails: { textTokens: 250_000 },
    })).toBe(4_350)
  })

  it('returns undefined when the manifest or usage has no chat-token billing data', () => {
    expect(calculateUsagePriceCents(baseManifest, { promptTokens: 1_000_000 })).toBeUndefined()
    const chatManifest: ModelManifest = {
      ...baseManifest,
      pricing: {
        unit: 'per_second',
        quantityKey: 'estimatedDuration',
        currency: 'CNY',
        tiers: [{ condition: {}, priceCents: 1 }],
        actualUsage: {
          kind: 'chat_tokens',
          inputTextPriceCentsPerMillion: 700,
          inputAudioPriceCentsPerMillion: 5300,
          outputTextPriceCentsPerMillion: 4000,
        },
      },
    }
    expect(calculateUsagePriceCents(chatManifest, {})).toBeUndefined()
  })
})
