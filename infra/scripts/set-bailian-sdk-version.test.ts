import { describe, expect, test } from 'vitest'

import {
  assertExactSdkVersion,
  replaceCatalogVersion,
} from './set-bailian-sdk-version'

describe('set Bailian SDK version', () => {
  test('accepts exact stable and prerelease semver only', () => {
    expect(assertExactSdkVersion('2.0.0')).toBe('2.0.0')
    expect(assertExactSdkVersion('2.0.0-beta.4')).toBe('2.0.0-beta.4')
    expect(() => assertExactSdkVersion('latest')).toThrow('exact semver')
    expect(() => assertExactSdkVersion('^2.0.0')).toThrow('exact semver')
  })

  test('changes only the root catalog entry', () => {
    const source = `${JSON.stringify({
      workspaces: { catalog: { '@puzzle-fuzzy/bailian-sdk': '2.0.0-beta.3' } },
      note: '2.0.0-beta.3',
    }, null, 2)}\n`
    const updated = replaceCatalogVersion(source, '2.0.0-beta.4')
    expect(JSON.parse(updated).workspaces.catalog['@puzzle-fuzzy/bailian-sdk']).toBe('2.0.0-beta.4')
    expect(JSON.parse(updated).note).toBe('2.0.0-beta.3')
  })
})
