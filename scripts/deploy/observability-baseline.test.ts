import { describe, expect, it } from 'vitest'
import { summarizeCanvasObservability } from './observability-baseline'

function log(value: Record<string, unknown>): string {
  return JSON.stringify(value)
}

describe('summarizeCanvasObservability', () => {
  it('summarizes Canvas executions, node failures, cache samples and duration percentiles', () => {
    const response = {
      data: {
        result: [{
          stream: { container: 'worker' },
          values: [
            ['1', log({ msg: 'task.duration', taskType: 'canvas.execute', outcome: 'succeeded', durationMs: 100 })],
            ['2', log({ msg: 'task.duration', taskType: 'canvas.execute', outcome: 'cancelled', durationMs: 300 })],
            ['3', log({ msg: 'task.duration', taskType: 'canvas.execute', outcome: 'failed', durationMs: 500 })],
            ['4', log({ msg: 'task.duration', taskType: 'canvas.execute', outcome: 'succeeded', durationMs: 900 })],
            ['5', log({ msg: 'task.duration', taskType: 'generation.submit', outcome: 'failed', durationMs: 10 })],
            ['6', log({ msg: 'canvas.node_failed', errorCode: 'CANVAS_NODE_TIMEOUT' })],
            ['7', log({ msg: 'canvas.node_failed', errorCode: 'CANVAS_NODE_TIMEOUT' })],
            ['8', log({ msg: 'canvas.node_failed' })],
            ['9', log({ msg: 'canvas.node_generation_queued', cacheHit: true })],
            ['10', log({ msg: 'canvas.node_generation_queued', cacheHit: false })],
            ['11', log({ msg: 'canvas.node_generation_queued', cacheHit: true })],
            ['12', 'not-json'],
          ],
        }],
      },
    }

    expect(summarizeCanvasObservability(response, { windowHours: 24, collectedAt: '2026-08-30T00:00:00.000Z' })).toEqual({
      schemaVersion: 1,
      windowHours: 24,
      collectedAt: '2026-08-30T00:00:00.000Z',
      hasCanvasData: true,
      execution: {
        total: 4,
        outcomeCounts: { succeeded: 2, cancelled: 1, failed: 1 },
        failureRate: 0.25,
        cancelledRate: 0.25,
      },
      nodes: {
        failed: 3,
        generationQueued: 3,
        cacheHits: 2,
        cacheMisses: 1,
        cacheHitRate: 2 / 3,
        errorCodes: [
          { code: 'CANVAS_NODE_TIMEOUT', count: 2 },
          { code: 'UNKNOWN', count: 1 },
        ],
      },
      durationMs: {
        count: 4,
        p50: 300,
        p95: 900,
        p99: 900,
        max: 900,
      },
    })
  })

  it('keeps empty windows explicit instead of turning missing data into zero health', () => {
    expect(summarizeCanvasObservability({ data: { result: [] } }, { windowHours: 72 })).toMatchObject({
      hasCanvasData: false,
      execution: { total: 0, failureRate: null, cancelledRate: null },
      nodes: { failed: 0, generationQueued: 0, cacheHitRate: null, errorCodes: [] },
      durationMs: { count: 0, p50: null, p95: null, p99: null, max: null },
    })
  })
})
