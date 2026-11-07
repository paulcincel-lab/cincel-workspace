-- Project flow release A: checks for the dry run on a production copy
-- (docs/phases/project-flow-phase-1-schema-seed-backfill.md → Done Definition;
-- docs/specs/project-flow/backend.md §4). Run after 0023 + 0024 were applied:
--
--   psql "$DATABASE_URL" -X -q -f scripts/project-flow-dry-run-checks.sql
--
-- Read only. Prints one row per check with the expected and actual value and
-- `ok`. Any `ok = f` row blocks the merge. See docs/project-flow-release-a-runbook.md.

\set ON_ERROR_STOP on
\pset footer off

select check_name, expected, actual, (expected = actual) as ok
from (
  select 2 as n, 'fases (live tramos)' as check_name, '14' as expected,
    (select count(*)::text
       from core.workflow_phases p
       join core.workflows w on w.id = p.workflow_id and w.deleted_at is null) as actual
  union all
  select 3, 'templates (live tramos)', '51',
    (select count(*)::text
       from core.workflow_task_templates t
       join core.workflows w on w.id = t.workflow_id and w.deleted_at is null)
  union all
  select 4, 'templates without phase_id', '0',
    (select count(*)::text from core.workflow_task_templates where phase_id is null)
  union all
  select 5, 'live status «Cancelado»', '1',
    (select count(*)::text from core.task_statuses
      where deleted_at is null and lower(name) = 'cancelado')
  union all
  select 6, 'live status «En espera»', '1',
    (select count(*)::text from core.task_statuses
      where deleted_at is null and lower(name) = 'en espera')
  union all
  select 7, 'group_mapping_kind values', 'role,position',
    (select string_agg(e.enumlabel, ',' order by e.enumsortorder)
       from pg_enum e
       join pg_type t on t.oid = e.enumtypid
       join pg_namespace s on s.oid = t.typnamespace
      where s.nspname = 'core' and t.typname = 'group_mapping_kind')
  union all
  select 8, 'live active/paused projects sharing lower(name)', '0',
    (select count(*)::text from (
       select lower(name)
         from core.projects
        where deleted_at is null and status in ('activo', 'pausado')
        group by lower(name)
       having count(*) > 1) d)
  union all
  select 9, 'index projects_name_lower_uq exists', '1',
    (select count(*)::text from pg_indexes
      where schemaname = 'core' and indexname = 'projects_name_lower_uq')
  union all
  select 10, 'index projects_client_name_lower_uq dropped', '0',
    (select count(*)::text from pg_indexes
      where schemaname = 'core' and indexname = 'projects_client_name_lower_uq')
  union all
  select 11, 'tasks whose fase belongs to another tramo', '0',
    (select count(*)::text
       from core.tasks k
       join core.workflow_phases p on p.id = k.phase_id
      where k.workflow_id is distinct from p.workflow_id)
) c
order by n;

-- Context for the issue comment: fases and templates per tramo, report kinds.
select w.key as tramo,
       (select count(*) from core.workflow_phases p where p.workflow_id = w.id) as fases,
       (select count(*) from core.workflow_task_templates t where t.workflow_id = w.id) as templates
  from core.workflows w
 where w.deleted_at is null
 order by w.sort_order;

select kind, count(*) as rows
  from core.project_flow_migration_report
 group by kind
 order by kind;
