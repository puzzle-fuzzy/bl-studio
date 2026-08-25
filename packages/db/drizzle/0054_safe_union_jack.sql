CREATE TABLE "creative_project_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "creative_project_assets_sort_order_check" CHECK ("creative_project_assets"."sort_order" >= 0)
);
--> statement-breakpoint
ALTER TABLE "creative_asset_packs" RENAME TO "creative_projects";--> statement-breakpoint
/* Preserve the old optional pack membership while converting the model to a reusable
   project-to-asset relation. The generated id is deterministic for this one-to-one
   legacy membership and makes the migration recoverable without dropping organization data. */
INSERT INTO "creative_project_assets" (
	"id", "project_id", "asset_id", "sort_order", "created_by", "updated_by",
	"deleted_at", "deleted_by", "created_at", "updated_at"
)
SELECT
	'legacy-project-asset:' || a."pack_id" || ':' || a."id",
	a."pack_id",
	a."id",
	0,
	a."created_by",
	a."updated_by",
	CASE
		WHEN a."deleted_at" IS NOT NULL OR p."deleted_at" IS NOT NULL
		THEN COALESCE(a."deleted_at", p."deleted_at")
		ELSE NULL
	END,
	COALESCE(a."deleted_by", p."deleted_by"),
	a."created_at",
	a."updated_at"
FROM "creative_assets" a
INNER JOIN "creative_projects" p ON p."id" = a."pack_id"
WHERE a."pack_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "creative_projects" DROP CONSTRAINT "creative_asset_packs_status_check";--> statement-breakpoint
ALTER TABLE "creative_projects" DROP CONSTRAINT "creative_asset_packs_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "creative_assets" DROP CONSTRAINT "creative_assets_pack_id_creative_asset_packs_id_fk";
--> statement-breakpoint
DROP INDEX "creative_asset_packs_user_created_idx";--> statement-breakpoint
DROP INDEX "creative_asset_packs_user_updated_idx";--> statement-breakpoint
DROP INDEX "creative_assets_pack_created_idx";--> statement-breakpoint
ALTER TABLE "creative_project_assets" ADD CONSTRAINT "creative_project_assets_project_id_creative_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."creative_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_project_assets" ADD CONSTRAINT "creative_project_assets_asset_id_creative_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."creative_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creative_project_assets_project_asset_idx" ON "creative_project_assets" USING btree ("project_id","asset_id") WHERE "creative_project_assets"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "creative_project_assets_project_order_idx" ON "creative_project_assets" USING btree ("project_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "creative_project_assets_asset_idx" ON "creative_project_assets" USING btree ("asset_id");--> statement-breakpoint
ALTER TABLE "creative_projects" ADD CONSTRAINT "creative_projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creative_projects_user_created_idx" ON "creative_projects" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "creative_projects_user_updated_idx" ON "creative_projects" USING btree ("user_id","updated_at");--> statement-breakpoint
ALTER TABLE "creative_assets" DROP COLUMN "pack_id";--> statement-breakpoint
ALTER TABLE "creative_projects" ADD CONSTRAINT "creative_projects_status_check" CHECK ("creative_projects"."status" in ('draft', 'active', 'archived'));
