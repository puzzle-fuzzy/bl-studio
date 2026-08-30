/**
 * Vidu 参考生视频家族（除 q3-mix 外，q3-mix 见 vidu-video.ts 的 viduR2V）。
 *
 * 数据来源：阿里云百炼官方《Vidu-参考生视频 API 参考》 + 官方价格页（华北2）。
 * 七兄弟的差异只在本文件覆盖的参数上：时长区间、分辨率档位、是否支持 audio、
 * 参考媒体数量与种类。传输/轮询/输出契约完全相同（同一 video-synthesis 端点）。
 *
 * 注意：
 * - q3-drama 无 audio 参数（总是有声），分辨率仅 720P/1080P 且默认 1080P，
 *   画面比例官方仅支持 16:9 / 9:16（未暴露 ratio 参数时 provider 默认 16:9）；
 * - q2-pro 支持 1~4 张参考图像 + 0~2 段参考视频（video 参考为可选），
 *   参考视频经 input.media 的 type:'video' 项随图片一并提交。
 */
import type { ModelManifest } from '@bailian-studio/model-core'

const REFERENCE_TRANSPORT: ModelManifest['transport'] = {
  mode: 'provider_async',
  submit: {
    method: 'POST',
    endpointTemplate: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
    modelFieldPath: '/model',
    headers: [
      { name: 'Authorization' },
      { name: 'Content-Type', value: 'application/json' },
      { name: 'X-DashScope-Async', value: 'enable' },
    ],
  },
  polling: {
    method: 'GET',
    endpointTemplate: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/tasks/{taskId}',
    headers: [{ name: 'Authorization' }],
    taskIdPath: '/output/task_id',
    statusPath: '/output/task_status',
    succeededValues: ['SUCCEEDED'],
    failedValues: ['FAILED', 'CANCELED', 'UNKNOWN'],
  },
}

const IMAGE_BINDINGS: ModelManifest['request']['bindings'] = {
  references: { target: 'input.media', mediaType: 'image' },
  prompt: { target: 'input.prompt' },
  duration: { target: 'parameters.field' },
  resolution: { target: 'parameters.field' },
  watermark: { target: 'parameters.field' },
  seed: { target: 'parameters.field' },
}

function imageReferenceParam(max: number): ModelManifest['parameters'][number] {
  return {
    name: 'references',
    label: '参考图像',
    type: 'media',
    mediaKind: 'image',
    required: true,
    minItems: 1,
    maxItems: max,
    description: `1~${max}张参考图像URL；prompt中可用[Image 1]、[Image 2]指代对应位置的图像`,
  }
}

function promptParam(): ModelManifest['parameters'][number] {
  return {
    name: 'prompt',
    label: '提示词',
    type: 'text',
    required: true,
    maxLength: 5000,
    description: '描述生成视频中期望包含的元素，可用[Image 1]/[Image 2]指代参考图中的角色',
  }
}

function durationParam(min: number, max: number): ModelManifest['parameters'][number] {
  return {
    name: 'duration',
    label: '视频时长(秒)',
    type: 'number',
    defaultValue: 5,
    min,
    max,
    step: 1,
    description: `生成视频的时长，支持${min}-${max}秒`,
  }
}

function resolutionParam(options: Array<'540P' | '720P' | '1080P'>, defaultValue: '540P' | '720P' | '1080P'): ModelManifest['parameters'][number] {
  return {
    name: 'resolution',
    label: '分辨率档位',
    type: 'select',
    defaultValue,
    options: options.map(value => ({ label: value, value })),
  }
}

function audioParam(): ModelManifest['parameters'][number] {
  return {
    name: 'audio',
    label: '生成音频',
    type: 'boolean',
    defaultValue: false,
    description: '是否生成有声视频',
  }
}

function watermarkParam(): ModelManifest['parameters'][number] {
  return {
    name: 'watermark',
    label: '水印',
    type: 'boolean',
    defaultValue: false,
    description: '是否添加"内容由AI生成"水印',
  }
}

function seedParam(): ModelManifest['parameters'][number] {
  return {
    name: 'seed',
    label: '随机种子',
    type: 'number',
    required: false,
    min: 0, max: 2147483647, step: 1,
    description: '随机数种子，取值范围[0,2147483647]',
  }
}

function rate(id: string, unitPrice: string, resolution: string): NonNullable<ModelManifest['pricing']['rates']>[number] {
  return {
    id,
    region: 'cn-beijing',
    serviceScope: 'china-mainland',
    chargeItem: 'output',
    unit: 'second',
    unitSize: 1,
    unitPrice,
    conditions: { resolution },
  }
}

/** Vidu Q3 参考生视频（vidu/viduq3_reference2video）。 */
export const viduR2VQ3: ModelManifest = {
  id: 'vidu-reference-video-q3',
  provider: 'dashscope',
  providerModel: 'vidu/viduq3_reference2video',
  displayName: 'Vidu Q3 参考生视频',
  description: 'Vidu Q3 参考生视频，参考多张图像生成风格一致的视频',
  category: 'video',
  taskMode: 'provider_async',
  capabilities: ['text_prompt', 'image_input', 'multi_reference', 'seed'],
  parameters: [
    imageReferenceParam(7),
    promptParam(),
    durationParam(1, 16),
    resolutionParam(['540P', '720P', '1080P'], '720P'),
    audioParam(),
    watermarkParam(),
    seedParam(),
  ],
  request: {
    kind: 'dashscope-video-task',
    endpoint: '/services/aigc/video-generation/video-synthesis',
    mediaMode: 'multi',
    referenceFormat: 'image-bracket',
    bindings: {
      ...IMAGE_BINDINGS,
      audio: { target: 'parameters.field' },
    },
  },
  output: { kind: 'video-url', path: 'output.video_url' },
  pricing: {
    unit: 'per_second',
    quantityKey: 'duration',
    currency: 'CNY',
    rates: [
      rate('cn-beijing-540p-output-second', '0.3125', '540P'),
      rate('cn-beijing-720p-output-second', '0.625', '720P'),
      rate('cn-beijing-1080p-output-second', '0.78125', '1080P'),
    ],
  },
  transport: REFERENCE_TRANSPORT,
  availability: { enabled: false, stage: 'beta', notActivated: '暂未开通' },
}

/** Vidu Q3 Turbo 参考生视频（vidu/viduq3-turbo_reference2video）。 */
export const viduR2VQ3Turbo: ModelManifest = {
  id: 'vidu-reference-video-turbo',
  provider: 'dashscope',
  providerModel: 'vidu/viduq3-turbo_reference2video',
  displayName: 'Vidu Q3 Turbo 参考生视频',
  description: 'Vidu Q3 Turbo 参考生视频，速度更快、性价比更高',
  category: 'video',
  taskMode: 'provider_async',
  capabilities: ['text_prompt', 'image_input', 'multi_reference', 'seed'],
  parameters: [
    imageReferenceParam(7),
    promptParam(),
    durationParam(1, 16),
    resolutionParam(['540P', '720P', '1080P'], '720P'),
    audioParam(),
    watermarkParam(),
    seedParam(),
  ],
  request: {
    kind: 'dashscope-video-task',
    endpoint: '/services/aigc/video-generation/video-synthesis',
    mediaMode: 'multi',
    referenceFormat: 'image-bracket',
    bindings: {
      ...IMAGE_BINDINGS,
      audio: { target: 'parameters.field' },
    },
  },
  output: { kind: 'video-url', path: 'output.video_url' },
  pricing: {
    unit: 'per_second',
    quantityKey: 'duration',
    currency: 'CNY',
    rates: [
      rate('cn-beijing-540p-output-second', '0.15625', '540P'),
      rate('cn-beijing-720p-output-second', '0.3125', '720P'),
      rate('cn-beijing-1080p-output-second', '0.40625', '1080P'),
    ],
  },
  transport: REFERENCE_TRANSPORT,
  availability: { enabled: false, stage: 'beta', notActivated: '暂未开通' },
}

/** Vidu Q3 广告参考生视频（vidu/viduq3-ad_reference2video）。 */
export const viduR2VQ3Ad: ModelManifest = {
  id: 'vidu-reference-video-ad',
  provider: 'dashscope',
  providerModel: 'vidu/viduq3-ad_reference2video',
  displayName: 'Vidu Q3 广告参考生视频',
  description: 'Vidu Q3 广告模型，专为广告素材生成优化',
  category: 'video',
  taskMode: 'provider_async',
  capabilities: ['text_prompt', 'image_input', 'multi_reference', 'seed'],
  parameters: [
    imageReferenceParam(7),
    promptParam(),
    durationParam(3, 15),
    resolutionParam(['720P', '1080P'], '720P'),
    audioParam(),
    watermarkParam(),
    seedParam(),
  ],
  request: {
    kind: 'dashscope-video-task',
    endpoint: '/services/aigc/video-generation/video-synthesis',
    mediaMode: 'multi',
    referenceFormat: 'image-bracket',
    bindings: {
      ...IMAGE_BINDINGS,
      audio: { target: 'parameters.field' },
    },
  },
  output: { kind: 'video-url', path: 'output.video_url' },
  pricing: {
    unit: 'per_second',
    quantityKey: 'duration',
    currency: 'CNY',
    rates: [
      rate('cn-beijing-720p-output-second', '0.75', '720P'),
      rate('cn-beijing-1080p-output-second', '0.90625', '1080P'),
    ],
  },
  transport: REFERENCE_TRANSPORT,
  availability: { enabled: false, stage: 'beta', notActivated: '暂未开通' },
}

/** Vidu Q3 影视参考生视频（vidu/viduq3-drama_reference2video）。 */
export const viduR2VQ3Drama: ModelManifest = {
  id: 'vidu-reference-video-drama',
  provider: 'dashscope',
  providerModel: 'vidu/viduq3-drama_reference2video',
  displayName: 'Vidu Q3 影视参考生视频',
  description: 'Vidu Q3 影视模型，专为影视叙事生成优化；无音频开关（始终有声），画面比例仅支持 16:9 / 9:16',
  category: 'video',
  taskMode: 'provider_async',
  capabilities: ['text_prompt', 'image_input', 'multi_reference', 'seed'],
  parameters: [
    imageReferenceParam(7),
    promptParam(),
    durationParam(2, 15),
    resolutionParam(['720P', '1080P'], '1080P'),
    watermarkParam(),
    seedParam(),
  ],
  request: {
    kind: 'dashscope-video-task',
    endpoint: '/services/aigc/video-generation/video-synthesis',
    mediaMode: 'multi',
    referenceFormat: 'image-bracket',
    bindings: { ...IMAGE_BINDINGS },
  },
  output: { kind: 'video-url', path: 'output.video_url' },
  pricing: {
    unit: 'per_second',
    quantityKey: 'duration',
    currency: 'CNY',
    rates: [
      rate('cn-beijing-720p-output-second', '0.875', '720P'),
      rate('cn-beijing-1080p-output-second', '0.875', '1080P'),
    ],
  },
  transport: REFERENCE_TRANSPORT,
  availability: { enabled: false, stage: 'beta', notActivated: '暂未开通' },
}

/** Vidu Q2 参考生视频（vidu/viduq2_reference2video）。 */
export const viduR2VQ2: ModelManifest = {
  id: 'vidu-reference-video-q2',
  provider: 'dashscope',
  providerModel: 'vidu/viduq2_reference2video',
  displayName: 'Vidu Q2 参考生视频',
  description: 'Vidu Q2 参考生视频，参考多张图像生成风格一致的视频',
  category: 'video',
  taskMode: 'provider_async',
  capabilities: ['text_prompt', 'image_input', 'multi_reference', 'seed'],
  parameters: [
    imageReferenceParam(7),
    promptParam(),
    durationParam(1, 10),
    resolutionParam(['540P', '720P', '1080P'], '720P'),
    watermarkParam(),
    seedParam(),
  ],
  request: {
    kind: 'dashscope-video-task',
    endpoint: '/services/aigc/video-generation/video-synthesis',
    mediaMode: 'multi',
    referenceFormat: 'image-bracket',
    bindings: { ...IMAGE_BINDINGS },
  },
  output: { kind: 'video-url', path: 'output.video_url' },
  pricing: {
    unit: 'per_second',
    quantityKey: 'duration',
    currency: 'CNY',
    rates: [
      rate('cn-beijing-540p-output-second', '0.21875', '540P'),
      rate('cn-beijing-720p-output-second', '0.28125', '720P'),
      rate('cn-beijing-1080p-output-second', '0.71875', '1080P'),
    ],
  },
  transport: REFERENCE_TRANSPORT,
  availability: { enabled: false, stage: 'beta', notActivated: '暂未开通' },
}

/** Vidu Q2 Pro 参考生视频（vidu/viduq2-pro_reference2video），支持参考视频。 */
export const viduR2VQ2Pro: ModelManifest = {
  id: 'vidu-reference-video-q2-pro',
  provider: 'dashscope',
  providerModel: 'vidu/viduq2-pro_reference2video',
  displayName: 'Vidu Q2 Pro 参考生视频',
  description: 'Vidu Q2 Pro 参考生视频，支持 1~4 张参考图像与 1~2 段参考视频',
  category: 'video',
  taskMode: 'provider_async',
  capabilities: ['text_prompt', 'image_input', 'video_input', 'multi_reference', 'seed'],
  parameters: [
    imageReferenceParam(4),
    {
      name: 'referenceVideos',
      label: '参考视频',
      type: 'media',
      mediaKind: 'video',
      required: false,
      maxItems: 2,
      description: '可选 1~2 段参考视频（总时长有限制），随参考图像一并提交',
    },
    promptParam(),
    durationParam(1, 10),
    resolutionParam(['540P', '720P', '1080P'], '720P'),
    watermarkParam(),
    seedParam(),
  ],
  request: {
    kind: 'dashscope-video-task',
    endpoint: '/services/aigc/video-generation/video-synthesis',
    mediaMode: 'multi',
    referenceFormat: 'image-bracket',
    bindings: {
      references: { target: 'input.media', mediaType: 'image' },
      referenceVideos: { target: 'input.media', mediaType: 'video' },
      prompt: { target: 'input.prompt' },
      duration: { target: 'parameters.field' },
      resolution: { target: 'parameters.field' },
      watermark: { target: 'parameters.field' },
      seed: { target: 'parameters.field' },
    },
  },
  output: { kind: 'video-url', path: 'output.video_url' },
  pricing: {
    unit: 'per_second',
    quantityKey: 'duration',
    currency: 'CNY',
    rates: [
      rate('cn-beijing-540p-output-second', '0.25', '540P'),
      rate('cn-beijing-720p-output-second', '0.3125', '720P'),
      rate('cn-beijing-1080p-output-second', '0.78125', '1080P'),
    ],
  },
  transport: REFERENCE_TRANSPORT,
  availability: { enabled: false, stage: 'beta', notActivated: '暂未开通' },
}
