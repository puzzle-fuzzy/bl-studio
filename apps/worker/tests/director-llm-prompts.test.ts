import { describe, expect, it } from 'vitest'
import { storyboardPrompt, type RunInputSnapshot } from '../src/director-llm-prompts'

describe('storyboardPrompt', () => {
  it('gives the storyboard model the current director entities as the reference key source', () => {
    const snapshot: RunInputSnapshot = {
      title: '实体参考测试',
      synopsis: null,
      storyText: '林默在旧车站等待。',
      analysis: null,
      characters: null,
      locations: null,
      directorEntities: {
        characters: [{
          id: 'character-1',
          sourceRunId: null,
          name: '林默',
          role: null,
          description: '等待者',
          traits: ['克制'],
          referenceAssetIds: [],
          metadata: { entityCandidateId: 'candidate-1' },
          locked: false,
          version: 1,
          staleAt: null,
          staleReason: null,
        }],
        locations: [{
          id: 'location-1',
          sourceRunId: null,
          name: '旧车站',
          description: '空旷车站',
          atmosphere: null,
          referenceAssetIds: [],
          metadata: { entityCandidateId: 'candidate-2' },
          locked: false,
          version: 1,
          staleAt: null,
          staleReason: null,
        }],
      },
      shots: null,
      continuity: null,
      music: null,
      assembly: null,
    }

    const prompt = storyboardPrompt(
      snapshot,
      {
        summary: '等待',
        theme: '重逢',
        audience: '成人',
        structure: [],
        characters: [],
        locations: [],
        continuityRisks: [],
        visualMotifs: [],
      },
      { characters: [], relationshipNotes: [] },
      { locations: [], continuityNotes: [] },
    )

    expect(prompt).toContain('当前有效导演实体（referenceKeys 只能从这里选择）')
    expect(prompt).toContain('林默')
    expect(prompt).toContain('旧车站')
    expect(prompt).toContain('不要填写资产 ID、候选 ID')
  })
})
