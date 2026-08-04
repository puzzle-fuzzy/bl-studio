CREATE TABLE "usage_records" (
	"id" text PRIMARY KEY NOT NULL,
	"generation_id" text NOT NULL,
	"user_id" text NOT NULL,
	"model_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_model" text NOT NULL,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"estimated_cost_cents" integer NOT NULL,
	"final_cost_cents" integer,
	"provider_request_id" text,
	"settled_at" timestamp with time zone,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_generation_id_generation_records_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usage_records" ADD CONSTRAINT "usage_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_records_generation_idx" ON "usage_records" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "usage_records_user_created_idx" ON "usage_records" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_records_status_created_idx" ON "usage_records" USING btree ("status","created_at");--> statement-breakpoint

-- Backfill one usage row for every existing generation. This is intentionally
-- generation-level: historical provider poll calls cannot be reconstructed, so
-- no synthetic provider_request_audits rows are created and no cost is multiplied.
INSERT INTO "usage_records" (
  "id",
  "generation_id",
  "user_id",
  "model_id",
  "provider",
  "provider_model",
  "category",
  "status",
  "estimated_cost_cents",
  "final_cost_cents",
  "provider_request_id",
  "settled_at",
  "created_by",
  "updated_by",
  "created_at",
  "updated_at"
)
SELECT
  'usage_legacy_' || generation.id,
  generation.id,
  generation.user_id,
  generation.model_id,
  generation.provider,
  generation.provider_model,
  generation.category,
  CASE
    WHEN generation.status = 'succeeded' AND generation.cost_final IS NOT NULL THEN 'settled'
    WHEN generation.status = 'failed' THEN 'failed'
    WHEN generation.status = 'cancelled' THEN 'cancelled'
    ELSE 'reserved'
  END,
  generation.cost_estimate,
  generation.cost_final,
  generation.request_id,
  CASE
    WHEN generation.status = 'succeeded' AND generation.cost_final IS NOT NULL THEN generation.updated_at
    ELSE NULL
  END,
  'migration:0014',
  'migration:0014',
  generation.created_at,
  generation.updated_at
FROM "generation_records" AS generation
ON CONFLICT ("generation_id") DO NOTHING;
