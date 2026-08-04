/**
 * Keeps local/test databases created with `drizzle-kit push` aligned with the
 * checked-in audit action constraint. Drizzle push currently does not detect
 * changes to this CHECK constraint; production uses checked-in migrations.
 */
import postgres from 'postgres'

const databaseUrl = process.env['DATABASE_URL']?.trim()
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required for audit action constraint sync')
}

const sql = postgres(databaseUrl, { max: 1 })
try {
  await sql.begin(async transaction => {
    await transaction`alter table audit_logs drop constraint if exists audit_logs_action_check`
    await transaction.unsafe(`
      alter table audit_logs
      add constraint audit_logs_action_check
      check (action in (
        'auth.register',
        'auth.verify-email',
        'auth.resend-verification',
        'auth.login',
        'auth.forgot-password',
        'auth.reset-password',
        'auth.change-password',
        'auth.logout',
        'auth.logout-all',
        'generation.create',
        'generation.cancel',
        'generation.retry',
        'generation.hide',
        'generation.delete',
        'generation.restore',
        'artifact.read',
        'asset.upload',
        'asset.import',
        'asset.delete',
        'share.create',
        'share.revoke',
        'points.grant',
        'points.adjustment'
      ))
    `)
  })
  console.log('Audit action constraint is current.')
} finally {
  await sql.end({ timeout: 5 })
}
