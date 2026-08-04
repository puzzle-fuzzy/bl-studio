CREATE TABLE "asset_derivatives" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"storage_provider" text,
	"storage_key" text,
	"mime_type" text,
	"byte_size" integer,
	"metadata_json" jsonb,
	"error_json" jsonb,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "asset_derivatives_kind_check" CHECK ("asset_derivatives"."kind" in ('thumbnail')),
	CONSTRAINT "asset_derivatives_status_check" CHECK ("asset_derivatives"."status" in ('queued', 'processing', 'ready', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "asset_derivatives" ADD CONSTRAINT "asset_derivatives_asset_id_user_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."user_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "asset_derivatives" ADD CONSTRAINT "asset_derivatives_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_derivatives_asset_kind_idx" ON "asset_derivatives" USING btree ("asset_id","kind") WHERE "asset_derivatives"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "asset_derivatives_status_updated_idx" ON "asset_derivatives" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "asset_derivatives_user_created_idx" ON "asset_derivatives" USING btree ("user_id","created_at");