import { describe, expect, it } from 'vitest'
import type { ModelCatalogItem } from '@bailian-studio/api-client'
import { availableSubModes, modelsInMode, subModeOf } from './model-modes'

function model(overrides: { id: string; category?: ModelCatalogItem['category']; capabilities?: string[] }): ModelCatalogItem {
  return {
    id: overrides.id,
    provider: 'dashscope',
    providerModel: overrides.id,
    displayName: overrides.id,
    category: overrides.category ?? 'video',
    operation: 'image.text-to-image',
    taskMode: 'provider_async',
    capabilities: overrides.capabilities ?? [],
    parameters: [],
  }
}

describe('subModeOf', () => {
  it('video: video_input → 视频编辑', () => {
    expect(subModeOf(model({ id: 'edit', capabilities: ['text_prompt', 'video_input', 'image_input'] }))).toBe('vedit')
  })

  it('video: multi_reference → 参考生视频', () => {
    expect(subModeOf(model({ id: 'ref', capabilities: ['text_prompt', 'image_input', 'multi_reference'] }))).toBe('r2v')
  })

  it('video: image_input → 图生视频', () => {
    expect(subModeOf(model({ id: 'i2v', capabilities: ['text_prompt', 'image_input'] }))).toBe('i2v')
  })

  it('video: 仅文本 → 文生视频', () => {
    expect(subModeOf(model({ id: 't2v', capabilities: ['text_prompt'] }))).toBe('t2v')
  })

  it('image: image_input → 图生图', () => {
    expect(subModeOf(model({ id: 'i2i', category: 'image', capabilities: ['text_prompt', 'image_input'] }))).toBe('i2i')
  })

  it('image: 仅文本 → 文生图', () => {
    expect(subModeOf(model({ id: 't2i', category: 'image', capabilities: ['text_prompt'] }))).toBe('t2i')
  })

  it('audio: audio_input → 语音识别', () => {
    expect(subModeOf(model({ id: 'asr', category: 'audio', capabilities: ['audio_input'] }))).toBe('asr')
  })

  it('audio: 文本 → 音乐生成', () => {
    expect(subModeOf(model({ id: 'music', category: 'audio', capabilities: ['text_prompt'] }))).toBe('music')
  })
})

describe('availableSubModes / modelsInMode', () => {
  it('只列出存在模型的子模式，并按固定顺序', () => {
    const models = [
      model({ id: 't2v', capabilities: ['text_prompt'] }),
      model({ id: 'edit', capabilities: ['video_input'] }),
    ]
    expect(availableSubModes(models, 'video')).toEqual(['t2v', 'vedit'])
    expect(modelsInMode(models, 'video', 't2v').map(item => item.id)).toEqual(['t2v'])
  })
})
