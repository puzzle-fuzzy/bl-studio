/**
 * DashScope（百炼）请求体的 manifest 驱动构建。
 *
 * 添加新模型参数时无需改 provider 代码——只要在 manifest 的
 * ProviderRequestMapping.bindings 里登记一个绑定，buildDashScopeRequest 就会按
 * binding.target 把该字段的值分发到 DashScope 请求体的正确位置（input.prompt、
 * input.<field>、parameters.<field>、input.media 等）。`async` 标志依据 manifest
 * 的 taskMode 决定是否启用异步提交模式。
 */
import type { DeepReadonly, FrozenModelManifest, ParameterBinding } from '@bailian-studio/model-core'

/**
 * 构建出的 DashScope 请求：endpoint（相对 /api/v1 的路径）+ 请求体 + 是否异步。
 * 请求体固定带 model 与 input，parameters 仅在写过参数字段时才出现。
 */
export interface DashScopeRequest {
  endpoint: string
  body: {
    model: string
    input: Record<string, unknown>
    parameters?: Record<string, unknown>
  }
  async: boolean
}

/**
 * 按 manifest 的 bindings 把 params 分发成 DashScope 请求体。
 *
 * 遍历 manifest.request.bindings 的每个字段：值未传（undefined）或仅用于前端
 * （target === 'ui.only'）的字段直接跳过，不出现在请求里；其余字段经 bindValue
 * 落到 input/parameters 的对应位置。最后对 dashscope-image-message 类型的 manifest
 * 做一次消息包装（见 wrapAsUserMessage）。
 */
export function buildDashScopeRequest(manifest: FrozenModelManifest, params: Record<string, unknown>): DashScopeRequest {
  const input: Record<string, unknown> = {}
  const parameters: Record<string, unknown> = {}

  for (const name of Object.keys(manifest.request.bindings)) {
    const binding = manifest.request.bindings[name]
    if (binding === undefined) continue

    const value = params[name]
    if (value === undefined || binding.target === 'ui.only') continue

    bindValue(name, binding, value, input, parameters)
  }

  // 多模态生成接口（multimodal-generation）用的是 input.messages[{role, content}]
  // 结构，而不是扁平的 input.prompt / input.media。对 dashscope-image-message 类型的
  // manifest，需要把前面收集到的 prompt（→ {text}）与 media（→ {image}）包装进单条
  // user 消息。图片排在文本前面（与 provider 编辑接口示例一致）；纯文本内容则覆盖文生图。
  if (manifest.request.kind === 'dashscope-image-message') {
    wrapAsUserMessage(input)
  }
  else if (manifest.request.kind === 'dashscope-chat') {
    wrapAsTextChatMessage(input)
  }

  return {
    endpoint: manifest.request.endpoint,
    async: manifest.taskMode === 'provider_async',
    body: {
      model: manifest.providerModel,
      input,
      ...(Object.keys(parameters).length > 0 ? { parameters } : {}),
    },
  }
}

/**
 * 把收集到的 prompt/media 改写成多模态接口要求的 messages 结构。
 *
 * DashScope 图像编辑/文生图（multimodal-generation）只认 input.messages 数组，
 * 所以这里删掉扁平的 prompt/media，把它们合成一条 user 消息：content 数组里
 * image 项在前、text 项在后。无任何内容时不写 messages（避免空消息）。
 */
function wrapAsUserMessage(input: Record<string, unknown>): void {
  const prompt = input.prompt
  const media = input.media
  const content: Array<Record<string, string>> = []

  if (Array.isArray(media)) {
    for (const item of media) {
      if (item !== null && typeof item === 'object' && typeof item.url === 'string') {
        content.push({ image: item.url })
      }
    }
  }
  if (typeof prompt === 'string') content.push({ text: prompt })

  delete input.prompt
  delete input.media
  if (content.length > 0) {
    input.messages = [{ role: 'user', content }]
  }
}

/** Native DashScope text generation accepts input.messages, not input.prompt. */
function wrapAsTextChatMessage(input: Record<string, unknown>): void {
  const prompt = input.prompt
  delete input.prompt
  if (typeof prompt === 'string' && prompt.length > 0) {
    input.messages = [{ role: 'user', content: prompt }]
  }
}

/**
 * 按 binding.target 把单个字段值分发到请求体的正确位置：
 *  - input.prompt     → input.prompt（专用槽位）；
 *  - input.field      → input[binding.field]（用 manifest 指定的字段名）；
 *  - parameters.field → parameters[binding.field ?? name]（缺省回退到参数名本身）；
 *  - input.media      → 累加到 input.media 媒体数组（见 appendMedia）；
 *  - ui.only          → 前端专用，不进请求体（调用前已过滤，此处保留兜底）。
 */
function bindValue(
  name: string,
  binding: DeepReadonly<ParameterBinding>,
  value: unknown,
  input: Record<string, unknown>,
  parameters: Record<string, unknown>,
): void {
  switch (binding.target) {
    case 'input.prompt':
      input.prompt = value
      return
    case 'input.field':
      input[binding.field] = binding.wrapInArray ? wrapInArray(value) : value
      return
    case 'parameters.field':
      parameters[binding.field ?? name] = binding.wrapInArray ? wrapInArray(value) : value
      return
    case 'input.media':
      input.media = appendMedia(input.media, binding.mediaType, value)
      return
    case 'ui.only':
      return
  }
}

function wrapInArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [value]
}

/**
 * 把新传入的媒体 url 累加到已有媒体数组之后。
 *
 * media 字段是"可累加"的——例如同一接口既绑 image 又绑 video 时，多次绑定需要
 * 汇总成一个数组传给 provider，而不是后者覆盖前者。value 支持单 url 或 url 数组，
 * 非字符串项被忽略；mediaType（如 'image'/'video'）来自 binding，决定每项的 type。
 */
function appendMedia(existing: unknown, mediaType: string, value: unknown): Array<{ type: string; url: string }> {
  const media = Array.isArray(existing) ? [...existing] : []
  const urls = Array.isArray(value) ? value : [value]

  for (const url of urls) {
    if (typeof url === 'string') media.push({ type: mediaType, url })
  }

  return media
}
