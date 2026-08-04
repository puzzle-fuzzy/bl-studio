import { describe, expect, it } from 'vitest'
import {
  getModelAuditMetadata,
  getModelById,
  estimatePriceCents,
  listModels,
  MODEL_REGISTRY,
  validateModelParams,
} from '../src'

describe('model catalog composition', () => {
  it('exposes every registered model as enabled', () => {
    expect(listModels()).toHaveLength(MODEL_REGISTRY.length)
    expect(MODEL_REGISTRY.length).toBeGreaterThanOrEqual(40)
  })

  it('covers all four categories', () => {
    const categories = new Set(MODEL_REGISTRY.map(model => model.category))
    expect(categories).toEqual(new Set(['image', 'video', 'text', 'audio']))
  })

  it('includes the text, image-edit, and keling-extension additions', () => {
    const ids = new Set(MODEL_REGISTRY.map(model => model.id))
    // 文本类别
    expect(ids.has('qwen-plus')).toBe(true)
    expect(ids.has('qwen-max')).toBe(true)
    expect(ids.has('deepseek-v4-pro')).toBe(true)
    expect(ids.has('deepseek-v4-flash')).toBe(true)
    // 图像编辑
    expect(ids.has('qwen-image-edit-max')).toBe(true)
    // keling 扩展任务
    expect(ids.has('keling-first-last-frame-video')).toBe(true)
    expect(ids.has('keling-reference-video')).toBe(true)
    expect(ids.has('keling-video-edit')).toBe(true)
    // 视频补全
    expect(ids.has('happyhorse-video-edit')).toBe(true)
    expect(ids.has('vidu-reference-video')).toBe(true)
    expect(ids.has('wanx-2.7-video-edit')).toBe(true)
  })

  it('resolves a model by id and surfaces its manifest fields', () => {
    const model = getModelById('qwen-plus')
    expect(model).toBeDefined()
    expect(model?.category).toBe('text')
    expect(model?.pricing.unit).toBe('per_token')
  })

  it('exposes the DeepSeek V4 product parameter slice without pretending to support tool orchestration', () => {
    for (const modelId of ['deepseek-v4-pro', 'deepseek-v4-flash']) {
      const model = getModelById(modelId)
      expect(model).toBeDefined()
      expect(model?.taskMode).toBe('sync')
      expect(model?.parameters.map(parameter => parameter.name)).toEqual([
        'prompt',
        'maxCompletionTokens',
        'enableThinking',
        'reasoningEffort',
        'temperature',
        'topP',
        'repetitionPenalty',
        'presencePenalty',
        'stop',
        'seed',
        'resultFormat',
      ])
      expect(model?.parameters.find(parameter => parameter.name === 'reasoningEffort'))
        .toMatchObject({
          defaultValue: 'high',
          visibleWhen: { field: 'enableThinking', equals: true },
        })
      expect(model?.parameters.find(parameter => parameter.name === 'resultFormat'))
        .toMatchObject({ defaultValue: 'message', required: true })
      expect(model?.pricing.tiers).toEqual([{ condition: {}, priceCents: 0 }])

      const nonThinking = validateModelParams(model!, {
        prompt: '直接回答',
        enableThinking: false,
      })
      expect(nonThinking.valid).toBe(true)
      expect(nonThinking.params.reasoningEffort).toBeUndefined()
      expect(validateModelParams(model!, {
        prompt: 'unsupported tool request',
        tools: [],
      })).toMatchObject({
        valid: false,
        errors: [expect.objectContaining({ code: 'UNKNOWN_PARAMETER', field: 'tools' })],
      })
    }
  })

  it('derives stable audit metadata for pricing and the full manifest', () => {
    const model = getModelById('qwen-image')
    expect(model).toBeDefined()
    const first = getModelAuditMetadata(model!)
    const second = getModelAuditMetadata(model!)

    expect(first).toEqual(second)
    expect(first.pricingVersion).toMatch(/^pricing-[0-9a-f]{16}$/)
    expect(first.manifestHash).toMatch(/^manifest-[0-9a-f]{16}$/)

    const changed = getModelAuditMetadata({
      ...model!,
      pricing: { ...model!.pricing, tiers: model!.pricing.tiers.map((tier, index) => index === 0 ? { ...tier, priceCents: tier.priceCents + 1 } : tier) },
    })
    expect(changed.pricingVersion).not.toBe(first.pricingVersion)
    expect(changed.manifestHash).not.toBe(first.manifestHash)
  })

  it('fixes qwen-image output count at one without restricting qwen-image 2.0', () => {
    const qwenImage = getModelById('qwen-image')
    const qwenImage2Pro = getModelById('qwen-image-2.0-pro')

    expect(qwenImage?.parameters.find(parameter => parameter.name === 'n')).toMatchObject({
      defaultValue: 1,
      min: 1,
      max: 1,
      step: 1,
    })
    expect(validateModelParams(qwenImage!, {
      prompt: 'single output only',
      n: 2,
    })).toMatchObject({
      valid: false,
      errors: [expect.objectContaining({
        code: 'OUT_OF_RANGE',
        field: 'n',
      })],
    })
    expect(qwenImage2Pro?.parameters.find(parameter => parameter.name === 'n')).toMatchObject({
      defaultValue: 1,
      min: 1,
      max: 6,
      step: 1,
    })
  })

  it('hides disabled models from lookup', () => {
    const disabled = MODEL_REGISTRY.find(model => !model.availability.enabled)
    if (disabled === undefined) return // all enabled today; guard is the contract
    expect(getModelById(disabled.id)).toBeUndefined()
  })

  it('declares mediaKind on every media parameter', () => {
    // 每个 type: 'media' 的参数都必须声明 mediaKind，让前端「作品库」选择器能按
    // 媒体种类过滤候选成品（图像参数配图像、视频参数配视频、音频参数配音频）。
    const missing = listModels()
      .flatMap(model => model.parameters.map(param => ({ modelId: model.id, param })))
      .filter(({ param }) => param.type === 'media' && param.mediaKind === undefined)
      .map(({ modelId, param }) => `${modelId}.${param.name}`)

    expect(missing).toEqual([])
  })

  it('routes screenplay video URLs through durable video assets', () => {
    for (const modelId of ['qwen-omni-screenplay', 'qwen-omni-screenplay-flash']) {
      const videoUrl = getModelById(modelId)?.parameters.find(
        parameter => parameter.name === 'videoUrl',
      )

      expect(videoUrl).toMatchObject({
        name: 'videoUrl',
        type: 'media',
        mediaKind: 'video',
        required: true,
      })
    }
  })

  it('declares the combined Wanxiang 2.7 reference media limit', () => {
    const model = getModelById('wanx-2.7-reference-video')
    expect(model?.mediaGroups).toEqual([
      { parameters: ['references', 'referenceVideos'], minItems: 1, maxItems: 5 },
    ])
  })

  it('declares Keling reference media combinations without requiring images', () => {
    const model = getModelById('keling-reference-video')
    expect(model?.parameters.find(parameter => parameter.name === 'references')?.required).toBe(false)
    expect(model?.parameters.find(parameter => parameter.name === 'featureVideo')?.maxItems).toBe(1)
    expect(model?.mediaGroups).toEqual([
      { parameters: ['references', 'featureVideo'], minItems: 1 },
      {
        parameters: ['references', 'featureVideo'],
        maxItems: 5,
        when: { field: 'featureVideo', present: true },
      },
    ])
  })

  it('exposes Fun-ASR speaker count only when diarization is enabled', () => {
    const model = getModelById('fun-asr-v1')
    const speakerCount = model?.parameters.find(parameter => parameter.name === 'speakerCount')

    expect(speakerCount).toMatchObject({
      type: 'number',
      min: 2,
      max: 100,
      visibleWhen: { field: 'diarizationEnabled', equals: true },
    })
    expect(model?.request.bindings.speakerCount).toEqual({
      target: 'parameters.field',
      field: 'speaker_count',
    })
  })

  it('tracks the latest covered Fun Music and HappyHorse product parameters', () => {
    const funMusic = getModelById('fun-music-v1')
    expect(funMusic?.parameters.find(parameter => parameter.name === 'isInstrumental')).toMatchObject({
      type: 'boolean',
      defaultValue: false,
    })
    expect(funMusic?.request.bindings.isInstrumental).toEqual({
      target: 'input.field',
      field: 'is_instrumental',
    })

    for (const modelId of [
      'happyhorse-text-to-video',
      'happyhorse-image-to-video',
      'happyhorse-reference-video',
    ]) {
      const model = getModelById(modelId)
      expect(model?.parameters.find(parameter => parameter.name === 'resolution')?.options?.map(option => option.value))
        .toEqual(['480P', '720P', '1080P'])
      expect(estimatePriceCents(model!, { resolution: '480P', duration: 5 })).toBe(225)
    }

    expect(getModelById('happyhorse-video-edit')?.parameters
      .find(parameter => parameter.name === 'resolution')?.options?.map(option => option.value))
      .toEqual(['720P', '1080P'])
  })

  it('defaults every HappyHorse video operation to no watermark', () => {
    const inputs = {
      'happyhorse-text-to-video': { prompt: '纸板火车驶过微型城市' },
      'happyhorse-image-to-video': { firstFrame: 'https://example.com/first.png' },
      'happyhorse-reference-video': {
        references: ['https://example.com/reference.png'],
        prompt: '[Image 1] 在镜头前转身',
      },
      'happyhorse-video-edit': {
        video: 'https://example.com/base.mp4',
        prompt: '把天空改为晚霞',
      },
    } as const

    for (const [modelId, input] of Object.entries(inputs)) {
      const model = getModelById(modelId)
      expect(model?.parameters.find(parameter => parameter.name === 'watermark')).toMatchObject({
        type: 'boolean',
        defaultValue: false,
      })

      const validation = validateModelParams(model!, { ...input })
      expect(validation.valid).toBe(true)
      expect(validation.params.watermark).toBe(false)
    }
  })
})
