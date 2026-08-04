ALTER TABLE "generation_records" ADD COLUMN "trace_id" text;--> statement-breakpoint
ALTER TABLE "task_records" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "task_records" ADD COLUMN "completed_at" timestamp with time zone;