export interface ChatUsage {
  promptTokens: number
  completionTokens: number
  promptTokensDetails?: { textTokens?: number; audioTokens?: number }
  completionTokensDetails?: { textTokens?: number }
}

export interface SseResult {
  text: string
  usage?: ChatUsage
}

export type SseEventValidator = (event: unknown) => void

export class SseEventParseError extends Error {
  constructor(public readonly line: string) {
    super('Provider stream contains an invalid JSON event')
    this.name = 'SseEventParseError'
  }
}

/**
 * 逐行读取 SSE 流，从 delta.content 累积文本，提取 usage chunk。
 * 网络中断时抛 DashScopeHttpError(category: 'network')。
 */
export async function readSseStream(
  response: Response,
  signal?: AbortSignal,
  validateEvent?: SseEventValidator,
): Promise<SseResult> {
  const reader = response.body?.getReader()
  if (reader === undefined) {
    throw new Error('Response body is not readable')
  }

  const decoder = new TextDecoder()
  let text = ''
  let usage: ChatUsage | undefined
  let buffer = ''

  const onAbort = signal === undefined
    ? undefined
    : () => {
        void reader.cancel()
      }
  if (signal !== undefined && onAbort !== undefined) {
    if (signal.aborted) {
      await reader.cancel()
      throw new DOMException('The operation was aborted.', 'AbortError')
    }
    signal.addEventListener('abort', onAbort)
  }

  const consumeLine = (line: string): void => {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed === 'data: [DONE]') return
    if (!trimmed.startsWith('data: ')) return

    const jsonStr = trimmed.slice(6)
    let data: Record<string, any>
    try {
      data = JSON.parse(jsonStr) as Record<string, any>
    } catch {
      if (validateEvent !== undefined) throw new SseEventParseError(trimmed)
      return
    }

    validateEvent?.(data)
    try {
      const choices = data.choices
      if (Array.isArray(choices) && choices.length > 0) {
        const delta = choices[0].delta
        if (typeof delta?.content === 'string') {
          text += delta.content
        }
      }
      // usage chunk — choices 可能为空数组或不存在
      if (data.usage) {
        usage = {
          promptTokens: data.usage.prompt_tokens ?? 0,
          completionTokens: data.usage.completion_tokens ?? 0,
          ...(data.usage.prompt_tokens_details
            ? {
                promptTokensDetails: {
                  textTokens: data.usage.prompt_tokens_details.text_tokens,
                  audioTokens: data.usage.prompt_tokens_details.audio_tokens,
                },
              }
            : {}),
          ...(data.usage.completion_tokens_details
            ? {
                completionTokensDetails: {
                  textTokens: data.usage.completion_tokens_details.text_tokens,
                },
              }
            : {}),
        }
      }
    } catch (error) {
      if (validateEvent !== undefined) throw error
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // 保留最后可能不完整的行
      buffer = lines.pop() ?? ''

      for (const line of lines) consumeLine(line)
    }

    // provider 可能在不带结尾换行符时关闭流；保留最后的事件，
    // 而不是静默丢弃最后一个 token/usage 块。
    if (buffer.length > 0) consumeLine(buffer)
  } finally {
    if (signal !== undefined && onAbort !== undefined) {
      signal.removeEventListener('abort', onAbort)
    }
    reader.releaseLock()
  }

  return { text, usage }
}
