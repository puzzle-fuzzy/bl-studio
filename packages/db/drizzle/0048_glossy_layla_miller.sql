ALTER TABLE "director_assets" ADD COLUMN "stale_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "director_assets" ADD COLUMN "stale_reason" text;--> statement-breakpoint
ALTER TABLE "director_characters" ADD COLUMN "stale_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "director_characters" ADD COLUMN "stale_reason" text;--> statement-breakpoint
ALTER TABLE "director_locations" ADD COLUMN "stale_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "director_locations" ADD COLUMN "stale_reason" text;--> statement-breakpoint
ALTER TABLE "director_phase_runs" ADD COLUMN "stale_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "director_phase_runs" ADD COLUMN "stale_reason" text;--> statement-breakpoint
ALTER TABLE "director_shots" ADD COLUMN "stale_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "director_shots" ADD COLUMN "stale_reason" text;