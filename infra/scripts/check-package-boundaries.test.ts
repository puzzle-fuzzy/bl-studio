import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  bailianPackageBoundaries,
  bailianSdkOwnerScope,
  checkBailianPackageManifestBoundary,
  checkBailianPackageSourceBoundary,
  checkBailianSdkVersionPolicy,
  declaresBailianSdkDependency,
  declaresPackageDependency,
  importsBailianAdapter,
  importsBailianSdk,
  importsProviderDashScope,
  isBailianPackageConsumerAllowed,
  rules,
} from './check-package-boundaries'

const source = readFileSync(new URL('./check-package-boundaries.ts', import.meta.url), 'utf8')

function matchesRule(scope: string, source: string): boolean {
  const rule = rules.find(item => item.scope === scope)
  expect(rule).toBeDefined()
  return rule?.banned.some(pattern => pattern.test(source)) ?? false
}

describe('package boundary rules', () => {
  it('allows only the worker runtime to import provider execution adapters in M5', () => {
    expect(matchesRule('apps/worker', "import { createDashScopeClient } from '@bailian-studio/provider-dashscope'")).toBe(false)
    expect(matchesRule('apps/api', "import { createDashScopeClient } from '@bailian-studio/provider-dashscope'")).toBe(true)
    expect(matchesRule('packages/generation-repository', "import { createDashScopeClient } from '@bailian-studio/provider-dashscope'")).toBe(true)
    expect(matchesRule('packages/provider-dashscope', "import { createGenerationRepository } from '@bailian-studio/generation-repository'")).toBe(true)
    expect(matchesRule('packages/provider-dashscope', "import { transitionTask } from '@bailian-studio/task-engine'")).toBe(true)
  })

  it('guards the API service from importing db and provider-dashscope directly', () => {
    expect(source).toContain("scope: 'apps/api'")
    // apps/api 的 banned 包正则应为 db|provider-dashscope（而非 storage ——
    // @bailian-studio/storage 是有意放行的）。断言真实的模式，
    // 而不是恰好能匹配其他 scope 规则的更宽松子串。
    expect(source).toContain('@bailian-studio\\/(db|provider-dashscope)')
    expect(source).toContain('apps\\/worker')
  })

  it('guards the worker service from importing the API service', () => {
    expect(source).toContain("scope: 'apps/worker'")
    expect(matchesRule('apps/worker', "import { app } from '@bailian-studio/api'")).toBe(true)
    expect(matchesRule('apps/worker', "import { db } from '@bailian-studio/db'")).toBe(true)
    expect(matchesRule('apps/worker', "import { buildDashScopeRequest } from '@bailian-studio/provider-dashscope'")).toBe(false)
    expect(source).toContain('(?:api|apps\\/api|services\\/api)')
    expect(source).toContain('packages\\/provider-dashscope')
  })

  it('matches worker boundary violations by behavior', () => {
    const workerRule = rules.find(rule => rule.scope === 'apps/worker')
    expect(workerRule).toBeDefined()

    const bannedSources = [
      "import { app } from '@bailian-studio/api'",
      "import { generationRoutes } from '../../api'",
      "import { generationRoutes } from '../../api/src/modules/generations'",
      "import { app } from '../../apps/api'",
      "import x from '../../../packages/provider-dashscope/src'",
    ]

    for (const sample of bannedSources) {
      expect(workerRule?.banned.some(pattern => pattern.test(sample))).toBe(true)
    }

    expect(workerRule?.banned.some(pattern => pattern.test(
      "import { transitionTask } from '@bailian-studio/task-engine'",
    ))).toBe(false)
  })

  it('keeps task-engine and event-bus pure', () => {
    for (const scope of ['packages/task-engine', 'packages/event-bus']) {
      expect(matchesRule(scope, "import { db } from '@bailian-studio/db'")).toBe(true)
      expect(matchesRule(scope, "import { buildDashScopeRequest } from '@bailian-studio/provider-dashscope'")).toBe(true)
      expect(matchesRule(scope, "import { app } from '../../apps/api'")).toBe(true)
      expect(matchesRule(scope, "import React from 'react'")).toBe(true)
      expect(matchesRule(scope, "import { Elysia } from 'elysia'")).toBe(true)
      expect(matchesRule(scope, "import { createLogger } from '@bailian-studio/shared'")).toBe(false)
    }
  })

  it('keeps the Bailian SDK behind a near-leaf adapter boundary', () => {
    expect(matchesRule('packages/model-core', "import { bailian } from '@bailian-studio/bailian-adapter'")).toBe(true)
    expect(matchesRule('packages/bailian-adapter', "import { listModels } from '@bailian-studio/model-core'")).toBe(false)
    expect(matchesRule('packages/bailian-adapter', "import { createDb } from '@bailian-studio/db'")).toBe(true)
    expect(matchesRule('packages/bailian-adapter', "import { createDashScopeClient } from '@bailian-studio/provider-dashscope'")).toBe(true)
    expect(matchesRule('packages/bailian-adapter', "import { Elysia } from 'elysia'")).toBe(true)
    expect(bailianSdkOwnerScope).toBe('packages/bailian-adapter')
    expect(importsBailianSdk.test(
      "import { getCatalogMeta } from '@puzzle-fuzzy/bailian-sdk'",
    )).toBe(true)
    expect(importsBailianSdk.test(
      "const sdk = await import('@puzzle-fuzzy/bailian-sdk/catalog')",
    )).toBe(true)
    expect(importsBailianSdk.test(
      "const sdk = require('@puzzle-fuzzy/bailian-sdk')",
    )).toBe(true)
    expect(declaresBailianSdkDependency({
      dependencies: { '@puzzle-fuzzy/bailian-sdk': '2.0.0' },
    })).toBe(true)
    expect(declaresBailianSdkDependency({
      devDependencies: { '@puzzle-fuzzy/bailian-sdk': '2.0.0' },
    })).toBe(true)
    expect(declaresBailianSdkDependency({
      dependencies: { '@bailian-studio/bailian-adapter': 'workspace:*' },
    })).toBe(false)
  })

  it('defines an executable Bailian owner and consumer allowlist', () => {
    expect(bailianPackageBoundaries).toEqual([
      {
        packageName: '@puzzle-fuzzy/bailian-sdk',
        ownerScope: 'packages/bailian-adapter',
        allowedConsumerScopes: [],
        dependencyProtocol: 'catalog:',
      },
      {
        packageName: '@bailian-studio/bailian-adapter',
        ownerScope: 'packages/bailian-adapter',
        allowedConsumerScopes: [
          'packages/provider-dashscope',
          'packages/generation-repository',
          'apps/api',
          'apps/worker',
        ],
        dependencyProtocol: 'workspace:*',
      },
      {
        packageName: '@bailian-studio/provider-dashscope',
        ownerScope: 'packages/provider-dashscope',
          allowedConsumerScopes: ['apps/worker'],
        dependencyProtocol: 'workspace:*',
      },
    ])

    const adapterBoundary = bailianPackageBoundaries[1]
    const providerBoundary = bailianPackageBoundaries[2]
    expect(adapterBoundary).toBeDefined()
    expect(providerBoundary).toBeDefined()
    expect(isBailianPackageConsumerAllowed(adapterBoundary!, 'apps/api/src/index.ts')).toBe(true)
    expect(isBailianPackageConsumerAllowed(adapterBoundary!, 'apps/web/src/App.tsx')).toBe(false)
    expect(isBailianPackageConsumerAllowed(providerBoundary!, 'apps/worker/src/index.ts')).toBe(true)
    expect(isBailianPackageConsumerAllowed(providerBoundary!, 'apps/api/src/index.ts')).toBe(false)
  })

  it('rejects unapproved consumers, package subpaths, and source deep imports', () => {
    expect(importsBailianAdapter.test(
      "import { getBailianContractSnapshot } from '@bailian-studio/bailian-adapter'",
    )).toBe(true)
    expect(importsProviderDashScope.test(
      "import { createDashScopeClient } from '@bailian-studio/provider-dashscope'",
    )).toBe(true)

    expect(checkBailianPackageSourceBoundary(
      'apps/web/src/bailian.ts',
      "import { getBailianContractSnapshot } from '@bailian-studio/bailian-adapter'",
    )).toHaveLength(1)
    expect(checkBailianPackageSourceBoundary(
      'apps/api/src/bailian.ts',
      "import { createDashScopeClient } from '@bailian-studio/provider-dashscope'",
    )).toHaveLength(1)
    expect(checkBailianPackageSourceBoundary(
      'apps/worker/src/bailian.ts',
      "import { getBailianSdkMeta } from '@bailian-studio/bailian-adapter/coverage'",
    )).toHaveLength(1)
    expect(checkBailianPackageSourceBoundary(
      'apps/worker/src/bailian.ts',
      "import { getBailianSdkMeta } from '../../../packages/bailian-adapter/src/coverage'",
    )).toHaveLength(1)
    expect(checkBailianPackageSourceBoundary(
      'apps/worker/src/providers/dashscope.ts',
      "import { createDashScopeClient } from '@bailian-studio/provider-dashscope'",
    )).toEqual([])
  })

  it('rejects package declaration drift and non-exact SDK versions', () => {
    expect(declaresPackageDependency({
      dependencies: { '@bailian-studio/provider-dashscope': 'workspace:*' },
    }, '@bailian-studio/provider-dashscope')).toBe(true)

    expect(checkBailianPackageManifestBoundary('apps/web/package.json', {
      dependencies: { '@bailian-studio/bailian-adapter': 'workspace:*' },
    })).toHaveLength(1)
    expect(checkBailianPackageManifestBoundary('apps/worker/package.json', {
      dependencies: { '@bailian-studio/provider-dashscope': '^0.0.0' },
    })).toHaveLength(1)
    expect(checkBailianPackageManifestBoundary('apps/worker/package.json', {
      dependencies: { '@bailian-studio/provider-dashscope': 'workspace:*' },
    })).toEqual([])

    expect(checkBailianSdkVersionPolicy({
      dependencies: { '@puzzle-fuzzy/bailian-sdk': 'catalog:' },
    }, 'catalog:\n  "@puzzle-fuzzy/bailian-sdk": "^2.0.0"\n')).toHaveLength(1)
    expect(checkBailianSdkVersionPolicy({
      dependencies: { '@puzzle-fuzzy/bailian-sdk': '2.0.0-beta.3' },
    }, 'catalog:\n  "@puzzle-fuzzy/bailian-sdk": "2.0.0-beta.3"\n')).toHaveLength(1)
    expect(checkBailianSdkVersionPolicy({
      dependencies: { '@puzzle-fuzzy/bailian-sdk': 'catalog:' },
    }, 'catalog:\n  "@puzzle-fuzzy/bailian-sdk": "2.0.0-beta.3"\n')).toEqual([])
  })

  it('guards API and worker from direct persistence/provider coupling', () => {
    expect(matchesRule('apps/api', "import { db } from '@bailian-studio/db'")).toBe(true)
    expect(matchesRule('apps/api', "import { buildDashScopeRequest } from '@bailian-studio/provider-dashscope'")).toBe(true)
    expect(matchesRule('apps/api', "import { runWorkerOnce } from '../../worker'")).toBe(true)
    expect(matchesRule('apps/api', "import '../../worker'")).toBe(true)
    expect(matchesRule('apps/api', "await import('../../worker')")).toBe(true)
    expect(matchesRule('apps/api', "require('../../worker')")).toBe(true)
    expect(matchesRule('apps/api', "import { createGenerationRepository } from '@bailian-studio/generation-repository'")).toBe(false)

    expect(matchesRule('apps/worker', "import { app } from '@bailian-studio/api'")).toBe(true)
    expect(matchesRule('apps/worker', "import { db } from '@bailian-studio/db'")).toBe(true)
    expect(matchesRule('apps/worker', "import { buildDashScopeRequest } from '@bailian-studio/provider-dashscope'")).toBe(false)
    expect(matchesRule('apps/worker', "import '../../api'")).toBe(true)
    expect(matchesRule('apps/worker', "await import('../../api')")).toBe(true)
    expect(matchesRule('apps/worker', "require('../../api')")).toBe(true)
    expect(matchesRule('apps/worker', "fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation')")).toBe(true)
    expect(matchesRule('apps/worker', "new Request('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation')")).toBe(true)
    expect(matchesRule('apps/worker', "import { createGenerationRepository } from '@bailian-studio/generation-repository'")).toBe(false)
  })

  it('keeps db isolated from domain and runtime packages while allowing database libraries', () => {
    expect(matchesRule('packages/db', "import { app } from '@bailian-studio/api'")).toBe(true)
    expect(matchesRule('packages/db', "import { runWorkerOnce } from '@bailian-studio/worker'")).toBe(true)
    expect(matchesRule('packages/db', "import { sql } from 'drizzle-orm'")).toBe(false)
    expect(matchesRule('packages/db', "import postgres from 'postgres'")).toBe(false)
  })

  it('defines the generation repository boundary', () => {
    expect(matchesRule('packages/generation-repository', "import { app } from '../../apps/api'")).toBe(true)
    expect(matchesRule('packages/generation-repository', "import { runWorkerOnce } from '../../apps/worker'")).toBe(true)
    expect(matchesRule('packages/generation-repository', "import React from 'react'")).toBe(true)
    expect(matchesRule('packages/generation-repository', "import { Elysia } from 'elysia'")).toBe(true)
    expect(matchesRule('packages/generation-repository', "import { buildDashScopeRequest } from '@bailian-studio/provider-dashscope'")).toBe(true)
    expect(matchesRule('packages/generation-repository', "import { createDb } from '@bailian-studio/db'")).toBe(false)
  })

  it('keeps the credit ledger persistence package independent from runtime and domain packages', () => {
    expect(matchesRule('packages/credit-ledger', "import { createDb } from '@bailian-studio/db'")).toBe(false)
    expect(matchesRule('packages/credit-ledger', "import { createLogger } from '@bailian-studio/shared'")).toBe(false)
    expect(matchesRule('packages/credit-ledger', "import { app } from '../../apps/api'")).toBe(true)
    expect(matchesRule('packages/credit-ledger', "import { createAuthService } from '@bailian-studio/auth'")).toBe(true)
    expect(matchesRule('packages/credit-ledger', "import { Elysia } from 'elysia'")).toBe(true)
  })
})
