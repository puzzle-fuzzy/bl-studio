import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  bailianPackageBoundaries,
  checkBailianPackageManifestBoundary,
  checkBailianPackageSourceBoundary,
  declaresPackageDependency,
  importsCreativeAssetTables,
  importsProviderDashScope,
  isBailianPackageConsumerAllowed,
  rules,
} from './check-package-boundaries'

const source = readFileSync(
  new URL('./check-package-boundaries.ts', import.meta.url),
  'utf8',
)

function matchesRule(scope: string, source: string): boolean {
  const rule = rules.find((item) => item.scope === scope)
  expect(rule).toBeDefined()
  return rule?.banned.some((pattern) => pattern.test(source)) ?? false
}

describe('package boundary rules', () => {
  it('allows only the worker runtime to import provider execution adapters', () => {
    expect(
      matchesRule(
        'apps/worker',
        "import { createDashScopeClient } from '@bailian-studio/provider-dashscope'",
      ),
    ).toBe(false)
    expect(
      matchesRule(
        'apps/api',
        "import { createDashScopeClient } from '@bailian-studio/provider-dashscope'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/generation-repository',
        "import { createDashScopeClient } from '@bailian-studio/provider-dashscope'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/provider-dashscope',
        "import { createGenerationRepository } from '@bailian-studio/generation-repository'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/provider-dashscope',
        "import { transitionTask } from '@bailian-studio/task-engine'",
      ),
    ).toBe(true)
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
    expect(
      matchesRule('apps/worker', "import { app } from '@bailian-studio/api'"),
    ).toBe(true)
    expect(
      matchesRule('apps/worker', "import { db } from '@bailian-studio/db'"),
    ).toBe(true)
    expect(
      matchesRule(
        'apps/worker',
        "import { buildDashScopeRequest } from '@bailian-studio/provider-dashscope'",
      ),
    ).toBe(false)
    expect(source).toContain('(?:api|apps\\/api|services\\/api)')
    expect(source).toContain('packages\\/provider-dashscope')
  })

  it('matches worker boundary violations by behavior', () => {
    const workerRule = rules.find((rule) => rule.scope === 'apps/worker')
    expect(workerRule).toBeDefined()

    const bannedSources = [
      "import { app } from '@bailian-studio/api'",
      "import { generationRoutes } from '../../api'",
      "import { generationRoutes } from '../../api/src/modules/generations'",
      "import { app } from '../../apps/api'",
      "import x from '../../../packages/provider-dashscope/src'",
    ]

    for (const sample of bannedSources) {
      expect(workerRule?.banned.some((pattern) => pattern.test(sample))).toBe(
        true,
      )
    }

    expect(
      workerRule?.banned.some((pattern) =>
        pattern.test(
          "import { transitionTask } from '@bailian-studio/task-engine'",
        ),
      ),
    ).toBe(false)
  })

  it('keeps task-engine and sse-protocol pure', () => {
    for (const scope of ['packages/task-engine', 'packages/sse-protocol']) {
      expect(
        matchesRule(scope, "import { db } from '@bailian-studio/db'"),
      ).toBe(true)
      expect(
        matchesRule(
          scope,
          "import { buildDashScopeRequest } from '@bailian-studio/provider-dashscope'",
        ),
      ).toBe(true)
      expect(matchesRule(scope, "import { app } from '../../apps/api'")).toBe(
        true,
      )
      expect(matchesRule(scope, "import React from 'react'")).toBe(true)
      expect(matchesRule(scope, "import { Elysia } from 'elysia'")).toBe(true)
      expect(
        matchesRule(
          scope,
          "import { createLogger } from '@bailian-studio/shared'",
        ),
      ).toBe(false)
    }
  })

  it('keeps model-core a pure leaf: no provider execution, persistence, or app imports', () => {
    expect(
      matchesRule(
        'packages/model-core',
        "import { createDashScopeClient } from '@bailian-studio/provider-dashscope'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/model-core',
        "import { createDb } from '@bailian-studio/db'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/model-core',
        "import { app } from '../../apps/api'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/model-core',
        "import { runWorkerOnce } from '../../apps/worker'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/model-core',
        "import { listModels } from './registry'",
      ),
    ).toBe(false)
  })

  it('defines an executable provider-dashscope owner and consumer allowlist', () => {
    expect(bailianPackageBoundaries).toEqual([
      {
        packageName: '@bailian-studio/provider-dashscope',
        ownerScope: 'packages/provider-dashscope',
        allowedConsumerScopes: ['apps/worker'],
        dependencyProtocol: 'workspace:*',
      },
      {
        packageName: '@bailian-studio/persistence-runtime',
        ownerScope: 'packages/persistence-runtime',
        allowedConsumerScopes: ['apps/api', 'apps/worker'],
        dependencyProtocol: 'workspace:*',
      },
      {
        packageName: '@bailian-studio/task-repository',
        ownerScope: 'packages/task-repository',
        allowedConsumerScopes: [
          'packages/generation-repository',
          'packages/persistence-runtime',
          'packages/media-repository',
          'packages/director-repository',
          'packages/admin-repository',
          'apps/api',
          'apps/worker',
        ],
        dependencyProtocol: 'workspace:*',
      },
      {
        packageName: '@bailian-studio/creative-asset-repository',
        ownerScope: 'packages/creative-asset-repository',
        allowedConsumerScopes: [
          'apps/api',
          'packages/persistence-runtime',
          'packages/generation-repository',
        ],
        dependencyProtocol: 'workspace:*',
      },
      {
        packageName: '@bailian-studio/admin-repository',
        ownerScope: 'packages/admin-repository',
        allowedConsumerScopes: [
          'apps/api',
          'packages/persistence-runtime',
          'packages/generation-repository',
        ],
        dependencyProtocol: 'workspace:*',
      },
      {
        packageName: '@bailian-studio/canvas-execution',
        ownerScope: 'packages/canvas-execution',
        allowedConsumerScopes: ['apps/api', 'apps/worker'],
        dependencyProtocol: 'workspace:*',
      },
    ])

    const providerBoundary = bailianPackageBoundaries[0]
    expect(providerBoundary).toBeDefined()
    expect(
      isBailianPackageConsumerAllowed(
        providerBoundary!,
        'apps/worker/src/index.ts',
      ),
    ).toBe(true)
    expect(
      isBailianPackageConsumerAllowed(
        providerBoundary!,
        'apps/api/src/index.ts',
      ),
    ).toBe(false)
    expect(
      isBailianPackageConsumerAllowed(
        providerBoundary!,
        'apps/studio/src/App.tsx',
      ),
    ).toBe(false)

    const persistenceBoundary = bailianPackageBoundaries[1]
    expect(persistenceBoundary).toBeDefined()
    expect(
      isBailianPackageConsumerAllowed(
        persistenceBoundary!,
        'apps/api/src/index.ts',
      ),
    ).toBe(true)
    expect(
      isBailianPackageConsumerAllowed(
        persistenceBoundary!,
        'apps/worker/src/index.ts',
      ),
    ).toBe(true)
    expect(
      isBailianPackageConsumerAllowed(
        persistenceBoundary!,
        'apps/studio/src/App.tsx',
      ),
    ).toBe(false)
  })

  it('rejects unapproved consumers, package subpaths, and source deep imports', () => {
    expect(
      importsProviderDashScope.test(
        "import { createDashScopeClient } from '@bailian-studio/provider-dashscope'",
      ),
    ).toBe(true)

    expect(
      checkBailianPackageSourceBoundary(
        'apps/api/src/bailian.ts',
        "import { createDashScopeClient } from '@bailian-studio/provider-dashscope'",
      ),
    ).toHaveLength(1)
    expect(
      checkBailianPackageSourceBoundary(
        'apps/worker/src/bailian.ts',
        "import { buildDashScopeRequest } from '../../../packages/provider-dashscope/src/request-builder'",
      ),
    ).toHaveLength(1)
    expect(
      checkBailianPackageSourceBoundary(
        'apps/worker/src/providers/dashscope.ts',
        "import { createDashScopeClient } from '@bailian-studio/provider-dashscope'",
      ),
    ).toEqual([])
  })

  it('rejects package declaration drift', () => {
    expect(
      declaresPackageDependency(
        {
          dependencies: { '@bailian-studio/provider-dashscope': 'workspace:*' },
        },
        '@bailian-studio/provider-dashscope',
      ),
    ).toBe(true)

    expect(
      checkBailianPackageManifestBoundary('apps/studio/package.json', {
        dependencies: { '@bailian-studio/provider-dashscope': 'workspace:*' },
      }),
    ).toHaveLength(1)
    expect(
      checkBailianPackageManifestBoundary('apps/worker/package.json', {
        dependencies: { '@bailian-studio/provider-dashscope': '^0.0.0' },
      }),
    ).toHaveLength(1)
    expect(
      checkBailianPackageManifestBoundary('apps/worker/package.json', {
        dependencies: { '@bailian-studio/provider-dashscope': 'workspace:*' },
      }),
    ).toEqual([])
  })

  it('guards API and worker from direct persistence/provider coupling', () => {
    expect(
      matchesRule('apps/api', "import { db } from '@bailian-studio/db'"),
    ).toBe(true)
    expect(
      matchesRule(
        'apps/api',
        "import { buildDashScopeRequest } from '@bailian-studio/provider-dashscope'",
      ),
    ).toBe(true)
    expect(
      matchesRule('apps/api', "import { runWorkerOnce } from '../../worker'"),
    ).toBe(true)
    expect(matchesRule('apps/api', "import '../../worker'")).toBe(true)
    expect(matchesRule('apps/api', "await import('../../worker')")).toBe(true)
    expect(matchesRule('apps/api', "require('../../worker')")).toBe(true)
    expect(
      matchesRule(
        'apps/api',
        "import { createGenerationRepository } from '@bailian-studio/generation-repository'",
      ),
    ).toBe(false)

    expect(
      matchesRule('apps/worker', "import { app } from '@bailian-studio/api'"),
    ).toBe(true)
    expect(
      matchesRule('apps/worker', "import { db } from '@bailian-studio/db'"),
    ).toBe(true)
    expect(
      matchesRule(
        'apps/worker',
        "import { buildDashScopeRequest } from '@bailian-studio/provider-dashscope'",
      ),
    ).toBe(false)
    expect(matchesRule('apps/worker', "import '../../api'")).toBe(true)
    expect(matchesRule('apps/worker', "await import('../../api')")).toBe(true)
    expect(matchesRule('apps/worker', "require('../../api')")).toBe(true)
    expect(
      matchesRule(
        'apps/worker',
        "fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation')",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'apps/worker',
        "new Request('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation')",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'apps/worker',
        "import { createGenerationRepository } from '@bailian-studio/generation-repository'",
      ),
    ).toBe(false)
  })

  it('keeps db isolated from domain and runtime packages while allowing database libraries', () => {
    expect(
      matchesRule('packages/db', "import { app } from '@bailian-studio/api'"),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/db',
        "import { runWorkerOnce } from '@bailian-studio/worker'",
      ),
    ).toBe(true)
    expect(
      matchesRule('packages/db', "import { sql } from 'drizzle-orm'"),
    ).toBe(false)
    expect(matchesRule('packages/db', "import postgres from 'postgres'")).toBe(
      false,
    )
  })

  it('keeps the persistence runtime free of application and transport dependencies', () => {
    expect(
      matchesRule(
        'packages/persistence-runtime',
        "import { app } from '../../apps/api'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/persistence-runtime',
        "import { WorkerLoop } from '../../apps/worker'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/persistence-runtime',
        "import { Elysia } from 'elysia'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/persistence-runtime',
        "import { createDb } from '@bailian-studio/db'",
      ),
    ).toBe(false)
  })

  it('keeps task-repository limited to database and task-engine dependencies', () => {
    expect(
      matchesRule(
        'packages/task-repository',
        "import { createDb } from '@bailian-studio/db'",
      ),
    ).toBe(false)
    expect(
      matchesRule(
        'packages/task-repository',
        "import { transitionTask } from '@bailian-studio/task-engine'",
      ),
    ).toBe(false)
    expect(
      matchesRule(
        'packages/task-repository',
        "import { createLogger } from '@bailian-studio/shared'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/task-repository',
        "import { app } from '../../apps/api'",
      ),
    ).toBe(true)
  })

  it('defines the generation repository boundary', () => {
    expect(
      matchesRule(
        'packages/generation-repository',
        "import { app } from '../../apps/api'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/generation-repository',
        "import { runWorkerOnce } from '../../apps/worker'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/generation-repository',
        "import React from 'react'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/generation-repository',
        "import { Elysia } from 'elysia'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/generation-repository',
        "import { buildDashScopeRequest } from '@bailian-studio/provider-dashscope'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/generation-repository',
        "import { createDb } from '@bailian-studio/db'",
      ),
    ).toBe(false)
    expect(
      matchesRule(
        'packages/generation-repository',
        "import { creativeAssets } from '@bailian-studio/db'",
      ),
    ).toBe(true)
    expect(
      importsCreativeAssetTables.test(
        "import { creativeGenerationContexts } from '@bailian-studio/db'",
      ),
    ).toBe(true)
  })

  it('keeps the credit ledger persistence package independent from runtime and domain packages', () => {
    expect(
      matchesRule(
        'packages/credit-ledger',
        "import { createDb } from '@bailian-studio/db'",
      ),
    ).toBe(false)
    expect(
      matchesRule(
        'packages/credit-ledger',
        "import { createLogger } from '@bailian-studio/shared'",
      ),
    ).toBe(false)
    expect(
      matchesRule(
        'packages/credit-ledger',
        "import { app } from '../../apps/api'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/credit-ledger',
        "import { createAuthService } from '@bailian-studio/auth'",
      ),
    ).toBe(true)
    expect(
      matchesRule('packages/credit-ledger', "import { Elysia } from 'elysia'"),
    ).toBe(true)
  })

  it('keeps web and admin frontends isolated from persistence and provider execution (P1-40)', () => {
    // CLAUDE.md「运行时应用禁止直接 import @bailian-studio/db」此前无规则可执行，
    // web/admin 完全裸奔。现在 web/admin 禁入持久化 / 执行 / 后端仓库包。
    for (const scope of ['apps/studio', 'apps/admin']) {
      expect(
        matchesRule(scope, "import { createDb } from '@bailian-studio/db'"),
      ).toBe(true)
      expect(
        matchesRule(
          scope,
          "import { buildDashScopeRequest } from '@bailian-studio/provider-dashscope'",
        ),
      ).toBe(true)
      expect(
        matchesRule(
          scope,
          "import { createGenerationRepository } from '@bailian-studio/generation-repository'",
        ),
      ).toBe(true)
      expect(matchesRule(scope, "import { app } from '../../apps/api'")).toBe(
        true,
      )
      expect(
        matchesRule(scope, "import { runWorkerOnce } from '../../apps/worker'"),
      ).toBe(true)
      expect(
        matchesRule(
          scope,
          "import { apiClient } from '@bailian-studio/api-client'",
        ),
      ).toBe(false)
      expect(
        matchesRule(
          scope,
          "import { listModels } from '@bailian-studio/model-core'",
        ),
      ).toBe(false)
    }
  })

  it('keeps api-client, storage, and design-tokens narrow (P1-40)', () => {
    // api-client 是纯 zod 传输契约层，仅允许直接消费创意资产 contracts。
    expect(matchesRule('packages/api-client', "import { z } from 'zod'")).toBe(
      false,
    )
    expect(
      matchesRule(
        'packages/api-client',
        "import { createLogger } from '@bailian-studio/shared'",
      ),
    ).toBe(false)
    expect(
      matchesRule(
        'packages/api-client',
        "import { CreativeAssetTypeSchema } from '@bailian-studio/creative-asset-contracts'",
      ),
    ).toBe(false)
    expect(
      matchesRule(
        'packages/api-client',
        "import { CanvasSnapshotSchema } from '@bailian-studio/canvas-contracts'",
      ),
    ).toBe(false)
    expect(
      matchesRule(
        'packages/api-client',
        "import { listModels } from '@bailian-studio/model-core'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/api-client',
        "import { DirectorProjectDetailSchema } from '@bailian-studio/director-contracts'",
      ),
    ).toBe(false)

    // storage 只允许叶子 shared。
    expect(
      matchesRule(
        'packages/storage',
        "import { createLogger } from '@bailian-studio/shared'",
      ),
    ).toBe(false)
    expect(
      matchesRule(
        'packages/storage',
        "import { createDb } from '@bailian-studio/db'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/storage',
        "import { listModels } from '@bailian-studio/model-core'",
      ),
    ).toBe(true)

    // design-tokens 是纯令牌包：禁入所有 @bailian-studio 包。
    expect(
      matchesRule(
        'packages/design-tokens',
        "import { db } from '@bailian-studio/db'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/design-tokens',
        "import { GenerationStatus } from '@bailian-studio/sse-protocol'",
      ),
    ).toBe(true)
  })

  it('keeps director contracts independent from runtime packages', () => {
    expect(
      matchesRule(
        'packages/director-contracts',
        "import { z } from 'zod'",
      ),
    ).toBe(false)
    expect(
      matchesRule(
        'packages/director-contracts',
        "import { createDb } from '@bailian-studio/db'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/director-contracts',
        "import { app } from '../../apps/api'",
      ),
    ).toBe(true)
    expect(
      matchesRule(
        'packages/director-repository',
        "import { DirectorProjectDetail } from '@bailian-studio/director-contracts'",
      ),
    ).toBe(false)
  })
})
