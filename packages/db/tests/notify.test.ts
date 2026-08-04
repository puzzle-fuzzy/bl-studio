import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import postgres from 'postgres'
import { createNotificationListener } from '../src'
import { createIsolatedTestDb } from '../src/test-utils'

let dbUrl = ''
let adminCleanup: (() => Promise<void>) | undefined

beforeAll(async () => {
  const iso = await createIsolatedTestDb()
  dbUrl = iso.url
  adminCleanup = iso.close
})

afterAll(async () => {
  await adminCleanup?.()
})

describe('createNotificationListener', () => {
  it('receives NOTIFY payloads on the listened channel', async () => {
    const received: string[] = []
    const listener = await createNotificationListener({
      connectionString: dbUrl,
      channel: 'test_channel',
      onNotification: payload => { received.push(payload) },
    })
    try {
      const sender = postgres(dbUrl, { max: 1 })
      await sender`NOTIFY test_channel, 'hello'`
      await sender`NOTIFY test_channel, 'world'`
      await waitUntil(() => received.length >= 2, 2000)
      await sender.end()

      expect(received).toContain('hello')
      expect(received).toContain('world')
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
