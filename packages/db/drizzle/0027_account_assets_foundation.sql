CREATE TABLE "auth_action_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "auth_action_tokens_purpose_check" CHECK ("auth_action_tokens"."purpose" in ('email_verification', 'password_reset'))
);
--> statement-breakpoint
CREATE TABLE "generation_input_assets" (
	"generation_id" text NOT NULL,
	"parameter_name" text NOT NULL,
	"asset_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_assets" ADD COLUMN "generation_artifact_id" text;--> statement-breakpoint
ALTER TABLE "user_assets" ADD COLUMN "record_id" text;--> statement-breakpoint
ALTER TABLE "user_assets" ADD COLUMN "model_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified_at" timestamp with time zone;--> statement-breakpoint
UPDATE "users"
SET "email_verified_at" = COALESCE("email_verified_at", "created_at")
WHERE "deleted_at" IS NULL;--> statement-breakpoint
ALTER TABLE "auth_action_tokens" ADD CONSTRAINT "auth_action_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_input_assets" ADD CONSTRAINT "generation_input_assets_generation_id_generation_records_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_input_assets" ADD CONSTRAINT "generation_input_assets_asset_id_user_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."user_assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_action_tokens_hash_idx" ON "auth_action_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_action_tokens_user_purpose_idx" ON "auth_action_tokens" USING btree ("user_id","purpose","created_at");--> statement-breakpoint
CREATE INDEX "auth_action_tokens_expiry_idx" ON "auth_action_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_input_assets_parameter_idx" ON "generation_input_assets" USING btree ("generation_id","parameter_name");--> statement-breakpoint
CREATE INDEX "generation_input_assets_asset_idx" ON "generation_input_assets" USING btree ("asset_id");--> statement-breakpoint
ALTER TABLE "user_assets" ADD CONSTRAINT "user_assets_generation_artifact_id_generation_artifacts_id_fk" FOREIGN KEY ("generation_artifact_id") REFERENCES "public"."generation_artifacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_assets" ADD CONSTRAINT "user_assets_record_id_generation_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."generation_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_assets_record_idx" ON "user_assets" USING btree ("record_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_assets_generation_artifact_idx" ON "user_assets" USING btree ("generation_artifact_id") WHERE "user_assets"."generation_artifact_id" is not null and "user_assets"."deleted_at" is null;--> statement-breakpoint
INSERT INTO "user_assets" (
	"id",
	"user_id",
	"kind",
	"source",
	"generation_artifact_id",
	"record_id",
	"model_id",
	"original_url",
	"mime_type",
	"byte_size",
	"storage_provider",
	"storage_key",
	"storage_url",
	"status",
	"created_by",
	"updated_by",
	"created_at",
	"updated_at"
)
SELECT
	'asset_generation_' || artifact."id",
	artifact."user_id",
	artifact."kind",
	'generation',
	artifact."id",
	artifact."record_id",
	generation."model_id",
	artifact."source_url",
	artifact."mime_type",
	artifact."byte_size",
	artifact."storage_provider",
	artifact."storage_key",
	artifact."storage_url",
	'ready',
	'migration:generated-assets',
	'migration:generated-assets',
	artifact."created_at",
	artifact."updated_at"
FROM "generation_artifacts" AS artifact
INNER JOIN "generation_records" AS generation
	ON generation."id" = artifact."record_id"
WHERE artifact."status" = 'succeeded'
	AND artifact."deleted_at" IS NULL
	AND artifact."kind" IN ('image', 'video', 'audio', 'text')
ON CONFLICT DO NOTHING;
