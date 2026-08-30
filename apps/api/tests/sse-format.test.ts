import { describe, expect, it } from 'vitest'
import type { BailianStudioSSEEvent } from '@bailian-studio/sse-protocol'
import { GenerationSseHub } from '../src/modules/generations/sse-hub'

const generationSseHub = new GenerationSseHub()

describe('generationSseHub', () => {
  it('buffers published generation events by user', () => {
    generationSseHub.clear()
    generationSseHub.publish({
      event: 'generation.status',
      data: {
        recordId: 'rec_1',
        userId: 'user_1',
        status: 'provider_processing',
        modelId: 'qwen-image',
        updatedAt: '2026-06-28T00:00:00.000Z',
      },
    })

    expect(generationSseHub.drain('user_1')).toEqual([
      'event: generation.status\ndata: {"recordId":"rec_1","userId":"user_1","status":"provider_processing","modelId":"qwen-image","updatedAt":"2026-06-28T00:00:00.000Z"}\n\n',
    ])
    expect(generationSseHub.drain('user_1')).toEqual([])
  })

  it('keeps user buffers isolated', () => {
    const hub = new GenerationSseHub()

    hub.publish({
      event: 'generation.status',
      data: {
        recordId: 'rec_1',
        userId: 'user_1',
        status: 'provider_processing',
        modelId: 'qwen-image',
        updatedAt: '2026-06-28T00:00:00.000Z',
      },
    })
    hub.publish({
      event: 'generation.status',
      data: {
        recordId: 'rec_2',
        userId: 'user_2',
        status: 'succeeded',
        modelId: 'qwen-image',
        updatedAt: '2026-06-28T00:01:00.000Z',
      },
    })

    expect(hub.drain('user_1')).toEqual([
      'event: generation.status\ndata: {"recordId":"rec_1","userId":"user_1","status":"provider_processing","modelId":"qwen-image","updatedAt":"2026-06-28T00:00:00.000Z"}\n\n',
    ])
    expect(hub.drain('user_2')).toEqual([
      'event: generation.status\ndata: {"recordId":"rec_2","userId":"user_2","status":"succeeded","modelId":"qwen-image","updatedAt":"2026-06-28T00:01:00.000Z"}\n\n',
    ])
  })

  it('ignores non-generation events', () => {
    const hub = new GenerationSseHub()

    hub.publish({ event: 'notification', data: { message: 'hello' } })

    expect(hub.drain('user_1')).toEqual([])
  })

  it('routes director entity invalidations through the user channel', () => {
    const hub = new GenerationSseHub()
    hub.publish({
      event: 'director.entities.changed',
      data: {
        userId: 'user_1',
        projectId: 'project_1',
        candidateId: 'candidate_1',
        reason: 'candidate_reviewed',
      },
    })

    expect(hub.drain('user_1')).toEqual([
      'event: director.entities.changed\ndata: {"userId":"user_1","projectId":"project_1","candidateId":"candidate_1","reason":"candidate_reviewed"}\n\n',
    ])
  })

  it('ignores generation events without a string userId', () => {
    const hub = new GenerationSseHub()

    hub.publish({
      event: 'generation.status',
      data: {
        recordId: 'rec_missing',
        status: 'provider_processing',
        modelId: 'qwen-image',
        updatedAt: '2026-06-28T00:00:00.000Z',
      },
    } as unknown as BailianStudioSSEEvent)
    hub.publish({
      event: 'generation.status',
      data: {
        recordId: 'rec_number',
        userId: 123,
        status: 'provider_processing',
        modelId: 'qwen-image',
        updatedAt: '2026-06-28T00:00:00.000Z',
      },
    } as unknown as BailianStudioSSEEvent)

    expect(hub.drain('user_1')).toEqual([])
    expect(hub.drain('123')).toEqual([])
  })

  it('returns an independent drained array', () => {
    const hub = new GenerationSseHub()

    hub.publish({
      event: 'generation.status',
      data: {
        recordId: 'rec_1',
        userId: 'user_1',
        status: 'provider_processing',
        modelId: 'qwen-image',
        updatedAt: '2026-06-28T00:00:00.000Z',
      },
    })

    const drained = hub.drain('user_1')
    drained.push('event: mutated\ndata: {}\n\n')

    expect(hub.drain('user_1')).toEqual([])
  })

  it('delivers live events to a subscribed listener without reconnect', () => {
    const hub = new GenerationSseHub()
    const received: string[] = []
    const unsubscribe = hub.subscribe('user_1', chunk => received.push(chunk))

    hub.publish({
      event: 'generation.status',
      data: { recordId: 'rec_1', userId: 'user_1', status: 'succeeded', modelId: 'qwen-image', updatedAt: '2026-06-28T00:00:00.000Z' },
    })

    expect(received).toHaveLength(1)
    expect(received[0]).toContain('event: generation.status')
    expect(received[0]).toContain('"status":"succeeded"')

    // unsubscribe 后再 publish 不应送达。
    unsubscribe()
    hub.publish({
      event: 'generation.status',
      data: { recordId: 'rec_2', userId: 'user_1', status: 'failed', modelId: 'qwen-image', updatedAt: '2026-06-28T00:01:00.000Z' },
    })
    expect(received).toHaveLength(1)
  })

  it('attaches before draining buffered events so setup cannot lose the next event', () => {
    const hub = new GenerationSseHub()
    hub.publish({
      event: 'generation.status',
      data: { recordId: 'rec_buffered', userId: 'user_1', status: 'processing', modelId: 'qwen-image', updatedAt: '2026-06-28T00:00:00.000Z' },
    })
    const received: string[] = []
    const subscription = hub.subscribeAndDrain('user_1', chunk => received.push(chunk))

    expect(subscription.buffered).toHaveLength(1)
    hub.publish({
      event: 'generation.status',
      data: { recordId: 'rec_live', userId: 'user_1', status: 'succeeded', modelId: 'qwen-image', updatedAt: '2026-06-28T00:01:00.000Z' },
    })

    expect(received).toHaveLength(1)
    expect(received[0]).toContain('rec_live')
    expect(hub.drain('user_1')).toEqual([])
    subscription.unsubscribe()
  })

  it('does not buffer events already delivered to live subscribers', () => {
    // 关键不变量：已实时送达的事件绝不再写入缓冲，否则订阅者断线重连后 drain
    // 会把同一事件再发一遍，导致前端重复失效 / 陈旧事件重放。
    const hub = new GenerationSseHub()
    const received: string[] = []
    const unsubscribe = hub.subscribe('user_1', chunk => received.push(chunk))

    hub.publish({
      event: 'generation.status',
      data: { recordId: 'rec_1', userId: 'user_1', status: 'succeeded', modelId: 'qwen-image', updatedAt: '2026-06-28T00:00:00.000Z' },
    })

    expect(received).toHaveLength(1)
    // 订阅者在线时该事件不应进入缓冲——drain 应为空。
    expect(hub.drain('user_1')).toHaveLength(0)

    // 取消订阅后再 publish：此时无在线订阅者，事件应进入缓冲。
    unsubscribe()
    hub.publish({
      event: 'generation.status',
      data: { recordId: 'rec_2', userId: 'user_1', status: 'failed', modelId: 'qwen-image', updatedAt: '2026-06-28T00:02:00.000Z' },
    })
    expect(hub.drain('user_1')).toHaveLength(1)
  })

  it('delivers events only to the matching user channel', () => {
    const hub = new GenerationSseHub()
    const receivedA: string[] = []
    hub.subscribe('user_a', chunk => receivedA.push(chunk))

    hub.publish({
      event: 'generation.status',
      data: { recordId: 'rec_1', userId: 'user_b', status: 'succeeded', modelId: 'qwen-image', updatedAt: '2026-06-28T00:00:00.000Z' },
    })

    expect(receivedA).toEqual([])
  })
})
