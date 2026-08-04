import type { ModelManifest } from '../../types'

/**
 * 万相 2.7 图像系列 manifest（provider: dashscope，category: image）。
 *
 * 官方当前接口是图像编辑：必须提供 1~9 张输入图像和一条文本指令，走
 * multimodal-generation 同步端点。支持普通模式与 1~12 张的组图输出。
 */

export const wanx27ImagePro: ModelManifest = {
  id: 'wanx-2.7-image-pro',
  provider: 'dashscope',
  providerModel: 'wan2.7-image-pro',
  displayName: 'Wanx 2.7 Image Edit Pro',
  category: 'image',
  taskMode: 'sync',
  capabilities: ['text_prompt', 'image_input', 'seed'],
  parameters: [
    {
      name: 'images',
      label: '输入图像',
      type: 'media',
      mediaKind: 'image',
      required: true,
      minItems: 1,
      maxItems: 9,
      description: '待编辑的输入图像，支持 1~9 张并按选择顺序发送',
    },
    {
      name: 'prompt',
      label: '提示词',
      type: 'text',
      required: true,
      maxLength: 5000,
      description: '描述期望生成的图像内容、风格和构图，支持中英文',
    },
    {
      name: 'size',
      label: '分辨率',
      type: 'select',
      defaultValue: '2K',
      options: [
        { label: '1K (1024×1024)', value: '1K' },
        { label: '2K (2048×2048)', value: '2K' },
      ],
    },
    {
      name: 'n',
      label: '图片数量',
      type: 'number',
      defaultValue: 1,
      min: 1,
      max: 12,
      step: 1,
      description: '生成图片数量，1-12张',
    },
    {
      name: 'enableSequential',
      label: '组图模式',
      type: 'boolean',
      defaultValue: false,
      description: '启用组图输出模式，支持1-12张连贯图片',
    },
    {
      name: 'watermark',
      label: '水印',
      type: 'boolean',
      defaultValue: false,
      description: '是否添加"AI生成"水印',
    },
    {
      name: 'seed',
      label: '随机种子',
      type: 'number',
      required: false,
      description: '随机数种子，取值范围[0,2147483647]',
    },
  ],
  request: {
    kind: 'dashscope-image-message',
    endpoint: '/services/aigc/multimodal-generation/generation',
    bindings: {
      images: { target: 'input.media', mediaType: 'image' },
      prompt: { target: 'input.prompt' },
      size: { target: 'parameters.field' },
      n: { target: 'parameters.field' },
      enableSequential: { target: 'parameters.field', field: 'enable_sequential' },
      watermark: { target: 'parameters.field' },
      seed: { target: 'parameters.field' },
    },
  },
  output: { kind: 'images-from-message-content' },
  pricing: {
    unit: 'per_image',
    quantityKey: 'n',
    currency: 'CNY',
    tiers: [
      { condition: {}, priceCents: 50 },
    ],
  },
  availability: { enabled: true, stage: 'stable' },
}

export const wanx27Image: ModelManifest = {
  id: 'wanx-2.7-image',
  provider: 'dashscope',
  providerModel: 'wan2.7-image',
  displayName: 'Wanx 2.7 Image Edit',
  category: 'image',
  taskMode: 'sync',
  capabilities: ['text_prompt', 'image_input', 'seed'],
  parameters: [
    {
      name: 'images',
      label: '输入图像',
      type: 'media',
      mediaKind: 'image',
      required: true,
      minItems: 1,
      maxItems: 9,
      description: '待编辑的输入图像，支持 1~9 张并按选择顺序发送',
    },
    {
      name: 'prompt',
      label: '提示词',
      type: 'text',
      required: true,
      maxLength: 5000,
      description: '描述期望生成的图像内容、风格和构图，支持中英文',
    },
    {
      name: 'size',
      label: '分辨率',
      type: 'select',
      defaultValue: '2K',
      options: [
        { label: '1K (1024×1024)', value: '1K' },
        { label: '2K (2048×2048)', value: '2K' },
      ],
    },
    {
      name: 'n',
      label: '图片数量',
      type: 'number',
      defaultValue: 1,
      min: 1,
      max: 12,
      step: 1,
      description: '生成图片数量，1-12张',
    },
    {
      name: 'enableSequential',
      label: '组图模式',
      type: 'boolean',
      defaultValue: false,
      description: '启用组图输出模式，支持1-12张连贯图片',
    },
    {
      name: 'watermark',
      label: '水印',
      type: 'boolean',
      defaultValue: false,
      description: '是否添加"AI生成"水印',
    },
    {
      name: 'seed',
      label: '随机种子',
      type: 'number',
      required: false,
      description: '随机数种子，取值范围[0,2147483647]',
    },
  ],
  request: {
    kind: 'dashscope-image-message',
    endpoint: '/services/aigc/multimodal-generation/generation',
    bindings: {
      images: { target: 'input.media', mediaType: 'image' },
      prompt: { target: 'input.prompt' },
      size: { target: 'parameters.field' },
      n: { target: 'parameters.field' },
      enableSequential: { target: 'parameters.field', field: 'enable_sequential' },
      watermark: { target: 'parameters.field' },
      seed: { target: 'parameters.field' },
    },
  },
  output: { kind: 'images-from-message-content' },
  pricing: {
    unit: 'per_image',
    quantityKey: 'n',
    currency: 'CNY',
    tiers: [
      { condition: {}, priceCents: 20 },
    ],
  },
  availability: { enabled: true, stage: 'stable' },
}
