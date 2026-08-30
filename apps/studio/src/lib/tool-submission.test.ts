import { describe, expect, it } from 'vitest'
import type { ModelCatalogItem } from '@bailian-studio/api-client'
import {
  buildToolGenerationPayload,
  selectToolModel,
  toolMediaParamName,
  toolModelKind,
} from './tool-submission'

function model(overrides: {
  id: string
  category?: ModelCatalogItem['category']
  capabilities?: string[]
  enabled?: boolean
}): ModelCatalogItem {
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
    ...(overrides.enabled === false ? { availability: { enabled: false, stage: 'beta' as const, notActivated: '暂未开通' } } : {}),
  }
}

const screenplayModel = () => model({ id: 'qwen-omni-screenplay', capabilities: ['screenplay', 'video_input', 'streaming'] })
const asrModel = () => model({ id: 'fun-asr-v1', category: 'audio', capabilities: ['audio_input'] })

describe('tool submission assetRefs mapping (P1-37 capability dispatch)', () => {
  it('maps screenplay models (by capability) to the videoUrl media param declared by their manifests', () => {
    const m = screenplayModel()
    expect(toolModelKind(m)).toBe('screenplay')
    expect(buildToolGenerationPayload(m, 'asset_video_1')).toEqual({
      modelId: 'qwen-omni-screenplay',
      params: {},
      assetRefs: { videoUrl: ['asset_video_1'] },
    })
  })

  // P0-01 回归：fun-asr 的媒体参数名是 fileUrls（manifest 声明），曾错写成 audioUrl。
  it('maps ASR models (by audio_input capability) to the fileUrls media param (not the legacy audioUrl)', () => {
    const m = asrModel()
    expect(toolModelKind(m)).toBe('asr')
    expect(toolMediaParamName(m)).toBe('fileUrls')
    expect(buildToolGenerationPayload(m, 'asset_audio_1')).toEqual({
      modelId: 'fun-asr-v1',
      params: {},
      assetRefs: { fileUrls: ['asset_audio_1'] },
    })
  })

  it('selectToolModel picks the first enabled model of a tool kind, skipping disabled ones', () => {
    const disabled = model({ id: 'qwen-omni-screenplay-flash', capabilities: ['screenplay'], enabled: false })
    const enabled = screenplayModel()
    const list = [disabled, enabled]
    expect(selectToolModel(list, 'screenplay')?.id).toBe('qwen-omni-screenplay')
    expect(selectToolModel([disabled], 'screenplay')).toBeUndefined()
  })

  it('rejects non-tool models so new tools must declare a capability', () => {
    const imageModel = model({ id: 'qwen-image', category: 'image', capabilities: ['text_prompt', 'image_input'] })
    expect(toolModelKind(imageModel)).toBeUndefined()
    expect(() => toolMediaParamName(imageModel)).toThrow(/Unsupported tool model/)
  })
})
