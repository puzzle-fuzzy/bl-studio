/**
 * 让通过 `drizzle-kit push` 创建的本地/测试数据库与已入库的 audit action 约束保持一致。
 * Drizzle push 目前不会检测该 CHECK 约束的变更；生产环境使用已入库的迁移。
 *
 * P2-30：此前每次 push 都无条件 DROP/ADD 同一约束。现在先查 pg_constraint 现值，
 * 与期望 action 集合一致则跳过（幂等 no-op），仅在不一致/缺失时重建。
 */
import postgres from 'postgres'

const databaseUrl = process.env['DATABASE_URL']?.trim()
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required for audit action constraint sync')
}

const EXPECTED_ACTIONS = [
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
  'auth.profile.update',
  'auth.avatar.update',
  'auth.avatar.remove',
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
  'admin.user.delete',
  'admin.user.ban',
  'admin.user.unban',
  'gallery.like',
  'gallery.favorite',
  'gallery.visibility-change',
  'admin.gallery.hide',
  'admin.gallery.unhide',
  'feedback.submit',
  'feedback.update',
  'prompt-library.create',
  'prompt-library.delete',
] as const

const sql = postgres(databaseUrl, { max: 1 })
try {
  // pg 会把 `action in (...)` 规范化为 `CHECK ((action = ANY (ARRAY['a'::text, 'b'::text])))`，
  // 所以单引号子串就是 action 本体，`::text` 里的 text 不带引号不会误入。
  const rows = await sql<Array<{ consrc: string }>>`
    select pg_get_constraintdef(oid) as consrc
    from pg_constraint
    where conrelid = 'audit_logs'::regclass
      and contype = 'c'
      and conname = 'audit_logs_action_check'
  `
  const current = rows[0]?.consrc

  let needRebuild = true
  if (current !== undefined) {
    const found = new Set(
      [...current.matchAll(/'([^']+)'/g)]
        .map(match => match[1]!)
        .filter(action => action.includes('.')),
    )
    const same =
      found.size === EXPECTED_ACTIONS.length && EXPECTED_ACTIONS.every(action => found.has(action))

    if (same) {
      needRebuild = false
      console.log('Audit action constraint is current (no-op).')
    } else {
      console.log('Audit action constraint differs — dropping and re-adding.')
    }
  } else {
    console.log('Audit action constraint missing — adding.')
  }

  if (needRebuild) {
    await sql.begin(async transaction => {
      await transaction`alter table audit_logs drop constraint if exists audit_logs_action_check`
      await transaction.unsafe(`
        alter table audit_logs
        add constraint audit_logs_action_check
        check (action in (${EXPECTED_ACTIONS.map(action => `'${action}'`).join(', ')}))
      `)
    })
    console.log('Audit action constraint is current.')
  }
} finally {
  await sql.end({ timeout: 5 })
}
