import { describe, expect, it } from 'vitest'
import { getModelById, validateModelParams, type ModelManifest } from '../src'

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
  pricing: {
    unit: 'per_image',
    quantityKey: 'n',
    currency: 'CNY',
    rates: [{
      id: 'output-default',
      region: 'cn-beijing',
      serviceScope: 'china-mainland',
      chargeItem: 'output',
      unit: 'image',
      unitSize: 1,
      unitPrice: '0.1',
      conditions: {},
    }],
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
      rules: [{ kind: 'media-group', fields: ['images', 'videos'], minItems: 1, maxItems: 5 }],
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
      rules: [
        { kind: 'media-group', fields: ['images', 'featureVideo'], minItems: 1 },
        {
          kind: 'media-group',
          fields: ['images', 'featureVideo'],
          maxItems: 5,
          condition: { kind: 'media-count', field: 'featureVideo', minimum: 1 },
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

  it('enforces the Vidu seed range declared in the manifest', () => {
    const model = getModelById('vidu-reference-video')
    expect(model).toBeDefined()
    expect(model?.parameters.find(parameter => parameter.name === 'seed')).toMatchObject({
      min: 0,
      max: 2147483647,
      step: 1,
    })

    expect(validateModelParams(model!, {
      references: 'https://example.com/a.png',
      prompt: '海边日落',
      seed: -1,
    }).errors).toContainEqual(expect.objectContaining({ code: 'OUT_OF_RANGE', field: 'seed' }))
    expect(validateModelParams(model!, {
      references: 'https://example.com/a.png',
      prompt: '海边日落',
      seed: 2147483648,
    }).errors).toContainEqual(expect.objectContaining({ code: 'OUT_OF_RANGE', field: 'seed' }))
    expect(validateModelParams(model!, {
      references: 'https://example.com/a.png',
      prompt: '海边日落',
      seed: 42,
    }).valid).toBe(true)
  })

  it('applies the wan2.7 reference-video duration cap of 10 when the conditional is met', () => {
    const model = getModelById('wanx-2.7-reference-video')
    expect(model).toBeDefined()
    const duration = model?.parameters.find(parameter => parameter.name === 'duration')
    expect(duration).toMatchObject({
      min: 2,
      max: 15,
      conditional: { max: 10, when: { field: 'referenceVideos', present: true } },
    })

    // 带参考素材时，条件 max:10 生效（>10 报错）
    expect(validateModelParams(model!, {
      prompt: '火车穿过城市',
      references: 'https://example.com/ref.png',
      duration: 12,
    }).errors).toContainEqual(expect.objectContaining({ code: 'OUT_OF_RANGE', field: 'duration' }))
    expect(validateModelParams(model!, {
      prompt: '火车穿过城市',
      references: 'https://example.com/ref.png',
      duration: 10,
    }).valid).toBe(true)
  })

  it('enforces required-one-of rules', () => {
    const requiredOneOf: ModelManifest = {
      ...manifest,
      id: 'music',
      category: 'audio',
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'text' },
        { name: 'lyrics', label: 'Lyrics', type: 'text' },
      ],
      request: {
        kind: 'dashscope-audio-task',
        endpoint: '/audio/music/generation',
        bindings: {
          prompt: { target: 'input.prompt' },
          lyrics: { target: 'input.field', field: 'lyrics' },
        },
      },
      rules: [{
        kind: 'required-one-of',
        fields: ['lyrics', 'prompt'],
        minimum: 1,
        code: 'REQUIRED_PARAMETER',
        message: { 'zh-CN': '歌词与提示词至少提供一项', 'en-US': 'Provide at least one of lyrics or prompt' },
      }],
    }

    expect(validateModelParams(requiredOneOf, {}).errors)
      .toContainEqual(expect.objectContaining({ code: 'REQUIRED_PARAMETER', field: 'lyrics' }))
    expect(validateModelParams(requiredOneOf, { prompt: '一首关于春天的歌' }).valid).toBe(true)
    expect(validateModelParams(requiredOneOf, { lyrics: '春天来了' }).valid).toBe(true)
  })

  it('enforces text-length rules and filters them by transport mode', () => {
    const textLength: ModelManifest = {
      ...manifest,
      id: 'lyrics',
      category: 'audio',
      parameters: [{ name: 'lyrics', label: 'Lyrics', type: 'text' }],
      request: {
        kind: 'dashscope-audio-task',
        endpoint: '/audio/music/generation',
        bindings: { lyrics: { target: 'input.field', field: 'lyrics' } },
      },
      rules: [{
        kind: 'text-length',
        field: 'lyrics',
        cjk: { min: 5, max: 350 },
        other: { min: 5, max: 2000 },
        modes: ['sync'],
        code: 'OUT_OF_RANGE',
        message: { 'zh-CN': '歌词需为 5~350 个中文字符或 5~2000 个非中文字符', 'en-US': 'Lyrics must be 5-350 Chinese characters or 5-2000 other characters' },
      }],
    }

    // 4 个字符 < cjk 下限 5 → 报错
    expect(validateModelParams(textLength, { lyrics: '一二三四' }).errors)
      .toContainEqual(expect.objectContaining({ code: 'OUT_OF_RANGE', field: 'lyrics' }))
    // 与 bailian-hub SDK 一致：文本含 CJK 字符时按 cjk 桶校验整串长度（5~350）。
    expect(validateModelParams(textLength, { lyrics: '一二三四五 abcde' }).valid).toBe(true)
    // 纯英文按 other 桶（5~2000），不应被 cjk 桶误伤。
    expect(validateModelParams(textLength, { lyrics: 'summer folk music' }).valid).toBe(true)

    // modes: ['sync'] 规则在 stream 形态下不生效
    const streaming: ModelManifest = { ...textLength, taskMode: 'stream' }
    expect(validateModelParams(streaming, { lyrics: '一' }).errors)
      .not.toContainEqual(expect.objectContaining({ code: 'OUT_OF_RANGE', field: 'lyrics' }))
  })

  it('enforces field-required-when rules', () => {
    const requiredWhen: ModelManifest = {
      ...manifest,
      id: 'ref-video',
      parameters: [
        { name: 'audio', label: 'Audio', type: 'boolean', defaultValue: false },
        { name: 'referenceVideo', label: 'Reference', type: 'media', mediaKind: 'video' },
      ],
      request: {
        kind: 'dashscope-video-task',
        endpoint: '/services/aigc/video-generation/video-synthesis',
        mediaMode: 'single',
        bindings: {
          audio: { target: 'parameters.field' },
          referenceVideo: { target: 'input.media', mediaType: 'reference_video' },
        },
      },
      rules: [{
        kind: 'field-required-when',
        field: 'referenceVideo',
        condition: { kind: 'field-equals', field: 'audio', equals: true },
        code: 'REQUIRED_PARAMETER',
        message: { 'zh-CN': '开启音频时需要提供参考视频', 'en-US': 'A reference video is required when audio is enabled' },
      }],
    }

    expect(validateModelParams(requiredWhen, { audio: true }).errors)
      .toContainEqual(expect.objectContaining({ code: 'REQUIRED_PARAMETER', field: 'referenceVideo' }))
    expect(validateModelParams(requiredWhen, { audio: true, referenceVideo: 'v1' }).valid).toBe(true)
    expect(validateModelParams(requiredWhen, { audio: false }).valid).toBe(true)
  })

  it('enforces field-allowed-when rules', () => {
    const allowedWhen: ModelManifest = {
      ...manifest,
      id: 'no-seed-with-audio',
      parameters: [
        { name: 'audio', label: 'Audio', type: 'boolean', defaultValue: false },
        { name: 'seed', label: 'Seed', type: 'number', min: 0, max: 2147483647, step: 1 },
      ],
      request: {
        kind: 'dashscope-video-task',
        endpoint: '/services/aigc/video-generation/video-synthesis',
        mediaMode: 'none',
        bindings: {
          audio: { target: 'parameters.field' },
          seed: { target: 'parameters.field' },
        },
      },
      rules: [{
        kind: 'field-allowed-when',
        field: 'seed',
        condition: { kind: 'field-equals', field: 'audio', equals: true },
        code: 'INVALID_VALUE',
        message: { 'zh-CN': '开启音频时不能指定种子', 'en-US': 'Seed is not allowed when audio is enabled' },
      }],
    }

    expect(validateModelParams(allowedWhen, { audio: true, seed: 42 }).errors)
      .toContainEqual(expect.objectContaining({ code: 'INVALID_VALUE', field: 'seed' }))
    expect(validateModelParams(allowedWhen, { audio: true }).valid).toBe(true)
    expect(validateModelParams(allowedWhen, { audio: false, seed: 42 }).valid).toBe(true)
  })

  it('enforces array-item-field-max-path rules', () => {
    const maxPath: ModelManifest = {
      ...manifest,
      id: 'weighted-items',
      parameters: [
        { name: 'items', label: 'Items', type: 'media', mediaKind: 'image' },
        { name: 'maxWeight', label: 'Max weight', type: 'number', min: 1 },
      ],
      request: {
        kind: 'dashscope-image-message',
        endpoint: '/images',
        bindings: {
          items: { target: 'input.media', mediaType: 'image' },
          maxWeight: { target: 'parameters.field' },
        },
      },
      rules: [{
        kind: 'array-item-field-max-path',
        field: 'items',
        itemProperty: 'weight',
        maximumField: 'maxWeight',
        defaultMaximum: 100,
        code: 'OUT_OF_RANGE',
        message: { 'zh-CN': '条目权重超出上限', 'en-US': 'Item weight exceeds the limit' },
      }],
    }

    // 对象条目带 weight 字段 → 触发 array-item-field-max-path 规则（同时因不是媒体字符串产生 INVALID_TYPE）
    expect(validateModelParams(maxPath, { items: [{ weight: 120 }], maxWeight: 100 }).errors)
      .toContainEqual(expect.objectContaining({ code: 'OUT_OF_RANGE', field: 'items' }))
    // 合法媒体字符串条目不触发该规则，参数校验也通过
    expect(validateModelParams(maxPath, { items: ['https://example.com/a.png'], maxWeight: 100 }).valid).toBe(true)
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

describe('validateModelParams with ParametersValidationInput projection', () => {
  it('accepts a minimal manifest projection (id/parameters/rules/taskMode), not a full manifest', () => {
    // web 表单持有的是 api-client catalog 投影（ModelCatalogItem），校验只需这四段。
    const projection = {
      id: 'test-image',
      parameters: manifest.parameters,
      taskMode: 'sync' as const,
      rules: [{
        kind: 'required-one-of' as const,
        fields: ['prompt', 'n'],
        minimum: 1,
        code: 'ONE_OF',
        message: { 'zh-CN': '至少提供 prompt 或 n', 'en-US': 'Provide at least one of prompt or n' },
      }],
    }

    const valid = validateModelParams(projection, { prompt: 'hello' })
    expect(valid.valid).toBe(true)
    expect(valid.params.n).toBe(1)

    const invalid = validateModelParams(projection, { size: '1024*1024' })
    expect(invalid.valid).toBe(false)
    expect(invalid.errors).toContainEqual(expect.objectContaining({ field: 'prompt', code: 'REQUIRED_PARAMETER' }))
  })
})
