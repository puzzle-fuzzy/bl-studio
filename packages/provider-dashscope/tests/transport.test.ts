import { describe, expect, it } from 'vitest'
import { getModelById, type FrozenModelManifest } from '@bailian-studio/model-core'
import {
  isValidDashScopeWorkspaceId,
  resolveDashScopeCancelTarget,
  resolveDashScopePollTarget,
  resolveDashScopeSubmitTarget,
} from '../src'

function fixtureManifest(id: string): FrozenModelManifest {
  const manifest = getModelById(id)
  if (manifest === undefined) throw new Error(`${id} fixture model is missing`)
  return manifest
}

/** 构造一个端点模板指向非受信主机的 manifest，用于信任断言。 */
function untrustedManifest(id: string): FrozenModelManifest {
  const manifest = fixtureManifest(id)
  return {
    ...manifest,
    transport: {
      ...manifest.transport,
      submit: {
        ...manifest.transport.submit,
        endpointTemplate: 'https://evil.example.com/api/v1/exfiltrate',
      },
    },
  } as FrozenModelManifest
}

describe('isValidDashScopeWorkspaceId', () => {
  it('accepts letters, digits, hyphens and underscores', () => {
    expect(isValidDashScopeWorkspaceId('ws-prod_2026')).toBe(true)
    expect(isValidDashScopeWorkspaceId('abc')).toBe(true)
    expect(isValidDashScopeWorkspaceId('123')).toBe(true)
  })

  it('rejects whitespace, punctuation and unicode', () => {
    expect(isValidDashScopeWorkspaceId('ws prod')).toBe(false)
    expect(isValidDashScopeWorkspaceId('')).toBe(false)
    expect(isValidDashScopeWorkspaceId('ws.prod')).toBe(false)
    expect(isValidDashScopeWorkspaceId('工作区')).toBe(false)
  })
})

describe('resolveDashScopeSubmitTarget', () => {
  it('substitutes {WorkspaceId} into the manifest endpoint template', () => {
    const target = resolveDashScopeSubmitTarget(fixtureManifest('keling-text-to-video'), {
      workspaceId: 'ws-test',
    })
    expect(target.url).toBe(
      'https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
    )
    expect(target.method).toBe('POST')
    expect(target.headers.some(header => header.name === 'Authorization')).toBe(true)
  })

  it('rejects workspace-scoped endpoints when workspace id is missing', () => {
    expect(() => resolveDashScopeSubmitTarget(fixtureManifest('happyhorse-text-to-video'), {}))
      .toThrowError(expect.objectContaining({ code: 'WORKSPACE_ID_REQUIRED' }))
  })

  it('rejects an invalid workspace id', () => {
    expect(() => resolveDashScopeSubmitTarget(fixtureManifest('keling-text-to-video'), {
      workspaceId: 'ws prod',
    })).toThrowError(expect.objectContaining({ code: 'WORKSPACE_ID_INVALID' }))
  })

  it('rejects endpoints on untrusted hosts', () => {
    expect(() => resolveDashScopeSubmitTarget(untrustedManifest('keling-text-to-video'), {
      workspaceId: 'ws-test',
    })).toThrowError(expect.objectContaining({ code: 'UNTRUSTED_ENDPOINT' }))
  })
})

describe('resolveDashScopePollTarget / CancelTarget', () => {
  const keling = fixtureManifest('keling-text-to-video')

  it('resolves the polling target and URL-encodes the task id', () => {
    const target = resolveDashScopePollTarget(keling, 'task-1', { workspaceId: 'ws-test' })
    expect(target.url).toBe('https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/tasks/task-1')
    expect(target.method).toBe('GET')
    expect(target.headers).toEqual([{ name: 'Authorization' }])
  })

  it('derives the cancel target from the polling template', () => {
    const target = resolveDashScopeCancelTarget(keling, 'task-1', { workspaceId: 'ws-test' })
    expect(target.url).toBe('https://ws-test.cn-beijing.maas.aliyuncs.com/api/v1/tasks/task-1/cancel')
    expect(target.method).toBe('POST')
  })

  it('rejects an empty task id', () => {
    expect(() => resolveDashScopePollTarget(keling, '', { workspaceId: 'ws-test' }))
      .toThrowError(expect.objectContaining({ code: 'TASK_ID_REQUIRED' }))
  })

  it('rejects polling/cancel for non-async manifests', () => {
    const qwenImage = fixtureManifest('qwen-image')
    expect(() => resolveDashScopePollTarget(qwenImage, 'task-1', { workspaceId: 'ws-test' }))
      .toThrowError(expect.objectContaining({ code: 'ASYNC_POLLING_UNSUPPORTED' }))
    expect(() => resolveDashScopeCancelTarget(qwenImage, 'task-1', { workspaceId: 'ws-test' }))
      .toThrowError(expect.objectContaining({ code: 'ASYNC_POLLING_UNSUPPORTED' }))
  })
})
