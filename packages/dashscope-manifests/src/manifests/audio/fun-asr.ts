import type { ModelManifest } from '../../types'

/**
 * fun-asr-v1 模型 manifest（provider: dashscope，category: audio）。
 *
 * 异步语音识别（Fun-ASR）：输入音频 URL，异步提交任务并轮询，返回转录文本 URL。
 * 与同步的 paraformer-v1 不同，Fun-ASR 使用「提交 → 轮询」的异步模式，适用于
 * 长音频场景。
 *
 * API 文档对应：
 *   - 提交：POST /services/audio/asr/transcription
 *     （X-DashScope-Async: enable，同现有异步视频任务模式）
 *   - 轮询：GET /tasks/{task_id}
 *     （返回 output.results[].transcription_url，指向有效期为 24h 的签名 URL）
 *
 * 定价按音频时长（秒），由 usage.duration 返回实际处理时长。
 */

export const funAsrV1: ModelManifest = {
  id: 'fun-asr-v1',
  provider: 'dashscope',
  providerModel: 'fun-asr',
  displayName: 'Fun-ASR 语音识别',
  description: 'Fun-ASR 语音识别，将音频转写为文字',
  category: 'audio',
  taskMode: 'provider_async',
  capabilities: ['audio_input'],
  parameters: [
    {
      name: 'fileUrls',
      label: '音频文件URL',
      type: 'media',
      mediaKind: 'audio',
      required: true,
      minItems: 1,
      maxItems: 1,
      description: '支持 HTTP/HTTPS 音频文件 URL（wav/mp3/opus 等格式）',
    },
    {
      name: 'channelId',
      label: '音轨索引',
      type: 'select',
      defaultValue: [0],
      options: [
        { label: '第一音轨', value: [0] },
        { label: '第一和第二音轨', value: [0, 1] },
      ],
      description: '指定在多音轨音频中需要识别的音轨，每个音轨独立计费',
    },
    {
      name: 'diarizationEnabled',
      label: '说话人分离',
      type: 'boolean',
      defaultValue: false,
      description: '启用后识别结果中会显示 speaker_id 字段用于区分不同说话人（仅单声道音频支持）',
    },
    {
      name: 'speakerCount',
      label: '参考说话人数',
      type: 'number',
      min: 2,
      max: 100,
      step: 1,
      visibleWhen: { field: 'diarizationEnabled', equals: true },
      description: '仅在开启说话人分离时生效，帮助模型估计说话人数（2-100）',
    },
    {
      name: 'language',
      label: '识别语言',
      type: 'select',
      options: [
        { label: '中文', value: 'zh' },
        { label: '英文', value: 'en' },
        { label: '日语', value: 'ja' },
        { label: '韩语', value: 'ko' },
        ...['vi', 'th', 'id', 'ms', 'tl', 'hi', 'ar', 'fr', 'de', 'es', 'pt', 'ru', 'it', 'nl', 'sv', 'da', 'fi', 'no', 'el', 'pl', 'cs', 'hu', 'ro', 'bg', 'hr', 'sk']
          .map(value => ({ label: value.toUpperCase(), value })),
      ],
      description: '可选的单一待识别语种；不设置时由模型自动识别',
    },
    {
      name: 'duration',
      label: '预估音频时长(秒)',
      type: 'number',
      defaultValue: 60,
      min: 1,
      description: '预估待识别音频时长，仅用于费用预估',
    },
  ],
  request: {
    kind: 'dashscope-audio-task',
    endpoint: '/services/audio/asr/transcription',
    bindings: {
      fileUrls: { target: 'input.field', field: 'file_urls', wrapInArray: true },
      channelId: { target: 'parameters.field', field: 'channel_id' },
      diarizationEnabled: { target: 'parameters.field', field: 'diarization_enabled' },
      speakerCount: { target: 'parameters.field', field: 'speaker_count' },
      language: { target: 'parameters.field', field: 'language_hints', wrapInArray: true },
      duration: { target: 'ui.only' },
    },
  },
  output: { kind: 'asr-transcription' },
  pricing: {
    unit: 'per_second',
    quantityKey: 'duration',
    currency: 'CNY',
    rates: [
      {
        id: 'cn-beijing-input-second',
        region: 'cn-beijing',
        serviceScope: 'china-mainland',
        chargeItem: 'input',
        unit: 'second',
        unitSize: 1,
        unitPrice: '0.00022',
        conditions: {},
      },
    ],
  },
  transport: {
    mode: 'provider_async',
    submit: {
      method: 'POST',
      endpointTemplate: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/asr/transcription',
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
  },
  availability: { enabled: true, stage: 'beta' },
}
