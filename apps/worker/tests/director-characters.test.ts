import { describe, expect, it } from 'vitest'
import { parseDirectorCharactersOutput } from '../src/director-characters'

const validCharacters = {
  characters: [{
    name: '林默',
    role: '主角',
    description: '执着的记者，在真相和自我保护之间做出选择。',
    traits: ['克制', '敏锐'],
    goal: '查清哥哥失踪的真相。',
    conflict: '证据指向自己最信任的人。',
    arc: '从只相信证据，到学会承担关系中的风险。',
    visualSignature: '旧相机与深色风衣。',
  }],
  relationshipNotes: ['林默与顾野既互相利用，又共享同一个秘密。'],
}

describe('parseDirectorCharactersOutput', () => {
  it('accepts strict JSON', () => {
    expect(parseDirectorCharactersOutput(JSON.stringify(validCharacters))).toEqual(validCharacters)
  })

  it('accepts JSON wrapped in a markdown fence', () => {
    const fenced = ['```json', JSON.stringify(validCharacters), '```'].join('\n')
    expect(parseDirectorCharactersOutput(fenced)).toEqual(validCharacters)
  })

  it('rejects a character without a usable arc', () => {
    const incomplete = { ...validCharacters, characters: [{ ...validCharacters.characters[0], arc: '' }] }
    expect(parseDirectorCharactersOutput(JSON.stringify(incomplete))).toBeUndefined()
  })
})
