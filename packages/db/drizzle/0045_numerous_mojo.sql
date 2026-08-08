CREATE TABLE "content_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"generation_id" text NOT NULL,
	"reporter_id" text NOT NULL,
	"reason" text NOT NULL,
	"details" text,
	"status" text DEFAULT 'open' NOT NULL,
	"resolved_by" text,
	"resolution_note" text,
	"resolved_at" timestamp with time zone,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "content_reports_reason_check" CHECK ("content_reports"."reason" in ('unsafe', 'copyright', 'privacy', 'spam', 'other')),
	CONSTRAINT "content_reports_status_check" CHECK ("content_reports"."status" in ('open', 'reviewing', 'resolved', 'dismissed'))
);
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_action_check";--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_generation_id_generation_records_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_reporter_id_users_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_reports" ADD CONSTRAINT "content_reports_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "content_reports_reporter_generation_idx" ON "content_reports" USING btree ("reporter_id","generation_id") WHERE "content_reports"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "content_reports_status_created_idx" ON "content_reports" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "content_reports_generation_created_idx" ON "content_reports" USING btree ("generation_id","created_at");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_action_check" CHECK ("audit_logs"."action" in ('auth.register', 'auth.verify-email', 'auth.resend-verification', 'auth.login', 'auth.github', 'auth.forgot-password', 'auth.reset-password', 'auth.change-password', 'auth.logout', 'auth.logout-all', 'auth.profile.update', 'auth.avatar.update', 'auth.avatar.remove', 'generation.create', 'generation.cancel', 'generation.retry', 'generation.hide', 'generation.delete', 'generation.restore', 'artifact.read', 'asset.upload', 'asset.import', 'asset.delete', 'share.create', 'share.revoke', 'points.grant', 'points.adjustment', 'admin.user.create', 'admin.user.update', 'admin.user.delete', 'admin.user.ban', 'admin.user.unban', 'gallery.like', 'gallery.favorite', 'gallery.visibility-change', 'admin.gallery.hide', 'admin.gallery.unhide', 'feedback.submit', 'feedback.update', 'prompt-library.create', 'prompt-library.delete', 'content.report.submit', 'admin.content-report.update'));