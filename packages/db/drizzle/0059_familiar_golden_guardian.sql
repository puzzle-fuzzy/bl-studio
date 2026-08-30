CREATE TABLE "creative_asset_collection_batch_items" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"item_index" integer NOT NULL,
	"asset_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "creative_asset_collection_batch_items_index_check" CHECK ("creative_asset_collection_batch_items"."item_index" >= 0)
);
--> statement-breakpoint
CREATE TABLE "creative_asset_collection_batches" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "creative_asset_collection_batch_items" ADD CONSTRAINT "creative_asset_collection_batch_items_batch_id_creative_asset_collection_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."creative_asset_collection_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_asset_collection_batch_items" ADD CONSTRAINT "creative_asset_collection_batch_items_asset_id_creative_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."creative_assets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creative_asset_collection_batches" ADD CONSTRAINT "creative_asset_collection_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creative_asset_collection_batch_items_batch_index_idx" ON "creative_asset_collection_batch_items" USING btree ("batch_id","item_index");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_asset_collection_batch_items_batch_asset_idx" ON "creative_asset_collection_batch_items" USING btree ("batch_id","asset_id");--> statement-breakpoint
CREATE INDEX "creative_asset_collection_batch_items_asset_idx" ON "creative_asset_collection_batch_items" USING btree ("asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "creative_asset_collection_batches_user_key_idx" ON "creative_asset_collection_batches" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "creative_asset_collection_batches_user_created_idx" ON "creative_asset_collection_batches" USING btree ("user_id","created_at");