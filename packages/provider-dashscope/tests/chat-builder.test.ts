import { describe, expect, test } from 'vitest'
import { buildChatRequest } from '../src/chat-builder'

// 测试用的 manifest stub（P1-37：必须带 screenplay capability 才能进入剧本流传输）
const stubManifest = {
  providerModel: 'qwen3.5-omni-plus',
  capabilities: ['screenplay', 'video_input', 'streaming'],
} as const

test('buildChatRequest 生成正确的 messages 结构', () => {
  const result = buildChatRequest(stubManifest as any, {
    videoUrl: 'https://example.com/video.mp4',
    language: 'zh',
    detailLevel: 'standard',
  })

  expect(result.model).toBe('qwen3.5-omni-plus')
  expect(result.stream).toBe(true)
  expect(result.modalities).toEqual(['text'])
  expect(result.messages).toHaveLength(1)

  const msg = result.messages[0] as { role: string; content: Array<Record<string, unknown>> } | undefined
  expect(msg).toBeDefined()
  expect(msg!.role).toBe('user')
  const content = msg!.content
  expect(content).toHaveLength(2)

  // 第一项是 video_url
  const videoPart = content[0] as Record<string, unknown> | undefined
  expect(videoPart).toBeDefined()
  expect(videoPart!.type).toBe('video_url')
  expect((videoPart!.video_url as Record<string, unknown>).url).toBe('https://example.com/video.mp4')

  // 第二项是 text prompt
  const textPart = content[1] as Record<string, unknown> | undefined
  expect(textPart).toBeDefined()
  expect(textPart!.type).toBe('text')
  expect(typeof textPart!.text).toBe('string')
  expect(textPart!.text as string).toContain('剧本格式')
  expect(textPart!.text as string).toContain('剧本标题')
  expect(textPart!.text as string).toContain('场景')
  expect(textPart!.text as string).toContain('对白')
  expect(textPart!.text as string).toContain('法语')
})

test('buildChatRequest 使用英文 prompt', () => {
  const result = buildChatRequest(stubManifest as any, {
    videoUrl: 'https://example.com/video.mp4',
    language: 'en',
    detailLevel: 'standard',
  })

  const msg = result.messages[0] as { role: string; content: Array<Record<string, unknown>> } | undefined
  expect(msg).toBeDefined()
  const prompt = msg!.content[1] as Record<string, unknown> | undefined
  expect(prompt).toBeDefined()
  expect(prompt!.text as string).toContain('screenplay')
  expect(prompt!.text as string).toContain('Screenplay Title')
  expect(prompt!.text as string).toContain('Scene')
  expect(prompt!.text as string).toContain('Dialogue')
  expect(prompt!.text as string).toContain('French')
})

test('buildChatRequest 双语模式包含中英对白要求', () => {
  const result = buildChatRequest(stubManifest as any, {
    videoUrl: 'https://example.com/video.mp4',
    language: 'zh_en',
    detailLevel: 'standard',
  })

  const msg = result.messages[0] as { role: string; content: Array<Record<string, unknown>> } | undefined
  expect(msg).toBeDefined()
  const prompt = msg!.content[1] as Record<string, unknown> | undefined
  expect(prompt).toBeDefined()
  expect(prompt!.text as string).toContain('中英文')
  expect(prompt!.text as string).toContain('剧本标题 / Screenplay Title')
  expect(prompt!.text as string).toContain('不得输出法语')
  expect(prompt!.text as string).toContain('剧本格式')
  expect(prompt!.text as string).toContain('对白')
  expect(prompt!.text as string).toContain("Let's go.") // 英文对白示例
})

test('拒绝无 screenplay capability 的 manifest（P1-37 改错即红）', () => {
  const nonScreenplay = { providerModel: 'some-chat-model', capabilities: ['text_prompt'] }
  expect(() => buildChatRequest(nonScreenplay as any, { videoUrl: 'https://example.com/v.mp4' }))
    .toThrow(/requires the 'screenplay' capability/)
})

test('detailed 模式包含更细致的描述要求', () => {
  const result = buildChatRequest(stubManifest as any, {
    videoUrl: 'https://example.com/video.mp4',
    language: 'zh',
    detailLevel: 'detailed',
  })

  const msg = result.messages[0] as { role: string; content: Array<Record<string, unknown>> } | undefined
  expect(msg).toBeDefined()
  const prompt = msg!.content[1] as Record<string, unknown> | undefined
  expect(prompt).toBeDefined()
  expect(prompt!.text as string).toContain('镜头语言')
  expect(prompt!.text as string).toContain('转场')
})
