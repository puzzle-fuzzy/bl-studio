CREATE TABLE "generation_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"record_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"source_url" text,
	"text" text,
	"mime_type" text,
	"storage_provider" text,
	"storage_key" text,
	"storage_url" text,
	"byte_size" integer,
	"status" text NOT NULL,
	"error_json" jsonb,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_artifacts" ADD CONSTRAINT "generation_artifacts_record_id_generation_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."generation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_artifacts_record_created_idx" ON "generation_artifacts" USING btree ("record_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_artifacts_user_created_idx" ON "generation_artifacts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "generation_artifacts_status_updated_idx" ON "generation_artifacts" USING btree ("status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_artifacts_record_storage_key_idx" ON "generation_artifacts" USING btree ("record_id","storage_key") WHERE "generation_artifacts"."storage_key" is not null;