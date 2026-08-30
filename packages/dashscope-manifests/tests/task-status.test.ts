import { describe, expect, it } from 'vitest'
import { classifyTaskStatus } from '@bailian-studio/model-core'
import { getModelById } from '../src'

describe('classifyTaskStatus', () => {
  const keling = getModelById('keling-text-to-video')
  if (keling === undefined) throw new Error('keling-text-to-video fixture model is missing')

  it('maps transport-declared succeeded/failed values regardless of case', () => {
    expect(classifyTaskStatus(keling, 'SUCCEEDED')).toBe('succeeded')
    expect(classifyTaskStatus(keling, 'succeeded')).toBe('succeeded')
    expect(classifyTaskStatus(keling, 'FAILED')).toBe('failed')
    expect(classifyTaskStatus(keling, 'CANCELED')).toBe('failed')
    expect(classifyTaskStatus(keling, 'UNKNOWN')).toBe('failed')
  })

  it('treats pending and unrecognized statuses as pending (keep polling)', () => {
    expect(classifyTaskStatus(keling, 'PENDING')).toBe('pending')
    expect(classifyTaskStatus(keling, 'RUNNING')).toBe('pending')
    expect(classifyTaskStatus(keling, 'MYSTERY')).toBe('pending')
  })

  it('returns pending defensively for non-polling manifests', () => {
    const qwenImage = getModelById('qwen-image')
    expect(qwenImage).toBeDefined()
    expect(classifyTaskStatus(qwenImage!, 'SUCCEEDED')).toBe('pending')
  })
})
