import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, posix, resolve, win32 } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findRepoRoot, looksLikeForeignAbsolute, resolveArtifactLocalRoot } from '../src'

let tmpDirs: string[] = []

afterEach(async () => {
  await Promise.all(tmpDirs.map(dir => rm(dir, { recursive: true, force: true })))
  tmpDirs = []
})

async function makeTmp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'bailian-studio-storage-paths-'))
  tmpDirs.push(dir)
  return dir
}

// This test file lives at packages/storage/tests — the nearest turbo.json
// ancestor is the monorepo root, which is what every resolver call must anchor to.
const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = findRepoRoot(here)

describe('resolveArtifactLocalRoot', () => {
  it('defaults to <repoRoot>/var/artifacts when unset or blank', () => {
    expect(resolveArtifactLocalRoot({})).toBe(resolve(repoRoot, 'var/artifacts'))
    expect(resolveArtifactLocalRoot({ ARTIFACT_LOCAL_ROOT: '' })).toBe(resolve(repoRoot, 'var/artifacts'))
    expect(resolveArtifactLocalRoot({ ARTIFACT_LOCAL_ROOT: '   ' })).toBe(resolve(repoRoot, 'var/artifacts'))
  })

  it('passes an absolute path through verbatim', () => {
    expect(resolveArtifactLocalRoot({ ARTIFACT_LOCAL_ROOT: '/var/some/abs' })).toBe('/var/some/abs')
    expect(resolveArtifactLocalRoot({ ARTIFACT_LOCAL_ROOT: '/Users/x/bailian-studio/var/artifacts' })).toBe('/Users/x/bailian-studio/var/artifacts')
  })

  it('trims whitespace from the configured value', () => {
    expect(resolveArtifactLocalRoot({ ARTIFACT_LOCAL_ROOT: '  /var/abs  ' })).toBe('/var/abs')
  })

  it('resolves a relative value against the repo root, NOT the cwd', () => {
    // Under `turbo run test` the package cwd is `packages/storage`, so a
    // cwd-based resolve would land at packages/storage/var/test-artifacts.
    // Anchoring to repoRoot is what makes the worker (writer) and API (reader)
    // agree on the same physical directory.
    expect(resolveArtifactLocalRoot({ ARTIFACT_LOCAL_ROOT: 'var/test-artifacts' })).toBe(resolve(repoRoot, 'var/test-artifacts'))
  })

  it('always returns an absolute path', () => {
    for (const env of [{}, { ARTIFACT_LOCAL_ROOT: 'relative/dir' }, { ARTIFACT_LOCAL_ROOT: '/abs' }]) {
      expect(isAbsolute(resolveArtifactLocalRoot(env))).toBe(true)
    }
  })

  it('is independent of process.cwd()', async () => {
    const a = await makeTmp()
    const b = await makeTmp()
    const original = process.cwd()
    try {
      const baseline = resolveArtifactLocalRoot({ ARTIFACT_LOCAL_ROOT: 'var/x' })
      process.chdir(a)
      const fromA = resolveArtifactLocalRoot({ ARTIFACT_LOCAL_ROOT: 'var/x' })
      process.chdir(b)
      const fromB = resolveArtifactLocalRoot({ ARTIFACT_LOCAL_ROOT: 'var/x' })
      expect(fromA).toBe(baseline)
      expect(fromB).toBe(baseline)
    } finally {
      process.chdir(original)
    }
  })

  it('confines a Windows-style value to the repo root on a posix host (the reported bug shape)', () => {
    const value = process.platform === 'win32'
      ? join(repoRoot, 'var', 'artifacts')
      : 'G:\\bailian-studio\\var\\artifacts'
    // Documents the detection that drives the non-fatal warning: win32-absolute
    // but NOT posix-absolute, so on macOS/Linux it would otherwise be treated
    // as a relative path fragment.
    expect(win32.isAbsolute(value)).toBe(true)
    expect(posix.isAbsolute(value)).toBe(false)

    const resolved = resolveArtifactLocalRoot({ ARTIFACT_LOCAL_ROOT: value })
    expect(isAbsolute(resolved)).toBe(true)
    expect(resolved.startsWith(repoRoot)).toBe(true)
    // Deterministic across calls (worker and API see the same value).
    expect(resolveArtifactLocalRoot({ ARTIFACT_LOCAL_ROOT: value })).toBe(resolved)
  })
})

describe('findRepoRoot', () => {
  it('walks up to the nearest ancestor containing turbo.json', () => {
    const root = findRepoRoot(here, p => p === join(repoRoot, 'turbo.json'))
    expect(root).toBe(repoRoot)
  })

  it('falls back to startDir when no sentinel is found and never throws', () => {
    const start = dirname(here)
    expect(findRepoRoot(start, () => false)).toBe(start)
  })

  it('does not memoize an injected exists (keeps tests deterministic)', () => {
    let calls = 0
    const counting = () => { calls++; return false }
    findRepoRoot(here, counting)
    findRepoRoot(here, counting)
    // Each call walks the full ancestor chain because the injected path is uncached.
    expect(calls).toBeGreaterThan(1)
  })
})

describe('looksLikeForeignAbsolute', () => {
  it('flags win32-absolute paths seen on a posix host', () => {
    expect(looksLikeForeignAbsolute('G:\\bailian-studio\\var\\artifacts', 'darwin')).toBe(true)
    expect(looksLikeForeignAbsolute('C:/x', 'linux')).toBe(true)
    expect(looksLikeForeignAbsolute('\\\\server\\share\\x', 'darwin')).toBe(true)
  })

  it('does not flag posix-native paths on a posix host', () => {
    expect(looksLikeForeignAbsolute('/Users/x/y', 'darwin')).toBe(false)
    expect(looksLikeForeignAbsolute('var/artifacts', 'linux')).toBe(false)
  })

  it('does not flag paths on win32 (win32 accepts both / and \\ as absolute)', () => {
    expect(looksLikeForeignAbsolute('/Users/x/y', 'win32')).toBe(false)
    expect(looksLikeForeignAbsolute('C:\\x', 'win32')).toBe(false)
  })

  it('handles empty / undefined input', () => {
    expect(looksLikeForeignAbsolute(undefined, 'darwin')).toBe(false)
    expect(looksLikeForeignAbsolute('', 'darwin')).toBe(false)
    expect(looksLikeForeignAbsolute('   ', 'darwin')).toBe(false)
  })
})
