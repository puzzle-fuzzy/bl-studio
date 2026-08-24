/**
 * 为 data/fixtures/model-costs.json 中列出的模型播种 model_costs 默认成本单价。
 *
 * 只插入缺失行（on conflict do nothing）——管理员在 admin「分析」页调整过的
 * 成本不会在重复运行/部署时被覆盖。成本为整数分 CNY（DashScope 官方价）。
 * 未列出的模型默认成本为 0，可在 admin「分析 → 维护模型成本」里补充。
 *
 * 用法：DATABASE_URL=<url> tsx scripts/db/seed-model-costs.ts
 *（或 pnpm run db:seed:model-costs）
 */
import postgres from 'postgres'
import seedCosts from '../../data/fixtures/model-costs.json'

const databaseUrl = process.env['DATABASE_URL']?.trim()
if (databaseUrl === undefined || databaseUrl.length === 0) {
  throw new Error('DATABASE_URL is required for model costs seeding')
}

// JSON 含 `_comment` 说明键，与 `Record<string, number>` 不兼容，经 unknown 中转；
// 下方循环按 `_` 前缀跳过说明键，只处理模型成本数字。
const defaults = seedCosts as unknown as Record<string, number>

const sql = postgres(databaseUrl, { max: 1 })
try {
  let inserted = 0
  for (const [modelId, unitCostCents] of Object.entries(defaults)) {
    if (modelId.startsWith('_')) continue // 跳过注释键
    const result = await sql`
      insert into model_costs (model_id, unit_cost_cents, currency, updated_by, updated_at, created_at)
      values (${modelId}, ${unitCostCents}, 'CNY', 'seed-model-costs', now(), now())
      on conflict (model_id) do nothing
    `
    inserted += result.count
  }
  console.log(`Seeded ${inserted} model cost rows.`)
} finally {
  await sql.end({ timeout: 5 })
}
