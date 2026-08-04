/**
 * Idempotently corrects media-action output assets created before the derived
 * source category existed. `media_jobs` stores the source asset ID and the
 * output asset metadata stores the media job ID, so the backfill is safe to
 * repeat and does not need to infer lineage from filenames or URLs.
 */
import postgres from 'postgres'

const databaseUrl = process.env['DATABASE_URL']?.trim()
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required for media derived-asset backfill')
}

const sql = postgres(databaseUrl, { max: 1 })
try {
  const result = await sql`
    update user_assets
    set
      source = 'derived',
      updated_by = 'migration:media-derived-assets',
      updated_at = now()
    where source = 'upload'
      and metadata_json ->> 'mediaJobId' is not null
  `

  console.log(`Media derived-asset backfill updated ${result.count} row(s).`)
} finally {
  await sql.end({ timeout: 5 })
}
