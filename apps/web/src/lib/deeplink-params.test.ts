import { describe, expect, it } from 'vitest'
import type { ModelCatalogItem } from '@bailian-studio/api-client'
import { decodeDeepLinkParams, encodeDeepLinkParams } from './deeplink-params'

const manifest: ModelCatalogItem = {
  id: 'test-image',
  provider: 'dashscope',
  providerModel: 'test-image',
  displayName: 'Test Image',
  category: 'image',
  description: 'test',
  capabilities: ['text_prompt', 'image_input'],
  referenceFormat: 'angle-bracket',
  parameters: [
    { name: 'prompt', label: '提示词', type: 'text', required: true },
    { name: 'size', label: '分辨率', type: 'select', defaultValue: '1024*1024', options: [{ label: '1:1', value: '1024*1024' }] },
    { name: 'n', label: '数量', type: 'number', defaultValue: 1, min: 1, max: 4 },
    { name: 'image', label: '输入图像', type: 'media', mediaKind: 'image', required: false },
  ],
  taskMode: 'sync',
  pricing: { unit: 'per_image', currency: 'CNY', tiers: [] },
  availability: { enabled: true, stage: 'stable' },
  request: { kind: 'dashscope-image-message', endpoint: '', bindings: {} },
} as unknown as ModelCatalogItem

describe('encodeDeepLinkParams / decodeDeepLinkParams', () => {
  it('round-trips text params and drops media values on decode', () => {
    const token = encodeDeepLinkParams({ prompt: '一只猫', size: '1024*1024', n: 2, image: 'asset_generation_1' })
    const decoded = decodeDeepLinkParams(manifest, token)
    expect(decoded).toEqual({ prompt: '一只猫', size: '1024*1024', n: 2 })
  })

  it('drops unknown fields and non-media invalid values', () => {
    const token = encodeDeepLinkParams({ prompt: 'x', malicious: 'drop-me', n: 'not-a-number' })
    const decoded = decodeDeepLinkParams(manifest, token)
    expect(decoded).toEqual({ prompt: 'x' })
  })

  it('returns empty object for null/empty/broken tokens', () => {
    expect(decodeDeepLinkParams(manifest, null)).toEqual({})
    expect(decodeDeepLinkParams(manifest, '')).toEqual({})
    expect(decodeDeepLinkParams(manifest, '%%%not-base64%%%')).toEqual({})
    expect(decodeDeepLinkParams(manifest, 'W10=')).toEqual({}) // '[]' 非对象
  })

  it('round-trips unicode prompts safely', () => {
    const prompt = '赛博朋克城市夜景，霓虹灯，电影感'
    const token = encodeDeepLinkParams({ prompt })
    expect(decodeDeepLinkParams(manifest, token).prompt).toBe(prompt)
  })
})
