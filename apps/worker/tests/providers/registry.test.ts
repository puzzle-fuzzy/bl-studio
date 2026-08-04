import { describe, expect, it } from 'vitest'
import { getModelById } from '@bailian-studio/model-core'
import {
  createProviderRegistry,
  ProviderRegistry,
  type ProviderRunner,
} from '../../src/providers'

const qwenImage = getModelById('qwen-image')
if (qwenImage === undefined) {
  throw new Error('qwen-image manifest missing from registry — test setup failed')
}

/** 用于测试注册表机制的最小 ProviderRunner stub。 */
function fakeRunner(id: string, willSupport: boolean): ProviderRunner {
  return {
    providerId: id,
    supports: () => willSupport,
    execute: async () => {
      throw new Error('fake runner execute is not used here')
    },
  }
}

describe('ProviderRegistry', () => {
  it('registers, lists, and reports membership', () => {
    const registry = new ProviderRegistry()
    registry.register(fakeRunner('alpha', true))

    expect(registry.has('alpha')).toBe(true)
    expect(registry.has('beta')).toBe(false)
    expect(registry.list()).toEqual(['alpha'])
  })

  it('returns the registered runner by id, throwing for unknown ids', () => {
    const registry = new ProviderRegistry()
    registry.register(fakeRunner('alpha', true))

    expect(registry.get('alpha').providerId).toBe('alpha')
    expect(() => registry.get('missing')).toThrow(/No provider runner registered/)
  })

  it('resolves a runner whose supports() matches the manifest', () => {
    const registry = new ProviderRegistry()
    registry.register(fakeRunner('dashscope', true))

    expect(registry.resolve(qwenImage).providerId).toBe('dashscope')
  })

  it('throws when no runner supports the manifest', () => {
    const registry = new ProviderRegistry()
    registry.register(fakeRunner('other', false))

    expect(() => registry.resolve(qwenImage)).toThrow(/No provider runner supports manifest/)
  })

  it('overwrites a previous registration for the same provider id', () => {
    const registry = new ProviderRegistry()
    registry.register(fakeRunner('alpha', false))
    registry.register(fakeRunner('alpha', true))

    // 只保留一个条目，且 supports() 反映的是最近一次的注册。
    expect(registry.list()).toEqual(['alpha'])
    expect(registry.resolve(qwenImage).supports(qwenImage)).toBe(true)
  })
})

describe('createProviderRegistry', () => {
  it('registers the dashscope runner when its config is supplied', () => {
    const registry = createProviderRegistry({ dashscope: { apiKey: 'test-key' } })

    expect(registry.has('dashscope')).toBe(true)
    expect(registry.resolve(qwenImage).providerId).toBe('dashscope')
  })

  it('stays empty when no provider config is supplied', () => {
    const registry = createProviderRegistry()

    expect(registry.list()).toEqual([])
    expect(registry.has('dashscope')).toBe(false)
    expect(() => registry.get('dashscope')).toThrow(/No provider runner registered/)
  })
})
