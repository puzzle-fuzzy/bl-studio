import { afterEach, describe, expect, it } from 'vitest'
import { syncBailianDocs } from './sync-bailian-docs'

const originalKey = process.env.DASHSCOPE_API_KEY

afterEach(() => {
  if (originalKey === undefined) delete process.env.DASHSCOPE_API_KEY
  else process.env.DASHSCOPE_API_KEY = originalKey
})

function jsonResponse(body: unknown, ok = true): Response {
  return { ok, status: ok ? 200 : 401, json: async () => body } as unknown as Response
}

describe('syncBailianDocs', () => {
  it('无 API key 时 SKIPPED（不 gate，明确报告未验证）', async () => {
    delete process.env.DASHSCOPE_API_KEY
    const result = await syncBailianDocs()
    expect(result.status).toBe('skipped')
  })

  it('认证失败 → SKIPPED，不打印响应体', async () => {
    process.env.DASHSCOPE_API_KEY = 'bad-key'
    const result = await syncBailianDocs(async () => jsonResponse({}, false))
    expect(result.status).toBe('skipped')
  })

  it('对账兼容面清单：报告官方新增候选与 chat 面疑似退役', async () => {
    process.env.DASHSCOPE_API_KEY = 'test-key'
    const result = await syncBailianDocs(async () => jsonResponse({
      data: [{ id: 'qwen-plus' }, { id: 'brand-new-chat-model' }],
    }))

    expect(result.status).toBe('checked')
    if (result.status !== 'checked') return

    // 官方清单里有、manifest 未覆盖的 → 新增候选
    expect(result.officialNew).toContain('brand-new-chat-model')
    // qwen-plus 在官方清单里 → 不误报退役
    expect(result.compatibleRetired).not.toContain('qwen-plus')
    // qwen-max 是真实 dashscope-chat manifest，但不在本次 fake 清单 → 报疑似退役（人工复核）
    expect(result.compatibleRetired).toContain('qwen-max')
  })
})
