import { describe, expect, it } from 'vitest'
import { getModelById } from '@bailian-studio/dashscope-manifests'
import type { FrozenModelManifest } from '@bailian-studio/dashscope-manifests'
import type { DashScopeFetch } from '@bailian-studio/provider-dashscope'
import { DashScopeProviderRunner } from '../../src/providers'
import type { ProviderExecuteInput } from '../../src/providers'

const qwenImage = getModelById('qwen-image')
const wanxVideo = getModelById('wanx-text-to-video')
const kelingVideo = getModelById('keling-text-to-video')
if (qwenImage === undefined || wanxVideo === undefined || kelingVideo === undefined) {
  throw new Error('required provider test manifest missing from registry — test setup failed')
}

// ---------------------------------------------------------------------------
// 替身
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

interface QueuedFetch {
  fetch: DashScopeFetch
  calls: Array<{ url: string }>
}

/** 按 FIFO 顺序返回 Response、并记录 URL 的 fetch 实现。 */
function queuedFetch(responses: Response[]): QueuedFetch {
  const queue = [...responses]
  const calls: Array<{ url: string }> = []
  const core = async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
    calls.push({ url: typeof input === 'string' ? input : '<non-string-url>' })
    const next = queue.shift()
    if (next === undefined) throw new Error('queuedFetch: response queue exhausted')
    return next
  }
  // 合并到真实 fetch 上，使结果携带 fetch 的静态表面（如 preconnect），
  // 并在无需类型断言的情况下满足 `typeof fetch`。合并后的调用签名属于 `core`，
  // 因此请求只会命中我们的队列，而不会真正访问网络。
  const impl: DashScopeFetch = Object.assign(core, fetch)
  return { fetch: impl, calls }
}

function makeRunner(fetch: DashScopeFetch): DashScopeProviderRunner {
  return new DashScopeProviderRunner({ apiKey: 'test-key', workspaceId: 'ws-test', fetch })
}

function submit(
  manifest: FrozenModelManifest,
  inputParams: Record<string, unknown>,
  estimatedCostCents = 25,
): ProviderExecuteInput {
  return { manifest, inputParams, taskId: 'task_1', estimatedCostCents }
}

function poll(
  manifest: FrozenModelManifest,
  providerTaskId: string,
  inputParams: Record<string, unknown>,
  estimatedCostCents = 500,
): ProviderExecuteInput {
  return { manifest, inputParams, taskId: 'task_1', providerTaskId, estimatedCostCents }
}

describe('DashScopeProviderRunner.execute', () => {
  it('returns a validation error without calling the provider when params are invalid', async () => {
    const { fetch, calls } = queuedFetch([])
    const runner = makeRunner(fetch)

    const result = await runner.execute(submit(qwenImage, { n: 1 })) // 缺少必填的 prompt

    expect(result.success).toBe(false)
    expect(result.requiresPoll).toBe(false)
    expect(result.costCents).toBe(0)
    expect(result.error?.code).toBe('PROVIDER_VALIDATION_ERROR')
    expect(result.error?.category).toBe('validation')
    expect(result.error?.retryable).toBe(false)
    expect(calls).toEqual([])
  })

  it('completes synchronously for a sync (image) manifest', async () => {
    const { fetch, calls } = queuedFetch([
      jsonResponse({
        output: {
          choices: [{
            finish_reason: 'stop',
            message: { role: 'assistant', content: [{ image: 'https://cdn/img.png' }] },
          }],
        },
        usage: { image_count: 1, width: 1024, height: 1024 },
        request_id: 'request-image',
      }),
    ])
    const runner = makeRunner(fetch)

    const result = await runner.execute(submit(qwenImage, { prompt: 'lantern' }))

    expect(result.success).toBe(true)
    expect(result.requiresPoll).toBe(false)
    expect(result.costCents).toBe(25)
    expect(result.output?.artifacts).toEqual([{ kind: 'image', sourceUrl: 'https://cdn/img.png' }])
    expect(calls.length).toBe(1)
    expect(calls[0]?.url).toContain('/services/aigc/multimodal-generation/generation')
  })

  it('returns a polling continuation for an async (video) manifest', async () => {
    const { fetch } = queuedFetch([
      jsonResponse({
        output: { task_id: 'task_abc', task_status: 'PENDING' },
        request_id: 'request-submit',
      }),
    ])
    const runner = makeRunner(fetch)

    const result = await runner.execute(submit(wanxVideo, { prompt: 'ocean' }, 500))

    expect(result.success).toBe(true)
    expect(result.requiresPoll).toBe(true)
    expect(result.providerTaskId).toBe('task_abc')
    expect(result.costCents).toBe(500)
  })

  it('keeps polling when the provider task is still pending', async () => {
    const { fetch } = queuedFetch([jsonResponse({
      output: { task_id: 'task_abc', task_status: 'PENDING' },
      request_id: 'request-pending',
    })])
    const runner = makeRunner(fetch)

    const result = await runner.execute(poll(wanxVideo, 'task_abc', {
      prompt: 'ocean',
      size: '1280*720',
      duration: 5,
    }))

    expect(result.success).toBe(true)
    expect(result.requiresPoll).toBe(true)
    expect(result.providerTaskId).toBe('task_abc')
  })

  it('polls with persisted estimated cost even when persisted params omit submit-only required media', async () => {
    const { fetch, calls } = queuedFetch([jsonResponse({
      output: { task_id: 'task_abc', task_status: 'PENDING' },
      request_id: 'request-persisted-estimate',
    })])
    const runner = makeRunner(fetch)

    const result = await runner.execute(poll(wanxVideo, 'task_abc', {}, 731))

    expect(result).toMatchObject({
      success: true,
      requiresPoll: true,
      providerTaskId: 'task_abc',
      costCents: 731,
    })
    expect(calls).toHaveLength(1)
  })

  it('completes when a polled task succeeds', async () => {
    const { fetch } = queuedFetch([jsonResponse({
      output: {
        task_id: 'task_abc',
        task_status: 'SUCCEEDED',
        submit_time: '2026-07-31 10:00:00.000',
        scheduled_time: '2026-07-31 10:00:00.100',
        end_time: '2026-07-31 10:00:05.000',
        orig_prompt: 'ocean',
        video_url: 'https://cdn/vid.mp4',
      },
      usage: { duration: 5, video_count: 1 },
      request_id: 'request-succeeded',
    })])
    const runner = makeRunner(fetch)

    const result = await runner.execute(poll(wanxVideo, 'task_abc', {
      prompt: 'ocean',
      size: '1280*720',
      duration: 5,
    }))

    expect(result.success).toBe(true)
    expect(result.requiresPoll).toBe(false)
    expect(result.output?.artifacts).toEqual([{ kind: 'video', sourceUrl: 'https://cdn/vid.mp4' }])
  })

  it('uses final SDK usage instead of the request estimate for covered model cost', async () => {
    const { fetch } = queuedFetch([
      jsonResponse({
        request_id: 'request-keling-final',
        output: {
          task_id: 'task-keling',
          task_status: 'SUCCEEDED',
          submit_time: '2026-03-27 21:30:32.575',
          scheduled_time: '2026-03-27 21:30:32.603',
          end_time: '2026-03-27 21:31:09.177',
          video_url: 'https://cdn.example.com/keling.mp4',
        },
        usage: {
          duration: 7,
          size: '1280*720',
          fps: 24,
          video_count: 1,
          audio: false,
          SR: '720',
        },
      }),
    ])
    const runner = makeRunner(fetch)

    const result = await runner.execute(poll(kelingVideo, 'task-keling', {
      prompt: 'ocean',
      duration: 5,
      mode: 'std',
    }))

    expect(result.success).toBe(true)
    // 请求预估为 5 × 60 = 300 分；最终 usage 为 7 × 60 = 420 分。
    expect(result.costCents).toBe(420)
  })

  it('reports a provider failure when a polled task fails', async () => {
    const { fetch } = queuedFetch([jsonResponse({
      output: {
        task_id: 'task_abc',
        task_status: 'FAILED',
        code: 'QUOTA',
        message: 'insufficient quota',
      },
      request_id: 'request-failed',
    })])
    const runner = makeRunner(fetch)

    const result = await runner.execute(poll(wanxVideo, 'task_abc', { prompt: 'ocean' }))

    expect(result.success).toBe(false)
    expect(result.requiresPoll).toBe(false)
    expect(result.costCents).toBe(0)
    expect(result.error?.category).toBe('quota')
    expect(result.error?.retryable).toBe(false)
  })

  it('classifies a provider HTTP error (5xx) as a retryable provider failure', async () => {
    const { fetch } = queuedFetch([jsonResponse({ message: 'server boom' }, 500)])
    const runner = makeRunner(fetch)

    const result = await runner.execute(submit(qwenImage, { prompt: 'lantern' }))

    expect(result.success).toBe(false)
    expect(result.requiresPoll).toBe(false)
    expect(result.costCents).toBe(0)
    expect(result.error?.code).toBe('PROVIDER_HTTP_500')
    expect(result.error?.category).toBe('provider')
    expect(result.error?.retryable).toBe(true)

    // 注意：toProviderFailure 中通用的 PROVIDER_ERROR 分支是防御性的 ——
    // dashscope 客户端会把每次 fetch 失败包装成 DashScopeHttpError，
    // 因此该分支无法通过 fetch 注入缝触达，这里有意不去覆盖。
  })

  it('preserves HTTP status in the provider error code when DashScope returns no code', async () => {
    const { fetch } = queuedFetch([new Response('', { status: 404 })])
    const runner = makeRunner(fetch)

    const result = await runner.execute(submit(qwenImage, { prompt: 'lantern' }))

    expect(result.success).toBe(false)
    expect(result.error?.code).toBe('PROVIDER_HTTP_404')
    expect(result.error?.message).toBe('DashScope HTTP 404')
  })
})

describe('DashScopeProviderRunner.cancel', () => {
  it('returns provider cancellation success without executing generation', async () => {
    const { fetch, calls } = queuedFetch([
      jsonResponse({ request_id: 'cancel-request', output: { task_status: 'CANCELED' } }),
    ])
    const runner = makeRunner(fetch)

    await expect(runner.cancel({ manifest: kelingVideo, providerTaskId: 'task-keling' })).resolves.toEqual({
      status: 'cancelled',
      requestId: 'cancel-request',
    })
    expect(calls[0]?.url).toBe('https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/tasks/task-keling/cancel')
  })
})
