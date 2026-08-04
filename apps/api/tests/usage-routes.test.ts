import { describe, expect, it } from 'vitest'
import { currentUtcMonthWindow } from '../src/modules/usage'

describe('monthly usage period', () => {
  it('uses an inclusive start and exclusive next-month UTC boundary', () => {
    expect(currentUtcMonthWindow(new Date('2026-07-22T16:30:00.000Z'))).toEqual({
      since: '2026-07-01T00:00:00.000Z',
      until: '2026-08-01T00:00:00.000Z',
    })
  })
})
