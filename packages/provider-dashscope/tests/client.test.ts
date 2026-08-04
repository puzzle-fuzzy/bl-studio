import { describe, expect, it } from 'vitest'
import {
  happyhorseT2V,
  kelingT2V,
  getModelById,
  qwenImage,
  wanxTextToVideo,
  type FrozenModelManifest,
} from '@bailian-studio/model-core'
import {
  DashScopeHttpError,
  createDashScopeClient as createRawDashScopeClient,
  type DashScopeFetch,
} from '../src'

interface FetchCall {
  url: string
  init?: RequestInit
}

function createFetch(responses: Response[]): { fetch: DashScopeFetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    const response = responses.shift()
    if (response === undefined) throw new Error('No fake response queued')
    return response
  }) as DashScopeFetch

  return { fetch, calls }
}

function createThrowingFetch(error: unknown): { fetch: DashScopeFetch; calls: FetchCall[] } {
  const calls: FetchCall[] = []
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    throw error
  }) as unknown as DashScopeFetch

  return { fetch, calls }
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

function createDashScopeClient(
  options: Parameters<typeof createRawDashScopeClient>[0],
): ReturnType<typeof createRawDashScopeClient> {
  return createRawDashScopeClient({ workspaceId: 'ws-test', ...options })
}

describe('createDashScopeClient', () => {
  it('consumes a streaming screenplay fixture and normalizes the text artifact', async () => {
    const qwenOmniScreenplay = getModelById('qwen-omni-screenplay')
    if (qwenOmniScreenplay === undefined) throw new Error('screenplay fixture model is missing')
    const { fetch, calls } = createFetch([
      new Response([
        'data: {"id":"chunk-1","object":"chat.completion.chunk","created":1757647879,"model":"qwen3.5-omni-plus","choices":[{"index":0,"delta":{"content":"# 剧本标题：雨夜"},"finish_reason":null}],"usage":null}',
        'data: {"id":"chunk-2","object":"chat.completion.chunk","created":1757647880,"model":"qwen3.5-omni-plus","choices":[],"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20}}',
        'data: [DONE]',
        '',
      ].join('\n')),
    ])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, workspaceId: 'ws-test' })

    const result = await client.chat({
      manifest: qwenOmniScreenplay,
      params: {
        videoUrl: 'https://fixture.invalid/video.mp4',
        language: 'zh',
        detailLevel: 'standard',
      },
    })

    if (result.mode !== 'completed') throw new Error('streaming fixture unexpectedly failed')
    expect(result.output.artifacts).toEqual([
      { kind: 'text', text: '# 剧本标题：雨夜', mimeType: 'text/markdown' },
    ])
    expect(result.output.usage).toEqual({ promptTokens: 12, completionTokens: 8 })

    const call = calls[0]
    if (call === undefined) throw new Error('streaming fixture did not record a fetch call')
    expect(call.url).toBe('https://ws-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions')
    const headers = new Headers(call.init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer test-key')
    expect(headers.get('Content-Type')).toBe('application/json')
    const body = JSON.parse(String(call.init?.body)) as Record<string, unknown>
    expect(body).toMatchObject({
      model: 'qwen3.5-omni-plus',
      stream: true,
      stream_options: { include_usage: true },
    })
    expect(body.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({
        content: expect.arrayContaining([
          { type: 'video_url', video_url: { url: 'https://fixture.invalid/video.mp4' } },
        ]),
      }),
    ]))
  })

  it('uses the SDK workspace compatible endpoint for covered chat operations', async () => {
    const qwenOmniScreenplay = getModelById('qwen-omni-screenplay')
    if (qwenOmniScreenplay === undefined) throw new Error('screenplay fixture model is missing')
    const { fetch, calls } = createFetch([
      new Response('data: {"id":"chunk-1","object":"chat.completion.chunk","created":1757647879,"model":"qwen3.5-omni-plus","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":null}],"usage":null}\n\n'),
    ])
    const client = createDashScopeClient({
      apiKey: 'test-key',
      fetch,
      workspaceId: 'ws-test',
      chatBaseUrl: 'https://proxy.example.test/openai/v1',
    })

    await client.chat({ manifest: qwenOmniScreenplay, params: { videoUrl: 'https://fixture.invalid/video.mp4' } })

    expect(calls[0]?.url).toBe('https://ws-test.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions')
  })

  it('rejects a parsed stream event that drifts from the official response contract', async () => {
    const screenplay = getModelById('qwen-omni-screenplay')
    if (screenplay === undefined) throw new Error('screenplay fixture model is missing')
    const { fetch } = createFetch([
      new Response('data: {"choices":[{"delta":{"content":"missing metadata"}}]}\n\n'),
    ])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, workspaceId: 'ws-test' })

    await expect(client.chat({
      manifest: screenplay,
      params: { videoUrl: 'https://fixture.invalid/video.mp4' },
    })).rejects.toMatchObject({
      info: {
        category: 'validation',
        code: 'BAILIAN_CONTRACT_RESPONSE_SCHEMA_MISMATCH',
      },
    })
  })

  it('uses SDK transport and validates Contract v3 for covered Keling submits', async () => {
    const raw = {
      output: { task_id: 'task-keling', task_status: 'PENDING' },
      request_id: 'request-keling',
    }
    const { fetch, calls } = createFetch([jsonResponse(raw)])
    const client = createDashScopeClient({
      apiKey: 'test-key',
      fetch,
      baseUrl: 'https://legacy.test',
      workspaceId: 'ws-test',
    })

    await expect(client.submit({
      manifest: kelingT2V,
      params: { prompt: 'a cat running', aspectRatio: '16:9' },
    })).resolves.toEqual({
      mode: 'polling',
      providerTaskId: 'task-keling',
      providerStatus: 'PENDING',
      requestId: 'request-keling',
      raw,
    })

    expect(calls[0]?.url).toBe(
      'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
    )
    const headers = new Headers(calls[0]?.init?.headers)
    expect(headers.get('Authorization')).toBe('Bearer test-key')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('X-DashScope-Async')).toBe('enable')
  })

  it('submits DeepSeek V4 through the native workspace endpoint and normalizes its final response', async () => {
    const manifest = getModelById('deepseek-v4-pro')
    if (manifest === undefined) throw new Error('DeepSeek V4 Pro fixture model is missing')
    const raw = {
      output: {
        choices: [{
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            reasoning_content: '先分析问题。',
            content: '量子纠缠描述了粒子之间的关联。',
          },
        }],
      },
      usage: {
        input_tokens: 12,
        output_tokens: 18,
        total_tokens: 30,
        output_tokens_details: { reasoning_tokens: 8 },
      },
      request_id: 'request-deepseek-v4',
    }
    const { fetch, calls } = createFetch([jsonResponse(raw)])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, workspaceId: 'ws-test' })

    const result = await client.submit({
      manifest,
      params: {
        prompt: '解释量子纠缠',
        maxCompletionTokens: 4096,
        enableThinking: true,
        reasoningEffort: 'high',
        temperature: 1,
        topP: 0.95,
        seed: 1234,
        resultFormat: 'message',
      },
    })

    expect(calls[0]?.url).toBe(
      'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
    )
    expect(new Headers(calls[0]?.init?.headers).get('X-DashScope-Async')).toBeNull()
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      model: 'deepseek-v4-pro',
      input: { messages: [{ role: 'user', content: '解释量子纠缠' }] },
      parameters: {
        max_completion_tokens: 4096,
        enable_thinking: true,
        reasoning_effort: 'high',
        temperature: 1,
        top_p: 0.95,
        seed: 1234,
        result_format: 'message',
      },
    })
    expect(result).toEqual({
      mode: 'completed',
      requestId: 'request-deepseek-v4',
      raw,
      output: {
        artifacts: [{ kind: 'text', text: '量子纠缠描述了粒子之间的关联。' }],
        usage: raw.usage,
        raw,
      },
    })
  })

  it('fails before fetch when a covered manifest drifts from the SDK request contract', async () => {
    const driftedManifest = {
      ...kelingT2V,
      request: {
        ...kelingT2V.request,
        bindings: {
          ...kelingT2V.request.bindings,
          retired_seed: { target: 'parameters.field' },
        },
      },
    } as unknown as FrozenModelManifest
    const { fetch, calls } = createFetch([])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, workspaceId: 'ws-test' })

    let error: unknown
    try {
      await client.submit({
        manifest: driftedManifest,
        params: { prompt: 'a cat running', aspectRatio: '16:9', retired_seed: 42 },
      })
    } catch (caught) {
      error = caught
    }

    expect(calls).toHaveLength(0)
    expect(error).toBeInstanceOf(DashScopeHttpError)
    expect((error as DashScopeHttpError).info).toMatchObject({
      category: 'validation',
      retriable: false,
      code: 'BAILIAN_CONTRACT_SCHEMA_VALIDATION_FAILED',
    })
    expect((error as DashScopeHttpError).info.details).toMatchObject({
      messages: {
        'zh-CN': expect.stringContaining('/parameters/retired_seed'),
        'en-US': expect.stringContaining('/parameters/retired_seed'),
      },
      expected: {
        'zh-CN': expect.any(String),
        'en-US': expect.any(String),
      },
    })
  })

  it('requires workspace configuration for covered HappyHorse operations', async () => {
    const { fetch, calls } = createFetch([])
    const client = createRawDashScopeClient({ apiKey: 'test-key', fetch })

    let error: unknown
    try {
      await client.submit({ manifest: happyhorseT2V, params: { prompt: 'a paper train' } })
    } catch (caught) {
      error = caught
    }

    expect(calls).toHaveLength(0)
    expect(error).toBeInstanceOf(DashScopeHttpError)
    expect((error as DashScopeHttpError).info).toMatchObject({
      category: 'validation',
      retriable: false,
      code: 'BAILIAN_ADAPTER_WORKSPACE_ID_REQUIRED',
    })
  })

  it('rejects covered submit responses that do not match Contract v3', async () => {
    const { fetch } = createFetch([
      jsonResponse({ output: { task_id: 'task-keling', task_status: 'PENDING' } }),
    ])
    const client = createDashScopeClient({
      apiKey: 'test-key',
      fetch,
      workspaceId: 'ws-test',
      contractLocale: 'en-US',
    })

    let error: unknown
    try {
      await client.submit({
        manifest: kelingT2V,
        params: { prompt: 'a cat running', aspectRatio: '16:9' },
      })
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(DashScopeHttpError)
    expect((error as DashScopeHttpError).info).toMatchObject({
      category: 'validation',
      retriable: false,
      code: 'BAILIAN_CONTRACT_RESPONSE_SCHEMA_MISMATCH',
    })
  })

  it('validates covered final poll responses and uses the SDK polling endpoint', async () => {
    const raw = {
      request_id: 'request-final',
      output: {
        task_id: 'task-keling',
        task_status: 'SUCCEEDED',
        submit_time: '2026-03-27 21:30:32.575',
        scheduled_time: '2026-03-27 21:30:32.603',
        end_time: '2026-03-27 21:31:09.177',
        video_url: 'https://example.com/generated.mp4',
      },
      usage: {
        duration: 5,
        size: '1280*720',
        fps: 24,
        video_count: 1,
        audio: false,
        SR: '720',
      },
    }
    const { fetch, calls } = createFetch([jsonResponse(raw)])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, workspaceId: 'ws-test' })

    const result = await client.poll({ manifest: kelingT2V, providerTaskId: 'task-keling' })

    expect(calls[0]?.url).toBe('https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/tasks/task-keling')
    expect(result).toMatchObject({
      mode: 'completed',
      providerStatus: 'SUCCEEDED',
      requestId: 'request-final',
      output: {
        artifacts: [{ kind: 'video', sourceUrl: 'https://example.com/generated.mp4' }],
      },
    })
  })

  it('treats SDK-declared canceled tasks as terminal and non-retriable', async () => {
    const raw = {
      request_id: 'request-canceled',
      output: {
        task_id: 'task-keling',
        task_status: 'CANCELED',
        code: 'TaskCanceled',
        message: 'The task was canceled.',
      },
    }
    const { fetch } = createFetch([jsonResponse(raw)])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, workspaceId: 'ws-test' })

    await expect(client.poll({ manifest: kelingT2V, providerTaskId: 'task-keling' })).resolves.toMatchObject({
      mode: 'failed',
      providerStatus: 'CANCELED',
      error: {
        category: 'cancelled',
        retriable: false,
        code: 'TaskCanceled',
      },
    })
  })

  it('posts to the generic async-task cancel endpoint and returns cancelled', async () => {
    const raw = {
      request_id: 'request-cancel',
      output: { task_id: 'task-keling', task_status: 'CANCELED' },
    }
    const { fetch, calls } = createFetch([jsonResponse(raw)])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, workspaceId: 'ws-test' })

    await expect(client.cancel({ manifest: kelingT2V, providerTaskId: 'task-keling' })).resolves.toEqual({
      mode: 'cancelled',
      raw,
      requestId: 'request-cancel',
    })
    expect(calls[0]?.url).toBe('https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/tasks/task-keling/cancel')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(calls[0]?.init?.body).toBeUndefined()
    expect(new Headers(calls[0]?.init?.headers).get('Authorization')).toBe('Bearer test-key')
  })

  it('normalizes provider rejection when an async task is no longer cancellable', async () => {
    const raw = {
      code: 'UnsupportedOperation',
      message: 'Only PENDING tasks can be canceled.',
      request_id: 'request-cancel-unsupported',
    }
    const { fetch } = createFetch([jsonResponse(raw, 400)])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, workspaceId: 'ws-test' })

    await expect(client.cancel({ manifest: kelingT2V, providerTaskId: 'task-keling' })).resolves.toMatchObject({
      mode: 'unsupported',
      requestId: 'request-cancel-unsupported',
      reason: raw.message,
    })
  })

  it('keeps a valid covered rate-limit error retriable after Contract v3 validation', async () => {
    const { fetch } = createFetch([
      jsonResponse({
        code: 'Throttling.RateQuota',
        message: 'Rate limit exceeded.',
        request_id: 'request-rate-limit',
      }, 429),
    ])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, workspaceId: 'ws-test' })

    await expect(client.submit({
      manifest: kelingT2V,
      params: { prompt: 'a cat running', aspectRatio: '16:9' },
    })).rejects.toMatchObject({
      info: {
        category: 'rate_limit',
        retriable: true,
        code: 'Throttling.RateQuota',
      },
      status: 429,
    })
  })

  it('keeps malformed covered 5xx responses retriable and attaches contract diagnostics', async () => {
    const { fetch } = createFetch([
      new Response('<html>temporarily unavailable</html>', { status: 503 }),
    ])
    const client = createDashScopeClient({
      apiKey: 'test-key',
      fetch,
      workspaceId: 'ws-test',
      contractLocale: 'en-US',
    })

    await expect(client.submit({
      manifest: kelingT2V,
      params: { prompt: 'a cat running', aspectRatio: '16:9' },
    })).rejects.toMatchObject({
      status: 503,
      info: {
        category: 'provider',
        retriable: true,
        message: '<html>temporarily unavailable</html>',
        details: {
          contractValidation: {
            messages: {
              'zh-CN': expect.any(String),
              'en-US': expect.any(String),
            },
            issues: expect.any(Array),
          },
        },
      },
    })
  })

  it('uses the HTTP fallback message for an empty covered 5xx response', async () => {
    const { fetch } = createFetch([new Response(null, { status: 507 })])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, workspaceId: 'ws-test' })

    await expect(client.submit({
      manifest: kelingT2V,
      params: { prompt: 'a cat running', aspectRatio: '16:9' },
    })).rejects.toMatchObject({
      status: 507,
      info: {
        category: 'provider',
        retriable: true,
        message: 'DashScope HTTP 507',
      },
    })
  })

  it('submits sync qwenImage requests with authorization and returns normalized image artifacts', async () => {
    const raw = {
      output: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: [{ image: 'https://cdn.example.com/image.png' }],
            },
          },
        ],
      },
      usage: { image_count: 1, width: 1024, height: 1024 },
      request_id: 'request-image',
    }
    const { fetch, calls } = createFetch([jsonResponse(raw)])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, baseUrl: 'https://dashscope.test' })

    const result = await client.submit({ manifest: qwenImage, params: { prompt: 'draw a lighthouse', n: 1 } })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(new Headers(calls[0]?.init?.headers).get('Authorization')).toBe('Bearer test-key')
    expect(new Headers(calls[0]?.init?.headers).get('Content-Type')).toBe('application/json')
    expect(new Headers(calls[0]?.init?.headers).get('X-DashScope-Async')).toBeNull()
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      model: 'qwen-image',
      input: { messages: [{ role: 'user', content: [{ text: 'draw a lighthouse' }] }] },
      parameters: { n: 1 },
    })
    expect(result).toEqual({
      mode: 'completed',
      requestId: 'request-image',
      raw,
      output: {
        artifacts: [{ kind: 'image', sourceUrl: 'https://cdn.example.com/image.png' }],
        usage: { image_count: 1, width: 1024, height: 1024 },
        raw,
      },
    })
  })

  it('forwards a stable idempotency key on provider submissions', async () => {
    const raw = {
      output: {
        choices: [{
          finish_reason: 'stop',
          message: { role: 'assistant', content: [{ image: 'https://cdn.example.com/image.png' }] },
        }],
      },
      usage: { image_count: 1, width: 1024, height: 1024 },
      request_id: 'request-idempotency',
    }
    const { fetch, calls } = createFetch([jsonResponse(raw)])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, baseUrl: 'https://dashscope.test' })

    await client.submit({
      manifest: qwenImage,
      params: { prompt: 'draw a lighthouse', n: 1 },
      idempotencyKey: 'generation:gen_1:submit',
    })

    expect(new Headers(calls[0]?.init?.headers).get('X-DashScope-Idempotency-Key'))
      .toBe('generation:gen_1:submit')
  })

  it('submits async wanxTextToVideo requests with async header and returns provider task metadata', async () => {
    const raw = {
      output: {
        task_id: 'task-123',
        task_status: 'PENDING',
      },
      request_id: 'request-submit',
    }
    const { fetch, calls } = createFetch([jsonResponse(raw)])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, baseUrl: 'https://dashscope.test' })

    const result = await client.submit({
      manifest: wanxTextToVideo,
      params: { prompt: 'a train crossing a bridge', duration: 5 },
    })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(new Headers(calls[0]?.init?.headers).get('Authorization')).toBe('Bearer test-key')
    expect(new Headers(calls[0]?.init?.headers).get('X-DashScope-Async')).toBe('enable')
    expect(result).toEqual({
      mode: 'polling',
      providerTaskId: 'task-123',
      providerStatus: 'PENDING',
      requestId: 'request-submit',
      raw,
    })
  })

  it('polls and maps provider task statuses to pending, completed, and failed results', async () => {
    const running = {
      output: { task_id: 'task-running', task_status: 'RUNNING' },
      request_id: 'request-running',
    }
    const succeeded = {
      output: {
        task_id: 'task-done',
        task_status: 'SUCCEEDED',
        submit_time: '2026-07-31 10:00:00.000',
        scheduled_time: '2026-07-31 10:00:00.100',
        end_time: '2026-07-31 10:01:00.000',
        orig_prompt: 'a train crossing a bridge',
        video_url: 'https://cdn.example.com/movie.mp4',
      },
      usage: { duration: 5, video_count: 1 },
      request_id: 'request-done',
    }
    const failed = {
      output: {
        task_id: 'task-failed',
        task_status: 'FAILED',
        code: 'BadRequest',
        message: 'invalid prompt',
      },
      request_id: 'request-failed',
    }
    const { fetch, calls } = createFetch([jsonResponse(running), jsonResponse(succeeded), jsonResponse(failed)])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, baseUrl: 'https://dashscope.test' })

    await expect(client.poll({ manifest: wanxTextToVideo, providerTaskId: 'task-running' })).resolves.toEqual({
      mode: 'pending',
      providerStatus: 'RUNNING',
      requestId: 'request-running',
      raw: running,
    })
    await expect(client.poll({ manifest: wanxTextToVideo, providerTaskId: 'task-done' })).resolves.toEqual({
      mode: 'completed',
      providerStatus: 'SUCCEEDED',
      requestId: 'request-done',
      raw: succeeded,
      output: {
        artifacts: [{ kind: 'video', sourceUrl: 'https://cdn.example.com/movie.mp4' }],
        usage: { duration: 5, video_count: 1 },
        raw: succeeded,
      },
    })
    await expect(client.poll({ manifest: wanxTextToVideo, providerTaskId: 'task-failed' })).resolves.toEqual({
      mode: 'failed',
      providerStatus: 'FAILED',
      requestId: 'request-failed',
      raw: failed,
      error: {
        category: 'validation',
        retriable: false,
        code: 'BadRequest',
        message: 'invalid prompt',
      },
    })

    expect(calls.map((call) => call.url)).toEqual([
      'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/tasks/task-running',
      'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/tasks/task-done',
      'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/tasks/task-failed',
    ])
    for (const call of calls) {
      expect(call.init?.method).toBe('GET')
      expect(new Headers(call.init?.headers).get('Authorization')).toBe('Bearer test-key')
    }
  })

  it('rejects unknown or missing provider task statuses at the official response boundary', async () => {
    const unknown = {
      output: { task_id: 'task-unknown', task_status: 'MYSTERY' },
      request_id: 'request-unknown',
    }
    const missing = {
      output: { task_id: 'task-missing', video_url: 'https://cdn.example.com/movie.mp4' },
      request_id: 'request-missing',
    }
    const { fetch } = createFetch([jsonResponse(unknown), jsonResponse(missing)])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, baseUrl: 'https://dashscope.test' })

    await expect(client.poll({ manifest: wanxTextToVideo, providerTaskId: 'task-unknown' })).rejects.toMatchObject({
      info: {
        category: 'validation',
        code: 'BAILIAN_CONTRACT_RESPONSE_SCHEMA_MISMATCH',
      },
    })
    await expect(client.poll({ manifest: wanxTextToVideo, providerTaskId: 'task-missing' })).rejects.toMatchObject({
      info: {
        category: 'validation',
        code: 'BAILIAN_CONTRACT_RESPONSE_SCHEMA_MISMATCH',
      },
    })
  })

  it('throws DashScopeHttpError for non-2xx HTTP responses', async () => {
    const raw = { code: 'Throttling', message: 'rate limit exceeded', request_id: 'request-error' }
    const { fetch } = createFetch([jsonResponse(raw, 429)])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, baseUrl: 'https://dashscope.test' })

    let error: unknown
    try {
      await client.submit({ manifest: qwenImage, params: { prompt: 'draw a lighthouse' } })
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(DashScopeHttpError)
    expect((error as DashScopeHttpError).status).toBe(429)
    expect((error as DashScopeHttpError).info).toEqual({
      category: 'rate_limit',
      retriable: true,
      code: 'Throttling',
      message: 'rate limit exceeded',
    })
    expect((error as DashScopeHttpError).raw).toEqual(raw)
  })

  it('wraps transport failures in DashScopeHttpError', async () => {
    const transportError = new Error('socket disconnected')
    const { fetch, calls } = createThrowingFetch(transportError)
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, baseUrl: 'https://dashscope.test' })

    let error: unknown
    try {
      await client.submit({ manifest: qwenImage, params: { prompt: 'draw a lighthouse' } })
    } catch (caught) {
      error = caught
    }

    expect(calls).toHaveLength(1)
    expect(error).toBeInstanceOf(DashScopeHttpError)
    expect((error as DashScopeHttpError).info).toEqual({
      category: 'network',
      retriable: true,
      message: 'socket disconnected',
    })
    expect((error as DashScopeHttpError).raw).toBe(transportError)
  })
})

describe('DashScopeClient request_id extraction', () => {
  it('extracts request_id from async submit response', async () => {
    const raw = {
      output: {
        task_status: 'PENDING',
        task_id: 'async-task-123',
      },
      request_id: 'req-submit-123',
    }
    const { fetch } = createFetch([jsonResponse(raw)])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, baseUrl: 'https://dashscope.test' })

    const result = await client.submit({ manifest: wanxTextToVideo, params: { prompt: 'test' } })

    expect(result.mode).toBe('polling')
    expect(result.requestId).toBe('req-submit-123')
  })

  it('extracts request_id from sync submit response', async () => {
    const raw = {
      output: {
        choices: [{
          finish_reason: 'stop',
          message: { role: 'assistant', content: [{ image: 'https://cdn.example.com/image.png' }] },
        }],
      },
      usage: { image_count: 1, width: 1024, height: 1024 },
      request_id: 'req-sync-456',
    }
    const { fetch } = createFetch([jsonResponse(raw)])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, baseUrl: 'https://dashscope.test' })

    const result = await client.submit({ manifest: qwenImage, params: { prompt: 'draw a lighthouse' } })

    expect(result.mode).toBe('completed')
    expect(result.requestId).toBe('req-sync-456')
  })

  it('extracts request_id from poll response - succeeded', async () => {
    const raw = {
      output: {
        task_id: 'task-123',
        task_status: 'SUCCEEDED',
        submit_time: '2026-07-31 10:00:00.000',
        scheduled_time: '2026-07-31 10:00:00.100',
        end_time: '2026-07-31 10:01:00.000',
        orig_prompt: 'test',
        video_url: 'https://cdn.example.com/video.mp4',
      },
      usage: { duration: 5, video_count: 1 },
      request_id: 'req-poll-789',
    }
    const { fetch } = createFetch([jsonResponse(raw)])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, baseUrl: 'https://dashscope.test' })

    const result = await client.poll({ manifest: wanxTextToVideo, providerTaskId: 'task-123' })

    expect(result.mode).toBe('completed')
    expect(result.requestId).toBe('req-poll-789')
  })

  it('extracts request_id from poll response - failed', async () => {
    const raw = {
      output: {
        task_id: 'task-123',
        task_status: 'FAILED',
        code: 'InvalidParameter',
        message: 'Invalid parameter',
      },
      request_id: 'req-poll-fail',
    }
    const { fetch } = createFetch([jsonResponse(raw)])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, baseUrl: 'https://dashscope.test' })

    const result = await client.poll({ manifest: wanxTextToVideo, providerTaskId: 'task-123' })

    expect(result.mode).toBe('failed')
    expect(result.requestId).toBe('req-poll-fail')
  })

  it('rejects a covered submit response that omits request_id', async () => {
    const raw = {
      output: {
        task_status: 'PENDING',
        task_id: 'task-123',
      },
      // no request_id
    }
    const { fetch } = createFetch([jsonResponse(raw)])
    const client = createDashScopeClient({ apiKey: 'test-key', fetch, baseUrl: 'https://dashscope.test' })

    await expect(client.submit({ manifest: wanxTextToVideo, params: { prompt: 'test' } })).rejects.toMatchObject({
      info: {
        category: 'validation',
        code: 'BAILIAN_CONTRACT_RESPONSE_SCHEMA_MISMATCH',
      },
    })
  })
})
