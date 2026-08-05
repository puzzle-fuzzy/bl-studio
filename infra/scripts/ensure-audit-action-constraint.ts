/**
 * 让通过 `drizzle-kit push` 创建的本地/测试数据库与已入库的 audit action 约束保持一致。
 * Drizzle push 目前不会检测该 CHECK 约束的变更；生产环境使用已入库的迁移。
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
        'auth.github',
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
        'points.adjustment',
        'admin.user.create',
        'admin.user.update',
        'admin.user.delete'
      ))
    `)
  })
  console.log('Audit action constraint is current.')
} finally {
  await sql.end({ timeout: 5 })
}
