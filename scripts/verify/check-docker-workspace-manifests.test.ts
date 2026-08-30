import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const repositoryRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const dockerfile = readFileSync(join(repositoryRoot, 'deploy', 'docker', 'Dockerfile'), 'utf8')
const rootPackage = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')) as {
  packageManager?: string
}

function listWorkspaceManifests(): string[] {
  const manifests: string[] = []
  for (const root of ['apps', 'packages']) {
    const absoluteRoot = join(repositoryRoot, root)
    for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const manifest = join(absoluteRoot, entry.name, 'package.json')
      if (!existsSync(manifest)) continue
      manifests.push(relative(repositoryRoot, manifest).replaceAll('\\', '/'))
    }
  }
  return manifests.sort()
}

function listDockerfileManifests(): string[] {
  // manifests 可能出现在多个阶段（workspace 全量依赖 + runtime 生产依赖），去重后比对。
  return [...new Set(
    [...dockerfile.matchAll(/^COPY ((?:apps|packages)\/[^\s]+\/package\.json) /gm)]
      .map(match => match[1])
      .filter((manifest): manifest is string => manifest !== undefined),
  )].sort()
}

describe('Docker workspace dependency cache', () => {
  it('keeps the Docker Bun base aligned with the repository package manager', () => {
    const packageManager = rootPackage.packageManager
    expect(packageManager?.startsWith('bun@')).toBe(true)
    const bunVersion = packageManager?.slice('bun@'.length)
    expect(dockerfile).toContain(`FROM oven/bun:${bunVersion}-debian AS base`)
  })

  it('copies every workspace manifest before installing dependencies', () => {
    expect(listDockerfileManifests()).toEqual(listWorkspaceManifests())
    expect(dockerfile.indexOf('bun install --frozen-lockfile')).toBeLessThan(dockerfile.indexOf('COPY apps ./apps'))
    expect(dockerfile.indexOf('bun install --frozen-lockfile')).toBeLessThan(dockerfile.indexOf('COPY packages ./packages'))
  })

  it('does not duplicate the workspace through a recursive runtime chown', () => {
    expect(dockerfile).not.toContain('chown -R bun:bun /app')
  })
})
