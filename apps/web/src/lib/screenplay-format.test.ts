import { describe, expect, it } from 'vitest'
import { parseScreenplay } from './screenplay-format'

describe('parseScreenplay', () => {
  it('identifies title, scene, role dialogue, parentheticals and action text', () => {
    const lines = parseScreenplay([
      '雨夜便利店',
      '1. 内景｜便利店｜夜',
      '林默：（低声）',
      '你终于来了。',
      '林默：别回头。',
      '他把门锁上。',
    ].join('\n'))

    expect(lines.map(line => line.kind)).toEqual(['title', 'scene-heading', 'dialogue', 'dialogue', 'dialogue', 'action'])
    expect(lines[2]).toMatchObject({ speaker: '林默', dialogue: '（低声）' })
    expect(lines[3]).toMatchObject({ kind: 'dialogue', dialogue: '你终于来了。' })
    expect(lines[4]).toMatchObject({ speaker: '林默', dialogue: '别回头。' })
  })

  it('keeps unknown and quoted lines safe and readable', () => {
    const lines = parseScreenplay('【人物表】\n“你还好吗？”\n- 雨声持续')

    expect(lines[0]?.kind).toBe('section-heading')
    expect(lines[1]).toMatchObject({ kind: 'dialogue', dialogue: '“你还好吗？”' })
    expect(lines[2]?.kind).toBe('list-item')
  })
})
