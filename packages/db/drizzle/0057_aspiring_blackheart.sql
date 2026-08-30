CREATE TABLE "director_entity_candidates" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source_run_id" text,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"traits_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'provisional' NOT NULL,
	"mentions_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "director_entity_candidates_kind_check" CHECK ("director_entity_candidates"."kind" in ('character', 'scene', 'prop')),
	CONSTRAINT "director_entity_candidates_status_check" CHECK ("director_entity_candidates"."status" in ('provisional', 'accepted', 'rejected'))
);
--> statement-breakpoint
ALTER TABLE "director_entity_candidates" ADD CONSTRAINT "director_entity_candidates_project_id_director_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."director_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "director_entity_candidates" ADD CONSTRAINT "director_entity_candidates_source_run_id_director_phase_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."director_phase_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "director_entity_candidates_project_kind_idx" ON "director_entity_candidates" USING btree ("project_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "director_entity_candidates_project_status_idx" ON "director_entity_candidates" USING btree ("project_id","status");