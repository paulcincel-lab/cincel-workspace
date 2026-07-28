-- Sprint 11.1 - Initial RLS policies (idempotent)

-- 1) Enable RLS
alter table if exists core.clients enable row level security;
alter table if exists core.client_contacts enable row level security;
alter table if exists core.team_members enable row level security;
alter table if exists core.projects enable row level security;
alter table if exists core.project_drive_links enable row level security;
alter table if exists core.project_members enable row level security;
alter table if exists core.activities enable row level security;
alter table if exists core.activity_support_members enable row level security;
alter table if exists core.activity_history enable row level security;
alter table if exists core.activity_checklist_items enable row level security;
alter table if exists core.contractors enable row level security;
alter table if exists core.contractor_categories enable row level security;
alter table if exists core.collaborator_providers enable row level security;
alter table if exists core.collaborator_categories enable row level security;
alter table if exists core.collaborator_skills enable row level security;
alter table if exists core.stores enable row level security;
alter table if exists core.store_categories enable row level security;

-- 2) Policies: authenticated full access (initial only)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients', 'client_contacts', 'team_members', 'projects', 'project_drive_links',
    'project_members', 'activities', 'activity_support_members', 'activity_history',
    'activity_checklist_items', 'contractors', 'contractor_categories',
    'collaborator_providers', 'collaborator_categories', 'collaborator_skills',
    'stores', 'store_categories'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'core'
        AND tablename = t
        AND policyname = t || '_authenticated_select'
    ) THEN
      EXECUTE format(
        'create policy %I on core.%I for select to authenticated using (true)',
        t || '_authenticated_select', t
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'core'
        AND tablename = t
        AND policyname = t || '_authenticated_insert'
    ) THEN
      EXECUTE format(
        'create policy %I on core.%I for insert to authenticated with check (true)',
        t || '_authenticated_insert', t
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'core'
        AND tablename = t
        AND policyname = t || '_authenticated_update'
    ) THEN
      EXECUTE format(
        'create policy %I on core.%I for update to authenticated using (true) with check (true)',
        t || '_authenticated_update', t
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'core'
        AND tablename = t
        AND policyname = t || '_authenticated_delete'
    ) THEN
      EXECUTE format(
        'create policy %I on core.%I for delete to authenticated using (true)',
        t || '_authenticated_delete', t
      );
    END IF;
  END LOOP;
END$$;
