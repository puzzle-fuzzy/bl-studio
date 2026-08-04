import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { StorageAdapter, StorageReadUrlInput, StorageWriteInput, StorageWriteResult } from '@bailian-studio/storage'
import { createIsolatedGenerationRepository, type IsolatedGenerationRepository } from '@bailian-studio/generation-repository'
import { createTestApp } from '../src/test-app'

class ReadyStorage implements StorageAdapter {
  readonly provider = 'local' as const
  readonly keyPrefix = ''

  writeObject(_input: StorageWriteInput): Promise<StorageWriteResult> {
    return Promise.reject(new Error('not used'))
  }

  createReadUrl(_input: StorageReadUrlInput): Promise<string> {
    return Promise.resolve('/api/artifacts/local/health/ready')
  }
}

class BrokenStorage extends ReadyStorage {
  override createReadUrl(_input: StorageReadUrlInput): Promise<string> {
    return Promise.reject(new Error('storage unavailable'))
  }
}

class ProbedStorage extends ReadyStorage {
  healthChecks = 0

  healthCheck(): Promise<void> {
    this.healthChecks += 1
    return Promise.resolve()
  }

  override createReadUrl(_input: StorageReadUrlInput): Promise<string> {
    return Promise.reject(new Error('signature generation should not be used for readiness'))
  }
}

let isolated!: IsolatedGenerationRepository
let app: ReturnType<typeof createTestApp>['app']

beforeAll(async () => {
  isolated = await createIsolatedGenerationRepository({ max: 1 })
})

beforeEach(async () => {
  app = createTestApp({ generationRepository: isolated.repository, storage: new ReadyStorage() }).app
  if (isolated.repository.registerWorkerHeartbeat === undefined) {
    throw new Error('test repository does not expose worker heartbeat registration')
  }
  const now = new Date().toISOString()
  await isolated.repository.registerWorkerHeartbeat({
    workerId: 'health-test-worker',
    startedAt: now,
    now,
  })
})

afterAll(async () => {
  await isolated.close()
})

describe('health routes', () => {
  it('returns live without touching dependencies and ready after DB/storage probes', async () => {
    const live = await app.handle(new Request('http://localhost/api/health/live'))
    expect(live.status).toBe(200)
    expect(await live.json()).toEqual({ success: true, data: { status: 'ok' } })

    const ready = await app.handle(new Request('http://localhost/api/health/ready'))
    expect(ready.status).toBe(200)
    expect(await ready.json()).toEqual({
      success: true,
      data: { status: 'ok', checks: { database: 'ok', storage: 'ok', worker: 'ok' } },
    })
  })

  it('returns 503 when storage cannot produce a read URL', async () => {
    app = createTestApp({ generationRepository: isolated.repository, storage: new BrokenStorage() }).app

    const response = await app.handle(new Request('http://localhost/api/health/ready'))
    const body = await response.json() as { success: false; data: { status: string; checks: { database: string; storage: string; worker: string } } }
    expect(response.status).toBe(503)
    expect(body.success).toBe(false)
    expect(body.data.status).toBe('not_ready')
    expect(body.data.checks).toEqual({ database: 'ok', storage: 'failed', worker: 'ok' })
  })

  it('uses the adapter health probe instead of treating URL signing as storage readiness', async () => {
    const storage = new ProbedStorage()
    app = createTestApp({ generationRepository: isolated.repository, storage }).app

    const response = await app.handle(new Request('http://localhost/api/health/ready'))
    expect(response.status).toBe(200)
    expect(storage.healthChecks).toBe(1)
    expect(await response.json()).toMatchObject({ success: true, data: { checks: { storage: 'ok' } } })
  })

  it('returns degraded when the API and storage are ready but workers are not consuming', async () => {
    if (isolated.repository.stopWorkerHeartbeat === undefined) {
      throw new Error('test repository does not expose worker heartbeat stopping')
    }
    await isolated.repository.stopWorkerHeartbeat('health-test-worker', new Date().toISOString())

    const response = await app.handle(new Request('http://localhost/api/health/ready'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      success: true,
      data: {
        status: 'degraded',
        checks: { database: 'ok', storage: 'ok', worker: 'failed' },
      },
    })
  })
})
