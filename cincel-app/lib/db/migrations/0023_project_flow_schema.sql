-- Project flow (tramos, fases, espacios, puestos): additive schema. BE §4.1.
-- drizzle-kit generate, then hand edits:
--   * task_kind ADD VALUE uses IF NOT EXISTS; checks compare kind::text and idx_tasks_kind uses kind not in ('workflow', 'usuario'),
--     because the new value can't be used before this transaction commits.
--   * Nothing here touches group_mapping_kind or workspace_group_mappings_kind_check:
--     0024 step 13 renames 'area' to 'position' and swaps the check.
--   * tasks_closed_at_check is NOT VALID; 0024 step 8 backfills closed_at and validates it.
--   * client_stats is replaced in place (drizzle-kit emitted DROP VIEW + CREATE VIEW).
--   * core.flow_name_key(text) is a helper for 0024's backfill; 0025 drops it.
ALTER TYPE "core"."task_kind" ADD VALUE IF NOT EXISTS 'admin';
--> statement-breakpoint
CREATE TYPE "core"."workflow_auto_start" AS ENUM('on_create', 'on_ready', 'manual');
--> statement-breakpoint
CREATE TABLE "core"."position_phases" (
	"position_id" uuid NOT NULL,
	"phase_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "position_phases_position_id_phase_id_pk" PRIMARY KEY("position_id","phase_id")
);
--> statement-breakpoint
CREATE TABLE "core"."positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "core"."staff_positions" (
	"staff_id" uuid NOT NULL,
	"position_id" uuid NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_positions_staff_id_position_id_pk" PRIMARY KEY("staff_id","position_id"),
	CONSTRAINT "staff_positions_source_check" CHECK ("core"."staff_positions"."source" in ('manual','workspace'))
);
--> statement-breakpoint
CREATE TABLE "core"."workflow_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"key" text,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_phases_id_workflow_uq" UNIQUE("id","workflow_id")
);
--> statement-breakpoint
CREATE TABLE "core"."project_spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_spaces_id_project_uq" UNIQUE("id","project_id")
);
--> statement-breakpoint
CREATE TABLE "core"."tramo_start_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"started_by_id" uuid,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"phase_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"assignment_mode" text NOT NULL,
	"created_count" integer DEFAULT 0 NOT NULL,
	"stage_created" boolean DEFAULT false NOT NULL,
	"previous_current_workflow_id" uuid,
	"current_changed" boolean DEFAULT false NOT NULL,
	"undone_at" timestamp with time zone,
	"undone_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tramo_start_batches_trigger_check" CHECK ("core"."tramo_start_batches"."trigger" in ('manual','on_create','on_ready')),
	CONSTRAINT "tramo_start_batches_mode_check" CHECK ("core"."tramo_start_batches"."assignment_mode" in ('self','by_phase','none'))
);
--> statement-breakpoint
CREATE TABLE "core"."project_flow_migration_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"value" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "core"."projects" ALTER COLUMN "client_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "core"."workspace_group_mappings" ADD COLUMN "position_id" uuid;
--> statement-breakpoint
ALTER TABLE "core"."workflow_task_templates" ADD COLUMN "phase_id" uuid;
--> statement-breakpoint
ALTER TABLE "core"."workflows" ADD COLUMN "auto_start" "core"."workflow_auto_start" DEFAULT 'manual' NOT NULL;
--> statement-breakpoint
ALTER TABLE "core"."project_stages" ADD COLUMN "started_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "core"."project_stages" ADD COLUMN "started_by_id" uuid;
--> statement-breakpoint
ALTER TABLE "core"."project_stages" ADD COLUMN "closed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "core"."projects" ADD COLUMN "origin" text;
--> statement-breakpoint
ALTER TABLE "core"."projects" ADD COLUMN "origin_staff_id" uuid;
--> statement-breakpoint
ALTER TABLE "core"."task_statuses" ADD COLUMN "counts_as_completed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD COLUMN "phase_id" uuid;
--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD COLUMN "space_id" uuid;
--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD COLUMN "closed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD COLUMN "system_key" text;
--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD COLUMN "start_batch_id" uuid;
--> statement-breakpoint
ALTER TABLE "core"."position_phases" ADD CONSTRAINT "position_phases_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "core"."positions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core"."position_phases" ADD CONSTRAINT "position_phases_phase_id_workflow_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "core"."workflow_phases"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core"."staff_positions" ADD CONSTRAINT "staff_positions_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "core"."staff"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core"."staff_positions" ADD CONSTRAINT "staff_positions_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "core"."positions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core"."workflow_phases" ADD CONSTRAINT "workflow_phases_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "core"."workflows"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core"."project_spaces" ADD CONSTRAINT "project_spaces_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core"."tramo_start_batches" ADD CONSTRAINT "tramo_start_batches_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core"."tramo_start_batches" ADD CONSTRAINT "tramo_start_batches_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "core"."workflows"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core"."tramo_start_batches" ADD CONSTRAINT "tramo_start_batches_started_by_id_staff_id_fk" FOREIGN KEY ("started_by_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core"."tramo_start_batches" ADD CONSTRAINT "tramo_start_batches_previous_current_workflow_id_workflows_id_fk" FOREIGN KEY ("previous_current_workflow_id") REFERENCES "core"."workflows"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core"."tramo_start_batches" ADD CONSTRAINT "tramo_start_batches_undone_by_id_staff_id_fk" FOREIGN KEY ("undone_by_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core"."workspace_group_mappings" ADD CONSTRAINT "workspace_group_mappings_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "core"."positions"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core"."workflow_task_templates" ADD CONSTRAINT "workflow_task_templates_phase_fk" FOREIGN KEY ("phase_id","workflow_id") REFERENCES "core"."workflow_phases"("id","workflow_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core"."project_stages" ADD CONSTRAINT "project_stages_started_by_id_staff_id_fk" FOREIGN KEY ("started_by_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core"."projects" ADD CONSTRAINT "projects_origin_staff_id_staff_id_fk" FOREIGN KEY ("origin_staff_id") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD CONSTRAINT "tasks_start_batch_id_tramo_start_batches_id_fk" FOREIGN KEY ("start_batch_id") REFERENCES "core"."tramo_start_batches"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD CONSTRAINT "tasks_phase_fk" FOREIGN KEY ("phase_id","workflow_id") REFERENCES "core"."workflow_phases"("id","workflow_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD CONSTRAINT "tasks_space_fk" FOREIGN KEY ("space_id","project_id") REFERENCES "core"."project_spaces"("id","project_id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "core"."task_statuses" ADD CONSTRAINT "task_statuses_counts_check" CHECK (not "core"."task_statuses"."counts_as_completed" or "core"."task_statuses"."closes");
--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD CONSTRAINT "tasks_phase_needs_workflow_check" CHECK ("core"."tasks"."phase_id" is null or "core"."tasks"."workflow_id" is not null);
--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD CONSTRAINT "tasks_closed_at_check" CHECK ("core"."tasks"."closed_at" is null or "core"."tasks"."status" = 'completado') NOT VALID;
--> statement-breakpoint
CREATE INDEX "idx_position_phases_phase_id" ON "core"."position_phases" USING btree ("phase_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "positions_name_lower_uq" ON "core"."positions" USING btree (lower("name")) WHERE "core"."positions"."deleted_at" is null;
--> statement-breakpoint
CREATE INDEX "idx_staff_positions_position_id" ON "core"."staff_positions" USING btree ("position_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_phases_name_lower_uq" ON "core"."workflow_phases" USING btree ("workflow_id",lower("name"));
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_phases_key_uq" ON "core"."workflow_phases" USING btree ("workflow_id","key") WHERE "core"."workflow_phases"."key" is not null;
--> statement-breakpoint
CREATE INDEX "idx_workflow_phases_workflow_order" ON "core"."workflow_phases" USING btree ("workflow_id","sort_order");
--> statement-breakpoint
CREATE UNIQUE INDEX "project_spaces_name_lower_uq" ON "core"."project_spaces" USING btree ("project_id",lower("name"));
--> statement-breakpoint
CREATE INDEX "idx_project_spaces_project_order" ON "core"."project_spaces" USING btree ("project_id","sort_order");
--> statement-breakpoint
CREATE INDEX "idx_tramo_start_batches_project_workflow" ON "core"."tramo_start_batches" USING btree ("project_id","workflow_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_tramo_start_batches_workflow_id" ON "core"."tramo_start_batches" USING btree ("workflow_id");
--> statement-breakpoint
CREATE INDEX "idx_tramo_start_batches_started_by_id" ON "core"."tramo_start_batches" USING btree ("started_by_id");
--> statement-breakpoint
CREATE INDEX "idx_tramo_start_batches_undone_by_id" ON "core"."tramo_start_batches" USING btree ("undone_by_id");
--> statement-breakpoint
CREATE INDEX "idx_tramo_start_batches_previous_current" ON "core"."tramo_start_batches" USING btree ("previous_current_workflow_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "project_flow_migration_report_uq" ON "core"."project_flow_migration_report" USING btree ("kind","entity",coalesce("entity_id"::text, ''),coalesce("value", ''));
--> statement-breakpoint
CREATE INDEX "idx_project_flow_migration_report_kind" ON "core"."project_flow_migration_report" USING btree ("kind");
--> statement-breakpoint
CREATE INDEX "idx_workspace_group_mappings_position_id" ON "core"."workspace_group_mappings" USING btree ("position_id");
--> statement-breakpoint
CREATE INDEX "idx_workflow_task_templates_phase_id" ON "core"."workflow_task_templates" USING btree ("phase_id");
--> statement-breakpoint
CREATE INDEX "idx_project_stages_started_by_id" ON "core"."project_stages" USING btree ("started_by_id");
--> statement-breakpoint
CREATE INDEX "idx_projects_origin_staff_id" ON "core"."projects" USING btree ("origin_staff_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_project_system_key_uq" ON "core"."tasks" USING btree ("project_id","system_key") WHERE "core"."tasks"."system_key" is not null and "core"."tasks"."deleted_at" is null;
--> statement-breakpoint
CREATE INDEX "idx_tasks_phase_id" ON "core"."tasks" USING btree ("phase_id");
--> statement-breakpoint
CREATE INDEX "idx_tasks_space_id" ON "core"."tasks" USING btree ("space_id");
--> statement-breakpoint
CREATE INDEX "idx_tasks_start_batch_id" ON "core"."tasks" USING btree ("start_batch_id");
--> statement-breakpoint
CREATE INDEX "idx_tasks_kind" ON "core"."tasks" USING btree ("kind") WHERE "core"."tasks"."kind" not in ('workflow', 'usuario') and "core"."tasks"."deleted_at" is null;
--> statement-breakpoint
ALTER TABLE "core"."tasks" DROP CONSTRAINT "tasks_kind_check";
--> statement-breakpoint
ALTER TABLE "core"."tasks" ADD CONSTRAINT "tasks_kind_check" CHECK (("core"."tasks"."kind"::text = 'workflow' and "core"."tasks"."template_id" is not null and "core"."tasks"."workflow_id" is not null) or ("core"."tasks"."kind"::text = 'usuario' and "core"."tasks"."template_id" is null) or ("core"."tasks"."kind"::text = 'admin' and "core"."tasks"."template_id" is null and "core"."tasks"."workflow_id" is null and "core"."tasks"."phase_id" is null and "core"."tasks"."space_id" is null));
--> statement-breakpoint
DROP INDEX "core"."workflow_task_templates_title_lower_uq";
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_task_templates_title_lower_uq" ON "core"."workflow_task_templates" USING btree ("workflow_id","phase_id",lower("title")) WHERE "core"."workflow_task_templates"."active" = true;
--> statement-breakpoint
CREATE OR REPLACE VIEW "core"."client_stats" AS (select "client_id", count(*)::int as "total_projects", count(*) filter (where "status" = 'activo')::int as "active_projects", min("start_date") as "first_work_date", coalesce(sum("contract_amount_mxn"), 0) as "total_contracted_mxn" from "core"."projects" where "core"."projects"."deleted_at" is null and "core"."projects"."client_id" is not null group by "core"."projects"."client_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "core"."flow_name_key"(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ select regexp_replace(translate(lower(btrim($1)), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '', 'g') $$;
