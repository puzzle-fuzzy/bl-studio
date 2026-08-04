import { describe, expect, it } from 'vitest'
import { GENERATION_STATUS_TONES } from '../src/status-tokens'

describe('GENERATION_STATUS_TONES', () => {
  it('maps in-progress generation statuses to attention and info tones', () => {
    expect(GENERATION_STATUS_TONES.submitting).toBe('warning')
    expect(GENERATION_STATUS_TONES.provider_processing).toBe('info')
    expect(GENERATION_STATUS_TONES.saving_output).toBe('info')
  })

  it('maps terminal generation statuses to expected tones', () => {
    expect(GENERATION_STATUS_TONES.succeeded).toBe('success')
    expect(GENERATION_STATUS_TONES.failed).toBe('danger')
    expect(GENERATION_STATUS_TONES.cancelled).toBe('neutral')
  })
})
