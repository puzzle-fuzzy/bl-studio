CREATE TABLE "director_script_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"version" integer NOT NULL,
	"story_text" text NOT NULL,
	"synopsis" text,
	"created_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "director_script_versions_version_check" CHECK ("director_script_versions"."version" > 0)
);
--> statement-breakpoint
INSERT INTO "director_script_versions" ("id", "project_id", "version", "story_text", "synopsis", "created_by", "created_at", "updated_at")
SELECT 'director-script-v1-' || "id", "id", 1, "story_text", "synopsis", "updated_by", "created_at", "updated_at"
FROM "director_projects"
ON CONFLICT ("project_id", "version") DO NOTHING;--> statement-breakpoint
ALTER TABLE "director_phase_runs" ADD COLUMN "script_version_id" text;--> statement-breakpoint
UPDATE "director_phase_runs" AS runs
SET "script_version_id" = versions."id"
FROM "director_script_versions" AS versions
WHERE versions."project_id" = runs."project_id" AND versions."version" = 1;--> statement-breakpoint
ALTER TABLE "director_phase_runs" ALTER COLUMN "script_version_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "director_script_versions" ADD CONSTRAINT "director_script_versions_project_id_director_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."director_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "director_script_versions_project_version_idx" ON "director_script_versions" USING btree ("project_id","version");--> statement-breakpoint
CREATE INDEX "director_script_versions_project_created_idx" ON "director_script_versions" USING btree ("project_id","created_at");--> statement-breakpoint
ALTER TABLE "director_phase_runs" ADD CONSTRAINT "director_phase_runs_script_version_id_director_script_versions_id_fk" FOREIGN KEY ("script_version_id") REFERENCES "public"."director_script_versions"("id") ON DELETE no action ON UPDATE no action;
