CREATE TABLE "generation_records" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"model_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_model" text NOT NULL,
	"category" text NOT NULL,
	"input_params_json" jsonb NOT NULL,
	"status" text NOT NULL,
	"status_reason" text,
	"provider_task_id" text,
	"provider_status" text,
	"output_result_json" jsonb,
	"error_json" jsonb,
	"cost_estimate" integer NOT NULL,
	"cost_final" integer,
	"parent_record_id" text,
	"idempotency_key" text,
	"cancel_requested_at" timestamp with time zone,
	"provider_cancel_status" text NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_records" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"domain" text NOT NULL,
	"status" text NOT NULL,
	"priority" integer NOT NULL,
	"input_json" jsonb NOT NULL,
	"output_json" jsonb,
	"locked_by" text,
	"locked_until" timestamp with time zone,
	"attempts" integer NOT NULL,
	"max_attempts" integer NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"error_json" jsonb,
	"record_id" text,
	"user_id" text,
	"trace_id" text,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_records" ADD CONSTRAINT "generation_records_parent_record_id_generation_records_id_fk" FOREIGN KEY ("parent_record_id") REFERENCES "public"."generation_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_records_user_created_idx" ON "generation_records" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_records_user_idempotency_key_idx" ON "generation_records" USING btree ("user_id","idempotency_key") WHERE "generation_records"."idempotency_key" is not null;--> statement-breakpoint
CREATE INDEX "generation_records_status_updated_idx" ON "generation_records" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "generation_records_parent_record_idx" ON "generation_records" USING btree ("parent_record_id");--> statement-breakpoint
CREATE INDEX "task_records_queue_idx" ON "task_records" USING btree ("status","next_run_at","priority","created_at");--> statement-breakpoint
CREATE INDEX "task_records_lock_idx" ON "task_records" USING btree ("locked_by","locked_until");--> statement-breakpoint
CREATE INDEX "task_records_record_idx" ON "task_records" USING btree ("record_id");