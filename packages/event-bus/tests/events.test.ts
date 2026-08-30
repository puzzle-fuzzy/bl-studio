import { describe, expect, it } from 'vitest'
import { generationChannel, generationEventNameForStatus, makeDirectorEvent, makeGenerationEvent } from '../src'

describe('generation events', () => {
  it('builds generation event payloads with stable channel ids', () => {
    const event = makeGenerationEvent('generation.status', {
      recordId: 'rec_1',
      userId: 'user_1',
      status: 'provider_processing',
      modelId: 'qwen-image',
      updatedAt: '2026-06-28T00:00:00.000Z',
    })

    const eventName: 'generation.status' = event.event

    expect(eventName).toBe('generation.status')
    expect(event.event).toBe('generation.status')
    expect(event.data.recordId).toBe('rec_1')
    expect(generationChannel('user_1')).toBe('generation:user_1')
  })
})

describe('generationEventNameForStatus', () => {
  it('maps terminal and transitional statuses to the right event name', () => {
    expect(generationEventNameForStatus('succeeded')).toBe('generation.completed')
    expect(generationEventNameForStatus('failed')).toBe('generation.failed')
    expect(generationEventNameForStatus('cancelled')).toBe('generation.cancelled')
    expect(generationEventNameForStatus('processing')).toBe('generation.status')
    expect(generationEventNameForStatus('provider_processing')).toBe('generation.status')
    expect(generationEventNameForStatus('submitting')).toBe('generation.status')
  })
})

describe('director events', () => {
  it('builds a project-scoped entity invalidation event', () => {
    const event = makeDirectorEvent('director.entities.changed', {
      userId: 'user_1',
      projectId: 'project_1',
      candidateId: 'candidate_1',
      reason: 'candidate_reviewed',
    })

    expect(event.event).toBe('director.entities.changed')
    expect(event.data.projectId).toBe('project_1')
  })
})
