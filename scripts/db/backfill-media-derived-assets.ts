/**
 * 幂等地修正 derived source 分类出现之前创建的媒体处理输出资产。
 * `media_jobs` 保存源资产 ID，输出资产的 metadata 保存媒体任务 ID，
 * 因此该 backfill 可安全重复执行，无需从文件名或 URL 推断血缘关系。
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
