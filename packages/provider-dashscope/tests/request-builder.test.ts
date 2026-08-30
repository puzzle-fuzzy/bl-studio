import { describe, expect, it } from 'vitest'
import { getModelById } from '@bailian-studio/dashscope-manifests'
import { validateModelParams } from '@bailian-studio/model-core'
import type { ModelManifest } from '@bailian-studio/model-core'
import { buildDashScopeRequest } from '../src/request-builder'

const asyncVideoManifest: ModelManifest = {
  id: 'test-video',
  provider: 'dashscope',
  providerModel: 'wanx2.1-video',
  displayName: 'Test Video',
  category: 'video',
  taskMode: 'provider_async',
  capabilities: ['text_prompt', 'image_input'],
  parameters: [
    { name: 'prompt', label: 'Prompt', type: 'text', required: true },
    { name: 'referenceImages', label: 'References', type: 'media' },
    { name: 'duration', label: 'Duration', type: 'number' },
    { name: 'quality', label: 'Quality', type: 'select' },
    { name: 'internalOnly', label: 'Internal', type: 'text' },
  ],
  request: {
    kind: 'dashscope-video-task',
    endpoint: '/api/v1/services/aigc/video-generation/video-synthesis',
    mediaMode: 'multi',
    bindings: {
      prompt: { target: 'input.prompt' },
      referenceImages: { target: 'input.media', mediaType: 'image' },
      duration: { target: 'parameters.field', field: 'duration_seconds' },
      quality: { target: 'parameters.field' },
      internalOnly: { target: 'ui.only' },
    },
  },
  output: { kind: 'video-url', path: 'output.video_url' },
  pricing: {
    unit: 'per_second',
    quantityKey: 'duration',
    currency: 'CNY',
    rates: [{ id: 'cn-beijing-output-second', region: 'cn-beijing', serviceScope: 'china-mainland', chargeItem: 'output', unit: 'second', unitSize: 1, unitPrice: '1', conditions: {} }],
  },
  transport: {
    mode: 'provider_async',
    submit: {
      method: 'POST',
      endpointTemplate: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis/{WorkspaceId}',
      modelFieldPath: '/model',
      headers: [],
    },
    polling: {
      method: 'GET',
      endpointTemplate: 'https://dashscope.aliyuncs.com/api/v1/tasks/{WorkspaceId}/{taskId}',
      taskIdPath: 'output.task_id',
      statusPath: 'output.task_status',
      succeededValues: ['SUCCEEDED'],
      failedValues: ['FAILED', 'UNKNOWN'],
      headers: [],
    },
  },
  availability: { enabled: true, stage: 'beta' },
}

describe('buildDashScopeRequest', () => {
  it('maps prompt, media, and parameter fields for an async video manifest', () => {
    const request = buildDashScopeRequest(asyncVideoManifest, {
      prompt: 'A quiet city at sunrise',
      referenceImages: ['https://example.com/a.png', 'https://example.com/b.png'],
      duration: 5,
      quality: 'hd',
      internalOnly: 'hidden',
      ignored: undefined,
    })

    expect(request).toEqual({
      endpoint: '/api/v1/services/aigc/video-generation/video-synthesis',
      async: true,
      body: {
        model: 'wanx2.1-video',
        input: {
          prompt: 'A quiet city at sunrise',
          media: [
            { type: 'image', url: 'https://example.com/a.png' },
            { type: 'image', url: 'https://example.com/b.png' },
          ],
        },
        parameters: {
          duration_seconds: 5,
          quality: 'hd',
        },
      },
    })
  })

  // video-edit 形状：一个必填的 `video` 媒体加一个可选的 `referenceImages` 媒体。
  // DashScope 对顺序敏感（`video` 元素必须在前），因此 manifest 把 `video` 声明在
  // `referenceImages` 之前，builder 必须保持该声明顺序写入 `input.media`。
  const videoEditManifest: ModelManifest = {
    id: 'test-video-edit',
    provider: 'dashscope',
    providerModel: 'wan2.7-videoedit',
    displayName: 'Test Video Edit',
    category: 'video',
    taskMode: 'provider_async',
    capabilities: ['text_prompt', 'video_input', 'image_input'],
    parameters: [
      { name: 'video', label: 'Video', type: 'media', required: true },
      { name: 'referenceImages', label: 'References', type: 'media' },
      { name: 'prompt', label: 'Prompt', type: 'text' },
      { name: 'duration', label: 'Duration', type: 'number' },
    ],
    request: {
      kind: 'dashscope-video-task',
      endpoint: '/api/v1/services/aigc/video-generation/video-synthesis',
      mediaMode: 'multi',
      bindings: {
        video: { target: 'input.media', mediaType: 'video' },
        referenceImages: { target: 'input.media', mediaType: 'reference_image' },
        prompt: { target: 'input.prompt' },
        duration: { target: 'ui.only' },
      },
    },
    output: { kind: 'video-url', path: 'output.video_url' },
    pricing: {
      unit: 'per_second',
      quantityKey: 'duration',
      currency: 'CNY',
      rates: [{ id: 'cn-beijing-output-second', region: 'cn-beijing', serviceScope: 'china-mainland', chargeItem: 'output', unit: 'second', unitSize: 1, unitPrice: '0.6', conditions: {} }],
    },
    transport: {
      mode: 'provider_async',
      submit: {
        method: 'POST',
        endpointTemplate: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis/{WorkspaceId}',
        modelFieldPath: '/model',
        headers: [],
      },
      polling: {
        method: 'GET',
        endpointTemplate: 'https://dashscope.aliyuncs.com/api/v1/tasks/{WorkspaceId}/{taskId}',
        taskIdPath: 'output.task_id',
        statusPath: 'output.task_status',
        succeededValues: ['SUCCEEDED'],
        failedValues: ['FAILED', 'UNKNOWN'],
        headers: [],
      },
    },
    availability: { enabled: true, stage: 'beta' },
  }

  it('preserves media declaration order so the video element precedes reference images', () => {
    const request = buildDashScopeRequest(videoEditManifest, {
      video: 'https://example.com/clip.mp4',
      referenceImages: ['https://example.com/ref1.png', 'https://example.com/ref2.png'],
      prompt: 'change the outfit',
      duration: 5,
    })

    expect(request.body.input.media).toEqual([
      { type: 'video', url: 'https://example.com/clip.mp4' },
      { type: 'reference_image', url: 'https://example.com/ref1.png' },
      { type: 'reference_image', url: 'https://example.com/ref2.png' },
    ])
  })

  it('omits an optional media binding when its value is absent', () => {
    const request = buildDashScopeRequest(videoEditManifest, {
      video: 'https://example.com/clip.mp4',
      prompt: 'style change only',
    })

    expect(request.body.input.media).toEqual([
      { type: 'video', url: 'https://example.com/clip.mp4' },
    ])
  })

  it('wraps a single string media value in one element with the declared mediaType', () => {
    const firstFrameManifest: ModelManifest = {
      ...asyncVideoManifest,
      id: 'test-first-frame',
      request: {
        kind: 'dashscope-video-task',
        endpoint: '/api/v1/services/aigc/video-generation/video-synthesis',
        mediaMode: 'single',
        bindings: { image: { target: 'input.media', mediaType: 'first_frame' } },
      },
    }

    const request = buildDashScopeRequest(firstFrameManifest, { image: 'https://example.com/first.png' })

    expect(request.body.input.media).toEqual([
      { type: 'first_frame', url: 'https://example.com/first.png' },
    ])
  })

  // dashscope-image-message（multimodal-generation 端点）必须使用
  // input.messages[{role, content}] 结构，而非扁平的 input.prompt——无论纯文本
  // 文生图还是 图+文 编辑都是如此。
  const imageMessageManifest: ModelManifest = {
    id: 'test-image-message',
    provider: 'dashscope',
    providerModel: 'qwen-image-edit-max',
    displayName: 'Test Image Message',
    category: 'image',
    taskMode: 'sync',
    capabilities: ['text_prompt', 'image_input'],
    parameters: [
      { name: 'prompt', label: 'Prompt', type: 'text', required: true },
      { name: 'image', label: 'Image', type: 'media' },
      { name: 'size', label: 'Size', type: 'select' },
    ],
    request: {
      kind: 'dashscope-image-message',
      endpoint: '/api/v1/services/aigc/multimodal-generation/generation',
      bindings: {
        prompt: { target: 'input.prompt' },
        image: { target: 'input.media', mediaType: 'image' },
        size: { target: 'parameters.field' },
      },
    },
    output: { kind: 'images-from-message-content' },
    pricing: {
      unit: 'per_image',
      quantityKey: 'n',
      currency: 'CNY',
      rates: [{ id: 'cn-beijing-output-image', region: 'cn-beijing', serviceScope: 'china-mainland', chargeItem: 'output', unit: 'image', unitSize: 1, unitPrice: '0.25', conditions: {} }],
    },
    transport: {
      mode: 'sync',
      submit: {
        method: 'POST',
        endpointTemplate: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation/{WorkspaceId}',
        modelFieldPath: '/model',
        headers: [],
      },
    },
    availability: { enabled: true, stage: 'stable' },
  }

  it('wraps a text-only prompt into input.messages for text-to-image', () => {
    const request = buildDashScopeRequest(imageMessageManifest, { prompt: 'a red panda', size: '1024*1024' })

    expect(request.body.input).toEqual({
      messages: [{ role: 'user', content: [{ text: 'a red panda' }] }],
    })
    expect(request.body.parameters).toEqual({ size: '1024*1024' })
  })

  it('builds an image+text edit message with images preceding text', () => {
    const request = buildDashScopeRequest(imageMessageManifest, {
      image: 'https://example.com/in.png',
      prompt: 'add a red scarf',
    })

    expect(request.body.input.messages).toEqual([
      {
        role: 'user',
        content: [
          { image: 'https://example.com/in.png' },
          { text: 'add a red scarf' },
        ],
      },
    ])
  })

  it('builds native DeepSeek V4 messages and removes reasoning controls when thinking is disabled', () => {
    const manifest = getModelById('deepseek-v4-pro')
    expect(manifest).toBeDefined()

    const thinking = validateModelParams(manifest!, { prompt: '解释量子纠缠' })
    expect(thinking.valid).toBe(true)
    expect(buildDashScopeRequest(manifest!, thinking.params).body).toEqual({
      model: 'deepseek-v4-pro',
      input: {
        messages: [{ role: 'user', content: '解释量子纠缠' }],
      },
      parameters: {
        max_completion_tokens: 4096,
        enable_thinking: true,
        reasoning_effort: 'high',
        temperature: 1,
        top_p: 0.95,
        seed: 1234,
        result_format: 'message',
      },
    })

    const direct = validateModelParams(manifest!, {
      prompt: '直接回答',
      enableThinking: false,
      reasoningEffort: 'max',
    })
    expect(direct.valid).toBe(true)
    expect(direct.params.reasoningEffort).toBeUndefined()
    expect(buildDashScopeRequest(manifest!, direct.params).body.parameters)
      .not.toHaveProperty('reasoning_effort')
  })

  describe('fun-music manifest (regression: 404 + wrong param placement)', () => {
    // 锁定曾导致音乐生成失败的两个 bug：
    //   1. endpoint 必须为相对路径（/api/v1 前缀现在位于 baseUrl）
    //   2. 音乐参数属于 `input`（而非 `parameters`），并使用 provider 的 snake_case 字段名。
    const manifest = getModelById('fun-music-v1')!

    it('places prompt, gender, format, and watermark inside input with correct keys', () => {
      const request = buildDashScopeRequest(manifest, {
        prompt: '夏日清新民谣',
        isInstrumental: false,
        gender: 'female',
        format: 'mp3',
        enableAigcWatermark: true,
        duration: 60,   // ui-only — 绝不能到达 provider
      })

      expect(request.endpoint).toBe('/services/audio/music/generation')
      expect(request.async).toBe(false)        // 同步 taskMode
      expect(request.body.input).toEqual({
        prompt: '夏日清新民谣',
        is_instrumental: false,
        gender: 'female',
        format: 'mp3',
        enable_aigc_watermark: true,
      })
      // 所有参数都在 input 里时，不生成 parameters 对象。
      expect(request.body.parameters).toBeUndefined()
    })

    it('preserves lyrics and prompt as distinct official input fields', () => {
      const request = buildDashScopeRequest(manifest, {
        prompt: 'a sunny folk song',
        lyrics: '[verse]\n清晨的阳光',
      })
      expect(request.body.input).toMatchObject({
        prompt: 'a sunny folk song',
        lyrics: '[verse]\n清晨的阳光',
      })
    })
  })

  it('sends Fun-ASR speaker_count only from the manifest binding', () => {
    const manifest = getModelById('fun-asr-v1')!
    const request = buildDashScopeRequest(manifest, {
      fileUrls: ['https://example.com/audio.wav'],
      diarizationEnabled: true,
      speakerCount: 3,
      channelId: [0],
      language: 'zh',
    })

    expect(request.body.parameters).toMatchObject({
      diarization_enabled: true,
      speaker_count: 3,
      channel_id: [0],
      language_hints: ['zh'],
    })
  })

  it('sends an explicit false watermark for every default HappyHorse request', () => {
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
      const manifest = getModelById(modelId)
      expect(manifest).toBeDefined()

      const validation = validateModelParams(manifest!, { ...input })
      expect(validation.valid).toBe(true)

      const request = buildDashScopeRequest(manifest!, validation.params)
      expect(request.body.parameters?.watermark).toBe(false)
    }
  })
})
