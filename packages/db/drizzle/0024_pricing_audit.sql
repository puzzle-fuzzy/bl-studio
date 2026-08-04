ALTER TABLE "generation_records" ADD COLUMN "currency" text DEFAULT 'CNY' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_records" ADD COLUMN "pricing_version" text DEFAULT 'legacy-unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_records" ADD COLUMN "model_manifest_hash" text DEFAULT 'legacy-unknown' NOT NULL;--> statement-breakpoint
