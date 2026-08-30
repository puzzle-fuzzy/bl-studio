import { describe, expect, it } from 'vitest'
import type { ModelCatalog } from '@bailian-studio/model-core'
import { createTestApp } from '../src/test-app'

const { app } = createTestApp()

describe('model routes', () => {
  it('returns enabled model catalog', async () => {
    const response = await app.handle(new Request('http://localhost/api/models/catalog'))
    const body = await response.json() as {
      success: true
      data: {
        items: Array<{
          id: string
          operation: string
          referenceFormat?: string
        }>
      }
    }

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.items.map(item => item.id)).toContain('qwen-image')
    expect(body.data.items.map(item => item.id)).toContain('wanx-text-to-video')
    expect(body.data.items.map(item => item.id)).toContain('deepseek-v4-pro')
    expect(body.data.items.map(item => item.id)).toContain('deepseek-v4-flash')
    expect(
      body.data.items.find(item => item.id === 'wanx-text-to-video')?.operation,
    ).toBe('video.text-to-video')
    expect(
      body.data.items.find(item => item.id === 'vidu-reference-video')
        ?.referenceFormat,
    ).toBe('image-bracket')
  })

  it('returns a single model by id', async () => {
    const response = await app.handle(new Request('http://localhost/api/models/qwen-image'))
    const body = await response.json() as {
      success: true
      data: { id: string; operation: string }
    }

    expect(response.status).toBe(200)
    expect(body.data.id).toBe('qwen-image')
    expect(body.data.operation).toBe('image.text-to-image')
  })

  it('reads the catalog through the injected provider-neutral port', async () => {
    const item = {
      id: 'mock-image',
      provider: 'mock-provider',
      providerModel: 'mock-image-v1',
      displayName: 'Mock image',
      category: 'image' as const,
      operation: 'image.text-to-image',
      taskMode: 'sync' as const,
      capabilities: [],
      parameters: [],
      availability: { enabled: true, stage: 'stable' as const },
    }
    const catalog: ModelCatalog = {
      list: () => [item],
      getById: (id) => (id === item.id ? item : undefined),
    }
    const injectedApp = createTestApp({ modelCatalog: catalog }).app
    const response = await injectedApp.handle(
      new Request('http://localhost/api/models/mock-image'),
    )
    const body = await response.json() as {
      success: true
      data: { id: string; provider: string }
    }

    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({
      id: 'mock-image',
      provider: 'mock-provider',
      providerModel: 'mock-image-v1',
      displayName: 'Mock image',
      category: 'image',
      operation: 'image.text-to-image',
      taskMode: 'sync',
      capabilities: [],
      parameters: [],
      availability: { enabled: true, stage: 'stable' },
    })
  })

  it('returns 404 for an unknown model', async () => {
    const response = await app.handle(new Request('http://localhost/api/models/missing', {
      headers: { 'x-request-id': 'model-inline-error-1' },
    }))
    const body = await response.json() as { success: false; error: { code: string; message: string }; traceId?: string }

    expect(response.status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error.code).toBe('MODEL_NOT_FOUND')
    expect(body.error.message).toBe('Model not found')
    expect(body.traceId).toBe('model-inline-error-1')
    expect(response.headers.get('x-trace-id')).toBe('model-inline-error-1')
  })
})
