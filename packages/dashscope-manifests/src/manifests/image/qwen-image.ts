import type { ModelManifest } from '@bailian-studio/model-core'

/**
 * qwen-image 模型 manifest（provider: dashscope，category: image）。
 *
 * 通义千问文生图：基于 multimodal-generation（多模态生成）端点，输入文本提示词
 * （可选反向提示词、随机种子、分辨率等），固定输出 1 张图片。同步任务模式，按张计费。
 */

export const qwenImage: ModelManifest = {
  id: 'qwen-image',
  provider: 'dashscope',
  providerModel: 'qwen-image',
  displayName: 'Qwen Image',
  description: 'Qwen 文生图模型，根据文字描述生成高质量图片',
  category: 'image',
  taskMode: 'sync',
  capabilities: ['text_prompt', 'negative_prompt', 'seed'],
  parameters: [
    { name: 'prompt', label: '提示词', type: 'text', required: true, maxLength: 800, description: '描述期望生成的图像内容、风格和构图，支持中英文' },
    { name: 'negativePrompt', label: '反向提示词', type: 'text', required: false, maxLength: 500, description: '描述不希望在图像中出现的内容' },
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
    { name: 'n', label: '图片数量', type: 'number', defaultValue: 1, min: 1, max: 1, step: 1, description: '固定为1张' },
    { name: 'promptExtend', label: '智能改写', type: 'boolean', defaultValue: true, description: '开启prompt智能改写，对短prompt效果提升明显' },
    { name: 'watermark', label: '水印', type: 'boolean', defaultValue: false, description: '是否添加"Qwen-Image"水印' },
    { name: 'seed', label: '随机种子', type: 'number', required: false, min: 0, max: 2147483647, step: 1, description: '随机数种子，取值范围[0,2147483647]' },
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
    rates: [
      {
        id: 'cn-beijing-output-image',
        region: 'cn-beijing',
        serviceScope: 'china-mainland',
        chargeItem: 'output',
        unit: 'image',
        unitSize: 1,
        unitPrice: '0.25',
        conditions: {},
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
  examples: {
    valid: [
      { prompt: '一只橘猫在窗台上晒太阳' },
      { prompt: '赛博朋克城市夜景', negativePrompt: '人物', size: '928*1664', seed: 42 },
    ],
    invalid: [
      { params: {}, expectedCode: 'REQUIRED_PARAMETER', expectedField: 'prompt' },
      { params: { prompt: 'a'.repeat(801) }, expectedCode: 'OUT_OF_RANGE', expectedField: 'prompt' },
      { params: { prompt: 'cat', size: '999*999' }, expectedCode: 'INVALID_VALUE', expectedField: 'size' },
      { params: { prompt: 'cat', seed: 99999999999 }, expectedCode: 'OUT_OF_RANGE', expectedField: 'seed' },
      { params: { prompt: 'cat', unknownParam: 'x' }, expectedCode: 'UNKNOWN_PARAMETER', expectedField: 'unknownParam' },
    ],
  },
}
