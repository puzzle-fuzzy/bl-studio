/**
 * One-shot operator command for promoting an existing account.
 *
 * This intentionally lives outside the public API. It requires an explicit
 * --confirm flag so a mistyped selector cannot silently change privileges.
 * The operation is idempotent: promoting an existing admin succeeds again.
 *
 * Examples:
 *   DATABASE_URL=... pnpm exec tsx infra/scripts/promote-admin.ts --email=owner@example.com --confirm
 *   DATABASE_URL=... pnpm exec tsx infra/scripts/promote-admin.ts --user-id=user_123 --confirm
 */
import postgres from 'postgres'

export interface PromoteAdminSelector {
  userId?: string
  email?: string
  confirmed: boolean
}

export function parsePromoteAdminArgs(args: readonly string[]): PromoteAdminSelector {
  let userId: string | undefined
  let email: string | undefined
  let confirmed = false

  for (const arg of args) {
    if (arg === '--confirm') {
      confirmed = true
    } else if (arg.startsWith('--user-id=')) {
      userId = arg.slice('--user-id='.length).trim()
    } else if (arg.startsWith('--email=')) {
      email = arg.slice('--email='.length).trim()
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  if (!confirmed) throw new Error('Refusing admin promotion without --confirm')
  if ((userId === undefined) === (email === undefined)) {
    throw new Error('Provide exactly one selector: --user-id=<id> or --email=<email>')
  }
  if (userId !== undefined && userId.length === 0) throw new Error('--user-id cannot be empty')
  if (email !== undefined && email.length === 0) throw new Error('--email cannot be empty')
  return { ...(userId !== undefined ? { userId } : {}), ...(email !== undefined ? { email } : {}), confirmed }
}

if (import.meta.main) {
  const selector = parsePromoteAdminArgs(process.argv.slice(2))
  const databaseUrl = process.env['DATABASE_URL']?.trim()
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error('DATABASE_URL is required for admin promotion')
  }

  const sql = postgres(databaseUrl, { max: 1 })
  try {
    let rows: Array<{ id: string; email: string; role: string }>
    if (selector.userId !== undefined) {
      rows = await sql<{ id: string; email: string; role: string }[]>`
        update users
        set role = 'admin', updated_at = now()
        where id = ${selector.userId}
        returning id, email, role
      `
    } else {
      const email = selector.email
      if (email === undefined) throw new Error('Email selector is required')
      rows = await sql<{ id: string; email: string; role: string }[]>`
        update users
        set role = 'admin', updated_at = now()
        where email = ${email}
        returning id, email, role
      `
    }

    const user = rows[0]
    if (user === undefined) throw new Error('No matching user found; no privileges changed')
    console.log(`Admin role confirmed for ${user.email} (${user.id}).`)
  } finally {
    await sql.end({ timeout: 5 })
  }
}
