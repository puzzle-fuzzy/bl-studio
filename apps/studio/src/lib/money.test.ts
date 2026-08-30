import { describe, expect, it } from 'vitest'
import { formatCentsCompact } from './money'

describe('formatCentsCompact', () => {
  it('keeps smaller balances readable', () => {
    expect(formatCentsCompact(12_345)).toBe('123.45')
  })

  it('uses k for thousands', () => {
    expect(formatCentsCompact(123_456)).toBe('1.2k')
  })

  it('uses w for ten-thousands', () => {
    expect(formatCentsCompact(1_234_567)).toBe('1.2w')
  })
})
