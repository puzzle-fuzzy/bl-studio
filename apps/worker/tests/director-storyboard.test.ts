import { describe, expect, it } from 'vitest'
import { parseDirectorStoryboardOutput } from '../src/director-storyboard'

const validStoryboard = {
  shots: [{
    sequence: 1,
    sceneNumber: 1,
    slugline: 'INT. 旧车站 - 夜',
    narrative: '林默在空荡的候车厅里抬头看向停摆的时钟。',
    camera: {
      shotSize: '中近景',
      angle: '平视',
      movement: '缓慢推近',
      lens: '50mm',
      composition: '人物位于画面右侧，留出空旷候车厅。',
    },
    durationSeconds: 5,
    environmentPrompt: '潮湿的旧车站候车厅，冷色荧光灯。',
    videoPrompt: '林默缓慢抬头，镜头向前推进。',
    negativePrompt: '不要新增人物，不要改变车站结构。',
    dialogue: [],
    referenceKeys: ['林默', '旧车站'],
    continuity: { clock: '保持停在十点十五分' },
  }],
}

describe('parseDirectorStoryboardOutput', () => {
  it('accepts a strict storyboard contract', () => {
    expect(parseDirectorStoryboardOutput(JSON.stringify(validStoryboard))).toEqual(validStoryboard)
  })

  it('accepts a fenced storyboard response', () => {
    expect(parseDirectorStoryboardOutput(`\`\`\`json\n${JSON.stringify(validStoryboard)}\n\`\`\``)).toEqual(validStoryboard)
  })

  it('rejects a shot without a camera contract', () => {
    const invalid = { shots: [{ ...validStoryboard.shots[0], camera: {} }] }
    expect(parseDirectorStoryboardOutput(JSON.stringify(invalid))).toBeUndefined()
  })
})
