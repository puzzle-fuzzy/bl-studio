CREATE TABLE "creative_asset_packs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "creative_asset_packs_status_check" CHECK ("creative_asset_packs"."status" in ('draft', 'active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "creative_asset_references" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_version_id" text NOT NULL,
	"user_asset_id" text NOT NULL,
	"role" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "creative_asset_references_role_check" CHECK ("creative_asset_references"."role" in ('front', 'three_quarter', 'side', 'back', 'full_body', 'medium', 'face_closeup', 'wide', 'detail', 'isolated', 'interaction', 'mask', 'style_board', 'other')),
	CONSTRAINT "creative_asset_references_position_check" CHECK ("creative_asset_references"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "creative_asset_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"asset_id" text NOT NULL,
	"source_generation_id" text,
	"version" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"semantic_spec_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"generation_recipe_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "creative_asset_versions_version_check" CHECK ("creative_asset_versions"."version" > 0),
	CONSTRAINT "creative_asset_versions_status_check" CHECK ("creative_asset_versions"."status" in ('draft', 'generating', 'candidate', 'approved', 'archived', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "creative_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"pack_id" text,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "creative_assets_type_check" CHECK ("creative_assets"."type" in ('character', 'environment', 'prop', 'style')),
	CONSTRAINT "creative_assets_status_check" CHECK ("creative_assets"."status" in ('draft', 'active', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "creative_generation_context_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"context_id" text NOT NULL,
	"asset_version_id" text NOT NULL,
	"role" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "creative_generation_context_assets_role_check" CHECK ("creative_generation_context_assets"."role" in ('character', 'environment', 'prop', 'style')),
	CONSTRAINT "creative_generation_context_assets_position_check" CHECK ("creative_generation_context_assets"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "creative_generation_context_references" (
	"id" text PRIMARY KEY NOT NULL,
	"context_asset_id" text NOT NULL,
	"asset_version_id" text NOT NULL,
	"reference_id" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "creative_generation_context_references_position_check" CHECK ("creative_generation_context_references"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "creative_generation_contexts" (
	"id" text PRIMARY KEY NOT NULL,
	"generation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"protocol_version" integer DEFAULT 1 NOT NULL,
	"purpose" text NOT NULL,
	"fingerprint" text NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"negative_prompt" text,
	"model_id" text,
	"recipe_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"capability_snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "creative_generation_contexts_protocol_version_check" CHECK ("creative_generation_contexts"."protocol_version" > 0),
	CONSTRAINT "creative_generation_contexts_purpose_check" CHECK ("creative_generation_contexts"."purpose" in ('asset_reference_sheet', 'asset_variant', 'shot_image', 'shot_video', 'utility'))
);
--> statement-breakpoint
ALTER TABLE "creative_asset_references" ADD CONSTRAINT "creative_asset_references_version_id_key" UNIQUE ("asset_version_id","id");--> statement-breakpoint
ALTER TABLE "creative_generation_context_assets" ADD CONSTRAINT "creative_generation_context_assets_id_version_key" UNIQUE ("id","asset_version_id");--> statement-breakpoint
ALTER TABLE "creative_asset_packs" ADD CONSTRAINT "creative_asset_packs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_asset_references" ADD CONSTRAINT "creative_asset_references_asset_version_id_creative_asset_versions_id_fk" FOREIGN KEY ("asset_version_id") REFERENCES "public"."creative_asset_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_asset_references" ADD CONSTRAINT "creative_asset_references_user_asset_id_user_assets_id_fk" FOREIGN KEY ("user_asset_id") REFERENCES "public"."user_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_asset_versions" ADD CONSTRAINT "creative_asset_versions_asset_id_creative_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."creative_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_asset_versions" ADD CONSTRAINT "creative_asset_versions_source_generation_id_generation_records_id_fk" FOREIGN KEY ("source_generation_id") REFERENCES "public"."generation_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_assets" ADD CONSTRAINT "creative_assets_pack_id_creative_asset_packs_id_fk" FOREIGN KEY ("pack_id") REFERENCES "public"."creative_asset_packs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_generation_context_assets" ADD CONSTRAINT "creative_generation_context_assets_context_id_creative_generation_contexts_id_fk" FOREIGN KEY ("context_id") REFERENCES "public"."creative_generation_contexts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_generation_context_assets" ADD CONSTRAINT "creative_generation_context_assets_asset_version_id_creative_asset_versions_id_fk" FOREIGN KEY ("asset_version_id") REFERENCES "public"."creative_asset_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_generation_context_references" ADD CONSTRAINT "creative_generation_context_references_context_asset_id_creative_generation_context_assets_id_fk" FOREIGN KEY ("context_asset_id") REFERENCES "public"."creative_generation_context_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_generation_context_references" ADD CONSTRAINT "creative_generation_context_references_reference_id_creative_asset_references_id_fk" FOREIGN KEY ("reference_id") REFERENCES "public"."creative_asset_references"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_generation_context_references" ADD CONSTRAINT "creative_generation_context_references_context_asset_version_fk" FOREIGN KEY ("context_asset_id","asset_version_id") REFERENCES "public"."creative_generation_context_assets"("id","asset_version_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_generation_context_references" ADD CONSTRAINT "creative_generation_context_references_version_reference_fk" FOREIGN KEY ("asset_version_id","reference_id") REFERENCES "public"."creative_asset_references"("asset_version_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_generation_contexts" ADD CONSTRAINT "creative_generation_contexts_generation_id_generation_records_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_generation_contexts" ADD CONSTRAINT "creative_generation_contexts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creative_asset_packs_user_created_idx" ON "creative_asset_packs" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "creative_asset_packs_user_updated_idx" ON "creative_asset_packs" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_asset_references_version_role_position_idx" ON "creative_asset_references" USING btree ("asset_version_id","role","position") WHERE "creative_asset_references"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "creative_asset_references_user_asset_idx" ON "creative_asset_references" USING btree ("user_asset_id");--> statement-breakpoint
CREATE INDEX "creative_asset_references_version_role_idx" ON "creative_asset_references" USING btree ("asset_version_id","role");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_asset_versions_asset_version_idx" ON "creative_asset_versions" USING btree ("asset_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_asset_versions_asset_approved_idx" ON "creative_asset_versions" USING btree ("asset_id") WHERE "creative_asset_versions"."status" = 'approved' and "creative_asset_versions"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "creative_asset_versions_asset_status_idx" ON "creative_asset_versions" USING btree ("asset_id","status","created_at");--> statement-breakpoint
CREATE INDEX "creative_asset_versions_source_generation_idx" ON "creative_asset_versions" USING btree ("source_generation_id");--> statement-breakpoint
CREATE INDEX "creative_assets_user_type_created_idx" ON "creative_assets" USING btree ("user_id","type","created_at");--> statement-breakpoint
CREATE INDEX "creative_assets_pack_created_idx" ON "creative_assets" USING btree ("pack_id","created_at");--> statement-breakpoint
CREATE INDEX "creative_assets_user_updated_idx" ON "creative_assets" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_generation_context_assets_context_role_position_idx" ON "creative_generation_context_assets" USING btree ("context_id","role","position");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_generation_context_assets_context_version_role_idx" ON "creative_generation_context_assets" USING btree ("context_id","asset_version_id","role");--> statement-breakpoint
CREATE INDEX "creative_generation_context_assets_version_idx" ON "creative_generation_context_assets" USING btree ("asset_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_generation_context_references_asset_position_idx" ON "creative_generation_context_references" USING btree ("context_asset_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_generation_context_references_asset_reference_idx" ON "creative_generation_context_references" USING btree ("context_asset_id","reference_id");--> statement-breakpoint
CREATE INDEX "creative_generation_context_references_reference_idx" ON "creative_generation_context_references" USING btree ("reference_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_generation_contexts_generation_idx" ON "creative_generation_contexts" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "creative_generation_contexts_user_created_idx" ON "creative_generation_contexts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "creative_generation_contexts_purpose_created_idx" ON "creative_generation_contexts" USING btree ("purpose","created_at");
