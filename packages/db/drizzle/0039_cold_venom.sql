DROP INDEX "generation_records_user_created_idx";--> statement-breakpoint
CREATE INDEX "user_assets_user_title_idx" ON "user_assets" USING btree ("user_id",lower(coalesce("file_name", "model_id", "id")));--> statement-breakpoint
CREATE INDEX "user_assets_user_size_idx" ON "user_assets" USING btree ("user_id","byte_size" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "generation_records_user_created_idx" ON "generation_records" USING btree ("user_id","created_at","id");