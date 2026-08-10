import { describe, expect, it } from 'vitest'
import { continuityPrompt, parseDirectorContinuityOutput } from '../src/director-continuity'

describe('director continuity', () => {
  it('parses structured continuity risks from provider output', () => {
    const result = parseDirectorContinuityOutput('```json\n{"summary":"角色状态需要统一","issues":[{"shotId":"shot-1","sequence":1,"severity":"warning","category":"角色","issue":"外套颜色发生变化","suggestion":"锁定角色服装描述"}]}\n```')

    expect(result?.summary).toBe('角色状态需要统一')
    expect(result?.issues[0]?.shotId).toBe('shot-1')
  })

  it('keeps the prompt grounded in the captured storyboard shots', () => {
    const prompt = continuityPrompt('测试项目', null, [{
      id: 'shot-1',
      sequence: 1,
      sceneNumber: 1,
      slugline: 'INT. TEST - DAY',
      narrative: '角色走进房间',
      camera: { shotSize: '中景' },
      durationSeconds: 5,
      environmentPrompt: '房间',
      videoPrompt: '推镜头',
      dialogue: null,
      continuity: null,
    }])

    expect(prompt).toContain('shot-1')
    expect(prompt).toContain('只引用输入中真实存在的 shotId')
  })
})
