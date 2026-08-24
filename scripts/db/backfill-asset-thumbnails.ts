/**
 * 幂等地为历史本地存储及 HTTPS 链接的图片/视频资源排队生成已持久化的缩略图。
 * OSS 托管的资源继续使用服务端处理，对其做 backfill 只会重复产生存储与 worker 成本。
 */
import postgres from 'postgres'

export async function backfillAssetThumbnails(databaseUrl: string): Promise<number> {
  const sql = postgres(databaseUrl, { max: 1 })
  try {
    return await sql.begin(async transaction => {
      await transaction`
        insert into asset_derivatives (
          id,
          asset_id,
          user_id,
          kind,
          status,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        select
          'asset_derivative_thumbnail_' || md5(asset.id),
          asset.id,
          asset.user_id,
          'thumbnail',
          'queued',
          'migration:asset-thumbnails',
          'migration:asset-thumbnails',
          now(),
          now()
        from user_assets as asset
        where asset.kind in ('image', 'video')
          and asset.status = 'ready'
          and asset.deleted_at is null
          and (
            (asset.storage_provider = 'local' and asset.storage_key is not null)
            or (
              asset.storage_provider is null
              and asset.original_url ~* '^https://'
            )
          )
          and not exists (
            select 1
            from asset_derivatives as existing
            where existing.asset_id = asset.id
              and existing.kind = 'thumbnail'
              and existing.deleted_at is null
          )
        on conflict do nothing
      `

      const result = await transaction`
        insert into task_records (
          id,
          type,
          domain,
          status,
          priority,
          input_json,
          attempts,
          max_attempts,
          next_run_at,
          record_id,
          user_id,
          created_by,
          updated_by,
          created_at,
          updated_at
        )
        select
          'task_asset_thumbnail_' || md5(derivative.id),
          'media.thumbnail',
          'media',
          'queued',
          -5,
          jsonb_build_object(
            'assetId', derivative.asset_id,
            'derivativeId', derivative.id
          ),
          0,
          3,
          now(),
          derivative.id,
          derivative.user_id,
          'migration:asset-thumbnails',
          'migration:asset-thumbnails',
          now(),
          now()
        from asset_derivatives as derivative
        inner join user_assets as asset on asset.id = derivative.asset_id
        where derivative.kind = 'thumbnail'
          and derivative.status = 'queued'
          and derivative.deleted_at is null
          and asset.deleted_at is null
          and not exists (
            select 1
            from task_records as existing_task
            where existing_task.type = 'media.thumbnail'
              and existing_task.record_id = derivative.id
              and existing_task.deleted_at is null
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
    throw new Error('DATABASE_URL is required for asset-thumbnail backfill')
  }
  const count = await backfillAssetThumbnails(databaseUrl)
  console.log(`Asset-thumbnail backfill queued ${count} task(s).`)
}
