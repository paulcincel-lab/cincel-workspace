# Phase 1: Postgres + Drizzle Foundation

## Goal
A real Postgres database running locally with Drizzle ORM schema, migrations, and seed script in place -- app still runs on localStorage data source (no behavior change).

## Deliverables

### Backend
- [ ] `lib/db/client.ts` -- singleton `postgres()` connection + `drizzle(...)`, reads `DATABASE_URL`, `import "server-only"`
- [ ] `lib/db/schema/` -- one file per domain mirroring `supabase/migrations/202607270002_core_tables.sql` (18 tables in `core` schema: `clients`, `client_contacts`, `team_members`, `projects`, `project_drive_links`, `project_members`, `activities`, `activity_support_members`, `activity_history`, `activity_checklist_items`, `contractors`, `contractor_categories`, `collaborator_providers`, `collaborator_categories`, `collaborator_skills`, `stores`, `store_categories`, `resource_links`) plus placeholder `sessions` and `auth_credentials` tables (populated in Phase 3)
- [ ] `lib/db/schema/` -- reproduce enums (`client_kind`, `workflow_type`, `task_status`, `task_priority`), `legacy_id` unique columns, `deleted_at` soft-delete, `updated_at` trigger (or handle in code)
- [ ] `lib/db/index.ts` -- barrel re-exporting `db` + schema
- [ ] `drizzle.config.ts` -- `schema: ./lib/db/schema`, `out: ./lib/db/migrations`, `schemaFilter: ["core"]`
- [ ] `scripts/seed.ts` -- minimal seed only: role catalog, full `teamMembers` roster from `lib/data/team.ts`, 2-3 demo projects/clients from `lib/data/projects.ts`. Idempotent (`onConflictDoUpdate` on `legacy_id`)
- [ ] `lib/data/*.ts` files remain as seed data source and TypeScript type origins (no deletion)

### Frontend
- [ ] No frontend changes (app still boots on `localstorage` data source)

### Infrastructure
- [ ] `docker-compose.yml` -- add `db` service (`postgres:17-alpine`), named volume, healthcheck, `POSTGRES_DB/USER/PASSWORD`
- [ ] `DATABASE_URL` added to `app` `env_file` and `.env.example`
- [ ] Dependencies: `drizzle-orm`, `postgres` (postgres.js driver); dev: `drizzle-kit`, `tsx`
- [ ] `package.json` scripts: `db:generate`, `db:migrate`, `db:seed`, `db:studio`

## Done Definition
- `docker compose up db` starts Postgres and passes healthcheck
- `npm run db:migrate` applies all migrations without error
- `npm run db:seed` populates team members, role catalog, and demo projects/clients
- `npm run db:studio` opens and shows tables with seeded rows
- App still boots with `NEXT_PUBLIC_CINCEL_DATA_SOURCE=localstorage` and behaves identically to today
- `npm run test:unit` passes (no regressions)

## Parallel work
- BE: schema files + drizzle config can run alongside INFRA: docker-compose db service setup
- BE: seed script can start once schema files exist

## Phase dependencies
- Requires: none

## Complexity
- Backend: M
- Frontend: S (no changes)
- Infra: S

## Risks
- Schema drift between existing SQL migrations and new Drizzle schema definitions -- careful comparison needed against `supabase/migrations/202607270002_core_tables.sql`
- `legacy_id` mapping must be consistent so Phase 2 repository rewrites find rows by the same IDs the app currently uses
