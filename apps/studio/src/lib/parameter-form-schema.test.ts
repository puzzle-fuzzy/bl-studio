import { describe, expect, it } from 'vitest'
import type { ModelParameter } from '@bailian-studio/api-client'
import {
  buildParameterFormSchema,
  isParameterVisible,
  removeHiddenParameterValues,
} from './parameter-form-schema'

const prompt: ModelParameter = {
  name: 'prompt',
  label: '提示词',
  type: 'text',
  required: true,
  maxLength: 2000,
}

const resolution: ModelParameter = {
  name: 'resolution',
  label: '分辨率',
  type: 'select',
  defaultValue: '720P',
  options: [
    { label: '720P', value: '720P' },
    { label: '1080P', value: '1080P' },
  ],
}

const enableAudio: ModelParameter = {
  name: 'enableAudio',
  label: '是否生成音频',
  type: 'boolean',
  defaultValue: false,
}

const referenceImages: ModelParameter = {
  name: 'referenceImages',
  label: '参考图',
  type: 'media',
  mediaKind: 'image',
  minItems: 1,
  maxItems: 4,
}

describe('buildParameterFormSchema', () => {
  it('projects prompt to textarea in input group (wide)', () => {
    const field = buildParameterFormSchema([prompt])[0]
    expect(field?.control).toBe('textarea')
    expect(field?.group).toBe('input')
    expect(field?.wide).toBe(true)
  })

  it('projects select to select in settings group', () => {
    const field = buildParameterFormSchema([resolution])[0]
    expect(field?.control).toBe('select')
    expect(field?.group).toBe('settings')
  })

  it('projects media to media in input group', () => {
    const field = buildParameterFormSchema([referenceImages])[0]
    expect(field?.control).toBe('media')
    expect(field?.group).toBe('input')
  })
})

describe('isParameterVisible', () => {
  it('is visible when visibleWhen is absent', () => {
    expect(isParameterVisible(resolution, {})).toBe(true)
  })

  it('honors visibleWhen equals (including non-scalar deep compare)', () => {
    const param: ModelParameter = { ...enableAudio, visibleWhen: { field: 'mode', equals: ['a', 'b'] } }
    expect(isParameterVisible(param, { mode: ['a', 'b'] })).toBe(true)
    expect(isParameterVisible(param, { mode: ['a'] })).toBe(false)
  })
})

describe('removeHiddenParameterValues', () => {
  it('strips hidden field values but keeps underscore-prefixed UI metadata', () => {
    const parameters: ModelParameter[] = [
      { ...enableAudio, visibleWhen: { field: 'mode', equals: 'on' } },
    ]
    const result = removeHiddenParameterValues(parameters, {
      enableAudio: true,
      mode: 'off',
      _refs: { x: 1 },
    })
    expect(result).toEqual({ _refs: { x: 1 } })
  })
})
