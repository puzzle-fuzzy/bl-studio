import type { ModelManifest } from '../../types'

/**
 * wanx-text-to-video 模型 manifest（provider: dashscope，category: video）。
 *
 * 万相 2.1 极速版文生视频（wanx2.1-t2v-turbo），走 video-synthesis 异步任务端点
 * （provider_async），按视频秒数计费。保留作为 video-task 流程的最小示例：
 * 参数与官网当前合同一致：具体像素尺寸、固定 5 秒、提示词改写、水印与随机种子。
 */

export const wanxTextToVideo: ModelManifest = {
  id: 'wanx-text-to-video',
  provider: 'dashscope',
  providerModel: 'wanx2.1-t2v-turbo',
  displayName: 'Wanx Text to Video',
  description: '通义万相文生视频，根据文字描述生成短视频',
  category: 'video',
  taskMode: 'provider_async',
  capabilities: ['text_prompt', 'negative_prompt', 'seed'],
  parameters: [
    { name: 'prompt', label: 'Prompt', type: 'text', required: true, maxLength: 800 },
    { name: 'negativePrompt', label: '反向提示词', type: 'text', maxLength: 500 },
    {
      name: 'size',
      label: '视频尺寸',
      type: 'select',
      defaultValue: '1280*720',
      options: [
        { label: '横屏 1280×720', value: '1280*720' },
        { label: '竖屏 720×1280', value: '720*1280' },
        { label: '方形 960×960', value: '960*960' },
        { label: '横屏 832×480', value: '832*480' },
        { label: '竖屏 480×832', value: '480*832' },
        { label: '方形 624×624', value: '624*624' },
        { label: '横屏 1088×832', value: '1088*832' },
        { label: '竖屏 832×1088', value: '832*1088' },
      ],
    },
    { name: 'duration', label: '视频时长(秒)', type: 'number', defaultValue: 5, min: 5, max: 5, step: 1 },
    { name: 'promptExtend', label: '智能改写', type: 'boolean', defaultValue: true },
    { name: 'watermark', label: '水印', type: 'boolean', defaultValue: false },
    { name: 'seed', label: '随机种子', type: 'number', min: 0, max: 2147483647, step: 1 },
  ],
  request: {
    kind: 'dashscope-video-task',
    endpoint: '/services/aigc/video-generation/video-synthesis',
    mediaMode: 'none',
    bindings: {
      prompt: { target: 'input.prompt' },
      negativePrompt: { target: 'input.field', field: 'negative_prompt' },
      size: { target: 'parameters.field' },
      duration: { target: 'parameters.field' },
      promptExtend: { target: 'parameters.field', field: 'prompt_extend' },
      watermark: { target: 'parameters.field' },
      seed: { target: 'parameters.field' },
    },
  },
  output: { kind: 'video-url', path: 'output.video_url' },
  pricing: {
    unit: 'per_second',
    quantityKey: 'duration',
    currency: 'CNY',
    tiers: [{ condition: {}, priceCents: 24 }],
  },
  availability: { enabled: true, stage: 'beta' },
}
