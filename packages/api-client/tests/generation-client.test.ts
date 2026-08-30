import { describe, expect, it } from 'vitest'
import {
  ApiClientError,
  createApiClient,
  type AssetCapabilities,
  type AssetItem,
  type ModelCatalogItem,
  type RegistrationResult,
} from '../src'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

interface QueuedFetch {
  fetch: typeof fetch
  calls: Array<{
    url: string
    method: string
    body: string | undefined
    credentials: RequestCredentials | undefined
  }>
}

/** 按 FIFO 顺序返回 Response 的假 fetch，并记录每次调用。 */
function queuedFetch(responses: Response[]): QueuedFetch {
  const queue = [...responses]
  const calls: QueuedFetch['calls'] = []
  const core = async (input: Parameters<typeof fetch>[0], init?: RequestInit): Promise<Response> => {
    calls.push({
      url: typeof input === 'string' ? input : '<non-string-url>',
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : undefined,
      credentials: init?.credentials,
    })
    const next = queue.shift()
    if (next === undefined) throw new Error('queuedFetch: response queue exhausted')
    return next
  }
  // 合并到真实 fetch 上，使结果携带 fetch 的静态面（如 preconnect），
  // 无需强转即可满足 `typeof fetch`。
  return { fetch: Object.assign(core, fetch), calls }
}

const qwenImage: ModelCatalogItem = {
  id: 'qwen-image',
  provider: 'dashscope',
  providerModel: 'qwen-image',
  displayName: 'Qwen Image',
  category: 'image',
  operation: 'image.text-to-image',
  taskMode: 'sync',
  capabilities: ['text_prompt'],
  parameters: [
    {
      name: 'prompt',
      label: 'Prompt',
      type: 'text',
      required: true,
      maxLength: 800,
    },
    {
      name: 'n',
      label: 'Count',
      type: 'number',
      defaultValue: 1,
      min: 1,
      max: 6,
      step: 1,
    },
  ],
  availability: { enabled: true, stage: 'stable' },
}

// 完整 manifest 携带了客户端不建模的 request/output/pricing ——
// schema 必须剔除这些字段且仍能干净解析。
const fullManifest = {
  ...qwenImage,
  request: { kind: 'dashscope-image-message', endpoint: '/x', bindings: {} },
  output: { kind: 'images-from-message-content' },
  pricing: {
    unit: 'per_image',
    quantityKey: 'n',
    currency: 'CNY',
    tiers: [{ condition: {}, priceCents: 20 }],
  },
}

const record = {
  id: 'rec_1',
  userId: 'user_1',
  modelId: 'qwen-image',
  provider: 'dashscope',
  providerModel: 'qwen-image',
  category: 'image',
  inputParams: { prompt: 'lantern', n: 1, size: '1024*1024' },
  status: 'submitting',
  providerCancelStatus: 'not_requested',
  costEstimate: 20,
  currency: 'CNY',
  pricingVersion: 'pricing-test',
  modelManifestHash: 'manifest-test',
  createdAt: '2026-06-29T00:00:00.000Z',
  updatedAt: '2026-06-29T00:00:00.000Z',
}

const user = {
  id: 'user_1',
  email: 'a@b.test',
  displayName: null,
  hasAvatar: false,
  passwordAuthEnabled: true,
  githubLinked: false,
  role: 'user' as const,
  emailVerifiedAt: '2026-07-25T00:00:00.000Z',
  bannedAt: null,
}

describe('createApiClient', () => {
  it('lists models from the catalog envelope, stripping unmapped manifest fields', async () => {
    const { fetch, calls } = queuedFetch([jsonResponse({ success: true, data: { items: [fullManifest] } })])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const models = await client.getModels()

    expect(models).toEqual([qwenImage])
    expect(calls[0]?.url).toBe('http://api.test/api/models/catalog')
    expect(calls[0]?.credentials).toBe('include')
  })

  it('normalizes legacy nested prompt reference formats during rolling deploys', async () => {
    const legacyReferenceVideo = {
      ...fullManifest,
      id: 'vidu-reference-video',
      providerModel: 'vidu/viduq3-mix_reference2video',
      displayName: 'Vidu Reference to Video',
      category: 'video',
      operation: 'video.reference-to-video',
      taskMode: 'provider_async',
      request: {
        kind: 'dashscope-video-task',
        endpoint: '/services/aigc/video-generation/video-synthesis',
        referenceFormat: 'image-bracket',
        bindings: {},
      },
    }
    const { fetch } = queuedFetch([jsonResponse({ success: true, data: { items: [legacyReferenceVideo] } })])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const [model] = await client.getModels()

    expect(model?.referenceFormat).toBe('image-bracket')
    expect(model).not.toHaveProperty('request')
  })

  it('preserves conditional parameter constraints through the catalog projection', async () => {
    const conditionalManifest = {
      ...fullManifest,
      id: 'conditional-media',
      capabilities: ['text_prompt', 'image_input', 'video_input'],
      parameters: [
        {
          name: 'featureVideo',
          label: 'Feature video',
          type: 'media',
          mediaKind: 'video',
        },
        {
          name: 'duration',
          label: 'Duration',
          type: 'number',
          conditional: {
            when: { field: 'featureVideo', present: true },
            max: 10,
          },
        },
      ],
    }
    const { fetch } = queuedFetch([jsonResponse({ success: true, data: { items: [conditionalManifest] } })])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const [model] = await client.getModels()

    expect(model?.parameters.find(parameter => parameter.name === 'duration')?.conditional).toEqual({
      when: { field: 'featureVideo', present: true },
      max: 10,
    })
  })

  it('creates a generation share using the cookie session', async () => {
    const share = {
      id: 'share_1',
      recordId: 'rec_1',
      userId: 'user_1',
      includeParams: false,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }
    const { fetch, calls } = queuedFetch([jsonResponse({ success: true, data: { share } })])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const result = await client.createGenerationShare('rec_1')

    expect(result.share.id).toBe('share_1')
    expect(calls[0]?.url).toBe('http://api.test/api/generations/rec_1/share')
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.credentials).toBe('include')
  })

  it('fetches a public shared generation without credentials', async () => {
    const publicShare = {
      id: 'share_1',
      recordId: 'rec_1',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }
    const publicRecord = {
      id: 'rec_1',
      modelId: 'qwen-image',
      provider: 'dashscope',
      providerModel: 'qwen-image',
      category: 'image',
      status: 'succeeded',
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }
    const artifact = {
      id: 'artifact_1',
      kind: 'image',
      mimeType: 'image/png',
      byteSize: 123,
      status: 'stored',
      readUrl: '/signed/generations/rec_1/artifact_1.png?ttl=3600',
      createdAt: '2026-07-01T00:00:00.000Z',
    }
    const { fetch, calls } = queuedFetch([
      jsonResponse({
        success: true,
        data: {
          share: publicShare,
          record: publicRecord,
          artifacts: [artifact],
        },
      }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const result = await client.getSharedGeneration('share_1')

    expect(result.share.id).toBe('share_1')
    expect(result.record.id).toBe('rec_1')
    expect(result.artifacts[0]?.readUrl).toContain('/signed/')
    expect(calls[0]?.url).toBe('http://api.test/api/shares/generations/share_1')
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.credentials).toBeUndefined()
  })

  it('fetches a single model', async () => {
    const { fetch, calls } = queuedFetch([jsonResponse({ success: true, data: fullManifest })])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const model = await client.getModel('qwen-image')

    expect(model.id).toBe('qwen-image')
    expect(calls[0]?.url).toBe('http://api.test/api/models/qwen-image')
  })

  it('reads the current account point balance with the cookie session', async () => {
    const balance = {
      userId: 'user_1',
      availableCents: 200_000,
      reservedCents: 120,
      totalCents: 200_120,
    }
    const { fetch, calls } = queuedFetch([jsonResponse({ success: true, data: { balance } })])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    await expect(client.getCreditBalance()).resolves.toEqual(balance)
    expect(calls[0]?.url).toBe('http://api.test/api/account/points')
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.credentials).toBe('include')
  })

  it('accepts director tasks returned by the admin task center', async () => {
    const task = {
      id: 'director-task-1',
      type: 'director.phase',
      domain: 'director',
      status: 'failed',
      priority: 0,
      attempts: 1,
      maxAttempts: 1,
      nextRunAt: '2026-08-11T00:00:00.000Z',
      createdAt: '2026-08-11T00:00:00.000Z',
      updatedAt: '2026-08-11T00:00:01.000Z',
      recordId: 'record-1',
      userId: 'user_1',
      traceId: 'trace-1',
      author: { id: 'user_1', displayName: null },
      recordContext: { modelId: 'qwen-plus', category: 'text' },
      error: {
        category: 'provider',
        message: 'provider failed',
        retriable: false,
        code: 'PROVIDER_ERROR',
      },
      durationMs: 1000,
    }
    const { fetch, calls } = queuedFetch([jsonResponse({ success: true, data: { items: [task] } })])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const result = await client.adminListTasks({ limit: 20 })

    expect(result.items[0]?.domain).toBe('director')
    expect(calls[0]?.url).toBe('http://api.test/api/admin/tasks?limit=20')
    expect(calls[0]?.credentials).toBe('include')
  })

  it('accepts canvas tasks with execution diagnostic fields', async () => {
    const task = {
      id: 'canvas-task-1',
      type: 'canvas.execute',
      domain: 'canvas',
      status: 'failed',
      priority: 0,
      attempts: 1,
      maxAttempts: 3,
      nextRunAt: '2026-08-30T00:00:00.000Z',
      startedAt: '2026-08-30T00:00:01.000Z',
      completedAt: '2026-08-30T00:00:03.000Z',
      createdAt: '2026-08-30T00:00:00.000Z',
      updatedAt: '2026-08-30T00:00:03.000Z',
      recordId: 'canvas-1',
      error: {
        category: 'validation',
        message: 'Canvas node failed',
        retriable: false,
        code: 'CANVAS_NODE_FAILED',
      },
      durationMs: 2_000,
    }
    const { fetch, calls } = queuedFetch([jsonResponse({ success: true, data: { items: [task] } })])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    await expect(client.adminListTasks({ domain: 'canvas' })).resolves.toMatchObject({
      items: [{ domain: 'canvas', type: 'canvas.execute', durationMs: 2_000 }],
    })
    expect(calls[0]?.url).toBe('http://api.test/api/admin/tasks?domain=canvas')
  })

  it('parses canvas cost analytics in the admin analytics response', async () => {
    const { fetch, calls } = queuedFetch([jsonResponse({
      success: true,
      data: {
        window: { from: '2026-08-01T00:00:00.000Z', to: '2026-08-31T00:00:00.000Z' },
        costMargin: [],
        retention: { registered: 0, firstGeneration: 0, firstSuccess: 0, activeTwoDays: 0 },
        canvas: {
          executions: 2,
          generationCalls: 3,
          cacheHitNodes: 1,
          accountedCents: 420,
          byModel: [{ modelId: 'qwen-image', label: '通义万相', calls: 3, accountedCents: 420 }],
        },
      },
    })])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    await expect(client.adminGetAnalytics({ days: 30 })).resolves.toMatchObject({
      canvas: { executions: 2, generationCalls: 3, cacheHitNodes: 1 },
    })
    expect(calls[0]?.url).toBe('http://api.test/api/admin/stats/analytics?days=30')
  })

  it('lists, reviews, and removes director entity candidates through the typed client', async () => {
    const candidate = {
      id: 'entity-candidate-1',
      projectId: 'project-1',
      kind: 'character',
      name: '林默',
      description: '沉默寡言的调查记者',
      traits: ['克制', '敏锐'],
      status: 'provisional',
      mentions: [{ text: '林默', start: 0, end: 2 }],
      reviewedBy: null,
      reviewedAt: null,
      createdAt: '2026-08-30T00:00:00.000Z',
      updatedAt: '2026-08-30T00:00:00.000Z',
    }
    const accepted = {
      ...candidate,
      status: 'accepted',
      reviewedBy: 'user-1',
      reviewedAt: '2026-08-30T00:01:00.000Z',
    }
    const { fetch, calls } = queuedFetch([
      jsonResponse({ success: true, data: [candidate] }),
      jsonResponse({ success: true, data: accepted }),
      jsonResponse({ success: true, data: { deleted: true } }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const candidates = await client.listDirectorEntityCandidates('project/1', {
      status: 'provisional',
      kind: 'character',
    })
    const reviewed = await client.reviewDirectorEntityCandidate('entity/candidate-1', { status: 'accepted' })
    await client.deleteDirectorEntityCandidate('entity/candidate-1')

    expect(candidates[0]?.mentions[0]?.text).toBe('林默')
    expect(reviewed.status).toBe('accepted')
    expect(calls.map(call => [call.method, call.url, call.body])).toEqual([
      [
        'GET',
        'http://api.test/api/director/projects/project%2F1/entity-candidates?status=provisional&kind=character',
        undefined,
      ],
      [
        'PATCH',
        'http://api.test/api/director/entity-candidates/entity%2Fcandidate-1',
        JSON.stringify({ status: 'accepted' }),
      ],
      ['DELETE', 'http://api.test/api/director/entity-candidates/entity%2Fcandidate-1', undefined],
    ])
    expect(calls.every(call => call.credentials === 'include')).toBe(true)
  })

  it('reads request parameters and signed input assets for an admin task', async () => {
    const { fetch, calls } = queuedFetch([
      jsonResponse({
        success: true,
        data: {
          context: {
            recordId: 'record-1',
            modelId: 'wanx2.1-t2i-turbo',
            category: 'image',
            inputParams: { prompt: '一只戴墨镜的柴犬' },
            inputAssets: [
              {
                parameterName: 'reference_images',
                position: 0,
                asset: {
                  id: 'asset-reference-1',
                  kind: 'image',
                  source: 'upload',
                  url: 'https://signed.example/reference-1.png',
                },
              },
            ],
          },
        },
      }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const context = await client.adminGetTaskRequestContext('task-1')

    if (context === null || context.kind === 'canvas') throw new Error('expected generation task context')
    expect(context.inputParams).toEqual({ prompt: '一只戴墨镜的柴犬' })
    expect(context.inputAssets[0]?.asset.url).toContain('signed.example')
    expect(calls[0]?.url).toBe('http://api.test/api/admin/tasks/task-1/request-context')
    expect(calls[0]?.credentials).toBe('include')
  })

  it('parses Canvas node diagnostics from an admin task context', async () => {
    const { fetch } = queuedFetch([
      jsonResponse({
        success: true,
        data: {
          context: {
            kind: 'canvas',
            documentId: 'canvas-1',
            documentRevision: 3,
            cachePolicy: 'reuse',
            assets: [{
              id: 'asset-canvas-output-1',
              kind: 'image',
              source: 'generation',
              url: '/signed/output.png?ttl=3600',
              thumbnailUrl: '/signed/output-thumb.png?ttl=3600',
              thumbnailStatus: 'ready',
              createdAt: '2026-08-30T00:00:03.000Z',
            }],
            nodes: [{
              nodeId: 'node-1',
              kind: 'image',
              modelId: 'qwen-image',
              params: { prompt: '一只戴墨镜的柴犬' },
              assetRefs: {},
              dependencyBindings: {},
              dependsOn: [],
              status: 'succeeded',
              generationId: 'generation-canvas-1',
              assetIds: ['asset-canvas-output-1'],
              cacheHit: false,
              generationStatus: 'succeeded',
              accountedCents: 120,
            }],
          },
        },
      }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const context = await client.adminGetTaskRequestContext('canvas-task-1')

    expect(context?.kind).toBe('canvas')
    if (context?.kind !== 'canvas') throw new Error('expected Canvas task context')
    expect(context.nodes[0]).toMatchObject({
      nodeId: 'node-1',
      generationId: 'generation-canvas-1',
      accountedCents: 120,
    })
    expect(context.assets?.[0]).toMatchObject({
      id: 'asset-canvas-output-1',
      thumbnailUrl: '/signed/output-thumb.png?ttl=3600',
    })
  })

  it('creates a generation with stable asset references and no client-supplied userId', async () => {
    const { fetch, calls } = queuedFetch([
      jsonResponse({
        success: true,
        data: {
          record,
          task: { id: 'task_1', type: 'generation.submit', status: 'queued' },
          event: { type: 'generation.status' },
        },
      }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const result = await client.createGeneration({
      modelId: 'qwen-image',
      params: { prompt: 'lantern' },
      assetRefs: { image: 'asset_input_1' },
    })

    expect(result.record.id).toBe('rec_1')
    expect(result.task.type).toBe('generation.submit')
    expect(calls[0]?.method).toBe('POST')
    // body 中不含 userId —— API 从 session cookie 推导。
    expect(calls[0]?.body).toEqual(
      JSON.stringify({
        modelId: 'qwen-image',
        params: { prompt: 'lantern' },
        assetRefs: { image: 'asset_input_1' },
      }),
    )
    expect(calls[0]?.credentials).toBe('include')
  })

  it('preserves ordered multi-asset references in generation requests', async () => {
    const { fetch, calls } = queuedFetch([
      jsonResponse({
        success: true,
        data: {
          record,
          task: { id: 'task_1', type: 'generation.submit', status: 'queued' },
          event: { type: 'generation.status' },
        },
      }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    await client.createGeneration({
      modelId: 'qwen-image-edit',
      params: { prompt: 'combine' },
      assetRefs: { image: ['asset-a', 'asset-b'] },
    })

    expect(calls[0]?.body).toEqual(
      JSON.stringify({
        modelId: 'qwen-image-edit',
        params: { prompt: 'combine' },
        assetRefs: { image: ['asset-a', 'asset-b'] },
      }),
    )
  })

  it('passes batchId through to the request body for compare-mode grouping', async () => {
    const { fetch, calls } = queuedFetch([
      jsonResponse({
        success: true,
        data: {
          record,
          task: { id: 'task_1', type: 'generation.submit', status: 'queued' },
          event: { type: 'generation.status' },
        },
      }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    await client.createGeneration({
      modelId: 'qwen-image',
      params: { prompt: 'lantern' },
      batchId: 'batch_compare_1',
    })

    expect(calls[0]?.body).toEqual(
      JSON.stringify({
        modelId: 'qwen-image',
        params: { prompt: 'lantern' },
        batchId: 'batch_compare_1',
      }),
    )
  })

  it('parses the estimate success envelope used by the API route', async () => {
    const { fetch, calls } = queuedFetch([
      jsonResponse({
        success: true,
        data: {
          estimate: {
            modelId: 'qwen-image',
            provider: 'dashscope',
            providerModel: 'qwen-image',
            category: 'image',
            params: { prompt: 'lantern', n: 1, size: '1328*1328' },
            costEstimate: 20,
            currency: 'CNY',
            credits: { availableCents: 100, reservedCents: 0, canAfford: true },
            usage: {
              attemptCount: 0,
              successfulCount: 0,
              generationCount: 0,
              estimatedCents: 0,
              chargedCents: 0,
              providerCostCents: 0,
            },
            limits: { dailyQuotaMode: 'attempts' },
          },
        },
      }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const estimate = await client.estimateGeneration({
      modelId: 'qwen-image',
      params: { prompt: 'lantern', n: 1, size: '1328*1328' },
    })

    expect(estimate.modelId).toBe('qwen-image')
    expect(estimate.costEstimate).toBe(20)
    expect(calls[0]?.url).toBe('http://api.test/api/generations/estimate')
    expect(calls[0]?.credentials).toBe('include')
  })

  it('lists generations with optional cursor and multi-view filters (no userId)', async () => {
    const { fetch, calls } = queuedFetch([
      jsonResponse({
        success: true,
        data: { items: [record], nextCursor: 'cur_2' },
      }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const result = await client.listGenerations({
      limit: 10,
      cursor: 'cur_1',
      views: ['completed', 'hidden'],
    })

    expect(result.items).toHaveLength(1)
    expect(result.nextCursor).toBe('cur_2')
    expect(calls[0]?.url).not.toContain('userId=')
    expect(calls[0]?.url).toContain('limit=10')
    expect(calls[0]?.url).toContain('cursor=cur_1')
    expect(calls[0]?.url).toContain('views=completed%2Chidden')
  })

  it('exposes an SSE URL without a userId query (cookie-based)', () => {
    const { fetch } = queuedFetch([])
    const client = createApiClient({ baseUrl: 'http://api.test/', fetch })

    expect(client.generationEventsUrl()).toBe('http://api.test/api/generations/events')
  })

  it('throws ApiClientError with the server code on an error envelope', async () => {
    const details = {
      issues: [
        {
          code: 'UNKNOWN_PARAMETER',
          field: 'retiredSeed',
          messages: {
            'zh-CN': '参数已废弃',
            'en-US': 'The parameter is retired',
          },
          expected: {
            'zh-CN': '请删除该参数',
            'en-US': 'Remove this parameter',
          },
        },
      ],
    }
    const { fetch } = queuedFetch([
      jsonResponse({
        success: false,
        error: { code: 'MODEL_NOT_FOUND', message: 'no such model', details },
        traceId: 'request-42',
      }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    await expect(client.getModel('missing')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'MODEL_NOT_FOUND',
      message: 'no such model',
      details,
      traceId: 'request-42',
    })
    expect(() => {
      throw new ApiClientError('X', 'y')
    }).toThrow(ApiClientError)
  })

  it('preserves a sanitized server cause and traceId', async () => {
    const { fetch } = queuedFetch([
      jsonResponse(
        {
          success: false,
          error: {
            code: 'INTERNAL_ERROR',
            message: 'operation failed',
            cause: 'database unavailable',
          },
          traceId: 'request-43',
        },
        500,
      ),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    await expect(client.getModels()).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'operation failed',
      traceId: 'request-43',
    })
  })

  it('throws ApiClientError NETWORK_ERROR when fetch rejects', async () => {
    const failing: typeof fetch = Object.assign(async () => {
      throw new TypeError('connection refused')
    }, fetch)
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: failing,
    })

    await expect(client.getModels()).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'NETWORK_ERROR',
    })
  })

  it('fetches a single generation with its artifacts and input params', async () => {
    const fullRecord = {
      ...record,
      status: 'succeeded',
      costFinal: 20,
      outputResult: {
        artifacts: [{ kind: 'image', sourceUrl: 'https://cdn.test/a.png' }],
      },
    }
    const { fetch, calls } = queuedFetch([jsonResponse({ success: true, data: fullRecord })])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const result = await client.getGeneration('rec_1')

    expect(result.id).toBe('rec_1')
    expect(result.status).toBe('succeeded')
    expect(result.inputParams.prompt).toBe('lantern')
    expect(result.outputResult?.artifacts[0]?.sourceUrl).toBe('https://cdn.test/a.png')
    expect(calls[0]?.url).toBe('http://api.test/api/generations/rec_1')
  })

  it('fetches safe generation diagnostics', async () => {
    const { fetch, calls } = queuedFetch([
      jsonResponse({
        success: true,
        data: {
          generationId: 'rec_1',
          traceId: 'trace_1',
          generationDurationMs: 1200,
          tasks: [
            {
              id: 'task_1',
              type: 'generation.submit',
              status: 'succeeded',
              attempts: 1,
              maxAttempts: 3,
              createdAt: '2026-06-29T00:00:00.000Z',
              startedAt: '2026-06-29T00:00:00.010Z',
              completedAt: '2026-06-29T00:00:00.100Z',
              updatedAt: '2026-06-29T00:00:00.100Z',
              durationMs: 90,
            },
          ],
          providerRequests: [],
        },
      }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const result = await client.getGenerationDiagnostics('rec_1')

    expect(result.traceId).toBe('trace_1')
    expect(result.tasks[0]?.durationMs).toBe(90)
    expect(calls[0]?.url).toBe('http://api.test/api/generations/rec_1/diagnostics')
  })

  it('lists persisted generation artifacts with read URLs', async () => {
    const artifact = {
      id: 'artifact_1',
      recordId: 'rec_1',
      userId: 'user_1',
      kind: 'image',
      sourceUrl: 'https://cdn.test/a.png',
      mimeType: 'image/png',
      storageProvider: 'local',
      storageKey: 'generations/rec_1/artifact_1.png',
      readUrl: '/signed/generations/rec_1/artifact_1.png?ttl=3600',
      byteSize: 123,
      status: 'stored',
      createdAt: '2026-06-29T00:00:00.000Z',
      updatedAt: '2026-06-29T00:00:00.000Z',
    }
    const { fetch, calls } = queuedFetch([jsonResponse({ success: true, data: { items: [artifact] } })])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const result = await client.listGenerationArtifacts('rec_1')

    expect(result.items[0]?.readUrl).toBe('/signed/generations/rec_1/artifact_1.png?ttl=3600')
    expect(result.items[0]?.status).toBe('stored')
    expect(calls[0]?.url).toBe('http://api.test/api/generations/rec_1/artifacts')
  })

  it('lists library artifacts with optional cursor and kind query params', async () => {
    const artifact = {
      id: 'artifact_1',
      recordId: 'rec_1',
      userId: 'user_1',
      kind: 'image',
      storageKey: 'generations/rec_1/artifact_1.png',
      readUrl: '/signed/generations/rec_1/artifact_1.png?ttl=3600',
      status: 'stored',
      createdAt: '2026-06-29T00:00:00.000Z',
      updatedAt: '2026-06-29T00:00:00.000Z',
    }
    const { fetch, calls } = queuedFetch([
      jsonResponse({
        success: true,
        data: { items: [artifact], nextCursor: 'cur_2' },
      }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const result = await client.listArtifacts({
      limit: 20,
      cursor: 'cur_1',
      kind: 'image',
    })

    expect(result.items).toHaveLength(1)
    expect(result.nextCursor).toBe('cur_2')
    expect(calls[0]?.url).toBe('http://api.test/api/artifacts?limit=20&cursor=cur_1&kind=image')
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.credentials).toBe('include')
  })

  it('lists assets with server sort, declared resolution, and escaped filters for Library reuse', async () => {
    const asset: AssetItem = {
      id: 'asset_audio_1',
      kind: 'audio',
      source: 'derived',
      url: '/signed/media-jobs/job_1/asset_audio_1.mp3?ttl=3600',
      mimeType: 'audio/mpeg',
      byteSize: 2048,
      declaredResolution: '1920×1080',
      createdAt: '2026-07-01T00:00:00.000Z',
    }
    const { fetch, calls } = queuedFetch([jsonResponse({ success: true, data: { items: [asset] } })])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const result = await client.listAssets({
      kind: 'audio',
      source: 'derived',
      sort: 'size',
      q: 'voice & mix',
    })

    expect(result.items[0]?.source).toBe('derived')
    expect(result.items[0]?.kind).toBe('audio')
    expect(result.items[0]?.declaredResolution).toBe('1920×1080')
    expect(calls[0]?.url).toBe('http://api.test/api/assets?kind=audio&source=derived&sort=size&q=voice+%26+mix')
    expect(calls[0]?.credentials).toBe('include')
  })

  it('rejects non-string declared resolution asset metadata', async () => {
    const { fetch } = queuedFetch([
      jsonResponse({
        success: true,
        data: {
          items: [
            {
              id: 'asset_bad_resolution',
              kind: 'image',
              source: 'generation',
              declaredResolution: 1920,
              createdAt: '2026-07-01T00:00:00.000Z',
            },
          ],
        },
      }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    await expect(client.listAssets()).rejects.toMatchObject({
      code: 'BAD_RESPONSE',
    })
  })

  it('reads asset capabilities and detail, then deletes the owned asset', async () => {
    const asset: AssetItem = {
      id: 'asset_video_1',
      kind: 'video',
      source: 'upload',
      url: '/signed/asset_video_1.mp4',
      downloadUrl: '/signed/asset_video_1.mp4?download=1',
      mimeType: 'video/mp4',
      createdAt: '2026-07-25T00:00:00.000Z',
    }
    const capabilities: AssetCapabilities = {
      maxAssetSizeBytes: 104857600,
      maxMediaDurationSeconds: 1800,
      allowedMimeTypes: ['video/mp4'],
      allowedKinds: ['image', 'video', 'audio', 'text', 'archive'],
    }
    const { fetch, calls } = queuedFetch([
      jsonResponse({ success: true, data: capabilities }),
      jsonResponse({ success: true, data: { asset } }),
      new Response(null, { status: 204 }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    await expect(client.getAssetCapabilities()).resolves.toEqual(capabilities)
    await expect(client.getAsset('asset/video 1')).resolves.toEqual(asset)
    await client.deleteAsset('asset/video 1')

    expect(calls.map(call => [call.method, call.url])).toEqual([
      ['GET', 'http://api.test/api/assets/capabilities'],
      ['GET', 'http://api.test/api/assets/asset%2Fvideo%201'],
      ['DELETE', 'http://api.test/api/assets/asset%2Fvideo%201'],
    ])
    expect(calls.every(call => call.credentials === 'include')).toBe(true)
  })

  it('reports browser upload progress and keeps the session cookie on XMLHttpRequest uploads', async () => {
    const asset: AssetItem = {
      id: 'asset_image_1',
      kind: 'image',
      source: 'upload',
      url: '/signed/asset_image_1.png',
      mimeType: 'image/png',
      createdAt: '2026-07-25T00:00:00.000Z',
    }
    const originalXmlHttpRequest = globalThis.XMLHttpRequest

    class FakeXmlHttpRequest extends EventTarget {
      static last: FakeXmlHttpRequest | undefined
      readonly upload = new EventTarget()
      method = ''
      url = ''
      withCredentials = false
      status = 0
      responseText = ''

      constructor() {
        super()
        FakeXmlHttpRequest.last = this
      }

      open(method: string, url: string) {
        this.method = method
        this.url = url
      }

      send() {
        const progress = new Event('progress')
        Object.defineProperties(progress, {
          lengthComputable: { value: true },
          loaded: { value: 25 },
          total: { value: 100 },
        })
        this.upload.dispatchEvent(progress)
        this.status = 200
        this.responseText = JSON.stringify({ success: true, data: { asset } })
        this.dispatchEvent(new Event('load'))
      }

      abort() {
        this.dispatchEvent(new Event('abort'))
      }
    }

    Object.defineProperty(globalThis, 'XMLHttpRequest', {
      configurable: true,
      value: FakeXmlHttpRequest,
    })

    try {
      const progress: Array<[number, number]> = []
      const client = createApiClient({ baseUrl: 'http://api.test' })
      const result = await client.uploadAsset({
        file: new File(['image'], 'reference.png', { type: 'image/png' }),
        kind: 'image',
        onProgress: (loaded, total) => progress.push([loaded, total]),
      })

      expect(result).toEqual(asset)
      expect(progress).toEqual([[25, 100]])
      expect(FakeXmlHttpRequest.last?.method).toBe('POST')
      expect(FakeXmlHttpRequest.last?.url).toBe('http://api.test/api/assets/upload')
      expect(FakeXmlHttpRequest.last?.withCredentials).toBe(true)
    } finally {
      Object.defineProperty(globalThis, 'XMLHttpRequest', {
        configurable: true,
        value: originalXmlHttpRequest,
      })
    }
  })

  it('cancels a generation via POST with credentials', async () => {
    const { fetch, calls } = queuedFetch([
      jsonResponse({
        success: true,
        data: { record: { ...record, providerCancelStatus: 'requested' } },
      }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const result = await client.cancelGeneration('rec_1')

    expect(result.record.providerCancelStatus).toBe('requested')
    expect(calls[0]?.url).toBe('http://api.test/api/generations/rec_1/cancel')
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.credentials).toBe('include')
    expect(calls[0]?.body).toBeUndefined()
  })

  it('retries a generation and only sends a body when idempotencyKey is provided', async () => {
    const retriedRecord = { ...record, id: 'rec_2', parentRecordId: 'rec_1' }
    // 两次调用：一次带 idempotencyKey（发 JSON body），一次不带（空 POST）。
    const { fetch, calls } = queuedFetch([
      jsonResponse({
        success: true,
        data: {
          record: retriedRecord,
          task: { id: 'task_2', type: 'generation.submit', status: 'queued' },
          event: { type: 'generation.status' },
        },
      }),
      jsonResponse({
        success: true,
        data: {
          record: retriedRecord,
          task: { id: 'task_2', type: 'generation.submit', status: 'queued' },
          event: { type: 'generation.status' },
        },
      }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const withKey = await client.retryGeneration('rec_1', {
      idempotencyKey: 'retry-1',
    })
    const withoutKey = await client.retryGeneration('rec_1')

    expect(withKey.record.id).toBe('rec_2')
    expect(withKey.record.parentRecordId).toBe('rec_1')
    expect(calls[0]?.url).toBe('http://api.test/api/generations/rec_1/retry')
    expect(calls[0]?.body).toEqual(JSON.stringify({ idempotencyKey: 'retry-1' }))
    expect(calls[1]?.body).toBeUndefined()
    expect(withoutKey.record.id).toBe('rec_2')
  })

  it('changes only the generation library state via PATCH', async () => {
    const hiddenRecord = {
      ...record,
      hiddenAt: '2026-07-31T10:00:00.000Z',
    }
    const { fetch, calls } = queuedFetch([jsonResponse({ success: true, data: { record: hiddenRecord } })])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const result = await client.setGenerationLibraryState('rec_1', 'hidden')

    expect(result.hiddenAt).toBe('2026-07-31T10:00:00.000Z')
    expect(calls[0]?.url).toBe('http://api.test/api/generations/rec_1/library-state')
    expect(calls[0]?.method).toBe('PATCH')
    expect(calls[0]?.credentials).toBe('include')
    expect(calls[0]?.body).toBe(JSON.stringify({ state: 'hidden' }))
  })

  it('throws ApiClientError GENERATION_NOT_FOUND on a 404 envelope', async () => {
    const { fetch } = queuedFetch([
      jsonResponse(
        {
          success: false,
          error: {
            code: 'GENERATION_NOT_FOUND',
            message: 'Generation not found: x',
          },
        },
        404,
      ),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    await expect(client.getGeneration('x')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'GENERATION_NOT_FOUND',
    })
  })

  it('logs in via the auth cookie flow and returns the user', async () => {
    const { fetch, calls } = queuedFetch([jsonResponse({ success: true, data: { user } })])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const result = await client.login({
      email: 'a@b.test',
      password: 'password1',
    })

    expect(result).toEqual(user)
    expect(calls[0]?.url).toBe('http://api.test/api/auth/login')
    expect(calls[0]?.credentials).toBe('include')
  })

  it('returns null from getCurrentUser on a 401, rethrows other errors', async () => {
    const unauth = queuedFetch([
      jsonResponse({ success: false, error: { code: 'AUTH_UNAUTHORIZED', message: 'no' } }, 401),
    ])
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetch: unauth.fetch,
    })

    expect(await client.getCurrentUser()).toBeNull()

    const serverError = queuedFetch([
      jsonResponse({ success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } }, 500),
    ])
    const erroring = createApiClient({
      baseUrl: 'http://api.test',
      fetch: serverError.fetch,
    })
    await expect(erroring.getCurrentUser()).rejects.toMatchObject({
      code: 'INTERNAL_ERROR',
    })
  })

  it('fetches a generation share via GET', async () => {
    const share = {
      id: 'share_1',
      recordId: 'rec_1',
      userId: 'user_1',
      includeParams: false,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    }
    const { fetch, calls } = queuedFetch([jsonResponse({ success: true, data: { share } })])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const result = await client.getGenerationShare('rec_1')

    expect(result.share.id).toBe('share_1')
    expect(calls[0]?.url).toBe('http://api.test/api/generations/rec_1/share')
    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.credentials).toBe('include')
  })

  it('starts and reads a canvas execution through the typed client', async () => {
    const execution = {
      id: 'canvas_execution_1',
      documentId: 'canvas_1',
      documentRevision: 2,
      status: 'queued' as const,
      nodeStatuses: [{
        nodeId: 'node_1',
        status: 'queued' as const,
        startedAt: '2026-08-30T00:00:01.000Z',
      }],
      startedAt: '2026-08-30T00:00:01.000Z',
      createdAt: '2026-08-30T00:00:00.000Z',
      updatedAt: '2026-08-30T00:00:00.000Z',
    }
    const { fetch, calls } = queuedFetch([
      jsonResponse({ success: true, data: { execution } }),
      jsonResponse({
        success: true,
        data: { execution: { ...execution, status: 'running' as const } },
      }),
      jsonResponse({
        success: true,
        data: {
          execution: {
            ...execution,
            status: 'cancelled' as const,
            completedAt: '2026-08-30T00:00:03.000Z',
            durationMs: 2_000,
            errorCode: 'CANVAS_EXECUTION_CANCELLED',
            nodeStatuses: [{
              ...execution.nodeStatuses[0],
              status: 'failed' as const,
              completedAt: '2026-08-30T00:00:02.000Z',
              durationMs: 1_000,
              errorCode: 'CANVAS_GENERATION_CANCELLED',
              error: 'cancelled',
            }],
          },
        },
      }),
      jsonResponse({
        success: true,
        data: { execution: { ...execution, status: 'queued' as const } },
      }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    expect(
      await client.executeCanvas('canvas_1', {
        expectedRevision: 2,
        idempotencyKey: 'run-1',
      }),
    ).toEqual(execution)
    expect(client.canvasExecutionEventsUrl('canvas 1', execution.id)).toBe(
      'http://api.test/api/canvases/canvas%201/executions/canvas_execution_1/events',
    )
    expect(await client.getCanvasExecution('canvas_1', execution.id)).toMatchObject({ status: 'running' })
    expect(await client.cancelCanvasExecution('canvas_1', execution.id)).toMatchObject({ status: 'cancelled' })
    expect(await client.retryCanvasNode('canvas 1', execution.id, 'node 1', { idempotencyKey: 'retry-1' }))
      .toMatchObject({ status: 'queued' })
    expect(calls.map(call => [call.method, call.url])).toEqual([
      ['POST', 'http://api.test/api/canvases/canvas_1/execute'],
      ['GET', 'http://api.test/api/canvases/canvas_1/executions/canvas_execution_1'],
      ['POST', 'http://api.test/api/canvases/canvas_1/executions/canvas_execution_1/cancel'],
      ['POST', 'http://api.test/api/canvases/canvas%201/executions/canvas_execution_1/nodes/node%201/retry'],
    ])
    expect(calls[3]?.body).toBe(JSON.stringify({ idempotencyKey: 'retry-1' }))
  })

  it('lists canvas execution history with a keyset cursor', async () => {
    const execution = {
      id: 'canvas_execution_history_1',
      documentId: 'canvas_1',
      documentRevision: 2,
      status: 'succeeded' as const,
      nodeStatuses: [{ nodeId: 'node_1', status: 'succeeded' as const, assetIds: ['asset_1'] }],
      createdAt: '2026-08-30T00:00:00.000Z',
      updatedAt: '2026-08-30T00:00:01.000Z',
    }
    const { fetch, calls } = queuedFetch([
      jsonResponse({ success: true, data: { items: [execution], nextCursor: 'next-page' } }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    await expect(client.listCanvasExecutions('canvas 1', { limit: 10, cursor: 'previous page' })).resolves.toEqual({
      items: [execution],
      nextCursor: 'next-page',
    })
    expect(calls[0]?.url).toBe(
      'http://api.test/api/canvases/canvas%201/executions?limit=10&cursor=previous+page',
    )
  })

  it('registers without a session and completes the verified email lifecycle', async () => {
    const registration: RegistrationResult = {
      status: 'verification_required',
      email: 'a@b.test',
      displayEmail: '***@b.test',
      resendAvailableAt: '2026-07-25T00:01:00.000Z',
    }
    const { fetch, calls } = queuedFetch([
      jsonResponse({ success: true, data: { registration } }),
      jsonResponse({ success: true, data: { user } }),
      jsonResponse({
        success: true,
        data: { accepted: true, retryAt: '2026-07-25T00:02:00.000Z' },
      }),
      jsonResponse({ success: true, data: { accepted: true } }),
      new Response(null, { status: 204 }),
      jsonResponse({ success: true, data: { user } }),
      new Response(null, { status: 204 }),
    ])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    const result = await client.register({
      email: 'a@b.test',
      password: 'password1',
      displayName: 'A',
    })
    const verified = await client.verifyEmail({ token: 'verify-token' })
    const resent = await client.resendVerification({ email: 'a@b.test' })
    const forgot = await client.forgotPassword({ email: 'a@b.test' })
    await client.resetPassword({
      token: 'reset-token',
      newPassword: 'password2',
    })
    const changed = await client.changePassword({
      currentPassword: 'password2',
      newPassword: 'password3',
    })
    await client.logoutAll()

    expect(result).toEqual(registration)
    expect(verified).toEqual(user)
    expect(resent.retryAt).toBe('2026-07-25T00:02:00.000Z')
    expect(forgot.accepted).toBe(true)
    expect(changed).toEqual(user)
    expect(calls[0]?.url).toBe('http://api.test/api/auth/register')
    expect(calls[0]?.body).toEqual(
      JSON.stringify({
        email: 'a@b.test',
        password: 'password1',
        displayName: 'A',
      }),
    )
    expect(calls.map(call => [call.method, call.url])).toEqual([
      ['POST', 'http://api.test/api/auth/register'],
      ['POST', 'http://api.test/api/auth/verify-email'],
      ['POST', 'http://api.test/api/auth/resend-verification'],
      ['POST', 'http://api.test/api/auth/forgot-password'],
      ['POST', 'http://api.test/api/auth/reset-password'],
      ['POST', 'http://api.test/api/auth/change-password'],
      ['POST', 'http://api.test/api/auth/logout-all'],
    ])
    expect(calls.every(call => call.credentials === 'include')).toBe(true)
  })

  it('logs out via the session cookie', async () => {
    const { fetch, calls } = queuedFetch([new Response(null, { status: 204 })])
    const client = createApiClient({ baseUrl: 'http://api.test', fetch })

    await client.logout()

    expect(calls[0]?.url).toBe('http://api.test/api/auth/logout')
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.credentials).toBe('include')
  })
})
