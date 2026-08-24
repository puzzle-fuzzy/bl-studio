import { describe, expect, it } from 'vitest'
import { parseDirectorScriptChatOutputDetailed } from '../src/director-analysis'

const validAnalysis = {
  summary: 'A concise summary',
  theme: 'Trust',
  audience: 'Short drama viewers',
  structure: [{ name: 'Setup', purpose: 'Establish the conflict', beats: ['The signal arrives'] }],
  characters: [{ name: 'Lin Fan', role: 'Lead', description: 'A calm survivor', traits: ['Sharp'] }],
  locations: [{ name: 'Convenience store', description: 'A wet store', atmosphere: 'Tense' }],
  continuityRisks: [],
  visualMotifs: ['Rain'],
}

describe('parseDirectorScriptChatOutputDetailed', () => {
  it('normalizes known model aliases while keeping the downstream contract strict', () => {
    const output = {
      reply: 'Updated',
      screenplay: 'Title: Rainy Night',
      synopsis: 'A difficult choice',
      analysis: {
        ...validAnalysis,
        structure: [{ scene: 'Setup', function: 'Establish the conflict', beats: ['The signal arrives'] }],
        characters: [{ name: 'Lin Fan', keyProps: [{ trait: 'Calm' }], arc: 'From calm to decisive', traits: ['Sharp'] }],
        locations: [{ name: 'Convenience store', details: 'A wet store', function: 'A tense refuge' }],
      },
      changes: ['Added the setup'],
    }

    const parsed = parseDirectorScriptChatOutputDetailed(JSON.stringify(output))

    expect(parsed.mode).toBe('normalized-json')
    expect(parsed.output?.analysis.structure[0]?.name).toBe('Setup')
    expect(parsed.output?.analysis.structure[0]?.purpose).toBe('Establish the conflict')
    expect(parsed.output?.analysis.characters[0]?.description).toBe('From calm to decisive')
    expect(parsed.output?.analysis.locations[0]?.description).toBe('A wet store')
  })
})
