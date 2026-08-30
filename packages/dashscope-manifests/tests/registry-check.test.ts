import { describe, expect, it } from 'vitest'
import type { ModelValidationRule } from '@bailian-studio/model-core'
import type { ModelManifest } from '../src/types'
import { assertModelManifestConsistent, assertUniqueModelIds } from '../src'

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
    pricing: {
      unit: 'per_image',
      quantityKey: 'n',
      currency: 'CNY',
      rates: [{
        id: 'output-default',
        region: 'cn-beijing',
        serviceScope: 'china-mainland',
        chargeItem: 'output',
        unit: 'image',
        unitSize: 1,
        unitPrice: '0.1',
        conditions: {},
      }],
    },
    transport: {
      mode: 'sync',
      submit: {
        method: 'POST',
        endpointTemplate: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
        modelFieldPath: '/model',
        headers: [],
      },
    },
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

  it('rejects a transport mode that does not match taskMode', () => {
    expect(() => assertModelManifestConsistent(manifest({
      transport: {
        mode: 'provider_async',
        submit: {
          method: 'POST',
          endpointTemplate: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
          modelFieldPath: '/model',
          headers: [],
        },
        polling: {
          method: 'GET',
          endpointTemplate: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/tasks/{taskId}',
          headers: [],
          taskIdPath: '/output/task_id',
          statusPath: '/output/task_status',
          succeededValues: ['SUCCEEDED'],
          failedValues: ['FAILED'],
        },
      },
    }))).toThrow(/transport mode "provider_async" must match taskMode "sync"/)
  })

  it('rejects an async transport that omits polling', () => {
    expect(() => assertModelManifestConsistent(manifest({
      taskMode: 'provider_async',
      transport: {
        mode: 'provider_async',
        submit: {
          method: 'POST',
          endpointTemplate: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
          modelFieldPath: '/model',
          headers: [],
        },
        polling: {
          method: 'GET',
          endpointTemplate: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/tasks/{taskId}',
          headers: [],
          taskIdPath: '/output/task_id',
          statusPath: '',
          succeededValues: ['SUCCEEDED'],
          failedValues: ['FAILED'],
        },
      },
    }))).toThrow(/async transport polling must declare taskIdPath and statusPath/)
  })

  it('rejects overlapping async polling status values', () => {
    expect(() => assertModelManifestConsistent(manifest({
      taskMode: 'provider_async',
      transport: {
        mode: 'provider_async',
        submit: {
          method: 'POST',
          endpointTemplate: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
          modelFieldPath: '/model',
          headers: [],
        },
        polling: {
          method: 'GET',
          endpointTemplate: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/tasks/{taskId}',
          headers: [],
          taskIdPath: '/output/task_id',
          statusPath: '/output/task_status',
          succeededValues: ['SUCCEEDED', 'FAILED'],
          failedValues: ['FAILED'],
        },
      },
    }))).toThrow(/succeededValues and failedValues must not overlap/)
  })

  it('rejects an endpoint template without a {WorkspaceId} placeholder', () => {
    expect(() => assertModelManifestConsistent(manifest({
      transport: {
        mode: 'sync',
        submit: {
          method: 'POST',
          endpointTemplate: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
          modelFieldPath: '/model',
          headers: [],
        },
      },
    }))).toThrow(/endpointTemplate must contain \{WorkspaceId\}/)
  })

  it('rejects a model field path that is not /model', () => {
    expect(() => assertModelManifestConsistent(manifest({
      transport: {
        mode: 'sync',
        submit: {
          method: 'POST',
          endpointTemplate: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
          modelFieldPath: '/parameters/model',
          headers: [],
        },
      },
    }))).toThrow(/modelFieldPath must be \/model/)
  })

  it('rejects a stream transport without the stream section', () => {
    // 该形态在类型层就不合法，用 cast 构造一个"错误实现"来验证运行时断言。
    const malformedStream = {
      mode: 'stream',
      submit: {
        method: 'POST',
        endpointTemplate: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
        modelFieldPath: '/model',
        headers: [],
      },
    } as unknown as ModelManifest['transport']
    expect(() => assertModelManifestConsistent(manifest({
      taskMode: 'stream',
      transport: malformedStream,
    }))).toThrow(/stream transport must declare the stream section/)
  })

  it('accepts a manifest whose only pricing rate is conditional (unconditional defaults are optional)', () => {
    expect(() => assertModelManifestConsistent(manifest({
      pricing: {
        unit: 'per_image',
        quantityKey: 'n',
        currency: 'CNY',
        rates: [{
          id: 'output-large',
          region: 'cn-beijing',
          serviceScope: 'china-mainland',
          chargeItem: 'output',
          unit: 'image',
          unitSize: 1,
          unitPrice: '0.25',
          conditions: { n: 2 },
        }],
      },
    }))).not.toThrow()
  })

  it('rejects manifests with multiple unconditional default rates for the same chargeItem and region', () => {
    expect(() => assertModelManifestConsistent(manifest({
      pricing: {
        unit: 'per_image',
        quantityKey: 'n',
        currency: 'CNY',
        rates: [
          {
            id: 'output-default-a',
            region: 'cn-beijing',
            serviceScope: 'china-mainland',
            chargeItem: 'output',
            unit: 'image',
            unitSize: 1,
            unitPrice: '0.1',
            conditions: {},
          },
          {
            id: 'output-default-b',
            region: 'cn-beijing',
            serviceScope: 'china-mainland',
            chargeItem: 'output',
            unit: 'image',
            unitSize: 1,
            unitPrice: '0.12',
            conditions: {},
          },
        ],
      },
    }))).toThrow(/duplicates the default rate for output:cn-beijing/)
  })

  it('rejects pricing quantity keys that do not match a parameter', () => {
    expect(() => assertModelManifestConsistent(manifest({
      pricing: {
        unit: 'per_image',
        quantityKey: 'count',
        currency: 'CNY',
        rates: [{
          id: 'output-default',
          region: 'cn-beijing',
          serviceScope: 'china-mainland',
          chargeItem: 'output',
          unit: 'image',
          unitSize: 1,
          unitPrice: '0.1',
          conditions: {},
        }],
      },
    }))).toThrow(/quantityKey/)
  })

  it('rejects negative unitPrice', () => {
    expect(() => assertModelManifestConsistent(manifest({
      pricing: {
        unit: 'per_image',
        quantityKey: 'n',
        currency: 'CNY',
        rates: [{
          id: 'output-default',
          region: 'cn-beijing',
          serviceScope: 'china-mainland',
          chargeItem: 'output',
          unit: 'image',
          unitSize: 1,
          unitPrice: '-1',
          conditions: {},
        }],
      },
    }))).toThrow(/unitPrice must be a finite non-negative decimal yuan/)
  })

  it('rejects non-finite unitPrice', () => {
    for (const unitPrice of ['Infinity', 'NaN']) {
      expect(() => assertModelManifestConsistent(manifest({
        pricing: {
          unit: 'per_image',
          quantityKey: 'n',
          currency: 'CNY',
          rates: [{
            id: 'output-default',
            region: 'cn-beijing',
            serviceScope: 'china-mainland',
            chargeItem: 'output',
            unit: 'image',
            unitSize: 1,
            unitPrice,
            conditions: {},
          }],
        },
      }))).toThrow(/unitPrice must be a finite non-negative decimal yuan/)
    }
  })

  it('rejects rate conditions that reference undeclared parameters', () => {
    expect(() => assertModelManifestConsistent(manifest({
      pricing: {
        unit: 'per_image',
        quantityKey: 'n',
        currency: 'CNY',
        rates: [{
          id: 'output-conditional',
          region: 'cn-beijing',
          serviceScope: 'china-mainland',
          chargeItem: 'output',
          unit: 'image',
          unitSize: 1,
          unitPrice: '0.25',
          conditions: { size: '2048*2048' },
        }],
      },
    }))).toThrow(/condition field "size" does not match a parameter/)
  })

  it('rejects non-positive or non-integer unitSize and missing region', () => {
    expect(() => assertModelManifestConsistent(manifest({
      pricing: {
        unit: 'per_image',
        quantityKey: 'n',
        currency: 'CNY',
        rates: [{
          id: 'output-default',
          region: 'cn-beijing',
          serviceScope: 'china-mainland',
          chargeItem: 'output',
          unit: 'image',
          unitSize: 0,
          unitPrice: '0.1',
          conditions: {},
        }],
      },
    }))).toThrow(/unitSize must be a positive integer/)

    expect(() => assertModelManifestConsistent(manifest({
      pricing: {
        unit: 'per_image',
        quantityKey: 'n',
        currency: 'CNY',
        rates: [{
          id: 'output-default',
          region: '',
          serviceScope: 'china-mainland',
          chargeItem: 'output',
          unit: 'image',
          unitSize: 1,
          unitPrice: '0.1',
          conditions: {},
        }],
      },
    }))).toThrow(/region is missing/)
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
        rates: [
          {
            id: 'output-default',
            region: 'cn-beijing',
            serviceScope: 'china-mainland',
            chargeItem: 'output',
            unit: 'image',
            unitSize: 1,
            unitPrice: '0.1',
            conditions: {},
          },
          {
            id: 'output-conditional',
            region: 'cn-beijing',
            serviceScope: 'china-mainland',
            chargeItem: 'output',
            unit: 'image',
            unitSize: 1,
            unitPrice: '0.12',
            conditions: { missing: true },
          },
        ],
      },
    }))).toThrow(/condition field "missing" does not match a parameter/)

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

  it('rejects invalid combined media group rule declarations', () => {
    const grouped = (rules: NonNullable<ModelManifest['rules']>): ModelManifest => manifest({
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'text', required: true },
        { name: 'n', label: 'Count', type: 'number', defaultValue: 1, min: 1, max: 4 },
        { name: 'images', label: 'Images', type: 'media', mediaKind: 'image' },
        { name: 'videos', label: 'Videos', type: 'media', mediaKind: 'video' },
      ],
      rules,
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
      { kind: 'media-group', fields: ['images', 'missing'], maxItems: 5 },
    ]))).toThrow(/does not match a media parameter/)
    expect(() => assertModelManifestConsistent(grouped([
      { kind: 'media-group', fields: ['images', 'videos'], minItems: 6, maxItems: 5 },
    ]))).toThrow(/minItems must not exceed maxItems/)
    expect(() => assertModelManifestConsistent(grouped([
      {
        kind: 'media-group',
        fields: ['images', 'videos'],
        maxItems: 4,
        condition: { kind: 'media-count', field: 'missing' },
      },
    ]))).toThrow(/condition field "missing" does not match a parameter/)
    expect(() => assertModelManifestConsistent(grouped([
      { kind: 'media-group', fields: ['images', 'videos'] },
    ]))).toThrow(/must declare minItems or maxItems/)
    expect(() => assertModelManifestConsistent(grouped([
      { kind: 'media-group', fields: ['images', 'images'], minItems: 1 },
    ]))).toThrow(/must not declare duplicate fields/)
  })

  it('validates every cross-field rule kind', () => {
    const message = { 'zh-CN': '规则文案', 'en-US': 'Rule message' }
    const withParams = (
      extraParameters: ModelManifest['parameters'],
      rule: ModelValidationRule,
    ): ModelManifest => manifest({
      parameters: [
        { name: 'prompt', label: 'Prompt', type: 'text', required: true },
        { name: 'n', label: 'Count', type: 'number', defaultValue: 1, min: 1, max: 4 },
        { name: 'references', label: 'References', type: 'media', mediaKind: 'image' },
        ...extraParameters,
      ],
      rules: [rule],
      request: {
        kind: 'dashscope-image-message',
        endpoint: '/images',
        bindings: {
          prompt: { target: 'input.prompt' },
          n: { target: 'parameters.field' },
          references: { target: 'input.media', mediaType: 'image' },
        },
      },
    })

    // required-one-of
    expect(() => assertModelManifestConsistent(withParams([], {
      kind: 'required-one-of',
      fields: ['prompt', 'n'],
      code: 'REQUIRED_PARAMETER',
      message,
    }))).not.toThrow()
    expect(() => assertModelManifestConsistent(withParams([], {
      kind: 'required-one-of',
      fields: [],
      code: 'REQUIRED_PARAMETER',
      message,
    }))).toThrow(/required-one-of must declare fields/)
    expect(() => assertModelManifestConsistent(withParams([], {
      kind: 'required-one-of',
      fields: ['prompt'],
      minimum: 0,
      code: 'REQUIRED_PARAMETER',
      message,
    }))).toThrow(/minimum must be a positive integer/)

    // text-length
    expect(() => assertModelManifestConsistent(withParams([], {
      kind: 'text-length',
      field: 'prompt',
      cjk: { max: 350 },
      other: { max: 2000 },
      code: 'OUT_OF_RANGE',
      message,
    }))).not.toThrow()
    expect(() => assertModelManifestConsistent(withParams([], {
      kind: 'text-length',
      field: 'missing',
      cjk: { max: 10 },
      other: { max: 10 },
      code: 'OUT_OF_RANGE',
      message,
    }))).toThrow(/text-length field "missing" does not match a parameter/)
    expect(() => assertModelManifestConsistent(withParams([], {
      kind: 'text-length',
      field: 'prompt',
      cjk: { max: 0 },
      other: { max: 10 },
      code: 'OUT_OF_RANGE',
      message,
    }))).toThrow(/text-length must declare positive cjk\/other max/)

    // field-required-when
    expect(() => assertModelManifestConsistent(withParams([], {
      kind: 'field-required-when',
      field: 'n',
      condition: { kind: 'field-equals', field: 'prompt', equals: 'x' },
      code: 'REQUIRED_PARAMETER',
      message,
    }))).not.toThrow()
    expect(() => assertModelManifestConsistent(withParams([], {
      kind: 'field-required-when',
      field: 'n',
      condition: { kind: 'field-equals', field: 'missing', equals: 'x' },
      code: 'REQUIRED_PARAMETER',
      message,
    }))).toThrow(/field-required-when condition field "missing" does not match a parameter/)

    // field-allowed-when
    expect(() => assertModelManifestConsistent(withParams([], {
      kind: 'field-allowed-when',
      field: 'n',
      condition: { kind: 'field-equals', field: 'prompt', equals: 'x' },
      code: 'INVALID_VALUE',
      message,
    }))).not.toThrow()
    expect(() => assertModelManifestConsistent(withParams([], {
      kind: 'field-allowed-when',
      field: 'missing',
      condition: { kind: 'field-equals', field: 'prompt', equals: 'x' },
      code: 'INVALID_VALUE',
      message,
    }))).toThrow(/field-allowed-when field "missing" does not match a parameter/)

    // media-group with condition (cross-field binding must reference a declared media param)
    expect(() => assertModelManifestConsistent(withParams([
      { name: 'featureVideo', label: 'Feature', type: 'media', mediaKind: 'video' },
    ], {
      kind: 'media-group',
      fields: ['references', 'featureVideo'],
      maxItems: 5,
      condition: { kind: 'media-count', field: 'featureVideo', minimum: 1 },
    }))).not.toThrow()

    // array-item-field-max-path
    expect(() => assertModelManifestConsistent(withParams([], {
      kind: 'array-item-field-max-path',
      field: 'n',
      itemProperty: 'weight',
      maximumField: 'prompt',
      defaultMaximum: 100,
      code: 'OUT_OF_RANGE',
      message,
    }))).not.toThrow()
    expect(() => assertModelManifestConsistent(withParams([], {
      kind: 'array-item-field-max-path',
      field: 'missing',
      itemProperty: 'weight',
      maximumField: 'prompt',
      defaultMaximum: 100,
      code: 'OUT_OF_RANGE',
      message,
    }))).toThrow(/array-item-field-max-path field "missing" does not match a parameter/)
    expect(() => assertModelManifestConsistent(withParams([], {
      kind: 'array-item-field-max-path',
      field: 'n',
      itemProperty: 'weight',
      maximumField: 'missing',
      defaultMaximum: 100,
      code: 'OUT_OF_RANGE',
      message,
    }))).toThrow(/array-item-field-max-path field "missing" does not match a parameter/)
  })

  it('rejects a conditional when.field that does not match a parameter', () => {
    const base = manifest()
    expect(() => assertModelManifestConsistent({
      ...base,
      parameters: [
        ...base.parameters,
        {
          name: 'duration',
          label: 'Duration',
          type: 'number',
          min: 2,
          max: 15,
          conditional: { max: 10, when: { field: 'referenceVideos', present: true } },
        },
      ],
    })).toThrow(/conditional when.field "referenceVideos" does not match a parameter/)

    // 指向已声明参数的条件约束应通过
    expect(() => assertModelManifestConsistent({
      ...base,
      parameters: [
        ...base.parameters,
        { name: 'referenceVideos', label: 'Reference Videos', type: 'media', mediaKind: 'video' },
        {
          name: 'duration',
          label: 'Duration',
          type: 'number',
          min: 2,
          max: 15,
          conditional: { max: 10, when: { field: 'referenceVideos', present: true } },
        },
      ],
    })).not.toThrow()
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
