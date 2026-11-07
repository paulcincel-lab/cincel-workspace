-- Project flow backfill (custom SQL, ordered). BE §4.2.
-- Runs unattended on deploy inside the migrator transaction: problems go to
-- core.project_flow_migration_report instead of aborting. Every step is safe to repeat.
-- Steps 1–8 (tramo rows, fase catalog, templates, template and task fases, projects.phases report,
-- statuses, tasks.closed_at) come first; steps 9–15 below depend on tasks.closed_at from step 8.
--
-- ===== Step 1. Tramo rows =====
UPDATE "core"."workflows" SET "name" = 'Diseño' WHERE "key" = 'diseno' AND "deleted_at" IS NULL AND "name" <> 'Diseño';
--> statement-breakpoint
UPDATE "core"."workflows" w
SET "description" = v."description"
FROM (
  VALUES
    ('presale', 'Flujo de prospección, presentación y cierre.'),
    ('diseno', 'Flujo de anteproyecto, proyecto arquitectónico y ejecutivo.'),
    ('construccion', 'Flujo de residencia de obra y postventa.')
) AS v("key", "description")
WHERE w."key" = v."key" AND w."deleted_at" IS NULL AND w."description" IS NULL;
--> statement-breakpoint
UPDATE "core"."workflows" SET "auto_start" = 'on_create' WHERE "key" = 'presale' AND "deleted_at" IS NULL;
--> statement-breakpoint
-- ===== Step 2. Fase catalog (BE §5.1, mirrors DEFAULT_CATALOG in scripts/default-catalog.mjs) =====
-- On a fresh database there are no workflows yet: nothing is inserted here and ensureDefaultCatalog
-- seeds the catalog after ensureDefaultWorkflows (BE §5.4).
INSERT INTO "core"."workflow_phases" ("workflow_id", "key", "name", "sort_order")
SELECT w."id", v."key", v."name", v."sort_order"
FROM (
  VALUES
  ('presale', 'inicial', 'Inicial', 0),
  ('presale', 'presentacion', 'Presentación', 1),
  ('presale', 'con_cliente', 'Con Cliente', 2),
  ('presale', 'minutas', 'Minutas', 3),
  ('presale', 'cobro', 'Cobro', 4),
  ('diseno', 'anteproyecto', 'Anteproyecto', 0),
  ('diseno', 'proyecto_arquitectonico', 'Proyecto Arquitectónico', 1),
  ('diseno', 'ejecutivo', 'Ejecutivo', 2),
  ('diseno', 'proyecto_estructural', 'Proyecto Estructural', 3),
  ('diseno', 'proyecto_sustentable', 'Proyecto Sustentable', 4),
  ('diseno', 'paisajismo', 'Paisajismo', 5),
  ('diseno', 'minutas', 'Minutas', 6),
  ('construccion', 'residencia', 'Residencia', 0),
  ('construccion', 'postventa', 'Postventa', 1)
) AS v("workflow_key", "key", "name", "sort_order")
JOIN "core"."workflows" w ON w."key" = v."workflow_key" AND w."deleted_at" IS NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Matching key of a free-text fase: flow_name_key plus the alias "Proyecto Ejecutivo" -> "Ejecutivo".
-- Used by steps 3–5 only; dropped at the end of step 5.
CREATE OR REPLACE FUNCTION "core"."flow_phase_text_key"(text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ select case "core"."flow_name_key"($1) when 'proyectoejecutivo' then 'ejecutivo' else "core"."flow_name_key"($1) end $$;
--> statement-breakpoint
-- The 51 seed templates (BE §5.2): title, the old TS spelling (legacy_title) and sort_order within the tramo.
-- Kept in a session temp table for steps 3 and 5e; dropped at the end of step 5.
DROP TABLE IF EXISTS pg_temp."flow_seed_templates";
--> statement-breakpoint
CREATE TEMP TABLE "flow_seed_templates" ("workflow_key" text NOT NULL, "phase_key" text NOT NULL, "title" text NOT NULL, "legacy_title" text NOT NULL, "sort_order" integer NOT NULL);
--> statement-breakpoint
INSERT INTO pg_temp."flow_seed_templates" ("workflow_key", "phase_key", "title", "legacy_title", "sort_order")
VALUES
  ('presale', 'inicial', 'Presentación "Quiénes somos"', 'Presentación "Quienes somos"', 0),
  ('presale', 'presentacion', 'Reporte Estado Actual', 'Resporte Estado Actual', 1),
  ('presale', 'presentacion', 'Imágenes de Referencia', 'Imagenes de Referencia', 2),
  ('presale', 'presentacion', 'Plano preliminar', 'Plano preliminar', 3),
  ('presale', 'presentacion', 'Primeras Visualizaciones', 'Primeras Visualizaciones', 4),
  ('presale', 'presentacion', 'Rango de Precios', 'Rango de Precios', 5),
  ('presale', 'presentacion', 'Presupuesto Diseño', 'Presupuesto Diseño', 6),
  ('presale', 'con_cliente', 'Presentar a cliente', 'Presentar a cliente', 7),
  ('presale', 'minutas', 'Minuta', 'Minuta', 8),
  ('presale', 'cobro', 'Cobrar Inicio de proyecto', 'Cobrar Inicio de proyecto', 9),
  ('diseno', 'anteproyecto', 'Levantamiento', 'Levantamiento', 0),
  ('diseno', 'anteproyecto', 'Concepto', 'Concepto', 1),
  ('diseno', 'anteproyecto', 'Plano de distribución', 'Plano de distribicion', 2),
  ('diseno', 'anteproyecto', 'Volumetría', 'Volumetria', 3),
  ('diseno', 'proyecto_arquitectonico', 'Planos Arquitectónicos', 'Planos Arquitectonicos', 4),
  ('diseno', 'proyecto_arquitectonico', 'Fachadas y alzados', 'Fachadas y alzados', 5),
  ('diseno', 'proyecto_arquitectonico', 'Mood Board', 'Mood Board', 6),
  ('diseno', 'proyecto_arquitectonico', 'Renders', 'Renders', 7),
  ('diseno', 'ejecutivo', 'Fachadas y alzados', 'Fachadas y alzados', 8),
  ('diseno', 'ejecutivo', 'Planos de Demolición Desmantelamiento', 'Planos de Demolicion Desmantelamiento', 9),
  ('diseno', 'ejecutivo', 'Planos de Albañilerías', 'Planos de Albanilerias', 10),
  ('diseno', 'ejecutivo', 'Planos Eléctricos', 'Planos Electricos', 11),
  ('diseno', 'ejecutivo', 'Planos Iluminación', 'Planos Iluminacion', 12),
  ('diseno', 'ejecutivo', 'Planos Hidráulicos', 'Planos Hidraulicos', 13),
  ('diseno', 'ejecutivo', 'Planos Sanitarios', 'Planos Sanitarios', 14),
  ('diseno', 'ejecutivo', 'Planos Acabados', 'Planos Acabados', 15),
  ('diseno', 'ejecutivo', 'Planos de Carpintería', 'Planos de Carpinteria', 16),
  ('diseno', 'ejecutivo', 'Plano de Mobiliario', 'Plano de Mobiliario', 17),
  ('diseno', 'ejecutivo', 'Plano de Cancelerías', 'Plano de Cancelerias', 18),
  ('diseno', 'ejecutivo', 'Planos de Herrerías', 'Planos de Herrerias', 19),
  ('diseno', 'ejecutivo', 'Memoria Descriptiva', 'Memoria Descriptiva', 20),
  ('diseno', 'ejecutivo', 'Detalles y Especificaciones Técnicas', 'Detalles y Especificaciones Tecnicas', 21),
  ('diseno', 'proyecto_estructural', 'Memoria de Cálculo', 'Memoria de Calculo', 22),
  ('diseno', 'proyecto_estructural', 'Cálculos Simulaciones', 'Calculos Simulaciones', 23),
  ('diseno', 'proyecto_sustentable', 'Captación Agua Pluvial', 'Captacion Agua Pluvial', 24),
  ('diseno', 'proyecto_sustentable', 'Tratamiento aguas', 'Tratamiento aguas', 25),
  ('diseno', 'proyecto_sustentable', 'Fotovoltaico', 'Fotovoltaico', 26),
  ('diseno', 'paisajismo', 'Paleta Vegetal', 'Paleta Vegetal', 27),
  ('diseno', 'minutas', 'Minutas', 'Minutas', 28),
  ('construccion', 'residencia', 'Bitácoras y Minutas', 'Bitacoras y Minutas', 0),
  ('construccion', 'residencia', 'Reporte de Avance', 'Reporte de Avance', 1),
  ('construccion', 'residencia', 'Revisión de planos', 'Revision de planos', 2),
  ('construccion', 'residencia', 'Supervisión de trabajos', 'Supervicion de trabajos', 3),
  ('construccion', 'residencia', 'Cumplimiento Seguridad', 'Cumplimiento Seguridad', 4),
  ('construccion', 'residencia', 'Cumplimiento Orden y Limpieza', 'Cumplimiento Orden y Limpieza', 5),
  ('construccion', 'residencia', 'Atención a calidad y detalles finos', 'Atencion a calidad y detalles finos', 6),
  ('construccion', 'residencia', 'Garantías', 'Garantias', 7),
  ('construccion', 'residencia', 'Manual de Mantenimiento', 'Manual de Mantenimiento', 8),
  ('construccion', 'residencia', 'Cierre de obra (Firma de actas)', 'Cierre de obra (Firma de actas)', 9),
  ('construccion', 'postventa', 'Mantenimientos', 'Mantenimientos', 10),
  ('construccion', 'postventa', 'Garantías', 'Garantias', 11);
--> statement-breakpoint
-- ===== Step 3. Templates =====
-- Per row: skipped when the tramo already has a template with that title (or its old spelling) that is,
-- or after step 4 will be, in the seed row's fase. Existing templates still have phase_id null here, so
-- their step-4 fase is computed the same way step 4 does (text match, else the tramo's first fase);
-- without that, step 4 would hit workflow_task_templates_title_lower_uq and abort the deploy.
INSERT INTO "core"."workflow_task_templates" ("workflow_id", "phase_id", "phase", "title", "default_priority", "sort_order")
SELECT w."id", ph."id", ph."name", s."title", 'media', s."sort_order"
FROM pg_temp."flow_seed_templates" s
JOIN "core"."workflows" w ON w."key" = s."workflow_key" AND w."deleted_at" IS NULL
JOIN "core"."workflow_phases" ph ON ph."workflow_id" = w."id" AND ph."key" = s."phase_key"
WHERE NOT EXISTS (
  SELECT 1
  FROM "core"."workflow_task_templates" x
  WHERE x."workflow_id" = w."id"
    AND "core"."flow_name_key"(x."title") IN ("core"."flow_name_key"(s."title"), "core"."flow_name_key"(s."legacy_title"))
    AND (
      x."phase_id" = ph."id"
      OR (
        x."phase_id" IS NULL
        AND ph."id" = coalesce(
          (
            SELECT p2."id" FROM "core"."workflow_phases" p2
            WHERE p2."workflow_id" = x."workflow_id"
              AND "core"."flow_name_key"(p2."name") = "core"."flow_phase_text_key"(x."phase")
            ORDER BY p2."sort_order", p2."id"
            LIMIT 1
          ),
          (
            SELECT p3."id" FROM "core"."workflow_phases" p3
            WHERE p3."workflow_id" = x."workflow_id"
            ORDER BY p3."sort_order", p3."id"
            LIMIT 1
          )
        )
      )
    )
)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- ===== Step 4. Template fase backfill =====
UPDATE "core"."workflow_task_templates" t
SET "phase_id" = (
  SELECT p."id" FROM "core"."workflow_phases" p
  WHERE p."workflow_id" = t."workflow_id"
    AND "core"."flow_name_key"(p."name") = "core"."flow_phase_text_key"(t."phase")
  ORDER BY p."sort_order", p."id"
  LIMIT 1
)
WHERE t."phase_id" IS NULL
  AND EXISTS (
    SELECT 1 FROM "core"."workflow_phases" p
    WHERE p."workflow_id" = t."workflow_id"
      AND "core"."flow_name_key"(p."name") = "core"."flow_phase_text_key"(t."phase")
  );
--> statement-breakpoint
-- Templates still without a fase go to the tramo's first fase, and are reported.
WITH "defaulted" AS (
  UPDATE "core"."workflow_task_templates" t
  SET "phase_id" = (
    SELECT p."id" FROM "core"."workflow_phases" p
    WHERE p."workflow_id" = t."workflow_id"
    ORDER BY p."sort_order", p."id"
    LIMIT 1
  )
  WHERE t."phase_id" IS NULL
    AND EXISTS (SELECT 1 FROM "core"."workflow_phases" p WHERE p."workflow_id" = t."workflow_id")
  RETURNING t."id", t."workflow_id", t."phase_id", t."phase", t."title"
)
INSERT INTO "core"."project_flow_migration_report" ("kind", "entity", "entity_id", "value", "detail")
SELECT
  'template_phase_defaulted',
  'template',
  d."id",
  d."phase",
  jsonb_build_object('title', d."title", 'workflowKey', w."key", 'phaseName', p."name")
FROM "defaulted" d
JOIN "core"."workflows" w ON w."id" = d."workflow_id"
JOIN "core"."workflow_phases" p ON p."id" = d."phase_id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- ===== Step 5. Task fase backfill (live and deleted rows alike) =====
-- 5a. Text match within the task's tramo.
UPDATE "core"."tasks" t
SET "phase_id" = p."id"
FROM "core"."workflow_phases" p
WHERE t."phase_id" IS NULL
  AND t."workflow_id" IS NOT NULL
  AND p."workflow_id" = t."workflow_id"
  AND btrim(coalesce(t."phase", '')) <> ''
  AND "core"."flow_name_key"(p."name") = "core"."flow_phase_text_key"(t."phase");
--> statement-breakpoint
-- 5b. Workflow tasks with no text take their template's fase.
UPDATE "core"."tasks" t
SET "phase_id" = tt."phase_id"
FROM "core"."workflow_task_templates" tt
WHERE t."phase_id" IS NULL
  AND t."template_id" = tt."id"
  AND t."workflow_id" = tt."workflow_id"
  AND tt."phase_id" IS NOT NULL
  AND btrim(coalesce(t."phase", '')) = '';
--> statement-breakpoint
-- 5c. Tasks with text but no tramo: when the text matches exactly one fase across all tramos, the
-- task gets that tramo and fase. "Minutas" (Presale and Diseño) matches two and is left alone.
WITH "single" AS (
  SELECT t."id", (array_agg(p."id"))[1] AS "phase_id", (array_agg(p."workflow_id"))[1] AS "workflow_id"
  FROM "core"."tasks" t
  JOIN "core"."workflow_phases" p ON "core"."flow_name_key"(p."name") = "core"."flow_phase_text_key"(t."phase")
  JOIN "core"."workflows" w ON w."id" = p."workflow_id" AND w."deleted_at" IS NULL
  WHERE t."workflow_id" IS NULL AND t."phase_id" IS NULL AND btrim(coalesce(t."phase", '')) <> ''
  GROUP BY t."id"
  HAVING count(*) = 1
),
"inferred" AS (
  UPDATE "core"."tasks" t
  SET "workflow_id" = s."workflow_id", "phase_id" = s."phase_id"
  FROM "single" s
  WHERE t."id" = s."id"
  RETURNING t."id", t."project_id", t."phase", t."workflow_id"
)
INSERT INTO "core"."project_flow_migration_report" ("kind", "entity", "entity_id", "value", "detail")
SELECT
  'task_tramo_inferred',
  'task',
  i."id",
  i."phase",
  jsonb_build_object('projectId', i."project_id", 'workflowKey', w."key")
FROM "inferred" i
JOIN "core"."workflows" w ON w."id" = i."workflow_id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- 5e (before 5d, so linked tasks aren't reported unmatched). Tasks made by the old "Iniciar plantilla":
-- live usuario tasks with a tramo whose title is a seeded template's title or old spelling, and whose
-- fase (after 5a–5c) is that template's fase or null, become workflow tasks of that template when the
-- (project, template) slot is free; the first by created_at wins. The title is not changed.
WITH "candidates" AS (
  SELECT DISTINCT ON (t."id")
    t."id" AS "task_id",
    t."project_id",
    t."created_at",
    tt."id" AS "template_id",
    tt."phase_id",
    w."key" AS "workflow_key"
  FROM "core"."tasks" t
  JOIN "core"."workflows" w ON w."id" = t."workflow_id"
  JOIN pg_temp."flow_seed_templates" s
    ON s."workflow_key" = w."key"
    AND "core"."flow_name_key"(t."title") IN ("core"."flow_name_key"(s."title"), "core"."flow_name_key"(s."legacy_title"))
  JOIN "core"."workflow_phases" ph ON ph."workflow_id" = w."id" AND ph."key" = s."phase_key"
  JOIN "core"."workflow_task_templates" tt
    ON tt."workflow_id" = w."id"
    AND tt."phase_id" = ph."id"
    AND tt."active" = true
    AND "core"."flow_name_key"(tt."title") IN ("core"."flow_name_key"(s."title"), "core"."flow_name_key"(s."legacy_title"))
  WHERE t."deleted_at" IS NULL
    AND t."kind" = 'usuario'
    AND t."template_id" IS NULL
    AND (t."phase_id" IS NULL OR t."phase_id" = tt."phase_id")
  ORDER BY t."id", (t."phase_id" IS NOT DISTINCT FROM tt."phase_id") DESC, s."sort_order", tt."id"
),
"picked" AS (
  SELECT DISTINCT ON (c."project_id", c."template_id") c.*
  FROM "candidates" c
  WHERE NOT EXISTS (
    SELECT 1 FROM "core"."tasks" x
    WHERE x."project_id" = c."project_id" AND x."template_id" = c."template_id" AND x."deleted_at" IS NULL
  )
  ORDER BY c."project_id", c."template_id", c."created_at", c."task_id"
),
"linked" AS (
  UPDATE "core"."tasks" t
  SET "kind" = 'workflow', "template_id" = p."template_id", "phase_id" = p."phase_id"
  FROM "picked" p
  WHERE t."id" = p."task_id"
  RETURNING t."id", t."project_id", t."template_id", t."title"
)
INSERT INTO "core"."project_flow_migration_report" ("kind", "entity", "entity_id", "value", "detail")
SELECT
  'task_linked_to_template',
  'task',
  l."id",
  l."title",
  jsonb_build_object('projectId', l."project_id", 'templateId', l."template_id", 'workflowKey', p."workflow_key")
FROM "linked" l
JOIN "picked" p ON p."task_id" = l."id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- 5d. Everything else with fase text keeps phase_id null ("Sin fase · revisar") and is reported.
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
DROP TABLE IF EXISTS pg_temp."flow_seed_templates";
--> statement-breakpoint
DROP FUNCTION IF EXISTS "core"."flow_phase_text_key"(text);
--> statement-breakpoint
-- ===== Step 6. projects.phases report (the column is dropped in release B) =====
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
-- ===== Step 7. Statuses =====
-- A status_reused / status_created report row means step 7 already ran: on a repeat run the flag
-- backfill and the reuse updates are skipped, so they never undo later changes or report twice.
-- Every closing status counted as completed before project flow.
UPDATE "core"."task_statuses" SET "counts_as_completed" = "closes"
WHERE NOT EXISTS (SELECT 1 FROM "core"."project_flow_migration_report" r WHERE r."kind" IN ('status_reused', 'status_created'));
--> statement-breakpoint
-- An existing "Cancelado" / "No se requiere" is reused: it closes a task without counting it as
-- completed. Its tasks are re-synced to completado.
WITH "reused" AS (
  SELECT s."id", s."name", s."closes", s."counts_as_completed"
  FROM "core"."task_statuses" s
  WHERE s."deleted_at" IS NULL AND "core"."flow_name_key"(s."name") IN ('cancelado', 'noserequiere')
    AND NOT EXISTS (SELECT 1 FROM "core"."project_flow_migration_report" r WHERE r."kind" IN ('status_reused', 'status_created') AND "core"."flow_name_key"(r."value") IN ('cancelado', 'noserequiere'))
),
"updated" AS (
  UPDATE "core"."task_statuses" s
  SET "closes" = true, "counts_as_completed" = false
  FROM "reused" r
  WHERE s."id" = r."id"
  RETURNING s."id"
),
"resynced" AS (
  UPDATE "core"."tasks" t
  SET "status" = 'completado'
  FROM "reused" r
  WHERE t."custom_status_id" = r."id" AND t."status" <> 'completado'
  RETURNING t."id", t."custom_status_id"
)
INSERT INTO "core"."project_flow_migration_report" ("kind", "entity", "entity_id", "value", "detail")
SELECT
  'status_reused',
  'task_status',
  r."id",
  r."name",
  jsonb_build_object(
    'name', r."name",
    'before', jsonb_build_object('closes', r."closes", 'countsAsCompleted', r."counts_as_completed"),
    'after', jsonb_build_object('closes', true, 'countsAsCompleted', false),
    'tasksResynced', (SELECT count(*) FROM "resynced" x WHERE x."custom_status_id" = r."id"),
    'tasksReopened', 0
  )
FROM "reused" r
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- An existing "En espera" is reused as an open status. Its tasks are re-synced to en_proceso; those
-- that were completado (a closing "En espera") are reopened and lose closed_at.
WITH "reused" AS (
  SELECT s."id", s."name", s."closes", s."counts_as_completed"
  FROM "core"."task_statuses" s
  WHERE s."deleted_at" IS NULL AND "core"."flow_name_key"(s."name") = 'enespera'
    AND NOT EXISTS (SELECT 1 FROM "core"."project_flow_migration_report" r WHERE r."kind" IN ('status_reused', 'status_created') AND "core"."flow_name_key"(r."value") = 'enespera')
),
"updated" AS (
  UPDATE "core"."task_statuses" s
  SET "closes" = false, "counts_as_completed" = false
  FROM "reused" r
  WHERE s."id" = r."id"
  RETURNING s."id"
),
"before_tasks" AS (
  SELECT t."id", t."custom_status_id", t."status"
  FROM "core"."tasks" t
  JOIN "reused" r ON r."id" = t."custom_status_id"
  WHERE t."status" <> 'en_proceso'
),
"resynced" AS (
  UPDATE "core"."tasks" t
  SET "status" = 'en_proceso', "closed_at" = NULL
  FROM "before_tasks" b
  WHERE t."id" = b."id"
  RETURNING t."id"
)
INSERT INTO "core"."project_flow_migration_report" ("kind", "entity", "entity_id", "value", "detail")
SELECT
  'status_reused',
  'task_status',
  r."id",
  r."name",
  jsonb_build_object(
    'name', r."name",
    'before', jsonb_build_object('closes', r."closes", 'countsAsCompleted', r."counts_as_completed"),
    'after', jsonb_build_object('closes', false, 'countsAsCompleted', false),
    'tasksResynced', (SELECT count(*) FROM "before_tasks" b WHERE b."custom_status_id" = r."id"),
    'tasksReopened', (SELECT count(*) FROM "before_tasks" b WHERE b."custom_status_id" = r."id" AND b."status" = 'completado')
  )
FROM "reused" r
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- Only when no live row matches: create "Cancelado" (closes, not completed) and "En espera" (open).
WITH "created" AS (
  INSERT INTO "core"."task_statuses" ("name", "closes", "counts_as_completed", "sort_order")
  SELECT 'Cancelado', true, false, coalesce((SELECT max(x."sort_order") + 1 FROM "core"."task_statuses" x WHERE x."deleted_at" IS NULL), 0)
  WHERE NOT EXISTS (
    SELECT 1 FROM "core"."task_statuses" s
    WHERE s."deleted_at" IS NULL AND "core"."flow_name_key"(s."name") IN ('cancelado', 'noserequiere')
  )
  RETURNING "id", "name", "closes", "counts_as_completed"
)
INSERT INTO "core"."project_flow_migration_report" ("kind", "entity", "entity_id", "value", "detail")
SELECT 'status_created', 'task_status', c."id", c."name", jsonb_build_object('name', c."name", 'closes', c."closes", 'countsAsCompleted', c."counts_as_completed")
FROM "created" c
ON CONFLICT DO NOTHING;
--> statement-breakpoint
WITH "created" AS (
  INSERT INTO "core"."task_statuses" ("name", "closes", "counts_as_completed", "sort_order")
  SELECT 'En espera', false, false, coalesce((SELECT max(x."sort_order") + 1 FROM "core"."task_statuses" x WHERE x."deleted_at" IS NULL), 0)
  WHERE NOT EXISTS (
    SELECT 1 FROM "core"."task_statuses" s
    WHERE s."deleted_at" IS NULL AND "core"."flow_name_key"(s."name") = 'enespera'
  )
  RETURNING "id", "name", "closes", "counts_as_completed"
)
INSERT INTO "core"."project_flow_migration_report" ("kind", "entity", "entity_id", "value", "detail")
SELECT 'status_created', 'task_status', c."id", c."name", jsonb_build_object('name', c."name", 'closes', c."closes", 'countsAsCompleted', c."counts_as_completed")
FROM "created" c
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- ===== Step 8. tasks.closed_at =====
-- Completed tasks: the latest move to completado (status) or into a closing custom status, else updated_at.
UPDATE "core"."tasks" t
SET "closed_at" = coalesce(
  (
    SELECT max(h."event_at")
    FROM "core"."history_events" h
    WHERE h."entity" = 'task'
      AND h."entity_id" = t."id"
      AND h."kind" = 'cambio'
      AND (
        (h."field" = 'status' AND h."after_value" = 'completado')
        OR (
          h."field" = 'customStatusId'
          AND h."after_value" IN (SELECT s."id"::text FROM "core"."task_statuses" s WHERE s."closes" = true)
        )
      )
  ),
  t."updated_at"
)
WHERE t."status" = 'completado' AND t."closed_at" IS NULL;
--> statement-breakpoint
UPDATE "core"."tasks" SET "closed_at" = NULL WHERE "status" <> 'completado' AND "closed_at" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "core"."tasks" VALIDATE CONSTRAINT "tasks_closed_at_check";
--> statement-breakpoint
-- ===== Step 9. Stages =====
-- 9a. Every current tramo has a stage row.
INSERT INTO "core"."project_stages" ("project_id", "workflow_id")
SELECT p."id", p."current_workflow_id"
FROM "core"."projects" p
WHERE p."current_workflow_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- 9b. Every (project, tramo) pair with live tasks has a stage row.
INSERT INTO "core"."project_stages" ("project_id", "workflow_id")
SELECT DISTINCT t."project_id", t."workflow_id"
FROM "core"."tasks" t
WHERE t."deleted_at" IS NULL AND t."workflow_id" IS NOT NULL
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- 9c. started_at = the earlier of the stage row and the first live task of that tramo on the project.
UPDATE "core"."project_stages" ps
SET "started_at" = least(
  ps."created_at",
  (
    SELECT min(t."created_at")
    FROM "core"."tasks" t
    WHERE t."project_id" = ps."project_id" AND t."workflow_id" = ps."workflow_id" AND t."deleted_at" IS NULL
  )
);
--> statement-breakpoint
-- 9d. closed_at = the last task close when every live, unarchived task of the pair is closed; else null.
UPDATE "core"."project_stages" ps
SET "closed_at" = s."closed_at"
FROM (
  SELECT
    t."project_id",
    t."workflow_id",
    CASE WHEN bool_and(t."status" = 'completado' AND t."closed_at" IS NOT NULL) THEN max(t."closed_at") END AS "closed_at"
  FROM "core"."tasks" t
  WHERE t."deleted_at" IS NULL AND t."archived" = false AND t."workflow_id" IS NOT NULL
  GROUP BY t."project_id", t."workflow_id"
) s
WHERE s."project_id" = ps."project_id"
  AND s."workflow_id" = ps."workflow_id"
  AND ps."closed_at" IS DISTINCT FROM s."closed_at";
--> statement-breakpoint
-- ===== Step 10. Current tramo =====
-- Projects without one take their started tramo with the highest sort_order.
UPDATE "core"."projects" p
SET "current_workflow_id" = s."workflow_id"
FROM (
  SELECT DISTINCT ON (ps."project_id") ps."project_id", ps."workflow_id"
  FROM "core"."project_stages" ps
  JOIN "core"."workflows" w ON w."id" = ps."workflow_id" AND w."deleted_at" IS NULL
  ORDER BY ps."project_id", w."sort_order" DESC, ps."started_at" DESC, w."id"
) s
WHERE p."id" = s."project_id" AND p."current_workflow_id" IS NULL AND p."deleted_at" IS NULL;
--> statement-breakpoint
-- The rest show "Asignar tramo" (needsTramo).
INSERT INTO "core"."project_flow_migration_report" ("kind", "entity", "entity_id", "value", "detail")
SELECT 'project_without_tramo', 'project', p."id", p."name", jsonb_build_object('name', p."name", 'status', p."status")
FROM "core"."projects" p
WHERE p."deleted_at" IS NULL AND p."current_workflow_id" IS NULL
  -- Keyed on the project, not its name: step 11 may rename it after this report row is written.
  AND NOT EXISTS (
    SELECT 1 FROM "core"."project_flow_migration_report" r
    WHERE r."kind" = 'project_without_tramo' AND r."entity" = 'project' AND r."entity_id" = p."id"
  )
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- ===== Step 11. Duplicate names =====
-- Among live, active/paused projects sharing lower(name) the oldest keeps its name; each other one
-- (oldest first) takes the first free " (n)", n >= 2, among live projects (names renamed earlier in
-- this loop included, since each update is visible to the next check).
DO $$
DECLARE
  r record;
  n integer;
  candidate text;
BEGIN
  FOR r IN
    SELECT d."id", d."name"
    FROM (
      SELECT
        p."id",
        p."name",
        p."created_at",
        row_number() OVER (PARTITION BY lower(p."name") ORDER BY p."created_at", p."id") AS rn
      FROM "core"."projects" p
      WHERE p."deleted_at" IS NULL AND p."status" IN ('activo', 'pausado')
    ) d
    WHERE d.rn > 1
    ORDER BY lower(d."name"), d.rn
  LOOP
    n := 2;
    LOOP
      candidate := r."name" || ' (' || n || ')';
      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM "core"."projects" x WHERE x."deleted_at" IS NULL AND lower(x."name") = lower(candidate)
      );
      n := n + 1;
    END LOOP;

    UPDATE "core"."projects" SET "name" = candidate, "updated_at" = now() WHERE "id" = r."id";

    INSERT INTO "core"."project_flow_migration_report" ("kind", "entity", "entity_id", "value", "detail")
    VALUES (
      'project_renamed_duplicate',
      'project',
      r."id",
      r."name",
      jsonb_build_object('before', r."name", 'after', candidate)
    )
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "projects_name_lower_uq" ON "core"."projects" USING btree (lower("name")) WHERE "core"."projects"."deleted_at" is null and "core"."projects"."status" in ('activo','pausado');
--> statement-breakpoint
DROP INDEX IF EXISTS "core"."projects_client_name_lower_uq";
--> statement-breakpoint
-- ===== Step 12. Áreas report (the tables are dropped in release B) =====
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
-- ===== Step 13. Google group mappings: kind 'area' -> 'position' =====
-- The only place the enum and its check change (BE §4.1). Comparisons use kind::text so a repeat
-- run, after 'area' is gone from the enum, doesn't fail on the literal.
INSERT INTO "core"."project_flow_migration_report" ("kind", "entity", "entity_id", "value", "detail")
SELECT
  'group_mapping_area_removed',
  'group_mapping',
  g."id",
  g."group_email",
  jsonb_build_object('groupEmail', g."group_email", 'areaName', a."name")
FROM "core"."workspace_group_mappings" g
LEFT JOIN "core"."areas" a ON a."id" = g."area_id"
WHERE g."kind"::text = 'area'
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DELETE FROM "core"."workspace_group_mappings" WHERE "kind"::text = 'area';
--> statement-breakpoint
ALTER TABLE "core"."workspace_group_mappings" DROP CONSTRAINT IF EXISTS "workspace_group_mappings_kind_check";
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace ns ON ns.oid = t.typnamespace
    WHERE ns.nspname = 'core' AND t.typname = 'group_mapping_kind' AND e.enumlabel = 'area'
  ) THEN
    ALTER TYPE "core"."group_mapping_kind" RENAME VALUE 'area' TO 'position';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "core"."workspace_group_mappings" ADD CONSTRAINT "workspace_group_mappings_kind_check" CHECK (("core"."workspace_group_mappings"."kind"::text = 'role' and "core"."workspace_group_mappings"."role" is not null and "core"."workspace_group_mappings"."position_id" is null) or ("core"."workspace_group_mappings"."kind"::text = 'position' and "core"."workspace_group_mappings"."position_id" is not null and "core"."workspace_group_mappings"."role" is null));
--> statement-breakpoint
-- ===== Step 14. Puestos seed (BE §5.3) =====
-- Inserted unless a row with that name exists, soft-deleted included (an admin's delete stays).
INSERT INTO "core"."positions" ("name", "sort_order")
SELECT v."name", v."sort_order"
FROM (
  VALUES
    ('Arquitecto proyectista', 0),
    ('Proyectista ejecutivo', 1),
    ('Dibujante', 2),
    ('Comercial', 3),
    ('Residente de obra', 4),
    ('Administración', 5)
) AS v("name", "sort_order")
WHERE NOT EXISTS (SELECT 1 FROM "core"."positions" p WHERE lower(p."name") = lower(v."name"));
--> statement-breakpoint
-- Candidate fases for each live seeded puesto that has none yet. On a fresh install there are no
-- fases yet: nothing is inserted and ensureDefaultCatalog fills them in (BE §5.4).
INSERT INTO "core"."position_phases" ("position_id", "phase_id")
SELECT p."id", ph."id"
FROM (
  VALUES
    ('Arquitecto proyectista', 'diseno', 'anteproyecto'),
    ('Arquitecto proyectista', 'diseno', 'proyecto_arquitectonico'),
    ('Arquitecto proyectista', 'diseno', 'paisajismo'),
    ('Proyectista ejecutivo', 'diseno', 'ejecutivo'),
    ('Proyectista ejecutivo', 'diseno', 'proyecto_estructural'),
    ('Proyectista ejecutivo', 'diseno', 'proyecto_sustentable'),
    ('Dibujante', 'diseno', 'proyecto_arquitectonico'),
    ('Dibujante', 'diseno', 'ejecutivo'),
    ('Comercial', 'presale', 'inicial'),
    ('Comercial', 'presale', 'presentacion'),
    ('Comercial', 'presale', 'con_cliente'),
    ('Comercial', 'presale', 'minutas'),
    ('Residente de obra', 'construccion', 'residencia'),
    ('Residente de obra', 'construccion', 'postventa'),
    ('Administración', 'presale', 'cobro')
) AS v("position_name", "workflow_key", "phase_key")
JOIN "core"."positions" p ON lower(p."name") = lower(v."position_name") AND p."deleted_at" IS NULL
JOIN "core"."workflows" w ON w."key" = v."workflow_key" AND w."deleted_at" IS NULL
JOIN "core"."workflow_phases" ph ON ph."workflow_id" = w."id" AND ph."key" = v."phase_key"
WHERE NOT EXISTS (SELECT 1 FROM "core"."position_phases" pp WHERE pp."position_id" = p."id")
ON CONFLICT DO NOTHING;
-- ===== Step 15. Permission overrides =====
-- Nothing in the database: custom permissions live in browser storage and the client reader maps a
-- stored `areas` module to `positions` for one release (BE §4.2 step 15).
