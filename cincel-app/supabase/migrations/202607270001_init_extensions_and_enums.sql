-- Sprint 11.1 - Init extensions, schema and enums (idempotent)

create extension if not exists pgcrypto;

create schema if not exists core;

-- enums
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'client_kind' AND n.nspname = 'core'
  ) THEN
    CREATE TYPE core.client_kind AS ENUM ('Empresa', 'Particular');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'workflow_type' AND n.nspname = 'core'
  ) THEN
    CREATE TYPE core.workflow_type AS ENUM ('Presale', 'Diseno', 'Construccion');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'task_status' AND n.nspname = 'core'
  ) THEN
    CREATE TYPE core.task_status AS ENUM ('Pendiente', 'En proceso', 'Completado', 'Bloqueado');
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'task_priority' AND n.nspname = 'core'
  ) THEN
    CREATE TYPE core.task_priority AS ENUM ('Alta', 'Media', 'Baja');
  END IF;
END$$;

-- common trigger function
create or replace function core.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
