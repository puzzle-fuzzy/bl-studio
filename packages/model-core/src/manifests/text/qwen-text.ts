import type { ModelManifest } from '../../types'

/**
 * 通义千问文本生成系列 manifest（provider: dashscope，category: text）。
 *
 * 走经典文本生成端点 /services/aigc/text-generation/generation，请求体为
 * input.messages + parameters.*，响应文本位于 output.choices[0].message.content。
 *
 * 计费按 token：rates 中每条单价是"每 1,000,000 个 token 的 CNY 元"，输入与输出
 * 分别计费。inputPriceCentsPerMillion / outputPriceCentsPerMillion 是 CNY 分 / 每百万 token，
 * 由定价引擎在预估时按比例缩小。maxTokens 一身二任：既是请求的输出上限，也是费用预估的输出量基准。
 *
 * 工厂函数 + 五个变体：qwen-plus / qwen-max / qwen-turbo / qwen-flash / qwen-long。
 */
interface QwenTextOptions {
  id: string
  providerModel: string
  displayName: string
  description: string
  /** 输入 token 单价：CNY 分 / 每百万 token（中国内地）。 */
  inputPriceCentsPerMillion: number
  /** 输出 token 单价：CNY 分 / 每百万 token（中国内地）。 */
  outputPriceCentsPerMillion: number
}

function qwenText(options: QwenTextOptions): ModelManifest {
  return {
    id: options.id,
    provider: 'dashscope',
    providerModel: options.providerModel,
    displayName: options.displayName,
    description: options.description,
    category: 'text',
    taskMode: 'sync',
    capabilities: ['text_prompt', 'seed', 'streaming'],
    parameters: [
      {
        name: 'prompt',
        label: '提示词',
        type: 'text',
        required: true,
        maxLength: 12000,
        description: '描述你想要生成的内容',
      },
      {
        name: 'maxTokens',
        label: '最大输出Token',
        type: 'number',
        defaultValue: 1024,
        min: 1,
        step: 1,
        description: '生成回复的最大Token数，同时作为费用预估的输出量基准',
      },
      {
        name: 'temperature',
        label: '随机性',
        type: 'number',
        defaultValue: 0.8,
        min: 0,
        max: 2,
        exclusiveMax: true,
        description: '取值越大回复越发散，取值越小越确定，范围[0,2)',
      },
      {
        name: 'topP',
        label: '核采样',
        type: 'number',
        defaultValue: 0.8,
        min: 0,
        exclusiveMin: true,
        max: 1,
        description: '从概率累计达到该阈值的Token中采样，范围[0,1]',
      },
      {
        name: 'seed',
        label: '随机种子',
        type: 'number',
        required: false,
        min: 0,
        max: 2147483647,
        step: 1,
        description: '随机数种子，取值范围[0,2147483647]',
      },
    ],
    request: {
      kind: 'dashscope-chat',
      endpoint: '/services/aigc/text-generation/generation',
      promptParam: 'prompt',
      bindings: {
        prompt: { target: 'input.prompt' },
        maxTokens: { target: 'parameters.field', field: 'max_tokens' },
        temperature: { target: 'parameters.field' },
        topP: { target: 'parameters.field', field: 'top_p' },
        seed: { target: 'parameters.field' },
      },
    },
    output: { kind: 'text', path: 'output.choices.0.message.content' },
    pricing: {
      unit: 'per_token',
      quantityKey: 'maxTokens',
      currency: 'CNY',
      rates: [
        {
          id: 'cn-beijing-input-token',
          region: 'cn-beijing',
          serviceScope: 'china-mainland',
          chargeItem: 'input',
          unit: 'token',
          unitSize: 1000000,
          unitPrice: (options.inputPriceCentsPerMillion / 100).toString(),
          conditions: {},
        },
        {
          id: 'cn-beijing-output-token',
          region: 'cn-beijing',
          serviceScope: 'china-mainland',
          chargeItem: 'output',
          unit: 'token',
          unitSize: 1000000,
          unitPrice: (options.outputPriceCentsPerMillion / 100).toString(),
          conditions: {},
        },
      ],
    },
    transport: {
      mode: 'sync',
      submit: {
        method: 'POST',
        endpointTemplate: 'https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
        modelFieldPath: '/model',
        headers: [
          { name: 'Authorization' },
          { name: 'Content-Type', value: 'application/json' },
        ],
      },
      stream: {
        contentTypes: ['text/event-stream'],
        framing: 'sse',
        headers: [
          { name: 'Authorization' },
          { name: 'Content-Type', value: 'application/json' },
          { name: 'X-DashScope-SSE', value: 'enable' },
        ],
      },
    },
    availability: { enabled: true, stage: 'stable' },
  }
}

export const qwenPlus = qwenText({
  id: 'qwen-plus',
  providerModel: 'qwen-plus',
  displayName: 'Qwen Plus',
  description: '通义千问主力模型，能力均衡，适用于大多数通用文本生成场景',
  inputPriceCentsPerMillion: 80,
  outputPriceCentsPerMillion: 200,
})

export const qwenMax = qwenText({
  id: 'qwen-max',
  providerModel: 'qwen-max',
  displayName: 'Qwen Max',
  description: '通义千问旗舰模型，复杂推理、数学、代码能力最强',
  inputPriceCentsPerMillion: 240,
  outputPriceCentsPerMillion: 960,
})

export const qwenTurbo = qwenText({
  id: 'qwen-turbo',
  providerModel: 'qwen-turbo',
  displayName: 'Qwen Turbo',
  description: '通义千问极速模型，速度最快、成本最低，适合简单任务与高并发',
  inputPriceCentsPerMillion: 30,
  outputPriceCentsPerMillion: 60,
})

export const qwenFlash = qwenText({
  id: 'qwen-flash',
  providerModel: 'qwen-flash',
  displayName: 'Qwen Flash',
  description: '通义千问超低成本模型，支持思考模式，适合规模化调用',
  inputPriceCentsPerMillion: 15,
  outputPriceCentsPerMillion: 150,
})

export const qwenLong = qwenText({
  id: 'qwen-long',
  providerModel: 'qwen-long',
  displayName: 'Qwen Long',
  description: '通义千问长上下文模型，适合文档摘要、长文理解等场景',
  inputPriceCentsPerMillion: 50,
  outputPriceCentsPerMillion: 200,
})
