import { describe, expect, it } from 'vitest'
import type { ModelManifest } from '@bailian-studio/model-core'
import { parseDashScopeOutput } from '../src/response-parser'

const baseManifest: ModelManifest = {
  id: 'test-image',
  provider: 'dashscope',
  providerModel: 'qwen-image',
  displayName: 'Test Image',
  category: 'image',
  taskMode: 'sync',
  capabilities: ['text_prompt'],
  parameters: [{ name: 'prompt', label: 'Prompt', type: 'text' }],
  request: {
    kind: 'dashscope-image-message',
    endpoint: '/images',
    bindings: { prompt: { target: 'input.prompt' } },
  },
  output: { kind: 'images-from-message-content' },
  pricing: {
    unit: 'per_image',
    quantityKey: 'n',
    currency: 'CNY',
    rates: [{ id: 'cn-beijing-output-image', region: 'cn-beijing', serviceScope: 'china-mainland', chargeItem: 'output', unit: 'image', unitSize: 1, unitPrice: '0.01', conditions: {} }],
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

describe('parseDashScopeOutput', () => {
  it('extracts image URLs from message content', () => {
    const output = parseDashScopeOutput(baseManifest, {
      output: {
        choices: [
          {
            message: {
              content: [
                { image: 'https://example.com/one.png' },
                { text: 'caption' },
                { image: 'https://example.com/two.png' },
              ],
            },
          },
        ],
      },
      usage: { image_count: 2 },
    })

    expect(output.artifacts).toEqual([
      { kind: 'image', sourceUrl: 'https://example.com/one.png' },
      { kind: 'image', sourceUrl: 'https://example.com/two.png' },
    ])
    expect(output.usage).toEqual({ image_count: 2 })
  })

  it('extracts a video URL by provider mapping path', () => {
    const output = parseDashScopeOutput(
      { ...baseManifest, category: 'video', output: { kind: 'video-url', path: 'output.video_url' } },
      { output: { video_url: 'https://example.com/movie.mp4' } },
    )

    expect(output.artifacts).toEqual([{ kind: 'video', sourceUrl: 'https://example.com/movie.mp4' }])
  })

  it('returns no video artifact when the mapped path is missing or non-string', () => {
    const manifest: ModelManifest = { ...baseManifest, category: 'video', output: { kind: 'video-url', path: 'output.video_url' } }
    expect(parseDashScopeOutput(manifest, { output: {} }).artifacts).toEqual([])
    expect(parseDashScopeOutput(manifest, { output: { video_url: 42 } }).artifacts).toEqual([])
  })

  it('extracts an audio URL by provider mapping path', () => {
    const output = parseDashScopeOutput(
      { ...baseManifest, category: 'audio', output: { kind: 'audio-url', path: 'output.audio.url' } },
      { output: { audio: { url: 'https://example.com/track.mp3' } } },
    )

    expect(output.artifacts).toEqual([{ kind: 'audio', sourceUrl: 'https://example.com/track.mp3' }])
  })

  it('extracts text content by provider mapping path', () => {
    const output = parseDashScopeOutput(
      { ...baseManifest, output: { kind: 'text', path: 'output.text' } },
      { output: { text: 'generated caption' } },
    )

    expect(output.artifacts).toEqual([{ kind: 'text', text: 'generated caption' }])
  })

  it('returns no usage key when the raw response has none', () => {
    const output = parseDashScopeOutput(baseManifest, {
      output: { choices: [{ message: { content: [{ image: 'https://example.com/one.png' }] } }] },
    })
    expect(output.artifacts).toHaveLength(1)
    expect(output.usage).toBeUndefined()
  })

  it('returns empty artifacts for an unknown output mapping kind', () => {
    const output = parseDashScopeOutput(
      {
        ...baseManifest,
        output: { kind: 'future-output-kind' } as unknown as ModelManifest['output'],
      },
      { output: { url: 'https://example.com/future.bin' } },
    )

    expect(output.artifacts).toEqual([])
  })
})
