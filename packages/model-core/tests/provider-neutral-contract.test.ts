import { describe, expect, it } from 'vitest'
import type {
  ModelManifestContract,
  ProviderOutputContract,
  ProviderRequestContract,
  ProviderTransportContract,
} from '../src'
import { readModelParameterBinding } from '../src'

type MockRequest = ProviderRequestContract & {
  kind: 'mock-generate'
  bindings: Readonly<Record<string, { target: 'prompt' | 'options' }>>
  responseMode: 'json'
}

type MockOutput = ProviderOutputContract & {
  kind: 'mock-artifact'
  artifactPath: string
}

type MockTransport = ProviderTransportContract & {
  mode: 'queued'
  submit: { method: 'POST'; route: string }
}

const mockManifest = {
  id: 'mock-image',
  provider: 'mock-provider',
  providerModel: 'mock-image-v1',
  displayName: 'Mock image',
  category: 'image',
  taskMode: 'provider_async',
  capabilities: ['text_prompt'],
  parameters: [
    { name: 'prompt', label: 'Prompt', type: 'text', required: true },
  ],
  request: {
    kind: 'mock-generate',
    endpoint: '/generate',
    bindings: { prompt: { target: 'prompt' } },
    responseMode: 'json',
  },
  output: {
    kind: 'mock-artifact',
    artifactPath: 'result.url',
  },
  pricing: {
    unit: 'per_image',
    quantityKey: 'prompt',
    rates: [],
    currency: 'CNY',
  },
  transport: {
    mode: 'queued',
    submit: { method: 'POST', route: '/jobs' },
  },
  availability: { enabled: true, stage: 'beta' },
} satisfies ModelManifestContract<'mock-provider', MockRequest, MockOutput, MockTransport>

describe('provider-neutral manifest contract', () => {
  it('accepts provider-specific request, output, and transport extensions', () => {
    expect(mockManifest.provider).toBe('mock-provider')
    expect(mockManifest.request.responseMode).toBe('json')
    expect(mockManifest.output.artifactPath).toBe('result.url')
    expect(mockManifest.transport.submit.route).toBe('/jobs')
  })

  it('normalizes provider binding extensions to the shared vocabulary', () => {
    expect(readModelParameterBinding({ target: 'input.media', mediaType: 'reference_image' })).toEqual({
      target: 'input.media',
    })
    expect(readModelParameterBinding({ target: 'input.field', field: 'negative_prompt', wrapInArray: true })).toEqual({
      target: 'input.field',
      field: 'negative_prompt',
    })
    expect(readModelParameterBinding({ target: 'unsupported' })).toBeUndefined()
  })
})
