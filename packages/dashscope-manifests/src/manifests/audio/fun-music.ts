import type { ModelManifest } from '../../types'

/**
 * fun-music-v1 模型 manifest（provider: dashscope，category: audio）。
 *
 * 文本生音乐：用户给出 prompt（音乐风格/用途描述）或直接 lyrics（歌词），
 * 模型自动谱曲并演唱；输出音频 URL（output.audio.url）。同步任务模式。
 */

export const funMusicV1: ModelManifest = {
  id: 'fun-music-v1',
  provider: 'dashscope',
  providerModel: 'fun-music-v1',
  displayName: 'Fun Music V1',
  description: 'FunAudioLLM 音乐生成，根据歌词与描述生成歌曲',
  category: 'audio',
  taskMode: 'sync',
  capabilities: ['text_prompt'],
  parameters: [
    {
      name: 'prompt',
      label: '提示词',
      type: 'text',
      // P1-34：prompt 与 lyrics 二选一（required-one-of 规则兜底），不能单独 required:true，
      // 否则官方允许的「仅歌词」提交会被 REQUIRED_PARAMETER(prompt) 拒绝。
      required: false,
      maxLength: 2000,
      description: '描述音乐风格和用途，模型将自动创作歌词',
    },
    {
      name: 'lyrics',
      label: '歌词内容',
      type: 'text',
      required: false,
      maxLength: 2000,
      description: '直接提供歌词内容，与prompt二选一',
    },
    {
      name: 'isInstrumental',
      label: '纯音乐',
      type: 'boolean',
      defaultValue: false,
      description: '是否生成纯音乐；启用后歌词与演唱音色不生效',
    },
    {
      name: 'gender',
      label: '演唱音色',
      type: 'select',
      defaultValue: 'female',
      options: [
        { label: '女声', value: 'female' },
        { label: '男声', value: 'male' },
      ],
    },
    {
      name: 'format',
      label: '音频格式',
      type: 'select',
      defaultValue: 'mp3',
      options: [
        { label: 'MP3 (适合网络传输)', value: 'mp3' },
        { label: 'WAV (适合后期处理)', value: 'wav' },
      ],
    },
    {
      name: 'enableAigcWatermark',
      label: 'AI水印',
      type: 'boolean',
      defaultValue: false,
      description: '在音频末尾添加AI标识的摩尔斯电码',
    },
    {
      name: 'duration',
      label: '预估音频时长(秒)',
      type: 'number',
      defaultValue: 60,
      min: 1,
      description: '预估生成音频时长，仅用于费用预估（实际时长由模型按歌词决定）',
    },
  ],
    rules: [
    {
      kind: 'required-one-of',
      fields: ['lyrics', 'prompt'],
      minimum: 1,
      code: 'REQUIRED_PARAMETER',
      message: { 'zh-CN': '歌词与提示词至少提供一项', 'en-US': 'Provide at least one of lyrics or prompt' },
    },
    {
      kind: 'text-length',
      field: 'lyrics',
      cjk: { min: 5, max: 350 },
      other: { min: 5, max: 2000 },
      modes: ['sync'],
      code: 'OUT_OF_RANGE',
      message: { 'zh-CN': '非流式歌词需为 5~350 个中文字符或 5~2000 个非中文字符', 'en-US': 'Non-streaming lyrics must be 5-350 Chinese characters or 5-2000 other characters' },
    },
    {
      kind: 'text-length',
      field: 'prompt',
      cjk: { min: 1, max: 2000 },
      other: { min: 1, max: 2000 },
      modes: ['sync'],
      code: 'OUT_OF_RANGE',
      message: { 'zh-CN': '非流式 prompt 需为 1~2000 个字符', 'en-US': 'Non-streaming prompt must be 1-2000 characters' },
    },
  ],
request: {
    kind: 'dashscope-audio-task',
    endpoint: '/services/audio/music/generation',
    bindings: {
      // prompt 与 lyrics 至少提供一个；同时提供时由 provider 按官方规则优先使用 lyrics。
      prompt: { target: 'input.prompt' },
      lyrics: { target: 'input.field', field: 'lyrics' },
      // 这些字段不走 parameters，而是放在 input 下；provider 字段使用 snake_case。
      isInstrumental: { target: 'input.field', field: 'is_instrumental' },
      gender: { target: 'input.field', field: 'gender' },
      format: { target: 'input.field', field: 'format' },
      enableAigcWatermark: { target: 'input.field', field: 'enable_aigc_watermark' },
      // duration 仅用于费用预估，不发送给 provider
      duration: { target: 'ui.only' },
    },
  },
  output: { kind: 'audio-url', path: 'output.audio.url' },
  pricing: {
    unit: 'per_second',
    quantityKey: 'duration',
    currency: 'CNY',
    rates: [
      {
        id: 'cn-beijing-output-second',
        region: 'cn-beijing',
        serviceScope: 'china-mainland',
        chargeItem: 'output',
        unit: 'second',
        unitSize: 1,
        unitPrice: '0.002',
        conditions: {},
      },
    ],
  },
  transport: {
    mode: 'sync',
    submit: {
      method: 'POST',
      endpointTemplate: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/music/generation',
      modelFieldPath: '/model',
      headers: [
        { name: 'Authorization' },
        { name: 'Content-Type', value: 'application/json' },
      ],
    },
  },
  availability: { enabled: true, stage: 'beta' },
}
