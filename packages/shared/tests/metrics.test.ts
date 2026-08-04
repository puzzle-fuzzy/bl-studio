import { describe, expect, it } from 'vitest'
import { MetricsCollector } from '../src'

describe('MetricsCollector', () => {
  it('counts increments per tag signature', () => {
    const metrics = new MetricsCollector()
    metrics.increment('api.request', { status: '200' })
    metrics.increment('api.request', { status: '200' })
    metrics.increment('api.request', { status: '500' })

    const snapshot = metrics.snapshot()
    expect(snapshot.counters['api.request|status=200']).toBe(2)
    expect(snapshot.counters['api.request|status=500']).toBe(1)
  })

  it('aggregates timings into count, sum, min, max', () => {
    const metrics = new MetricsCollector()
    metrics.timing('t', 10)
    metrics.timing('t', 30)
    metrics.timing('t', 20)

    const timer = metrics.snapshot().timers['t|']
    expect(timer).toBeDefined()
    expect(timer?.count).toBe(3)
    expect(timer?.sumMs).toBe(60)
    expect(timer?.minMs).toBe(10)
    expect(timer?.maxMs).toBe(30)
  })

  it('ignores non-finite or negative timings', () => {
    const metrics = new MetricsCollector()
    metrics.timing('t', Number.NaN)
    metrics.timing('t', -5)
    expect(metrics.snapshot().timers['t|']).toBeUndefined()
  })

  it('reset clears all series', () => {
    const metrics = new MetricsCollector()
    metrics.increment('a')
    metrics.timing('b', 1)
    metrics.reset()
    expect(metrics.snapshot().counters).toEqual({})
    expect(metrics.snapshot().timers).toEqual({})
  })
})
