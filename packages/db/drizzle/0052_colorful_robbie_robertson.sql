CREATE TABLE "director_script_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"run_id" text,
	"script_version_id" text,
	"script_version" integer,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "director_script_messages_role_check" CHECK ("director_script_messages"."role" in ('user', 'assistant'))
);
--> statement-breakpoint
ALTER TABLE "director_script_messages" ADD CONSTRAINT "director_script_messages_project_id_director_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."director_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "director_script_messages" ADD CONSTRAINT "director_script_messages_run_id_director_phase_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."director_phase_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "director_script_messages" ADD CONSTRAINT "director_script_messages_script_version_id_director_script_versions_id_fk" FOREIGN KEY ("script_version_id") REFERENCES "public"."director_script_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "director_script_messages_project_created_idx" ON "director_script_messages" USING btree ("project_id","created_at");