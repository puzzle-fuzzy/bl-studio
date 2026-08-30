import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const workspaceScopes = ['apps', 'packages'] as const
const sourceExtensions = /\.(ts|tsx|js|jsx|mjs|cjs)$/
const workspaceImportPattern = /(?:\bfrom\s+|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"](@bailian-studio\/[a-z0-9-]+)(?:\/[^'"]*)?['"]/g

export interface WorkspacePackageManifest {
  readonly name: string
  readonly relativeDirectory: string
  readonly manifest: unknown
}

export function extractWorkspaceImports(source: string): string[] {
  const withoutComments = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|\s)\/\/.*$/gm, '$1')
  return [...withoutComments.matchAll(workspaceImportPattern)]
    .map(match => match[1])
    .filter((name): name is string => name !== undefined)
    .filter((name, index, names) => names.indexOf(name) === index)
}

export function manifestDeclaresDependency(manifest: unknown, packageName: string): boolean {
  if (typeof manifest !== 'object' || manifest === null) return false
  const record = manifest as Record<string, unknown>
  return ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'].some(section => {
    const dependencies = record[section]
    return typeof dependencies === 'object' && dependencies !== null && packageName in dependencies
  })
}

export function checkWorkspaceDependencyDeclarations(repositoryRoot = process.cwd()): string[] {
  const packages = listWorkspacePackages(repositoryRoot)
  const packagesByName = new Map(packages.map(workspacePackage => [workspacePackage.name, workspacePackage]))
  const violations: string[] = []

  for (const workspacePackage of packages) {
    const packageRoot = join(repositoryRoot, workspacePackage.relativeDirectory)
    for (const file of walk(packageRoot)) {
      const source = readFileSync(file, 'utf8')
      for (const dependencyName of extractWorkspaceImports(source)) {
        if (dependencyName === workspacePackage.name || !packagesByName.has(dependencyName)) continue
        if (!manifestDeclaresDependency(workspacePackage.manifest, dependencyName)) {
          violations.push(
            `${relative(repositoryRoot, file).replaceAll('\\', '/')} imports ${dependencyName} without declaring it in ${workspacePackage.relativeDirectory}/package.json`,
          )
        }
      }
    }
  }

  return violations
}

function listWorkspacePackages(repositoryRoot: string): WorkspacePackageManifest[] {
  const packages: WorkspacePackageManifest[] = []
  for (const scope of workspaceScopes) {
    const scopeRoot = join(repositoryRoot, scope)
    for (const entry of readdirSync(scopeRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const relativeDirectory = `${scope}/${entry.name}`
      const manifestPath = join(repositoryRoot, relativeDirectory, 'package.json')
      try {
        if (!statSync(manifestPath).isFile()) continue
      } catch {
        continue
      }
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown
      const name = typeof manifest === 'object' && manifest !== null
        ? (manifest as { name?: unknown }).name
        : undefined
      if (typeof name === 'string') packages.push({ name, relativeDirectory, manifest })
    }
  }
  return packages
}

function walk(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.turbo') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(path))
    else if (sourceExtensions.test(entry.name)) files.push(path)
  }
  return files
}

if (import.meta.main) {
  const violations = checkWorkspaceDependencyDeclarations()
  if (violations.length > 0) {
    console.error('Workspace dependency declaration violations:')
    for (const violation of violations) console.error(`- ${violation}`)
    process.exit(1)
  }
  console.log('Workspace dependency declarations OK')
}
