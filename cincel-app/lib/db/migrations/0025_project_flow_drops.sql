-- Project flow, release B (BE §4.3): drop the legacy fase text columns and the áreas tables.
-- Destructive: rollback is a restore of the backup taken before deploying release B (ADR 0003).
--   1. Re-snapshot the report rows of 0024 steps 5d, 6 and 12 so anything written between
--      releases is kept. ON CONFLICT DO NOTHING on project_flow_migration_report_uq makes them
--      idempotent against the rows 0024 already wrote.
--   2. workflow_task_templates.phase_id becomes NOT NULL.
--   3. Drop tasks.phase, workflow_task_templates.phase, projects.phase, projects.phases.
--   4. Drop area_workflows, area_members, areas, then workspace_group_mappings.area_id.
--   5. Drop core.flow_name_key.
-- The history_entity enum keeps 'area' so old history rows stay readable.
-- ===== Step 1. Re-snapshot report rows =====
-- 0024 step 5d: tasks with fase text and no fase.
INSERT INTO "core"."project_flow_migration_report" ("kind", "entity", "entity_id", "value", "detail")
SELECT
  'task_phase_unmatched',
  'task',
  t."id",
  t."phase",
  jsonb_build_object('projectId', t."project_id", 'workflowKey', w."key")
FROM "core"."tasks" t
LEFT JOIN "core"."workflows" w ON w."id" = t."workflow_id"
WHERE t."phase_id" IS NULL AND btrim(coalesce(t."phase", '')) <> ''
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- 0024 step 6: projects.phases.
INSERT INTO "core"."project_flow_migration_report" ("kind", "entity", "entity_id", "value", "detail")
SELECT
  'project_phases',
  'project',
  p."id",
  array_to_string(p."phases", ' · '),
  jsonb_build_object('name', p."name", 'phases', to_jsonb(p."phases"))
FROM "core"."projects" p
WHERE cardinality(p."phases") > 0
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- 0024 step 12: áreas, their members and their tramos.
INSERT INTO "core"."project_flow_migration_report" ("kind", "entity", "entity_id", "value", "detail")
SELECT
  'area',
  'area',
  a."id",
  a."name",
  jsonb_build_object(
    'name', a."name",
    'leadId', a."lead_id",
    'colorSlot', a."color_slot",
    'members', (SELECT count(*) FROM "core"."area_members" m WHERE m."area_id" = a."id")
  )
FROM "core"."areas" a
WHERE a."deleted_at" IS NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "core"."project_flow_migration_report" ("kind", "entity", "entity_id", "value", "detail")
SELECT
  'area_member',
  'area_member',
  m."area_id",
  m."staff_id"::text,
  jsonb_build_object('staffId', m."staff_id", 'areaName', a."name", 'role', m."role", 'source', m."source")
FROM "core"."area_members" m
JOIN "core"."areas" a ON a."id" = m."area_id" AND a."deleted_at" IS NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "core"."project_flow_migration_report" ("kind", "entity", "entity_id", "value", "detail")
SELECT
  'area_workflow',
  'area_workflow',
  aw."area_id",
  aw."workflow_id"::text,
  jsonb_build_object('areaName', a."name", 'workflowId', aw."workflow_id", 'workflowKey', w."key", 'workflowName', w."name")
FROM "core"."area_workflows" aw
JOIN "core"."areas" a ON a."id" = aw."area_id" AND a."deleted_at" IS NULL
LEFT JOIN "core"."workflows" w ON w."id" = aw."workflow_id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- ===== Step 2. Every template has a fase (0024 step 4; release A requires one on write) =====
ALTER TABLE "core"."workflow_task_templates" ALTER COLUMN "phase_id" SET NOT NULL;
--> statement-breakpoint
-- ===== Step 3. Legacy fase text columns =====
ALTER TABLE "core"."tasks" DROP COLUMN IF EXISTS "phase";
--> statement-breakpoint
ALTER TABLE "core"."workflow_task_templates" DROP COLUMN IF EXISTS "phase";
--> statement-breakpoint
ALTER TABLE "core"."projects" DROP COLUMN IF EXISTS "phase";
--> statement-breakpoint
ALTER TABLE "core"."projects" DROP COLUMN IF EXISTS "phases";
--> statement-breakpoint
-- ===== Step 4. Áreas =====
DROP TABLE IF EXISTS "core"."area_workflows";
--> statement-breakpoint
DROP TABLE IF EXISTS "core"."area_members";
--> statement-breakpoint
ALTER TABLE "core"."workspace_group_mappings" DROP CONSTRAINT IF EXISTS "workspace_group_mappings_area_id_areas_id_fk";
--> statement-breakpoint
DROP TABLE IF EXISTS "core"."areas";
--> statement-breakpoint
ALTER TABLE "core"."workspace_group_mappings" DROP COLUMN IF EXISTS "area_id";
--> statement-breakpoint
-- ===== Step 5. Backfill helper =====
DROP FUNCTION IF EXISTS "core"."flow_name_key"(text);
