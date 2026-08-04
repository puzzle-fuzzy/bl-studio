CREATE TABLE "media_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"operation" text NOT NULL,
	"status" text NOT NULL,
	"source_asset_id" text,
	"source_kind" text NOT NULL,
	"output_asset_id" text,
	"input_json" jsonb NOT NULL,
	"output_json" jsonb,
	"error_json" jsonb,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "media_jobs" ADD CONSTRAINT "media_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_jobs_user_created_idx" ON "media_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "media_jobs_status_updated_idx" ON "media_jobs" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "media_jobs_source_asset_idx" ON "media_jobs" USING btree ("source_asset_id");