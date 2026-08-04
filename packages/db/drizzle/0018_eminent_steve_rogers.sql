CREATE TABLE "audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"outcome" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"request_id" text,
	"trace_id" text,
	"method" text,
	"path" text,
	"metadata_json" jsonb,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_user_occurred_idx" ON "audit_logs" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_action_occurred_idx" ON "audit_logs" USING btree ("action","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_target_occurred_idx" ON "audit_logs" USING btree ("target_type","target_id","occurred_at");--> statement-breakpoint
CREATE INDEX "audit_logs_request_idx" ON "audit_logs" USING btree ("request_id");