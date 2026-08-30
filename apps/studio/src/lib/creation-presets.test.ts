import { beforeEach, describe, expect, it } from 'vitest'
import type { ModelParameter } from '@bailian-studio/api-client'
import {
  buildParamsFromRecord,
  loadCreationPresets,
  loadRecentModelIds,
  rememberRecentModelId,
  saveCreationPreset,
} from './creation-presets'

const parameters: ModelParameter[] = [
  { name: 'mode', label: '模式', type: 'select', options: [{ label: '基础', value: 'basic' }, { label: '高级', value: 'advanced' }] },
  { name: 'prompt', label: '提示词', type: 'text', required: true },
  { name: 'advancedPrompt', label: '高级提示词', type: 'text', visibleWhen: { field: 'mode', equals: 'advanced' }, defaultValue: '默认高级提示词' },
]

describe('creation presets', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('overwrites same names and keeps at most twelve newest presets', () => {
    for (let index = 0; index < 13; index += 1) {
      saveCreationPreset({
        id: `preset-${index}`,
        name: `预设 ${index}`,
        modelId: 'qwen-image',
        params: { prompt: String(index) },
        createdAt: `2026-08-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      })
    }
    saveCreationPreset({
      id: 'preset-replaced',
      name: '预设 12',
      modelId: 'qwen-image',
      params: { prompt: 'replaced' },
      createdAt: '2026-08-31T00:00:00.000Z',
    })

    const presets = loadCreationPresets()
    expect(presets).toHaveLength(12)
    expect(presets[0]).toMatchObject({ id: 'preset-replaced', params: { prompt: 'replaced' } })
    expect(presets.some(preset => preset.id === 'preset-0')).toBe(false)
  })

  it('restores defaults and removes values for hidden parameters', () => {
    expect(buildParamsFromRecord(
      { mode: 'basic', prompt: 'hello', advancedPrompt: 'should be removed', transient: 1, _refs: ['asset-1'] },
      parameters,
    )).toEqual({ mode: 'basic', prompt: 'hello', _refs: ['asset-1'] })
    expect(buildParamsFromRecord({ mode: 'advanced', prompt: 'hello' }, parameters)).toEqual({
      mode: 'advanced',
      prompt: 'hello',
      advancedPrompt: '默认高级提示词',
    })
  })

  it('deduplicates recent models and caps the list at eight', () => {
    for (let index = 0; index < 9; index += 1) rememberRecentModelId(`model-${index}`)
    rememberRecentModelId('model-4')

    expect(loadRecentModelIds()).toHaveLength(8)
    expect(loadRecentModelIds()[0]).toBe('model-4')
    expect(new Set(loadRecentModelIds()).size).toBe(8)
  })
})
