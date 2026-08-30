import { describe, expect, it } from 'vitest'
import type { ModelCatalogItem } from '@bailian-studio/api-client'
import { validateModelParams } from '@bailian-studio/model-core'
import { buildSubmitPayload, buildValidationParams } from './generation-submit'

/** 参考生视频模型的最小 manifest（referenceFormat: image-bracket）。 */
const referenceModel: ModelCatalogItem = {
  id: 'vidu-reference-video',
  provider: 'dashscope',
  providerModel: 'vidu/viduq3-mix_reference2video',
  displayName: 'Vidu Reference to Video',
  category: 'video',
  taskMode: 'provider_async',
  capabilities: ['text_prompt', 'image_input', 'multi_reference'],
  referenceFormat: 'image-bracket',
  parameters: [
    { name: 'references', label: '参考图像', type: 'media', mediaKind: 'image', required: true, minItems: 1, maxItems: 7 },
    { name: 'prompt', label: '提示词', type: 'text', required: true },
    { name: 'duration', label: '视频时长(秒)', type: 'number', defaultValue: 5, min: 1, max: 16 },
  ],
  request: {
    kind: 'dashscope-video-task',
    endpoint: '/services/aigc/video-generation/video-synthesis',
    mediaMode: 'multi',
    referenceFormat: 'image-bracket',
    bindings: {
      references: { target: 'input.media', mediaType: 'image' },
      prompt: { target: 'input.prompt' },
      duration: { target: 'parameters.field' },
    },
  },
  output: { kind: 'video-url', path: 'output.video_url' },
  pricing: { unit: 'per_second', quantityKey: 'duration', currency: 'CNY', tiers: [{ condition: {}, priceCents: 78 }] },
  availability: { enabled: true, stage: 'stable' },
} as unknown as ModelCatalogItem

function asset(id: string) {
  return { id, kind: 'image', source: 'upload', url: `https://cdn/${id}.png`, createdAt: '2026-08-05T00:00:00.000Z' }
}

describe('buildSubmitPayload', () => {
  it('把 references 参考池按序映射为 assetRefs.references，@图N 转成对应序号的 [Image N]', () => {
    const payload = buildSubmitPayload(referenceModel, {
      references: [asset('a1'), asset('a2')],
      prompt: '@图2 主角在 @图1 的场景中',
      duration: 5,
    })

    expect(payload.assetRefs.references).toEqual(['a1', 'a2'])
    expect(payload.params.prompt).toBe('[Image 2] 主角在 [Image 1] 的场景中')
  })

  it('无 media 值时 assetRefs 不含 references（提示词里的引用保留原标记）', () => {
    const payload = buildSubmitPayload(referenceModel, { prompt: '@图1 尚未选择参考图', duration: 5 })

    expect(payload.assetRefs.references).toBeUndefined()
    expect(payload.params.prompt).toBe('[Image 1] 尚未选择参考图')
  })

  it('剥离隐藏字段与 UI 元数据，media 不进入 params', () => {
    const payload = buildSubmitPayload(referenceModel, {
      references: [asset('a1')],
      prompt: '一段提示词',
      duration: 5,
      _uiOnly: true,
    })

    expect(payload.params).toEqual({ prompt: '一段提示词', duration: 5 })
    expect(payload.assetRefs.references).toEqual(['a1'])
  })
})

describe('buildValidationParams', () => {
  it('镜像服务端校验入参：media 转 id 数组、prompt 解析引用、剥离 UI 元数据', () => {
    const params = buildValidationParams(referenceModel, {
      references: [asset('a1'), asset('a2')],
      prompt: '@图2 主角在 @图1 的场景中',
      duration: 5,
      _uiOnly: true,
    })

    expect(params).toEqual({
      references: ['a1', 'a2'],
      prompt: '[Image 2] 主角在 [Image 1] 的场景中',
      duration: 5,
    })
  })

  it('validateModelParams 可直接消费其输出：提交前拦截超上限素材（media 数量上限拦截）', () => {
    const ok = validateModelParams(referenceModel, buildValidationParams(referenceModel, {
      references: [asset('a1'), asset('a2'), asset('a3'), asset('a4'), asset('a5')],
      prompt: '一段提示词',
    }))
    expect(ok.valid).toBe(true)

    // references maxItems: 7，第 8 张素材在提交前就被拦下
    const tooMany = validateModelParams(referenceModel, buildValidationParams(referenceModel, {
      references: Array.from({ length: 8 }, (_, index) => asset(`a${index + 1}`)),
      prompt: '一段提示词',
    }))
    expect(tooMany.valid).toBe(false)
    expect(tooMany.errors).toContainEqual(expect.objectContaining({
      field: 'references',
      code: 'OUT_OF_RANGE',
    }))
  })
})
