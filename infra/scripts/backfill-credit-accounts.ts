/**
 * Idempotently creates the zero-balance credit account required by every user.
 *
 * Registration already creates this row transactionally. This command covers
 * users created before the credit ledger migration and is safe to run after
 * every schema push. It does not manufacture grants or alter existing ledger
 * balances.
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
