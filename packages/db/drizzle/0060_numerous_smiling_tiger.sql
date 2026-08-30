CREATE TABLE "audit_event_outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata_json" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"claimed_by" text,
	"claimed_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"last_error" text,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "audit_event_outbox_outcome_check" CHECK ("audit_event_outbox"."outcome" in ('succeeded', 'failed')),
	CONSTRAINT "audit_event_outbox_status_check" CHECK ("audit_event_outbox"."status" in ('pending', 'processing', 'succeeded', 'failed')),
	CONSTRAINT "audit_event_outbox_attempts_check" CHECK ("audit_event_outbox"."attempts" >= 0)
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "outbox_event_id" text;--> statement-breakpoint
ALTER TABLE "audit_event_outbox" ADD CONSTRAINT "audit_event_outbox_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_event_outbox_status_available_idx" ON "audit_event_outbox" USING btree ("status","available_at","created_at");--> statement-breakpoint
CREATE INDEX "audit_event_outbox_target_idx" ON "audit_event_outbox" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_logs_outbox_event_idx" ON "audit_logs" USING btree ("outbox_event_id") WHERE "audit_logs"."outbox_event_id" is not null;