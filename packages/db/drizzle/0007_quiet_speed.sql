-- Drop FK constraint on peer_user_id
ALTER TABLE "transfer_rooms" DROP CONSTRAINT IF EXISTS "transfer_rooms_peer_user_id_users_id_fk";
--> statement-breakpoint
-- Add join_code column (nullable first for backfill safety)
ALTER TABLE "transfer_rooms" ADD COLUMN "join_code" text;
--> statement-breakpoint
-- Backfill existing rows with random 6-digit codes
UPDATE "transfer_rooms" SET "join_code" = lpad(floor(random() * 1000000)::text, 6, '0') WHERE "join_code" IS NULL;
--> statement-breakpoint
-- Set NOT NULL after backfill
ALTER TABLE "transfer_rooms" ALTER COLUMN "join_code" SET NOT NULL;
--> statement-breakpoint
-- Add unique constraint
ALTER TABLE "transfer_rooms" ADD CONSTRAINT "transfer_rooms_join_code_unique" UNIQUE("join_code");