-- P1-42: 一次性数据修正收敛进迁移链（此前挂在 db:push 链上，每次 push 重跑；
-- 其中 generated-assets 的 URL 清空是破坏性 UPDATE，反复执行会抹掉应用后续写入的值）。
-- 这些语句全部幂等（on conflict do nothing / WHERE 守卫 / 唯一索引），migrate 环境
-- 只执行一次。push 环境不再背这些脚本——本地开发/测试库按需手动跑 infra/scripts 对应
-- backfill（db:backfill:credits 等仍保留）。usage_records 的 backfill 已在 0014 收敛，
-- 本迁移不再重复。
--> statement-breakpoint
-- 1) generated-assets：源 URL 与访问 URL 可能过期，仅保留稳定的 storage provider/key。
UPDATE "user_assets" SET
  "original_url" = NULL,
  "storage_url" = NULL,
  "updated_by" = 'migration:generated-assets',
  "updated_at" = now()
WHERE "source" = 'generation'
  AND ("original_url" IS NOT NULL OR "storage_url" IS NOT NULL)
--> statement-breakpoint
-- 2) generated-assets：把 generation artifact 投影进统一用户资产表（含 'stored' 状态
--   与 'archive' 种类——0027 只覆盖 succeeded 的四种 kind）。幂等（id 冲突即跳过）。
INSERT INTO "user_assets" (
  "id", "user_id", "kind", "source", "generation_artifact_id", "record_id",
  "model_id", "original_url", "mime_type", "byte_size", "storage_provider",
  "storage_key", "storage_url", "status", "created_by", "updated_by",
  "created_at", "updated_at"
)
SELECT
  'asset_generation_' || artifact."id",
  artifact."user_id",
  artifact."kind",
  'generation',
  artifact."id",
  artifact."record_id",
  generation."model_id",
  NULL,
  artifact."mime_type",
  artifact."byte_size",
  artifact."storage_provider",
  artifact."storage_key",
  NULL,
  'ready',
  'migration:generated-assets',
  'migration:generated-assets',
  artifact."created_at",
  artifact."updated_at"
FROM "generation_artifacts" AS artifact
INNER JOIN "generation_records" AS generation
  ON generation."id" = artifact."record_id"
WHERE artifact."status" IN ('stored', 'succeeded')
  AND artifact."deleted_at" IS NULL
  AND artifact."kind" IN ('image', 'video', 'audio', 'text', 'archive')
  AND artifact."storage_provider" IS NOT NULL
  AND artifact."storage_key" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "user_assets" AS existing_asset
    WHERE existing_asset."generation_artifact_id" = artifact."id"
  )
ON CONFLICT ("id") DO NOTHING
--> statement-breakpoint
-- 3) media-derived-assets：修正 derived source 分类出现之前创建的媒体处理输出资产。
UPDATE "user_assets" SET
  "source" = 'derived',
  "updated_by" = 'migration:media-derived-assets',
  "updated_at" = now()
WHERE "source" = 'upload'
  AND "metadata_json" ->> 'mediaJobId' IS NOT NULL
--> statement-breakpoint
-- 4) credit-accounts：为 credit ledger 迁移之前创建的用户补零余额账户（不发放额度）。
INSERT INTO "credit_accounts" (
  "id", "user_id", "available_cents", "reserved_cents", "created_at", "updated_at"
)
SELECT
  'credit_account_backfill_' || users."id",
  users."id",
  0,
  0,
  now(),
  now()
FROM "users"
LEFT JOIN "credit_accounts" ON "credit_accounts"."user_id" = users."id"
WHERE "credit_accounts"."user_id" IS NULL
ON CONFLICT ("user_id") DO NOTHING
--> statement-breakpoint
-- 5) asset-thumbnails：为历史本地存储 / HTTPS 链接的图片视频资源排队生成缩略图。
INSERT INTO "asset_derivatives" (
  "id", "asset_id", "user_id", "kind", "status", "created_by", "updated_by",
  "created_at", "updated_at"
)
SELECT
  'asset_derivative_thumbnail_' || md5(asset."id"),
  asset."id",
  asset."user_id",
  'thumbnail',
  'queued',
  'migration:asset-thumbnails',
  'migration:asset-thumbnails',
  now(),
  now()
FROM "user_assets" AS asset
WHERE asset."kind" IN ('image', 'video')
  AND asset."status" = 'ready'
  AND asset."deleted_at" IS NULL
  AND (
    (asset."storage_provider" = 'local' AND asset."storage_key" IS NOT NULL)
    OR (asset."storage_provider" IS NULL AND asset."original_url" ~* '^https://')
  )
  AND NOT EXISTS (
    SELECT 1 FROM "asset_derivatives" AS existing
    WHERE existing."asset_id" = asset."id"
      AND existing."kind" = 'thumbnail'
      AND existing."deleted_at" IS NULL
  )
ON CONFLICT DO NOTHING
--> statement-breakpoint
-- 6) asset-thumbnails：把缩略图衍生物排进 task_records（media.thumbnail，priority -5）。
INSERT INTO "task_records" (
  "id", "type", "domain", "status", "priority", "input_json", "attempts",
  "max_attempts", "next_run_at", "record_id", "user_id", "created_by", "updated_by",
  "created_at", "updated_at"
)
SELECT
  'task_asset_thumbnail_' || md5(derivative."id"),
  'media.thumbnail',
  'media',
  'queued',
  -5,
  jsonb_build_object('assetId', derivative."asset_id", 'derivativeId', derivative."id"),
  0,
  3,
  now(),
  derivative."id",
  derivative."user_id",
  'migration:asset-thumbnails',
  'migration:asset-thumbnails',
  now(),
  now()
FROM "asset_derivatives" AS derivative
INNER JOIN "user_assets" AS asset ON asset."id" = derivative."asset_id"
WHERE derivative."kind" = 'thumbnail'
  AND derivative."status" = 'queued'
  AND derivative."deleted_at" IS NULL
  AND asset."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "task_records" AS existing_task
    WHERE existing_task."type" = 'media.thumbnail'
      AND existing_task."record_id" = derivative."id"
      AND existing_task."deleted_at" IS NULL
  )
ON CONFLICT ("id") DO NOTHING
