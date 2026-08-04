import { describe, expect, it } from 'vitest'
import { generationEventFromNotification } from '../src/modules/generations/event-listener'

describe('generationEventFromNotification', () => {
  it('maps a succeeded notification to a generation.completed SSE event', () => {
    const event = generationEventFromNotification({
      id: 'event_1',
      recordId: 'rec_1',
      userId: 'user_1',
      status: 'succeeded',
      modelId: 'qwen-image',
      updatedAt: '2026-06-29T00:00:00.000Z',
      createdAt: '2026-06-29T00:00:00.000Z',
    })

    expect(event.event).toBe('generation.completed')
    expect(event.data).toMatchObject({
      recordId: 'rec_1',
      userId: 'user_1',
      status: 'succeeded',
      modelId: 'qwen-image',
    })
  })

  it('maps a failed notification to generation.failed', () => {
    const event = generationEventFromNotification({
      id: 'event_2',
      recordId: 'rec_2',
      userId: 'user_1',
      status: 'failed',
      modelId: 'qwen-image',
      updatedAt: 't',
      createdAt: 't',
    })
    expect(event.event).toBe('generation.failed')
  })

  it('maps a transitional status to generation.status', () => {
    const event = generationEventFromNotification({
      id: 'event_3',
      recordId: 'rec_3',
      userId: 'user_1',
      status: 'processing',
      modelId: 'qwen-image',
      updatedAt: 't',
      createdAt: 't',
    })
    expect(event.event).toBe('generation.status')
  })
})
