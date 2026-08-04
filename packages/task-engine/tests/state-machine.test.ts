import { describe, expect, it } from 'vitest'
import { transitionTask } from '../src'

describe('transitionTask', () => {
  it('claims a queued task for a worker', () => {
    const now = new Date('2026-06-28T00:00:00.000Z')
    const task = transitionTask({
      id: 'task_1',
      type: 'generation.submit',
      domain: 'generation',
      status: 'queued',
      priority: 0,
      input: { recordId: 'rec_1' },
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: now.toISOString(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    }, { type: 'claim', workerId: 'worker-a', lockedUntil: '2026-06-28T00:00:30.000Z', now: now.toISOString() })

    expect(task.status).toBe('running')
    expect(task.lockedBy).toBe('worker-a')
    expect(task.lockedUntil).toBe('2026-06-28T00:00:30.000Z')
    expect(task.startedAt).toBe(now.toISOString())
    expect(task.completedAt).toBeUndefined()
    expect(task.attempts).toBe(1)
  })

  it('does not claim tasks before nextRunAt', () => {
    const now = new Date('2026-06-28T00:00:00.000Z').toISOString()

    expect(() => transitionTask({
      id: 'task_2',
      type: 'generation.poll',
      domain: 'generation',
      status: 'queued',
      priority: 0,
      input: { recordId: 'rec_1' },
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: '2026-06-28T00:01:00.000Z',
      createdAt: now,
      updatedAt: now,
    }, { type: 'claim', workerId: 'worker-a', lockedUntil: '2026-06-28T00:00:30.000Z', now })).toThrow(/not ready/)
  })

  it('retries a running task while attempts remain', () => {
    const task = transitionTask({
      id: 'task_3',
      type: 'generation.submit',
      domain: 'generation',
      status: 'running',
      priority: 0,
      input: { recordId: 'rec_1' },
      lockedBy: 'worker-a',
      lockedUntil: '2026-06-28T00:00:30.000Z',
      attempts: 1,
      maxAttempts: 3,
      nextRunAt: '2026-06-28T00:00:00.000Z',
      createdAt: '2026-06-28T00:00:00.000Z',
      updatedAt: '2026-06-28T00:00:00.000Z',
    }, {
      type: 'retry',
      error: { category: 'network', message: 'temporary failure', retriable: true },
      nextRunAt: '2026-06-28T00:00:10.000Z',
      now: '2026-06-28T00:00:01.000Z',
    })

    expect(task.status).toBe('queued')
    expect(task.lockedBy).toBeUndefined()
    expect(task.errorJson).toEqual({ category: 'network', message: 'temporary failure', retriable: true })
    expect(task.completedAt).toBeUndefined()
    expect(task.nextRunAt).toBe('2026-06-28T00:00:10.000Z')
  })

  it('fails a running task when retries are exhausted', () => {
    const task = transitionTask({
      id: 'task_4',
      type: 'generation.submit',
      domain: 'generation',
      status: 'running',
      priority: 0,
      input: { recordId: 'rec_1' },
      lockedBy: 'worker-a',
      lockedUntil: '2026-06-28T00:00:30.000Z',
      attempts: 3,
      maxAttempts: 3,
      nextRunAt: '2026-06-28T00:00:00.000Z',
      createdAt: '2026-06-28T00:00:00.000Z',
      updatedAt: '2026-06-28T00:00:00.000Z',
    }, {
      type: 'retry',
      error: { category: 'provider', message: 'provider down', retriable: true },
      nextRunAt: '2026-06-28T00:00:10.000Z',
      now: '2026-06-28T00:00:01.000Z',
    })

    expect(task.status).toBe('failed')
    expect(task.lockedBy).toBeUndefined()
    expect(task.nextRunAt).toBe('2026-06-28T00:00:00.000Z')
  })

  it('fails a running task without rescheduling non-retriable errors', () => {
    const task = transitionTask({
      id: 'task_6',
      type: 'generation.submit',
      domain: 'generation',
      status: 'running',
      priority: 0,
      input: { recordId: 'rec_1' },
      lockedBy: 'worker-a',
      lockedUntil: '2026-06-28T00:00:30.000Z',
      attempts: 1,
      maxAttempts: 3,
      nextRunAt: '2026-06-28T00:00:00.000Z',
      createdAt: '2026-06-28T00:00:00.000Z',
      updatedAt: '2026-06-28T00:00:00.000Z',
    }, {
      type: 'retry',
      error: { category: 'validation', message: 'bad input', retriable: false },
      nextRunAt: '2026-06-28T00:00:10.000Z',
      now: '2026-06-28T00:00:01.000Z',
    })

    expect(task.status).toBe('failed')
    expect(task.lockedBy).toBeUndefined()
    expect(task.errorJson).toEqual({ category: 'validation', message: 'bad input', retriable: false })
    expect(task.nextRunAt).toBe('2026-06-28T00:00:00.000Z')
  })

  it('marks a running task succeeded', () => {
    const task = transitionTask({
      id: 'task_5',
      type: 'artifact.persist',
      domain: 'artifact',
      status: 'running',
      priority: 0,
      input: { recordId: 'rec_1' },
      lockedBy: 'worker-a',
      lockedUntil: '2026-06-28T00:00:30.000Z',
      attempts: 1,
      maxAttempts: 3,
      nextRunAt: '2026-06-28T00:00:00.000Z',
      createdAt: '2026-06-28T00:00:00.000Z',
      updatedAt: '2026-06-28T00:00:00.000Z',
    }, { type: 'succeed', output: { artifactCount: 1 }, now: '2026-06-28T00:00:02.000Z' })

    expect(task.status).toBe('succeeded')
    expect(task.output).toEqual({ artifactCount: 1 })
    expect(task.completedAt).toBe('2026-06-28T00:00:02.000Z')
    expect(task.lockedBy).toBeUndefined()
  })

  it('cancels a queued task and clears lock fields', () => {
    const task = transitionTask({
      id: 'task_7',
      type: 'generation.submit',
      domain: 'generation',
      status: 'queued',
      priority: 0,
      input: { recordId: 'rec_1' },
      lockedBy: 'worker-a',
      lockedUntil: '2026-06-28T00:00:30.000Z',
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: '2026-06-28T00:00:00.000Z',
      createdAt: '2026-06-28T00:00:00.000Z',
      updatedAt: '2026-06-28T00:00:00.000Z',
    }, {
      type: 'cancel',
      error: { category: 'cancelled', message: 'user cancelled', retriable: false },
      now: '2026-06-28T00:00:01.000Z',
    })

    expect(task.status).toBe('cancelled')
    expect(task.lockedBy).toBeUndefined()
    expect(task.lockedUntil).toBeUndefined()
    expect(task.errorJson).toEqual({ category: 'cancelled', message: 'user cancelled', retriable: false })
  })

  it('cancels a running task and clears lock fields', () => {
    const task = transitionTask({
      id: 'task_8',
      type: 'generation.submit',
      domain: 'generation',
      status: 'running',
      priority: 0,
      input: { recordId: 'rec_1' },
      lockedBy: 'worker-a',
      lockedUntil: '2026-06-28T00:00:30.000Z',
      attempts: 1,
      maxAttempts: 3,
      nextRunAt: '2026-06-28T00:00:00.000Z',
      createdAt: '2026-06-28T00:00:00.000Z',
      updatedAt: '2026-06-28T00:00:00.000Z',
    }, { type: 'cancel', now: '2026-06-28T00:00:01.000Z' })

    expect(task.status).toBe('cancelled')
    expect(task.lockedBy).toBeUndefined()
    expect(task.lockedUntil).toBeUndefined()
  })

  it('does not cancel terminal tasks', () => {
    for (const status of ['succeeded', 'failed', 'cancelled'] as const) {
      expect(() => transitionTask({
        id: `task_${status}`,
        type: 'generation.submit',
        domain: 'generation',
        status,
        priority: 0,
        input: { recordId: 'rec_1' },
        attempts: 1,
        maxAttempts: 3,
        nextRunAt: '2026-06-28T00:00:00.000Z',
        createdAt: '2026-06-28T00:00:00.000Z',
        updatedAt: '2026-06-28T00:00:00.000Z',
      }, { type: 'cancel', now: '2026-06-28T00:00:01.000Z' })).toThrow(/cannot cancel/)
    }
  })

  it('rejects task records with mismatched type and domain', () => {
    expect(() => transitionTask({
      id: 'task_9',
      type: 'artifact.persist',
      domain: 'generation',
      status: 'running',
      priority: 0,
      input: { recordId: 'rec_1' },
      lockedBy: 'worker-a',
      lockedUntil: '2026-06-28T00:00:30.000Z',
      attempts: 1,
      maxAttempts: 3,
      nextRunAt: '2026-06-28T00:00:00.000Z',
      createdAt: '2026-06-28T00:00:00.000Z',
      updatedAt: '2026-06-28T00:00:00.000Z',
    }, { type: 'succeed', output: { artifactCount: 1 }, now: '2026-06-28T00:00:02.000Z' })).toThrow(/domain/)
  })

  it('allows media.process tasks to use the media domain', () => {
    const now = '2026-07-09T00:00:00.000Z'
    const task = transitionTask({
      id: 'task_media_1',
      type: 'media.process',
      domain: 'media',
      status: 'queued',
      priority: 0,
      input: { jobId: 'media_job_1' },
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
    }, {
      type: 'claim',
      workerId: 'worker-a',
      lockedUntil: '2026-07-09T00:00:30.000Z',
      now,
    })

    expect(task.status).toBe('running')
    expect(task.domain).toBe('media')
    expect(task.attempts).toBe(1)
  })

  it('rejects media.process tasks outside the media domain', () => {
    const now = '2026-07-09T00:00:00.000Z'
    expect(() => transitionTask({
      id: 'task_media_2',
      type: 'media.process',
      domain: 'artifact',
      status: 'queued',
      priority: 0,
      input: { jobId: 'media_job_1' },
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
    }, {
      type: 'claim',
      workerId: 'worker-a',
      lockedUntil: '2026-07-09T00:00:30.000Z',
      now,
    })).toThrow('task type media.process must use domain media')
  })

  it('allows media.thumbnail tasks only in the media domain', () => {
    const now = '2026-07-09T00:00:00.000Z'
    const base = {
      id: 'task_thumbnail_1',
      type: 'media.thumbnail' as const,
      status: 'queued' as const,
      priority: -5,
      input: { derivativeId: 'asset_derivative_1' },
      attempts: 0,
      maxAttempts: 3,
      nextRunAt: now,
      createdAt: now,
      updatedAt: now,
    }

    expect(transitionTask({ ...base, domain: 'media' }, {
      type: 'claim',
      workerId: 'worker-a',
      lockedUntil: '2026-07-09T00:00:30.000Z',
      now,
    })).toMatchObject({ status: 'running', attempts: 1 })
    expect(() => transitionTask({ ...base, domain: 'artifact' }, {
      type: 'claim',
      workerId: 'worker-a',
      lockedUntil: '2026-07-09T00:00:30.000Z',
      now,
    })).toThrow('task type media.thumbnail must use domain media')
  })
})
