import { describe, expect, it } from 'vitest'
import { getModelById, validateModelParams } from '@bailian-studio/model-core'
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
  pricing: { unit: 'per_second', quantityKey: 'duration', tiers: [{ condition: {}, priceCents: 100 }], currency: 'CNY' },
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

  // Video-edit shape: a required `video` media plus an optional `referenceImages`
  // media. DashScope is order-sensitive (the `video` element must come first), so
  // the manifest declares `video` before `referenceImages` and the builder must
  // preserve that declaration order in `input.media`.
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
    pricing: { unit: 'per_second', quantityKey: 'duration', tiers: [{ condition: {}, priceCents: 60 }], currency: 'CNY' },
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

  // dashscope-image-message (multimodal-generation endpoint) must speak
  // input.messages[{role, content}], not flat input.prompt — both for text-only
  // text-to-image and for image+text edit.
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
    pricing: { unit: 'per_image', quantityKey: 'n', tiers: [{ condition: {}, priceCents: 25 }], currency: 'CNY' },
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
    // Locks down the two bugs that broke music generation:
    //   1. endpoint must be relative (the /api/v1 prefix now lives on baseUrl)
    //   2. music options belong inside `input` (not `parameters`) and use the
    //      provider's snake_case field names.
    const manifest = getModelById('fun-music-v1')!

    it('places prompt, gender, format, and watermark inside input with correct keys', () => {
      const request = buildDashScopeRequest(manifest, {
        prompt: '夏日清新民谣',
        isInstrumental: false,
        gender: 'female',
        format: 'mp3',
        enableAigcWatermark: true,
        duration: 60,   // ui-only — must NOT reach the provider
      })

      expect(request.endpoint).toBe('/services/audio/music/generation')
      expect(request.async).toBe(false)        // sync taskMode
      expect(request.body.input).toEqual({
        prompt: '夏日清新民谣',
        is_instrumental: false,
        gender: 'female',
        format: 'mp3',
        enable_aigc_watermark: true,
      })
      // No parameters object at all when everything lives in input.
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
