import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const packageJson = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  scripts?: Record<string, string>
}

describe('local development command contract', () => {
  it('starts only the API, worker, and three user-facing frontends by default', () => {
    const devCommand = packageJson.scripts?.dev ?? ''
    for (const packageName of [
      '@bailian-studio/api',
      '@bailian-studio/worker',
      '@bailian-studio/studio',
      '@bailian-studio/writer',
      '@bailian-studio/canvas',
    ]) {
      expect(devCommand).toContain(`--filter=${packageName}`)
    }
    expect(devCommand).not.toContain('@bailian-studio/admin')
  })

  it('keeps Admin on an explicit opt-in command', () => {
    const adminCommand = packageJson.scripts?.['dev:admin'] ?? ''
    expect(adminCommand).toContain('turbo run dev --filter=@bailian-studio/admin')
  })
})
