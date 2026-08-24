import { describe, expect, it } from 'vitest'
import type { RecordAuditEventInput } from '@bailian-studio/generation-repository'
import { beginRequestTrace } from '../src/lib/middleware'
import { recordApiAuditEvent } from '../src/lib/audit'

describe('API audit events', () => {
  it('stores only a pathname and bounded non-sensitive metadata', async () => {
    let received: RecordAuditEventInput | undefined
    const request = new Request('http://localhost/api/generations?prompt=do-not-store', {
      method: 'POST',
      headers: { 'x-request-id': 'audit-request-1', 'x-trace-id': 'audit-trace-1' },
    })
    beginRequestTrace(request)

    await recordApiAuditEvent({
      recordAuditEvent: async input => {
        received = input
        return undefined as never
      },
    }, request, {
      action: 'generation.create',
      outcome: 'succeeded',
      metadata: {
        modelId: 'qwen-image',
        prompt: 'must-not-be-persisted',
        longValue: 'x'.repeat(400),
      },
    })

    expect(received).toMatchObject({
      action: 'generation.create',
      outcome: 'succeeded',
      requestId: 'audit-request-1',
      traceId: 'audit-trace-1',
      method: 'POST',
      path: '/api/generations',
      metadata: { modelId: 'qwen-image' },
    })
    expect(received?.metadata?.['prompt']).toBeUndefined()
    expect(received?.metadata?.['longValue']).toHaveLength(256)
  })

  it('does not fail the business path when audit persistence fails', async () => {
    await expect(recordApiAuditEvent({
      recordAuditEvent: async () => {
        throw new Error('database connection detail must not escape')
      },
    }, new Request('http://localhost/api/auth/login', { method: 'POST' }), {
      action: 'auth.login',
      outcome: 'failed',
      metadata: { errorCode: 'AUTH_INVALID_CREDENTIALS' },
    })).resolves.toBeUndefined()
  })
})
