import { describe, expect, it } from 'vitest'
import type { ParameterValidationIssue } from '@bailian-studio/model-core'
import { parameterIssuesToFieldErrors } from './parameter-validation'

describe('parameterIssuesToFieldErrors', () => {
  it('把 model-core issues 映射为按字段归组的 FieldIssue（统一取 zh-CN 文案）', () => {
    const issues: ParameterValidationIssue[] = [
      {
        code: 'OUT_OF_RANGE',
        field: 'duration',
        message: 'duration must be at most 10 when the condition is met',
        messages: {
          'zh-CN': 'duration在条件满足时必须小于或等于 10',
          'en-US': 'duration must be at most 10 when the condition is met',
        },
      },
      {
        code: 'OUT_OF_RANGE',
        field: 'references',
        message: 'references must contain at most 7 item(s)',
        messages: {
          'zh-CN': 'references最多允许 7 个素材',
          'en-US': 'references must contain at most 7 item(s)',
        },
      },
    ]

    const map = parameterIssuesToFieldErrors(issues)
    expect([...map.keys()]).toEqual(['duration', 'references'])
    expect(map.get('duration')).toEqual({
      field: 'duration',
      code: 'OUT_OF_RANGE',
      message: 'duration在条件满足时必须小于或等于 10',
    })
  })

  it('跳过空 field 的 issue（如 UNKNOWN_PARAMETER 的空串占位）', () => {
    const map = parameterIssuesToFieldErrors([
      {
        code: 'UNKNOWN_PARAMETER',
        field: '',
        message: 'unknown',
        messages: { 'zh-CN': '未知', 'en-US': 'unknown' },
      },
    ])
    expect(map.size).toBe(0)
  })
})
