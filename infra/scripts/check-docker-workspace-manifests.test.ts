import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const repositoryRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const dockerfile = readFileSync(join(repositoryRoot, 'infra', 'docker', 'Dockerfile'), 'utf8')

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
  return [...dockerfile.matchAll(/^COPY ((?:apps|packages)\/[^\s]+\/package\.json) /gm)]
    .map(match => match[1])
    .filter((manifest): manifest is string => manifest !== undefined)
    .sort()
}

describe('Docker workspace dependency cache', () => {
  it('copies every workspace manifest before installing dependencies', () => {
    expect(listDockerfileManifests()).toEqual(listWorkspaceManifests())
    expect(dockerfile.indexOf('pnpm install --frozen-lockfile')).toBeLessThan(dockerfile.indexOf('COPY apps ./apps'))
    expect(dockerfile.indexOf('pnpm install --frozen-lockfile')).toBeLessThan(dockerfile.indexOf('COPY packages ./packages'))
  })

  it('does not duplicate the workspace through a recursive runtime chown', () => {
    expect(dockerfile).not.toContain('chown -R bun:bun /app')
  })
})
