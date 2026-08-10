import { describe, expect, it } from 'vitest'
import { parseDirectorAnalysisOutput } from '../src/director-analysis'

const validAnalysis = {
  summary: '一名记者在旧车站等候失联的哥哥。',
  theme: '等待与和解',
  audience: '喜欢现实主义悬疑短剧的成年观众',
  structure: [{ name: '建立悬念', purpose: '交代等待与冲突', beats: ['记者发现旧车票'] }],
  characters: [{ name: '林默', role: '主角', description: '执着的记者', traits: ['克制', '敏锐'] }],
  locations: [{ name: '旧车站', description: '停用的郊外车站', atmosphere: '潮湿、空旷' }],
  continuityRisks: ['车票日期需要统一'],
  visualMotifs: ['反复出现的时钟'],
}

describe('parseDirectorAnalysisOutput', () => {
  it('accepts strict JSON', () => {
    expect(parseDirectorAnalysisOutput(JSON.stringify(validAnalysis))).toEqual(validAnalysis)
  })

  it('accepts JSON wrapped in a markdown fence', () => {
    expect(parseDirectorAnalysisOutput(`\`\`\`json\n${JSON.stringify(validAnalysis)}\n\`\`\``)).toEqual(validAnalysis)
  })

  it('rejects incomplete downstream data instead of guessing', () => {
    expect(parseDirectorAnalysisOutput(JSON.stringify({ summary: validAnalysis.summary }))).toBeUndefined()
  })
})
