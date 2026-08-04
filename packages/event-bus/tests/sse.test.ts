import { describe, expect, it } from 'vitest'
import { encodeSSE } from '../src'

describe('encodeSSE', () => {
  it('encodes event name and JSON data', () => {
    expect(encodeSSE({ event: 'connected', data: { serverTime: '2026-06-28T00:00:00.000Z' } })).toBe(
      'event: connected\ndata: {"serverTime":"2026-06-28T00:00:00.000Z"}\n\n',
    )
  })

  it('escapes embedded newlines through JSON encoding', () => {
    expect(encodeSSE({ event: 'notification', data: { message: 'a\nb' } })).toBe(
      'event: notification\ndata: {"message":"a\\nb"}\n\n',
    )
  })

  it('encodes an event id for reconnect cursors', () => {
    expect(encodeSSE({
      id: 'generation_event_1',
      event: 'generation.created',
      data: { recordId: 'record_1' },
    })).toBe(
      'id: generation_event_1\nevent: generation.created\ndata: {"recordId":"record_1"}\n\n',
    )
  })
})
