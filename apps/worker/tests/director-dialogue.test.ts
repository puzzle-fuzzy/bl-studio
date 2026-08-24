import { describe, expect, it } from 'vitest'
import { dialoguePrompt, parseDirectorDialogueOutput } from '../src/director-dialogue'

describe('director dialogue', () => {
  it('parses editable dialogue suggestions from provider output', () => {
    const result = parseDirectorDialogueOutput('```json\n{"summary":"对白节奏统一","shots":[{"shotId":"shot-1","sequence":1,"lines":[{"speaker":"林默","text":"我知道你会回来。","delivery":"压低声音，克制"}],"rationale":"补充停顿和表演语气"}]}\n```')

    expect(result?.shots[0]?.shotId).toBe('shot-1')
    expect(result?.shots[0]?.lines[0]?.speaker).toBe('林默')
  })

  it('grounds the prompt in the captured shot ids and preserves empty-dialogue shots', () => {
    const prompt = dialoguePrompt('测试项目', null, [{
      id: 'shot-1',
      sequence: 1,
      sceneNumber: 1,
      slugline: 'INT. TEST - DAY',
      narrative: '角色走进房间',
      dialogue: { lines: [] },
      continuity: null,
    }])

    expect(prompt).toContain('shot-1')
    expect(prompt).toContain('没有对白的镜头返回空 lines')
  })
})
