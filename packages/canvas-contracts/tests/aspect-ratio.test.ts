import { describe, expect, it } from 'vitest'
import {
  resolveCanvasAspectRatioParameter,
  supportedCanvasAspectRatios,
} from '../src'

describe('Canvas aspect ratio mapping', () => {
  it('prefers a direct aspectRatio parameter', () => {
    const parameters = [
      {
        name: 'aspectRatio',
        type: 'select',
        options: [{ label: '16:9', value: '16:9' }],
      },
    ] as const

    expect(resolveCanvasAspectRatioParameter(parameters, '16:9')).toEqual({
      name: 'aspectRatio',
      value: '16:9',
    })
  })

  it('maps a size option from a ratio label or pixel dimensions', () => {
    const parameters = [
      {
        name: 'size',
        type: 'select',
        options: [
          { label: '16:9 (1664×928)', value: '1664*928' },
          { label: '竖屏', value: '928*1664' },
        ],
      },
    ] as const

    expect(resolveCanvasAspectRatioParameter(parameters, '16:9')).toEqual({
      name: 'size',
      value: '1664*928',
    })
    expect(resolveCanvasAspectRatioParameter(parameters, '9:16')).toEqual({
      name: 'size',
      value: '928*1664',
    })
  })

  it('reports only ratios actually supported by the model', () => {
    const parameters = [
      {
        name: 'ratio',
        type: 'select',
        options: [
          { label: '16:9', value: '16:9' },
          { label: '1:1', value: '1:1' },
        ],
      },
    ] as const

    expect(supportedCanvasAspectRatios(parameters)).toEqual(['1:1', '16:9'])
  })

  it('does not invent a provider parameter for unsupported ratios', () => {
    expect(resolveCanvasAspectRatioParameter([
      { name: 'prompt', type: 'text' },
    ], '4:3')).toBeUndefined()
  })
})
