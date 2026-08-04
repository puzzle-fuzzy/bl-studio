import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const packageJsonPath = join(root, 'package.json')
const packageName = '@puzzle-fuzzy/bailian-sdk'
const exactSemver = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

export function assertExactSdkVersion(value: string): string {
  if (!exactSemver.test(value)) {
    throw new TypeError(`Bailian SDK version must be an exact semver, received ${value}`)
  }
  return value
}

function versionOption(): string {
  const index = globalThis.process.argv.indexOf('--version')
  const value = index < 0 ? globalThis.process.env.BAILIAN_SDK_VERSION : globalThis.process.argv[index + 1]
  if (value === undefined || value.startsWith('--')) {
    throw new TypeError('pass --version or set BAILIAN_SDK_VERSION')
  }
  return assertExactSdkVersion(value)
}

export function replaceCatalogVersion(source: string, version: string): string {
  const parsed = JSON.parse(source) as {
    workspaces?: { catalog?: Record<string, unknown> }
  }
  const current = parsed.workspaces?.catalog?.[packageName]
  if (typeof current !== 'string' || !exactSemver.test(current)) {
    throw new TypeError(`${packageName} must already be pinned to one exact semver in workspaces.catalog`)
  }
  const marker = `${JSON.stringify(packageName)}: ${JSON.stringify(current)}`
  const replacement = `${JSON.stringify(packageName)}: ${JSON.stringify(version)}`
  const first = source.indexOf(marker)
  if (first < 0 || source.indexOf(marker, first + marker.length) >= 0) {
    throw new Error(`could not identify the unique ${packageName} catalog entry`)
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + marker.length)}`
}

if (import.meta.main) {
  const version = versionOption()
  const source = await readFile(packageJsonPath, 'utf8')
  const updated = replaceCatalogVersion(source, version)
  if (updated !== source) await writeFile(packageJsonPath, updated, 'utf8')
  console.log(`${packageName} catalog pin: ${version}`)
}
