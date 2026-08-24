import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../packages/db/drizzle/0044_legacy_password_auth_compat.sql', import.meta.url),
  'utf8',
)

describe('legacy password-auth migration', () => {
  it('does not re-enable password login for every GitHub-linked row', () => {
    expect(migration).toContain('AND "password_auth_enabled" = false')
    expect(migration).toContain('"email_verified_at" > "created_at"')
    expect(migration).toContain('"updated_by" IN (\'auth.github\', \'auth.password-change\')')
    expect(migration).toContain("'migration:legacy-password-auth'")
  })
})
