import type { ModelManifest } from '@bailian-studio/model-core'

interface DeepSeekV4Options {
  id: 'deepseek-v4-pro' | 'deepseek-v4-flash'
  displayName: string
  description: string
  /** 输入 token 单价：CNY 分 / 每百万 token。 */
  inputPriceCentsPerMillion: number
  /** 输出 token 单价：CNY 分 / 每百万 token。 */
  outputPriceCentsPerMillion: number
  /** 缓存读取单价：CNY 分 / 每百万 token；不支持缓存的模型省略。 */
  cacheReadPriceCentsPerMillion?: number
}

/**
 * DeepSeek V4 的产品入口只声明 Bailian Studio 当前能够执行的一轮文本生成参数。
 * 多轮 messages、工具调用与流式编排仍由 Bailian SDK 的完整合同拥有，不能在
 * 单提示词生成表单里伪装成已经支持的产品能力。
 */
function deepSeekV4(options: DeepSeekV4Options): ModelManifest {
  return {
    id: options.id,
    provider: 'dashscope',
    providerModel: options.id,
    displayName: options.displayName,
    description: options.description,
    category: 'text',
    taskMode: 'sync',
    capabilities: ['text_prompt', 'seed'],
    parameters: [
      {
        name: 'prompt',
        label: '提示词',
        type: 'text',
        required: true,
        description: '描述你想要生成的内容',
      },
      {
        name: 'maxCompletionTokens',
        label: '最大生成 Token',
        type: 'number',
        defaultValue: 4096,
        min: 1,
        step: 1,
        description: '思考过程与最终回答合计的最大 Token 数',
      },
      {
        name: 'enableThinking',
        label: '思考模式',
        type: 'boolean',
        defaultValue: true,
        description: '开启后模型会在回答前进行推理',
      },
      {
        name: 'reasoningEffort',
        label: '推理力度',
        type: 'select',
        defaultValue: 'high',
        options: [
          { label: '低', value: 'low' },
          { label: '中', value: 'medium' },
          { label: '高', value: 'high' },
          { label: '超高', value: 'xhigh' },
          { label: '最大', value: 'max' },
        ],
        visibleWhen: { field: 'enableThinking', equals: true },
        description: '控制思考模式使用的推理强度',
      },
      {
        name: 'temperature',
        label: '随机性',
        type: 'number',
        defaultValue: 1,
        min: 0,
        max: 2,
        exclusiveMax: true,
        description: '采样温度，范围 [0,2)',
      },
      {
        name: 'topP',
        label: '核采样',
        type: 'number',
        defaultValue: 0.95,
        min: 0,
        exclusiveMin: true,
        max: 1,
        description: '核采样阈值，范围 (0,1]',
      },
      {
        name: 'repetitionPenalty',
        label: '重复惩罚',
        type: 'number',
        min: 0,
        exclusiveMin: true,
        description: '大于 0；提高数值会降低重复内容出现概率',
      },
      {
        name: 'presencePenalty',
        label: '存在惩罚',
        type: 'number',
        min: -2,
        max: 2,
        description: '范围 [-2,2]，用于调节新主题倾向',
      },
      {
        name: 'stop',
        label: '停止序列',
        type: 'text',
        description: '遇到该字符串时停止继续生成',
      },
      {
        name: 'seed',
        label: '随机种子',
        type: 'number',
        defaultValue: 1234,
        min: 0,
        max: 2147483647,
        step: 1,
        description: '随机数种子，范围 [0,2147483647]',
      },
      {
        name: 'resultFormat',
        label: '响应格式',
        type: 'select',
        required: true,
        defaultValue: 'message',
        options: [{ label: 'Message', value: 'message' }],
        description: '产品文本输出固定使用 message 格式',
      },
    ],
    request: {
      kind: 'dashscope-chat',
      endpoint: '/services/aigc/text-generation/generation',
      promptParam: 'prompt',
      bindings: {
        prompt: { target: 'input.prompt' },
        maxCompletionTokens: { target: 'parameters.field', field: 'max_completion_tokens' },
        enableThinking: { target: 'parameters.field', field: 'enable_thinking' },
        reasoningEffort: { target: 'parameters.field', field: 'reasoning_effort' },
        temperature: { target: 'parameters.field' },
        topP: { target: 'parameters.field', field: 'top_p' },
        repetitionPenalty: { target: 'parameters.field', field: 'repetition_penalty' },
        presencePenalty: { target: 'parameters.field', field: 'presence_penalty' },
        stop: { target: 'parameters.field' },
        seed: { target: 'parameters.field' },
        resultFormat: { target: 'parameters.field', field: 'result_format' },
      },
    },
    output: { kind: 'text', path: 'output.choices.0.message.content' },
    pricing: {
      unit: 'per_token',
      quantityKey: 'maxCompletionTokens',
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
        ...(options.cacheReadPriceCentsPerMillion !== undefined
          ? [{
              id: 'cn-beijing-cache-read-token' as const,
              region: 'cn-beijing' as const,
              serviceScope: 'china-mainland' as const,
              chargeItem: 'cache-read' as const,
              unit: 'token' as const,
              unitSize: 1000000,
              unitPrice: (options.cacheReadPriceCentsPerMillion / 100).toString(),
              conditions: {},
            }]
          : []),
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
    },
    availability: { enabled: true, stage: 'stable' },
  }
}

export const deepseekV4Pro = deepSeekV4({
  id: 'deepseek-v4-pro',
  displayName: 'DeepSeek V4 Pro',
  description: 'DeepSeek V4 高性能版本，适合复杂推理、代码与高质量通用文本任务',
  inputPriceCentsPerMillion: 1200,
  outputPriceCentsPerMillion: 2400,
})

export const deepseekV4Flash = deepSeekV4({
  id: 'deepseek-v4-flash',
  displayName: 'DeepSeek V4 Flash',
  description: 'DeepSeek V4 低延迟版本，适合高并发与成本敏感的通用文本任务',
  inputPriceCentsPerMillion: 100,
  outputPriceCentsPerMillion: 200,
  cacheReadPriceCentsPerMillion: 20,
})
