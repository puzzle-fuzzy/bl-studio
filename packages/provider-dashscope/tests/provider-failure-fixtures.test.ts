import { describe, expect, it } from 'vitest'
import {
  getModelById,
  qwenImage,
  wanxTextToVideo,
} from '@bailian-studio/model-core'
import {
  createDashScopeClient,
  type DashScopeFetch,
} from '../src'
import { PROVIDER_FAILURE_FIXTURES, type ProviderFailureFixture } from './fixtures/provider-failure-fixtures'

function createFixtureFetch(fixture: ProviderFailureFixture): DashScopeFetch {
  return (async () => Response.json(fixture.body, { status: fixture.status })) as unknown as DashScopeFetch
}

async function executeFixture(fixture: ProviderFailureFixture): Promise<unknown> {
  const client = createDashScopeClient({
    apiKey: 'fixture-key',
    workspaceId: 'ws-fixture',
    fetch: createFixtureFetch(fixture),
  })

  switch (fixture.operation) {
    case 'submit':
      return client.submit({ manifest: qwenImage, params: { prompt: 'fixture prompt' } })
    case 'poll':
      return client.poll({ manifest: wanxTextToVideo, providerTaskId: 'fixture-task' })
    case 'cancel':
      return client.cancel({ manifest: wanxTextToVideo, providerTaskId: 'fixture-task' })
    case 'chat': {
      const screenplay = getModelById('qwen-omni-screenplay')
      if (screenplay === undefined) throw new Error('screenplay fixture model is missing')
      return client.chat({
        manifest: screenplay,
        params: {
          videoUrl: 'https://fixture.invalid/video.mp4',
          language: 'zh',
          detailLevel: 'standard',
        },
      })
    }
  }
}

describe('Provider operation failure fixtures', () => {
  it('covers every client operation with an explicit fixture', () => {
    expect(new Set(PROVIDER_FAILURE_FIXTURES.map(fixture => fixture.operation))).toEqual(
      new Set(['submit', 'poll', 'cancel', 'chat']),
    )
  })

  for (const fixture of PROVIDER_FAILURE_FIXTURES) {
    it(`projects ${fixture.id}`, async () => {
      const expected = fixture.expected

      if (expected.outcome === 'http-error') {
        await expect(executeFixture(fixture)).rejects.toMatchObject({
          status: fixture.status,
          info: {
            category: expected.category,
            retriable: expected.retriable,
            ...(expected.code === undefined ? {} : { code: expected.code }),
          },
        })
        return
      }

      const result = await executeFixture(fixture)
      if (expected.outcome === 'poll-failed') {
        expect(result).toMatchObject({
          mode: 'failed',
          providerStatus: expected.providerStatus,
          error: {
            category: expected.category,
            retriable: expected.retriable,
            ...(expected.code === undefined ? {} : { code: expected.code }),
          },
        })
        return
      }

      expect(result).toEqual({
        mode: 'unsupported',
        raw: fixture.body,
        requestId: 'request-cancel-unsupported',
        reason: expected.reason,
      })
    })
  }
})
