import type { ModelManifest } from '@bailian-studio/model-core'

/**
 * z-image-turbo 模型 manifest（provider: dashscope，category: image）。
 *
 * 官网当前接口走 multimodal-generation 消息结构，单次固定输出一张图。
 * prompt_extend 关闭时 0.10 元/张，开启时 0.20 元/张。
 */

export const zImage: ModelManifest = {
  id: 'z-image-turbo',
  provider: 'dashscope',
  providerModel: 'z-image-turbo',
  displayName: 'Z-Image Turbo',
  description: 'Z-Image 快速文生图，低延迟高性价比',
  category: 'image',
  taskMode: 'sync',
  capabilities: ['text_prompt', 'seed'],
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
      name: 'size',
      label: '分辨率',
      type: 'select',
      defaultValue: '1024*1536',
      options: [
        { label: '1:1 (1024×1024)', value: '1024*1024' },
        { label: '2:3 (1024×1536)', value: '1024*1536' },
        { label: '16:9 (1344×768)', value: '1344*768' },
        { label: '9:16 (768×1344)', value: '768*1344' },
        { label: '4:3 (1344×1008)', value: '1344*1008' },
        { label: '3:4 (1008×1344)', value: '1008*1344' },
      ],
    },
    {
      name: 'n',
      label: '图片数量',
      type: 'number',
      defaultValue: 1,
      min: 1,
      max: 1,
      step: 1,
      description: '该模型单次固定生成 1 张图片',
    },
    {
      name: 'promptExtend',
      label: '智能改写',
      type: 'boolean',
      defaultValue: false,
      description: '是否开启提示词智能改写与思考过程',
    },
    {
      name: 'seed',
      label: '随机种子',
      type: 'number',
      required: false,
      min: 0, max: 2147483647, step: 1,
      description: '随机数种子，取值范围[0,2147483647]',
    },
  ],
  request: {
    kind: 'dashscope-image-message',
    endpoint: '/services/aigc/multimodal-generation/generation',
    bindings: {
      prompt: { target: 'input.prompt' },
      size: { target: 'parameters.field' },
      n: { target: 'ui.only' },
      promptExtend: { target: 'parameters.field', field: 'prompt_extend' },
      seed: { target: 'parameters.field' },
    },
  },
  output: { kind: 'images-from-message-content' },
  pricing: {
    unit: 'per_image',
    quantityKey: 'n',
    currency: 'CNY',
    rates: [
      {
        id: 'cn-beijing-prompt-extend-off-output-image',
        region: 'cn-beijing',
        serviceScope: 'china-mainland',
        chargeItem: 'output',
        unit: 'image',
        unitSize: 1,
        unitPrice: '0.1',
        conditions: { promptExtend: false },
      },
      {
        id: 'cn-beijing-prompt-extend-on-output-image',
        region: 'cn-beijing',
        serviceScope: 'china-mainland',
        chargeItem: 'output',
        unit: 'image',
        unitSize: 1,
        unitPrice: '0.2',
        conditions: { promptExtend: true },
      },
    ],
  },
  transport: {
    mode: 'sync',
    submit: {
      method: 'POST',
      endpointTemplate: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      modelFieldPath: '/model',
      headers: [
        { name: 'Authorization' },
        { name: 'Content-Type', value: 'application/json' },
      ],
    },
  },
  availability: { enabled: true, stage: 'stable' },
}
