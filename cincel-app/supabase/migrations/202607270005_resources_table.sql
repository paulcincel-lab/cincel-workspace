-- Sprint 11.2 - Resources module persistence in Supabase (idempotent)

create table if not exists core.resource_links (
  id text primary key,
  template_key text not null,
  title text not null,
  section text not null,
  subsection text,
  link_type text not null,
  applies_to text not null,
  url text not null,
  status text not null default 'vigente',
  owner_team_member_legacy_id bigint,
  personal_for_team_member_legacy_id bigint,
  updated_at_label text,
  history jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint resource_links_section_check check (
    section in ('mis-documentos', 'mis-favoritos', 'plantillas-diseno', 'formatos-obra', 'mis-vacaciones', 'formacion', 'empresa')
  ),
  constraint resource_links_subsection_check check (
    subsection is null or subsection in ('diseno', 'construccion')
  ),
  constraint resource_links_link_type_check check (
    link_type in ('drive_folder', 'drive_file', 'web')
  ),
  constraint resource_links_applies_to_check check (
    applies_to in ('general', 'diseno', 'construccion', 'ambos')
  ),
  constraint resource_links_status_check check (
    status in ('vigente', 'obsoleto')
  )
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_resource_links_updated_at') THEN
    CREATE TRIGGER trg_resource_links_updated_at
    BEFORE UPDATE ON core.resource_links
    FOR EACH ROW
    EXECUTE FUNCTION core.set_updated_at();
  END IF;
END$$;

create index if not exists idx_resource_links_section on core.resource_links(section);
create index if not exists idx_resource_links_subsection on core.resource_links(subsection);
create index if not exists idx_resource_links_status on core.resource_links(status);
create index if not exists idx_resource_links_owner_team_member_legacy_id on core.resource_links(owner_team_member_legacy_id);
create index if not exists idx_resource_links_personal_for_team_member_legacy_id on core.resource_links(personal_for_team_member_legacy_id);
create index if not exists idx_resource_links_deleted_at on core.resource_links(deleted_at);

alter table if exists core.resource_links enable row level security;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'core'
      AND tablename = 'resource_links'
      AND policyname = 'resource_links_authenticated_select'
  ) THEN
    CREATE POLICY resource_links_authenticated_select
      ON core.resource_links
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'core'
      AND tablename = 'resource_links'
      AND policyname = 'resource_links_authenticated_insert'
  ) THEN
    CREATE POLICY resource_links_authenticated_insert
      ON core.resource_links
      FOR INSERT
      TO authenticated
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'core'
      AND tablename = 'resource_links'
      AND policyname = 'resource_links_authenticated_update'
  ) THEN
    CREATE POLICY resource_links_authenticated_update
      ON core.resource_links
      FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'core'
      AND tablename = 'resource_links'
      AND policyname = 'resource_links_authenticated_delete'
  ) THEN
    CREATE POLICY resource_links_authenticated_delete
      ON core.resource_links
      FOR DELETE
      TO authenticated
      USING (true);
  END IF;
END$$;
