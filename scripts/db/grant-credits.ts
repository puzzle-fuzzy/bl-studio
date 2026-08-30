/**
 * 为所有用户批量发放积分（维护赠金）。
 *
 * 幂等：按 userId + 幂等键去重（credit_ledger_entries 有唯一索引），重复执行不会
 * 重复入账。grant 会自动为用户建积分账户（若不存在）。
 *
 * 环境变量：
 *   DATABASE_URL          必填，指向目标库（生产由容器内 deploy/env/.env.prod 注入）
 *   GRANT_AMOUNT_CENTS     每个用户发放的积分数（默认 2000）
 *   GRANT_REASON           入账原因（默认「维护赠金」）
 *   GRANT_KEY_PREFIX       幂等键前缀（默认 grant-<amount>-<日期>；改日期的前缀可再发一次）
 *
 * 生产执行（服务器上，见 docs/03-ops.md）：
 *   docker run --rm --network bailian-studio-prod_backend \
 *     --env-file /opt/bailian-studio/deploy/env/.env.prod \
 *     -e GRANT_AMOUNT_CENTS=2000 \
 *     -v /opt/bailian-studio/scripts/db/grant-credits.ts:/app/scripts/db/grant-credits.ts:ro \
 *     bailian-studio-runtime:<SHA> bun x tsx scripts/db/grant-credits.ts
 */
import postgres from 'postgres'
import { createCreditLedgerFromUrl } from '../../packages/credit-ledger/src/index'

const databaseUrl = process.env.DATABASE_URL
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required')
}

const amountCents = Number(process.env.GRANT_AMOUNT_CENTS ?? 2000)
const reason = process.env.GRANT_REASON ?? '维护赠金'
if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
  throw new Error('GRANT_AMOUNT_CENTS must be a positive integer')
}
const keyPrefix = process.env.GRANT_KEY_PREFIX ?? `grant-${amountCents}-2026-08-05`

const sql = postgres(databaseUrl)
const handle = createCreditLedgerFromUrl(databaseUrl)
try {
  // 执行人 = 账户主人（GRANT_ACTOR_EMAIL 可覆盖）；actor_user_id 是 users 的 FK，必须真实存在。
  const actorEmail = process.env.GRANT_ACTOR_EMAIL ?? process.env.SMTP_USER ?? ''
  if (actorEmail.length === 0) {
    throw new Error('缺少执行人：设置 GRANT_ACTOR_EMAIL（或 SMTP_USER）')
  }
  const actorRows = await sql<Array<{ id: string }>>`select id from users where email = ${actorEmail} limit 1`
  const actor = actorRows[0]
  if (actor === undefined) {
    throw new Error(`找不到执行人账户：${actorEmail}`)
  }
  const actorUserId = actor.id

  const rows = await sql<Array<{ id: string }>>`select id from users order by id`
  let count = 0
  for (const row of rows) {
    await handle.ledger.grant({
      userId: row.id,
      amountCents,
      reason,
      idempotencyKey: `${keyPrefix}:${row.id}`,
      actorUserId,
    })
    count += 1
  }
  console.log(`已处理 ${count} 个用户，每人 ${amountCents} 积分（执行人 ${actorEmail}；幂等键 ${keyPrefix}:<userId>，重复执行不重复入账）`)
} finally {
  await sql.end()
  await handle.close()
}
