import { describe, expect, it } from 'vitest'
import { parseDirectorPromptRebuildOutput, promptRebuildPrompt } from '../src/director-prompts'

describe('director prompt rebuild', () => {
  it('parses editable prompt suggestions from provider output', () => {
    const result = parseDirectorPromptRebuildOutput('```json\n{"summary":"统一夜景和动作表达","shots":[{"shotId":"shot-1","sequence":1,"environmentPrompt":"雨夜街道","videoPrompt":"角色缓慢抬头，镜头向前推进","negativePrompt":"画面闪烁、人物变形","rationale":"补全光线和动作衔接"}]}\n```')

    expect(result?.shots[0]?.shotId).toBe('shot-1')
    expect(result?.shots[0]?.videoPrompt).toContain('镜头向前推进')
  })

  it('grounds the prompt rebuild in current shot ids and continuity output', () => {
    const prompt = promptRebuildPrompt('测试项目', null, [{
      id: 'shot-1',
      sequence: 1,
      sceneNumber: 1,
      slugline: 'INT. TEST - DAY',
      narrative: '角色走进房间',
      camera: { shotSize: '中景' },
      durationSeconds: 5,
      environmentPrompt: '房间',
      videoPrompt: '推镜头',
      negativePrompt: null,
      dialogue: null,
      continuity: null,
      referenceAssetIds: ['director-ref-1'],
    }], { summary: '保持角色服装一致', issues: [] })

    expect(prompt).toContain('shot-1')
    expect(prompt).toContain('不要自动生成视频')
    expect(prompt).toContain('保持角色服装一致')
  })
})
