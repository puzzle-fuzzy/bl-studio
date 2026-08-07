import { describe, expect, it } from 'vitest'
import type { ModelCatalogItem } from '@bailian-studio/api-client'
import {
  ASSET_GENERATION_PREFIX,
  generationMirrorAssetId,
  pickImageEditModel,
  supportsUpscaleSize,
} from './edit-model'

function model(overrides: Partial<ModelCatalogItem> & Pick<ModelCatalogItem, 'id'>): ModelCatalogItem {
  return {
    id: overrides.id,
    provider: 'dashscope',
    providerModel: overrides.id,
    displayName: overrides.id,
    category: overrides.category ?? 'image',
    operation: 'image.image-to-image',
    taskMode: 'sync',
    capabilities: overrides.capabilities ?? [],
    parameters: overrides.parameters ?? [],
    ...overrides,
  }
}

const withSizeParam: ModelCatalogItem['parameters'] = [
  {
    name: 'size',
    label: '输出分辨率',
    type: 'select',
    options: [{ label: '1:1', value: '1024*1024' }, { label: '2048×2048', value: '2048*2048' }],
  },
]

describe('generationMirrorAssetId', () => {
  it('builds the mirrored user_asset id with the agreed prefix', () => {
    expect(generationMirrorAssetId('artifact-1')).toBe(`${ASSET_GENERATION_PREFIX}artifact-1`)
  })
})

describe('pickImageEditModel', () => {
  it('prefers an image_input model that supports size scaling', () => {
    const plain = model({ id: 'wanx-image', capabilities: ['text_prompt', 'image_input', 'seed'] })
    const withSize = model({
      id: 'qwen-image-edit',
      capabilities: ['text_prompt', 'image_input'],
      parameters: withSizeParam,
    })
    expect(pickImageEditModel([plain, withSize])?.id).toBe('qwen-image-edit')
  })

  it('falls back to any enabled image_input model when none supports size', () => {
    const plain = model({ id: 'wanx-image', capabilities: ['text_prompt', 'image_input', 'seed'] })
    expect(pickImageEditModel([plain])?.id).toBe('wanx-image')
  })

  it('excludes non-image / non-image_input models', () => {
    const video = model({ id: 'qwen-omni-video', category: 'video', capabilities: ['image_input'] })
    const t2i = model({ id: 'qwen-image', capabilities: ['text_prompt'] })
    expect(pickImageEditModel([video, t2i])).toBeUndefined()
  })
})

describe('supportsUpscaleSize', () => {
  it('is true when the size select offers 2048*2048', () => {
    const m = model({ id: 'qwen-image-edit', capabilities: ['image_input'], parameters: withSizeParam })
    expect(supportsUpscaleSize(m)).toBe(true)
  })

  it('is false without a size select or without the 2048 option', () => {
    const noSize = model({ id: 'wanx-image', capabilities: ['image_input'] })
    expect(supportsUpscaleSize(noSize)).toBe(false)
    const limited = model({
      id: 'qwen-image-edit-plus',
      capabilities: ['image_input'],
      parameters: [{ name: 'size', label: '分辨率', type: 'select', options: [{ label: '1:1', value: '1024*1024' }] }],
    })
    expect(supportsUpscaleSize(limited)).toBe(false)
    expect(supportsUpscaleSize(undefined)).toBe(false)
  })
})
