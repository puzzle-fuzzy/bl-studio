import { describe, expect, it } from 'vitest'
import { parseDirectorLocationsOutput, parseDirectorLocationsOutputDetailed } from '../src/director-locations'

const validLocations = {
  locations: [{
    name: '旧车站',
    description: '停用的郊外车站，候车厅保留着褪色的时刻表。',
    atmosphere: '潮湿、空旷、回声明显。',
    narrativeFunction: '让角色在公开空间里交换不能被第三人听见的秘密。',
    timeOfDay: '傍晚至夜间',
    visualAnchors: ['红色售票窗', '坏掉的站牌'],
    continuityNotes: ['站牌缺口在后续镜头中保持一致。'],
  }],
  continuityNotes: ['车站的光线从冷白过渡到钠灯色。'],
}

describe('parseDirectorLocationsOutput', () => {
  it('accepts strict JSON', () => {
    expect(parseDirectorLocationsOutput(JSON.stringify(validLocations))).toEqual(validLocations)
  })

  it('accepts JSON wrapped in a markdown fence', () => {
    const fenced = ['```json', JSON.stringify(validLocations), '```'].join('\n')
    expect(parseDirectorLocationsOutput(fenced)).toEqual(validLocations)
  })

  it('rejects a location without narrative function', () => {
    const incomplete = { ...validLocations, locations: [{ ...validLocations.locations[0], narrativeFunction: '' }] }
    expect(parseDirectorLocationsOutput(JSON.stringify(incomplete))).toBeUndefined()
  })

  it('repairs a missing object brace before the locations array closes', () => {
    const malformed = JSON.stringify(validLocations).replace('}],"continuityNotes"', '],"continuityNotes"')
    const parsed = parseDirectorLocationsOutputDetailed(malformed)
    expect(parsed.mode).toBe('repaired-json')
    expect(parsed.locations).toEqual(validLocations)
  })
})
