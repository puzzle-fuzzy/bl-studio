import type { ModelManifest } from '@bailian-studio/model-core'

/**
 * 万相 3.0 视频生成系列 manifest。
 *
 * 百炼把 wan3.0-video 暴露为一个同时支持三种能力的 provider model，bl-studio
 * 当前的产品目录则按 operation 一模型拆分。因此这里保留同一个 providerModel，
 * 分成文生视频、首尾帧图生视频、参考生视频三个产品 manifest。
 *
 * 依据 bailian-hub 的 wan3.0-video 合同：
 * - 统一走 video-synthesis 异步任务端点；
 * - 支持 480P / 720P / 1080P、adaptive 与常见画幅、2~30 秒；
 * - 图生视频最多接收首帧/尾帧两张图；
 * - 参考生视频支持图片、视频、音频三类参考素材，总数最多 10 个。
 *
 * 官网另有 duration=-1 的智能时长模式，但当前 pricing.quantityKey 只能可靠地
 * 对正数时长估价；在独立的实际用量/预估时长定价语义落地前，产品层只暴露 2~30 秒。
 */

const PROVIDER_MODEL = 'wan3.0-video'
const VIDEO_ENDPOINT = '/services/aigc/video-generation/video-synthesis'
const SUBMIT_ENDPOINT = 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis'
const POLL_ENDPOINT = 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/tasks/{taskId}'

const COMMON_PARAMETERS = (promptRequired: boolean): ModelManifest['parameters'] => [
  {
    name: 'prompt',
    label: '提示词',
    type: 'text',
    required: promptRequired,
    maxLength: 20000,
    description: '描述期望生成的视频内容，支持中英文。',
  },
  {
    name: 'resolution',
    label: '分辨率档位',
    type: 'select',
    defaultValue: '1080P',
    options: [
      { label: '480P', value: '480P' },
      { label: '720P', value: '720P' },
      { label: '1080P', value: '1080P' },
    ],
  },
  {
    name: 'ratio',
    label: '宽高比',
    type: 'select',
    defaultValue: 'adaptive',
    options: [
      { label: '自适应', value: 'adaptive' },
      { label: '16:9', value: '16:9' },
      { label: '4:3', value: '4:3' },
      { label: '1:1', value: '1:1' },
      { label: '3:4', value: '3:4' },
      { label: '9:16', value: '9:16' },
    ],
  },
  {
    name: 'duration',
    label: '视频时长(秒)',
    type: 'number',
    defaultValue: 5,
    min: 2,
    max: 30,
    step: 1,
    description: '生成视频的时长，单位秒。',
  },
  {
    name: 'audio',
    label: '生成音频',
    type: 'boolean',
    defaultValue: true,
    description: '是否生成带音频的视频。',
  },
  {
    name: 'seed',
    label: '随机种子',
    type: 'number',
    required: false,
    min: 0,
    max: 2147483647,
    step: 1,
    description: '用于复现生成结果的随机种子。',
  },
  {
    name: 'watermark',
    label: '水印',
    type: 'boolean',
    defaultValue: false,
    description: '是否添加水印标识。',
  },
]

function pricing(): ModelManifest['pricing'] {
  return {
    unit: 'per_second',
    quantityKey: 'duration',
    currency: 'CNY',
    rates: [
      {
        id: 'cn-beijing-480p-output-second',
        region: 'cn-beijing',
        serviceScope: 'china-mainland',
        chargeItem: 'output',
        unit: 'second',
        unitSize: 1,
        unitPrice: '0.3',
        conditions: { resolution: '480P' },
      },
      {
        id: 'cn-beijing-720p-output-second',
        region: 'cn-beijing',
        serviceScope: 'china-mainland',
        chargeItem: 'output',
        unit: 'second',
        unitSize: 1,
        unitPrice: '0.6',
        conditions: { resolution: '720P' },
      },
      {
        id: 'cn-beijing-1080p-output-second',
        region: 'cn-beijing',
        serviceScope: 'china-mainland',
        chargeItem: 'output',
        unit: 'second',
        unitSize: 1,
        unitPrice: '1.2',
        conditions: { resolution: '1080P' },
      },
    ],
  }
}

function transport(): ModelManifest['transport'] {
  return {
    mode: 'provider_async',
    submit: {
      method: 'POST',
      endpointTemplate: SUBMIT_ENDPOINT,
      modelFieldPath: '/model',
      headers: [
        { name: 'Authorization' },
        { name: 'Content-Type', value: 'application/json' },
        { name: 'X-DashScope-Async', value: 'enable' },
      ],
    },
    polling: {
      method: 'GET',
      endpointTemplate: POLL_ENDPOINT,
      headers: [{ name: 'Authorization' }],
      taskIdPath: '/output/task_id',
      statusPath: '/output/task_status',
      succeededValues: ['SUCCEEDED'],
      failedValues: ['FAILED', 'CANCELED', 'UNKNOWN'],
    },
  }
}

const commonOutput: ModelManifest['output'] = { kind: 'video-url', path: 'output.video_url' }

export const wan3T2V: ModelManifest = {
  id: 'wan3-text-to-video',
  provider: 'dashscope',
  providerModel: PROVIDER_MODEL,
  displayName: 'Wanxiang 3.0 Text to Video',
  description: '万相 3.0 文生视频，支持 480P 至 1080P、最长 30 秒视频生成。',
  category: 'video',
  taskMode: 'provider_async',
  capabilities: ['text_prompt'],
  parameters: COMMON_PARAMETERS(true),
  request: {
    kind: 'dashscope-video-task',
    endpoint: VIDEO_ENDPOINT,
    mediaMode: 'none',
    bindings: {
      prompt: { target: 'input.prompt' },
      resolution: { target: 'parameters.field' },
      ratio: { target: 'parameters.field' },
      duration: { target: 'parameters.field' },
      audio: { target: 'parameters.field' },
      seed: { target: 'parameters.field' },
      watermark: { target: 'parameters.field' },
    },
  },
  output: commonOutput,
  pricing: pricing(),
  transport: transport(),
  availability: { enabled: true, stage: 'beta' },
}

export const wan3I2V: ModelManifest = {
  id: 'wan3-image-to-video',
  provider: 'dashscope',
  providerModel: PROVIDER_MODEL,
  displayName: 'Wanxiang 3.0 Image to Video',
  description: '万相 3.0 首尾帧图生视频，支持首帧、尾帧或首尾帧图像输入。',
  category: 'video',
  taskMode: 'provider_async',
  capabilities: ['text_prompt', 'image_input'],
  parameters: [
    {
      name: 'firstFrame',
      label: '首帧图像',
      type: 'media',
      mediaKind: 'image',
      required: false,
      maxItems: 1,
      description: '视频起始帧图像；每次最多 1 张。',
    },
    {
      name: 'lastFrame',
      label: '尾帧图像',
      type: 'media',
      mediaKind: 'image',
      required: false,
      maxItems: 1,
      description: '视频结束帧图像；每次最多 1 张。',
    },
    ...COMMON_PARAMETERS(false),
  ],
  rules: [
    {
      kind: 'media-group',
      fields: ['firstFrame', 'lastFrame'],
      minItems: 1,
      maxItems: 2,
      code: 'REQUIRED_MEDIA',
      message: {
        'zh-CN': '首帧图像与尾帧图像至少需要提供一个，合计最多两个',
        'en-US': 'At least one first or last frame is required, with at most two frames in total',
      },
    },
  ],
  request: {
    kind: 'dashscope-video-task',
    endpoint: VIDEO_ENDPOINT,
    mediaMode: 'multi',
    bindings: {
      firstFrame: { target: 'input.media', mediaType: 'first_frame' },
      lastFrame: { target: 'input.media', mediaType: 'last_frame' },
      prompt: { target: 'input.prompt' },
      resolution: { target: 'parameters.field' },
      ratio: { target: 'parameters.field' },
      duration: { target: 'parameters.field' },
      audio: { target: 'parameters.field' },
      seed: { target: 'parameters.field' },
      watermark: { target: 'parameters.field' },
    },
  },
  output: commonOutput,
  pricing: pricing(),
  transport: transport(),
  availability: { enabled: true, stage: 'beta' },
}

export const wan3R2V: ModelManifest = {
  id: 'wan3-reference-to-video',
  provider: 'dashscope',
  providerModel: PROVIDER_MODEL,
  displayName: 'Wanxiang 3.0 Reference to Video',
  description: '万相 3.0 参考生视频，支持参考图片、视频和音频素材。',
  category: 'video',
  taskMode: 'provider_async',
  // multi_reference keeps this model in the「参考生视频」product mode. The media
  // parameter declarations still carry the concrete image/video/audio kinds used by
  // the asset selector and worker-side asset validation.
  capabilities: ['text_prompt', 'image_input', 'multi_reference'],
  parameters: [
    {
      name: 'references',
      label: '参考图像',
      type: 'media',
      mediaKind: 'image',
      required: false,
      maxItems: 10,
      description: '参考图片素材，最多 10 张；提示词中可用“图n”指代。',
    },
    {
      name: 'referenceVideos',
      label: '参考视频',
      type: 'media',
      mediaKind: 'video',
      required: false,
      maxItems: 5,
      description: '参考视频素材，最多 5 段；提示词中可用“视频n”指代。',
    },
    {
      name: 'referenceAudios',
      label: '参考音频',
      type: 'media',
      mediaKind: 'audio',
      required: false,
      maxItems: 5,
      description: '参考音频素材，最多 5 段。',
    },
    ...COMMON_PARAMETERS(false),
  ],
  rules: [
    {
      kind: 'media-group',
      fields: ['references', 'referenceVideos', 'referenceAudios'],
      minItems: 1,
      maxItems: 10,
      code: 'REQUIRED_MEDIA',
      message: {
        'zh-CN': '参考图片、参考视频与参考音频合计至少需要一个，最多十个',
        'en-US': 'At least one reference image, video, or audio is required, with at most ten references in total',
      },
    },
  ],
  request: {
    kind: 'dashscope-video-task',
    endpoint: VIDEO_ENDPOINT,
    mediaMode: 'multi',
    referenceFormat: 'chinese',
    bindings: {
      references: { target: 'input.media', mediaType: 'reference_image' },
      referenceVideos: { target: 'input.media', mediaType: 'reference_video' },
      referenceAudios: { target: 'input.media', mediaType: 'reference_audio' },
      prompt: { target: 'input.prompt' },
      resolution: { target: 'parameters.field' },
      ratio: { target: 'parameters.field' },
      duration: { target: 'parameters.field' },
      audio: { target: 'parameters.field' },
      seed: { target: 'parameters.field' },
      watermark: { target: 'parameters.field' },
    },
  },
  output: commonOutput,
  pricing: pricing(),
  transport: transport(),
  availability: { enabled: true, stage: 'beta' },
}
