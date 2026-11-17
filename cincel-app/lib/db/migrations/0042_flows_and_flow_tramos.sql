CREATE TABLE "core"."flow_tramos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"flow_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"after_workflow_id" uuid,
	"gate_phase_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flow_tramos_flow_workflow_uq" UNIQUE("flow_id","workflow_id")
);
--> statement-breakpoint
CREATE TABLE "core"."flows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "flows_key_uq" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "core"."projects" ADD COLUMN "flow_id" uuid;--> statement-breakpoint
ALTER TABLE "core"."flow_tramos" ADD CONSTRAINT "flow_tramos_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "core"."flows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."flow_tramos" ADD CONSTRAINT "flow_tramos_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "core"."workflows"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core"."flow_tramos" ADD CONSTRAINT "flow_tramos_after_workflow_id_workflows_id_fk" FOREIGN KEY ("after_workflow_id") REFERENCES "core"."workflows"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_flow_tramos_flow_order" ON "core"."flow_tramos" USING btree ("flow_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_flow_tramos_workflow_id" ON "core"."flow_tramos" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "idx_flow_tramos_after_workflow_id" ON "core"."flow_tramos" USING btree ("after_workflow_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flows_single_default_uq" ON "core"."flows" USING btree ("is_default") WHERE "core"."flows"."is_default";--> statement-breakpoint
ALTER TABLE "core"."projects" ADD CONSTRAINT "projects_flow_id_flows_id_fk" FOREIGN KEY ("flow_id") REFERENCES "core"."flows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_projects_flow_id" ON "core"."projects" USING btree ("flow_id");--> statement-breakpoint
-- Seed the default flow from today's READINESS (lib/project-flow/catalog.ts). Safe to re-run.
INSERT INTO "core"."flows" ("key", "name", "is_default")
VALUES ('default', 'Flujo estándar', true)
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "core"."flow_tramos" ("flow_id", "workflow_id", "sort_order", "after_workflow_id", "gate_phase_key")
SELECT f."id", w."id", w."sort_order", aw."id", r."phase_key"
FROM "core"."flows" f
JOIN "core"."workflows" w ON w."active" AND w."deleted_at" IS NULL
LEFT JOIN (VALUES ('diseno', 'presale', 'cobro'), ('construccion', 'diseno', 'ejecutivo'))
  AS r ("key", "after_key", "phase_key") ON r."key" = w."key"
LEFT JOIN "core"."workflows" aw ON aw."key" = r."after_key" AND aw."deleted_at" IS NULL
WHERE f."key" = 'default'
ON CONFLICT ("flow_id", "workflow_id") DO NOTHING;--> statement-breakpoint
UPDATE "core"."projects"
SET "flow_id" = (SELECT "id" FROM "core"."flows" WHERE "key" = 'default')
WHERE "flow_id" IS NULL
  AND EXISTS (SELECT 1 FROM "core"."flows" WHERE "key" = 'default');
