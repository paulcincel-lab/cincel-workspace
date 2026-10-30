VERDICT: APPROVED

> Round 2 (2026-10-28): all 9 round-1 blocking issues were fixed in the spec (backend §14 maps each one) and checked against the code by the spec author. The product owner skipped a second full review for speed. The round-1 review follows unchanged.

---

Round 1 verdict: CHANGES NEEDED

# Senior Review: One-time monday.com migration

**Reviewed:** `docs/specs/monday-migration/backend.md`, `docs/specs/monday-migration/frontend.md`
**Checked against:** `lib/db/schema/*.ts`, `lib/db/client.ts`, `lib/repositories/{tasks,task-statuses,history,contacts}-repository.ts`, `lib/actions/{tasks,schedule}-actions.ts`, `lib/cronograma/sections.ts`, `app/actividades/[departamento]/page.tsx`, `components/tareas/TaskDrawer.tsx`, `components/ui/shadcn/*`, `package.json`, `scripts/seed.ts`, `vitest.config.ts`, `docs/specs/backend.md` §A.3 / §A.6.1, `docs/phases/staff-sso-phase-{1,3}-*.md`
**Date:** 2026-10-28

The settled decisions in backend §0.3 (subitem mode per board, timelines → dates + cronograma, `task_dependencies` + proposed UI, CLI-only, `import_refs`) are not questioned here.

---

## Blocking Issues

1. **The CLI can't load the shared modules (BE §2, §10).** `lib/db/client.ts` starts with `import "server-only"`, which throws when imported outside an RSC bundle. Vitest stubs it (`vitest.config.ts`). `tsx` doesn't, which is why `scripts/seed.ts` builds its own `drizzle(postgres(...))`. The spec has the CLI share `lib/import/refs.ts`, `lib/google/drive-admin.ts` and `lib/google/project-folders.ts` with the app. If any of them imports `@/lib/db/client` or `server-only` (every existing `lib/google/*` and `lib/repositories/*` module does), `npm run monday` crashes on startup.

2. **`plan` misses three unique constraints that will abort phase A (BE §6, §5.2).** None of these has a plan code:
   - `contacts_type_name_lower_uq` (type + lower(name), live rows): a `ClientRef {kind:"new"}` or a `crm_contacts` item whose name matches an existing contact, or two items with the same name in one batch.
   - `projects_client_name_lower_uq` (client + lower(name)): two boards, groups or items with the same name under one client, or a name that matches an existing project of that client. This is likely with `item_as_project`.
   - `projects_code_uq`: `projectCode` already in use.
   
   Today `plan` comes out clean, then `apply` fails partway through phase A with a raw Postgres error. That breaks acceptance criteria 2–4.

3. **`import_refs.row_id uuid NOT NULL` can't record three of the rows the import creates (BE §8, §9).**
   - `task_dependencies` (spec'd with a composite PK, no `id`) is listed as entity `task_dependency`, but there's no uuid to store.
   - `task_support` (composite PK, no `id`) can't be in `import_refs` at all. Rollback step 1 then flags every imported `task_support` row as "not in import_refs", so rollback refuses on any batch that imported a second assignee.
   - Guests mapped to `contact_people` (§5.2) are missing from the entity list and from the rollback delete order. Rollback leaves them behind on pre-existing clients.

4. **The rollback freshness check rejects every batch whose phase B ran (BE §9 step 1).** The check is "`updated_at` later than `import_batches.applied_at` + 1 minute". `applied_at` is set when phase A starts. Phase B then runs minutes or hours later and:
   - updates `projects` (`drive_folder_id`, `drive_*`, `drive_import_folder_id`), which bumps `updated_at` through the `stamps` `$onUpdate` hook;
   - inserts `task_links`, `project_links` and `drive_files` rows;
   - updates `import_files`.
   
   So acceptance criterion 12 ("rollback removes all batch rows") fails on any real import.

5. **Rollback doesn't account for rows outside the batch that point into it, and its DB/Drive ordering isn't defined (BE §9).** These aren't blockers in step 1 today:
   - a project created after apply for an imported client: `projects_client_fk` has no `ON DELETE`, so the contact delete fails partway through;
   - `project_contacts`, `schedule_tasks.responsable_contact_id` or `provider_profiles` on an imported contact;
   - a non-batch task that depends on a batch task: `task_dependencies` is `ON DELETE CASCADE`, so the user's dependency is silently deleted;
   - a non-batch child task of a batch task: `set null` silently orphans it.
   
   Step 2 also trashes Drive files before step 3 deletes rows, and nothing says step 3 runs in one transaction. A failed delete leaves live rows linking to trashed files.

6. **Group `position` is written into integer columns (BE §5.2, §6.3).** monday group `position` is a float string (e.g. `"65536.5"`). `schedule_tasks.seccion_order` and `sort_order` are `integer NOT NULL`, and `tasks.sort_order` is `integer`. "`seccion_order` = group position" and "`sort_order` = position" either fail on insert or truncate. Items also have no `position` field in the §4.2 query.

7. **`StatusTarget` breaks the custom-status invariant (BE §5.2, §5.4).** `setTaskCustomStatus` always writes `status = underlyingStatus(cs)` (`lib/repositories/task-statuses-repository.ts`: `closes` → `completado`, else `en_proceso`). The mapping allows `{ status: "pendiente", customStatusId }` or `{ status: "completado", customStatusId: <non-closing> }`. That creates tasks in a state the app never produces, and the board columns, metrics and overdue checks would disagree with the custom label.

8. **Who owns the Drive pieces is unclear across the two specs (BE §0.3.9, §10 vs `docs/specs/backend.md` §A.3, §A.6.1 and `docs/phases/staff-sso-phase-{1,3}-*.md`).**
   - §0.3.9 says the Drive columns come "from Staff SSO Phase 1's migration (#482)"; §10 says "#482 is **not** moved".
   - `staff-sso-phase-1` still lists "`core.projects` drive columns + `drive_folder_status` enum … one migration so Phases 2 and 3 don't touch the schema". Building it as written creates duplicate columns, so `drizzle-kit generate` would emit a conflicting migration.
   - §10 moves "#489 `ensureProjectFolders` + `createProject` hook … unchanged". In #489 / Phase 3 that also covers rename-on-change, `retryProjectFolderAction`, `ensureMissingProjectFoldersAction` and the **Crear carpetas faltantes** UI on Configuración → Google. That page doesn't exist until Staff SSO Phase 1. If the `after()` hook moves, every project created in the app starts creating Drive folders before SSO, with no retry UI.
   - The §A.6.1 `drive-admin.ts` operation list (create folder, rename, get parents, list, get media, export, resumable upload) has no **trash**, which rollback step 2 needs.
   - `GOOGLE_SHARED_DRIVE_ID` is only defined in §A.9, which the migration now precedes.

9. **Imported project-level comments have nowhere to show (FE §2.4, BE §5.2).** `item_as_project` updates go to `history_events` with `entity = 'project'`. The FE spec says "No new UI. Imported comments appear in the existing bitácora". The app has no project bitácora: `fetchContactHistoryAction` and `fetchTaskHistoryAction` exist, but there's no project history action or panel under `app/proyectos/[id]/ficha`. Those comments would be invisible, which breaks the "nothing silently dropped" goal.

---

## Non-Blocking Issues

1. **Comments beyond 100 are dropped (BE §4.2).** `updates(limit: 100)` and the inline `replies` have no paging, so items with more than 100 updates lose the oldest. Page with `updates(limit:100, page:n)` while a page returns 100, and record a truncation in `manifest.errors[]`.
2. **Multi-level boards lose levels 2–5 (BE §4.2).** The `subitems { ...ItemFields }` selection goes one level deep, so deeper levels on `multi_level` boards are never exported, yet §5.2 says they're "flattened with path". Nest the selection to depth 5, or run a second pass per subitem board.
3. **Imported tasks only show in Actividades → General (BE §5.4).** The `[departamento]` views filter on `tasks.workflow_id`, and `usuario` tasks may carry a `workflow_id` (`tasks_kind_check` only requires `template_id` to be null). Add an optional `BoardMapping.workflowId` (department) applied to the board's `usuario` tasks. `areaId` → workflows is an indirect way to get the same thing.
4. **An Excel import wipes monday cronograma rows (BE §6.3).** `stable_key = "monday:<itemId>"` will never match the Excel `stableKey(planta, tarea)` (`lib/cronograma/hash.ts`), and `schedule-actions.ts` deletes rows whose keys aren't in the upload (`notInArray`). Document this in the runbook, or have the Excel import refuse or warn when `source_file_name` starts with `monday:`.
5. **`seccion_order` has no effect (BE §6.3).** `sortSections()` orders unknown secciones alphabetically and ignores `seccion_order`, so monday group order is lost in the cronograma view.
6. **`crm_contacts` with `contactType: "proveedor"` (BE §5.4).** No `provider_profiles` row is created (`subtype` is NOT NULL), so proveedores/contratistas screens that read the profile show them incomplete. Add `providerSubtype` to the mapping and create the profile, or restrict v1 to `cliente`/`socio`.
7. **Updates on `crm_contacts` items aren't mapped (BE §5.2).** `history_entity` has `contact`, and `ClientDetailSheet` shows contact history. Map them to `entity = 'contact'`.
8. **Updates on subitems in checklist mode have no target (BE §5.2).** Checklist items can't hold comments. Say where they go, for example the parent task with a `[subitem name]` prefix.
9. **Key collisions in import data (BE §5.2).** `import_refs.data` is keyed by column **title**, and monday allows duplicate titles on a board, so one value overwrites the other. Checklist subitem data is keyed by subitem **name**, and duplicate names collide the same way. Key by title with a `#<columnId>` suffix on duplicates, and key subitems by id with the name as a field.
10. **`getImportDataAction` can't return `boardName` (FE §2.3).** `import_refs` has no board column. Store `boardId` / `boardName` in `data` (or add columns) when writing refs.
11. **`task_links` has no `drive_file_id` column (BE §5.2).** Unlike `project_links`, nothing joins a task link to its `drive_files` cache row. Either add `task_links.drive_file_id` in this migration or drop the "with a `drive_files` cache row" claim for task links (rollback finds them through `import_refs` anyway).
12. **Merge and soft-delete ignore the new relations (FE §2.1, §2.2).** `mergeTasks` (tasks-repository) moves checklist, support and history but not `task_dependencies` or children's `parent_task_id`. `waitingOn` has to ignore soft-deleted and archived dependencies, or a deleted blocker leaves "En espera" up forever. Update `mergeTasks`, and define `waitingOn` as a count over live, unarchived, non-closing dependencies.
13. **Nesting depth of manual subtasks is undefined (FE §2.1).** Can "Agregar subtarea" run on a child task? Pick one level (matching the import) and hide the button on child tasks, or allow nesting and add a parent-chain cycle guard.
14. **Child tasks change existing aggregates (FE §2.1).** Project `progress` (BE §7 uses top-level tasks only), the dashboard, the Kanban in `app/tablero` and calendar counts will now include child tasks. State which views count them.
15. **Inconsistent action error style (FE §4).** The new actions return `{ ok:false, error }`, while the existing `tasks-actions.ts` actions throw `FORBIDDEN: …`. Either is fine, but the drawer code needs one convention, and the spec should name it.
16. **Return types don't match (FE §3, §4).** `listSubtasksAction` returns "TaskRef with manager and commitment date", but `TaskRef` has neither field. Define a `SubtaskRef`.
17. **Wrong paths and a missing component (FE §1, §2, §3).** Types live in `lib/types/core.ts` (`TaskListItem`) and `lib/types/task.ts`, not `lib/types/tasks.ts`. Actividades is `app/actividades/[departamento]`. The shadcn `command` component (cmdk) isn't installed: add it with the shadcn CLI. `components/ui/ImportDataPanel.tsx` sits next to the generic UI. `components/tareas/` or `components/import/` fits the repo layout better.
18. **Token handling (BE §2).** `MONDAY_TOKEN=… npm run …` puts the token in shell history. Read it from a prompt or `.env.local`.
19. **Where `apply` runs against production isn't stated (BE §2, runbook).** The prod image is the Next standalone build without `scripts/` or `tsx`. Say whether Oscar runs it locally over a tunnel to the prod DB or in a one-off container, and where `exports/` (client PII) lives and is deleted.
20. **Missing dependency (BE §5.2).** HTML sanitizing needs a named dependency (e.g. `sanitize-html`) or a stated hand-rolled approach. It's not in `package.json`.
21. **Applying again after a finished batch (BE §7).** Phase B resume works by finding a batch in `applying`. Say how `apply` finds it (export path + account id), and that a second `apply` on an `applied` batch creates an empty batch, or refuses.
22. **Unconfirmed key assumption (BE §8).** The `import_refs` PK assumes monday ids are globally unique across accounts. Adding `account_id` to the PK costs nothing and removes the "confirm on the first two exports" caveat.
23. **Zod 4 note (BE §5.4).** `z.string().uuid()` is deprecated in Zod 4 (`zod@^4.5.1`) and rejects non-RFC uuids. Use `z.uuid()`, and check that the seed's fixed ids, if any, are valid v4.

---

## API Contract Diff

Server actions (no REST in this feature):

```
✅ createSubtaskAction(parentId, input)            — FE §2.1/§4; BE §10 "general task feature"; schema parent_task_id defined
⚠️  listSubtasksAction(parentId)                   — FE promises manager + commitment date; TaskRef type has neither (NB 16)
✅ addTaskDependencyAction(taskId, dependsOnTaskId) — errors forbidden/not_found/other_project/self/cycle/duplicate; DB check task_dependencies_not_self backs "self"
✅ removeTaskDependencyAction                      — aligned
⚠️  listTaskDependenciesAction                     — aligned; waitingOn semantics for deleted/archived deps undefined (NB 12)
⚠️  getImportDataAction(entity, rowId)             — boardName not stored anywhere in BE §8 (NB 10)
❌ project bitácora (fetch project history)        — FE §2.4 assumes it exists; no action or UI in code (Blocking 9)
✅ CLI export | init | plan | apply | rollback      — BE-only, no FE surface (by decision §0.3.2)
```

---

## Data Model Review

```
⚠️  import_batches       — OK; needs phase_b_completed_at (Blocking 4)
❌ import_refs          — row_id uuid can't hold task_support / task_dependencies; contact_people missing; no board info (Blocking 3, NB 10, 22)
✅ import_files         — OK; unique (batch_id, asset_id)
❌ task_dependencies    — composite PK, no id → can't be referenced by import_refs (Blocking 3); cascade deletes user rows on rollback (Blocking 5)
✅ tasks.parent_task_id — self FK set null + index; same-project rule in action layer is acceptable
⚠️  projects.drive_*     — duplicated ownership with Staff SSO §A.3 / Phase 1 (Blocking 8)
⚠️  projects (inserts)   — projects_client_name_lower_uq / projects_code_uq not pre-checked (Blocking 2)
⚠️  contacts (inserts)   — contacts_type_name_lower_uq not pre-checked (Blocking 2); proveedor without provider_profiles (NB 6)
✅ tasks (inserts)      — tasks_kind_check, tasks_template_fk, tasks_project_template_uq covered by TEMPLATE_COLLISION/TEMPLATE_INVALID; custom status invariant broken (Blocking 7)
✅ history_events       — comentario + comment not null + field null satisfies history_events_shape_check; entity task/project valid enum values
❌ schedule_tasks       — seccion_order/sort_order integer vs monday float position (Blocking 6); inicio/fin NOT NULL handled by DATES_MISSING
✅ project_schedules    — one per project, SCHEDULE_EXISTS covers the unique index
⚠️  task_links           — no drive_file_id, unlike project_links (NB 11)
✅ task_checklist_items — fits
⚠️  task_support         — not representable in import_refs (Blocking 3)
⚠️  contact_people       — created for guests, never recorded or rolled back (Blocking 3)
```

---

## Frontend Architecture Notes

- The drawer is `components/tareas/TaskDrawer.tsx`. It's also opened from `app/tablero/TableroClient.tsx` (Kanban), which the spec doesn't mention. The Subtareas, Dependencias and "En espera" badge changes affect that board too.
- The Subtareas "back to parent" navigation inside one drawer needs its own state (a stack of task ids) in the drawer, not a URL param. Otherwise "← {padre}" breaks when the drawer was opened from Mis tareas.
- `TaskListItem` gains `parentTitle`, `subtaskCount`, `subtaskDoneCount` and `waitingOn`. Compute them in the one list query (`lib/repositories/tasks-repository.ts` list select) with grouped subqueries, not per row.
- `ImportDataPanel` uses the existing `accordion.tsx`. Values come from client data: render only `http(s)` URLs as links and everything else as text.

## Backend Architecture Notes

- Phase A as one transaction is right. Put `translate.ts` output, sorted parents first, into bulk inserts per table. 24k items plus comments is fine for one transaction, but use batched `insert … values` (≤ 1,000 rows), not one statement per row.
- `defaultNow()` inside the phase A transaction gives every row the same `created_at`/`updated_at` (the transaction timestamp). That's useful for Blocking 4. Overriding `tasks.created_at` with monday's `created_at` is fine, but keep `updated_at` at the transaction time.
- The rollback's history deletion is a documented exception to "nunca eliminar historial". Keep the "unchanged since apply" guarantee strict (Blocking 4 fix), since it's the only thing that justifies the exception.
- No CI work is added. `graphql-codegen` is a dev-time generator, so commit its output; CI should not regenerate it.

---

## Recommended Edits

**Issue #1:** The CLI can't import `server-only` modules.
**Edit in:** `docs/specs/monday-migration/backend.md` → §2 Architecture (after the tree)
**Change:**
```
CLI/app boundary: nothing under scripts/monday/ may import `@/lib/db/client`, `server-only`, `next/*`
or any module that does. The CLI builds its own client exactly like scripts/seed.ts
(`drizzle(postgres(DATABASE_URL, { max: 1 }), { schema })`). Shared modules
(`lib/import/refs.ts`, `lib/google/drive-admin.ts`, `lib/google/project-folders.ts`) take the
db/transaction and the Drive client as parameters and contain no `import "server-only"`;
app-side wrappers that need the guard live in `lib/import/refs.server.ts` /
`lib/actions/*`. A unit test imports each shared module under plain Node to catch regressions.
```

**Issue #2:** Unique constraints aren't checked in `plan`.
**Edit in:** `docs/specs/monday-migration/backend.md` → §6 Plan, issues table (add rows) and §5.4 `BoardMapping`
**Change:**
```
| `CONTACT_NAME_TAKEN` | yes | A contact to create has the same (type, lower(name)) as a live contact or another contact in this batch (`contacts_type_name_lower_uq`). Fix: map it to the existing one via `contactMatches` or rename it in the mapping |
| `PROJECT_NAME_TAKEN` | yes | A project to create has the same (client, lower(name)) as a live project or another project in this batch (`projects_client_name_lower_uq`). Fix: `projectNames` override |
| `PROJECT_CODE_TAKEN` | yes | `projectCode` already used by a live project (`projects_code_uq`) |

// BoardMapping additions
contactMatches: z.record(z.string(), z.uuid()).default({}),   // crm_contacts: monday item id → existing contact (not created, not in import_refs; import data stored on a ref with entity "contact_link")
projectNames: z.record(z.string(), z.string().min(1)).default({}), // board/group/item id → project name override
```

**Issue #3:** `import_refs` can't record composite-key rows.
**Edit in:** `docs/specs/monday-migration/backend.md` → §8 Schema (`taskDependencies`, `importRefs.entity` comment) and §9 step 3
**Change:**
```ts
export const taskDependencies = core.table("task_dependencies", {
  id: uuid("id").primaryKey().defaultRandom(),
  taskId: …, dependsOnTaskId: …, kind: …, ...stamps,
}, (t) => [
  uniqueIndex("task_dependencies_pair_uq").on(t.taskId, t.dependsOnTaskId),
  index("idx_task_dependencies_depends_on").on(t.dependsOnTaskId),
  check("task_dependencies_not_self", sql`${t.taskId} <> ${t.dependsOnTaskId}`),
]);
```
```
import_refs.entity adds "task_support" and "contact_person".
- task_support: row_id = the task id, external_id = "<itemId>:<mondayUserId>", data = { staffId }.
  Rollback step 1 treats a task_support row on a batch task as the batch's own when a
  task_support ref with that (task_id, data.staffId) exists.
- contact_person: row_id = contact_people.id, external_id = "<mondayUserId>@<clientContactId>".
§9 step 3 order: links and drive_files → history_events → schedule_tasks → project_schedules →
task_dependencies → checklist items → task_support → contact_people → child tasks → tasks →
projects → contacts → import_refs → import_files.
```

**Issue #4:** The rollback freshness check gives false positives after phase B.
**Edit in:** `docs/specs/monday-migration/backend.md` → §8 `importRefs`, §7 Rules, §9 step 1
**Change:**
```
importRefs: add `rowUpdatedAt: timestamp("row_updated_at", { withTimezone: true }).notNull()`
— the row's updated_at as written by the import.
§7: phase A sets row_updated_at = the transaction's now(). Every phase B write to an imported row
(projects drive_* columns, import_files) refreshes that row's import_refs.row_updated_at in the
same statement batch; rows created in phase B (task_links, project_links, drive_files) get their
ref with their own updated_at.
§9 step 1, replace the "+ 1 minute" bullet with:
- batch rows whose current updated_at <> import_refs.row_updated_at (changed after import).
```

**Issue #5:** Rollback ignores outside dependents and has no ordering.
**Edit in:** `docs/specs/monday-migration/backend.md` → §9 steps 1–3
**Change:**
```
1. Refuse if … (existing bullets) and also:
   - projects, project_contacts, provider_profiles, contact_people or schedule_tasks.responsable_contact_id
     not in the batch that reference a batch contact;
   - task_dependencies not in the batch whose task_id or depends_on_task_id is a batch task;
   - tasks not in the batch whose parent_task_id is a batch task.
2. Delete the batch's DB rows (order below) in ONE transaction; set import_batches.status =
   rolled_back inside it. Any FK error aborts with nothing deleted.
3. After commit, trash the batch's Drive files and folders (from import_files / import_refs
   entity drive_file). Failures are listed and retried by re-running rollback on a rolled_back batch
   (Drive-only resume), never block the DB step.
```

**Issue #6:** Float positions go into integer columns.
**Edit in:** `docs/specs/monday-migration/backend.md` → §5.2 Group row, §6.3
**Change:**
```
seccion_order = 1-based dense rank of the group after sorting groups by parseFloat(position).
sort_order (tasks and schedule_tasks) = 0-based index of the item in export order within its
group (items_page order), offset by group rank × 10,000 so groups stay contiguous. Never store
monday `position` directly.
```

**Issue #7:** `StatusTarget` breaks the custom-status invariant.
**Edit in:** `docs/specs/monday-migration/backend.md` → §5.4 `StatusTarget`, §5.2 Status row
**Change:**
```ts
export const StatusTarget = z.union([
  z.object({ status: z.enum(["pendiente", "en_proceso", "completado", "bloqueado"]) }),
  z.object({ customStatusId: z.uuid() }),   // status derived as underlyingStatus(cs): closes → completado, else en_proceso
]);
```
```
§5.2: When a label maps to a custom status, tasks.status = underlyingStatus(task_statuses row)
(lib/repositories/task-statuses-repository.ts), exactly as setTaskCustomStatus does. plan
blocks with STATUS_INVALID if the custom status is missing or soft-deleted.
```

**Issue #8:** Who owns the Drive pieces is unclear.
**Edit in:** `docs/specs/monday-migration/backend.md` → §0.3.9 and §10; `docs/specs/backend.md` → §A.3 and §A.6.1; `docs/phases/staff-sso-phase-1-google-sign-in-gate.md`; `docs/phases/staff-sso-phase-3-project-drive.md`
**Change (monday backend §0.3.9 / §10, replace the "Taken over" bullets):**
```
Moved into Migration Phase 1:
- Schema: the `drive_folder_status` enum and projects.drive_folder_id, drive_internal_folder_id,
  drive_client_folder_id, drive_inbound_folder_id, drive_folder_status, drive_folder_error
  (definitions exactly as Staff SSO §A.3), plus drive_import_folder_id. #482 drops them.
- lib/google/drive-admin.ts (#483) with: create folder, list, get parents, resumable upload,
  trash. (rename, get media, export stay with #483's remainder in Staff SSO Phase 3.)
- ensureProjectFolders(projectId) as a plain function (#489 part 1), no server-only, db injected.
- Env: GOOGLE_SHARED_DRIVE_ID (+ existing GOOGLE_SA_*) documented in .env.example now.
Stay in Staff SSO Phase 3 (#489 part 2): the createProject after() hook, rename on name/code
change, retryProjectFolderAction, ensureMissingProjectFoldersAction and the Configuración →
Google UI. Until then only the import creates folders.
```
**Change (`docs/specs/backend.md` §A.3, above the projects block):**
```
> Already added by the monday migration (docs/specs/monday-migration/backend.md §10). Part A's
> migration does not add these columns again.
```
**Change (`docs/specs/backend.md` §A.6.1, after the Module line):**
```
> `drive-admin.ts` (create folder, list, get parents, resumable upload, trash) and
> `ensureProjectFolders` already exist from the monday migration; Phase 3 adds rename, get media,
> export, the createProject hook, retry/admin actions and UI.
```
**Change (phase docs):** in `staff-sso-phase-1`, remove "`core.projects` drive columns + `drive_folder_status` enum" from the migration deliverable. In `staff-sso-phase-3`, mark the `drive-admin.ts` and `ensureProjectFolders` items as "extend existing (monday migration)".

**Issue #9:** Project comments have no UI.
**Edit in:** `docs/specs/monday-migration/frontend.md` → §2.4 (and §4 API contract); `docs/specs/monday-migration/backend.md` → §5.2 Updates row
**Change:**
```
§2.4: Project ficha gains a **Bitácora** card (read + add comment), same component as the task
bitácora, fed by `fetchProjectHistoryAction(projectId)` (entity = 'project', newest first) and
`addProjectCommentAction(projectId, comment)` in lib/actions/projects-actions.ts; staff session,
same visibility as the project. Imported item_as_project comments appear there.
§4 table: add both actions.
```
