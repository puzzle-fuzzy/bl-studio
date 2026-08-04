import { describe, expect, it } from 'vitest'
import { calculateRetryDelayMs, nextRunAt } from '../src'

describe('retry backoff', () => {
  it('uses the base delay for attempt 1', () => {
    expect(calculateRetryDelayMs(1, { baseMs: 1000, maxMs: 30000 })).toBe(1000)
  })

  it('doubles the delay for attempt 2', () => {
    expect(calculateRetryDelayMs(2, { baseMs: 1000, maxMs: 30000 })).toBe(2000)
  })

  it('caps retry delay at max', () => {
    expect(calculateRetryDelayMs(10, { baseMs: 1000, maxMs: 5000 })).toBe(5000)
  })

  it('calculates the next run timestamp', () => {
    expect(nextRunAt('2026-06-28T00:00:00.000Z', 2, { baseMs: 1000, maxMs: 5000 })).toBe(
      '2026-06-28T00:00:02.000Z',
    )
  })
})
