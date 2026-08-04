import { describe, expect, it } from 'vitest'
import { assertModelManifestConsistent, assertUniqueModelIds, type ModelManifest } from '../src'

function manifest(overrides: Partial<ModelManifest> = {}): ModelManifest {
  return {
    id: 'ok',
    provider: 'dashscope',
    providerModel: 'qwen-image',
    displayName: 'OK',
    category: 'image',
    taskMode: 'sync',
    capabilities: ['text_prompt'],
    parameters: [
      { name: 'prompt', label: 'Prompt', type: 'text', required: true },
      { name: 'n', label: 'Count', type: 'number', defaultValue: 1, min: 1, max: 4, step: 1 },
    ],
    request: { kind: 'dashscope-image-message', endpoint: '/images', bindings: { prompt: { target: 'input.prompt' }, n: { target: 'parameters.field' } } },
    output: { kind: 'images-from-message-content' },
    pricing: { unit: 'per_image', quantityKey: 'n', currency: 'CNY', tiers: [{ condition: {}, priceCents: 10 }] },
    availability: { enabled: true, stage: 'stable' },
    ...overrides,
  }
}

describe('registry checks', () => {
  it('accepts a consistent manifest', () => {
    expect(() => assertModelManifestConsistent(manifest())).not.toThrow()
  })

  it('rejects a required parameter without binding', () => {
    expect(() => assertModelManifestConsistent(manifest({
      request: { kind: 'dashscope-image-message', endpoint: '/images', bindings: {} },
    }))).toThrow(/prompt/)
  })

  it('rejects manifests with no unconditional default tier', () => {
    expect(() => assertModelManifestConsistent(manifest({
      pricing: {
        unit: 'per_image',
        quantityKey: 'n',
        currency: 'CNY',
        tiers: [{ condition: { size: '2048*2048' }, priceCents: 25 }],
      },
    }))).toThrow(/default pricing tier/)
  })

  it('rejects manifests with default tier not first', () => {
    expect(() => assertModelManifestConsistent(manifest({
      pricing: {
        unit: 'per_image',
        quantityKey: 'n',
        currency: 'CNY',
        tiers: [
          { condition: { size: '2048*2048' }, priceCents: 25 },
          { condition: {}, priceCents: 10 },
        ],
      },
    }))).toThrow(/default pricing tier/)
  })

  it('rejects manifests with multiple unconditional default tiers', () => {
    expect(() => assertModelManifestConsistent(manifest({
      pricing: {
        unit: 'per_image',
        quantityKey: 'n',
        currency: 'CNY',
        tiers: [
          { condition: {}, priceCents: 10 },
          { condition: {}, priceCents: 12 },
        ],
      },
    }))).toThrow(/default pricing tier/)
  })

  it('rejects pricing quantity keys that do not match a parameter', () => {
    expect(() => assertModelManifestConsistent(manifest({
      pricing: { unit: 'per_image', quantityKey: 'count', currency: 'CNY', tiers: [{ condition: {}, priceCents: 10 }] },
    }))).toThrow(/quantityKey/)
  })

  it('rejects negative price cents', () => {
    expect(() => assertModelManifestConsistent(manifest({
      pricing: { unit: 'per_image', quantityKey: 'n', currency: 'CNY', tiers: [{ condition: {}, priceCents: -1 }] },
    }))).toThrow(/priceCents/)
  })

  it('rejects non-finite price cents', () => {
    expect(() => assertModelManifestConsistent(manifest({
      pricing: { unit: 'per_image', quantityKey: 'n', currency: 'CNY', tiers: [{ condition: {}, priceCents: Infinity }] },
    }))).toThrow(/priceCents/)

    expect(() => assertModelManifestConsistent(manifest({
      pricing: { unit: 'per_image', quantityKey: 'n', currency: 'CNY', tiers: [{ condition: {}, priceCents: Number.NaN }] },
    }))).toThrow(/priceCents/)
  })

  it('rejects invalid actual usage pricing rates', () => {
    expect(() => assertModelManifestConsistent(manifest({
      pricing: {
        unit: 'per_image',
        quantityKey: 'n',
        currency: 'CNY',
        tiers: [{ condition: {}, priceCents: 10 }],
        actualUsage: {
          kind: 'chat_tokens',
          inputTextPriceCentsPerMillion: -1,
          inputAudioPriceCentsPerMillion: 0,
          outputTextPriceCentsPerMillion: 0,
        },
      },
    }))).toThrow(/actualUsage inputTextPriceCentsPerMillion/)

    expect(() => assertModelManifestConsistent(manifest({
      pricing: {
        unit: 'per_image',
        quantityKey: 'n',
        currency: 'CNY',
        tiers: [{ condition: {}, priceCents: 10 }],
        actualUsage: {
          kind: 'chat_tokens',
          inputTextPriceCentsPerMillion: Number.NaN,
          inputAudioPriceCentsPerMillion: 0,
          outputTextPriceCentsPerMillion: 0,
        },
      },
    }))).toThrow(/actualUsage inputTextPriceCentsPerMillion/)
  })

  it('rejects duplicate model ids', () => {
    expect(() => assertUniqueModelIds([manifest(), manifest()])).toThrow(/Duplicate/)
  })

  it('rejects duplicate parameter names', () => {
    expect(() => assertModelManifestConsistent(manifest({
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'text', required: true },
        { name: 'prompt', label: 'Prompt again', type: 'text' },
        { name: 'n', label: 'Count', type: 'number', defaultValue: 1, min: 1, max: 4 },
      ],
    }))).toThrow(/duplicate parameter/)
  })

  it('rejects malformed parameter metadata and pricing conditions', () => {
    expect(() => assertModelManifestConsistent(manifest({
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'text', required: true },
        { name: 'n', label: 'Count', type: 'number', defaultValue: 1, min: 4, max: 1 },
      ],
    }))).toThrow(/min must not exceed max/)

    expect(() => assertModelManifestConsistent(manifest({
      pricing: {
        unit: 'per_image',
        quantityKey: 'n',
        currency: 'CNY',
        tiers: [
          { condition: {}, priceCents: 10 },
          { condition: { missing: true }, priceCents: 12 },
        ],
      },
    }))).toThrow(/condition field/)

    expect(() => assertModelManifestConsistent(manifest({
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'text', required: true },
        { name: 'n', label: 'Count', type: 'number', defaultValue: 1, min: 1, max: 4 },
        { name: 'style', label: 'Style', type: 'select', options: [] },
      ],
    }))).toThrow(/must define options/)
  })

  it('rejects invalid numeric step metadata', () => {
    expect(() => assertModelManifestConsistent(manifest({
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'text', required: true },
        { name: 'n', label: 'Count', type: 'number', defaultValue: 1, min: 1, max: 4, step: 0 },
      ],
    }))).toThrow(/step must be finite and positive/)

    expect(() => assertModelManifestConsistent(manifest({
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'text', required: true },
        { name: 'n', label: 'Count', type: 'number', defaultValue: 1.5, min: 1, max: 4, step: 1 },
      ],
    }))).toThrow(/defaultValue must align to step/)

    expect(() => assertModelManifestConsistent(manifest({
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'text', required: true, step: 1 },
        { name: 'n', label: 'Count', type: 'number', defaultValue: 1, min: 1, max: 4 },
      ],
    }))).toThrow(/numeric metadata requires number type/)
  })

  it('requires concrete bounds for exclusive numeric metadata', () => {
    expect(() => assertModelManifestConsistent(manifest({
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'text', required: true },
        { name: 'n', label: 'Count', type: 'number', defaultValue: 1, exclusiveMin: true },
      ],
    }))).toThrow(/exclusiveMin requires min/)

    expect(() => assertModelManifestConsistent(manifest({
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'text', required: true },
        { name: 'n', label: 'Count', type: 'number', defaultValue: 1, exclusiveMax: true },
      ],
    }))).toThrow(/exclusiveMax requires max/)
  })

  it('rejects invalid media cardinality metadata', () => {
    const withReference = (reference: ModelManifest['parameters'][number]): ModelManifest => manifest({
      capabilities: ['text_prompt', 'image_input'],
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'text', required: true },
        { name: 'n', label: 'Count', type: 'number', defaultValue: 1, min: 1, max: 4 },
        reference,
      ],
      request: {
        kind: 'dashscope-image-message',
        endpoint: '/images',
        bindings: {
          prompt: { target: 'input.prompt' },
          n: { target: 'parameters.field' },
          reference: { target: 'input.media', mediaType: 'image' },
        },
      },
    })

    expect(() => assertModelManifestConsistent(withReference({
      name: 'reference',
      label: 'Reference',
      type: 'text',
      minItems: 1,
    }))).toThrow(/cardinality metadata requires media type/)

    expect(() => assertModelManifestConsistent(withReference({
      name: 'reference',
      label: 'Reference',
      type: 'media',
      mediaKind: 'image',
      minItems: 3,
      maxItems: 2,
    }))).toThrow(/minItems must not exceed maxItems/)
  })

  it('rejects invalid combined media group declarations', () => {
    const grouped = (mediaGroups: NonNullable<ModelManifest['mediaGroups']>): ModelManifest => manifest({
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'text', required: true },
        { name: 'n', label: 'Count', type: 'number', defaultValue: 1, min: 1, max: 4 },
        { name: 'images', label: 'Images', type: 'media', mediaKind: 'image' },
        { name: 'videos', label: 'Videos', type: 'media', mediaKind: 'video' },
      ],
      mediaGroups,
      request: {
        kind: 'dashscope-image-message',
        endpoint: '/images',
        bindings: {
          prompt: { target: 'input.prompt' },
          n: { target: 'parameters.field' },
          images: { target: 'input.media', mediaType: 'reference_image' },
          videos: { target: 'input.media', mediaType: 'reference_video' },
        },
      },
    })

    expect(() => assertModelManifestConsistent(grouped([
      { parameters: ['images', 'missing'], maxItems: 5 },
    ]))).toThrow(/does not match a media parameter/)
    expect(() => assertModelManifestConsistent(grouped([
      { parameters: ['images', 'videos'], minItems: 6, maxItems: 5 },
    ]))).toThrow(/minItems must not exceed maxItems/)
    expect(() => assertModelManifestConsistent(grouped([
      {
        parameters: ['images', 'videos'],
        maxItems: 4,
        when: { field: 'missing', present: true },
      },
    ]))).toThrow(/condition field "missing" does not match a parameter/)
  })

  it('accepts structured select defaults and option values', () => {
    expect(() => assertModelManifestConsistent(manifest({
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'text', required: true },
        { name: 'n', label: 'Count', type: 'number', defaultValue: 1, min: 1, max: 4 },
        { name: 'channelId', label: 'Channel', type: 'select', defaultValue: [0], options: [{ label: 'First', value: [0] }] },
      ],
      request: {
        kind: 'dashscope-image-message',
        endpoint: '/images',
        bindings: {
          prompt: { target: 'input.prompt' },
          n: { target: 'parameters.field' },
          channelId: { target: 'parameters.field' },
        },
      },
    }))).not.toThrow()
  })

  it('accepts a visibility rule that references another parameter', () => {
    expect(() => assertModelManifestConsistent(manifest({
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'text', required: true },
        { name: 'n', label: 'Count', type: 'number', defaultValue: 1, min: 1, max: 4 },
        { name: 'style', label: 'Style', type: 'text', visibleWhen: { field: 'n', equals: 1 } },
      ],
    }))).not.toThrow()
  })

  it('rejects unknown, self-referential, and cyclic visibility rules', () => {
    expect(() => assertModelManifestConsistent(manifest({
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'text', required: true },
        { name: 'n', label: 'Count', type: 'number', visibleWhen: { field: 'missing', equals: true } },
      ],
    }))).toThrow(/visibility field/)

    expect(() => assertModelManifestConsistent(manifest({
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'text', required: true },
        { name: 'n', label: 'Count', type: 'number', visibleWhen: { field: 'n', equals: 1 } },
      ],
    }))).toThrow(/cannot depend on itself/)

    expect(() => assertModelManifestConsistent(manifest({
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'text', required: true, visibleWhen: { field: 'n', equals: 1 } },
        { name: 'n', label: 'Count', type: 'number', visibleWhen: { field: 'prompt', equals: 'x' } },
      ],
    }))).toThrow(/cyclic parameter visibility/)
  })
})
