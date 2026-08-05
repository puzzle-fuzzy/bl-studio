import type { ModelManifest } from '../../types'

/**
 * paraformer-v1 模型 manifest（provider: dashscope，category: audio）。
 *
 * 语音转写（ASR）：异步提交音频 URL，轮询后取得 transcription_url。
 */

export const paraformerV1: ModelManifest = {
  id: 'paraformer-v1',
  provider: 'dashscope',
  providerModel: 'paraformer-v1',
  displayName: 'Paraformer V1',
  description: 'Paraformer 语音识别，高精度中文语音转写',
  category: 'audio',
  taskMode: 'provider_async',
  capabilities: ['audio_input'],
  parameters: [
    {
      name: 'audioUrl',
      label: '音频文件URL',
      type: 'media',
      mediaKind: 'audio',
      required: true,
      minItems: 1,
      maxItems: 1,
      description: '支持音频文件URL，格式：wav/mp3等',
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
    },
    {
      name: 'diarizationEnabled',
      label: '说话人分离',
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'speakerCount',
      label: '参考说话人数',
      type: 'number',
      min: 2,
      max: 100,
      step: 1,
      visibleWhen: { field: 'diarizationEnabled', equals: true },
    },
    { name: 'disfluencyRemovalEnabled', label: '过滤语气词', type: 'boolean', defaultValue: false },
    { name: 'timestampAlignmentEnabled', label: '时间戳校准', type: 'boolean', defaultValue: false },
    {
      name: 'duration',
      label: '预估音频时长(秒)',
      type: 'number',
      defaultValue: 60,
      min: 1,
      description: '预估待识别音频时长，仅用于费用预估（实际按音频秒数计费）',
    },
  ],
  request: {
    kind: 'dashscope-audio-task',
    endpoint: '/services/audio/asr/transcription',
    bindings: {
      audioUrl: { target: 'input.field', field: 'file_urls', wrapInArray: true },
      channelId: { target: 'parameters.field', field: 'channel_id' },
      diarizationEnabled: { target: 'parameters.field', field: 'diarization_enabled' },
      speakerCount: { target: 'parameters.field', field: 'speaker_count' },
      disfluencyRemovalEnabled: { target: 'parameters.field', field: 'disfluency_removal_enabled' },
      timestampAlignmentEnabled: { target: 'parameters.field', field: 'timestamp_alignment_enabled' },
      // duration 仅用于费用预估，不发送给 provider
      duration: { target: 'ui.only' },
    },
  },
  output: { kind: 'asr-transcription' },
  pricing: {
    unit: 'per_second',
    quantityKey: 'duration',
    currency: 'CNY',
    tiers: [{ condition: {}, priceCents: 0.008 }],
  },
  availability: { enabled: true, stage: 'beta' },
}
