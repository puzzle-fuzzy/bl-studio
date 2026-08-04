/**
 * Provider Registry
 * Owns provider runner instances and dispatches execution by provider id.
 */

import type { FrozenModelManifest } from '@bailian-studio/model-core'
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

  /** Throws if no runner is registered for the given provider id. */
  get(providerId: string): ProviderRunner {
    const runner = this.runners.get(providerId)
    if (runner === undefined) {
      throw new Error(`No provider runner registered for provider: ${providerId}`)
    }
    return runner
  }

  /** Resolve a runner for a manifest via its supports() predicate. */
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
 * Build a registry from configuration. Providers are only registered when their
 * config is supplied, so the worker stays runnable without every provider's
 * credentials.
 */
export function createProviderRegistry(options: CreateProviderRegistryOptions = {}): ProviderRegistry {
  const registry = new ProviderRegistry()

  if (options.dashscope !== undefined) {
    registry.register(new DashScopeProviderRunner(options.dashscope))
  }

  return registry
}
