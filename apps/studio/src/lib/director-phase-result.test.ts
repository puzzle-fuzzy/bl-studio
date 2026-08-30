import { describe, expect, it } from 'vitest'
import { parseDirectorPhaseResult, type SafeParseSchema } from './director-phase-result'

interface TestResult {
  summary: string
}

const testSchema: SafeParseSchema<TestResult> = {
  safeParse(input) {
    if (
      typeof input === 'object'
      && input !== null
      && 'summary' in input
      && typeof input.summary === 'string'
    ) {
      return { success: true, data: { summary: input.summary } }
    }
    return { success: false }
  },
}

const spec = {
  textKey: 'analysisText',
  resultKey: 'analysis',
  schema: testSchema,
}

describe('parseDirectorPhaseResult', () => {
  it('reads text and validated result while preserving stale state', () => {
    expect(parseDirectorPhaseResult(
      { analysisText: '分析文本', analysis: { summary: '结构化结果' } },
      '2026-08-31T00:00:00.000Z',
      spec,
    )).toEqual({
      text: '分析文本',
      result: { summary: '结构化结果' },
      stale: true,
    })
  })

  it('rejects invalid structured output without dropping valid text', () => {
    expect(parseDirectorPhaseResult(
      { analysisText: '分析文本', analysis: { unexpected: true } },
      null,
      spec,
    )).toEqual({
      text: '分析文本',
      result: undefined,
      stale: false,
    })
  })

  it('ignores non-string text and missing output', () => {
    expect(parseDirectorPhaseResult(null, null, spec)).toEqual({
      text: undefined,
      result: undefined,
      stale: false,
    })
    expect(parseDirectorPhaseResult({ analysisText: 42 }, null, spec).text).toBeUndefined()
  })
})
