-- Alpha M0 - Replace using(true) with real scoped RLS policies
-- Drops the broad authenticated=all-access policies introduced in migrations 0004 and 0005,
-- replacing them with policies that scope access by role and project membership.
--
-- Role model (mirrors lib/auth/permissions.ts):
--   Administrador / Dirección → global read+write on all org data
--   Jefe de Taller / Jefe de Construcción / Arquitecto Senior → project-scoped read+write
--   Arquitecto Junior / Colaborador / Pasante / Otros → project-scoped read, own-row write
--
-- Implementation note: Supabase exposes the authenticated user's email via
-- auth.email() and a custom claim via auth.jwt()->>'role' (populated by a
-- DB trigger on auth.users or via a custom claims function). Until the claims
-- function is deployed, the fallback is to check core.team_members.auth->>'role'
-- matched by email. A helper function core.current_user_role() centralises this.

-- ── Helper: resolve the current user's cincel role ───────────────────────────

create or replace function core.current_user_role()
returns text
language sql
stable
security definer
set search_path = core, public
as $$
  select coalesce(
    -- Prefer custom JWT claim set by the claims function / trigger
    (auth.jwt() ->> 'cincel_role'),
    -- Fallback: look up the role by authenticated email
    (
      select tm.role
      from core.team_members tm
      where lower(tm.institutional_email) = lower(auth.email())
        and tm.deleted_at is null
      limit 1
    )
  );
$$;

-- ── Helper: is the current user a global admin? ───────────────────────────────

create or replace function core.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = core, public
as $$
  select core.current_user_role() in ('Administrador', 'Dirección');
$$;

-- ── Helper: is the current user a member of a given project? ─────────────────

create or replace function core.is_project_member(p_project_id bigint)
returns boolean
language sql
stable
security definer
set search_path = core, public
as $$
  select exists (
    select 1
    from core.project_members pm
    join core.team_members tm
      on tm.id = pm.team_member_id
     and lower(tm.institutional_email) = lower(auth.email())
     and tm.deleted_at is null
    where pm.project_id = p_project_id
  );
$$;

-- ── Drop old using(true) policies ────────────────────────────────────────────

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'clients', 'client_contacts', 'team_members', 'projects', 'project_drive_links',
    'project_members', 'activities', 'activity_support_members', 'activity_history',
    'activity_checklist_items', 'contractors', 'contractor_categories',
    'collaborator_providers', 'collaborator_categories', 'collaborator_skills',
    'stores', 'store_categories', 'resource_links'
  ];
  ops text[] := ARRAY['select', 'insert', 'update', 'delete'];
  op text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    FOREACH op IN ARRAY ops LOOP
      EXECUTE format(
        'drop policy if exists %I on core.%I',
        t || '_authenticated_' || op, t
      );
    END LOOP;
  END LOOP;
END$$;

-- ── CLIENTS ───────────────────────────────────────────────────────────────────
-- Admins/Dirección: full access. Others: read-only (clients are org-wide).

create policy clients_select
  on core.clients for select to authenticated
  using (true);

create policy clients_insert
  on core.clients for insert to authenticated
  with check (core.is_global_admin());

create policy clients_update
  on core.clients for update to authenticated
  using (core.is_global_admin())
  with check (core.is_global_admin());

create policy clients_delete
  on core.clients for delete to authenticated
  using (core.is_global_admin());

-- ── CLIENT CONTACTS ───────────────────────────────────────────────────────────

create policy client_contacts_select
  on core.client_contacts for select to authenticated
  using (true);

create policy client_contacts_insert
  on core.client_contacts for insert to authenticated
  with check (core.is_global_admin());

create policy client_contacts_update
  on core.client_contacts for update to authenticated
  using (core.is_global_admin())
  with check (core.is_global_admin());

create policy client_contacts_delete
  on core.client_contacts for delete to authenticated
  using (core.is_global_admin());

-- ── TEAM MEMBERS ─────────────────────────────────────────────────────────────
-- Every authenticated user can read team members (needed for assignee pickers).
-- Only admins/Dirección can mutate.

create policy team_members_select
  on core.team_members for select to authenticated
  using (true);

create policy team_members_insert
  on core.team_members for insert to authenticated
  with check (core.is_global_admin());

create policy team_members_update
  on core.team_members for update to authenticated
  using (core.is_global_admin())
  with check (core.is_global_admin());

create policy team_members_delete
  on core.team_members for delete to authenticated
  using (core.is_global_admin());

-- ── PROJECTS ─────────────────────────────────────────────────────────────────
-- Everyone can read projects they are a member of (or all if admin).
-- Insert/update/delete restricted to project members with sufficient role.

create policy projects_select
  on core.projects for select to authenticated
  using (
    core.is_global_admin()
    or core.is_project_member(id)
  );

create policy projects_insert
  on core.projects for insert to authenticated
  with check (
    core.current_user_role() in (
      'Administrador', 'Dirección',
      'Jefe de Taller', 'Jefe de Construcción', 'Arquitecto Senior'
    )
  );

create policy projects_update
  on core.projects for update to authenticated
  using (
    core.is_global_admin()
    or core.is_project_member(id)
  )
  with check (
    core.current_user_role() in (
      'Administrador', 'Dirección',
      'Jefe de Taller', 'Jefe de Construcción', 'Arquitecto Senior'
    )
  );

create policy projects_delete
  on core.projects for delete to authenticated
  using (core.is_global_admin());

-- ── PROJECT DRIVE LINKS ───────────────────────────────────────────────────────

create policy project_drive_links_select
  on core.project_drive_links for select to authenticated
  using (
    core.is_global_admin()
    or core.is_project_member(project_id)
  );

create policy project_drive_links_insert
  on core.project_drive_links for insert to authenticated
  with check (
    core.is_global_admin()
    or core.is_project_member(project_id)
  );

create policy project_drive_links_update
  on core.project_drive_links for update to authenticated
  using (
    core.is_global_admin()
    or core.is_project_member(project_id)
  )
  with check (
    core.is_global_admin()
    or core.is_project_member(project_id)
  );

create policy project_drive_links_delete
  on core.project_drive_links for delete to authenticated
  using (
    core.is_global_admin()
    or core.is_project_member(project_id)
  );

-- ── PROJECT MEMBERS ───────────────────────────────────────────────────────────
-- Readable by project members; mutations by admins only.

create policy project_members_select
  on core.project_members for select to authenticated
  using (
    core.is_global_admin()
    or core.is_project_member(project_id)
  );

create policy project_members_insert
  on core.project_members for insert to authenticated
  with check (core.is_global_admin());

create policy project_members_update
  on core.project_members for update to authenticated
  using (core.is_global_admin())
  with check (core.is_global_admin());

create policy project_members_delete
  on core.project_members for delete to authenticated
  using (core.is_global_admin());

-- ── ACTIVITIES ────────────────────────────────────────────────────────────────

create policy activities_select
  on core.activities for select to authenticated
  using (
    core.is_global_admin()
    or core.is_project_member(project_id)
  );

create policy activities_insert
  on core.activities for insert to authenticated
  with check (
    core.is_global_admin()
    or core.is_project_member(project_id)
  );

create policy activities_update
  on core.activities for update to authenticated
  using (
    core.is_global_admin()
    or core.is_project_member(project_id)
  )
  with check (
    core.is_global_admin()
    or core.is_project_member(project_id)
  );

create policy activities_delete
  on core.activities for delete to authenticated
  using (
    core.is_global_admin()
    or (
      core.is_project_member(project_id)
      and core.current_user_role() in (
        'Jefe de Taller', 'Jefe de Construcción', 'Arquitecto Senior'
      )
    )
  );

-- ── ACTIVITY SUPPORT MEMBERS ──────────────────────────────────────────────────

create policy activity_support_members_select
  on core.activity_support_members for select to authenticated
  using (
    core.is_global_admin()
    or exists (
      select 1 from core.activities a
      where a.id = activity_id
        and (core.is_global_admin() or core.is_project_member(a.project_id))
    )
  );

create policy activity_support_members_insert
  on core.activity_support_members for insert to authenticated
  with check (
    core.is_global_admin()
    or exists (
      select 1 from core.activities a
      where a.id = activity_id
        and core.is_project_member(a.project_id)
    )
  );

create policy activity_support_members_update
  on core.activity_support_members for update to authenticated
  using (
    core.is_global_admin()
    or exists (
      select 1 from core.activities a
      where a.id = activity_id
        and core.is_project_member(a.project_id)
    )
  )
  with check (
    core.is_global_admin()
    or exists (
      select 1 from core.activities a
      where a.id = activity_id
        and core.is_project_member(a.project_id)
    )
  );

create policy activity_support_members_delete
  on core.activity_support_members for delete to authenticated
  using (
    core.is_global_admin()
    or exists (
      select 1 from core.activities a
      where a.id = activity_id
        and core.is_project_member(a.project_id)
    )
  );

-- ── ACTIVITY HISTORY ──────────────────────────────────────────────────────────

create policy activity_history_select
  on core.activity_history for select to authenticated
  using (
    core.is_global_admin()
    or exists (
      select 1 from core.activities a
      where a.id = activity_id
        and core.is_project_member(a.project_id)
    )
  );

create policy activity_history_insert
  on core.activity_history for insert to authenticated
  with check (
    core.is_global_admin()
    or exists (
      select 1 from core.activities a
      where a.id = activity_id
        and core.is_project_member(a.project_id)
    )
  );

create policy activity_history_update
  on core.activity_history for update to authenticated
  using (core.is_global_admin())
  with check (core.is_global_admin());

create policy activity_history_delete
  on core.activity_history for delete to authenticated
  using (core.is_global_admin());

-- ── ACTIVITY CHECKLIST ITEMS ──────────────────────────────────────────────────

create policy activity_checklist_items_select
  on core.activity_checklist_items for select to authenticated
  using (
    core.is_global_admin()
    or exists (
      select 1 from core.activities a
      where a.id = activity_id
        and core.is_project_member(a.project_id)
    )
  );

create policy activity_checklist_items_insert
  on core.activity_checklist_items for insert to authenticated
  with check (
    core.is_global_admin()
    or exists (
      select 1 from core.activities a
      where a.id = activity_id
        and core.is_project_member(a.project_id)
    )
  );

create policy activity_checklist_items_update
  on core.activity_checklist_items for update to authenticated
  using (
    core.is_global_admin()
    or exists (
      select 1 from core.activities a
      where a.id = activity_id
        and core.is_project_member(a.project_id)
    )
  )
  with check (
    core.is_global_admin()
    or exists (
      select 1 from core.activities a
      where a.id = activity_id
        and core.is_project_member(a.project_id)
    )
  );

create policy activity_checklist_items_delete
  on core.activity_checklist_items for delete to authenticated
  using (
    core.is_global_admin()
    or exists (
      select 1 from core.activities a
      where a.id = activity_id
        and core.is_project_member(a.project_id)
    )
  );

-- ── CONTRACTORS ───────────────────────────────────────────────────────────────

create policy contractors_select
  on core.contractors for select to authenticated
  using (true);

create policy contractors_insert
  on core.contractors for insert to authenticated
  with check (
    core.current_user_role() in (
      'Administrador', 'Dirección',
      'Jefe de Taller', 'Jefe de Construcción', 'Arquitecto Senior'
    )
  );

create policy contractors_update
  on core.contractors for update to authenticated
  using (
    core.current_user_role() in (
      'Administrador', 'Dirección',
      'Jefe de Taller', 'Jefe de Construcción', 'Arquitecto Senior'
    )
  )
  with check (
    core.current_user_role() in (
      'Administrador', 'Dirección',
      'Jefe de Taller', 'Jefe de Construcción', 'Arquitecto Senior'
    )
  );

create policy contractors_delete
  on core.contractors for delete to authenticated
  using (core.is_global_admin());

-- ── CONTRACTOR CATEGORIES ─────────────────────────────────────────────────────

create policy contractor_categories_select
  on core.contractor_categories for select to authenticated
  using (true);

create policy contractor_categories_insert
  on core.contractor_categories for insert to authenticated
  with check (core.is_global_admin());

create policy contractor_categories_update
  on core.contractor_categories for update to authenticated
  using (core.is_global_admin())
  with check (core.is_global_admin());

create policy contractor_categories_delete
  on core.contractor_categories for delete to authenticated
  using (core.is_global_admin());

-- ── COLLABORATOR PROVIDERS ────────────────────────────────────────────────────

create policy collaborator_providers_select
  on core.collaborator_providers for select to authenticated
  using (true);

create policy collaborator_providers_insert
  on core.collaborator_providers for insert to authenticated
  with check (core.is_global_admin());

create policy collaborator_providers_update
  on core.collaborator_providers for update to authenticated
  using (core.is_global_admin())
  with check (core.is_global_admin());

create policy collaborator_providers_delete
  on core.collaborator_providers for delete to authenticated
  using (core.is_global_admin());

-- ── COLLABORATOR CATEGORIES ───────────────────────────────────────────────────

create policy collaborator_categories_select
  on core.collaborator_categories for select to authenticated
  using (true);

create policy collaborator_categories_insert
  on core.collaborator_categories for insert to authenticated
  with check (core.is_global_admin());

create policy collaborator_categories_update
  on core.collaborator_categories for update to authenticated
  using (core.is_global_admin())
  with check (core.is_global_admin());

create policy collaborator_categories_delete
  on core.collaborator_categories for delete to authenticated
  using (core.is_global_admin());

-- ── COLLABORATOR SKILLS ───────────────────────────────────────────────────────

create policy collaborator_skills_select
  on core.collaborator_skills for select to authenticated
  using (true);

create policy collaborator_skills_insert
  on core.collaborator_skills for insert to authenticated
  with check (core.is_global_admin());

create policy collaborator_skills_update
  on core.collaborator_skills for update to authenticated
  using (core.is_global_admin())
  with check (core.is_global_admin());

create policy collaborator_skills_delete
  on core.collaborator_skills for delete to authenticated
  using (core.is_global_admin());

-- ── STORES ───────────────────────────────────────────────────────────────────

create policy stores_select
  on core.stores for select to authenticated
  using (true);

create policy stores_insert
  on core.stores for insert to authenticated
  with check (core.is_global_admin());

create policy stores_update
  on core.stores for update to authenticated
  using (core.is_global_admin())
  with check (core.is_global_admin());

create policy stores_delete
  on core.stores for delete to authenticated
  using (core.is_global_admin());

-- ── STORE CATEGORIES ──────────────────────────────────────────────────────────

create policy store_categories_select
  on core.store_categories for select to authenticated
  using (true);

create policy store_categories_insert
  on core.store_categories for insert to authenticated
  with check (core.is_global_admin());

create policy store_categories_update
  on core.store_categories for update to authenticated
  using (core.is_global_admin())
  with check (core.is_global_admin());

create policy store_categories_delete
  on core.store_categories for delete to authenticated
  using (core.is_global_admin());

-- ── RESOURCE LINKS ────────────────────────────────────────────────────────────
-- Corporate sections visible to all authenticated users.
-- Mutations scoped by section and owner.

create policy resource_links_select
  on core.resource_links for select to authenticated
  using (true);

create policy resource_links_insert
  on core.resource_links for insert to authenticated
  with check (
    core.is_global_admin()
    or (
      -- Project members can add resources to project-scoped sections
      section != 'empresa'
    )
  );

create policy resource_links_update
  on core.resource_links for update to authenticated
  using (
    core.is_global_admin()
    or owner_team_member_legacy_id in (
      select tm.legacy_id
      from core.team_members tm
      where lower(tm.institutional_email) = lower(auth.email())
        and tm.deleted_at is null
    )
    or personal_for_team_member_legacy_id in (
      select tm.legacy_id
      from core.team_members tm
      where lower(tm.institutional_email) = lower(auth.email())
        and tm.deleted_at is null
    )
  )
  with check (
    core.is_global_admin()
    or owner_team_member_legacy_id in (
      select tm.legacy_id
      from core.team_members tm
      where lower(tm.institutional_email) = lower(auth.email())
        and tm.deleted_at is null
    )
    or personal_for_team_member_legacy_id in (
      select tm.legacy_id
      from core.team_members tm
      where lower(tm.institutional_email) = lower(auth.email())
        and tm.deleted_at is null
    )
  );

create policy resource_links_delete
  on core.resource_links for delete to authenticated
  using (
    core.is_global_admin()
    or owner_team_member_legacy_id in (
      select tm.legacy_id
      from core.team_members tm
      where lower(tm.institutional_email) = lower(auth.email())
        and tm.deleted_at is null
    )
  );
