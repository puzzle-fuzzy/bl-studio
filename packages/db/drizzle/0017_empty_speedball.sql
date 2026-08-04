DROP INDEX "generation_shares_record_idx";--> statement-breakpoint
ALTER TABLE "generation_shares" ADD COLUMN "include_params" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_shares" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_shares" ADD COLUMN "revoked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "generation_shares" ADD COLUMN "revoked_by" text;--> statement-breakpoint
CREATE INDEX "generation_shares_revoked_expires_idx" ON "generation_shares" USING btree ("revoked_at","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_shares_record_idx" ON "generation_shares" USING btree ("record_id") WHERE "generation_shares"."deleted_at" is null and "generation_shares"."revoked_at" is null;