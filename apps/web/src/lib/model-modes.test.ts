import { describe, expect, it } from 'vitest'
import type { ModelCatalogItem } from '@bailian-studio/api-client'
import {
  SUB_MODE_ORDER,
  availableSubModes,
  firstEnabledInCategory,
  firstEnabledModel,
  isModelEnabled,
  modelNameZh,
  modelsInCategory,
  modelsInMode,
  subModeOf,
  type ModelCategory,
} from './model-modes'

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

// 回归不变量（对应 ModelSelector 修复）：subMode 由 selectedId 派生（单一事实源）。
// 若 subModeOf 返回的子模式不在 SUB_MODE_ORDER[category] 中，中间下拉的受控 value 会脱离
// 选项列表，Radix Select 回调 onValueChange('') 清空选中模型 → 自动选中抢回第一个（选中即弹回）。
describe('subModeOf 派生对级联下拉的回归不变量', () => {
  it.each([
    ['video', ['video_input'], 'vedit'],
    ['video', ['multi_reference'], 'r2v'],
    ['video', ['image_input'], 'i2v'],
    ['video', ['text_prompt'], 't2v'],
    // P1-35：剧本类（视频理解）模型按 screenplay capability 归到 understand，
    // 不再混进 vedit；即使同时带 video_input（screenplay 优先判定）。
    ['video', ['screenplay'], 'understand'],
    ['video', ['screenplay', 'video_input', 'streaming'], 'understand'],
    ['image', ['image_input'], 'i2i'],
    ['image', ['text_prompt'], 't2i'],
    ['audio', ['audio_input'], 'asr'],
    ['audio', ['text_prompt'], 'music'],
  ] as const)('%s %j → %s，且必属 SUB_MODE_ORDER[分类]', (category, capabilities, expected) => {
    const item = model({ id: 'm', category, capabilities: [...capabilities] })
    const mode = subModeOf(item)
    expect(mode).toBe(expected)
    expect(SUB_MODE_ORDER[category]).toContain(mode)
  })

  it('每个模型都能在其分类下经自身子模式命中（modelsInMode 自包含不变量）', () => {
    const models = [
      model({ id: 'edit', capabilities: ['video_input'] }),
      model({ id: 'ref', capabilities: ['multi_reference'] }),
      model({ id: 'i2v', capabilities: ['image_input'] }),
      model({ id: 't2v', capabilities: ['text_prompt'] }),
      model({ id: 'i2i', category: 'image', capabilities: ['image_input'] }),
      model({ id: 't2i', category: 'image', capabilities: ['text_prompt'] }),
      model({ id: 'asr', category: 'audio', capabilities: ['audio_input'] }),
      model({ id: 'music', category: 'audio', capabilities: ['text_prompt'] }),
    ]
    for (const item of models) {
      // 契约里 category 还含 'text'（本 fixture 不含），此处收窄到三分类。
      const category = item.category as ModelCategory
      expect(modelsInMode(models, category, subModeOf(item))).toContainEqual(item)
    }
  })

  it('SUB_MODE_ORDER 覆盖全部 ModelCategory，且子模式列表非空', () => {
    for (const category of Object.keys(SUB_MODE_ORDER) as ModelCategory[]) {
      expect(SUB_MODE_ORDER[category].length).toBeGreaterThan(0)
    }
  })
})

describe('isModelEnabled / firstEnabledModel / firstEnabledInCategory', () => {
  const disabledVideo = model({
    id: 'vidu',
    capabilities: ['multi_reference', 'image_input'],
    // 暂未开通
  })
  disabledVideo.availability = { enabled: false, stage: 'beta', notActivated: '暂未开通' }
  const t2v = model({ id: 't2v', capabilities: ['text_prompt'] })
  const i2v = model({ id: 'i2v', capabilities: ['image_input'] })

  it('isModelEnabled：availability 缺省视为启用，enabled:false 为暂未开通', () => {
    expect(isModelEnabled(model({ id: 'legacy' }))).toBe(true)
    expect(isModelEnabled(disabledVideo)).toBe(false)
    expect(isModelEnabled(t2v)).toBe(true)
  })

  it('firstEnabledModel：跳过全部暂未开通的模型', () => {
    const list = [disabledVideo, t2v]
    expect(firstEnabledModel(list, 'video', 'r2v')).toBe(undefined)
    expect(firstEnabledModel(list, 'video', 't2v')?.id).toBe('t2v')
  })

  it('firstEnabledInCategory：preferMode 无已启用模型时回绕到其它子模式', () => {
    const list = [disabledVideo, t2v, i2v]
    // r2v 全置灰 → 按 SUB_MODE_ORDER.video（r2v, i2v, t2v, vedit）回绕，先命中 i2v
    expect(firstEnabledInCategory(list, 'video', 'r2v')?.id).toBe('i2v')
    expect(firstEnabledInCategory(list, 'video', 'i2v')?.id).toBe('i2v')
  })

  it('firstEnabledInCategory：整分类全置灰返回 undefined（级联无选中项，仅置灰展示）', () => {
    const vidu = model({ id: 'vidu2', capabilities: ['multi_reference'] })
    vidu.availability = { enabled: false, stage: 'beta', notActivated: '暂未开通' }
    expect(firstEnabledInCategory([vidu], 'video')).toBe(undefined)
  })
})

describe('modelsInCategory', () => {
  it('按分类过滤模型', () => {
    const models = [
      model({ id: 't2v', capabilities: ['text_prompt'] }),
      model({ id: 't2i', category: 'image', capabilities: ['text_prompt'] }),
      model({ id: 'music', category: 'audio', capabilities: ['text_prompt'] }),
    ]
    expect(modelsInCategory(models, 'video').map(item => item.id)).toEqual(['t2v'])
    expect(modelsInCategory(models, 'image').map(item => item.id)).toEqual(['t2i'])
    expect(modelsInCategory(models, 'audio').map(item => item.id)).toEqual(['music'])
  })
})

describe('modelNameZh', () => {
  it('取 description 首个「，/,」前的片段', () => {
    const item = model({ id: 'm' })
    item.description = '快乐马参考生视频，多参考图保持角色一致'
    expect(modelNameZh(item)).toBe('快乐马参考生视频')
  })

  it('半角逗号同样截断', () => {
    const item = model({ id: 'm' })
    item.description = '风格迁移,支持多图融合'
    expect(modelNameZh(item)).toBe('风格迁移')
  })

  it('无 description 时退回 displayName', () => {
    const item = model({ id: 'm', capabilities: ['text_prompt'] })
    expect(modelNameZh(item)).toBe('m')
  })
})
