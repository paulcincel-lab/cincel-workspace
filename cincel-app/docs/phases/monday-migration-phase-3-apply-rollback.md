# monday Migration Phase 3: Apply + Rollback

## Goal
`apply` writes a clean plan into Cincel in one DB transaction plus a resumable Drive phase without ever duplicating, and `rollback` fully undoes a batch (Drive included) before go-live.

## Deliverables

### Backend
- [ ] `scripts/monday/apply.ts` (BE §7): `--by` must be an active staff email; resume an `applying` batch for the same `account_id` (phase B only); otherwise run plan and abort on any blocking issue
- [ ] Phase A, one transaction: `import_batches (applying)` → contacts (+`contact_people`, `provider_profiles`) → projects → `project_schedules` → tasks → child tasks → checklist → `task_support` → `task_dependencies` → `history_events` → `schedule_tasks`; `import_files (pending)`; `import_refs` for every created row with `row_updated_at`; rows already in `import_refs` skipped; empty batch → "Nada nuevo que importar", marked `applied`
- [ ] Phase B, idempotent and resumable: per project `ensureProjectFolders` (skip root when `drive_folder_id` set) + `01 Interno/Importado de monday/<group>`; `drive_*` columns + refresh `import_refs.row_updated_at`; per pending `import_files` resumable upload → `drive_files` + `task_links` / `project_links` (`kind = 'interno'`) with `import_refs`, `import_files.drive_file_id`; finally `status = applied` + stats; never `02 Cliente`
- [ ] `scripts/monday/rollback.ts` (BE §9): step 1 refuse and print every blocker (edited rows via `row_updated_at`, foreign `history_events`, every non-batch row pointing at a batch row listed in §9.1, `project_portal_access` once it exists); step 2 one transaction deleting in the §9.2 reverse order, then `import_files`/`import_refs`, `status = rolled_back`; step 3 after commit trash uploaded files, import folders and project folders the batch created; `--drive-only` retry for a `rolled_back` batch
- [ ] Wire `apply` and `rollback` into `cli.ts`; summary prints batch id
- [ ] Integration tests (test Postgres, fake Drive) (BE §11): apply = plan counts + `import_refs`; apply twice creates nothing; blocking issue writes nothing; phase B resume without duplicate uploads; rollback after phase B removes everything; rollback refuses after a staff comment, an edit, a new project for an imported client and a manual dependency, naming each

### Frontend
- [ ] None (imported data shows in existing screens, FE §2.5)

### Infrastructure
- [ ] Runbook in `docs/` per client (BE §9 flowchart): staging first via SSH tunnel, token revocation, export archive handoff, 30-day deletion of the working copy

## Done Definition
- BE §12 #3, #4, #5, #10, #11, #12 pass: refuse-and-write-nothing; counts match `plan.md`; re-apply is a no-op; files in `01 Interno/Importado de monday/<group>` linked on task/project; killing phase B and re-running finishes without duplicates; rollback after phase B removes all rows in one transaction then trashes Drive; refuses after a staff comment and names it
- Imported checklist items, task comments, cronograma rows and Drive links appear in existing screens on staging (FE §6 #5)
- End-to-end run of the test account's export against staging, spot-checked (BE §11 manual)

## Parallel work
- `apply.ts` phase A ∥ `rollback.ts` blocker checks (both read the §8 schema); phase B and rollback Drive step after
- Runs in parallel with monday Migration Phase 4 (app features)

## Phase dependencies
- Requires: monday Migration Phase 2 (`translate.ts`, `plan.ts`); Phase 1 (`drive-admin.ts` incl. `trash`, `ensureProjectFolders`, `lib/import/refs.ts`)
- The real-client staging run should wait for Phase 4 so child tasks, dependencies, Datos de monday and project Bitácora are visible when spot-checking (BE §12 #8, #9)

## Complexity
- Backend: L
- Frontend: S
- Infra: S

## Risks
- Rollback blocker list must cover every FK into batch rows; a missed one makes the delete transaction fail (safe, but confusing)
- Large file sets: Drive upload quotas and resumable-upload edge cases during phase B
- Running against production through an SSH tunnel: long transaction on a big account; verify on staging with a real-size export first
