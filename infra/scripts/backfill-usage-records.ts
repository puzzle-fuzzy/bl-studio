/**
 * Idempotently backfill the generation-level usage ledger.
 *
 * `drizzle-kit push` synchronizes schema but does not execute checked-in SQL
 * migration data statements, so local dev/test workflows call this explicitly
 * after push. Production migrations already contain the same INSERT; the
 * generation_id unique index makes running this script again harmless.
 */
import postgres from 'postgres'

const databaseUrl = process.env['DATABASE_URL']?.trim()
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required for usage ledger backfill')
}

const sql = postgres(databaseUrl, { max: 1 })
try {
  const result = await sql`
    insert into usage_records (
      id,
      generation_id,
      user_id,
      model_id,
      provider,
      provider_model,
      category,
      status,
      estimated_cost_cents,
      provider_cost_cents,
      charged_cost_cents,
      provider_request_id,
      settled_at,
      created_by,
      updated_by,
      created_at,
      updated_at
    )
    select
      'usage_legacy_' || generation.id,
      generation.id,
      generation.user_id,
      generation.model_id,
      generation.provider,
      generation.provider_model,
      generation.category,
      case
        when generation.status = 'succeeded' and generation.cost_final is not null then 'settled'
        when generation.status = 'failed' then 'failed'
        when generation.status = 'cancelled' then 'cancelled'
        else 'reserved'
      end,
      generation.cost_estimate,
      generation.cost_final,
      case
        when generation.status = 'succeeded' and generation.cost_final is not null
          then least(generation.cost_final, generation.cost_estimate)
        when generation.status in ('failed', 'cancelled') then 0
        else null
      end,
      generation.request_id,
      case
        when generation.status = 'succeeded' and generation.cost_final is not null then generation.updated_at
        else null
      end,
      'migration:0014',
      'migration:0014',
      generation.created_at,
      generation.updated_at
    from generation_records as generation
    on conflict (generation_id) do nothing
  `

  console.log(`Usage ledger backfill inserted ${result.count} row(s).`)
} finally {
  await sql.end({ timeout: 5 })
}
