import { describe, expect, it } from 'vitest'
import { projectCanvasParameterValues } from '../src'

describe('projectCanvasParameterValues', () => {
  const parameters = [
    { name: 'prompt', type: 'text' },
    { name: 'referenceImages', type: 'media' },
    {
      name: 'watermark',
      type: 'boolean',
    },
    {
      name: 'size',
      type: 'select',
      options: [
        { value: '1K' },
        { value: '2K' },
      ],
    },
  ] as const

  it('keeps ordinary values while excluding prompt and media bindings', () => {
    expect(projectCanvasParameterValues(parameters, {
      prompt: 'ignored',
      referenceImages: ['asset-1'],
      watermark: false,
      size: '2K',
    })).toEqual({ watermark: false, size: '2K' })
  })

  it('drops select values removed from the current manifest', () => {
    expect(projectCanvasParameterValues(parameters, {
      size: '4K',
    })).toEqual({})
  })
})
