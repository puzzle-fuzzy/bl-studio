import type { ModelManifest } from '../../types'

export const qwenOmniScreenplay: ModelManifest = {
  id: 'qwen-omni-screenplay',
  provider: 'dashscope',
  providerModel: 'qwen3.5-omni-plus',
  displayName: '视频生成剧本（精准版）',
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
      description: '剧本输出语言',
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
      description: '控制剧本描述的详细程度',
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
    tiers: [{ condition: {}, priceCents: 1 }],
    actualUsage: {
      kind: 'chat_tokens',
      inputTextPriceCentsPerMillion: 700,
      inputAudioPriceCentsPerMillion: 5300,
      outputTextPriceCentsPerMillion: 4000,
    },
  },
  availability: { enabled: true, stage: 'beta' },
}
