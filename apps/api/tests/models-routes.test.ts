import { describe, expect, it } from 'vitest'
import { BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE } from '@bailian-studio/bailian-adapter'
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

  it('exposes the exact Bailian SDK catalog and coverage snapshot', async () => {
    const response = await app.handle(new Request('http://localhost/api/models/bailian-contract'))
    const body = await response.json() as {
      success: true
      data: {
        sdkVersion: string
        catalogRevision: string
        catalogHash: string
        requirementsHash: string
        coverage: {
          totalRequirements: number
          coveredRequirements: number
          legacyRequirements: number
          coveredConsumerIds: string[]
        }
      }
    }

    expect(response.status).toBe(200)
    expect(body.data).toMatchObject({
      sdkVersion: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.sdkVersion,
      catalogRevision: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.catalogRevision,
      catalogHash: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.catalogHash,
      requirementsHash: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.requirementsHash,
      coverage: {
        totalRequirements: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.totalRequirements,
        coveredRequirements: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.coveredRequirements,
        legacyRequirements: BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.uncoveredRequirements,
        coveredConsumerIds: [...BAILIAN_STUDIO_BAILIAN_COVERAGE_BASELINE.coveredConsumerIds],
      },
    })
    expect(body.data.coverage.coveredConsumerIds).toContain('happyhorse-video-edit')
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
