/**
 * Provider Registry
 * 持有 provider runner 实例，并按 provider id 分发执行。
 */

import type { FrozenModelManifest } from '@bailian-studio/dashscope-manifests'
import type { ProviderRunner } from './types'
import { DashScopeProviderRunner, type CreateDashScopeRunnerOptions } from './dashscope-runner'

export interface CreateProviderRegistryOptions {
  dashscope?: CreateDashScopeRunnerOptions
}

export class ProviderRegistry {
  private readonly runners = new Map<string, ProviderRunner>()

  register(runner: ProviderRunner): void {
    this.runners.set(runner.providerId, runner)
  }

  /** 若指定的 provider id 未注册 runner，则抛出异常。 */
  get(providerId: string): ProviderRunner {
    const runner = this.runners.get(providerId)
    if (runner === undefined) {
      throw new Error(`No provider runner registered for provider: ${providerId}`)
    }
    return runner
  }

  /** 通过 supports() 谓词为 manifest 解析出 runner。 */
  resolve(manifest: FrozenModelManifest): ProviderRunner {
    for (const runner of this.runners.values()) {
      if (runner.supports(manifest)) return runner
    }
    throw new Error(`No provider runner supports manifest: ${manifest.id} (provider: ${manifest.provider})`)
  }

  has(providerId: string): boolean {
    return this.runners.has(providerId)
  }

  list(): string[] {
    return [...this.runners.keys()]
  }
}

/**
 * 依据配置构建注册表。仅当某 provider 的配置被提供时才注册它，
 * 这样即使缺少部分 provider 的凭据，worker 依然可以运行。
 */
export function createProviderRegistry(options: CreateProviderRegistryOptions = {}): ProviderRegistry {
  const registry = new ProviderRegistry()

  if (options.dashscope !== undefined) {
    registry.register(new DashScopeProviderRunner(options.dashscope))
  }

  return registry
}
