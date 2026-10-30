# monday Migration Phase 1: Schema, Drive Foundations + Export

## Goal
The database has every table and column the migration and its new app features need, the shared Drive layer exists, and `npm run monday -- export` turns a client's monday account into a complete, resumable export folder.

## Deliverables

### Backend
- [ ] One Drizzle migration (BE §8): `lib/db/schema/import.ts` (`import_batch_status` enum, `core.import_batches`, `core.import_refs` with PK `(source, entity, external_id)` + `row_updated_at`, `core.import_files`); project Drive columns + `drive_folder_status` enum + `drive_import_folder_id` on `core.projects`; `tasks.parent_task_id` (self FK, `on delete set null`, `idx_tasks_parent_task_id`); `dependency_kind` enum + `core.task_dependencies` (uuid `id`, pair unique, not-self check). Types re-exported; `db:setup` and the seed still run
- [ ] `lib/import/refs.ts`: insert/lookup helpers for `import_refs`; every function takes `db`; no `server-only`, no `lib/db/client.ts` import (BE §2, §8)
- [ ] `lib/google/drive-admin.ts` (**issue #483**): service-account Drive client taking credentials as parameters; create folder, rename, get (id, name, parents, trashed), list, get media, export, resumable upload, **trash**; `supportsAllDrives` on every call (BE §2, §10)
- [ ] `lib/google/project-folders.ts`: `ensureProjectFolders(db, drive, projectId, sharedDriveId)` creates the project folder + `01 Interno` / `02 Cliente` / `03 Del cliente`, fills the `drive_*` columns and `drive_folder_status`; idempotent (re-run reuses existing ids). Called by the CLI only in this feature (BE §2, §10)
- [ ] `scripts/monday/db.ts`: own drizzle client (postgres-js, max 1), like `scripts/seed.ts` (BE §2, §0.2)
- [ ] `scripts/monday/cli.ts` entry with `export | init | plan | apply | rollback` subcommands (later ones stub "not implemented"); `MONDAY_TOKEN` from env / git-ignored `.env.monday`, else hidden prompt; token never flagged, written or logged (BE §2.1)
- [ ] `scripts/monday/client.ts`: GraphQL client with `API-Version: 2026-07`; `errors[]` on HTTP 200 = failed page, never partial writes; `retry_in_seconds` / `Retry-After` sleep, max 5 attempts; complexity-exceeded → smaller page and retry; cursor-expiry → restart board (BE §3)
- [ ] `graphql-codegen` (dev dependency) against the 2026-07 schema; typed fragments incl. `DateValue`, `CheckboxValue`, `NumbersValue`, `EmailValue`, `PhoneValue` (BE §4.2)
- [ ] `scripts/monday/export.ts`: call estimate + y/N prompt (BE §4.3); boards with `hierarchy_types: [classic, multi_level]`; items paged (200, 50 on multi-level) with subitems to 5 levels; subitem board columns; updates batched 100 ids with per-item paging past 100; users; asset download right after `public_url` with sha256 and 3 retries → `manifest.errors[]`; output layout §4.1 with per-board `.done` resume; `--boards`, `--no-files`, `--no-updates` (BE §4)
- [ ] Vitest with fixtures in `scripts/monday/__fixtures__/`: client error/retry cases, export resume, update paging past 100, 5-level subitems (BE §11)
- [ ] Unit test for `ensureProjectFolders` idempotency with a fake Drive (BE §10, §11)

### Frontend
- [ ] None (schema-only changes to task types are added in Phase 4)

### Infrastructure
- [ ] `npm run monday` script (`tsx scripts/monday/cli.ts`) in `package.json` (BE §2.1)
- [ ] `exports/` and `.env.monday` in `.gitignore`; `exports/` in `.dockerignore` (BE §2.1)
- [ ] `GOOGLE_SHARED_DRIVE_ID` added to `.env.example` and docs; Shared Drive created with the service account as Content manager (BE §2.1, §10)

## Done Definition
- Migration applies cleanly on a fresh DB and on a copy of production; `npm run typecheck`, lint and existing tests pass
- `ensureProjectFolders` run twice against a test project in the Shared Drive creates one folder + three subfolders and sets `drive_folder_status = ready` (§10)
- Export of a test account produces the §4.1 layout; killing it mid-way and re-running skips `.done` boards; an item with 150 updates keeps all of them (BE §12 #1)
- A 200 response with `errors[]` never writes a partial page (unit test)
- Grepping `scripts/monday`, `lib/import`, `lib/google/drive-admin.ts`, `lib/google/project-folders.ts` finds no `server-only` import

## Parallel work
- Migration + `lib/import/refs.ts` first (small; unblocks Phase 4 and later phases)
- Then in parallel: Drive track (`drive-admin.ts` #483 → `ensureProjectFolders`) ∥ monday track (`client.ts` + codegen → `export.ts`)
- Phase 4 (app features) can start as soon as the migration is merged

## Phase dependencies
- Requires: none (highest priority; ships before Staff SSO and Client Portal)
- Unblocks: monday Migration Phase 2 (export files), Phase 3 (Drive + schema), Phase 4 (schema); Staff SSO Phase 3 (reuses `drive-admin.ts`, `ensureProjectFolders`, Drive columns, `GOOGLE_SHARED_DRIVE_ID`)

## Complexity
- Backend: L
- Frontend: S
- Infra: S

## Risks
- monday 2026-07 schema details only verified for six typed fragments in the spike; codegen may surface differences
- Complexity limits on multi-level boards with 5 nested subitem levels; page-size fallback must be tested against a real account
- Shared Drive permissions for the service account must exist before the Drive tests can run against real Drive
