CREATE TABLE "core"."project_progress_snapshots" (
	"project_id" uuid NOT NULL,
	"taken_on" date NOT NULL,
	"progress_pct" smallint NOT NULL,
	CONSTRAINT "project_progress_snapshots_project_id_taken_on_pk" PRIMARY KEY("project_id","taken_on")
);
--> statement-breakpoint
CREATE TABLE "core"."role_permissions" (
	"role" text NOT NULL,
	"module_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_role_module_id_key_pk" PRIMARY KEY("role","module_id","key")
);
--> statement-breakpoint
ALTER TABLE "core"."schedule_tasks" ADD COLUMN "started_on" date;--> statement-breakpoint
ALTER TABLE "core"."schedule_tasks" ADD COLUMN "finished_on" date;--> statement-breakpoint
ALTER TABLE "core"."schedule_tasks" ADD COLUMN "workflow_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."project_progress_snapshots" ADD CONSTRAINT "project_progress_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."role_permissions" ADD CONSTRAINT "role_permissions_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "core"."staff"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."schedule_tasks" ADD CONSTRAINT "schedule_tasks_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "core"."workflows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_contacts_name_folded_trgm" ON "core"."contacts" USING gin (translate(lower(coalesce("name", '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc') gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_drive_files_file_name_folded_trgm" ON "core"."drive_files" USING gin (translate(lower(coalesce("file_name", '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc') gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_projects_name_folded_trgm" ON "core"."projects" USING gin (translate(lower(coalesce("name", '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc') gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_projects_code_folded_trgm" ON "core"."projects" USING gin (translate(lower(coalesce("code", '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc') gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_tasks_title_folded_trgm" ON "core"."tasks" USING gin (translate(lower(coalesce("title", '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc') gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_schedule_tasks_workflow_id" ON "core"."schedule_tasks" USING btree ("workflow_id");