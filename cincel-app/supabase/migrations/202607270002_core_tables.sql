-- Sprint 11.1 - Core tables (idempotent)

create table if not exists core.clients (
  id uuid primary key default gen_random_uuid(),
  legacy_id bigint unique,
  name text not null,
  kind core.client_kind not null default 'Particular',
  phone text,
  acquisition_channel text,
  total_spent_mxn numeric(14,2) not null default 0,
  total_projects_worked integer not null default 0,
  first_work_date date,
  has_active_project boolean not null default false,
  active_project_name text,
  active_project_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists core.client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references core.clients(id),
  name text not null,
  role text,
  phone text,
  email text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists core.team_members (
  id uuid primary key default gen_random_uuid(),
  legacy_id bigint unique,
  name text not null,
  birth_date text,
  nationality text,
  phone text,
  institutional_email text,
  address text,
  marital_status text,
  home_phone text,
  personal_email text,
  curp text,
  rfc text,
  emergency_contact jsonb,
  role text,
  area text,
  capacity integer not null default 0,
  availability text,
  active boolean not null default true,
  auth jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists core.projects (
  id uuid primary key default gen_random_uuid(),
  legacy_id bigint unique,
  code text unique,
  name text not null,
  status text,
  active boolean not null default true,
  client_id uuid references core.clients(id),
  project_type text,
  stage text,
  phase text,
  address_street text,
  address_city text,
  address_state text,
  manager_name text,
  coordinator_name text,
  progress integer not null default 0,
  start_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint projects_progress_range check (progress >= 0 and progress <= 100)
);

create table if not exists core.project_drive_links (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references core.projects(id),
  administrativo_url text,
  planos_url text,
  renders_url text,
  reportes_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists core.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references core.projects(id),
  team_member_id uuid references core.team_members(id),
  member_name_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (project_id, team_member_id)
);

create table if not exists core.activities (
  id uuid primary key default gen_random_uuid(),
  legacy_id bigint,
  project_id uuid references core.projects(id),
  project_name_snapshot text,
  workflow core.workflow_type not null,
  phase text,
  description text not null,
  notes text,
  manager_member_id uuid references core.team_members(id),
  manager_name_snapshot text,
  status core.task_status not null,
  priority core.task_priority not null,
  commitment_date date,
  review_date date,
  delivery_date date,
  archived boolean not null default false,
  created_at_label text,
  updated_at_label text,
  created_on date,
  updated_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists core.activity_support_members (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references core.activities(id),
  team_member_id uuid references core.team_members(id),
  support_name_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (activity_id, team_member_id, support_name_snapshot)
);

create table if not exists core.activity_history (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references core.activities(id),
  legacy_id bigint,
  author_member_id uuid references core.team_members(id),
  author_name_snapshot text,
  event_date date,
  comment text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists core.activity_checklist_items (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null references core.activities(id),
  legacy_id bigint,
  title text not null,
  completed boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists core.contractors (
  id uuid primary key default gen_random_uuid(),
  legacy_id bigint unique,
  company text,
  provider text not null,
  status text,
  main_specialty text,
  seniority text,
  price_level text,
  rating integer not null default 0,
  web_page text,
  contact text,
  start_date date,
  comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists core.contractor_categories (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references core.contractors(id),
  category text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists core.collaborator_providers (
  id uuid primary key default gen_random_uuid(),
  legacy_id bigint unique,
  name text not null,
  role text,
  status text,
  department text,
  contact text,
  email text,
  seniority text,
  price_level text,
  availability text,
  rating integer not null default 0,
  start_date date,
  comments text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists core.collaborator_categories (
  id uuid primary key default gen_random_uuid(),
  collaborator_id uuid not null references core.collaborator_providers(id),
  category text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists core.collaborator_skills (
  id uuid primary key default gen_random_uuid(),
  collaborator_id uuid not null references core.collaborator_providers(id),
  skill text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists core.stores (
  id uuid primary key default gen_random_uuid(),
  legacy_id bigint unique,
  name text not null,
  company text,
  status text,
  store_type text,
  main_specialty text,
  location text,
  contact text,
  rating integer not null default 0,
  price_level text,
  start_date date,
  comments text,
  website text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists core.store_categories (
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references core.stores(id),
  category text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- update trigger per table
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_clients_updated_at') THEN
    CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON core.clients FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_client_contacts_updated_at') THEN
    CREATE TRIGGER trg_client_contacts_updated_at BEFORE UPDATE ON core.client_contacts FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_team_members_updated_at') THEN
    CREATE TRIGGER trg_team_members_updated_at BEFORE UPDATE ON core.team_members FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_projects_updated_at') THEN
    CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON core.projects FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_project_drive_links_updated_at') THEN
    CREATE TRIGGER trg_project_drive_links_updated_at BEFORE UPDATE ON core.project_drive_links FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_project_members_updated_at') THEN
    CREATE TRIGGER trg_project_members_updated_at BEFORE UPDATE ON core.project_members FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_activities_updated_at') THEN
    CREATE TRIGGER trg_activities_updated_at BEFORE UPDATE ON core.activities FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_activity_support_members_updated_at') THEN
    CREATE TRIGGER trg_activity_support_members_updated_at BEFORE UPDATE ON core.activity_support_members FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_activity_history_updated_at') THEN
    CREATE TRIGGER trg_activity_history_updated_at BEFORE UPDATE ON core.activity_history FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_activity_checklist_items_updated_at') THEN
    CREATE TRIGGER trg_activity_checklist_items_updated_at BEFORE UPDATE ON core.activity_checklist_items FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_contractors_updated_at') THEN
    CREATE TRIGGER trg_contractors_updated_at BEFORE UPDATE ON core.contractors FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_contractor_categories_updated_at') THEN
    CREATE TRIGGER trg_contractor_categories_updated_at BEFORE UPDATE ON core.contractor_categories FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_collaborator_providers_updated_at') THEN
    CREATE TRIGGER trg_collaborator_providers_updated_at BEFORE UPDATE ON core.collaborator_providers FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_collaborator_categories_updated_at') THEN
    CREATE TRIGGER trg_collaborator_categories_updated_at BEFORE UPDATE ON core.collaborator_categories FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_collaborator_skills_updated_at') THEN
    CREATE TRIGGER trg_collaborator_skills_updated_at BEFORE UPDATE ON core.collaborator_skills FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_stores_updated_at') THEN
    CREATE TRIGGER trg_stores_updated_at BEFORE UPDATE ON core.stores FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_store_categories_updated_at') THEN
    CREATE TRIGGER trg_store_categories_updated_at BEFORE UPDATE ON core.store_categories FOR EACH ROW EXECUTE FUNCTION core.set_updated_at();
  END IF;
END$$;
