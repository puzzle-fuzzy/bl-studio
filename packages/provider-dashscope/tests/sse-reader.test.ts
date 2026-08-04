import { describe, expect, test } from 'vitest'
import { readSseStream } from '../src/sse-reader'

describe('readSseStream', () => {
  test('解析完整 SSE 流，累积文本并提取 usage', async () => {
    const sseBody = [
      'data: {"choices":[{"delta":{"content":"场景一，"}}]}',
      'data: {"choices":[{"delta":{"content":"雨夜。"}}]}',
      'data: {"choices":[{"delta":{"content":"\\n【场景 1"}}]}',
      'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":50,"prompt_tokens_details":{"text_tokens":80,"audio_tokens":20},"completion_tokens_details":{"text_tokens":50}}}',
      'data: [DONE]',
      '',
    ].join('\n')

    const response = new Response(sseBody)
    const result = await readSseStream(response)

    expect(result.text).toBe('场景一，雨夜。\n【场景 1')
    expect(result.usage).toBeDefined()
    expect(result.usage!.promptTokens).toBe(100)
    expect(result.usage!.completionTokens).toBe(50)
    expect(result.usage!.promptTokensDetails!.textTokens).toBe(80)
    expect(result.usage!.promptTokensDetails!.audioTokens).toBe(20)
    expect(result.usage!.completionTokensDetails!.textTokens).toBe(50)
  })

  test('流中无 usage chunk 时 usage 为 undefined', async () => {
    const sseBody = [
      'data: {"choices":[{"delta":{"content":"test"}}]}',
      'data: [DONE]',
      '',
    ].join('\n')

    const response = new Response(sseBody)
    const result = await readSseStream(response)

    expect(result.text).toBe('test')
    expect(result.usage).toBeUndefined()
  })

  test('空流返回空文本和 undefined usage', async () => {
    const sseBody = 'data: [DONE]\n\n'
    const response = new Response(sseBody)
    const result = await readSseStream(response)

    expect(result.text).toBe('')
    expect(result.usage).toBeUndefined()
  })

  test('provider closes without a trailing newline without dropping the final event', async () => {
    const response = new Response('data: {"choices":[{"delta":{"content":"last"}}]}')

    await expect(readSseStream(response)).resolves.toMatchObject({ text: 'last' })
  })
})
