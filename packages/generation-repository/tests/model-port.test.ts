import { describe, expect, it } from 'vitest'
import { getModelById } from '@bailian-studio/dashscope-manifests'
import { estimateGenerationRequest } from '../src'

describe('generation repository model resolver port', () => {
  it('uses the resolver supplied by the composition root', () => {
    const estimate = estimateGenerationRequest(
      { modelId: 'qwen-image', params: { prompt: 'a test image' } },
      { getModelById },
    )

    expect(estimate.manifest.id).toBe('qwen-image')
    expect(estimate.params.prompt).toBe('a test image')
  })

  it('does not fall back to an implicit provider catalog', () => {
    expect(() => estimateGenerationRequest(
      { modelId: 'qwen-image', params: { prompt: 'a test image' } },
      { getModelById: () => undefined },
    )).toThrow('Unknown model: qwen-image')
  })
})
