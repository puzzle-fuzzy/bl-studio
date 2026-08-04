ALTER TABLE "usage_records" RENAME COLUMN "final_cost_cents" TO "provider_cost_cents";--> statement-breakpoint
ALTER TABLE "usage_records" ADD COLUMN "charged_cost_cents" integer;--> statement-breakpoint
UPDATE "usage_records"
SET "charged_cost_cents" = CASE
  WHEN "status" = 'settled' AND "provider_cost_cents" IS NOT NULL
    THEN LEAST("provider_cost_cents", "estimated_cost_cents")
  WHEN "status" IN ('failed', 'cancelled') THEN 0
  ELSE NULL
END
WHERE "charged_cost_cents" IS NULL;--> statement-breakpoint
