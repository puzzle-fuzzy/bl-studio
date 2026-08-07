import { describe, expect, it } from 'vitest'
import {
  calculateUsageCostCents,
  calculateUsagePriceCents,
  estimateModelCost,
  estimatePriceCents,
  type ModelManifest,
} from '../src'

const baseManifest: ModelManifest = {
  id: 'priced-image',
  provider: 'dashscope',
  providerModel: 'qwen-image',
  displayName: 'Priced Image',
  category: 'image',
  taskMode: 'sync',
  capabilities: ['text_prompt'],
  parameters: [
    { name: 'n', label: 'Count', type: 'number', defaultValue: 1, min: 1, max: 6, step: 1 },
    {
      name: 'size',
      label: 'Size',
      type: 'select',
      defaultValue: '1024*1024',
      options: [{ label: '1:1', value: '1024*1024' }, { label: '2K', value: '2048*2048' }],
    },
  ],
  request: {
    kind: 'dashscope-image-message',
    endpoint: '/images',
    bindings: {
      n: { target: 'parameters.field' },
      size: { target: 'parameters.field' },
    },
  },
  output: { kind: 'images-from-message-content' },
  pricing: {
    unit: 'per_image',
    quantityKey: 'n',
    currency: 'CNY',
    rates: [
      {
        id: 'output-default',
        region: 'cn-beijing',
        serviceScope: 'china-mainland',
        chargeItem: 'output',
        unit: 'image',
        unitSize: 1,
        unitPrice: '0.1',
        conditions: {},
      },
      {
        id: 'output-large',
        region: 'cn-beijing',
        serviceScope: 'china-mainland',
        chargeItem: 'output',
        unit: 'image',
        unitSize: 1,
        unitPrice: '0.25',
        conditions: { size: '2048*2048' },
      },
    ],
  },
  transport: {
    mode: 'sync',
    submit: {
      method: 'POST',
      endpointTemplate: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      modelFieldPath: '/model',
      headers: [],
    },
  },
  availability: { enabled: true, stage: 'stable' },
}

describe('estimatePriceCents', () => {
  it('uses default rate and quantity', () => {
    expect(estimatePriceCents(baseManifest, { n: 3 })).toBe(30)
  })

  it('uses matching rate', () => {
    expect(estimatePriceCents(baseManifest, { n: 2, size: '2048*2048' })).toBe(50)
  })

  it('falls back to the default rate when conditions do not match', () => {
    expect(estimatePriceCents(baseManifest, { n: 2, size: '1792*1024' })).toBe(20)
  })

  it('scales per_token rates (decimal yuan per 1M tokens) down to an integer-cent estimate', () => {
    const textManifest: ModelManifest = {
      ...baseManifest,
      id: 'priced-text',
      category: 'text',
      request: { kind: 'dashscope-chat', endpoint: '/text-generation/generation', promptParam: 'prompt', bindings: {} },
      output: { kind: 'text', path: 'output.text' },
      pricing: {
        unit: 'per_token',
        quantityKey: 'maxTokens',
        currency: 'CNY',
        rates: [{
          id: 'output-token',
          region: 'cn-beijing',
          serviceScope: 'china-mainland',
          chargeItem: 'output',
          unit: 'token',
          unitSize: 1000000,
          unitPrice: '2',
          conditions: {},
        }],
      },
    }
    // 每百万 token 2 元 = 每 token 0.0002 分，1024 token → 0.2048 分 → 取整为 0；
    // 但 token 费率提交前无法预知实际用量，取整成 0 会误导预检并架空每日成本上限，
    // 因此对 token 计费给保守下限 1 分（P1-02，与结算 Math.max(1, …) 口径一致）。
    expect(estimatePriceCents(textManifest, { maxTokens: 1024 })).toBe(1)
    expect(Number.isInteger(estimatePriceCents(textManifest, { maxTokens: 1024 }))).toBe(true)
  })

  it('rounds sub-cent per-second rates to integer cents (never a float into the integer column)', () => {
    // 复现 screenplay-flash 的崩溃：0.005 元/秒 × 63s = 31.5 分，此前以浮点数
    // 返回，被 integer 类型的 cost_estimate 列拒绝。
    const screenplayManifest: ModelManifest = {
      ...baseManifest,
      id: 'priced-screenplay',
      category: 'video',
      request: { kind: 'dashscope-chat', endpoint: '/chat/completions', promptParam: 'prompt', stream: true, bindings: {} },
      output: { kind: 'text', path: 'output.text' },
      pricing: {
        unit: 'per_second',
        quantityKey: 'estimatedDuration',
        currency: 'CNY',
        rates: [{
          id: 'output-second',
          region: 'cn-beijing',
          serviceScope: 'china-mainland',
          chargeItem: 'output',
          unit: 'second',
          unitSize: 1,
          unitPrice: '0.005',
          conditions: {},
        }],
      },
    }
    expect(estimatePriceCents(screenplayManifest, { estimatedDuration: 63 })).toBe(32)
  })

  it('never estimates 0 for token-billed manifests whose quantity is a cost proxy (P1-02 regression)', () => {
    // 复现 qwen-omni-screenplay 的 P1-02：pricing 声明 token 费率，但 quantityKey 是
    // UI 费用预估参数 estimatedDuration（秒）。此前 60 秒 × per-token 费率（0.004 分/token）
    // ≈ 0.24 分被 Math.round 成 0，日限额按 0 累加。mode 是内部计费标记、applyDefaults
    // 恒删除，conditions 永不命中——这与真实提交形态一致。
    const screenplayManifest: ModelManifest = {
      ...baseManifest,
      id: 'priced-screenplay-token',
      category: 'video',
      request: { kind: 'dashscope-chat', endpoint: '/chat/completions', promptParam: 'prompt', stream: true, bindings: {} },
      output: { kind: 'text', path: 'output.text' },
      pricing: {
        unit: 'per_token',
        quantityKey: 'estimatedDuration',
        currency: 'CNY',
        rates: [
          {
            id: 'output-multimodal-token',
            region: 'cn-beijing',
            serviceScope: 'china-mainland',
            chargeItem: 'output',
            unit: 'token',
            unitSize: 1000000,
            unitPrice: '40',
            conditions: { mode: 'multimodal-input-text-output' },
          },
        ],
      },
    }
    expect(estimatePriceCents(screenplayManifest, { estimatedDuration: 60 })).toBe(1)
    expect(estimateModelCost(screenplayManifest, { estimatedDuration: 60 }).cents).toBeGreaterThanOrEqual(1)
  })

  it('falls back to input rates when the manifest declares no output rate', () => {
    const inputOnlyManifest: ModelManifest = {
      ...baseManifest,
      pricing: {
        unit: 'per_image',
        quantityKey: 'n',
        currency: 'CNY',
        rates: [{
          id: 'input-default',
          region: 'cn-beijing',
          serviceScope: 'china-mainland',
          chargeItem: 'input',
          unit: 'image',
          unitSize: 1,
          unitPrice: '0.2',
          conditions: {},
        }],
      },
    }
    expect(estimatePriceCents(inputOnlyManifest, { n: 1 })).toBe(20)
  })
})

describe('calculateUsagePriceCents', () => {
  it('settles chat token usage from manifest-declared mode-specific token rates', () => {
    const chatManifest: ModelManifest = {
      ...baseManifest,
      id: 'priced-chat',
      taskMode: 'stream',
      request: { kind: 'dashscope-chat', endpoint: '/chat', promptParam: 'prompt', bindings: {} },
      pricing: {
        unit: 'per_token',
        quantityKey: 'estimatedDuration',
        currency: 'CNY',
        rates: [
          {
            id: 'input-visual-token',
            region: 'cn-beijing',
            serviceScope: 'china-mainland',
            chargeItem: 'input',
            unit: 'token',
            unitSize: 1000000,
            unitPrice: '7',
            conditions: { mode: 'text-image-video-input' },
          },
          {
            id: 'input-audio-token',
            region: 'cn-beijing',
            serviceScope: 'china-mainland',
            chargeItem: 'input',
            unit: 'token',
            unitSize: 1000000,
            unitPrice: '53',
            conditions: { mode: 'audio-input' },
          },
          {
            id: 'output-multimodal-token',
            region: 'cn-beijing',
            serviceScope: 'china-mainland',
            chargeItem: 'output',
            unit: 'token',
            unitSize: 1000000,
            unitPrice: '40',
            conditions: { mode: 'multimodal-input-text-output' },
          },
        ],
      },
    }

    // 1M 文本输入 × 7 元/M + 500K 音频输入 × 53 元/M + 250K 文本输出 × 40 元/M
    // = 700 + 2650 + 1000 = 4350 分
    expect(calculateUsagePriceCents(chatManifest, {
      promptTokensDetails: { textTokens: 1_000_000, audioTokens: 500_000 },
      completionTokensDetails: { textTokens: 250_000 },
    })).toBe(4_350)
  })

  it('settles audio-heavy usage against the audio-input rate only', () => {
    const chatManifest: ModelManifest = {
      ...baseManifest,
      id: 'priced-chat',
      taskMode: 'stream',
      request: { kind: 'dashscope-chat', endpoint: '/chat', promptParam: 'prompt', bindings: {} },
      pricing: {
        unit: 'per_token',
        quantityKey: 'estimatedDuration',
        currency: 'CNY',
        rates: [
          {
            id: 'input-visual-token',
            region: 'cn-beijing',
            serviceScope: 'china-mainland',
            chargeItem: 'input',
            unit: 'token',
            unitSize: 1000000,
            unitPrice: '7',
            conditions: { mode: 'text-image-video-input' },
          },
          {
            id: 'input-audio-token',
            region: 'cn-beijing',
            serviceScope: 'china-mainland',
            chargeItem: 'input',
            unit: 'token',
            unitSize: 1000000,
            unitPrice: '53',
            conditions: { mode: 'audio-input' },
          },
          {
            id: 'output-multimodal-token',
            region: 'cn-beijing',
            serviceScope: 'china-mainland',
            chargeItem: 'output',
            unit: 'token',
            unitSize: 1000000,
            unitPrice: '40',
            conditions: { mode: 'multimodal-input-text-output' },
          },
        ],
      },
    }

    // 100K 音频输入 × 53 元/M + 10K 文本输出 × 40 元/M = 530 + 40 = 570 分
    expect(calculateUsagePriceCents(chatManifest, {
      promptTokensDetails: { audioTokens: 100_000 },
      completionTokensDetails: { textTokens: 10_000 },
    })).toBe(570)
  })

  it('settles mode-less token rates against the default input/output rates', () => {
    // DeepSeek 风格的逐字 token 计费：无 conditions.mode，直接命中默认 input/output rate。
    const deepseekManifest: ModelManifest = {
      ...baseManifest,
      id: 'priced-deepseek',
      taskMode: 'sync',
      request: { kind: 'dashscope-chat', endpoint: '/chat', promptParam: 'prompt', bindings: {} },
      pricing: {
        unit: 'per_token',
        quantityKey: 'maxCompletionTokens',
        currency: 'CNY',
        rates: [
          {
            id: 'input-default-token',
            region: 'cn-beijing',
            serviceScope: 'china-mainland',
            chargeItem: 'input',
            unit: 'token',
            unitSize: 1000000,
            unitPrice: '12',
            conditions: {},
          },
          {
            id: 'output-default-token',
            region: 'cn-beijing',
            serviceScope: 'china-mainland',
            chargeItem: 'output',
            unit: 'token',
            unitSize: 1000000,
            unitPrice: '24',
            conditions: {},
          },
        ],
      },
    }

    // 1M 文本输入 × 12 元/M + 500K 文本输出 × 24 元/M = 1200 + 1200 = 2400 分
    expect(calculateUsagePriceCents(deepseekManifest, {
      promptTokens: 1_000_000,
      completionTokens: 500_000,
    })).toBe(2_400)
  })

  it('returns undefined when the manifest or usage has no token billing data', () => {
    expect(calculateUsagePriceCents(baseManifest, { promptTokens: 1_000_000 })).toBeUndefined()

    const tokenManifest: ModelManifest = {
      ...baseManifest,
      pricing: {
        unit: 'per_token',
        quantityKey: 'maxTokens',
        currency: 'CNY',
        rates: [{
          id: 'input-default-token',
          region: 'cn-beijing',
          serviceScope: 'china-mainland',
          chargeItem: 'input',
          unit: 'token',
          unitSize: 1000000,
          unitPrice: '1',
          conditions: {},
        }],
      },
    }
    expect(calculateUsagePriceCents(tokenManifest, {})).toBeUndefined()
  })
})

describe('input-and-output billing', () => {
  const videoEditManifest: ModelManifest = {
    ...baseManifest,
    id: 'priced-video-edit',
    category: 'video',
    pricing: {
      unit: 'per_second',
      quantityKey: 'duration',
      currency: 'CNY',
      rates: [{
        id: '720p-input-output',
        region: 'cn-beijing',
        serviceScope: 'china-mainland',
        chargeItem: 'input-and-output',
        unit: 'second',
        unitSize: 1,
        unitPrice: '0.9',
        conditions: { resolution: '720P' },
      }],
    },
  }

  it('doubles the quantity for input-and-output charge items (both ends billed)', () => {
    // 0.9 元/秒 × (5s 输入 + 5s 输出) = 900 分
    expect(estimatePriceCents(videoEditManifest, { resolution: '720P', duration: 5 })).toBe(900)
    expect(estimateModelCost(videoEditManifest, { resolution: '720P', duration: 5 }).official?.billableQuantity).toBe(10)
  })

  it('settles input-and-output usage from both input and output durations', () => {
    const estimate = calculateUsageCostCents(videoEditManifest, { resolution: '720P', duration: 5 }, {
      output_video_duration: 5.5,
      input_video_duration: 5.25,
    })
    expect(estimate?.billableQuantity).toBe(10.75)
    expect(estimate?.cents).toBe(968) // 0.9 元/秒 × 10.75 = 9.675 元 → 968 分（BigInt 四舍五入）
  })

  it('falls back to params.duration when usage lacks input duration', () => {
    const estimate = calculateUsageCostCents(videoEditManifest, { resolution: '720P', duration: 5 }, {
      output_video_duration: 5,
    })
    expect(estimate?.billableQuantity).toBe(10)
    expect(estimate?.cents).toBe(900)
  })
})

describe('presence-predicate pricing conditions', () => {
  it('matches rates whose conditions use { present } on media params', () => {
    const referenceManifest: ModelManifest = {
      ...baseManifest,
      id: 'priced-reference',
      category: 'video',
      pricing: {
        unit: 'per_second',
        quantityKey: 'duration',
        currency: 'CNY',
        rates: [
          {
            id: 'no-reference',
            region: 'cn-beijing',
            serviceScope: 'china-mainland',
            chargeItem: 'output',
            unit: 'second',
            unitSize: 1,
            unitPrice: '0.6',
            conditions: { featureVideo: { present: false } },
          },
          {
            id: 'with-reference',
            region: 'cn-beijing',
            serviceScope: 'china-mainland',
            chargeItem: 'output',
            unit: 'second',
            unitSize: 1,
            unitPrice: '1.2',
            conditions: { featureVideo: { present: true } },
          },
        ],
      },
    }
    expect(estimatePriceCents(referenceManifest, { duration: 10 })).toBe(600)
    expect(estimatePriceCents(referenceManifest, { duration: 10, featureVideo: 'https://x/v.mp4' })).toBe(1200)
    expect(estimatePriceCents(referenceManifest, { duration: 10, featureVideo: [] })).toBe(600)
  })
})

describe('estimateModelCost', () => {
  it('estimates token-billed models from request-param ceilings (manifest-estimate)', () => {
    const tokenManifest: ModelManifest = {
      ...baseManifest,
      id: 'priced-token-model',
      category: 'text',
      pricing: {
        unit: 'per_token',
        quantityKey: 'maxCompletionTokens',
        currency: 'CNY',
        rates: [{
          id: 'output-token',
          region: 'cn-beijing',
          serviceScope: 'china-mainland',
          chargeItem: 'output',
          unit: 'token',
          unitSize: 1000000,
          unitPrice: '24',
          conditions: {},
        }],
      },
    }
    expect(estimateModelCost(tokenManifest, { maxCompletionTokens: 4096 })).toEqual({
      cents: 10,
      currency: 'CNY',
      source: 'manifest-estimate',
    })
  })

  it('settles duration-billed models against the official rate with BigInt math', () => {
    const estimate = estimateModelCost(baseManifest, { n: 2, size: '2048*2048' })
    expect(estimate.cents).toBe(50)
    expect(estimate.source).toBe('manifest')
    expect(estimate.official?.rate.id).toBe('output-large')
    expect(estimate.official?.billableQuantity).toBe(2)
  })

  it('never throws on boundary inputs — falls back to a conservative estimate', () => {
    expect(estimateModelCost(baseManifest, {}).cents).toBeGreaterThanOrEqual(0)
    expect(Number.isInteger(estimateModelCost(baseManifest, {}).cents)).toBe(true)
  })
})

describe('calculateUsageCostCents', () => {
  it('settles output-duration billing from usage for non-input-and-output models', () => {
    const durationManifest: ModelManifest = {
      ...baseManifest,
      id: 'priced-video',
      category: 'video',
      pricing: {
        unit: 'per_second',
        quantityKey: 'duration',
        currency: 'CNY',
        rates: [{
          id: 'output-second',
          region: 'cn-beijing',
          serviceScope: 'china-mainland',
          chargeItem: 'output',
          unit: 'second',
          unitSize: 1,
          unitPrice: '0.6',
          conditions: {},
        }],
      },
    }
    const estimate = calculateUsageCostCents(durationManifest, { duration: 5 }, {
      output_video_duration: 5.375,
    })
    // 0.6 元/秒 × 5.375 = 3.225 元 → 323 分（BigInt 四舍五入）
    expect(estimate?.billableQuantity).toBe(5.375)
    expect(estimate?.cents).toBe(323)
  })

  it('returns undefined for token-billed manifests (deferred to calculateUsagePriceCents)', () => {
    const tokenManifest: ModelManifest = {
      ...baseManifest,
      pricing: {
        unit: 'per_token',
        quantityKey: 'maxTokens',
        currency: 'CNY',
        rates: [{
          id: 'output-token',
          region: 'cn-beijing',
          serviceScope: 'china-mainland',
          chargeItem: 'output',
          unit: 'token',
          unitSize: 1000000,
          unitPrice: '2',
          conditions: {},
        }],
      },
    }
    expect(calculateUsageCostCents(tokenManifest, {}, { promptTokens: 10 })).toBeUndefined()
  })

  it('returns undefined when usage has no recognizable duration', () => {
    expect(calculateUsageCostCents(baseManifest, {}, {})).toBeUndefined()
  })
})
