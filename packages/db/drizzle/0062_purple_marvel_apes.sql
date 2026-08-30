CREATE TABLE "canvas_document_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"document_id" text NOT NULL,
	"user_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "canvas_document_versions_version_check" CHECK ("canvas_document_versions"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "canvas_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"current_snapshot_json" jsonb NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "canvas_documents_revision_check" CHECK ("canvas_documents"."revision" > 0)
);
--> statement-breakpoint
ALTER TABLE "canvas_document_versions" ADD CONSTRAINT "canvas_document_versions_document_id_canvas_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."canvas_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_document_versions" ADD CONSTRAINT "canvas_document_versions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_documents" ADD CONSTRAINT "canvas_documents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "canvas_document_versions_document_version_idx" ON "canvas_document_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "canvas_document_versions_document_version_desc_idx" ON "canvas_document_versions" USING btree ("document_id","version");--> statement-breakpoint
CREATE INDEX "canvas_document_versions_user_created_idx" ON "canvas_document_versions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "canvas_documents_user_updated_idx" ON "canvas_documents" USING btree ("user_id","updated_at","id");