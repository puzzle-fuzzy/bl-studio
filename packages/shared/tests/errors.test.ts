import { describe, expect, it } from 'vitest'
import { ErrorCode, BailianStudioError, ValidationError } from '../src'

describe('BailianStudioError.toJSON', () => {
  it('serializes name/code/message/retryable/metadata', () => {
    const error = new BailianStudioError(ErrorCode.VALIDATION_INVALID_INPUT, 'bad input', true, { field: 'prompt' })
    expect(error.toJSON()).toEqual({
      name: 'BailianStudioError',
      code: ErrorCode.VALIDATION_INVALID_INPUT,
      message: 'bad input',
      retryable: true,
      metadata: { field: 'prompt' },
    })
  })

  it('omits metadata value when none is provided', () => {
    const error = new BailianStudioError(ErrorCode.VALIDATION_INVALID_INPUT, 'missing')
    expect(error.toJSON().metadata).toBeUndefined()
    expect(error.toJSON().code).toBe(ErrorCode.VALIDATION_INVALID_INPUT)
  })
})

describe('ValidationError.toJSON', () => {
  it('includes the field on top of the base shape', () => {
    const error = new ValidationError('required', 'prompt')
    expect(error.toJSON()).toMatchObject({
      name: 'ValidationError',
      field: 'prompt',
      message: 'required',
      code: ErrorCode.VALIDATION_INVALID_INPUT,
    })
  })

  it('is a BailianStudioError and defaults to non-retryable', () => {
    const error = new ValidationError('bad')
    expect(error).toBeInstanceOf(BailianStudioError)
    expect(error.retryable).toBe(false)
    expect(error.name).toBe('ValidationError')
  })
})
