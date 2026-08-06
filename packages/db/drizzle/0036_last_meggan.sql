CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"actor_id" text,
	"record_id" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notifications_kind_check" CHECK ("notifications"."kind" in ('like', 'favorite', 'system'))
);
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_action_check";--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_record_id_generation_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."generation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_action_check" CHECK ("audit_logs"."action" in ('auth.register', 'auth.verify-email', 'auth.resend-verification', 'auth.login', 'auth.github', 'auth.forgot-password', 'auth.reset-password', 'auth.change-password', 'auth.logout', 'auth.logout-all', 'generation.create', 'generation.cancel', 'generation.retry', 'generation.hide', 'generation.delete', 'generation.restore', 'artifact.read', 'asset.upload', 'asset.import', 'asset.delete', 'share.create', 'share.revoke', 'points.grant', 'points.adjustment', 'admin.user.create', 'admin.user.update', 'admin.user.delete', 'admin.user.ban', 'admin.user.unban', 'gallery.like', 'gallery.favorite', 'gallery.visibility-change', 'admin.gallery.hide', 'admin.gallery.unhide', 'feedback.submit', 'feedback.update', 'prompt-library.create', 'prompt-library.delete'));