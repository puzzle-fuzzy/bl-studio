import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  createGenerationEventListener,
  createIsolatedGenerationRepository,
  createTestUser,
  ensureGenerationEventsTrigger,
  grantTestCredits,
  type GenerationEventNotification,
  type IsolatedGenerationRepository,
} from '../src'

let iso: IsolatedGenerationRepository

beforeAll(async () => {
  iso = await createIsolatedGenerationRepository()
  await ensureGenerationEventsTrigger(iso.databaseUrl)
  // 创建测试用户以满足外键约束
  await createTestUser(iso.databaseUrl, 'user_listen')
  await grantTestCredits(iso.db, 'user_listen', 100, 'event listener test seed')
})

afterAll(async () => {
  await iso.close()
})

describe('createGenerationEventListener', () => {
  it('fires onEvent with parsed fields when a record changes status', async () => {
    const created = await iso.repository.createGeneration({
      userId: 'user_listen',
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })

    const events: GenerationEventNotification[] = []
    const listener = await createGenerationEventListener({
      connectionString: iso.databaseUrl,
      onEvent: event => { events.push(event) },
    })

    try {
      await iso.repository.markGenerationProcessing({ recordId: created.record.id })
      await waitUntil(() => events.length >= 1, 2000)

      expect(events[0]).toMatchObject({
        id: expect.stringMatching(/^generation_event_/),
        recordId: created.record.id,
        userId: 'user_listen',
        status: 'processing',
      })
      expect(events[0]?.createdAt).toEqual(expect.any(String))
      const persisted = await iso.repository.listGenerationEvents({ userId: 'user_listen' })
      expect(persisted.map(event => event.status)).toEqual(['submitting', 'processing'])
    } finally {
      await listener.close()
    }
  })
})

function waitUntil(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      if (predicate()) {
        resolve()
        return
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error('waitUntil timed out'))
        return
      }
      setTimeout(tick, 20)
    }
    tick()
  })
}
