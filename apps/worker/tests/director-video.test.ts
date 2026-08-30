import { describe, expect, it } from 'vitest'
import { getModelById } from '@bailian-studio/model-core'
import type { DirectorAsset } from '@bailian-studio/director-contracts'
import { buildDirectorVideoGenerationInput, DirectorVideoInputError, parseDirectorVideoRunSummary } from '../src/director-video'

const shot = {
  narrative: '人物抬头看向远处，随后缓慢向前走。',
  camera: { shotSize: '中近景', movement: '缓慢推近' },
  durationSeconds: 1,
  environmentPrompt: '夜晚的旧车站，冷色灯光。',
  videoPrompt: '动作自然，保持人物外观和场景连续。',
  negativePrompt: '不要新增人物，不要改变场景结构。',
  dialogue: null,
  referenceAssetIds: ['director-asset-1'],
}

const referenceAsset = {
  id: 'director-asset-1',
  projectId: 'project-1',
  sourceRunId: null,
  kind: 'character_reference',
  ownerType: 'character',
  ownerId: 'character-1',
  assetId: 'user-asset-1',
  version: 1,
  metadata: {},
  staleAt: null,
  staleReason: null,
  createdAt: '2026-08-11T00:00:00.000Z',
  updatedAt: '2026-08-11T00:00:00.000Z',
} as DirectorAsset

describe('director video input', () => {
  it('uses manifest bindings, references, and duration constraints', () => {
    const manifest = getModelById('wanx-2.7-reference-video')
    expect(manifest).toBeDefined()
    const input = buildDirectorVideoGenerationInput(shot, [referenceAsset], manifest!)

    expect(input.assetRefs).toEqual({ references: ['user-asset-1'] })
    expect(input.params.duration).toBe(2)
    expect(input.params.negativePrompt).toContain('不要新增人物')
    expect(input.params.prompt).toContain('图1')
  })

  it('rejects a manifest that requires a reference when a shot has none', () => {
    const manifest = getModelById('wan3-reference-to-video')
    expect(manifest).toBeDefined()
    expect(() => buildDirectorVideoGenerationInput({ ...shot, referenceAssetIds: [] }, [], manifest!)).toThrowError(DirectorVideoInputError)
  })

  it('supports angle-bracket image bindings such as Keling reference video', () => {
    const manifest = getModelById('keling-reference-video')
    expect(manifest).toBeDefined()
    const input = buildDirectorVideoGenerationInput(shot, [referenceAsset], manifest!)

    expect(input.assetRefs).toEqual({ references: ['user-asset-1'] })
    expect(input.params.prompt).toContain('<<<image_1>>>')
  })
})

describe('parseDirectorVideoRunSummary', () => {
  it('keeps valid per-shot progress and ignores malformed entries', () => {
    expect(parseDirectorVideoRunSummary({
      modelId: 'wanx-2.7-reference-video',
      shotGenerations: {
        'shot-1': { shotId: 'shot-1', sequence: 1, generationId: 'generation-1', status: 'processing' },
        invalid: { shotId: 'invalid', sequence: '1', generationId: 'generation-2', status: 'processing' },
      },
    })).toEqual({
      modelId: 'wanx-2.7-reference-video',
      shotGenerations: {
        'shot-1': { shotId: 'shot-1', sequence: 1, generationId: 'generation-1', status: 'processing' },
      },
    })
  })
})
