CREATE TABLE "user_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"file_name" text,
	"original_url" text,
	"mime_type" text,
	"byte_size" integer,
	"storage_provider" text,
	"storage_key" text,
	"storage_url" text,
	"metadata_json" jsonb,
	"status" text DEFAULT 'ready' NOT NULL,
	"error_json" jsonb,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_assets" ADD CONSTRAINT "user_assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_assets_user_created_idx" ON "user_assets" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_assets_kind_idx" ON "user_assets" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "user_assets_source_idx" ON "user_assets" USING btree ("source");