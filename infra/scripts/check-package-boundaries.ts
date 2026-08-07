import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const root = process.cwd()

function importSpecifier(modulePattern: string): RegExp {
  return new RegExp(String.raw`(?:from\s+|import\s*|import\s*\(\s*|require\s*\(\s*)['"]${modulePattern}(?:\/|['"])`)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const importsApps = importSpecifier(String.raw`(?:\.\.\/)*apps`)
const importsServices = importSpecifier(String.raw`(?:\.\.\/)*services`)
const importsReact = importSpecifier(String.raw`react`)
const importsElysia = importSpecifier(String.raw`elysia`)
const importsProviderDashScopePackage = importSpecifier(String.raw`(?:\.\.\/)*packages\/provider-dashscope`)
const importsApiSibling = importSpecifier(String.raw`(?:\.\.\/)*(?:api|apps\/api|services\/api)`)
const importsWorkerSibling = importSpecifier(String.raw`(?:\.\.\/)*(?:worker|apps\/worker|services\/worker)`)
export const importsProviderDashScope = importSpecifier(String.raw`@bailian-studio\/provider-dashscope`)

export interface BailianPackageBoundary {
  readonly packageName: string
  readonly ownerScope: string
  readonly allowedConsumerScopes: readonly string[]
  readonly dependencyProtocol: 'catalog:' | 'workspace:*'
}

/**
 * 执行层包的所有者和消费者白名单。
 *
 * 这不是文档提示，而是 `check:boundaries` 的可执行架构。新增消费者必须先经过
 * 架构评审并同时更新 docs/bailian/PACKAGE_BOUNDARY.md 与对应测试。
 */
export const bailianPackageBoundaries: readonly BailianPackageBoundary[] = [
  {
    packageName: '@bailian-studio/provider-dashscope',
    ownerScope: 'packages/provider-dashscope',
    allowedConsumerScopes: ['apps/worker'],
    dependencyProtocol: 'workspace:*',
  },
] as const

function isWithinScope(relativePath: string, scope: string): boolean {
  const normalized = relativePath.replaceAll('\\', '/')
  return normalized === scope || normalized.startsWith(`${scope}/`)
}

export function isBailianPackageConsumerAllowed(
  boundary: BailianPackageBoundary,
  relativePath: string,
): boolean {
  return isWithinScope(relativePath, boundary.ownerScope)
    || boundary.allowedConsumerScopes.some(scope => isWithinScope(relativePath, scope))
}

function importsPackageSubpath(packageName: string, source: string): boolean {
  const escapedPackage = escapeRegExp(packageName)
  return new RegExp(
    String.raw`(?:from\s+|import\s*|import\s*\(\s*|require\s*\(\s*)['"]${escapedPackage}\/`,
  ).test(source)
}

function importsOwnedSourceDirectly(ownerScope: string, source: string): boolean {
  const ownerDirectory = ownerScope.split('/').at(-1)
  if (!ownerDirectory) return false
  return importSpecifier(
    String.raw`(?:\.\.\/)+(?:packages\/)?${escapeRegExp(ownerDirectory)}`,
  ).test(source)
}

export function checkBailianPackageSourceBoundary(
  relativeFile: string,
  source: string,
): string[] {
  const violations: string[] = []

  for (const ownerScope of new Set(bailianPackageBoundaries.map(boundary => boundary.ownerScope))) {
    if (isWithinScope(relativeFile, ownerScope)) continue
    if (!importsOwnedSourceDirectly(ownerScope, source)) continue

    const publicBoundary = bailianPackageBoundaries.find(boundary => (
      boundary.ownerScope === ownerScope && boundary.packageName.startsWith('@bailian-studio/')
    ))
    violations.push(
      `${relativeFile} deep-imports ${ownerScope}; use ${publicBoundary?.packageName ?? 'its package root export'}`,
    )
  }

  for (const boundary of bailianPackageBoundaries) {
    if (isWithinScope(relativeFile, boundary.ownerScope)) continue

    const importsPackage = importSpecifier(escapeRegExp(boundary.packageName)).test(source)
    if (!importsPackage) continue

    if (!isBailianPackageConsumerAllowed(boundary, relativeFile)) {
      violations.push(
        `${relativeFile} imports ${boundary.packageName} outside its consumer allowlist`,
      )
    }
    else if (importsPackageSubpath(boundary.packageName, source)) {
      violations.push(
        `${relativeFile} imports a ${boundary.packageName} subpath; use the package root export`,
      )
    }
  }

  return violations
}

export const rules: Array<{
  scope: string
  banned: RegExp[]
}> = [
  {
    scope: 'packages/shared',
    banned: [/@bailian-studio\/(?!shared\b)[a-z-]+/],
  },
  {
    scope: 'packages/model-core',
    banned: [/@bailian-studio\/(db|storage|provider-dashscope)\b/, importsApps, importsServices],
  },
  {
    scope: 'packages/provider-dashscope',
    banned: [
      /@bailian-studio\/(db|storage|generation-repository|task-engine|event-bus)\b/,
      importsApps,
      importsServices,
      importsElysia,
      importsReact,
    ],
  },
  {
    scope: 'apps/web',
    banned: [
      // P1-40：前端运行时禁止直连持久化 / provider 执行 / 后端仓库包
      // （CLAUDE.md「运行时应用禁止直接 import @bailian-studio/db」的可执行化）。
      // web 合法消费面 = api-client / model-core / shared / design-tokens / event-bus。
      /@bailian-studio\/(db|provider-dashscope|generation-repository|media-repository|auth|storage|credit-ledger|task-engine)\b/,
      importsApps,
      importsServices,
      importsWorkerSibling,
    ],
  },
  {
    scope: 'apps/admin',
    banned: [
      // P1-40：与 web 同源挂载，约束一致——后端仓库包与执行层一律禁入。
      /@bailian-studio\/(db|provider-dashscope|generation-repository|media-repository|auth|storage|credit-ledger|task-engine)\b/,
      importsApps,
      importsServices,
      importsWorkerSibling,
    ],
  },
  {
    scope: 'packages/api-client',
    banned: [
      // P1-40：api-client 是纯 zod 契约层（schemas.ts 注释自称只依赖 shared+zod，
      // 实际零 workspace 依赖）。禁入任何 @bailian-studio 包——用 importSpecifier
      // 只匹配真实 import，不误伤源内自我引述的注释。
      importSpecifier(String.raw`@bailian-studio\/[a-z-]+`),
      importsApps,
      importsServices,
    ],
  },
  {
    scope: 'packages/storage',
    banned: [
      // P1-40：storage 只允许依赖叶子 shared（本地/OSS 适配器）。其它 @bailian-studio
      // 一律禁入（含 model-core / db / provider-dashscope）。
      importSpecifier(String.raw`@bailian-studio\/(?!shared\b)[a-z-]+`),
      importsApps,
      importsServices,
      importsReact,
      importsElysia,
    ],
  },
  {
    scope: 'packages/design-tokens',
    banned: [
      // P1-40：design-tokens 是纯令牌包，禁入所有 @bailian-studio 包与运行时。
      // 豁免自身包名——src/index.ts 的 doc 注释会用 `import '@bailian-studio/design-tokens/tokens.css'`
      // 给消费方演示 CSS 引入语法。
      importSpecifier(String.raw`@bailian-studio\/(?!design-tokens\b)[a-z-]+`),
      importsApps,
      importsServices,
      importsReact,
      importsElysia,
    ],
  },
  {
       scope: 'apps/api',
    banned: [
      /@bailian-studio\/(db|provider-dashscope)\b/,
      importsApps,
      importsWorkerSibling,
      importsProviderDashScopePackage,
    ],
  },
  {
       scope: 'apps/worker',
    banned: [
      /@bailian-studio\/(api|db)\b/,
      importsApiSibling,
      importsApps,
      importsProviderDashScopePackage,
      importsReact,
      /(?:fetch|new\s+Request)\s*\(\s*['"][^'"]*dashscope/i,
    ],
  },
  {
    scope: 'packages/generation-repository',
    banned: [
      /@bailian-studio\/provider-dashscope\b/,
      importsServices,
      importsApps,
      importsReact,
      importsElysia,
    ],
  },
  {
    scope: 'packages/credit-ledger',
    banned: [
      /@bailian-studio\/(?!db\b|shared\b)[a-z-]+/,
      importsServices,
      importsApps,
      importsReact,
      importsElysia,
    ],
  },
  {
    scope: 'packages/media-repository',
    banned: [
      /@bailian-studio\/(provider-dashscope|generation-repository|model-core|event-bus|storage|auth)\b/,
      importsServices,
      importsApps,
      importsReact,
      importsElysia,
    ],
  },
  {
    scope: 'packages/auth',
    banned: [
      /@bailian-studio\/(provider-dashscope|generation-repository|model-core|task-engine|event-bus|storage)\b/,
      importsServices,
      importsApps,
      importsReact,
      importsElysia,
    ],
  },
  {
    scope: 'packages/db',
    banned: [
      /@bailian-studio\/(api|worker|task-engine|event-bus|model-core|provider-dashscope)\b/,
      importsServices,
      importsApps,
      importsReact,
      importsElysia,
    ],
  },
  {
    scope: 'packages/task-engine',
    banned: [
      /@bailian-studio\/(db|storage|provider-dashscope)\b/,
      importsServices,
      importsApps,
      importsReact,
      importsElysia,
    ],
  },
  {
    scope: 'packages/event-bus',
    banned: [
      /@bailian-studio\/(db|storage|provider-dashscope)\b/,
      importsServices,
      importsApps,
      importsReact,
      importsElysia,
    ],
  },
]

function walk(dir: string): string[] {
  let files: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.turbo') continue
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) files = files.concat(walk(path))
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry)) files.push(path)
  }
  return files
}

function walkPackageManifests(dir: string): string[] {
  let files: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.turbo') continue
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) files = files.concat(walkPackageManifests(path))
    else if (entry === 'package.json') files.push(path)
  }
  return files
}

export function declaresPackageDependency(manifest: unknown, packageName: string): boolean {
  if (typeof manifest !== 'object' || manifest === null) return false
  const record = manifest as Record<string, unknown>
  return ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']
    .some((section) => {
      const dependencies = record[section]
      return typeof dependencies === 'object'
        && dependencies !== null
        && packageName in dependencies
    })
}

function declaredPackageVersion(manifest: unknown, packageName: string): string | undefined {
  if (typeof manifest !== 'object' || manifest === null) return undefined
  const record = manifest as Record<string, unknown>
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const dependencies = record[section]
    if (typeof dependencies !== 'object' || dependencies === null) continue
    const version = (dependencies as Record<string, unknown>)[packageName]
    if (typeof version === 'string') return version
  }
  return undefined
}

export function checkBailianPackageManifestBoundary(
  relativeFile: string,
  manifest: unknown,
): string[] {
  const violations: string[] = []

  for (const boundary of bailianPackageBoundaries) {
    const declaredVersion = declaredPackageVersion(manifest, boundary.packageName)
    if (declaredVersion === undefined) continue

    if (!isBailianPackageConsumerAllowed(boundary, relativeFile)) {
      violations.push(
        `${relativeFile} declares ${boundary.packageName} outside its consumer allowlist`,
      )
    }
    else if (declaredVersion !== boundary.dependencyProtocol) {
      violations.push(
        `${relativeFile} must declare ${boundary.packageName} as ${boundary.dependencyProtocol}, got ${declaredVersion}`,
      )
    }
  }

  return violations
}

export function checkPackageBoundaries(): string[] {
  const violations: string[] = []

  for (const rule of rules) {
    const absScope = join(root, rule.scope)
    try {
      if (!statSync(absScope).isDirectory()) continue
    }
    catch {
      continue
    }

    for (const file of walk(absScope)) {
      const source = readFileSync(file, 'utf8')
      for (const banned of rule.banned) {
        if (banned.test(source)) {
          violations.push(`${relative(root, file)} violates ${rule.scope}: ${banned}`)
        }
      }
    }
  }

  for (const sourceScope of ['packages', 'services', 'apps']) {
    const absScope = join(root, sourceScope)
    try {
      if (!statSync(absScope).isDirectory()) continue
    }
    catch {
      continue
    }

    for (const file of walk(absScope)) {
      const relativeFile = relative(root, file).replaceAll('\\', '/')
      const source = readFileSync(file, 'utf8')
      violations.push(...checkBailianPackageSourceBoundary(relativeFile, source))
    }

    for (const file of walkPackageManifests(absScope)) {
      const relativeFile = relative(root, file).replaceAll('\\', '/')
      const manifest = JSON.parse(readFileSync(file, 'utf8')) as unknown
      violations.push(...checkBailianPackageManifestBoundary(relativeFile, manifest))
    }
  }

  return violations
}

if (import.meta.main) {
  const violations = checkPackageBoundaries()

  if (violations.length > 0) {
    console.error('Package boundary violations:')
    for (const violation of violations) console.error(`- ${violation}`)
    process.exit(1)
  }

  console.log('Package boundaries OK')
}
