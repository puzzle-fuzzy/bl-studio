DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'creative_asset_references'::regclass
      AND conname = 'creative_asset_references_version_id_key'
  ) THEN
    DROP INDEX IF EXISTS "creative_asset_references_version_id_idx";
    ALTER TABLE "creative_asset_references"
      ADD CONSTRAINT "creative_asset_references_version_id_key"
      UNIQUE("asset_version_id", "id");
  END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'creative_generation_context_assets'::regclass
      AND conname = 'creative_generation_context_assets_id_version_key'
  ) THEN
    DROP INDEX IF EXISTS "creative_generation_context_assets_id_version_idx";
    ALTER TABLE "creative_generation_context_assets"
      ADD CONSTRAINT "creative_generation_context_assets_id_version_key"
      UNIQUE("id", "asset_version_id");
  END IF;
END $$;
