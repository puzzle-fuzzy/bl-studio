DROP INDEX "generation_input_assets_parameter_idx";--> statement-breakpoint
ALTER TABLE "generation_input_assets" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_input_assets_parameter_idx" ON "generation_input_assets" USING btree ("generation_id","parameter_name","position");