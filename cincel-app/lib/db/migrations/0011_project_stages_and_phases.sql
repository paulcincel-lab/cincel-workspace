CREATE TABLE "core"."project_stages" (
	"project_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_stages_project_id_workflow_id_pk" PRIMARY KEY("project_id","workflow_id")
);
--> statement-breakpoint
ALTER TABLE "core"."projects" ADD COLUMN "phases" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."project_stages" ADD CONSTRAINT "project_stages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "core"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."project_stages" ADD CONSTRAINT "project_stages_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "core"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_project_stages_workflow_id" ON "core"."project_stages" USING btree ("workflow_id");--> statement-breakpoint
-- Backfill (#435): every project's existing single stage becomes its first entry in project_stages…
INSERT INTO "core"."project_stages" ("project_id", "workflow_id")
SELECT "id", "current_workflow_id" FROM "core"."projects" WHERE "current_workflow_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- …and its free-text phase its first phase.
UPDATE "core"."projects" SET "phases" = ARRAY[btrim("phase")] WHERE "phase" IS NOT NULL AND btrim("phase") <> '';
