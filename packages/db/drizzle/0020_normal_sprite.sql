CREATE TABLE "generation_events" (
	"id" text PRIMARY KEY NOT NULL,
	"record_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text NOT NULL,
	"model_id" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_events" ADD CONSTRAINT "generation_events_record_id_generation_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."generation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_events" ADD CONSTRAINT "generation_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "generation_events_user_created_idx" ON "generation_events" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "generation_events_created_idx" ON "generation_events" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "generation_events_record_created_idx" ON "generation_events" USING btree ("record_id","created_at");