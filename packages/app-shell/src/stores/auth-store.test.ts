import { describe, expect, it } from 'vitest'
import { registerPrivateDataReset, resetAllPrivateData } from './auth-store'

describe('private data reset registry (R2-P1-12)', () => {
  it('runs every registered reset callback', async () => {
    const cleared: string[] = []
    registerPrivateDataReset(() => { cleared.push('a') })
    registerPrivateDataReset(() => { cleared.push('b') })
    await resetAllPrivateData()
    expect(cleared).toEqual(['a', 'b'])
  })

  it('keeps running the other resets when one callback rejects (allSettled)', async () => {
    registerPrivateDataReset(() => Promise.reject(new Error('cleanup boom')))
    const cleared: string[] = []
    registerPrivateDataReset(() => { cleared.push('x') })
    await expect(resetAllPrivateData()).resolves.toBeUndefined()
    expect(cleared).toEqual(['x'])
  })
})
