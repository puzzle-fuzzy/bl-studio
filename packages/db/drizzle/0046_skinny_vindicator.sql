CREATE TABLE "director_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source_run_id" text,
	"kind" text NOT NULL,
	"owner_type" text,
	"owner_id" text,
	"asset_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "director_assets_kind_check" CHECK ("director_assets"."kind" in ('uploaded_reference', 'character_reference', 'location_reference', 'storyboard_frame', 'shot_video', 'music', 'final_video'))
);
--> statement-breakpoint
CREATE TABLE "director_characters" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source_run_id" text,
	"name" text NOT NULL,
	"role" text,
	"description" text NOT NULL,
	"traits_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reference_asset_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "director_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source_run_id" text,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"atmosphere" text,
	"reference_asset_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "director_phase_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"phase" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"version" integer NOT NULL,
	"input_snapshot_json" jsonb NOT NULL,
	"output_summary_json" jsonb,
	"error_json" jsonb,
	"task_id" text,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "director_phase_runs_status_check" CHECK ("director_phase_runs"."status" in ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
	CONSTRAINT "director_phase_runs_version_check" CHECK ("director_phase_runs"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "director_phase_states" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"phase" text NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"active_run_id" text,
	"last_error_json" jsonb,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "director_phase_states_status_check" CHECK ("director_phase_states"."status" in ('not_started', 'ready', 'running', 'needs_review', 'failed', 'completed', 'cancelled')),
	CONSTRAINT "director_phase_states_version_check" CHECK ("director_phase_states"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "director_projects" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"story_text" text NOT NULL,
	"synopsis" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"settings_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "director_projects_status_check" CHECK ("director_projects"."status" in ('draft', 'active', 'completed', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "director_shots" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"source_run_id" text,
	"sequence" integer NOT NULL,
	"scene_number" integer,
	"slugline" text,
	"narrative" text NOT NULL,
	"camera_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"duration_seconds" integer,
	"environment_prompt" text,
	"video_prompt" text,
	"negative_prompt" text,
	"dialogue_json" jsonb,
	"reference_asset_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"continuity_json" jsonb,
	"status" text DEFAULT 'not_started' NOT NULL,
	"active_video_asset_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"error_json" jsonb,
	"created_by" text DEFAULT 'system' NOT NULL,
	"updated_by" text DEFAULT 'system' NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "director_shots_status_check" CHECK ("director_shots"."status" in ('not_started', 'needs_review', 'ready', 'generating', 'succeeded', 'failed', 'locked')),
	CONSTRAINT "director_shots_sequence_check" CHECK ("director_shots"."sequence" > 0)
);
--> statement-breakpoint
ALTER TABLE "director_assets" ADD CONSTRAINT "director_assets_project_id_director_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."director_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "director_assets" ADD CONSTRAINT "director_assets_source_run_id_director_phase_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."director_phase_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "director_characters" ADD CONSTRAINT "director_characters_project_id_director_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."director_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "director_characters" ADD CONSTRAINT "director_characters_source_run_id_director_phase_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."director_phase_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "director_locations" ADD CONSTRAINT "director_locations_project_id_director_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."director_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "director_locations" ADD CONSTRAINT "director_locations_source_run_id_director_phase_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."director_phase_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "director_phase_runs" ADD CONSTRAINT "director_phase_runs_project_id_director_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."director_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "director_phase_states" ADD CONSTRAINT "director_phase_states_project_id_director_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."director_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "director_projects" ADD CONSTRAINT "director_projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "director_shots" ADD CONSTRAINT "director_shots_project_id_director_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."director_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "director_shots" ADD CONSTRAINT "director_shots_source_run_id_director_phase_runs_id_fk" FOREIGN KEY ("source_run_id") REFERENCES "public"."director_phase_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "director_assets_project_kind_idx" ON "director_assets" USING btree ("project_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "director_assets_owner_idx" ON "director_assets" USING btree ("project_id","owner_type","owner_id");--> statement-breakpoint
CREATE INDEX "director_characters_project_idx" ON "director_characters" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "director_characters_project_locked_idx" ON "director_characters" USING btree ("project_id","locked");--> statement-breakpoint
CREATE INDEX "director_locations_project_idx" ON "director_locations" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "director_locations_project_locked_idx" ON "director_locations" USING btree ("project_id","locked");--> statement-breakpoint
CREATE UNIQUE INDEX "director_phase_runs_active_idx" ON "director_phase_runs" USING btree ("project_id","phase") WHERE "director_phase_runs"."status" in ('pending', 'running');--> statement-breakpoint
CREATE INDEX "director_phase_runs_project_phase_created_idx" ON "director_phase_runs" USING btree ("project_id","phase","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "director_phase_states_project_phase_idx" ON "director_phase_states" USING btree ("project_id","phase");--> statement-breakpoint
CREATE INDEX "director_phase_states_project_status_idx" ON "director_phase_states" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "director_projects_user_created_idx" ON "director_projects" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "director_projects_user_updated_idx" ON "director_projects" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "director_shots_project_sequence_idx" ON "director_shots" USING btree ("project_id","sequence");--> statement-breakpoint
CREATE INDEX "director_shots_project_status_idx" ON "director_shots" USING btree ("project_id","status");