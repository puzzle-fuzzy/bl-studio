import { describe, expect, it } from 'vitest'
import {
  isTaskError,
  readCarriedTaskError,
  taskErrorCarrier,
} from '../src/task-error-guard'

describe('task error guard', () => {
  it('accepts only known categories and correctly typed fields', () => {
    expect(isTaskError({
      category: 'storage',
      message: 'write failed',
      retriable: false,
      code: 'WRITE_FAILED',
      details: { key: 'artifact/1' },
    })).toBe(true)
    expect(isTaskError({ category: 'invented', message: 'x', retriable: false })).toBe(false)
    expect(isTaskError({ category: 'storage', message: 500, retriable: 'false' })).toBe(false)
  })

  it('round-trips valid carried errors and rejects malformed carriers', () => {
    const taskError = {
      category: 'validation' as const,
      message: 'invalid input',
      retriable: false,
      code: 'INVALID_INPUT',
    }
    expect(readCarriedTaskError(taskErrorCarrier(taskError))).toEqual(taskError)
    expect(readCarriedTaskError({
      taskError: { category: 'validation', message: 123, retriable: false },
    })).toBeUndefined()
    expect(readCarriedTaskError(new Error('plain'))).toBeUndefined()
  })
})
