/**
 * 幂等地为每个用户创建所需的零余额 credit account。
 *
 * 注册流程已在事务内创建该行。此命令用于补足 credit ledger 迁移之前创建的用户，
 * 每次 schema push 之后都可安全运行。它不会凭空发放额度，也不会改动既有 ledger 余额。
 */
import postgres from 'postgres'

const databaseUrl = process.env['DATABASE_URL']?.trim()
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required for credit account backfill')
}

const sql = postgres(databaseUrl, { max: 1 })
try {
  const result = await sql`
    insert into credit_accounts (
      id,
      user_id,
      available_cents,
      reserved_cents,
      created_at,
      updated_at
    )
    select
      'credit_account_backfill_' || users.id,
      users.id,
      0,
      0,
      now(),
      now()
    from users
    left join credit_accounts on credit_accounts.user_id = users.id
    where credit_accounts.user_id is null
    on conflict (user_id) do nothing
  `

  console.log(`Credit account backfill inserted ${result.count} row(s).`)
} finally {
  await sql.end({ timeout: 5 })
}
