/**
 * 将已持久化的 generation artifact 投影到统一的用户资产表。
 * 稳定的 artifact ID 与部分唯一索引保证可重复运行。
 * 源 URL 与访问 URL 可能过期，因此可复用资产保留稳定的 storage provider/key 标识，
 * 而非持久化 URL。
 */
import postgres from 'postgres'

export async function backfillGeneratedAssets(databaseUrl: string): Promise<number> {
  const sql = postgres(databaseUrl, { max: 1 })
  try {
    return await sql.begin(async transaction => {
      await transaction`
        update user_assets
        set
          original_url = null,
          storage_url = null,
          updated_by = 'migration:generated-assets',
          updated_at = now()
        where source = 'generation'
          and (original_url is not null or storage_url is not null)
      `

      const result = await transaction`
        insert into user_assets (
          id,
          user_id,
          kind,
          source,
          generation_artifact_id,
          record_id,
          model_id,
          original_url,
          mime_type,
          byte_size,
          storage_provider,
          storage_key,
          storage_url,
          status,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        select
          'asset_generation_' || artifact.id,
          artifact.user_id,
          artifact.kind,
          'generation',
          artifact.id,
          artifact.record_id,
          generation.model_id,
          null,
          artifact.mime_type,
          artifact.byte_size,
          artifact.storage_provider,
          artifact.storage_key,
          null,
          'ready',
          'migration:generated-assets',
          'migration:generated-assets',
          artifact.created_at,
          artifact.updated_at
        from generation_artifacts as artifact
        inner join generation_records as generation
          on generation.id = artifact.record_id
        where artifact.status in ('stored', 'succeeded')
          and artifact.deleted_at is null
          and artifact.kind in ('image', 'video', 'audio', 'text', 'archive')
          and artifact.storage_provider is not null
          and artifact.storage_key is not null
          and not exists (
            select 1
            from user_assets as existing_asset
            where existing_asset.generation_artifact_id = artifact.id
          )
        on conflict (id) do nothing
      `
      return result.count
    })
  } finally {
    await sql.end({ timeout: 5 })
  }
}

if (import.meta.main) {
  const databaseUrl = process.env['DATABASE_URL']?.trim()
  if (databaseUrl === undefined || databaseUrl.length === 0) {
    throw new Error('DATABASE_URL is required for generated-asset backfill')
  }

  const count = await backfillGeneratedAssets(databaseUrl)
  console.log(`Generated-asset backfill inserted ${count} row(s).`)
}
