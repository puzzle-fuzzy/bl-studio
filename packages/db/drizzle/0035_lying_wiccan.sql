CREATE TABLE "generation_favorites" (
	"record_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_likes" (
	"record_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_costs" (
	"model_id" text PRIMARY KEY NOT NULL,
	"unit_cost_cents" integer NOT NULL,
	"currency" text DEFAULT 'CNY' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "model_costs_unit_cost_non_negative" CHECK ("model_costs"."unit_cost_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "prompt_library" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"model_id" text NOT NULL,
	"prompt" text NOT NULL,
	"params_json" jsonb NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_feedback" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "user_feedback_kind_check" CHECK ("user_feedback"."kind" in ('feedback', 'bug', 'suggestion', 'complaint')),
	CONSTRAINT "user_feedback_status_check" CHECK ("user_feedback"."status" in ('open', 'reviewing', 'resolved', 'closed'))
);
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_action_check";--> statement-breakpoint
ALTER TABLE "generation_records" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "generation_records" ADD COLUMN "batch_id" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "banned_by" text;--> statement-breakpoint
ALTER TABLE "generation_favorites" ADD CONSTRAINT "generation_favorites_record_id_generation_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."generation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_favorites" ADD CONSTRAINT "generation_favorites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_likes" ADD CONSTRAINT "generation_likes_record_id_generation_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."generation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_likes" ADD CONSTRAINT "generation_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_library" ADD CONSTRAINT "prompt_library_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_feedback" ADD CONSTRAINT "user_feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "generation_favorites_record_user_idx" ON "generation_favorites" USING btree ("record_id","user_id");--> statement-breakpoint
CREATE INDEX "generation_favorites_user_created_idx" ON "generation_favorites" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_likes_record_user_idx" ON "generation_likes" USING btree ("record_id","user_id");--> statement-breakpoint
CREATE INDEX "generation_likes_user_created_idx" ON "generation_likes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "prompt_library_user_updated_idx" ON "prompt_library" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "user_feedback_status_created_idx" ON "user_feedback" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "generation_records_public_gallery_idx" ON "generation_records" USING btree ("visibility","status","deleted_at","created_at");--> statement-breakpoint
CREATE INDEX "generation_records_batch_id_idx" ON "generation_records" USING btree ("batch_id");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_action_check" CHECK ("audit_logs"."action" in ('auth.register', 'auth.verify-email', 'auth.resend-verification', 'auth.login', 'auth.github', 'auth.forgot-password', 'auth.reset-password', 'auth.change-password', 'auth.logout', 'auth.logout-all', 'generation.create', 'generation.cancel', 'generation.retry', 'generation.hide', 'generation.delete', 'generation.restore', 'artifact.read', 'asset.upload', 'asset.import', 'asset.delete', 'share.create', 'share.revoke', 'points.grant', 'points.adjustment', 'admin.user.create', 'admin.user.update', 'admin.user.delete', 'admin.user.ban', 'admin.user.unban', 'gallery.like', 'gallery.favorite', 'feedback.submit', 'feedback.update', 'prompt-library.create', 'prompt-library.delete'));--> statement-breakpoint
ALTER TABLE "generation_records" ADD CONSTRAINT "generation_records_visibility_check" CHECK ("generation_records"."visibility" in ('private', 'public'));