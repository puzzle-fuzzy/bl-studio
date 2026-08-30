import type { ModelManifest } from '@bailian-studio/model-core'

export const qwenOmniScreenplayFlash: ModelManifest = {
  id: 'qwen-omni-screenplay-flash',
  provider: 'dashscope',
  providerModel: 'qwen3.5-omni-flash',
  displayName: '视频生成剧本（快速版）',
  description: '从视频中快速提取关键信息生成剧本，速度优先',
  category: 'video',
  taskMode: 'stream',
  capabilities: ['screenplay', 'video_input', 'streaming'],
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
    // P2-13（已知限制，标注）：mode 是「计费模式标记」而非真实输入——恒假 visibleWhen
    // 使其不进 UI，applyDefaults 在校验前剥离，运行时值从不被读取。它存在的意义：
    // (1) rates 的 conditions.mode 必须引用已声明参数（registry-check 断言），mode 承担
    //     这个交叉引用；(2) 文档化 qwen3.5-omni 家族的四个计费桶。实际匹配由
    //     pricing.ts 的 tokenRateCents / calculateUsagePriceCents 按字面字符串硬编码，
    //     与 manifest 的 options 保持同步。
    {
      name: 'mode',
      label: '计费模式（内部）',
      type: 'select',
      options: [
        { label: '图像/视频输入', value: 'text-image-video-input' },
        { label: '音频输入', value: 'audio-input' },
        { label: '多模态文本输出', value: 'multimodal-input-text-output' },
        { label: '音频输出', value: 'audio-output' },
      ],
      visibleWhen: { field: 'videoUrl', equals: 'internal:never-user-visible' },
      description: '内部计费模式标记，仅用于满足 conditions.mode 交叉引用与文档化计费桶，不对用户展示',
    },
  ],
  request: {
    kind: 'dashscope-chat',
    endpoint: '/compatible-mode/v1/chat/completions',
    promptParam: 'prompt',
    stream: true,
    bindings: {
      mode: { target: 'ui.only' },
      videoUrl: { target: 'ui.only' },
      language: { target: 'ui.only' },
      detailLevel: { target: 'ui.only' },
      estimatedDuration: { target: 'ui.only' },
    },
  },
  // P2-15：chat completions 兼容路径，内容在 choices[0].message.content，而非 output.text。
  // 流式路径（worker 的 streamText）从不读 manifest.output；此处仅供 assertResponseShape 的
  // async-poll final 阶段推导关键路径（当前 taskMode=stream 不会触发），修对以消除未来漂移。
  output: { kind: 'text', path: 'output.choices.0.message.content' },
  // token 计费（chat completions）：预检数量用 estimatedDuration（秒）作为费用代理，
  // 实际结算按 usage token 桶（calculateUsagePriceCents）。estimatePriceCents 对 token
  // 费率给保守下限 1 分，避免预检恒 0（P1-02）。
  pricing: {
    unit: 'per_token',
    quantityKey: 'estimatedDuration',
    currency: 'CNY',
    rates: [
      // P2-20：视觉文本输入是本模型的常见默认档——设为默认价（conditions 为空），
      // 让 estimatePriceCents 在没有 mode（applyDefaults 恒剥离）时落到 2.2 元/M 的
      // 正确常用价，而不是被保守回退（最高费率）高估。音频档仍按 mode 区分。
      {
        id: 'cn-beijing-visual-text-input-token',
        region: 'cn-beijing',
        serviceScope: 'china-mainland',
        chargeItem: 'input',
        unit: 'token',
        unitSize: 1000000,
        unitPrice: '2.2',
        conditions: {},
      },
      {
        id: 'cn-beijing-audio-input-token',
        region: 'cn-beijing',
        serviceScope: 'china-mainland',
        chargeItem: 'input',
        unit: 'token',
        unitSize: 1000000,
        unitPrice: '18',
        conditions: { mode: 'audio-input' },
      },
      {
        id: 'cn-beijing-multimodal-text-output-token',
        region: 'cn-beijing',
        serviceScope: 'china-mainland',
        chargeItem: 'output',
        unit: 'token',
        unitSize: 1000000,
        unitPrice: '13.3',
        conditions: {},
      },
      {
        id: 'cn-beijing-audio-output-token',
        region: 'cn-beijing',
        serviceScope: 'china-mainland',
        chargeItem: 'output',
        unit: 'token',
        unitSize: 1000000,
        unitPrice: '72',
        conditions: { mode: 'audio-output' },
      },
    ],
  },
  transport: {
    mode: 'stream',
    submit: {
      method: 'POST',
      endpointTemplate: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
      modelFieldPath: '/model',
      headers: [
        { name: 'Authorization' },
        { name: 'Content-Type', value: 'application/json' },
      ],
    },
    stream: {
      contentTypes: ['text/event-stream'],
      framing: 'sse',
      headers: [],
    },
  },
  availability: { enabled: true, stage: 'beta' },
}
