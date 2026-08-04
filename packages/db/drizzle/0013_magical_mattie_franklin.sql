CREATE TABLE "provider_request_audits" (
	"id" text PRIMARY KEY NOT NULL,
	"generation_id" text NOT NULL,
	"task_id" text,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_model" text NOT NULL,
	"operation" text NOT NULL,
	"status" text NOT NULL,
	"provider_task_id" text,
	"provider_request_id" text,
	"attempt" integer NOT NULL,
	"estimated_cost_cents" integer NOT NULL,
	"billed_cost_cents" integer,
	"error_json" jsonb,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"latency_ms" integer,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "provider_request_audits" ADD CONSTRAINT "provider_request_audits_generation_id_generation_records_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_request_audits" ADD CONSTRAINT "provider_request_audits_task_id_task_records_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_request_audits" ADD CONSTRAINT "provider_request_audits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "provider_request_audits_generation_started_idx" ON "provider_request_audits" USING btree ("generation_id","started_at");--> statement-breakpoint
CREATE INDEX "provider_request_audits_task_idx" ON "provider_request_audits" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "provider_request_audits_request_idx" ON "provider_request_audits" USING btree ("provider_request_id");--> statement-breakpoint
CREATE INDEX "provider_request_audits_status_started_idx" ON "provider_request_audits" USING btree ("status","started_at");