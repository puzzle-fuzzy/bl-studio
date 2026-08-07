import { describe, expect, it } from 'vitest'
import { processArtifactPersistTask } from '../src/artifact-task-handler'
import { MetricsCollector } from '@bailian-studio/shared'
import {
  createRecordingLogger,
  FakeRepository,
  FakeStorageAdapter,
  makeArtifact,
  makeTask,
} from './fixtures'

describe('artifact task handler boundary', () => {
  it('maps unexpected persistence exceptions to a stable storage error', async () => {
    const repository = new FakeRepository()
    repository.listPendingArtifactsForRecord = () => Promise.reject(new Error('database unavailable'))
    const logger = createRecordingLogger()
    const metrics = new MetricsCollector()

    const outcome = await processArtifactPersistTask('rec_1', makeTask({
      type: 'artifact.persist',
      domain: 'artifact',
      input: { recordId: 'rec_1' },
    }), {
      repository,
      storage: new FakeStorageAdapter(),
      logger,
      metrics,
      maxDurationMs: Number.MAX_SAFE_INTEGER,
    })

    expect(outcome).toEqual({
      status: 'failed',
      error: {
        category: 'storage',
        message: 'database unavailable',
        retriable: false,
        code: 'ARTIFACT_PERSIST_FAILED',
      },
    })
    expect(logger.entries.some(({ message }) => message === 'artifact.persist.failed')).toBe(true)
    expect(metrics.snapshot().counters['worker.artifact_persist|code=ARTIFACT_PERSIST_FAILED,status=failed']).toBe(1)
    expect(metrics.snapshot().counters['worker.artifact_failure|code=ARTIFACT_PERSIST_FAILED,retriable=false']).toBe(1)
  })

  it('retries retriable storage failures while attempts remain', async () => {
    const repository = new FakeRepository()
    const artifact = makeArtifact({ id: 'art_1', kind: 'text', text: 'hello' })
    repository.artifacts.set(artifact.id, artifact)
    repository.listPendingArtifactsForRecord = () => Promise.resolve([artifact])
    const storage = new FakeStorageAdapter()
    storage.throwError = new Error('upload to OSS failed: HTTP 500')
    const logger = createRecordingLogger()
    const metrics = new MetricsCollector()

    const outcome = await processArtifactPersistTask('rec_1', makeTask({
      type: 'artifact.persist',
      domain: 'artifact',
      input: { recordId: 'rec_1' },
      attempts: 1,
      maxAttempts: 3,
    }), {
      repository,
      storage,
      logger,
      metrics,
      maxDurationMs: Number.MAX_SAFE_INTEGER,
    })

    expect(outcome.status).toBe('retry')
    if (outcome.status === 'retry') {
      expect(outcome.error.retriable).toBe(true)
      expect(outcome.error.code).toBe('ARTIFACT_PERSIST_FAILED')
      expect(Date.parse(outcome.nextRunAt)).toBeGreaterThan(Date.now())
    }
    expect(repository.mutations.some(m => m.kind === 'markArtifactFailed')).toBe(true)
    expect(metrics.snapshot().counters['worker.artifact_persist|code=ARTIFACT_PERSIST_FAILED,status=retrying']).toBe(1)
    expect(metrics.snapshot().counters['worker.artifact_failure|code=ARTIFACT_PERSIST_FAILED,retriable=true']).toBe(1)
  })

  it('fails retriable storage errors once attempts are exhausted', async () => {
    const repository = new FakeRepository()
    const artifact = makeArtifact({ id: 'art_1', kind: 'text', text: 'hello' })
    repository.artifacts.set(artifact.id, artifact)
    repository.listPendingArtifactsForRecord = () => Promise.resolve([artifact])
    const storage = new FakeStorageAdapter()
    storage.throwError = new Error('upload to OSS failed: HTTP 500')
    const logger = createRecordingLogger()

    const outcome = await processArtifactPersistTask('rec_1', makeTask({
      type: 'artifact.persist',
      domain: 'artifact',
      input: { recordId: 'rec_1' },
      attempts: 3,
      maxAttempts: 3,
    }), {
      repository,
      storage,
      logger,
      metrics: new MetricsCollector(),
      maxDurationMs: Number.MAX_SAFE_INTEGER,
    })

    expect(outcome).toEqual({
      status: 'failed',
      error: {
        category: 'storage',
        message: 'upload to OSS failed: HTTP 500',
        retriable: true,
        code: 'ARTIFACT_PERSIST_FAILED',
      },
    })
  })
})
