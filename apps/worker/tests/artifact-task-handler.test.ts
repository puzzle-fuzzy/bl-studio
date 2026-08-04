import { describe, expect, it } from 'vitest'
import { processArtifactPersistTask } from '../src/artifact-task-handler'
import { MetricsCollector } from '@bailian-studio/shared'
import {
  createRecordingLogger,
  FakeRepository,
  FakeStorageAdapter,
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
})
