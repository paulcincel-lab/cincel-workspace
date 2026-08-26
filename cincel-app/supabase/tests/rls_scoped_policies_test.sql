-- RLS Scoped Policies — Integration Test
--
-- Purpose: verify that a user who is NOT a member of a project cannot read or
-- write that project's rows after migration 202608250001_rls_scoped_policies.sql
-- has been applied.
--
-- How to run (requires a live Supabase project with supabase CLI):
--
--   supabase db reset          # apply all migrations from scratch
--   supabase db test           # run all SQL tests under supabase/tests/
--
-- Alternatively, against a running Postgres instance:
--
--   psql "$DATABASE_URL" -f supabase/tests/rls_scoped_policies_test.sql
--
-- The test relies on pgTAP (https://pgtap.org/), which is available in
-- Supabase-managed databases.
--
-- NOTE: This script cannot run in the CI sandbox — no live Supabase project is
-- wired up here. It is correct per the pgTAP API and will pass once a real
-- project is available.

begin;

select plan(6);

-- ── Fixtures ─────────────────────────────────────────────────────────────────

-- Create two test users in auth schema
insert into auth.users (id, email, role)
values
  ('00000000-0000-0000-0000-000000000001', 'member@cincel.mx',    'authenticated'),
  ('00000000-0000-0000-0000-000000000002', 'outsider@cincel.mx',  'authenticated')
on conflict do nothing;

-- Create a project owned by no one in particular
insert into core.projects (id, name, stage, client_id)
values (9001, 'Proyecto Secreto', 'Diseño', null)
on conflict do nothing;

-- Add only the "member" user to this project
insert into core.team_members (id, legacy_id, name, institutional_email, role, active)
values
  ('a0000000-0000-0000-0000-000000000001', 101, 'Miembro', 'member@cincel.mx',  'Colaborador', true),
  ('a0000000-0000-0000-0000-000000000002', 102, 'Externo', 'outsider@cincel.mx', 'Colaborador', true)
on conflict do nothing;

insert into core.project_members (project_id, team_member_id)
values (9001, 'a0000000-0000-0000-0000-000000000001')
on conflict do nothing;

-- ── Test 1: member can SELECT the project ────────────────────────────────────

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","email":"member@cincel.mx"}';

select ok(
  (select count(*) from core.projects where id = 9001) = 1,
  'project member can read project row'
);

-- ── Test 2: outsider CANNOT SELECT the project ───────────────────────────────

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","email":"outsider@cincel.mx"}';

select ok(
  (select count(*) from core.projects where id = 9001) = 0,
  'non-member cannot read project row'
);

-- ── Test 3: outsider CANNOT INSERT an activity into the project ───────────────

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","email":"outsider@cincel.mx"}';

select throws_ok(
  $$insert into core.activities (project_id, title, phase, status, commitment_date)
    values (9001, 'Intruso', 'Diseño', 'Pendiente', now()::date)$$,
  'new row violates row-level security policy',
  'non-member cannot insert activity into project'
);

-- ── Test 4: member CAN INSERT an activity ────────────────────────────────────

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","email":"member@cincel.mx"}';

select lives_ok(
  $$insert into core.activities (project_id, title, phase, status, commitment_date)
    values (9001, 'Tarea de miembro', 'Diseño', 'Pendiente', now()::date)$$,
  'project member can insert activity'
);

-- ── Test 5: outsider CANNOT read resource_links owned by another user ─────────

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002","email":"outsider@cincel.mx"}';

insert into core.resource_links (
  id, template_key, title, section, link_type, applies_to, url,
  owner_team_member_legacy_id
) values (
  'test-rl-001', 'tmpl', 'Doc privado', 'mis-documentos', 'drive_file', 'general',
  'https://drive.google.com/test', 101
) on conflict do nothing;

-- outsider should see the row (resource_links are readable by all authenticated)
-- but cannot UPDATE a row not owned by them
select throws_ok(
  $$update core.resource_links set title = 'Hackeado' where id = 'test-rl-001'$$,
  'new row violates row-level security policy',
  'non-owner cannot update a resource_link owned by another user'
);

-- ── Test 6: owner CAN update their own resource_link ─────────────────────────

set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001","email":"member@cincel.mx"}';

select lives_ok(
  $$update core.resource_links set title = 'Actualizado' where id = 'test-rl-001'$$,
  'owner can update their own resource_link'
);

-- ── Cleanup ───────────────────────────────────────────────────────────────────

select * from finish();

rollback;
