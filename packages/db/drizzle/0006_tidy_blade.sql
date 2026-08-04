CREATE TABLE "transfer_rooms" (
	"id" text PRIMARY KEY NOT NULL,
	"creator_user_id" text NOT NULL,
	"peer_user_id" text,
	"status" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "transfer_rooms" ADD CONSTRAINT "transfer_rooms_creator_user_id_users_id_fk" FOREIGN KEY ("creator_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfer_rooms" ADD CONSTRAINT "transfer_rooms_peer_user_id_users_id_fk" FOREIGN KEY ("peer_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transfer_rooms_creator_created_idx" ON "transfer_rooms" USING btree ("creator_user_id","created_at");--> statement-breakpoint
CREATE INDEX "transfer_rooms_peer_idx" ON "transfer_rooms" USING btree ("peer_user_id");--> statement-breakpoint
CREATE INDEX "transfer_rooms_status_expires_idx" ON "transfer_rooms" USING btree ("status","expires_at");