import { describe, expect, it } from 'vitest'
import { validateModelParams, type ModelManifest } from '../src'

const manifest: ModelManifest = {
  id: 'test-image',
  provider: 'dashscope',
  providerModel: 'qwen-image',
  displayName: 'Test Image',
  category: 'image',
  taskMode: 'sync',
  capabilities: ['text_prompt'],
  parameters: [
    { name: 'prompt', label: 'Prompt', type: 'text', required: true, maxLength: 10 },
    { name: 'n', label: 'Count', type: 'number', defaultValue: 1, min: 1, max: 4, step: 1 },
    { name: 'size', label: 'Size', type: 'select', defaultValue: '1024*1024', options: [{ label: '1:1', value: '1024*1024' }, { label: '4:3', value: '2048*1536' }] },
    { name: 'style', label: 'Style', type: 'text', defaultValue: 'clean', visibleWhen: { field: 'size', equals: '1024*1024' } },
  ],
  request: {
    kind: 'dashscope-image-message',
    endpoint: '/images',
    bindings: {
      prompt: { target: 'input.prompt' },
      n: { target: 'parameters.field' },
      size: { target: 'parameters.field' },
    },
  },
  output: { kind: 'images-from-message-content' },
  pricing: { unit: 'per_image', quantityKey: 'n', currency: 'CNY', tiers: [{ condition: {}, priceCents: 10 }] },
  availability: { enabled: true, stage: 'stable' },
}

describe('validateModelParams', () => {
  it('applies defaults and validates valid params', () => {
    const result = validateModelParams(manifest, { prompt: 'hello' })
    expect(result.valid).toBe(true)
    expect(result.params.n).toBe(1)
    expect(result.params.size).toBe('1024*1024')
  })

  it('reports required and range errors', () => {
    const result = validateModelParams(manifest, { n: 8 })
    expect(result.valid).toBe(false)
    expect(result.errors.map(error => error.field)).toContain('prompt')
    expect(result.errors.map(error => error.field)).toContain('n')
    expect(result.errors.find(error => error.field === 'prompt')).toEqual({
      code: 'REQUIRED_PARAMETER',
      field: 'prompt',
      message: 'prompt is required',
      messages: {
        'zh-CN': 'Prompt为必填参数',
        'en-US': 'prompt is required',
      },
      expected: {
        'zh-CN': '请提供非空值',
        'en-US': 'Provide a non-empty value',
      },
    })
  })

  it('rejects non-finite number params', () => {
    const nanResult = validateModelParams(manifest, { prompt: 'hello', n: Number.NaN })
    const infinityResult = validateModelParams(manifest, { prompt: 'hello', n: Infinity })

    expect(nanResult.valid).toBe(false)
    expect(nanResult.errors.map(error => error.field)).toContain('n')
    expect(infinityResult.valid).toBe(false)
    expect(infinityResult.errors.map(error => error.field)).toContain('n')
  })

  it('rejects fractional values for integer-step parameters', () => {
    const fractional = validateModelParams(manifest, {
      prompt: 'hello',
      n: 3.45874587458746,
    })

    expect(fractional.valid).toBe(false)
    expect(fractional.errors).toContainEqual({
      code: 'INVALID_VALUE',
      field: 'n',
      message: 'n must be an integer',
      messages: {
        'zh-CN': 'Count必须是整数',
        'en-US': 'n must be an integer',
      },
      expected: {
        'zh-CN': '整数',
        'en-US': 'An integer',
      },
    })
    expect(validateModelParams(manifest, { prompt: 'hello', n: 3 }).valid).toBe(true)
  })

  it('enforces exclusive numeric bounds from the official contract', () => {
    const exclusiveManifest: ModelManifest = {
      ...manifest,
      parameters: manifest.parameters.map((parameter) => parameter.name === 'n'
        ? {
            ...parameter,
            min: 0,
            exclusiveMin: true,
            max: 1,
            exclusiveMax: true,
            step: undefined,
            defaultValue: 0.5,
          }
        : parameter),
    }

    expect(validateModelParams(exclusiveManifest, { prompt: 'hello', n: 0 }).errors)
      .toContainEqual(expect.objectContaining({ field: 'n', code: 'OUT_OF_RANGE' }))
    expect(validateModelParams(exclusiveManifest, { prompt: 'hello', n: 1 }).errors)
      .toContainEqual(expect.objectContaining({ field: 'n', code: 'OUT_OF_RANGE' }))
    expect(validateModelParams(exclusiveManifest, { prompt: 'hello', n: 0.5 }).valid).toBe(true)
  })

  it('validates ordered media cardinality without changing single-media compatibility', () => {
    const mediaManifest: ModelManifest = {
      ...manifest,
      parameters: [
        ...manifest.parameters,
        {
          name: 'references',
          label: 'References',
          type: 'media',
          mediaKind: 'image',
          required: true,
          minItems: 1,
          maxItems: 3,
        },
      ],
      request: {
        ...manifest.request,
        bindings: {
          ...manifest.request.bindings,
          references: { target: 'input.media', mediaType: 'image' },
        },
      },
    }

    expect(validateModelParams(mediaManifest, {
      prompt: 'hello',
      references: 'https://example.com/a.png',
    }).valid).toBe(true)
    expect(validateModelParams(mediaManifest, {
      prompt: 'hello',
      references: ['a', 'b', 'c'],
    }).valid).toBe(true)

    const tooMany = validateModelParams(mediaManifest, {
      prompt: 'hello',
      references: ['a', 'b', 'c', 'd'],
    })
    expect(tooMany.valid).toBe(false)
    expect(tooMany.errors).toContainEqual(expect.objectContaining({
      code: 'OUT_OF_RANGE',
      field: 'references',
    }))
  })

  it('treats omitted media maxItems as a single-asset limit', () => {
    const singleMediaManifest: ModelManifest = {
      ...manifest,
      parameters: [
        ...manifest.parameters,
        {
          name: 'video',
          label: 'Video',
          type: 'media',
          mediaKind: 'video',
        },
      ],
      request: {
        ...manifest.request,
        bindings: {
          ...manifest.request.bindings,
          video: { target: 'input.media', mediaType: 'video' },
        },
      },
    }

    expect(validateModelParams(singleMediaManifest, {
      prompt: 'hello',
      video: 'video-a',
    }).valid).toBe(true)
    expect(validateModelParams(singleMediaManifest, {
      prompt: 'hello',
      video: ['video-a', 'video-b'],
    }).errors).toContainEqual(expect.objectContaining({
      code: 'OUT_OF_RANGE',
      field: 'video',
    }))
  })

  it('validates combined media group cardinality across image and video fields', () => {
    const groupedManifest: ModelManifest = {
      ...manifest,
      capabilities: ['text_prompt', 'image_input', 'video_input', 'multi_reference'],
      parameters: [
        ...manifest.parameters,
        { name: 'images', label: 'Images', type: 'media', mediaKind: 'image', maxItems: 5 },
        { name: 'videos', label: 'Videos', type: 'media', mediaKind: 'video', maxItems: 5 },
      ],
      mediaGroups: [{ parameters: ['images', 'videos'], minItems: 1, maxItems: 5 }],
      request: {
        ...manifest.request,
        bindings: {
          ...manifest.request.bindings,
          images: { target: 'input.media', mediaType: 'reference_image' },
          videos: { target: 'input.media', mediaType: 'reference_video' },
        },
      },
    }

    expect(validateModelParams(groupedManifest, {
      prompt: 'hello',
      videos: ['video-a'],
    }).valid).toBe(true)
    expect(validateModelParams(groupedManifest, {
      prompt: 'hello',
    }).errors).toContainEqual(expect.objectContaining({
      code: 'OUT_OF_RANGE',
      field: 'images',
    }))
    expect(validateModelParams(groupedManifest, {
      prompt: 'hello',
      images: ['a', 'b', 'c'],
      videos: ['d', 'e', 'f'],
    }).errors).toContainEqual(expect.objectContaining({
      code: 'OUT_OF_RANGE',
      field: 'images',
    }))
  })

  it('applies a media group only when its dependency is present', () => {
    const conditionalManifest: ModelManifest = {
      ...manifest,
      capabilities: ['text_prompt', 'image_input', 'video_input', 'multi_reference'],
      parameters: [
        ...manifest.parameters,
        { name: 'images', label: 'Images', type: 'media', mediaKind: 'image', maxItems: 7 },
        { name: 'featureVideo', label: 'Feature video', type: 'media', mediaKind: 'video' },
      ],
      mediaGroups: [
        { parameters: ['images', 'featureVideo'], minItems: 1 },
        {
          parameters: ['images', 'featureVideo'],
          maxItems: 5,
          when: { field: 'featureVideo', present: true },
        },
      ],
      request: {
        ...manifest.request,
        bindings: {
          ...manifest.request.bindings,
          images: { target: 'input.media', mediaType: 'reference_image' },
          featureVideo: { target: 'input.media', mediaType: 'feature_video' },
        },
      },
    }

    expect(validateModelParams(conditionalManifest, {
      prompt: 'hello',
      images: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
    }).valid).toBe(true)
    expect(validateModelParams(conditionalManifest, {
      prompt: 'hello',
      featureVideo: 'feature-a',
    }).valid).toBe(true)
    expect(validateModelParams(conditionalManifest, {
      prompt: 'hello',
      images: ['a', 'b', 'c', 'd'],
      featureVideo: 'feature-a',
    }).valid).toBe(true)
    expect(validateModelParams(conditionalManifest, {
      prompt: 'hello',
      images: ['a', 'b', 'c', 'd', 'e'],
      featureVideo: 'feature-a',
    }).errors).toContainEqual(expect.objectContaining({
      code: 'OUT_OF_RANGE',
      field: 'images',
    }))
    expect(validateModelParams(conditionalManifest, {
      prompt: 'hello',
      images: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
    }).errors).toContainEqual(expect.objectContaining({
      code: 'OUT_OF_RANGE',
      field: 'images',
    }))
    expect(validateModelParams(conditionalManifest, {
      prompt: 'hello',
      featureVideo: ['feature-a', 'feature-b'],
    }).errors).toContainEqual(expect.objectContaining({
      code: 'OUT_OF_RANGE',
      field: 'featureVideo',
    }))
    expect(validateModelParams(conditionalManifest, {
      prompt: 'hello',
    }).errors).toContainEqual(expect.objectContaining({
      code: 'OUT_OF_RANGE',
      field: 'images',
    }))
  })

  it('rejects unknown or retired product parameters instead of silently dropping them', () => {
    const result = validateModelParams(manifest, { prompt: 'hello', retiredSeed: 42 })

    expect(result.valid).toBe(false)
    expect(result.errors).toContainEqual({
      code: 'UNKNOWN_PARAMETER',
      field: 'retiredSeed',
      message: 'retiredSeed is not a supported parameter for test-image',
      messages: {
        'zh-CN': 'retiredSeed 不是 test-image 支持的参数',
        'en-US': 'retiredSeed is not a supported parameter for test-image',
      },
      expected: {
        'zh-CN': '仅可使用：prompt、n、size、style',
        'en-US': 'Use only: prompt, n, size, style',
      },
    })
  })

  it('does not default or validate a hidden parameter and strips its stale value', () => {
    const hidden = validateModelParams(manifest, {
      prompt: 'hello',
      size: '2048*1536',
      style: 'stale',
    })

    expect(hidden.valid).toBe(true)
    expect(hidden.params).not.toHaveProperty('style')

    const visible = validateModelParams(manifest, { prompt: 'hello', size: '1024*1024' })
    expect(visible.valid).toBe(true)
    expect(visible.params.style).toBe('clean')
  })

  it('validates a conditionally visible numeric parameter only when enabled', () => {
    const conditionalManifest: ModelManifest = {
      ...manifest,
      parameters: [
        ...manifest.parameters,
        {
          name: 'speakerCount',
          label: 'Speaker count',
          type: 'number',
          min: 2,
          max: 100,
          visibleWhen: { field: 'diarizationEnabled', equals: true },
        },
        {
          name: 'diarizationEnabled',
          label: 'Diarization',
          type: 'boolean',
          defaultValue: false,
        },
      ],
      request: {
        ...manifest.request,
        bindings: {
          ...manifest.request.bindings,
          speakerCount: { target: 'parameters.field', field: 'speaker_count' },
          diarizationEnabled: { target: 'parameters.field', field: 'diarization_enabled' },
        },
      },
    }

    const hidden = validateModelParams(conditionalManifest, {
      prompt: 'hello',
      diarizationEnabled: false,
      speakerCount: 1,
    })
    expect(hidden.valid).toBe(true)
    expect(hidden.params).not.toHaveProperty('speakerCount')

    const visible = validateModelParams(conditionalManifest, {
      prompt: 'hello',
      diarizationEnabled: true,
      speakerCount: 1,
    })
    expect(visible.valid).toBe(false)
    expect(visible.errors.map(error => error.field)).toContain('speakerCount')
  })

  it('compares structured select values by value instead of object identity', () => {
    const structured = {
      ...manifest,
      parameters: [
        ...manifest.parameters,
        {
          name: 'channelId',
          label: 'Channel',
          type: 'select' as const,
          defaultValue: [0],
          options: [{ label: 'First', value: [0] }],
        },
      ],
    }

    const withDefault = validateModelParams(structured, { prompt: 'hello' })
    expect(withDefault.valid).toBe(true)
    expect(withDefault.params.channelId).toEqual([0])

    const withEquivalentInput = validateModelParams(structured, { prompt: 'hello', channelId: [0] })
    expect(withEquivalentInput.valid).toBe(true)
  })
})
