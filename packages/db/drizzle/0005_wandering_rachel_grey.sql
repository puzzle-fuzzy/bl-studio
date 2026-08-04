CREATE TABLE "generation_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"record_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generation_shares" ADD CONSTRAINT "generation_shares_record_id_generation_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."generation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_shares" ADD CONSTRAINT "generation_shares_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_shares_record_idx" ON "generation_shares" USING btree ("record_id") WHERE "generation_shares"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "generation_shares_user_created_idx" ON "generation_shares" USING btree ("user_id","created_at");