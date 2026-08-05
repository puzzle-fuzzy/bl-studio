import type { ModelManifest } from '../../types'

/**
 * 千问图像编辑系列 manifest（provider: dashscope，category: image）。
 *
 * 与文生图共用 multimodal-generation 端点，差别仅在用户消息里带上 1~3 张输入图像：
 * 请求构建器对 dashscope-image-message 类型会自动把 input.media（图像）与
 * input.prompt（编辑指令）打包成 input.messages[0].content，图像在前、文本在后，
 * 与官方示例一致。本文件是工厂函数 + 三个具体变体：
 *  - qwen-image-edit-max：能力最强，单图 0.50 元，最多 6 张输出
 *  - qwen-image-edit-plus：性价比档，单图 0.20 元，最多 6 张输出
 *  - qwen-image-edit：单图编辑/多图融合，n 固定为 1，单图 0.30 元
 */
interface QwenImageEditOptions {
  id: string
  providerModel: string
  displayName: string
  description: string
  priceCentsPerImage: number
  /** 最大输出图片数（qwen-image-edit 固定为 1；plus/max 支持 1~6 张）。 */
  maxN: number
  /** 基础版不支持 size 与 prompt_extend；Plus/Max 支持。 */
  advancedParameters: boolean
}

function makeQwenImageEdit(options: QwenImageEditOptions): ModelManifest {
  return {
    id: options.id,
    provider: 'dashscope',
    providerModel: options.providerModel,
    displayName: options.displayName,
    description: options.description,
    category: 'image',
    taskMode: 'sync',
    capabilities: ['text_prompt', 'image_input', 'negative_prompt', 'seed'],
    parameters: [
      {
        name: 'image',
        label: '输入图像',
        type: 'media',
        mediaKind: 'image',
        required: true,
        minItems: 1,
        maxItems: 3,
        description: '待编辑的图像URL，1~3张；多图输入时按数组顺序定义图像顺序，输出比例以最后一张为准',
      },
      {
        name: 'prompt',
        label: '编辑指令',
        type: 'text',
        required: true,
        maxLength: 1300,
        description: '描述编辑目标，可引用上方输入图像',
      },
      {
        name: 'negativePrompt',
        label: '反向提示词',
        type: 'text',
        required: false,
        maxLength: 500,
        description: '描述不希望在画面中出现的内容',
      },
      ...(options.advancedParameters ? [{
        name: 'size',
        label: '输出分辨率',
        type: 'select' as const,
        defaultValue: '1024*1024',
        options: [
          { label: '1:1 (1024×1024)', value: '1024*1024' },
          { label: '2:3 (1024×1536)', value: '1024*1536' },
          { label: '3:2 (1536×1024)', value: '1536*1024' },
          { label: '3:4 (1080×1440)', value: '1080*1440' },
          { label: '4:3 (1440×1080)', value: '1440*1080' },
          { label: '9:16 (1080×1920)', value: '1080*1920' },
          { label: '16:9 (1920×1080)', value: '1920*1080' },
          { label: '2048×2048', value: '2048*2048' },
        ],
      }] : []),
      {
        name: 'n',
        label: '图片数量',
        type: 'number',
        defaultValue: 1,
        min: 1,
        max: options.maxN,
        step: 1,
        description: `生成图片数量，1-${options.maxN}张`,
      },
      ...(options.advancedParameters ? [{
        name: 'promptExtend',
        label: '智能改写',
        type: 'boolean' as const,
        defaultValue: true,
        description: '开启提示词智能改写，对简单描述提升明显',
      }] : []),
      {
        name: 'watermark',
        label: '水印',
        type: 'boolean',
        defaultValue: false,
        description: '是否在右下角添加"Qwen-Image"水印',
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
        image: { target: 'input.media', mediaType: 'image' },
        prompt: { target: 'input.prompt' },
        negativePrompt: { target: 'parameters.field', field: 'negative_prompt' },
        ...(options.advancedParameters ? { size: { target: 'parameters.field' as const } } : {}),
        n: { target: 'parameters.field' },
        ...(options.advancedParameters
          ? { promptExtend: { target: 'parameters.field' as const, field: 'prompt_extend' } }
          : {}),
        watermark: { target: 'parameters.field' },
        seed: { target: 'parameters.field' },
      },
    },
    output: { kind: 'images-from-message-content' },
    pricing: {
      unit: 'per_image',
      quantityKey: 'n',
      currency: 'CNY',
      tiers: [{ condition: {}, priceCents: options.priceCentsPerImage }],
    },
    availability: { enabled: true, stage: 'stable' },
  }
}

export const qwenImageEditMax = makeQwenImageEdit({
  id: 'qwen-image-edit-max',
  providerModel: 'qwen-image-edit-max',
  displayName: 'Qwen Image Edit Max',
  description: 'Qwen 图像编辑旗舰版，编辑能力最强，可修改图内文字、增删物体、迁移风格，输出 1~6 张',
  priceCentsPerImage: 50,
  maxN: 6,
  advancedParameters: true,
})

export const qwenImageEditPlus = makeQwenImageEdit({
  id: 'qwen-image-edit-plus',
  providerModel: 'qwen-image-edit-plus',
  displayName: 'Qwen Image Edit Plus',
  description: 'Qwen 图像编辑高性价比版，支持多图输出与自定义分辨率，适合批量编辑',
  priceCentsPerImage: 20,
  maxN: 6,
  advancedParameters: true,
})

export const qwenImageEdit = makeQwenImageEdit({
  id: 'qwen-image-edit',
  providerModel: 'qwen-image-edit',
  displayName: 'Qwen Image Edit',
  description: 'Qwen 图像编辑基础版，支持单图编辑与多图融合',
  priceCentsPerImage: 30,
  maxN: 1,
  advancedParameters: false,
})
