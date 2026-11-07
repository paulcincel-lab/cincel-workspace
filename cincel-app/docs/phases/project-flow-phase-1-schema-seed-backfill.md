# Project Flow Phase 1: Schema, Catalog Seed + Backfill

## Goal
The database holds the tramo / fase / espacio / puesto model, seeded and backfilled from today's data with a migration report, and the server-side foundation (domain modules, repositories, actions) exists. The current UI keeps working unchanged.

## Deliverables

### Backend
- [ ] Drizzle schema changes (BE §3.2–§3.12): `workflow_auto_start` enum + `workflows.auto_start`; `workflow_phases`; `workflow_task_templates.phase_id` + composite FK; `tasks.phase_id/space_id/closed_at/system_key/start_batch_id` with `tasks_phase_fk`, `tasks_space_fk`, the new checks and indexes; `task_kind` + `'admin'`; `task_statuses.counts_as_completed`; `projects.client_id` nullable, `origin`, `origin_staff_id`; `project_stages.started_at/started_by_id/closed_at`; `project_spaces`; `tramo_start_batches`; `positions`, `staff_positions`, `position_phases`; `workspace_group_mappings.position_id`; `project_flow_migration_report` (`lib/db/schema/flow-report.ts`). Old columns stay declared `@deprecated` so nothing is dropped (BE §3.5)
- [ ] `workflows.ts` stops importing `areas` from `people.ts` (acyclic import graph, BE §3.10)
- [ ] `0023_project_flow_schema.sql`: drizzle-kit generate plus the hand edits of BE §4.1 (no statement on `group_mapping_kind` / its check; `NOT VALID` on `tasks_closed_at_check`; hand-written `client_stats` view; `core.flow_name_key`)
- [ ] `0024_project_flow_backfill.sql`: the 15 ordered steps of BE §4.2 (tramo rows, fase catalog, 51 templates, template and task fase backfill incl. 5e template linking, `projects.phases` report, statuses Cancelado / En espera reused or created, `closed_at`, stages, current tramo, duplicate names + `projects_name_lower_uq` swap, áreas report, group mapping `area` → `position` rename, puestos seed)
- [ ] `scripts/default-catalog.mjs` (`DEFAULT_CATALOG` with `legacyTitle`, `DEFAULT_POSITIONS`, `ensureDefaultCatalog(sql)`), called from `scripts/migrate.mjs` after `ensureDefaultWorkflows` and from `scripts/seed.ts`; `DEFAULT_WORKFLOWS` gains `autoStart`; seed área steps removed (BE §5.1–§5.4)
- [ ] `scripts/project-flow-report.ts` + `npm run flow:report` (BE §4.4)
- [ ] `lib/project-flow/` modules, all taking `db`/`tx`, no `server-only`: `names.ts` (`nameKey`, `stripMondayNumbering`), `catalog.ts` (`READINESS`), `readiness.ts`, `start-tramo.ts` (preview, start, undo, `isBatchTouched`), `auto-start.ts`, `closing.ts` (`closedAtPatch`, `refreshStageClosed`) (BE §2, §9.1–§9.3, §9.6–§9.8)
- [ ] `lib/validation/project-flow.ts` with `parseInput` (BE §6)
- [ ] New repositories: `workflow-phases-repository.ts`, `project-spaces-repository.ts`, `positions-repository.ts` (incl. `listCandidates`) (BE §8.1, §8.3, §8.4)
- [ ] New actions, with no UI caller yet: fase actions + `setWorkflowAutoStartAction` + `fetchTramosNavAction` (BE §7.1); `tramo-start-actions.ts` (BE §7.4); `positions-actions.ts` (BE §7.2); espacios actions (BE §7.3)
- [ ] `isTaskCompleted()` next to `isTaskClosed()`; task status writes (`setTaskStatus`, `setTaskCustomStatus`, `updateTask`, status-catalog re-sync) maintain `closed_at` through `closedAtPatch`, so `tasks_closed_at_check` holds for the old UI (BE §3.6, §7.6, §8.6)
- [ ] `task-statuses-actions.ts` accepts `countsAsCompleted` (BE §7.6)
- [ ] Compatibility for the old UI until Phase 2: template create/update always sets `phase_id` (from `phaseId`, else the old `phase` text by `nameKey`, else the tramo's first fase), so 0025's `SET NOT NULL` can't fail (BE §4.3 step 2); `23505` on `projects_name_lower_uq` → `NAME_TAKEN` in the current create/update
- [ ] `listProjects` / `listTasks` use `leftJoin(contacts)` (BE §8.5, §8.6)
- [ ] Additive DTO fields (old ones kept until Phase 2 switches the UI): tasks `phaseId`, `spaceId`, `closedAt`, `phase`, `space`, `customStatus.countsAsCompleted`; projects `tramos`, `activePhase`, `needsTramo`; workflows `phases`, `readiness`, `autoStart` (FE §7.1)
- [ ] Google group mappings move to `role | position` (required by the enum rename in 0024 step 13): `workspace-access.ts` `loadGroupMappings` / `evaluateAccess` / `applyAccess` on positions, group-mapping repository and actions with `positionId` (BE §3.11, §7.7, §12)
- [ ] Vitest: pure units (`nameKey`, `stripMondayNumbering`, `closedAtPatch`, readiness table, `isTaskCompleted`, catalog drift guard incl. `legacyTitle` vs the TS templates); db tests for constraints, `startTramo` / `undoStartTramo` (modes, idempotency, concurrency, `TOUCHED`), `onTaskClosingChanged`, 0023 + 0024 with and without an `area` mapping, the 0024 dev-like fixture, `ensureDefaultCatalog` twice and after soft deletes; `workspace-access.test.ts` for position groups (BE §16)

### Frontend
- [ ] `GoogleGroupMappings` / `GoogleSetupWizard`: kind labels `Rol` / `Puesto`, "Puesto" select fed by `fetchPositionsAction()` (FE §3.14). The only UI change; needed because the action types change in this phase

### Infrastructure
- [ ] `Dockerfile`: `COPY` line for `scripts/default-catalog.mjs` next to `default-workflows.mjs` (BE §14)
- [ ] `package.json`: `flow:report` script (BE §15)
- [ ] After deploy: run `npm run flow:report` on production and record the output on the phase issue
- [ ] Early check: confirm the stored monday export folders (`import_batches.export_path`) for Madrid 22, Guadalajara 83 and Local Espiropapa are still on the volume; record it on the issue (BE §11.2 pre-flight; re-export now if missing)

## Done Definition
- 0023 + 0024 apply on a fresh DB and on a copy of production; `npm run typecheck`, lint and all vitest suites pass in the existing CI
- On the production copy: 14 fases and 51 templates exist, every template has a `phase_id`, Cancelado and En espera exist once each, `group_mapping_kind` is `('role','position')`, no two live active projects share `lower(name)`
- `flow:report` lists unmatched fases, `projects.phases` values, áreas and removed group mappings
- DB tests: a task with another tramo's fase fails; `startTramo` repeated returns `createdCount 0`; undo after a title edit returns `TOUCHED`
- Staff sign-in (Google group evaluation) still works; every existing screen (Actividades, Proyectos, ficha, Equipo, Configuración) works as before; reopening a completed task clears `closed_at`

## Parallel work
- Schema + 0023 first (one PR, small), then in parallel: 0024 + `default-catalog.mjs` + report ∥ `lib/project-flow/*` + repositories + actions ∥ workspace-access / Google mappings switch (BE + the small FE change)
- Phase 2 FE can start building against the new action signatures as soon as the schema PR merges (mock the new DTO fields until the actions land)

## Phase dependencies
- Requires: none (monday migration, Staff SSO, Client Portal are merged)
- Unblocks: Phases 2, 3 and 4

## Complexity
- Backend: XL
- Frontend: S
- Infra: S

## Risks
- 0024 runs unattended on deploy inside one migrator transaction; any step that fails on real data blocks the deploy. Mitigation: the dev-like fixture db test and a dry run on a production copy before merge
- Enum `ALTER TYPE … ADD VALUE` in the same transaction: checks must compare `kind::text` (BE §3.5)
- Tasks created or edited with free-text fase between this phase and Phase 2 get `phase_id` null ("Sin fase · revisar"); keep the gap between Phase 1 and Phase 2 deploys short
- If the monday exports of the three imported projects are gone, the Phase 4 remap can't run until they are re-exported
