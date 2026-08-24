import { describe, expect, it } from 'vitest'
import {
  classifyQueueHealth,
  readQueueHealth,
  parseQueueOpsArgs,
  runRetention,
  type QueueHealthSnapshot,
} from './queue-ops'

const NOW = '2026-07-24T12:00:00.000Z'

function snapshot(overrides: Partial<QueueHealthSnapshot> = {}): QueueHealthSnapshot {
  return {
    generatedAt: NOW,
    queuedCount: 0,
    runningCount: 0,
    staleRunningCount: 0,
    billingAnomalyCount: 0,
    staleReservationCount: 0,
    artifactFailureCount: 0,
    creditReconciliationViolationCount: 0,
    oldestQueuedAt: undefined,
    latestEventAt: NOW,
    eventLagMs: 0,
    ...overrides,
  }
}

describe('queue operations', () => {
  it('parses safe dry-run retention defaults and explicit apply policy', () => {
    expect(parseQueueOpsArgs(['retention'])).toEqual({
      command: 'retention',
      apply: false,
      taskRetentionDays: 30,
      eventRetentionDays: 8,
      batchSize: 500,
    })
    expect(parseQueueOpsArgs([
      'retention',
      '--apply',
      '--task-days', '45',
      '--event-days', '12',
      '--batch-size', '1000',
    ])).toEqual({
      command: 'retention',
      apply: true,
      taskRetentionDays: 45,
      eventRetentionDays: 12,
      batchSize: 1000,
    })
  })

  it('rejects unsafe retention values and unknown commands', () => {
    expect(() => parseQueueOpsArgs(['retention', '--task-days', '0'])).toThrow()
    expect(() => parseQueueOpsArgs(['retention', '--batch-size', '10001'])).toThrow()
    expect(() => parseQueueOpsArgs(['purge'])).toThrow()
  })

  it('classifies stale workers and queue age as critical', () => {
    const result = classifyQueueHealth(snapshot({
      queuedCount: 3,
      runningCount: 2,
      staleRunningCount: 1,
      oldestQueuedAt: '2026-07-24T11:40:00.000Z',
      eventLagMs: 6 * 60 * 1000,
    }))

    expect(result.status).toBe('critical')
    expect(result.reasons).toEqual(expect.arrayContaining([
      'stale running tasks detected',
      'oldest queued task exceeds critical threshold',
      'event outbox lag exceeds critical threshold',
    ]))
  })

  it('classifies a short queue delay as warning without false positives', () => {
    const result = classifyQueueHealth(snapshot({
      queuedCount: 1,
      oldestQueuedAt: '2026-07-24T11:54:00.000Z',
      eventLagMs: 90 * 1000,
    }))

    expect(result.status).toBe('warning')
    expect(result.reasons).toEqual(expect.arrayContaining([
      'oldest queued task exceeds warning threshold',
      'event outbox lag exceeds warning threshold',
    ]))
  })

  it('classifies billing and artifact signals as warning and credit drift as critical', () => {
    const warning = classifyQueueHealth(snapshot({ billingAnomalyCount: 1, artifactFailureCount: 2 }))
    expect(warning.status).toBe('warning')
    expect(warning.reasons).toEqual(expect.arrayContaining([
      'billing anomalies detected',
      'artifact persistence failures detected',
    ]))

    const critical = classifyQueueHealth(snapshot({ staleReservationCount: 1, creditReconciliationViolationCount: 1 }))
    expect(critical.status).toBe('critical')
    expect(critical.reasons).toEqual(expect.arrayContaining([
      'stale credit reservations detected',
      'credit reconciliation violations detected',
    ]))
  })

  it('reads durable queue counts and calculates event lag from database rows', async () => {
    const db = {
      unsafe: async <T extends Record<string, unknown>>(query: string): Promise<readonly T[]> => {
        if (query.includes('from task_records')) {
          return [{
            queued_count: 4,
            running_count: 2,
            stale_running_count: 1,
            oldest_queued_at: '2026-07-24T11:50:00.000Z',
          }] as unknown as T[]
        }
        if (query.includes('latest_event_at')) return [{ latest_event_at: '2026-07-24T11:58:00.000Z' }] as unknown as T[]
        if (query.includes('billing_anomaly_count')) return [{ billing_anomaly_count: 1 }] as unknown as T[]
        if (query.includes('stale_reservation_count')) return [{ stale_reservation_count: 2 }] as unknown as T[]
        if (query.includes('artifact_failure_count')) return [{ artifact_failure_count: 3 }] as unknown as T[]
        return [{ credit_reconciliation_violation_count: 4 }] as unknown as T[]
      },
    }

    await expect(readQueueHealth(db, new Date(NOW))).resolves.toEqual({
      generatedAt: NOW,
      queuedCount: 4,
      runningCount: 2,
      staleRunningCount: 1,
      billingAnomalyCount: 1,
      staleReservationCount: 2,
      artifactFailureCount: 3,
      creditReconciliationViolationCount: 4,
      oldestQueuedAt: '2026-07-24T11:50:00.000Z',
      latestEventAt: '2026-07-24T11:58:00.000Z',
      eventLagMs: 120_000,
    })
  })

  it('keeps retention dry-run read-only and deletes in bounded batches only with apply', async () => {
    const dryRunQueries: string[] = []
    const dryRunDb = {
      unsafe: async <T extends Record<string, unknown>>(query: string): Promise<readonly T[]> => {
        dryRunQueries.push(query)
        return query.includes('task_records') ? [{ count: 3 }] as unknown as T[] : [{ count: 5 }] as unknown as T[]
      },
    }
    await expect(runRetention(dryRunDb, {
      command: 'retention', apply: false, taskRetentionDays: 30, eventRetentionDays: 8, batchSize: 2,
    }, new Date(NOW))).resolves.toMatchObject({ apply: false, taskRows: 3, eventRows: 5 })
    expect(dryRunQueries.every(query => !query.includes('delete from'))).toBe(true)

    const applyCalls: string[] = []
    const batches = { tasks: 0, events: 0 }
    const applyDb = {
      unsafe: async <T extends Record<string, unknown>>(query: string): Promise<readonly T[]> => {
        applyCalls.push(query)
        if (query.includes('delete from task_records')) {
          batches.tasks += 1
          return (batches.tasks === 1 ? [{ id: 'task_1' }, { id: 'task_2' }] : []) as unknown as T[]
        }
        batches.events += 1
        return (batches.events === 1 ? [{ id: 'event_1' }] : []) as unknown as T[]
      },
    }
    await expect(runRetention(applyDb, {
      command: 'retention', apply: true, taskRetentionDays: 30, eventRetentionDays: 8, batchSize: 2,
    }, new Date(NOW))).resolves.toMatchObject({ apply: true, taskRows: 2, eventRows: 1 })
    expect(applyCalls.filter(query => query.includes('delete from task_records'))).toHaveLength(2)
    expect(applyCalls.filter(query => query.includes('delete from generation_events'))).toHaveLength(1)
  })
})
