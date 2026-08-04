import type { ModelManifest } from '../../types'

/**
 * 千问图像 2.x 系列 manifest（provider: dashscope，category: image）。
 *
 * 包含三个文生图变体，均走 multimodal-generation 端点（同步任务，按张计费）：
 *  - qwen-image-2.0-pro：2.0 Pro，支持 1~6 张多图输出，单张 0.20 元
 *  - qwen-image-max：质量档，n 固定为 1（不暴露给 UI），单张 0.25 元
 *  - qwen-image-2.0：2.0 标准版，支持 1~6 张多图输出，单张 0.15 元
 *
 * 与 qwen-image 一致：negativePrompt 走 parameters.negative_prompt（snake_case）。
 */

export const qwenImage2Pro: ModelManifest = {
  id: 'qwen-image-2.0-pro',
  provider: 'dashscope',
  providerModel: 'qwen-image-2.0-pro',
  displayName: 'Qwen Image 2.0 Pro',
  category: 'image',
  taskMode: 'sync',
  capabilities: ['text_prompt', 'negative_prompt', 'seed'],
  parameters: [
    {
      name: 'prompt',
      label: '提示词',
      type: 'text',
      required: true,
      maxLength: 1300,
      description: '描述期望生成的图像内容、风格和构图，支持中英文',
    },
    {
      name: 'negativePrompt',
      label: '反向提示词',
      type: 'text',
      required: false,
      maxLength: 500,
      description: '描述不希望在图像中出现的内容',
    },
    {
      name: 'size',
      label: '分辨率',
      type: 'select',
      defaultValue: '2048*2048',
      options: [
        { label: '1:1 (2048×2048)', value: '2048*2048' },
        { label: '16:9 (2688×1536)', value: '2688*1536' },
        { label: '9:16 (1536×2688)', value: '1536*2688' },
        { label: '4:3 (2368×1728)', value: '2368*1728' },
        { label: '3:4 (1728×2368)', value: '1728*2368' },
      ],
    },
    {
      name: 'n',
      label: '图片数量',
      type: 'number',
      defaultValue: 1,
      min: 1,
      max: 6,
      step: 1,
      description: '生成图片数量，1-6张',
    },
    {
      name: 'promptExtend',
      label: '智能改写',
      type: 'boolean',
      defaultValue: true,
      description: '开启prompt智能改写，对短prompt效果提升明显',
    },
    {
      name: 'watermark',
      label: '水印',
      type: 'boolean',
      defaultValue: false,
      description: '是否添加"Qwen-Image"水印',
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
      prompt: { target: 'input.prompt' },
      negativePrompt: { target: 'parameters.field', field: 'negative_prompt' },
      size: { target: 'parameters.field' },
      n: { target: 'parameters.field' },
      promptExtend: { target: 'parameters.field', field: 'prompt_extend' },
      watermark: { target: 'parameters.field' },
      seed: { target: 'parameters.field' },
    },
  },
  output: { kind: 'images-from-message-content' },
  pricing: {
    unit: 'per_image',
    quantityKey: 'n',
    currency: 'CNY',
    tiers: [{ condition: {}, priceCents: 20 }],
  },
  availability: { enabled: true, stage: 'stable' },
}

export const qwenImageMax: ModelManifest = {
  id: 'qwen-image-max',
  provider: 'dashscope',
  providerModel: 'qwen-image-max',
  displayName: 'Qwen Image Max',
  category: 'image',
  taskMode: 'sync',
  capabilities: ['text_prompt', 'negative_prompt', 'seed'],
  parameters: [
    {
      name: 'prompt',
      label: '提示词',
      type: 'text',
      required: true,
      maxLength: 800,
      description: '描述期望生成的图像内容、风格和构图，支持中英文',
    },
    {
      name: 'negativePrompt',
      label: '反向提示词',
      type: 'text',
      required: false,
      maxLength: 500,
      description: '描述不希望在图像中出现的内容',
    },
    {
      name: 'size',
      label: '分辨率',
      type: 'select',
      defaultValue: '1664*928',
      options: [
        { label: '16:9 (1664×928)', value: '1664*928' },
        { label: '4:3 (1472×1104)', value: '1472*1104' },
        { label: '1:1 (1328×1328)', value: '1328*1328' },
        { label: '3:4 (1104×1472)', value: '1104*1472' },
        { label: '9:16 (928×1664)', value: '928*1664' },
      ],
    },
    // qwen-image-max 的 n 固定为 1：不暴露给 UI，仅保留用于定价计算（按张计费）
    {
      name: 'n',
      label: '图片数量',
      type: 'number',
      defaultValue: 1,
      min: 1,
      max: 1,
      step: 1,
      description: '固定为1张',
    },
    {
      name: 'promptExtend',
      label: '智能改写',
      type: 'boolean',
      defaultValue: true,
      description: '开启prompt智能改写，对短prompt效果提升明显',
    },
    {
      name: 'watermark',
      label: '水印',
      type: 'boolean',
      defaultValue: false,
      description: '是否添加"Qwen-Image"水印',
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
      prompt: { target: 'input.prompt' },
      negativePrompt: { target: 'parameters.field', field: 'negative_prompt' },
      size: { target: 'parameters.field' },
      promptExtend: { target: 'parameters.field', field: 'prompt_extend' },
      watermark: { target: 'parameters.field' },
      seed: { target: 'parameters.field' },
    },
  },
  output: { kind: 'images-from-message-content' },
  pricing: {
    unit: 'per_image',
    quantityKey: 'n',
    currency: 'CNY',
    tiers: [{ condition: {}, priceCents: 25 }],
  },
  availability: { enabled: true, stage: 'stable' },
}

export const qwenImage2: ModelManifest = {
  id: 'qwen-image-2.0',
  provider: 'dashscope',
  providerModel: 'qwen-image-2.0',
  displayName: 'Qwen Image 2.0',
  category: 'image',
  taskMode: 'sync',
  capabilities: ['text_prompt', 'negative_prompt', 'seed'],
  parameters: [
    {
      name: 'prompt',
      label: '提示词',
      type: 'text',
      required: true,
      maxLength: 1300,
      description: '描述期望生成的图像内容、风格和构图，支持中英文',
    },
    {
      name: 'negativePrompt',
      label: '反向提示词',
      type: 'text',
      required: false,
      maxLength: 500,
      description: '描述不希望在图像中出现的内容',
    },
    {
      name: 'size',
      label: '分辨率',
      type: 'select',
      defaultValue: '2048*2048',
      options: [
        { label: '1:1 (2048×2048)', value: '2048*2048' },
        { label: '16:9 (2688×1536)', value: '2688*1536' },
        { label: '9:16 (1536×2688)', value: '1536*2688' },
        { label: '4:3 (2368×1728)', value: '2368*1728' },
        { label: '3:4 (1728×2368)', value: '1728*2368' },
      ],
    },
    {
      name: 'n',
      label: '图片数量',
      type: 'number',
      defaultValue: 1,
      min: 1,
      max: 6,
      step: 1,
      description: '生成图片数量，1-6张',
    },
    {
      name: 'promptExtend',
      label: '智能改写',
      type: 'boolean',
      defaultValue: true,
      description: '开启prompt智能改写，对短prompt效果提升明显',
    },
    {
      name: 'watermark',
      label: '水印',
      type: 'boolean',
      defaultValue: false,
      description: '是否添加"Qwen-Image"水印',
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
      prompt: { target: 'input.prompt' },
      negativePrompt: { target: 'parameters.field', field: 'negative_prompt' },
      size: { target: 'parameters.field' },
      n: { target: 'parameters.field' },
      promptExtend: { target: 'parameters.field', field: 'prompt_extend' },
      watermark: { target: 'parameters.field' },
      seed: { target: 'parameters.field' },
    },
  },
  output: { kind: 'images-from-message-content' },
  pricing: {
    unit: 'per_image',
    quantityKey: 'n',
    currency: 'CNY',
    tiers: [{ condition: {}, priceCents: 15 }],
  },
  availability: { enabled: true, stage: 'stable' },
}
