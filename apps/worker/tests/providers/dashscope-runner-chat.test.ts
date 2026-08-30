import { expect, test } from 'vitest'
import { DashScopeProviderRunner } from '../../src/providers/dashscope-runner'
import type { DashScopeClient } from '@bailian-studio/provider-dashscope'
import type { FrozenModelManifest } from '@bailian-studio/dashscope-manifests'

function createMockClient(overrides?: Partial<DashScopeClient>): DashScopeClient {
  return {
    submit: async () => { throw new Error('unused') },
    poll: async () => { throw new Error('unused') },
    cancel: async () => { throw new Error('unused') },
    chat: async () => ({
      mode: 'completed' as const,
      output: {
        artifacts: [{ kind: 'text' as const, text: '【场景 1】测试剧本', mimeType: 'text/markdown' }],
        usage: {
          promptTokens: 100,
          completionTokens: 50,
          promptTokensDetails: { textTokens: 80, audioTokens: 20 },
          completionTokensDetails: { textTokens: 50 },
        },
        raw: { text: '【场景 1】测试剧本' },
      },
    }),
    ...overrides,
  }
}

// stream 模式的 manifest stub
const streamManifest = {
  id: 'qwen-omni-screenplay',
  provider: 'dashscope',
  providerModel: 'qwen3.5-omni-plus',
  category: 'video',
  taskMode: 'stream',
  parameters: [
    { name: 'videoUrl', label: 'Video URL', type: 'text', required: true },
    { name: 'language', label: 'Language', type: 'text' },
    { name: 'detailLevel', label: 'Detail level', type: 'text' },
    { name: 'estimatedDuration', label: 'Estimated duration', type: 'number' },
  ],
  request: {
    kind: 'dashscope-chat',
    bindings: {
      videoUrl: { target: 'input.field', field: 'video_url' },
      language: { target: 'input.field', field: 'language' },
      detailLevel: { target: 'input.field', field: 'detail_level' },
      estimatedDuration: { target: 'ui.only' },
    },
    endpoint: '/compatible-mode/v1/chat/completions',
    promptParam: 'prompt',
    stream: true,
  },
  output: { kind: 'text', path: 'output.text' },
  pricing: {
    unit: 'per_second' as const,
    quantityKey: 'estimatedDuration',
    currency: 'CNY' as const,
    rates: [
      { id: 'cn-beijing-visual-text-input-token', region: 'cn-beijing', serviceScope: 'china-mainland', chargeItem: 'input', unit: 'token', unitSize: 1000000, unitPrice: '7', conditions: { mode: 'text-image-video-input' } },
      { id: 'cn-beijing-audio-input-token', region: 'cn-beijing', serviceScope: 'china-mainland', chargeItem: 'input', unit: 'token', unitSize: 1000000, unitPrice: '53', conditions: { mode: 'audio-input' } },
      { id: 'cn-beijing-multimodal-text-output-token', region: 'cn-beijing', serviceScope: 'china-mainland', chargeItem: 'output', unit: 'token', unitSize: 1000000, unitPrice: '40', conditions: { mode: 'multimodal-input-text-output' } },
    ],
  },
  transport: {
    mode: 'stream' as const,
    submit: {
      method: 'POST' as const,
      endpointTemplate: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
      modelFieldPath: '/model',
      headers: [],
    },
    stream: { contentTypes: ['text/event-stream'], framing: 'sse' as const, headers: [] },
  },
  availability: { enabled: true, stage: 'beta' as const },
} as unknown as FrozenModelManifest

function mockFetch(): typeof fetch {
  const f = async (): Promise<Response> => new Response()
  return f as unknown as typeof fetch
}

test('runChat 成功调用并返回剧本文本', async () => {
  const runner = new DashScopeProviderRunner({ apiKey: 'test-key', fetch: mockFetch() })
  ;(runner as unknown as { client: DashScopeClient }).client = createMockClient()

  const result = await runner.execute({
    manifest: streamManifest,
    inputParams: { videoUrl: 'https://example.com/video.mp4', language: 'zh', detailLevel: 'standard', estimatedDuration: 60 },
    taskId: 'task-1',
    estimatedCostCents: 1,
  })

  expect(result.success).toBe(true)
  expect(result.costCents).toBe(1)
  expect(result.requiresPoll).toBe(false)
  expect(result.output).toBeDefined()
  expect(result.output!.artifacts).toHaveLength(1)
  const artifact = result.output!.artifacts[0] as { kind: string; text: string } | undefined
  expect(artifact).toBeDefined()
  expect(artifact!.kind).toBe('text')
  expect(artifact!.text).toBe('【场景 1】测试剧本')
})

test('chat 失败时返回带错误的 ProviderExecuteOutput', async () => {
  const mockClient = createMockClient({
    chat: async () => ({
      mode: 'failed' as const,
      error: {
        category: 'provider' as const,
        message: 'API error',
        retriable: false,
        code: 'PROVIDER_ERROR',
        details: { requestId: 'request-chat-failure' },
      },
    }),
  })

  const runner = new DashScopeProviderRunner({ apiKey: 'test-key', fetch: mockFetch() })
  ;(runner as unknown as { client: DashScopeClient }).client = mockClient

  const result = await runner.execute({
    manifest: streamManifest,
    inputParams: { videoUrl: 'https://example.com/video.mp4' },
    taskId: 'task-2',
    estimatedCostCents: 1,
  })

  expect(result.success).toBe(false)
  expect(result.requiresPoll).toBe(false)
  expect(result.error).toBeDefined()
  expect(result.error!.code).toBe('PROVIDER_ERROR')
  expect(result.error!.details).toEqual({ requestId: 'request-chat-failure' })
})
