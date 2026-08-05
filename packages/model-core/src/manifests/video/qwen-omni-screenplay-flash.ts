import type { ModelManifest } from '../../types'

export const qwenOmniScreenplayFlash: ModelManifest = {
  id: 'qwen-omni-screenplay-flash',
  provider: 'dashscope',
  providerModel: 'qwen3.5-omni-flash',
  displayName: '视频生成剧本（快速版）',
  description: '从视频中快速提取关键信息生成剧本，速度优先',
  category: 'video',
  taskMode: 'stream',
  capabilities: ['video_input', 'streaming'],
  parameters: [
    {
      name: 'videoUrl',
      label: '视频 URL',
      type: 'media',
      mediaKind: 'video',
      required: true,
      description: '从资产库选择、上传视频，或粘贴公开 URL（MP4/AVI/MKV/MOV/FLV 等格式）',
    },
    {
      name: 'language',
      label: '输出语言',
      type: 'select',
      defaultValue: 'zh',
      options: [
        { label: '中文', value: 'zh' },
        { label: '英文', value: 'en' },
        { label: '中英双语', value: 'zh_en' },
      ],
    },
    {
      name: 'detailLevel',
      label: '精细度',
      type: 'select',
      defaultValue: 'standard',
      options: [
        { label: '标准（场景+对白）', value: 'standard' },
        { label: '精细（含镜头/音效描述）', value: 'detailed' },
      ],
    },
    {
      name: 'estimatedDuration',
      label: '预估视频时长(秒)',
      type: 'number',
      defaultValue: 60,
      min: 1,
      description: '仅用于费用预估，不影响结果',
    },
  ],
  request: {
    kind: 'dashscope-chat',
    endpoint: '/compatible-mode/v1/chat/completions',
    promptParam: 'prompt',
    stream: true,
    bindings: {
      videoUrl: { target: 'ui.only' },
      language: { target: 'ui.only' },
      detailLevel: { target: 'ui.only' },
      estimatedDuration: { target: 'ui.only' },
    },
  },
  output: { kind: 'text', path: 'output.text' },
  pricing: {
    unit: 'per_second',
    quantityKey: 'estimatedDuration',
    currency: 'CNY',
    tiers: [{ condition: {}, priceCents: 0.5 }],
    actualUsage: {
      kind: 'chat_tokens',
      inputTextPriceCentsPerMillion: 220,
      inputAudioPriceCentsPerMillion: 1800,
      outputTextPriceCentsPerMillion: 1330,
    },
  },
  availability: { enabled: true, stage: 'beta' },
}
