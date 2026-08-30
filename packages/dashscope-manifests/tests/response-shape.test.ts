import { describe, expect, it } from 'vitest'
import { assertResponseShape } from '../src'
import { getModelById } from '../src'

const keling = getModelById('keling-text-to-video')
if (keling === undefined) throw new Error('keling-text-to-video fixture model is missing')
const wanx = getModelById('wanx-text-to-video')
if (wanx === undefined) throw new Error('wanx-text-to-video fixture model is missing')
const screenplay = getModelById('qwen-omni-screenplay')
if (screenplay === undefined) throw new Error('qwen-omni-screenplay fixture model is missing')
const qwenPlus = getModelById('qwen-plus')
if (qwenPlus === undefined) throw new Error('qwen-plus fixture model is missing')

describe('assertResponseShape — async submit', () => {
  it('accepts a well-formed async submit response', () => {
    expect(assertResponseShape(keling, 'submit', {
      output: { task_id: 'task-keling', task_status: 'PENDING' },
      request_id: 'request-keling',
    })).toEqual([])
  })

  it('rejects an async submit response missing request_id', () => {
    expect(assertResponseShape(keling, 'submit', {
      output: { task_id: 'task-keling', task_status: 'PENDING' },
    })).toMatchObject([{ path: '/request_id' }])
  })

  it('rejects an async submit response missing the task id', () => {
    expect(assertResponseShape(keling, 'submit', {
      output: { task_status: 'PENDING' },
      request_id: 'request-keling',
    })).toMatchObject([{ path: '/output/task_id' }])
  })
})

describe('assertResponseShape — async poll', () => {
  it('accepts recognized pending and terminal statuses', () => {
    expect(assertResponseShape(wanx, 'poll', {
      output: { task_id: 't', task_status: 'PENDING' },
      request_id: 'r',
    })).toEqual([])
    expect(assertResponseShape(wanx, 'poll', {
      output: { task_id: 't', task_status: 'RUNNING' },
      request_id: 'r',
    })).toEqual([])
    expect(assertResponseShape(wanx, 'poll', {
      output: { task_id: 't', task_status: 'FAILED' },
      request_id: 'r',
    })).toEqual([])
  })

  it('rejects an unrecognized task status as contract drift', () => {
    expect(assertResponseShape(wanx, 'poll', {
      output: { task_id: 'task-unknown', task_status: 'MYSTERY' },
      request_id: 'request-unknown',
    })).toMatchObject([{ path: '/output/task_status' }])
  })

  it('rejects a poll response missing the task status', () => {
    expect(assertResponseShape(wanx, 'poll', {
      output: { task_id: 'task-missing', video_url: 'https://cdn.example.com/movie.mp4' },
      request_id: 'request-missing',
    })).toMatchObject([{ path: '/output/task_status' }])
  })

  it('is lenient about unknown extra fields', () => {
    expect(assertResponseShape(wanx, 'poll', {
      output: { task_id: 't', task_status: 'PENDING', surprise: { nested: [1, 2] } },
      request_id: 'r',
      extra_top_level: 'accepted',
    })).toEqual([])
  })
})

describe('assertResponseShape — final', () => {
  it('accepts a succeeded final response with the output artifact', () => {
    expect(assertResponseShape(keling, 'final', {
      request_id: 'request-final',
      output: {
        task_id: 'task-keling',
        task_status: 'SUCCEEDED',
        video_url: 'https://example.com/generated.mp4',
      },
      usage: { duration: 5 },
    })).toEqual([])
  })

  it('rejects a final response whose status is not a succeeded state', () => {
    expect(assertResponseShape(keling, 'final', {
      request_id: 'r',
      output: { task_id: 't', task_status: 'FAILED', video_url: 'https://x/y.mp4' },
    })).toMatchObject([{ path: '/output/task_status' }])
  })

  it('rejects a final response missing the mapped output artifact', () => {
    expect(assertResponseShape(keling, 'final', {
      request_id: 'r',
      output: { task_id: 't', task_status: 'SUCCEEDED' },
    })).toMatchObject([{ path: 'output.video_url' }])
  })
})

describe('assertResponseShape — sync final', () => {
  it('validates the output artifact for sync models without polling checks', () => {
    const qwenImage = getModelById('qwen-image')
    expect(qwenImage).toBeDefined()
    expect(assertResponseShape(qwenImage!, 'final', {
      output: { choices: [{ message: { content: [{ image: 'https://x/y.png' }] } }] },
      request_id: 'req-sync-456',
    })).toEqual([])
    expect(assertResponseShape(qwenImage!, 'final', {
      request_id: 'req-sync-456',
    })).toMatchObject([{ path: 'output.choices' }])
  })

  it('accepts the native Qwen text-generation output.text response', () => {
    expect(assertResponseShape(qwenPlus, 'final', {
      output: { text: '{"summary":"ok"}' },
      request_id: 'req-qwen-text',
    })).toEqual([])
    expect(assertResponseShape(qwenPlus, 'final', {
      output: { choices: [{ message: { content: 'ok' } }] },
      request_id: 'req-qwen-text',
    })).toMatchObject([{ path: 'output.text' }])
  })
})

describe('assertResponseShape — stream event', () => {
  it('accepts a well-formed chat completion chunk', () => {
    expect(assertResponseShape(screenplay, 'stream-event', {
      id: 'chunk-1',
      object: 'chat.completion.chunk',
      model: 'qwen3.5-omni-plus',
      choices: [{ index: 0, delta: { content: 'ok' }, finish_reason: null }],
      usage: null,
    })).toEqual([])
  })

  it('rejects a stream event missing chunk metadata', () => {
    expect(assertResponseShape(screenplay, 'stream-event', {
      choices: [{ delta: { content: 'missing metadata' } }],
    })).toEqual([
      expect.objectContaining({ path: '/id' }),
      expect.objectContaining({ path: '/object' }),
    ])
  })
})

describe('assertResponseShape — error phase', () => {
  it('is lenient for record-shaped error responses but reports non-record bodies', () => {
    expect(assertResponseShape(keling, 'error', { code: 'BadRequest', message: 'invalid' })).toEqual([])
    expect(assertResponseShape(keling, 'error', '<html>502</html>')).toMatchObject([{ path: '/' }])
    expect(assertResponseShape(keling, 'error', undefined)).toMatchObject([{ path: '/' }])
  })
})
