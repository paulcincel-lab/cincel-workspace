VERDICT: APPROVED

> **Round 2 (2026-11-06):** all 4 round-1 blocking issues are fixed in the specs. Backend §21 and the frontend "Review round 1 fixes" table map each finding to the section that fixes it, and each fix was re-read in place.
>
> - **B1 (quick-add / start entry points): fixed.** Backend §7.5 `createUserTaskAction` no longer writes `project_stages`. Backend §9.1 opens the sheet for any tramo: from Listos para iniciar, from the deep link whether or not the project is ready, and from "Agregar fases". `startTramo` adds missing fases when the stage already exists. "Asignar tramo" goes through `startTramo` with `stageOnly`, so only `startTramo` ever writes stages. Frontend §3.1, §3.5 and §4.3 (`ReadyToStartCard`) match.
> - **B2 (admin-only leaks): fixed.** Backend §12 filters four reads for non-admins:
>   - the contact detail (`projects: []`, counts only);
>   - project history (no `clientId`, `origin` or `originStaffId` events);
>   - every task-scoped read or write of an admin task, through one `assertTaskVisible` guard;
>   - `getImportDataAction` (null for admin tasks; client and contact columns removed for projects).
>
>   The portal contacts page is written down as an accepted exception. Frontend §3.17 and §3.5 match.
> - **B3 (backfill order): fixed.** 0024 now runs statuses (7) → task `closed_at` (8) → stages (9) → current tramo (10). Every cross-reference was rechecked: §4.1 "validated in 0024 step 8", §4.3 "steps 5d, 6 and 12", and §5.2 "step 5e". None are stale.
> - **B4 (`group_mapping_kind` generated drop/recreate): fixed.** Backend §4.1 now says to delete the generated enum and check statements. It also adds the `NOT VALID` and `client_stats` hand edits, and a db test with and without an area mapping.
> - **Contract recheck.**
>   - `TaskPatch.workflowId` is accepted only when the task has none. The frontend §7.1 type and backend §7.5 agree.
>   - `EXPORT_MISSING` is in frontend §7.8/§9 and backend §11.1.
>   - `parseInput` (backend §6) settles `EMPTY` vs `INVALID`.
>   - Nothing else changed shape.
> - **Round-1 non-blocking items:** all 19 have a fix row in backend §21, and they read correctly in place. The status reuse rule and the fresh-install seed rule were checked against `underlyingStatus` (`task-statuses-repository.ts:18-20`) and `ensureDefaultWorkflows` (`scripts/default-workflows.mjs:20-22`).
>
> New non-blocking items from round 2 (fix while implementing, no re-review needed):
> 1. **0024 step 3 wording:** "`x.phase_id is not distinct from <phase or null>`" must read `(x.phase_id = <seed phase_id> or x.phase_id is null)`. Existing templates still have `phase_id null` at step 3. If they don't match, the seed row is inserted, and step 4's backfill then hits `(workflow_id, phase_id, lower(title)) where active` and aborts the deploy. Step 4 has no conflict guard.
> 2. **Puestos have no candidate fases on a fresh install.** 0024 step 14 inserts the six puestos while there are no fases yet, and then `ensureDefaultCatalog` (§5.4) skips puestos because rows already exist. Either skip step 14 when `workflow_phases` is empty, or have `ensureDefaultCatalog` fill `position_phases` for seeded puestos that have none, on the same call that seeds the fases.
> 3. **Frontend §7.6 `updateTaskAction`** doesn't list `INVALID` (the generic §9 copy covers it). Frontend §7.4 `setProjectCurrentTramoAction` doesn't mention the backend's admin `stageOnly` path. The UI never uses that path, so this is harmless.
> 4. **`EXPORT_MISSING` copy** differs between backend §11.1 and frontend §9. The UI uses the frontend §9 copy; the backend text applies to the CLI only.
> 5. **Report kinds:** add `status_reused` / `status_created` to the §4.4 report table. Reusing an existing closing "En espera" reopens its tasks (`en_proceso`), so include the task count in the report detail.
>
> The round-1 review follows unchanged.

---
---

VERDICT (round 1): CHANGES NEEDED


> Senior review of `docs/specs/project-flow/frontend.md` and `docs/specs/project-flow/backend.md` against the brief (`docs/specs/source/project-flow-spec.md`), ADR 0003 and the code on `docs/project-flow-plan` (2026-11-06).
>
> The frontend §7 and backend §6–§7 contracts line up action by action and field by field. All 13 items in backend §19 are already fixed in the frontend spec. The four blocking issues are about flow and data: one gap in the start flow, one gap in admin-only visibility, and two migration traps. Each fix is a few lines of spec.

---

## Blocking Issues

1. **A quick-added task takes the project out of "Listos para iniciar", and nothing in the UI lets anyone start that tramo afterwards.**
   - Backend §7.5 `createUserTaskAction`: "The tramo gets a `project_stages` row if it has none". This is new behavior: today `insertUserTask` never writes a stage (`lib/repositories/tasks-repository.ts:405-445`).
   - Backend §9.1 only offers a project as ready or upcoming when it has **no** stage row for the tramo.
   - The frontend has two entry points to `StartTramoSheet`: the "Iniciar" button in `ReadyToStartCard`, and the `?project=` deep link, which opens the sheet only "if that project is ready" (frontend §4.3 `ReadyToStartCard`).
   - So one "+ Nueva tarea" on Diseño for a project that hasn't started Diseño leaves it with no way to create the Diseño template tasks. The sheet's own "alreadyStarted" state (frontend §4.3, "Nothing to create") can never be reached either.
   - The two specs also disagree about the deep link. Backend §9.1 says "an admin may start any tramo from the ficha deep link", but the frontend refuses the deep link unless the project is ready.
   - The same dead end applies to a project flagged "Asignar tramo" (`needsTramo`) that really belongs in Construcción.

2. **Admin-only data still reaches non-admins through reads that backend §12 doesn't list, so backend acceptance §17.4 ("Non-admins never receive client, origin or admin tasks from any action") fails as written.**
   - `fetchContactAction` → `getContact` returns every project of a client (`lib/repositories/contacts-repository.ts:137-146`). That linkage is visible to Dirección, Jefe de Taller, Jefe de Construcción and Arquitecto Senior, because they have `canViewClients: true` by default (`lib/auth/permissions.ts:596-630`).
   - Project history records `clientId` changes (`PROJECT_TRACKED_FIELDS`, `lib/repositories/projects-repository.ts:70-74`). `fetchProjectHistoryAction` serves that history to anyone who can see the project. The new `origin` and `originStaffId` would leak the same way once they are tracked.
   - `getImportDataAction` (`lib/actions/import-actions.ts`) returns the raw monday data of a task or project to anyone who can see the row. That covers admin tasks, and a project's monday client column.
   - Task-scoped reads of an admin task by id (history, checklist, links, attachments, dependencies) are covered only by a general sentence. They need the same viewer check.
   - `/proyectos/[id]/clientes` shows the client's portal contacts to `portal.manageAccess` users, who aren't all administrators. The brief allows portal management, so this one only needs to be written down as an accepted exception.

3. **Migration 0024 computes `project_stages.closed_at` before `tasks.closed_at` exists.**
   - Backend §4.2 step 7 sets `closed_at = max(task.closed_at)`, but `tasks.closed_at` is backfilled only in step 11. At step 7 every value is null.
   - So every existing tramo is left "open", even when all its tasks are completed. The ficha never shows "Cerrado el …" and `TramoChips` never shows a closed tramo, until some task in that pair changes status.
   - The migration runs only once, so this wrong data stays unless someone repairs it by hand.

4. **`drizzle-kit generate` will write a drop-and-recreate of `group_mapping_kind` into 0023, and that breaks the deploy.**
   - In release A, the TS schema declares `groupMappingKind = ["role","position"]` (backend §3.11), while the database has `('role','area')` (`lib/db/migrations/0019_staff_google_sign_in.sql:1`).
   - drizzle-kit 0.31 (`package.json:75`) handles a removed enum value by converting the column to text, dropping the type, recreating it and casting back. On an install with `kind = 'area'` rows, the cast fails. It also fails against the existing `workspace_group_mappings_kind_check`, which references `'area'`.
   - On an install with no area rows the cast succeeds, but then 0024 step 13 `RENAME VALUE 'area' TO 'position'` fails, because `'area'` no longer exists.
   - Backend §4.1 only says "hand-edit the two enum statements", and its list covers `task_kind` and `workflow_auto_start`. Following the spec literally gives a migration that fails on deploy either way. Migrations run on deploy, all pending ones in one migrator transaction (`scripts/migrate.mjs:36`).

---

## Non-Blocking Issues

1. **Permission overrides aren't in `app_settings`.** The custom permissions payload is read from browser storage (`readCustomPermissionsPayload`, `lib/auth/permissions.ts:824-846`), and the server always falls back to the defaults. So backend §4.2 step 15 updates nothing. The `areas` → `positions` alias has to live in the client reader instead (`readRoleModuleOverrides(access, "areas")`, `permissions.ts:1168`). Fix the step's text.
2. **A "Cancelado" status that already exists will count as completed.** Step 10 first sets `counts_as_completed = closes` and only then inserts Cancelado `where not exists`. If an install already has a closing "Cancelado" (for example one created inline in the monday wizard), it ends up counting as completed, which goes against brief decision 13. Add: `update task_statuses set counts_as_completed = false where lower(name) in ('cancelado','no se requiere') and deleted_at is null`.
3. **`ensureDefaultCatalog` brings back deleted statuses on every boot.** It runs on every deploy (backend §5.4) and inserts Cancelado and En espera "if missing". An admin who soft-deletes "En espera" gets it back on the next release. Seed the statuses only when this call also seeded the fases (a fresh install), or count soft-deleted rows, the way `ensureDefaultWorkflows` does (`scripts/default-workflows.mjs:20-22`).
4. **`INVALID` and `EMPTY` contradict each other in backend §6.** It says "a parse failure throws `INVALID: <path>`" and also "an empty name surfaces as `EMPTY`". State the rule: if the first zod issue's message is a known code (`EMPTY`), throw that code; otherwise throw `INVALID: <path>`.
5. **Where espacios go in the rollback order.** Backend §10.9 adds `project_space` but doesn't say where it goes in `DELETE_STEPS` (`scripts/monday/rollback.ts:649-686`). It must go after `deleteRefs("task")` and before `deleteRefs("project")`, because `tasks_space_fk` is `restrict`. Also consider `NO ACTION` instead of `restrict` for `tasks_space_fk`. It still blocks direct deletes, but it doesn't fail when the project cascade deletes a space and its tasks in the same statement.
6. **`upgradeMappingV1` needs the export to merge status maps.** Today `statusMaps` is keyed by column id and then label **id** (`mapping.schema.ts:127-128`). The new firm-wide map is keyed by `statusLabelKey(label text)`. So the upgrader has to read the export's label id → text from the column settings, which `upgradeMappingV1(raw, lookups)` doesn't receive. Also, `translate.ts:651` reads `bm.statusMaps`, not only line 1282.
7. **The remap depends on export files that may be gone.** It reads `import_batches.export_path` (`lib/db/schema/import.ts:38`). If the Madrid 22, Guadalajara 83 or Local Espiropapa exports are no longer on the volume, backend acceptance §17.7 can't be met. Add a pre-flight to the ops step: `npm run monday -- remap --projects … ` without `--apply` must report every board with `source != null`. Otherwise, re-export before release A ships.
8. **The remap contradicts itself on people, and leaves files behind.** Backend §11.1 says "people … are not touched", but the admin rule removes non-admin assignees. Write it down as an exception, and remove the matching `task_support` refs so a later rollback doesn't flag them. Also, tasks that move to another project ("Proyecto aparte") keep their `import_files.project_id`. Move those rows too.
9. **Tasks with no tramo can never get one.** `TaskPatch` drops `workflowId` (frontend §7.1), so a legacy `usuario` task with `workflow_id null` that step 5c couldn't infer stays without a tramo forever. Allow `workflowId` in the patch when the task currently has none (it isn't an admin task), and validate it with `assertPhaseInWorkflow`.
10. **Drive folders for a project without a client.** `ProjectFolders.clientFolderId` is typed `string`, and the "stored tree is complete" check requires it (`lib/google/project-folders.ts:39,120-130`). Without a client folder the tree never counts as ready, so `syncProjectFolders` will rebuild it every time. Make the field nullable and change the check to depend on `withClientFolder`. Also decide what happens to "03 Del cliente" (the inbound folder), which the specs don't mention.
11. **Undo window and drag reorder.** `reorderProjectTasks` rewrites `sort_order` for every id in the block (`tasks-repository.ts:811-819`). That bumps `updated_at` on untouched batch tasks, so any drag inside a project block ends the undo window. Either accept this and say so in frontend §4.3, or send only the ids of the dragged fase.
12. **Undo details.** `undoStartTramo` locks the batch, then the project. `startTramo` locks the project first. Lock the project first in both. Also, after undo, run `refreshStageClosed` for the pair, because step 4 of `startTramo` may have cleared `closed_at`.
13. **Duplicate-name suffix can collide.** 0024 step 9 appends " (2)" without checking whether "X (2)" already exists. If it does, the unique index creation right after fails, and so does the deploy. Loop until the candidate is free.
14. **0024 step 3's skip rule is unclear.** "Skipped entirely for a workflow that already has active templates whose `flow_name_key(title)` matches" doesn't say whether *any* match or *all* match. With "any", one hand-typed "Minuta" skips all 10 Presale templates, and brief acceptance "Presale starts with 10 tasks" fails on that install. Use per-row `where not exists` on `(workflow_id, flow_name_key(title))` instead.
15. **Report detail is incomplete.** The `area_member` report detail leaves out `area_members.role`. Add it, since the column is dropped in release B.
16. **Rollback note (backend §4).** If release A is reverted to the previous image, admin tasks are shown to everyone, and client-less projects disappear from lists (the old code's `innerJoin`, `projects-repository.ts:149`, `tasks-repository.ts:325`). Write this down as a known effect of rolling back.
17. **Spec housekeeping.**
    - Backend §19 is stale: every item is already fixed in the frontend spec. Mark it resolved.
    - Frontend §4.6 item 9 has an orphaned `| other | issue text |` row after the paragraph. It belongs in the table.
    - Backend §0.1 cites `plan.ts:758-764`. The translate issues are pushed at line 763 and the import sets are computed at 766. The text is correct; refresh the line numbers.
18. **CI (pre-existing, separate infra item).** The repo-root workflow `.github/workflows/cincel-app-build.yml` breaks the standing rules: jobs on `ubuntu-latest` (lines 24, 48, 94, 156), no `timeout-minutes`, a Playwright e2e job with a Postgres service and seed (lines 94-150), and `docker/setup-buildx-action`/`build-push-action` instead of plain `docker build`. Neither spec adds to it. But both claim "CI stays lint → test → build on the self-hosted runners", and that isn't true today. Track it as its own infra issue. Until then, the e2e job will run `tests/e2e/proyectos.spec.ts` and `tests/e2e/equipo.spec.ts`, which assert copy this feature removes ("Etapa", "Áreas"…). Add both files to the frontend §15 update list.
19. **`client_stats` is a Drizzle view** (`projects.ts:173-191`). drizzle-kit won't diff the new `where client_id is not null`, so 0023 needs the `CREATE OR REPLACE VIEW` written by hand. Same for `NOT VALID` on `tasks_closed_at_check`. List both with the other hand edits.

---

## API Contract Diff

```
✅ fetchWorkflowsAction(opts)                       — both specs; open to staff for active rows, include* needs canManageWorkflows
✅ fetchTramosNavAction                             — both specs, WorkflowRef[]
✅ create/update/reorderWorkflowPhaseAction         — both specs, errors aligned (FORBIDDEN, NOT_FOUND, NAME_TAKEN, EMPTY)
✅ setWorkflowAutoStartAction(boolean)              — both specs, BE maps to on_create/on_ready/manual
✅ create/updateTemplateAction (phaseId)            — both specs, PHASE_MISMATCH + NAME_TAKEN
✅ deactivateTemplateAction / reorderTemplatesAction — unchanged
✅ fetch/create/update/deletePositionAction         — both specs, IN_USE on Google mapping
✅ setPositionPhasesAction / reorderPositionsAction — both specs
✅ setStaffPositionsAction                          — both specs, GoogleManagedRefusal
✅ fetchAssignableStaffAction (suggested)           — both specs
✅ fetchProjectsAction / fetchProjectAction          — both specs; client/origin/mondayImport nulled for non-admins
✅ createProjectAction({ name })                    — both specs; side effects §9.4 (see Blocking #1 for quick-add)
✅ updateProjectAction (admin-only keys)            — both specs; auto-closes assign_client
✅ setProjectCurrentTramoAction (NOT_STARTED)       — both specs
⚠️  create/rename/reorder/deleteProjectSpaceAction  — BE adds NOT_FOUND to create and FORBIDDEN/NOT_FOUND to reorder; FE lists none for reorder (harmless, generic copy)
✅ fetchProjectSpacesAction                         — both specs
✅ fetchTramoBoardAction                            — both specs, TramoBoard shape identical
✅ previewStartTramoAction                          — both specs, StartTramoPreview identical
✅ startTramoAction                                 — zod schema = FE StartTramoInput; result identical
❌ startTramo entry points                          — FE: deep link only when ready | BE: any tramo from the ficha (Blocking #1)
✅ undoStartTramoAction                             — both specs, TOUCHED incl. later batch
✅ fetchTasks/MyTasks/Board/CalendarAction          — both specs, kind default excludes admin
✅ createUserTaskAction                             — both specs (workflowId required); ⚠️ stage side effect (Blocking #1)
✅ updateTaskAction                                 — both specs incl. ASSIGNEE_NOT_ADMIN, ADMIN_TASK
✅ createSubtaskAction                              — both specs, kind inherited
✅ fetchAdminTasksAction / createAdminTaskAction    — both specs; AdminTaskInputSchema = FE AdminTaskInput
✅ assignTaskAction / setTaskSupportAction          — both specs, ASSIGNEE_NOT_ADMIN
✅ create/updateTaskStatusAction (countsAsCompleted) — both specs, INVALID
✅ group mapping actions (role | position)          — both specs
✅ getMondayImportChoicesAction                     — both specs, MondayImportChoices identical
✅ saveMondayStatusMapAction                        — both specs, STATUS_NOT_FOUND
✅ createMondayStaffAction({ positionIds })         — both specs
✅ suggestMondayPositionAction                      — both specs
✅ get/preview/applyMondayRemapAction               — both specs, NOT_IMPORTED
✅ Removed: previewApplyWorkflowAction, applyWorkflowAction, setProjectStage(s)Action, setStaffAreasAction, areas-actions — both specs
❌ fetchContactAction / fetchProjectHistoryAction / getImportDataAction — not in either spec; leak admin-only data (Blocking #2)
```

---

## Data Model Review

```
✅ workflow_phases          — composite-FK target unique (id, workflow_id), lower(name) uq, key uq, FK index
✅ workflow_task_templates  — phase_id + composite FK; title uq widened to (workflow_id, phase_id, lower(title)); NOT NULL in B
✅ tasks                    — phase/space composite FKs + MATCH SIMPLE guard check; kind check uses ::text (safe with ADD VALUE in-tx)
⚠️  tasks.space_id FK       — `restrict` needs a fixed rollback order (NB #5)
✅ tasks.closed_at          — check NOT VALID → validated after backfill
✅ task_statuses            — counts_as_completed + check; ⚠️ pre-existing "Cancelado" (NB #2)
✅ projects                 — client_id nullable keeps composite FK (client_type generated, projects.ts:32-35); name uq on active/paused
⚠️  projects (0024 step 9)  — dedupe suffix collision (NB #13)
⚠️  project_stages          — started_at/closed_at; closed_at backfill ordered wrong (Blocking #3)
✅ project_spaces           — (id, project_id) uq for composite FK, lower(name) uq
✅ tramo_start_batches      — all FKs indexed, checks on trigger/mode
✅ positions / staff_positions / position_phases — soft delete on positions, PKs, FK indexes
❌ workspace_group_mappings — enum value rename will be generated as drop/recreate in 0023 (Blocking #4)
✅ project_flow_migration_report — no FK by design, idempotent uq for 0025 re-run
✅ areas / area_members / area_workflows — reported in 0024, dropped in 0025; only referencing FKs are area_members, area_workflows, workspace_group_mappings.area_id (verified)
✅ history_entity enum      — keeps 'area' (history never deleted)
```

---

## Frontend Architecture Notes

- No stores or query cache: RSC load, then local state and refetch. This matches the app. The revalidation table (frontend §6) and the backend's per-action `revalidatePath` agree.
- Admin gating is done twice, which is right: `canSeeAdminData` on the client for layout, and `ViewerScope` in every DTO builder. Blocking #2 is about reads outside those builders, not about the frontend.
- `ReadyToStartCard` is the only real entry point for starting a tramo (Blocking #1). A started project's block has no "Agregar fases" for fases that weren't contracted at start and are contracted later. Fixing Blocking #1 covers this as well.
- The `StatusMapTable` debounced save is optimistic and posts the **whole** map. Two admins editing at once will overwrite each other's labels (last write wins). That's acceptable for a one-time import tool. Say so, or merge on the server.
- Sonner is a new dependency and the only toast in the app. That is fine because the brief asks for it.

## Backend Architecture Notes

- Business logic stays out of the actions. `lib/project-flow/*` takes `db`/`tx` and imports nothing `server-only`, so the CLI and the remap can reuse it. That is the right call (see `lib/google/project-folders.ts:22-23` for the existing pattern).
- `createProject` must become transactional. Today it calls `db` directly (`projects-repository.ts:255-270`), and `recordChanges` already accepts a `tx` (`projects-repository.ts:612-623`).
- Idempotency of `startTramo` is sound. The project row lock serializes starts and undos, the partial unique index `tasks_project_template_uq` (`tasks.ts:94-96`) is the second guard, and `onConflictDoNothing` needs the index predicate (`targetWhere`) to match that partial index.
- The undo "touched" signal relies on `created_at = updated_at` at insert. That holds because both default to `now()` in the same transaction and `$onUpdate` only runs on update (`_schema.ts:60-66`). Workflow-task creation writes no per-task history (`applyWorkflow`, `projects-repository.ts:590-644`), unlike `insertUserTask` (`tasks-repository.ts:437-444`). So `startTramo` must not reuse `insertUserTask`.
- The fresh-install path is correct. Migrations run first (and seed nothing when there are no workflows), then `ensureDefaultWorkflows`, then `ensureDefaultCatalog`, and the Dockerfile needs one more `COPY` (`Dockerfile:34-36`). `npm run db:migrate` (drizzle-kit) skips both `ensure*` steps, so `*.db.test.ts` fixtures must seed the catalog themselves.
- The JSON log lines with `trace_id` for `after()` failures follow the observability rule. No new services.

---

## Recommended Edits

**Issue #1:** A quick-add opens a stage, and starting a tramo has no entry point outside the ready list.
**Edit in:** `docs/specs/project-flow/backend.md` → §7.5, row `createUserTaskAction`
**Change:** replace "The tramo gets a `project_stages` row if it has none (a quick-add starts nothing else)" with:
```
A quick-add never writes `project_stages`: the tramo is started only by `startTramo` (sheet, auto-start, import, remap). The project block still shows (frontend §3.1 item 8 lists projects "with this tramo started or with tasks in it"), and the project stays in "Listos para iniciar" / "Próximos" until a start.
```
**Edit in:** `docs/specs/project-flow/frontend.md` → §4.3 `ReadyToStartCard`, last sentence
**Change:**
```
If `?project={id}` is in the URL, `ActividadesClient` opens the sheet for that project on mount whether or not it is ready (the backend doesn't require readiness, backend §9.1). The sheet's "alreadyStarted" state covers a tramo already started.
Project blocks of `/actividades/[tramo]` add a row action "Agregar fases" (users with `canCreateActivity`) that opens the same sheet for that project, so fases left out at start can be created later; fases already created show "Ya creadas".
```

**Issue #2:** Admin-only data leaks through reads outside the DTO builders.
**Edit in:** `docs/specs/project-flow/backend.md` → §12, bullet "Server-side filtering"
**Change:** append:
```
Also filtered for non-admins:
- `fetchContactAction` (`contacts-repository.ts:137-146`): `projects` is `[]` and `stats` keeps counts only (no project names), unless the viewer is admin.
- Project history (`fetchProjectHistoryAction`): events with field `clientId`, `origin`, `originStaffId` are removed. Task history, checklist, links, attachments, dependencies and comments of an admin task return null/[] (reads) or `FORBIDDEN` (writes).
- `getImportDataAction` (`lib/actions/import-actions.ts`): `null` for an admin task, and for a project the monday client column values are removed from `data`.
Accepted exception: `/proyectos/[id]/clientes` (portal.manageAccess) shows the client's portal contacts; the client is implied there by design (brief §1 non-goals).
```
**Edit in:** `docs/specs/project-flow/backend.md` → §16 "Repository / DB", bullet "Admin visibility"
**Change:** append ", and the Directorio client detail, project history and `getImportDataAction` don't expose them either".

**Issue #3:** Stage `closed_at` is backfilled before task `closed_at`.
**Edit in:** `docs/specs/project-flow/backend.md` → §4.2
**Change:** move steps 10 (Statuses) and 11 (`closed_at`) before step 7 (Stages) and renumber. Add at the top of the list:
```
Order matters: statuses (counts_as_completed) → tasks.closed_at → stages (started_at, closed_at from tasks.closed_at) → current tramo.
```

**Issue #4:** The `group_mapping_kind` enum change will be generated into 0023.
**Edit in:** `docs/specs/project-flow/backend.md` → §4.1, first paragraph and list
**Change:** replace "(drizzle-kit generate, then hand-edit the two enum statements)" with:
```
(drizzle-kit generate, then hand edits):
- keep `ALTER TYPE "core"."task_kind" ADD VALUE IF NOT EXISTS 'admin'` and `CREATE TYPE "core"."workflow_auto_start"`;
- DELETE every generated statement that touches `group_mapping_kind` or `workspace_group_mappings_kind_check` (drizzle-kit 0.31 emits a column→text, DROP TYPE, CREATE TYPE, cast-back sequence for the removed 'area' value; it fails on rows with 'area' and, where none exist, makes 0024 step 13 fail). The enum rename and the check swap happen only in 0024 step 13 (`RENAME VALUE`), and the 0024 snapshot reflects the final state;
- add `NOT VALID` to `tasks_closed_at_check` and write the `client_stats` `CREATE OR REPLACE VIEW` by hand (drizzle-kit doesn't diff views).
A db test asserts 0023+0024 apply on a fixture with one `kind = 'area'` mapping and on one with none.
```

---
_Full review: docs/review/project-flow-review.md_
