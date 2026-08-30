/**
 * 为 LAN 验收测试创建三个已验证的、仅供开发使用的账号。
 *
 * 这是运维命令，不是公开注册的旁路。它拒绝生产模式与非 loopback 的数据库 URL，
 * 并要求 --confirm。对已存在同名保留测试地址的账号，会重置其密码并标记为已验证，
 * 这样失败的本地 SMTP 实验可以被修复，而不会留下不可用的账号。
 *
 * 运行方式：
 *   bun run seed:lan-test-accounts --confirm
 */
import { randomBytes } from 'node:crypto'
import postgres from 'postgres'
import { hashPassword } from '../../packages/auth/src/password'

export const LAN_TEST_EMAILS = [
  'lan-test-01@example.com',
  'lan-test-02@example.com',
  'lan-test-03@example.com',
] as const

export interface SeedLanTestAccountsArgs {
  confirmed: boolean
}

export function parseSeedLanTestAccountsArgs(args: readonly string[]): SeedLanTestAccountsArgs {
  let confirmed = false
  for (const arg of args) {
    if (arg === '--confirm') {
      confirmed = true
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }
  if (!confirmed) throw new Error('Refusing to seed LAN test accounts without --confirm')
  return { confirmed }
}

function assertDevelopmentDatabase(databaseUrl: string): void {
  if (process.env['NODE_ENV']?.trim().toLowerCase() === 'production') {
    throw new Error('LAN test accounts cannot be seeded in production')
  }
  let hostname: string
  try {
    hostname = new URL(databaseUrl).hostname.toLowerCase()
  } catch {
    throw new Error('DATABASE_URL must be an absolute PostgreSQL URL')
  }
  if (hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '::1') {
    throw new Error('LAN test accounts require a loopback development DATABASE_URL')
  }
}

function generatePassword(): string {
  return `MF-LAN-${randomBytes(12).toString('base64url')}`
}

async function upsertVerifiedUser(
  sql: ReturnType<typeof postgres>,
  email: string,
  displayName: string,
  password: string,
  now: Date,
): Promise<string> {
  const passwordHash = await hashPassword(password)
  return sql.begin(async tx => {
    const existing = await tx<{ id: string }[]>`
      select id
      from users
      where email = ${email} and deleted_at is null
      limit 1
    `

    const existingUserId = existing[0]?.id
    const userId = existingUserId ?? randomBytes(16).toString('hex')
    if (existingUserId === undefined) {
      await tx`
        insert into users (
          id, email, password_hash, email_verified_at, display_name, role,
          created_by, updated_by, created_at, updated_at
        ) values (
          ${userId}, ${email}, ${passwordHash}, ${now}, ${displayName}, 'user',
          'seed.lan-test-accounts', 'seed.lan-test-accounts', ${now}, ${now}
        )
      `
    } else {
      await tx`
        update users
        set password_hash = ${passwordHash},
            email_verified_at = ${now},
            display_name = ${displayName},
            updated_by = 'seed.lan-test-accounts',
            updated_at = ${now}
        where id = ${userId}
      `
    }

    await tx`
      update auth_action_tokens
      set consumed_at = coalesce(consumed_at, ${now}),
          deleted_at = coalesce(deleted_at, ${now}),
          deleted_by = coalesce(deleted_by, 'seed.lan-test-accounts'),
          updated_at = ${now},
          updated_by = 'seed.lan-test-accounts'
      where user_id = ${userId} and purpose = 'email_verification' and deleted_at is null
    `
    await tx`
      update sessions
      set deleted_at = coalesce(deleted_at, ${now}),
          deleted_by = coalesce(deleted_by, 'seed.lan-test-accounts'),
          updated_at = ${now},
          updated_by = 'seed.lan-test-accounts'
      where user_id = ${userId} and deleted_at is null
    `
    await tx`
      insert into credit_accounts (id, user_id, available_cents, reserved_cents, created_at, updated_at)
      values (${`credit_account_seed_${userId}`}, ${userId}, 0, 0, ${now}, ${now})
      on conflict (user_id) do nothing
    `
    return userId
  })
}

async function main(): Promise<void> {
  parseSeedLanTestAccountsArgs(process.argv.slice(2))
  const databaseUrl = process.env['DATABASE_URL']?.trim()
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error('DATABASE_URL is required')
  }
  assertDevelopmentDatabase(databaseUrl)

  const sql = postgres(databaseUrl, { max: 1 })
  try {
    const now = new Date()
    const credentials: Array<{ email: string; password: string; userId: string }> = []
    for (const [index, email] of LAN_TEST_EMAILS.entries()) {
      const password = generatePassword()
      const userId = await upsertVerifiedUser(sql, email, `LAN Test ${String(index + 1).padStart(2, '0')}`, password, now)
      credentials.push({ email, password, userId })
    }

    console.log('LAN test accounts ready (verified; each starts with 0 points):')
    for (const credential of credentials) {
      console.log(`${credential.email} | ${credential.password}`)
    }
    console.log('Passwords are printed once; store them in your local test notes and do not commit them.')
  } finally {
    await sql.end({ timeout: 5 })
  }
}

if (import.meta.main) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
