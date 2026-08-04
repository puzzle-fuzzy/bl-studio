import { describe, expect, it } from 'vitest'
import {
  assertTrustedBailianEndpoint,
  classifyBailianTaskStatus,
  isValidBailianWorkspaceId,
  requireBailianSdkOperation,
  resolveBailianCancelTarget,
  resolveBailianPollTarget,
  resolveBailianSubmitTarget,
  validateBailianPayload,
} from '../src'

describe('@bailian-studio/bailian-adapter contracts and transports', () => {
  it('uses the SDK-owned workspace endpoint for covered Keling operations', () => {
    const options = { workspaceId: 'ws-demo_01' }
    expect(() => resolveBailianSubmitTarget('keling-text-to-video')).toThrow('必须配置 workspaceId')
    expect(resolveBailianSubmitTarget('keling-text-to-video', options)).toMatchObject({
      method: 'POST',
      url: 'https://ws-demo_01.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
    })
    expect(resolveBailianPollTarget('keling-text-to-video', 'task/id', options)).toMatchObject({
      method: 'GET',
      url: 'https://ws-demo_01.cn-beijing.maas.aliyuncs.com/api/v1/tasks/task%2Fid',
    })
    expect(resolveBailianCancelTarget('keling-text-to-video', 'task/id', options)).toMatchObject({
      method: 'POST',
      url: 'https://ws-demo_01.cn-beijing.maas.aliyuncs.com/api/v1/tasks/task%2Fid/cancel',
    })
    expect(() => resolveBailianPollTarget('keling-text-to-video', '   ')).toThrow(
      '必须提供 taskId',
    )
  })

  it('blocks untrusted SDK endpoints before credentials can be sent', () => {
    expect(() => assertTrustedBailianEndpoint(
      'https://ws-demo_01.cn-beijing.maas.aliyuncs.com/compatible-mode/v1/chat/completions',
    )).not.toThrow()
    expect(() => assertTrustedBailianEndpoint(
      'https://dashscope.aliyuncs.com.evil.example/api/v1/tasks/1',
      'en-US',
    )).toThrow('untrusted endpoint')
    expect(() => assertTrustedBailianEndpoint(
      'http://dashscope.aliyuncs.com/api/v1/tasks/1',
    )).toThrow('不受信任')
    expect(() => assertTrustedBailianEndpoint(
      'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    )).toThrow('不受信任')
    expect(() => assertTrustedBailianEndpoint(
      'https://ws-demo_01.cn-beijing.maas.aliyuncs.com.evil.example/compatible-mode/v1/chat/completions',
    )).toThrow('不受信任')
  })

  it('requires and safely resolves WorkspaceId for HappyHorse', () => {
    expect(() => resolveBailianSubmitTarget('happyhorse-text-to-video')).toThrow(
      '必须配置 workspaceId',
    )
    expect(resolveBailianSubmitTarget('happyhorse-text-to-video', { workspaceId: 'ws-demo_01' })).toMatchObject({
      method: 'POST',
      url: 'https://ws-demo_01.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
    })
    expect(() => resolveBailianSubmitTarget('happyhorse-text-to-video', { workspaceId: 'bad.example.com' }))
      .toThrow('workspaceId 只能包含')
    expect(isValidBailianWorkspaceId('ws-demo_01')).toBe(true)
    expect(isValidBailianWorkspaceId('bad.example.com')).toBe(false)
  })

  it('uses the workspace endpoint and latest instrumental field for Fun Music', () => {
    expect(() => resolveBailianSubmitTarget('fun-music-v1')).toThrow('必须配置 workspaceId')
    expect(resolveBailianSubmitTarget('fun-music-v1', { workspaceId: 'ws-music_01' })).toMatchObject({
      method: 'POST',
      url: 'https://ws-music_01.cn-beijing.maas.aliyuncs.com/api/v1/services/audio/music/generation',
    })
    expect(validateBailianPayload('fun-music-v1', {
      input: { prompt: '轻快纯音乐', is_instrumental: true },
    }).valid).toBe(true)
  })

  it('uses the SDK-owned native DashScope contract for DeepSeek V4', () => {
    expect(resolveBailianSubmitTarget('deepseek-v4-pro', { workspaceId: 'ws-deepseek_01' }))
      .toMatchObject({
        method: 'POST',
        url: 'https://ws-deepseek_01.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
      })
    expect(validateBailianPayload('deepseek-v4-flash', {
      input: { messages: [{ role: 'user', content: '解释量子纠缠' }] },
      parameters: {
        result_format: 'message',
        max_completion_tokens: 4096,
        enable_thinking: true,
        reasoning_effort: 'high',
      },
    }).valid).toBe(true)
    expect(validateBailianPayload('deepseek-v4-flash', {
      input: { messages: [{ role: 'user', content: '解释量子纠缠' }] },
      parameters: { result_format: 'message', top_k: 20 },
    }).valid).toBe(false)
  })

  it('rejects stale or unknown payload fields through Contract v3', () => {
    const operation = requireBailianSdkOperation('fun-music-v1')
    const example = operation.operation.examples.valid[0]?.request
    expect(example).toBeDefined()
    expect(validateBailianPayload('fun-music-v1', example).valid).toBe(true)
    expect(validateBailianPayload('fun-music-v1', {
      ...(example as Record<string, unknown>),
      obsolete_parameter: true,
    }).valid).toBe(false)
  })

  it('classifies lifecycle values from the synchronized SDK contract', () => {
    expect(classifyBailianTaskStatus('keling-text-to-video', 'RUNNING')).toBe('pending')
    expect(classifyBailianTaskStatus('keling-text-to-video', 'SUCCEEDED')).toBe('succeeded')
    expect(classifyBailianTaskStatus('keling-text-to-video', 'CANCELED')).toBe('failed')
  })
})
