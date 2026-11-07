# Spec: Project flow (tramos, fases, puestos) and monday port (Backend)

**Status:** Ready for review · **Owner:** Oscar · **Date:** 2026-11-06
**Source brief:** `docs/specs/source/project-flow-spec.md`. Its "Decisions already made" and "Defaults to confirm" table are final, and this spec builds with them.
**Decision record:** `docs/adr/0003-project-flow-tramos-fases-puestos.md`.
**Companion:** `docs/specs/project-flow/frontend.md`. Its §7 is the contract this file implements; §18 checks every item and §19 lists the mismatches.
**Stack:** the existing app. Next.js App Router + TypeScript, Server Actions in `lib/actions/<entity>-actions.ts` (authorized through `requireCapabilityUser` in `lib/auth/session.ts`), repositories in `lib/repositories/*`, Drizzle ORM on Postgres 17 (`lib/db/schema/*`, migrations in `lib/db/migrations`, drizzle-kit), vitest. There is no separate API service, no new Docker service and no new queue.

---

## 0. Context

### 0.1 What the code does today

| Concept | Today | Where |
|---|---|---|
| Tramo | `core.workflows` (`key` presale/diseno/construccion, `name`, `active`, `sort_order`). The UI labels and the TS templates come from a hardcoded copy, `DEPARTMENTOS` | `lib/db/schema/workflows.ts:16-29`, `lib/actividades/departamento.ts:22-54` |
| Fase | Free text in three places: `projects.phases text[]` + legacy `projects.phase`, `tasks.phase`, `workflow_task_templates.phase` | `projects.ts:137-140`, `tasks.ts:55`, `workflows.ts:39` |
| Templates | Two systems. TS files `lib/templates/{presale,diseno,operativas}.ts` (10 + 29 + 12 rows, `{ phase, description }`) and `workflow_task_templates`, applied by `applyWorkflow` | `lib/templates/*`, `lib/repositories/projects-repository.ts:528-644` |
| Template title uniqueness | `workflow_task_templates_title_lower_uq` on `(workflow_id, lower(title)) where active`. **The TS seed breaks it:** "Fachadas y alzados" is in Diseño twice (Proyecto Arquitectónico, Ejecutivo) and "Garantias" is in Construcción twice (Residencia, Postventa) | `workflows.ts:55-57` |
| Áreas | `areas`, `area_members` (`source` manual/workspace), `area_workflows` (empty on dev) | `lib/db/schema/people.ts:90-132`, `workflows.ts:62-78` |
| "Sin área" | List queries read an área color through `area_workflows`; it is always null | `projects-repository.ts:110`, `tasks-repository.ts:310` |
| Project client | `projects.client_id NOT NULL` with the composite FK `(client_id, client_type) → contacts(id, type)`; `projects_client_name_lower_uq` makes names unique per client only. `createProject` throws `PROJECT_CLIENT_REQUIRED` / `PROJECT_STAGE_REQUIRED` | `projects.ts:126-129,171-186`, `projects-repository.ts:255-257` |
| Joins on client | `listProjects` and `listTasks` use `innerJoin(contacts, …clientId)`, so a project without a client would vanish | `projects-repository.ts:149`, `tasks-repository.ts:325` |
| Stages | `project_stages (project_id, workflow_id)` PK only, no dates; `current_workflow_id` is kept as "the most advanced" | `projects.ts:280-293`, `projects-repository.ts:324-389` |
| Task kind | enum `task_kind` = workflow \| usuario; check `tasks_kind_check`; `tasks_project_template_uq` partial unique on live rows | `_schema.ts:334`, `tasks.ts:84-98` |
| Task closing | Built-in `status`, or `custom_status_id` → `task_statuses.closes`; `underlyingStatus()` stores `completado` for any closing custom status. No `closed_at`, no "counts as completed" | `tasks.ts:25-40`, `task-statuses-repository.ts:18-20`, `lib/tasks/status-options.ts:130` |
| Google groups | enum `group_mapping_kind` = role \| area; `workspace_group_mappings.area_id`; `evaluateAccess` / `applyAccess` replace `area_members` when area mappings exist | `people.ts:17,135-154`, `lib/auth/workspace-access.ts:137-195` |
| Assignable staff | `listAssignableStaff` joins `area_workflows → area_members` | `staff-repository.ts:127-143` |
| Settings | `core.app_settings (key text PK, value text)` | `lib/db/schema/shared.ts:151-155` |
| Default rows on a fresh install | `scripts/migrate.mjs` runs the migrations and **then** `ensureDefaultWorkflows` (`scripts/default-workflows.mjs`). So on a fresh database, migration SQL runs before any workflow exists | `scripts/migrate.mjs:34-37` |
| monday import | CLI `scripts/monday/*` + wizard `lib/monday-import/*`. Per-board `statusMaps` (`mapping.schema.ts:128`), group targets `phase`/`workflow_phase`/`stage`/`project`/`ignore` (`mapping.schema.ts:65-76`, `scripts/monday/group-targets.ts:12-46`), task áreas (`mapping.schema.ts:84-99`, `lib/monday-import/task-areas.ts`). Translate issues are pushed (`scripts/monday/plan.ts:763`) before the "already imported" sets are computed (line 766). Wizard jobs run in-process and persist to `wizard.json` (`lib/monday-import/runs.ts:1-17`) | |
| Background work | `after()` from `next/server` (Drive folders after project create), plus the wizard's in-process jobs | `lib/actions/projects-actions.ts:47-49` |

### 0.2 Decisions applied (from the brief; not revisited)

1. Áreas are removed; puestos replace them. Three tramos = the `workflows` rows. UI word "Tramo".
2. Fases are an ordered catalog per tramo, enforced by the DB: a task's fase belongs to its tramo (composite FK).
3. One template system: `workflow_task_templates` with `phase_id`, seeded from `lib/templates/*.ts`, which are then deleted with `DEPARTMENTOS` and the "Aplicar workflow" path.
4. A project starts with a name only. Client and origin are optional and admin-only. A project without a client gets the admin task "Asignar cliente y origen", which **closes automatically when a client is set** (origin optional). The portal invite and the client Drive folder wait for a client. Project names are unique across the firm.
5. Admin tasks: `kind = 'admin'`, no tramo, no fase, no espacio, visible to and assignable to **administrators only** (access "Administrador").
6. Starting a tramo is a pull, idempotent, with undo: a 10 s toast, then "Deshacer inicio" on the project block **until any created task is edited**.
7. Presale auto-starts on project create; later tramos are manual by default; admins can switch auto-start per tramo (firm-wide).
8. Readiness is fixed in code: Diseño after Presale·Cobro, Construcción after Diseño·Ejecutivo. Shown read-only.
9. Espacio: optional per-project list; a task has at most one.
10. Status catalog is firm-wide. Seed **Cancelado** (closes, not counted as completed) and **En espera** (open).
11. Several tramos open per project; one current. Dashboard and board use the current one.
12. monday: **six** group targets (Tramo, Fase, Espacio, Proyecto aparte, Tareas de administración, Ignorar; "Administrativo" → Tareas de administración). A group never creates a fase. The status map is a **persisted firm-wide setting** with priority. Timeline → commitment and delivery dates; "Fecha que finalizó" → `closed_at`. Titles lose monday numbering. Grouped warnings never include already imported items. "Crear integrante" suggests a puesto.
13. Re-sorting imported projects: a one-time script run with the data migration (Madrid 22, Guadalajara 83, Local Espiropapa) **plus** the admin action "Reacomodar importación" per imported project.
14. Diseño is named "Diseño" everywhere. `staff.role` keeps the access role only. Workload by fase/puesto is out of scope.

---

## 1. Project overview

**What this backend does.** It replaces the áreas model and the free-text fases with one hierarchy (Proyecto → Tramo → Fase → Tarea, optional Espacio), adds puestos with candidate fases, lets a project start with a name only, implements the "Iniciar tramo" pull with idempotency and undo, adds admin-only tasks and data, and ports the monday importer and the already imported projects onto the same model.

**Consumers.** Only the Next.js UI, through Server Actions (frontend §7). The monday CLI (`npm run monday -- …`) and the one-time scripts call the same shared modules with their own Drizzle client.

**Non-goals.** CRM features; monday sync; staff sign-in, portal or Drive layout changes beyond gating on a client; editable readiness rules; workload by fase/puesto; a public HTTP API; new infrastructure (services, queues, observability stack).

---

## 2. Module layout

```
lib/db/schema/
  workflows.ts        + workflowAutoStart enum, workflowPhases, autoStart column; templates.phaseId
  tasks.ts            + phaseId, spaceId, closedAt, systemKey, startBatchId; taskStatuses.countsAsCompleted
  projects.ts         + projectSpaces, tramoStartBatches; client nullable, origin, originStaffId; stage dates
  people.ts           + positions, staffPositions, positionPhases; group mapping kind position
  flow-report.ts      (new) projectFlowMigrationReport
lib/project-flow/      (new; every function takes `db`/`tx` as its first parameter, no server-only import, so scripts can use it)
  names.ts            nameKey(), stripMondayNumbering()
  catalog.ts          DEFAULT_CATALOG re-export + readiness rules (READINESS)
  readiness.ts        tramoBoard(db, workflowId, viewer)
  start-tramo.ts      previewStartTramo, startTramo, undoStartTramo, isBatchTouched
  auto-start.ts       autoStartOnCreate, autoStartOnReady
  admin-tasks.ts      ensureAssignClientTask, closeAssignClientTask, assertAdminAssignees
  closing.ts          closedAtPatch(), refreshStageClosed()
lib/validation/project-flow.ts   (new) zod schemas for the new action inputs
lib/actions/
  tramo-start-actions.ts (new)  positions-actions.ts (new)
  workflows-actions.ts  projects-actions.ts  tasks-actions.ts  staff-actions.ts
  task-statuses-actions.ts  workspace-access-actions.ts  monday-import-actions.ts
  areas-actions.ts      (deleted)
lib/repositories/
  workflow-phases-repository.ts (new)  positions-repository.ts (new)  project-spaces-repository.ts (new)
  workflows-repository.ts  projects-repository.ts  tasks-repository.ts  staff-repository.ts
  task-statuses-repository.ts  workspace-group-mappings-repository.ts
  areas-repository.ts   (deleted)
scripts/
  default-catalog.mjs   (new) DEFAULT_CATALOG, DEFAULT_POSITIONS, ensureDefaultCatalog(sql)
  project-flow-report.ts (new) prints the migration report (npm run flow:report)
  monday/remap.ts       (new) remap core + `npm run monday -- remap`
```

Pattern kept: actions authorize, validate and call repositories; repositories own the queries and transactions; actions throw `Error("CODE[: detail]")` (frontend §9), except the monday actions, which keep `MondayImportResult` (`{ ok: true, … } | { ok: false, error }`).

---

## 3. Data model (Drizzle schema changes)

Conventions kept: `core` schema, uuid PKs `defaultRandom()`, `stamps` (`created_at`, `updated_at`), `soft` (`deleted_at`) where rows are user data, every FK column indexed, partial unique indexes on live rows.

### 3.1 ER overview

```
workflows (id, key, name, sort_order, active, auto_start)                      ← tramo
  ├── workflow_phases (id, workflow_id FK, key, name, sort_order, active)       ← fase; UNIQUE (id, workflow_id)
  │     └── position_phases (position_id FK, phase_id FK)
  ├── workflow_task_templates (id, workflow_id FK, phase_id, …)                 FK (phase_id, workflow_id) → workflow_phases
  └── project_stages (project_id FK, workflow_id FK, started_at, started_by_id FK, closed_at)

projects (id, name, client_id NULL, origin, origin_staff_id FK, current_workflow_id FK, …)
  ├── project_spaces (id, project_id FK, name, sort_order)                       UNIQUE (id, project_id)
  ├── tramo_start_batches (id, project_id FK, workflow_id FK, started_by_id FK, previous_current_workflow_id FK, …)
  └── tasks (id, project_id FK, kind, workflow_id FK, phase_id, space_id, template_id, start_batch_id FK, system_key, closed_at, …)
        FK (phase_id, workflow_id)  → workflow_phases (id, workflow_id)
        FK (space_id, project_id)   → project_spaces (id, project_id)
        FK (template_id, workflow_id) → workflow_task_templates (id, workflow_id)   (existing)

staff (id, role = access role only, …)
  ├── staff_positions (staff_id FK, position_id FK, source)
positions (id, name, sort_order, active)
workspace_group_mappings (…, kind role|position, role, position_id FK)
task_statuses (…, closes, counts_as_completed)
project_flow_migration_report (id, kind, entity, entity_id, value, detail)

Removed (release B): areas, area_members, area_workflows, tasks.phase, workflow_task_templates.phase,
projects.phase, projects.phases, workspace_group_mappings.area_id
```

### 3.2 `workflows` (`lib/db/schema/workflows.ts`)

```ts
export const workflowAutoStart = core.enum("workflow_auto_start", ["on_create", "on_ready", "manual"]);

export const workflows = core.table("workflows", {
  // … existing columns
  autoStart: workflowAutoStart("auto_start").notNull().default("manual"),
});
```

- `on_create` is only valid for the first active tramo (lowest `sort_order`); `on_ready` only for the others. Enforced in `setWorkflowAutoStart` (§7.2), not in the DB (the "first" tramo is a property of the set).
- The `areas` relation in `workflowsRelations` is removed.

### 3.3 `workflow_phases` (new, `workflows.ts`)

```ts
export const workflowPhases = core.table(
  "workflow_phases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id").notNull().references(() => workflows.id, { onDelete: "restrict" }),
    /** Stable code for fases the code refers to (readiness gates, seed). Never shown; survives renames. */
    key: text("key"),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...stamps,
  },
  (t) => [
    unique("workflow_phases_id_workflow_uq").on(t.id, t.workflowId),          // target of the composite FKs
    uniqueIndex("workflow_phases_name_lower_uq").on(t.workflowId, sql`lower(${t.name})`),
    uniqueIndex("workflow_phases_key_uq").on(t.workflowId, t.key).where(sql`${t.key} is not null`),
    index("idx_workflow_phases_workflow_order").on(t.workflowId, t.sortOrder), // covers the FK
  ]
);
```

- Fases are never deleted: deactivating hides them from selects and keeps them on tasks. Hence no `deleted_at`, and `restrict` on the workflow FK.
- Name uniqueness: the DB enforces `lower(name)` per tramo (brief). The repository also refuses names whose `nameKey` (lower, no accents, collapsed spaces) matches another fase of the tramo, so "Ejecutivo" and "Ejécutivo" can't coexist. Both cases throw `NAME_TAKEN`.
- "Minutas" exists in Presale and Diseño as two rows (different `workflow_id`), as the brief requires.

### 3.4 `workflow_task_templates` (`workflows.ts`)

| Change | Release |
|---|---|
| Add `phase_id uuid` (nullable in A, `NOT NULL` in B) | A / B |
| FK `workflow_task_templates_phase_fk` `(phase_id, workflow_id) → workflow_phases (id, workflow_id)` `on delete restrict` | A |
| Index `idx_workflow_task_templates_phase_id (phase_id)` | A |
| Replace `workflow_task_templates_title_lower_uq` `(workflow_id, lower(title)) where active` with `(workflow_id, phase_id, lower(title)) where active`. Needed because the seed has the same title in two fases of one tramo (§0.1) | A |
| Drop `phase text` | B |

### 3.5 `tasks` (`lib/db/schema/tasks.ts`)

```ts
// _schema.ts
export const taskKind = core.enum("task_kind", ["workflow", "usuario", "admin"]);

// tasks
phaseId: uuid("phase_id"),
spaceId: uuid("space_id"),
/** When the task last closed (status completado or a closing custom status); null while open. */
closedAt: timestamp("closed_at", { withTimezone: true }),
/** Marks system-made tasks, e.g. 'assign_client' for "Asignar cliente y origen". */
systemKey: text("system_key"),
/** The "Iniciar tramo" batch that created the task (undo). */
startBatchId: uuid("start_batch_id").references(() => tramoStartBatches.id, { onDelete: "set null" }),
```

Constraints and indexes:

```ts
foreignKey({ name: "tasks_phase_fk", columns: [t.phaseId, t.workflowId],
  foreignColumns: [workflowPhases.id, workflowPhases.workflowId] }).onDelete("restrict"),
foreignKey({ name: "tasks_space_fk", columns: [t.spaceId, t.projectId],
  foreignColumns: [projectSpaces.id, projectSpaces.projectId] }).onDelete("restrict"),
// MATCH SIMPLE skips a composite FK when any column is null: a fase without a tramo would slip through.
check("tasks_phase_needs_workflow_check", sql`${t.phaseId} is null or ${t.workflowId} is not null`),
check("tasks_kind_check", sql`
  (${t.kind}::text = 'workflow' and ${t.templateId} is not null and ${t.workflowId} is not null)
  or (${t.kind}::text = 'usuario' and ${t.templateId} is null)
  or (${t.kind}::text = 'admin' and ${t.templateId} is null and ${t.workflowId} is null
      and ${t.phaseId} is null and ${t.spaceId} is null)`),
check("tasks_closed_at_check", sql`${t.closedAt} is null or ${t.status} = 'completado'`),
uniqueIndex("tasks_project_system_key_uq").on(t.projectId, t.systemKey)
  .where(sql`${t.systemKey} is not null and ${t.deletedAt} is null`),
index("idx_tasks_phase_id").on(t.phaseId),
index("idx_tasks_space_id").on(t.spaceId),
index("idx_tasks_start_batch_id").on(t.startBatchId),
index("idx_tasks_kind").on(t.kind).where(sql`${t.kind}::text = 'admin' and ${t.deletedAt} is null`),
```

- The checks compare `kind::text`, not the enum. `ALTER TYPE … ADD VALUE 'admin'` runs in the same migrator transaction, and Postgres refuses to *use* a new enum value before commit. A text comparison isn't a use.
- `tasks_space_fk` is `restrict`, not `set null`: on a composite FK, `set null` would null `project_id` too. Deleting an espacio first nulls `space_id` on its tasks, then deletes the row, in one transaction (§8.3).
- `phase text` stays declared (marked `@deprecated`) until release B drops it, so `drizzle-kit generate` in release A emits no drop.
- The existing `idx_tasks_workflow_id` covers the `workflow_id` side of `tasks_phase_fk`. `idx_tasks_project_id` covers the `project_id` side of `tasks_space_fk`.

### 3.6 `task_statuses` (`tasks.ts`)

```ts
countsAsCompleted: boolean("counts_as_completed").notNull().default(false),
// …
check("task_statuses_counts_check", sql`not ${t.countsAsCompleted} or ${t.closes}`),
```

"Completed work" (metrics, readiness, trend, progress) = `status = 'completado' and (custom_status_id is null or custom.counts_as_completed)`. "Closed" (overdue, open counts) stays `status = 'completado'`. New helper `isTaskCompleted()` next to `isTaskClosed()` in `lib/tasks/status-options.ts:130`.

### 3.7 `projects` and `project_stages` (`lib/db/schema/projects.ts`)

| Change | Release |
|---|---|
| `client_id` nullable (`clientId: uuid("client_id")`). The composite FK `projects_client_fk` is kept: with `client_id` null it is skipped (MATCH SIMPLE), and `client_type` stays generated | A |
| Add `origin text` (free text, e.g. "Recomendación de …") | A |
| Add `origin_staff_id uuid → staff.id on delete set null` + `idx_projects_origin_staff_id` | A |
| Drop `projects_client_name_lower_uq`; add `projects_name_lower_uq` on `lower(name) where deleted_at is null and status in ('activo','pausado')`. Archived = `completado`/`cancelado` (what `archiveProjectAction` sets) | A |
| `idx_projects_client_id` kept | |
| Drop `phase`, `phases` | B |
| `client_stats` view: add `where client_id is not null` | A |

`project_stages`:

```ts
startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
startedById: uuid("started_by_id").references(() => staff.id, { onDelete: "set null" }),
/** Set when every live, unarchived task of this tramo on the project is closed; cleared when one reopens or is added. */
closedAt: timestamp("closed_at", { withTimezone: true }),
// + index("idx_project_stages_started_by_id").on(t.startedById)
```

Rule: `current_workflow_id`, when set, must have a `project_stages` row. Enforced by the repositories (`setProjectCurrentTramo` throws `NOT_STARTED`; `startTramo` writes the row before moving `current`) and backfilled by 0024. Not a DB FK: the existing column has `on delete set null` semantics on `workflows`, and a composite FK `(id, current_workflow_id) → project_stages` would make undo order-dependent.

### 3.8 `project_spaces` (new, `projects.ts`)

```ts
export const projectSpaces = core.table(
  "project_spaces",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    ...stamps,
  },
  (t) => [
    unique("project_spaces_id_project_uq").on(t.id, t.projectId),
    uniqueIndex("project_spaces_name_lower_uq").on(t.projectId, sql`lower(${t.name})`),
    index("idx_project_spaces_project_order").on(t.projectId, t.sortOrder),
  ]
);
```

Espacios are hard-deleted (they're a filter, not history). Task history keeps the old `spaceId` value in `history_events`.

### 3.9 `tramo_start_batches` (new, `projects.ts`)

```ts
export const tramoStartBatches = core.table(
  "tramo_start_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id").notNull().references(() => workflows.id, { onDelete: "restrict" }),
    startedById: uuid("started_by_id").references(() => staff.id, { onDelete: "set null" }),
    /** 'manual' (sheet) | 'on_create' | 'on_ready' (auto-start). */
    trigger: text("trigger").notNull().default("manual"),
    phaseIds: uuid("phase_ids").array().notNull().default(sql`'{}'::uuid[]`),
    assignmentMode: text("assignment_mode").notNull(),               // self | by_phase | none
    createdCount: integer("created_count").notNull().default(0),
    stageCreated: boolean("stage_created").notNull().default(false),
    previousCurrentWorkflowId: uuid("previous_current_workflow_id").references(() => workflows.id, { onDelete: "set null" }),
    currentChanged: boolean("current_changed").notNull().default(false),
    undoneAt: timestamp("undone_at", { withTimezone: true }),
    undoneById: uuid("undone_by_id").references(() => staff.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("tramo_start_batches_trigger_check", sql`${t.trigger} in ('manual','on_create','on_ready')`),
    check("tramo_start_batches_mode_check", sql`${t.assignmentMode} in ('self','by_phase','none')`),
    index("idx_tramo_start_batches_project_workflow").on(t.projectId, t.workflowId, t.createdAt),
    index("idx_tramo_start_batches_workflow_id").on(t.workflowId),
    index("idx_tramo_start_batches_started_by_id").on(t.startedById),
    index("idx_tramo_start_batches_undone_by_id").on(t.undoneById),
    index("idx_tramo_start_batches_previous_current").on(t.previousCurrentWorkflowId),
  ]
);
```

A batch row is written only when at least one task was created (`createdCount > 0`); otherwise `StartTramoResult.batchId` is null.

### 3.10 Puestos (`lib/db/schema/people.ts`)

```ts
export const positions = core.table(
  "positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    ...stamps,
    ...soft,
  },
  (t) => [uniqueIndex("positions_name_lower_uq").on(sql`lower(${t.name})`).where(sql`${t.deletedAt} is null`)]
);

export const staffPositions = core.table(
  "staff_positions",
  {
    staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
    positionId: uuid("position_id").notNull().references(() => positions.id, { onDelete: "cascade" }),
    /** 'manual' | 'workspace' (from a Google group mapping), as area_members.source was. */
    source: text("source").notNull().default("manual"),
    ...stamps,
  },
  (t) => [
    primaryKey({ columns: [t.staffId, t.positionId] }),
    index("idx_staff_positions_position_id").on(t.positionId),
    check("staff_positions_source_check", sql`${t.source} in ('manual','workspace')`),
  ]
);

export const positionPhases = core.table(
  "position_phases",
  {
    positionId: uuid("position_id").notNull().references(() => positions.id, { onDelete: "cascade" }),
    phaseId: uuid("phase_id").notNull().references(() => workflowPhases.id, { onDelete: "cascade" }),
    ...stamps,
  },
  (t) => [primaryKey({ columns: [t.positionId, t.phaseId] }), index("idx_position_phases_phase_id").on(t.phaseId)]
);
```

`deletePosition` soft-deletes the row and hard-deletes its `staff_positions` and `position_phases` rows in the same transaction (live data only; puestos carry no history). It refuses with `IN_USE` while a Google mapping points at it (the FK below is `restrict`).

`positions` imports `workflowPhases` from `workflows.ts`. `workflows.ts` must stop importing `areas` from `people.ts` (it does today, `workflows.ts:13`), so the import graph stays acyclic.

### 3.11 Google group mappings (`people.ts`)

```ts
export const groupMappingKind = core.enum("group_mapping_kind", ["role", "position"]);  // 'area' renamed
// workspace_group_mappings:
positionId: uuid("position_id").references(() => positions.id, { onDelete: "restrict" }),
// check workspace_group_mappings_kind_check:
//   (kind = 'role' and role is not null and position_id is null)
//   or (kind = 'position' and position_id is not null and role is null)
// + index("idx_workspace_group_mappings_position_id").on(t.positionId)
// area_id: kept declared (@deprecated, always null) until release B drops it
```

### 3.12 Migration report (new, `lib/db/schema/flow-report.ts`)

```ts
export const projectFlowMigrationReport = core.table(
  "project_flow_migration_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").notNull(),          // see §4.4
    entity: text("entity").notNull(),      // task | template | project | area | area_member | area_workflow | group_mapping
    entityId: uuid("entity_id"),
    value: text("value"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("project_flow_migration_report_uq").on(t.kind, t.entity, sql`coalesce(${t.entityId}::text, '')`, sql`coalesce(${t.value}, '')`),
    index("idx_project_flow_migration_report_kind").on(t.kind),
  ]
);
```

No FK on `entity_id`: the report must outlive the rows it describes (áreas are dropped). The table stays until a later cleanup release.

### 3.13 FK index check

| FK column | Index |
|---|---|
| `workflow_phases.workflow_id` | `idx_workflow_phases_workflow_order` |
| `workflow_task_templates.phase_id` | `idx_workflow_task_templates_phase_id` |
| `tasks.phase_id` / `space_id` / `start_batch_id` | `idx_tasks_phase_id` / `idx_tasks_space_id` / `idx_tasks_start_batch_id` |
| `projects.origin_staff_id` | `idx_projects_origin_staff_id` |
| `project_stages.started_by_id` | `idx_project_stages_started_by_id` |
| `project_spaces.project_id` | `idx_project_spaces_project_order` |
| `tramo_start_batches.{project_id, workflow_id, started_by_id, undone_by_id, previous_current_workflow_id}` | five indexes in §3.9 |
| `staff_positions.staff_id` / `position_id` | PK prefix / `idx_staff_positions_position_id` |
| `position_phases.position_id` / `phase_id` | PK prefix / `idx_position_phases_phase_id` |
| `workspace_group_mappings.position_id` | `idx_workspace_group_mappings_position_id` |

---

## 4. Migration plan

Two code releases, with a manual step in between. Migrations auto-run on deploy (`scripts/migrate.mjs`, all pending files in one migrator transaction), so each file must be safe to run unattended and must never fail on real data: problems go into the report instead of aborting.

| Step | What | When |
|---|---|---|
| **0023_project_flow_schema.sql** | Additive DDL (drizzle-kit generate, then the hand edits of §4.1) | Release A |
| **0024_project_flow_backfill.sql** | Custom SQL: seed, backfill, report, group-mapping kind rename, unique-name swap | Release A |
| **Ops** | Pre-flight `npm run monday -- remap --projects "Madrid 22,Guadalajara 83,Local Espiropapa"` (no `--apply`) must report every board with `source != null` (§11.2); then `--apply`; `npm run flow:report > report.md`; results recorded on the issue | After A is deployed, before B |
| **0025_project_flow_drops.sql** | Re-snapshot report rows, `SET NOT NULL`, drops | Release B (a later release) |

Rollback: before 0025, release A can be reverted by redeploying the previous image (all A changes are additive except the enum rename and the unique-name swap, which the old code tolerates: it never writes kind `area` mappings once areas are gone, and names are already deduplicated). Known effects of such a revert: the old code shows admin tasks to everyone (it doesn't know `kind = 'admin'`), and client-less projects and their tasks disappear from lists (its `innerJoin(contacts)`, `projects-repository.ts:149`, `tasks-repository.ts:325`). Nothing is lost; the rows come back with release A. After 0025, rollback is a DB restore from the backup taken before deploying release B (ADR 0003).

### 4.1 0023_project_flow_schema.sql (additive)

drizzle-kit generate, then hand edits:
- Keep `ALTER TYPE "core"."task_kind" ADD VALUE IF NOT EXISTS 'admin'` and `CREATE TYPE "core"."workflow_auto_start"`.
- **Delete every generated statement that touches `group_mapping_kind` or `workspace_group_mappings_kind_check`.** drizzle-kit 0.31 handles the removed `'area'` value with a column → text, `DROP TYPE`, `CREATE TYPE`, cast-back sequence. That fails on rows with `'area'` (and against the old check), and where none exist it makes the `RENAME VALUE` of 0024 step 13 fail. The enum rename and the check swap happen only in 0024 step 13; the 0024 snapshot (`meta/0024_snapshot.json`) reflects the final state, so the next generate is clean.
- Add `NOT VALID` to `tasks_closed_at_check` (validated in 0024 step 8).
- Write the `client_stats` `CREATE OR REPLACE VIEW` by hand (drizzle-kit doesn't diff views).

Order inside the file:

1. `ALTER TYPE "core"."task_kind" ADD VALUE IF NOT EXISTS 'admin';`
2. `CREATE TYPE "core"."workflow_auto_start" AS ENUM ('on_create','on_ready','manual');`
3. `CREATE TABLE` workflow_phases, project_spaces, tramo_start_batches, positions, staff_positions, position_phases, project_flow_migration_report.
4. `ALTER TABLE` add columns: `workflows.auto_start`; `workflow_task_templates.phase_id`; `tasks.phase_id, space_id, closed_at, system_key, start_batch_id`; `task_statuses.counts_as_completed`; `projects.origin, origin_staff_id`; `projects ALTER client_id DROP NOT NULL`; `project_stages.started_at` (default now()), `started_by_id`, `closed_at`; `workspace_group_mappings.position_id`.
5. FKs (including `tasks_phase_fk`, `tasks_space_fk`, `workflow_task_templates_phase_fk`), checks (`tasks_phase_needs_workflow_check`, `task_statuses_counts_check`, `tasks_closed_at_check` **NOT VALID**), indexes. Nothing on `workspace_group_mappings_kind_check`.
6. Replace `tasks_kind_check` (drop + add, with the `::text` comparisons).
7. Replace `workflow_task_templates_title_lower_uq` with the `(workflow_id, phase_id, lower(title))` version.
8. Hand-written `CREATE OR REPLACE VIEW "core"."client_stats"` with `where deleted_at is null and client_id is not null`.
9. Helper `core.flow_name_key(text) returns text immutable`: `regexp_replace(translate(lower(btrim($1)), 'áéíóúüñ', 'aeiouun'), '[^a-z0-9]+', '', 'g')`. "Proyecto Arquitectonico" and "Proyecto Arquitectónico" both give `proyectoarquitectonico`; "Post - Venta" gives `postventa`. Dropped in 0025.

A db test (`lib/db/migrations/project-flow-migrations.db.test.ts`) applies 0023 + 0024 on a fixture with one `kind = 'area'` mapping and on one with none, and checks the final enum values, the new check and that the area mapping was reported and removed.

### 4.2 0024_project_flow_backfill.sql (custom SQL, ordered)

Each numbered step is one `--> statement-breakpoint` block. **Order matters:** statuses (`counts_as_completed`) → `tasks.closed_at` → stages (`started_at`, `closed_at` from `tasks.closed_at`) → current tramo.

1. **Tramo rows.** `update workflows set name = 'Diseño' where key = 'diseno' and deleted_at is null`. Set `description` from `DEPARTMENTOS` where null (Presale "Flujo de prospección, presentación y cierre.", Diseño "Flujo de anteproyecto, proyecto arquitectónico y ejecutivo.", Construcción "Flujo de residencia de obra y postventa."). `update workflows set auto_start = 'on_create' where key = 'presale'`; the rest stay `manual`.
2. **Fase catalog.** For each `(workflow key, fase key, name, sort_order)` of §5.1, `insert into workflow_phases … select w.id … from workflows w where w.key = … and w.deleted_at is null on conflict do nothing`. On a fresh database there are no workflows yet: nothing is inserted, and `ensureDefaultCatalog` (§5.4) does it after `ensureDefaultWorkflows`.
3. **Templates.** For each of the 51 rows in §5.2, insert with `phase_id` from step 2 and `sort_order` = position in its tramo, **per row** `where not exists (select 1 from workflow_task_templates x where x.workflow_id = … and flow_name_key(x.title) in (flow_name_key(<title>), flow_name_key(<legacyTitle>)) and (x.phase_id = <seed phase_id> or x.phase_id is null))`. Existing templates still have `phase_id null` here, so a matching one blocks the seed row and step 4 then gives it the fase; without the `is null` branch step 4's backfill would hit the `(workflow_id, phase_id, lower(title)) where active` index and abort the deploy. So a hand-typed "Minuta" skips only that row, never the whole tramo. `on conflict do nothing` as a second guard.
4. **Template fase backfill.** `update workflow_task_templates t set phase_id = p.id from workflow_phases p where t.phase_id is null and p.workflow_id = t.workflow_id and flow_name_key(p.name) = flow_name_key(t.phase)`, plus the alias `proyectoejecutivo` → `ejecutivo`. Templates still without a fase get the tramo's first fase (`sort_order` min) and a report row `template_phase_defaulted` (value = the old text).
5. **Task fase backfill** (live and deleted rows alike, so history reads consistently):
   - a. Text match within the task's tramo: same update as step 4 against `tasks.workflow_id`.
   - b. Workflow tasks with no text: `phase_id = template.phase_id`.
   - c. Tasks with text but `workflow_id is null` (usuario tasks without a tramo): if `flow_name_key(phase)` matches exactly **one** fase across all tramos, set `workflow_id` and `phase_id` and write `task_tramo_inferred`. "Minutas" matches two and is left alone.
   - d. Everything else with non-blank text: `phase_id` stays null; report row `task_phase_unmatched` (entity task, value = text, detail `{ projectId, workflowKey }`).
   - e. Link tasks made by the old "Iniciar plantilla" (usuario tasks with a tramo and the TS title). For each live `usuario` task whose `(workflow_id, flow_name_key(title))` equals a seeded template's `(workflow_id, flow_name_key(legacyTitle))` or `flow_name_key(title)`, and whose fase (after a–c) is that template's fase or null: set `kind = 'workflow'`, `template_id`, `phase_id`, when the (project, template) slot is free (first match by `created_at` wins). The task title is not changed. Without this, a later "Iniciar tramo" would create those tasks a second time. Report row `task_linked_to_template` per linked task. Matching on the key keeps accents and case out of it; `legacyTitle` covers the spelling fixes ("Resporte" → "Reporte").
6. **`projects.phases` report.** One `project_phases` row per project with a non-empty array (value = `array_to_string(phases, ' · ')`), before release B drops it.
7. **Statuses.**
   - `update task_statuses set counts_as_completed = closes`.
   - An existing live status named (by `flow_name_key`) "Cancelado" or "No se requiere" is **reused and updated**: `closes = true, counts_as_completed = false`. Tasks in it are re-synced (`status = 'completado'`).
   - An existing live "En espera" is reused and updated: `closes = false, counts_as_completed = false`; its tasks re-synced to `en_proceso`.
   - Only when no live row matches: insert "Cancelado" (`closes = true, counts_as_completed = false`) or "En espera" (`closes = false`), `sort_order = max + 1`. Report `status_reused` (detail `{ name, before: { closes, countsAsCompleted }, after, tasksResynced, tasksReopened }`; `tasksReopened` = tasks moved from `completado` to `en_proceso` when a closing "En espera" is reused, which also clears their `closed_at`) / `status_created`.
8. **Task `closed_at`.** For `status = 'completado'`: the `event_at` of the latest `history_events` row with `entity = 'task' and field = 'status' and after_value = 'completado'` (or `field = 'customStatusId'` to a closing status), else `updated_at`. Then `alter table tasks validate constraint tasks_closed_at_check`.
9. **Stages.** Ensure a `project_stages` row for every `current_workflow_id`. Insert missing stage rows for every (project, workflow) pair that has live tasks. Backfill `started_at = least(ps.created_at, min(task.created_at) of that tramo on the project)`. Set `closed_at = max(task.closed_at)` (from step 8) where every live, unarchived task of the pair is closed.
10. **Current tramo.** Projects without one: if the project has stage rows, set `current_workflow_id` to the highest `sort_order` one. Otherwise report `project_without_tramo` (the UI shows "Asignar tramo" from `needsTramo`).
11. **Duplicate names.** For live, active/paused projects that share `lower(name)`, keep the oldest; for each other one, try " (2)", " (3)", … and take the first candidate whose `lower(name)` is free among live projects (a PL/pgSQL `do` block loops per row, checking existing names and the ones already assigned in this step). Report `project_renamed_duplicate` (detail `{ before, after }`). Then `create unique index projects_name_lower_uq …` and `drop index projects_client_name_lower_uq`.
12. **Áreas report.** One row per live `areas` row (`area`, detail `{ name, leadId, colorSlot, members: n }`), per `area_members` row (`area_member`, detail `{ staffId, areaName, role, source }`) and per `area_workflows` row (`area_workflow`).
13. **Group mappings.** Report every `kind = 'area'` mapping (`group_mapping_area_removed`, detail `{ groupEmail, areaName }`), delete them, drop `workspace_group_mappings_kind_check`, `ALTER TYPE "core"."group_mapping_kind" RENAME VALUE 'area' TO 'position'`, and add the new check (§3.11). This is the only place the enum and the check change (§4.1). The column `area_id` is now always null.
14. **Puestos seed.** Insert the six puestos of §5.3 `where not exists` (by lower(name), soft-deleted rows included), with their candidate fases. On a fresh install there are no fases yet, so the puestos are inserted without candidates; `ensureDefaultCatalog` fills them in (§5.4).
15. **Permission overrides.** Nothing in the database: the custom permissions payload lives in browser storage (`readCustomPermissionsPayload`, `lib/auth/permissions.ts:824-846`) and the server uses the defaults. The client reader maps a stored `areas` module to `positions` (`canManageAreas` → `canManagePositions`) for one release (`readRoleModuleOverrides`, `permissions.ts:1168`). No SQL in this step; it is listed so the release notes cover it.

No area data is copied to puestos: the brief makes puestos a new catalog, and `area_members` is empty or meaningless on the installs checked.

### 4.3 0025_project_flow_drops.sql (release B)

1. Re-run the report inserts of 0024 steps 5d, 6 and 12 with `on conflict do nothing` (the unique index of §3.12 makes them idempotent), so anything written between releases is captured.
2. `alter table workflow_task_templates alter column phase_id set not null` (step 4 guarantees no nulls; any template created by release A code has one, since the action requires it).
3. Drop `tasks.phase`, `workflow_task_templates.phase`, `projects.phase`, `projects.phases`.
4. Drop `area_workflows`, `area_members`, `areas`, then `workspace_group_mappings.area_id`.
5. `drop function core.flow_name_key(text)`.
6. The `history_entity` enum keeps `'area'`: old history rows stay readable (never delete history).

Code in release B removes the `@deprecated` declarations, the `area` entry from the rollback table (`scripts/monday/rollback.ts:99,362-376,681`; old `area` refs become ref-only deletes), and the `areas` permission alias.

### 4.4 Migration report

`npm run flow:report` (`scripts/project-flow-report.ts`, own Drizzle client like `scripts/seed.ts`) prints markdown grouped by `kind` with counts and rows:

| kind | Meaning | Who acts |
|---|---|---|
| `task_phase_unmatched` | Task kept its tramo but has no fase ("Sin fase · revisar") | Tramo leads, or the remap |
| `task_tramo_inferred` | Task without tramo got the only tramo with that fase | Review only |
| `task_linked_to_template` | Old "Iniciar plantilla" task linked to its seeded template | Review only |
| `status_reused` | Existing Cancelado / No se requiere / En espera updated in place; detail has the old flags and the counts of tasks re-synced and reopened | Review; tell the team if `tasksReopened` > 0 |
| `status_created` | Cancelado / En espera created | Review only |
| `template_phase_defaulted` | Template put in the tramo's first fase | Admin, in Tramos y fases |
| `project_phases` | The old `projects.phases` values | Review only (dropped in B) |
| `project_without_tramo` | No current tramo ("Asignar tramo") | Admin |
| `project_renamed_duplicate` | Name made unique | Admin |
| `area`, `area_member`, `area_workflow` | Área data dropped in B | Admin: recreate as puestos if wanted |
| `group_mapping_area_removed` | Google group that granted an área | Admin: remap the group to a puesto |

The ops step records the report output and the remap previews on the release issue (no CI involvement).

---

## 5. Seed data

### 5.1 Fase catalog (`scripts/default-catalog.mjs` `DEFAULT_CATALOG`; mirrored in 0024)

| Tramo key | sort | Fase `key` | Name |
|---|---|---|---|
| presale | 0 | `inicial` | Inicial |
| presale | 1 | `presentacion` | Presentación |
| presale | 2 | `con_cliente` | Con Cliente |
| presale | 3 | `minutas` | Minutas |
| presale | 4 | `cobro` | Cobro |
| diseno | 0 | `anteproyecto` | Anteproyecto |
| diseno | 1 | `proyecto_arquitectonico` | Proyecto Arquitectónico |
| diseno | 2 | `ejecutivo` | Ejecutivo |
| diseno | 3 | `proyecto_estructural` | Proyecto Estructural |
| diseno | 4 | `proyecto_sustentable` | Proyecto Sustentable |
| diseno | 5 | `paisajismo` | Paisajismo |
| diseno | 6 | `minutas` | Minutas |
| construccion | 0 | `residencia` | Residencia |
| construccion | 1 | `postventa` | Postventa |

### 5.2 Templates (51 rows)

Ported from `lib/templates/presale.ts` (10), `diseno.ts` (29) and `operativas.ts` (12) with the spelling corrected (accents restored, typos fixed; RD-1): `title` as below, `phase_id` by fase name (accent-insensitive: the TS "Proyecto Arquitectonico" maps to "Proyecto Arquitectónico"), `default_priority = 'media'`, no offsets, `sort_order` = row index within the tramo. Each `DEFAULT_CATALOG` row also carries `legacyTitle`, the TS spelling, used only to link existing tasks (0024 step 5e). `DEFAULT_CATALOG` holds the rows so the TS files can be deleted in the same release. A vitest test asserts that 0024 contains every catalog row (drift guard).

| Tramo · Fase | Titles (seed order) | TS spelling changed |
|---|---|---|
| Presale · Inicial | Presentación "Quiénes somos" | "Quienes somos" |
| Presale · Presentación | Reporte Estado Actual · Imágenes de Referencia · Plano preliminar · Primeras Visualizaciones · Rango de Precios · Presupuesto Diseño | "Resporte Estado Actual", "Imagenes de Referencia" |
| Presale · Con Cliente | Presentar a cliente | |
| Presale · Minutas | Minuta | |
| Presale · Cobro | Cobrar Inicio de proyecto | |
| Diseño · Anteproyecto | Levantamiento · Concepto · Plano de distribución · Volumetría | "Plano de distribicion", "Volumetria" |
| Diseño · Proyecto Arquitectónico | Planos Arquitectónicos · Fachadas y alzados · Mood Board · Renders | "Planos Arquitectonicos" |
| Diseño · Ejecutivo | Fachadas y alzados · Planos de Demolición Desmantelamiento · Planos de Albañilerías · Planos Eléctricos · Planos Iluminación · Planos Hidráulicos · Planos Sanitarios · Planos Acabados · Planos de Carpintería · Plano de Mobiliario · Plano de Cancelerías · Planos de Herrerías · Memoria Descriptiva · Detalles y Especificaciones Técnicas | "Demolicion", "Albanilerias", "Electricos", "Hidraulicos", "Carpinteria", "Cancelerias", "Herrerias", "Tecnicas" |
| Diseño · Proyecto Estructural | Memoria de Cálculo · Cálculos Simulaciones | "Calculo", "Calculos" |
| Diseño · Proyecto Sustentable | Captación Agua Pluvial · Tratamiento aguas · Fotovoltaico | "Captacion" |
| Diseño · Paisajismo | Paleta Vegetal | |
| Diseño · Minutas | Minutas | |
| Construcción · Residencia | Bitácoras y Minutas · Reporte de Avance · Revisión de planos · Supervisión de trabajos · Cumplimiento Seguridad · Cumplimiento Orden y Limpieza · Atención a calidad y detalles finos · Garantías · Manual de Mantenimiento · Cierre de obra (Firma de actas) | "Bitacoras", "Revision", "Supervicion", "Atencion", "Garantias" |
| Construcción · Postventa | Mantenimientos · Garantías | "Garantias" |

Counts per fase: Presale 1/6/1/1/1; Diseño 4/4/14/2/3/1/1; Construcción 10/2.

### 5.3 Puestos (`DEFAULT_POSITIONS`)

| Puesto | Candidate fases |
|---|---|
| Arquitecto proyectista | Diseño · Anteproyecto, Proyecto Arquitectónico, Paisajismo |
| Proyectista ejecutivo | Diseño · Ejecutivo, Proyecto Estructural, Proyecto Sustentable |
| Dibujante | Diseño · Proyecto Arquitectónico, Ejecutivo |
| Comercial | Presale · Inicial, Presentación, Con Cliente, Minutas |
| Residente de obra | Construcción · Residencia, Postventa |
| Administración | Presale · Cobro |

Editable after seeding. The candidate lists are a starting point; they are suggestions only.

### 5.4 Fresh installs

`scripts/default-catalog.mjs` exports `ensureDefaultCatalog(sql)`. For each workflow with **no** `workflow_phases` rows at all, it inserts its fases and templates. Puestos are inserted only when `positions` has no rows at all, soft-deleted ones included. On the same call that seeds the fases, each live seeded puesto (matched by lower(name)) that has **no** `position_phases` rows gets its §5.3 candidate fases, which covers the fresh-install case where 0024 step 14 created the puestos before any fase existed. Cancelado and En espera are inserted only on the call that also seeded fases (a fresh install), and only when no row with that name exists, soft-deleted included. So it never resurrects a row an admin deleted, the same rule as `ensureDefaultWorkflows` (`scripts/default-workflows.mjs:20-22`). It never updates existing rows, so it is safe to repeat. It is called by `scripts/migrate.mjs` right after `ensureDefaultWorkflows` and by `scripts/seed.ts`. `DEFAULT_WORKFLOWS` gains `autoStart` (`presale: on_create`), and its `area` field and the seed's área steps (`scripts/seed.ts:67-111`) are removed.

---

## 6. Types and validation

Types are the frontend's §7.1 verbatim (`lib/types/core.ts`, `lib/types/monday-import.ts`). Backend-only additions:

```ts
// lib/types/core.ts
export type ViewerScope = { staffId: string; isAdmin: boolean };   // passed from actions to repositories
```

New action inputs are parsed server-side with zod (`lib/validation/project-flow.ts`) through one helper, `parseInput(schema, value)`. Rule: if the first zod issue's message is a known code (`EMPTY`), it throws that code; otherwise it throws `Error("INVALID: <path>")`. The UI doesn't import these schemas (it keeps its local checks, frontend §9).

```ts
const uuid = z.uuid();
const name = z.string().trim().min(1, "EMPTY").max(120);
export const WorkflowPhaseInputSchema = z.object({ name, active: z.boolean().optional() });
export const PositionInputSchema = z.object({ name, active: z.boolean().optional() });
export const ProjectCreateInputSchema = z.object({ name });
export const ProjectSpaceNameSchema = name;
export const OrderedIdsSchema = z.array(uuid).max(500);
export const StartTramoInputSchema = z.object({
  projectId: uuid, workflowId: uuid,
  phaseIds: z.array(uuid).max(50),
  assignment: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("self") }),
    z.object({ mode: z.literal("by_phase"), managers: z.record(uuid, uuid.nullable()) }),
    z.object({ mode: z.literal("none") }),
  ]),
  autoStart: z.boolean().optional(),
});
export const AdminTaskInputSchema = z.object({
  projectId: uuid, title: z.string().trim().min(1).max(500), notes: z.string().nullable().optional(),
  managerId: uuid.nullable().optional(), supportIds: z.array(uuid).max(50).optional(),
  priority: z.enum(["alta", "media", "baja"]).optional(),
  commitmentDate: isoDate.nullable().optional(), reviewDate: isoDate.nullable().optional(), deliveryDate: isoDate.nullable().optional(),
});
export const AdminTaskFiltersSchema = z.object({ projectId: uuid.optional(), includeClosed: z.boolean().optional() });
```

So an empty or blank name throws `EMPTY` (its zod message is `"EMPTY"`), a name over 120 characters or a malformed uuid throws `INVALID: <path>`, and the frontend copy table applies unchanged.

---

## 7. Server actions

Auth notation: **staff** = any session from `requireCapabilityUser()`; capability names are the frontend §8 ones; **admin** = `canSeeAdminData(user)` = `user.access === "Administrador"` (new helper in `lib/auth/permissions.ts`); **wizard admin** = the existing monday guard (Administrador, not the bootstrap admin). "Layout" revalidation = `revalidatePath("/actividades", "layout")`.

### 7.1 `lib/actions/workflows-actions.ts`

| Action | Input | Output | Auth | Errors | revalidatePath |
|---|---|---|---|---|---|
| `fetchWorkflowsAction(opts?)` | `{ includeInactive?, includeInactiveTemplates?, includeInactivePhases? }` | `WorkflowDetail[]` by `sortOrder`, with `phases`, `templates`, `readiness`, `autoStart` | staff for active rows (Actividades, Proyectos, Equipo, Puestos all read it). Any `includeInactive*` flag requires `workflows.canManageWorkflows`; ignored otherwise | | |
| `fetchTramosNavAction()` | | `WorkflowRef[]` active only | staff | | |
| `createWorkflowPhaseAction(workflowId, input)` | `WorkflowPhaseInputSchema` | `WorkflowPhase` (appended last) | `canManageWorkflows` | `FORBIDDEN`, `NOT_FOUND`, `NAME_TAKEN`, `EMPTY` | `/configuracion/tramos`, `/configuracion/puestos`, layout |
| `updateWorkflowPhaseAction(id, patch)` | partial of the same | `WorkflowPhase` | same | same | same |
| `reorderWorkflowPhasesAction(workflowId, orderedIds)` | `OrderedIdsSchema` (must be exactly the tramo's fase ids) | `void` | same | `FORBIDDEN`, `NOT_FOUND` | same |
| `setWorkflowAutoStartAction(workflowId, autoStart)` | `boolean` | `Workflow`. `true` stores `on_create` for the first active tramo, `on_ready` for the others; `false` stores `manual` | `canManageWorkflows` | `FORBIDDEN`, `NOT_FOUND` | `/configuracion/tramos`, layout, `/proyectos` |
| `createTemplateAction(workflowId, input)` | `WorkflowTaskTemplateInput` (`phaseId` required) | `WorkflowTaskTemplate` | `canManageWorkflows` | `FORBIDDEN`, `PHASE_MISMATCH` (fase of another tramo), `NAME_TAKEN` (same title in that fase) | `/configuracion/tramos`, layout |
| `updateTemplateAction(id, patch)` | partial | same | same | same | same |
| `deactivateTemplateAction`, `reorderTemplatesAction` | unchanged | unchanged | unchanged | unchanged | path → `/configuracion/tramos` |
| `createWorkflowAction`, `updateWorkflowAction`, `deleteWorkflowAction` | kept for tests and the CLI; no UI caller | | `canManageWorkflows` | | |

`readiness` comes from `READINESS` in `lib/project-flow/catalog.ts`: `{ diseno: { after: "presale", phaseKey: "cobro" }, construccion: { after: "diseno", phaseKey: "ejecutivo" } }`, resolved to `WorkflowRef` + `WorkflowPhaseRef` through `workflow_phases.key`, so renaming "Cobro" in the UI doesn't break it. A tramo with no rule or a missing gate fase gets `readiness: null`.

### 7.2 `lib/actions/positions-actions.ts` (new) and `staff-actions.ts`

| Action | Input | Output | Auth | Errors | revalidatePath |
|---|---|---|---|---|---|
| `fetchPositionsAction()` | | `Position[]` by `sortOrder` (live, active and inactive), with `phases`, `staffCount`, `googleManaged` | staff | | |
| `createPositionAction(input)` | `PositionInputSchema` | `Position` | `positions.canManagePositions` | `FORBIDDEN`, `NAME_TAKEN`, `EMPTY` | `/configuracion/puestos`, `/equipo` |
| `updatePositionAction(id, patch)` | partial | `Position` | same | + `NOT_FOUND` | same |
| `deletePositionAction(id)` | | `void` | same | `FORBIDDEN`, `NOT_FOUND`, `IN_USE` | same + `/configuracion/google` |
| `setPositionPhasesAction(id, phaseIds)` | `z.array(uuid)` (any tramo; unknown ids → `NOT_FOUND`) | `Position` | same | `FORBIDDEN`, `NOT_FOUND` | same |
| `reorderPositionsAction(orderedIds)` | `OrderedIdsSchema` | `void` | same | `FORBIDDEN` | same |
| `setStaffPositionsAction(staffId, positionIds)` (replaces `setStaffAreasAction`, `staff-actions.ts:125`) | `z.array(uuid)` | `GoogleManagedRefusal \| void` | `team.canEditCollaborator` | `FORBIDDEN`, `NOT_FOUND` | `/equipo`, `/configuracion/puestos` |
| `fetchAssignableStaffAction(workflowId?)` | unchanged | `Array<Staff & { suggested }>`: active staff, `suggested` = one of their puestos lists a fase of that tramo. Sorted suggested first, then by name | unchanged | | |

`setStaffPositionsAction` refuses (returns `GOOGLE_MANAGED_REFUSAL`, as `areAreasLocked` does today, `staff-actions.ts:29-38`) when the person is Google-managed and position mappings exist and the requested set differs from the `workspace` rows. Only `manual` rows are replaced otherwise.

`Staff` DTOs (`listStaff`, `getStaff`) add `positions` and `candidatePhases` (distinct fases of their live, active puestos, in tramo then catalog order). `staff.role` is the access role only: nothing reads it as a job title any more, and `MemberEditorDrawer` stops sending it as free text.

### 7.3 `lib/actions/projects-actions.ts`

| Action | Input | Output | Auth | Errors | revalidatePath |
|---|---|---|---|---|---|
| `fetchProjectsAction(filters?)` | `ProjectFilters` (`clientId` filter ignored for non-admins) | `ProjectListItem[]` | `canViewProjects` | | |
| `fetchProjectAction(id)` | | `ProjectDetail \| null` (`mondayImport` for admins only) | `canViewProjects` | | |
| `createProjectAction(input)` | `ProjectCreateInputSchema` | `ProjectDetail` | `canCreateProject` | `FORBIDDEN`, `EMPTY`, `NAME_TAKEN` | `/proyectos`, ficha, layout, `/dashboard`, `/tablero` |
| `updateProjectAction(id, patch)` | `Partial<ProjectInput>` | `ProjectDetail` | `canEditProjectGeneral`; `clientId`/`origin`/`originStaffId` keys additionally require admin | `FORBIDDEN`, `NAME_TAKEN`, `NOT_FOUND` | same |
| `setProjectCurrentTramoAction(id, workflowId)` | | `ProjectDetail` | `canChangeProjectStage` | `FORBIDDEN`, `NOT_FOUND`, `NOT_STARTED` | same |

"Asignar tramo" (admin, project with `needsTramo`): `setProjectCurrentTramoAction` on a tramo with no stage row is allowed only for an admin on a project without a current tramo. It calls `startTramo` with `stageOnly: true` (no fases, no tasks: opens the stage and sets it current), so the rule "only `startTramo` writes stages" holds. Anyone else, or a project that already has a current tramo, gets `NOT_STARTED`. The admin then adds fases with the start sheet (§9.1).
| `fetchProjectSpacesAction(projectId)` | | `ProjectSpace[]` by `sortOrder` with live `taskCount` | `canViewProjects` | | |
| `createProjectSpaceAction(projectId, name)` | `ProjectSpaceNameSchema` | `ProjectSpace` (last) | `canEditProjectGeneral` | `FORBIDDEN`, `NAME_TAKEN`, `EMPTY`, `NOT_FOUND` | ficha, layout |
| `renameProjectSpaceAction(id, name)` | same | `ProjectSpace` | same | same | same |
| `reorderProjectSpacesAction(projectId, orderedIds)` | `OrderedIdsSchema` | `void` | same | `FORBIDDEN`, `NOT_FOUND` | same |
| `deleteProjectSpaceAction(id)` | | `void` | same | `FORBIDDEN`, `NOT_FOUND` | same |
| `previewApplyWorkflowAction`, `applyWorkflowAction`, `setProjectStageAction`, `setProjectStagesAction` | **deleted** | | | | |

`updateProjectAction` side effects: the name/code change keeps `after(syncProjectFolderName)`; a `clientId` change from null to a value closes the "Asignar cliente y origen" task (§9.5) and schedules `after(() => syncProjectFolders(id))` so the missing "02 Cliente" folder is created. `NAME_TAKEN` comes from catching `23505` on `projects_name_lower_uq` (also on un-archiving a project whose name is now taken).

### 7.4 `lib/actions/tramo-start-actions.ts` (new)

| Action | Input | Output | Auth | Errors | revalidatePath |
|---|---|---|---|---|---|
| `fetchTramoBoardAction(workflowId)` | `uuid` | `TramoBoard` (§9.2) | `activities.canViewActivities` | `NOT_FOUND` | |
| `previewStartTramoAction(projectId, workflowId)` | | `StartTramoPreview` (§9.3) | `canViewActivities` | `FORBIDDEN`, `NOT_FOUND` | |
| `startTramoAction(input)` | `StartTramoInputSchema` | `StartTramoResult` | `activities.canCreateActivity`; `autoStart` present requires admin | `FORBIDDEN`, `NOT_FOUND`, `PHASE_MISMATCH`, `NO_PHASES`, `INVALID` | layout, `/proyectos`, ficha, `/dashboard`, `/tablero`, `/mis-tareas`, `/calendario` |
| `undoStartTramoAction(batchId)` | `uuid` | `void` | `canCreateActivity` | `FORBIDDEN`, `NOT_FOUND`, `TOUCHED` | same |

`startTramoAction` with `autoStart` set calls `setWorkflowAutoStart` in the same transaction as the start. `by_phase` managers must be live, active staff (`INVALID: managers` otherwise); candidates are never enforced.

### 7.5 `lib/actions/tasks-actions.ts`

| Action | Change | Errors added |
|---|---|---|
| `fetchTasksAction`, `fetchMyTasksAction`, `fetchBoardAction`, `fetchCalendarAction` | Pass `ViewerScope`. `TaskFilters` gains `phaseId`, `spaceId`, `kind`. Default `kind` excludes `admin`. `admin` is included only when asked **and** the viewer is admin. `fetchMyTasksAction` includes the viewer's own admin tasks when the viewer is admin. `project.clientName` is null for non-admins | |
| `fetchTaskAction(id)` | An admin task is `null` for non-admins | |
| `createUserTaskAction(input)` | `workflowId` required (usuario tasks always have a tramo now); `phaseId` must belong to it; `spaceId` must belong to `projectId`. A quick-add never writes `project_stages`: the tramo is started only by `startTramo` (sheet, auto-start, import, remap). The project block still shows (frontend §3.1 item 8 lists projects "with this tramo started or with tasks in it"), and the project stays in "Listos para iniciar" / "Próximos" until a start | `PHASE_MISMATCH`, `SPACE_MISMATCH`, `INVALID` |
| `updateTaskAction(id, patch)` | `phaseId` (within the task's own tramo), `spaceId`; `phase` key removed. `workflowId` is accepted **only** when the task currently has none and isn't an admin task (legacy tasks the backfill couldn't place); any other `workflowId` → `INVALID`. A `phaseId` sent with it is checked against the new tramo (`assertPhaseInWorkflow`). On an admin task, `phaseId`/`spaceId` → `ADMIN_TASK`; `managerId` must be an administrator | `PHASE_MISMATCH`, `SPACE_MISMATCH`, `ADMIN_TASK`, `ASSIGNEE_NOT_ADMIN`, `INVALID` |
| `assignTaskAction`, `setTaskSupportAction` | On an admin task, every assignee must be an administrator | `ASSIGNEE_NOT_ADMIN` |
| `createSubtaskAction(parentId, input)` | Inherits `workflowId`, `phaseId` and `kind` (an admin parent makes an admin child); `spaceId` allowed (must match the project; ignored for admin) | `SPACE_MISMATCH`, `ASSIGNEE_NOT_ADMIN` |
| `fetchAdminTasksAction(filters?)` (new) | `AdminTaskFiltersSchema` → open admin tasks (or all with `includeClosed`), by commitment date then project name | `FORBIDDEN` (non-admin) |
| `createAdminTaskAction(input)` (new) | `AdminTaskInputSchema` → `TaskDetail`, `kind = 'admin'` | `FORBIDDEN` (non-admin), `NOT_FOUND`, `ASSIGNEE_NOT_ADMIN` |
| `setTaskStatusAction`, `setTaskCustomStatusAction`, `updateTaskAction` (status) | Maintain `closed_at`; then `after(() => onTaskClosingChanged(projectId, workflowId))` (§9.6) | |
| every mutation on an admin task | Requires admin (non-admins can't see them; a crafted call gets `FORBIDDEN`) | |

Revalidation: the existing paths plus layout and `/dashboard` (frontend §6).

Who is an administrator, for a staff id: `staffAccessRole(staff.role, staff.email) === "Administrador"`. The private `resolveAccessRole` in `lib/auth/session.ts:55-66` moves to an exported pure function in `lib/auth/access-role.ts`, used by the session and by `assertAdminAssignees(tx, staffIds)` (§9.5).

### 7.6 `lib/actions/task-statuses-actions.ts`

`createTaskStatusAction` / `updateTaskStatusAction` accept `countsAsCompleted`. `countsAsCompleted: true` with `closes: false` → `INVALID`. Turning `closes` off also sets `counts_as_completed = false`. Toggling `closes` re-syncs tasks as today (`task-statuses-repository.ts:76-78`) and now also sets or clears their `closed_at`. `TaskStatusOption` gains `countsAsCompleted`.

### 7.7 `lib/actions/workspace-access-actions.ts`

`GroupMappingKind = "role" | "position"`; inputs and DTOs swap `areaId`/`areaName` for `positionId`/`positionName` (frontend §7.7). Validation mirrors today's `kind === "area"` branch (`workspace-access-actions.ts:75-79`) with `positionExists`. The result style (`GroupMappingResult`) is unchanged. Revalidates `/configuracion/google` and `/configuracion/puestos` (the `googleManaged` flag).

### 7.8 `lib/actions/monday-import-actions.ts`

| Action | Input | Output | Notes |
|---|---|---|---|
| `getMondayImportChoicesAction()` | | `{ choices }` with the new shape: statuses incl. `countsAsCompleted`, workflows with `phases`, templates with `phaseId`, `positions` with `phaseIds`, `statusMap` (saved setting); `areas` removed | `service.ts:553-604` |
| `saveMondayStatusMapAction(entries)` (new) | `MondayStatusMap` (whole map) | `{ statusMap }` | Validates with `StatusMapEntry`; unknown `customStatusId` → `{ ok: false, error: "STATUS_NOT_FOUND" }`. Stored in `app_settings` key `monday.status_map` (JSON). Revalidates `/configuracion/importar-monday` |
| `createMondayStaffAction(runId, mondayUserId, options?)` | `{ positionIds?: string[] }` | `{ staff }` | Inserts `staff_positions` (`manual`) in the same transaction |
| `suggestMondayPositionAction(runId, mondayUserId)` (new) | | `{ suggestion: MondayPositionSuggestion }` | §10.8 |
| `getMondayRemapAction(projectId)` (new) | | `{ remap: MondayRemapState }` | §11; `{ ok: false, error: "NOT_IMPORTED" }` when the project has no project import ref |
| `previewMondayRemapAction(projectId, input)` (new) | `MondayRemapInput` | `{ preview: MondayRemapPreview }` | Pure; no writes |
| `applyMondayRemapAction(projectId, input)` (new) | `MondayRemapInput` | `{ updated }` | One transaction. Revalidates ficha, layout, `/proyectos`, `/dashboard` |
| `saveMondayMappingDraftAction`, `previewMondayImportAction`, `startMondayApplyAction`, rollback actions | unchanged signatures | new mapping and preview shapes | |

All four new actions use the wizard admin guard.

---

## 8. Repository functions

### 8.1 `lib/repositories/workflow-phases-repository.ts` (new)

```ts
listPhases(workflowId: string, opts?: { includeInactive?: boolean }): Promise<WorkflowPhase[]>
listPhasesByWorkflow(workflowIds: string[], opts?): Promise<Map<string, WorkflowPhase[]>>
createPhase(workflowId: string, input: WorkflowPhaseInput, actorId: string): Promise<WorkflowPhase>   // NAME_TAKEN, NOT_FOUND
updatePhase(id: string, patch: Partial<WorkflowPhaseInput>, actorId: string): Promise<WorkflowPhase>
reorderPhases(workflowId: string, orderedIds: string[]): Promise<void>                                  // one tx, sort_order = index
assertPhaseInWorkflow(tx, phaseId: string, workflowId: string): Promise<void>                          // PHASE_MISMATCH
resolveGatePhase(db, workflowKey: string, phaseKey: string): Promise<WorkflowPhaseRef | null>
```

Changes are recorded in `history_events` under entity `workflow` (field `phase:<name>`), like template edits today.

### 8.2 `lib/repositories/workflows-repository.ts`

- `toTemplate` returns `phaseId`, `phaseName` (join `workflow_phases`).
- `listWorkflows(opts)` returns `WorkflowDetail` with `phases`, `readiness`, `autoStart`; the `areas` relation and `listAreasForWorkflow` (`workflows-repository.ts:256-262`) are removed.
- `createTemplate` / `updateTemplate` require `phaseId` and call `assertPhaseInWorkflow`.
- `setWorkflowAutoStart(id, enabled, actorId): Promise<Workflow>`.
- `listTramosNav(): Promise<WorkflowRef[]>`.

### 8.3 `lib/repositories/project-spaces-repository.ts` (new)

```ts
listSpaces(projectId): Promise<ProjectSpace[]>
createSpace(projectId, name): Promise<ProjectSpace>              // NAME_TAKEN via 23505 + nameKey pre-check
renameSpace(id, name): Promise<ProjectSpace>
reorderSpaces(projectId, orderedIds): Promise<void>
deleteSpace(id, actorId): Promise<void>                          // tx: record a spaceId change on each task, update tasks set space_id = null, delete row
assertSpaceInProject(tx, spaceId, projectId): Promise<void>      // SPACE_MISMATCH
findOrCreateSpace(tx, projectId, name): Promise<string>           // importer and remap (dedupe by nameKey)
```

### 8.4 `lib/repositories/positions-repository.ts` (new)

```ts
listPositions(): Promise<Position[]>
createPosition(input), updatePosition(id, patch), softDeletePosition(id)   // IN_USE when a mapping references it
setPositionPhases(id, phaseIds): Promise<Position>                        // replace set in one tx
reorderPositions(orderedIds): Promise<void>
setStaffPositions(staffId, positionIds): Promise<void>                    // replaces source='manual' rows only
listCandidates(db, phaseIds: string[]): Promise<Map<string, StaffCandidate[]>>  // per fase; sorted by openTasks asc, then name
positionExists(id): Promise<boolean>
```

`StaffCandidate.openTasks` = live, unarchived, not-completed tasks where the person is manager (one grouped count query, as the dashboard load does).

### 8.5 `lib/repositories/projects-repository.ts`

| Function | Change |
|---|---|
| `toProject(row, viewer)` | No `phase`/`phases`; `clientId`, `origin`, `originStaffId` null unless `viewer.isAdmin` |
| `listProjects(filters, viewer)` | `leftJoin(contacts)` (was `innerJoin`, line 149); `tramos` from `project_stages` + `workflows` (with `startedAt`, `closedAt`, `current`); `activePhase` = first catalog fase of the current tramo with an open task (one lateral subquery); `needsTramo = current_workflow_id is null`; `area` and `primaryAreaFrom` (line 110) removed |
| `getProject(id, viewer)` | + `originStaff`, `mondayImport` (admin only: boards from `import_refs` entity `project` → `data.source.boardId`/`boardName`) |
| `createProject(input, actor)` | Rewritten as §9.4 |
| `updateProject(id, patch, actor, viewer)` | Drops `phase`/`phases`/`currentWorkflowId` handling (lines 290-299); admin-only keys; `NAME_TAKEN`; calls `closeAssignClientTask` |
| `setProjectCurrentTramo(id, workflowId, actor)` | Replaces `setProjectStage`/`setProjectStages` (lines 324-389): requires a `project_stages` row (`NOT_STARTED`), records the history change |
| `previewApplyWorkflow`, `applyWorkflow` (lines 528-644) | **Deleted**; `startTramo` replaces them |

### 8.6 `lib/repositories/tasks-repository.ts`

| Function | Change |
|---|---|
| `toTask` | `phaseId`, `spaceId`, `closedAt` instead of `phase` |
| `TASK_TRACKED_FIELDS` | `phase` → `phaseId`; + `spaceId`, `kind` (remap) |
| `whereFilters(f, viewer)` | + `phaseId`, `spaceId`, `kind` (default `ne(kind, 'admin')`; `admin` only when `viewer.isAdmin`); search also matches fase name and espacio name |
| `listTasks(filters, viewer)` | `leftJoin(contacts)` (line 325); `leftJoin(workflowPhases)`, `leftJoin(projectSpaces)`; `customStatus.countsAsCompleted`; `workflow.sortOrder`; `areaColorSlot` (line 310) removed; `clientName` nulled for non-admins. Order: `workflow.sort_order`, `phase.sort_order nulls last`, `sort_order nulls last`, `commitment_date`, `title` |
| `insertUserTask` | `phaseId`, `spaceId` with the two asserts; `phase` removed (line 422) |
| `createAdminTask(input, actor)` | New; `kind: 'admin'`, asserts admin assignees |
| `updateTask` | Lines 512 and 524 replaced by the `phaseId`/`spaceId` rules; `closedAt` via `closedAtPatch(before, next)` |
| `setTaskCustomStatus` | Same `closedAt` handling |
| `mergeTasks` | Refuses to merge an admin task with a non-admin one (`INVALID`) |
| `listAdminTasks(filters)` | New |

`closedAtPatch(before, nextStatus)`: becoming `completado` sets `closed_at = now()` (if it wasn't already closed); leaving `completado` sets null.

### 8.7 `lib/repositories/staff-repository.ts`

`listAssignableStaff(workflowId)` (lines 127-143) uses `staff_positions → position_phases → workflow_phases.workflow_id`. `listStaffAreaIds`, `setStaffAreas`, `primaryAreaName` (lines 65, 309, 361) are replaced by position equivalents. `googleManagedStaffIds` unchanged.

### 8.8 Other readers

- `lib/dashboard/donut-groups.ts:42-75`: `projectsByArea` → `projectsByTramo(projects: { currentWorkflow: WorkflowRef | null }[])`, label "Sin tramo", color through `tramoColorVar` (frontend §4.5).
- `lib/dashboard/task-trend.ts` and `lib/repositories/tasks-repository.ts:868-933` (`listTaskTrendSource`): completions count only events into a status that **counts as completed** (Cancelado is closed but not done).
- `lib/actions/dashboard-actions.ts`: drops área data; admin tasks excluded from every widget.
- `lib/calendar/calendar-service.ts`, `lib/calendar/ics.ts`, `lib/google/calendar-sync.ts`: `tramo`/`tramoLabel`, `phaseId`/`phaseLabel`; admin tasks only in an admin's own feed.
- `lib/repositories/portal-contacts-repository.ts:23-54` and `portal-access-repository.ts:47-80`: `clientId` is `string | null`; with no client, `findProject` returns the project and the portal actions return `{ ok: false, error: "no_client" }` (invite) or an empty list. `invitePortalClientAction` refuses while the project has no client.
- `lib/google/project-folders.ts`: `ensureProjectFolders(…, { withClientFolder })`, false while `client_id` is null; `syncProjectFolders` re-runs it when the client is set, which creates only the missing subfolders (idempotent today). `ProjectFolders.clientFolderId` and `inboundFolderId` become `string | null`, and the "stored tree is complete" check (`project-folders.ts:120-130`) requires them only when `withClientFolder`; otherwise a client-less project would rebuild its tree on every sync. "03 Del cliente" (inbound) is gated with "02 Cliente": both are created when the client is set.
- `lib/repositories/contacts-repository.ts:400`: merging clients is unaffected (moves non-null client ids).
- Remaining callers of `projects.clientId`, `tasks.phase`, `projects.phases` and `area*` are found with `rg "clientId|\.phase\b|phases|areaMembers|areaWorkflows|DEPARTMENTOS"` and updated in release A. TypeScript fails the build on any reader left behind once the release B schema drops the declarations.

---

## 9. Domain rules and transactions

### 9.1 Readiness (`lib/project-flow/readiness.ts`)

For tramo T with rule `{ after: P, phaseKey: g }` and project X (live, `status in ('activo','pausado')`, no `project_stages` row for T):

| Situation | Bucket | Fields |
|---|---|---|
| X has no stage row for P | upcoming | `pending = { tramo: P, phase: g, open: 0, total: 0 }` |
| Stage P exists, and X has ≥ 1 live unarchived task in fase g; all of them have `status = 'completado'`, and at least one counts as completed | ready | `readySince = max(closed_at)` of those tasks |
| Stage P exists and X has no task in fase g (the fase wasn't contracted; RD-2) | ready | `readySince = project_stages(P).started_at` |
| Otherwise | upcoming | `pending = { tramo: P, phase: g, open, total }` |

The first tramo (no rule) lists every project without its stage row as ready, `readySince = projects.created_at` (covers projects created while Presale auto-start was off). Upcoming projects are only listed when stage P exists or P is the first tramo, so a fresh project doesn't show up in Construcción's Próximos. One query per board with grouped counts; no N+1.

`startTramoAction` does **not** require readiness. The sheet can be opened for any tramo of a project: from "Listos para iniciar", from the ficha deep link `?project={id}` (ready or not), and from the project block row action "Agregar fases" (users with `canCreateActivity`; admins included). `startTramo` works when the stage already exists: it adds the checked fases' missing tasks and skips the rest (idempotent, §9.6), so fases left out at the first start can be created later. Fases whose templates all exist show as "Ya creadas" in the preview.

### 9.2 `TramoBoard`

`{ workflow, ready, upcoming, started }`. `started` lists every project with a stage row for T: `batchId` = the latest batch of (project, T) with `undone_at is null`; `createdCount` from it; `canUndo = batchId != null && !isBatchTouched(batch)`. Sorted by project name.

### 9.3 Preview (`previewStartTramo(db, projectId, workflowId)`)

For each active fase of T in catalog order: `templates` = active templates of the fase with no live task on the project (`tasks.template_id`, the same rule as `tasks_project_template_uq`), `existing` = active templates that have one, `candidates = listCandidates`. `alreadyStarted` = stage row exists. `autoStart = workflow.autoStart !== 'manual'`.

### 9.4 Project create (`createProject`, one transaction)

1. Validate the name (trim, 1-120), insert `projects` (`status 'activo'`, `client_id null`). A `23505` on `projects_name_lower_uq` → `NAME_TAKEN`.
2. `ensureAssignClientTask(tx, projectId, actor)`: insert `kind 'admin'`, `system_key 'assign_client'`, title "Asignar cliente y origen", `priority 'alta'`, `commitment_date = today` (America/Mexico_City, same zone as `TASK_TREND_TIME_ZONE`), no manager. `on conflict do nothing` on `tasks_project_system_key_uq`.
3. If the first active tramo has `auto_start = 'on_create'`: `startTramo(tx, { projectId, workflowId: first.id, phaseIds: all active fases, assignment: { mode: "none" }, actor, trigger: "on_create" })`.
4. Record the history `cambio` (`created`) as today.
5. After commit: `after(() => syncProjectFolders(id))` (internal folders only, no client folder yet).

Auto-started tasks are unassigned ("Sin asignar"): the creator may be an admin who won't do the work, and the Presale lead picks them up.

### 9.5 Admin task rules (`lib/project-flow/admin-tasks.ts`)

- `assertAdminAssignees(tx, staffIds)`: every id must be a live, active staff member whose `staffAccessRole(role, email)` is "Administrador", else `ASSIGNEE_NOT_ADMIN`. Applied to `managerId` and `supportIds` on create, update, assign, support and subtask of admin tasks.
- `closeAssignClientTask(tx, projectId, actor)`: called by `updateProject` when `client_id` goes from null to a value. It sets `status 'completado'`, `custom_status_id null`, `closed_at now()` on the live, open `assign_client` task, and records the history change with comment-free `cambio` rows. Origin isn't required. If the client is later cleared, the task isn't reopened or recreated (admins can create an admin task by hand).

### 9.6 `startTramo` (`lib/project-flow/start-tramo.ts`): idempotency

Signature: `startTramo(tx, { projectId, workflowId, phaseIds, assignment, actorId, trigger, autoStart?, stageOnly? }): Promise<StartTramoResult>`.

Inside one transaction (manual starts open it in the action; the create/auto paths pass theirs):

1. `select … from projects where id = $1 and deleted_at is null for update`. This serializes concurrent starts and undos on the same project. Not found → `NOT_FOUND`. Workflow inactive or missing → `NOT_FOUND`.
2. `phaseIds` empty → `NO_PHASES`, unless `stageOnly` (internal, used only by admin "Asignar tramo", §7.3): then steps 3 and 6 are skipped and only the stage and current tramo are written. Any id not an active fase of T → `PHASE_MISMATCH`.
3. Templates to create = active templates of those fases without a live task on the project (re-read under the lock).
4. Stage: `insert into project_stages (project_id, workflow_id, started_at, started_by_id) … on conflict do nothing returning` → `stageCreated`. If the stage existed with `closed_at` set and tasks are about to be created, clear `closed_at`.
5. Current tramo: if `current_workflow_id` is null or its `sort_order` is lower than T's, set it to T (`currentChanged = true`, remember `previousCurrentWorkflowId`). Starting an earlier tramo never moves `current` back.
6. If there are templates: insert the batch row, then the tasks (`kind 'workflow'`, `template_id`, `workflow_id`, `phase_id = template.phase_id`, `start_batch_id`, title, notes, priority, `manager_id` per mode: `self` → actor, `by_phase` → `managers[phaseId] ?? null`, `none` → null), dates = template offsets from `coalesce(projects.start_date, today)`. Use `on conflict do nothing` on `tasks_project_template_uq` as a second guard; `createdCount` = returned rows, `skippedCount` = requested templates − created. If 0 rows came back, delete the batch row and return `batchId: null`.
7. `autoStart` (admin, manual trigger only): `setWorkflowAutoStart` in the same tx.
8. One project history `cambio` (`field 'tramo_started'`, after = "{key}: {n}").
9. After commit: revalidation (action) and nothing else (no Drive work).

A repeated submit returns `createdCount 0`, `skippedCount n`, `stageCreated false`, `batchId null`: it never duplicates. Two concurrent submits serialize on the row lock; the second sees the first's tasks in step 3.

### 9.7 Undo window (`undoStartTramo(tx, batchId, actorId)`)

`isBatchTouched(db, batchId)` is true when any task of the batch:
- has `updated_at <> created_at` (every Drizzle update bumps `updated_at` through `$onUpdate`, `_schema.ts:357-361`), or `deleted_at` set, or
- has any `history_events` row (`entity 'task'`; creation writes none per task), `task_checklist_items`, `task_support`, `task_attachments`, `task_links`, a child task, or a `task_dependencies` row on either side.

Undo, in one transaction:
1. Lock the project row `for update` first (same order as `startTramo`, so the two can't deadlock), then the batch `for update`. Missing, or `undone_at` set → `NOT_FOUND`. Batch not the latest live batch of (project, T) → `TOUCHED` (a later start depends on it).
2. `isBatchTouched` → `TOUCHED`.
3. Soft-delete the batch's tasks (`deleted_at = now()`); history stays, and the template slots free up (partial unique on live rows).
4. If `stageCreated` and the project has no other live task in T: delete the `project_stages` row.
5. If `currentChanged` and `current_workflow_id` is still T: restore `previousCurrentWorkflowId`.
6. Set `undone_at`, `undone_by_id`; record project history `field 'tramo_start_undone'`.
7. If the stage row remains, run `refreshStageClosed` for the pair (step 4 of `startTramo` may have cleared `closed_at`).

Accepted consequences of the `updated_at` signal: a drag-and-drop **status** change (Tablero) and a drag reorder inside a project block (`reorderProjectTasks` rewrites `sort_order` for every id in the block, `tasks-repository.ts:811-819`, bumping `updated_at` on every batch task in it) both count as touched and end the undo window. `startTramo` must insert its tasks directly, never through `insertUserTask`, which writes per-task history (`tasks-repository.ts:437-444`).

The window has no clock: the 10 s toast and "Deshacer inicio" both call the same action, and it works until a task is touched (brief default). Auto-start batches (`on_create`, `on_ready`) follow the same rule, so the project block on Presale offers "Deshacer inicio" for an untouched auto-start too.

### 9.8 Closing and auto-start on ready (`lib/project-flow/closing.ts`, `auto-start.ts`)

`onTaskClosingChanged(db, projectId, workflowId)` runs in `after()` from the task status actions (and from the remap/import apply for the touched pairs):
1. `refreshStageClosed`: set `project_stages.closed_at` = now when every live, unarchived task of (project, workflow) is closed, else null.
2. `autoStartOnReady`: for each tramo N whose rule's `after` is this workflow and whose `auto_start = 'on_ready'`: if the project is now ready for N (§9.1) and has no stage for N, run `startTramo(…, { phaseIds: all active fases of N, assignment: { mode: "none" }, trigger: "on_ready", actorId: <the actor of the triggering change> })` in its own transaction. Idempotent through the same lock and checks, so a double trigger is harmless.

Failures in `after()` are logged as one JSON line (`{ level, msg, trace_id, projectId, workflowId, err }`) carrying a `trace_id` (the request id, or a new uuid inside `after()`); the next status change retries. Today's `after()` callers log with plain `console.error`; these new ones use the JSON shape.

### 9.9 Name uniqueness

- Projects: DB unique `lower(name)` among live active/paused projects; error `NAME_TAKEN`. Leading/trailing spaces are trimmed before insert/update.
- Fases (per tramo), puestos (firm), espacios (per project): DB unique on `lower(name)` plus the repository `nameKey` pre-check; `NAME_TAKEN`.

---

## 10. monday importer changes

All changes keep the CLI and the wizard on the same code (`translate` decides; `plan` validates; `apply` writes). Mapping files are versioned: `Mapping.version` becomes `z.literal(2)`. `upgradeMappingV1(raw, lookups, exportData)` in `scripts/monday/mapping.schema.ts` converts stored v1 drafts and the `import_batches.mapping` of past batches (used by the remap): `stage` → `tramo`; `workflow_phase` → `phase` by fase name in the board's tramo (else the board's tramo); `phase` (new project phase) → `phase` by name in any tramo when unique, else the board's tramo; `areaId`, `taskAreaSource`, `taskAreas` dropped; per-board `statusMaps` (keyed column id → label **id**) merged into the firm-wide map (keyed `statusLabelKey(label text)`) **only** for labels the saved map doesn't have yet. The label id → text comes from the stored export's column settings (`statusLabels(column)`, `translate.ts:425-456`), which is why the upgrader takes the export; a label id the export doesn't define is skipped and reported. Translate reads `bm.statusMaps` at `translate.ts:651` and `1282`; both readers go.

### 10.1 `scripts/monday/mapping.schema.ts`

- `GroupTarget` = frontend §7.8 (six kinds; `phase` now carries `phaseId`).
- `ColumnTarget` + `"closed_date"`.
- `BoardMapping`: remove `areaId`, `taskAreaSource`, `taskAreas`, `statusMaps` (line 128); keep `workflowId` (now "Tramo del tablero") and `client` (optional); `groupClients` kept for `project` groups.
- `StatusMapEntry`, `MondayStatusMap`; `Mapping.statusMap` is the server-written snapshot (frontend §7.8). `TaskAreaSource`, `TaskAreaTarget` deleted.

### 10.2 `scripts/monday/group-targets.ts` and `lib/monday-import/group-targets.ts`

- `groupTargetKinds`: `board_as_project` → `tramo, phase, space, project, admin, ignore`; `item_as_project` → the same without `project`.
- `resolveGroupTarget(board, group, catalog)` default, matching with `nameKey` (lines 55-58): title = tramo name → `tramo`; = fase of the board's tramo → `phase`; = fase of exactly one other tramo → `phase`; `nameKey === "administrativo"` → `admin`; else `{ kind: "tramo", workflowId: board.workflowId }` when the board has a tramo, else `tramo` unresolved (→ `TRAMO_MISSING`).
- `groupPhase` is replaced by `groupPlacement(target, group) → { workflowId?, phaseId?, space?: string, admin?: true, project?: true }`.
- `encodeGroupTarget`/`decodeGroupTarget`: `tramo:<id>`, `phase:<id>`, `space`, `project`, `admin`, `ignore`.
- `groupTargetChoices`: labels per frontend §4.6 item 1; `pruneGroupTargets` drops `phase` targets whose fase is inactive.
- `workflowPhaseNames` is deleted (fases come from the catalog in `MondayImportChoices.workflows[].phases`).

### 10.3 `scripts/monday/translate.ts`

| Topic | Rule |
|---|---|
| Lookups | `CincelLookups` gains `phases` (id → `{ workflowId, name, key, sortOrder }`), `templates` with `phaseId`, `statusMap`, `statuses` by `nameKey`. Áreas removed |
| Task tramo | From the group placement, else the board's `workflowId`. Admin groups: no tramo |
| Task fase (brief §4.3) | 1) A `templateMatches[itemId]` (or the auto-match `pickTemplates`, `init.ts:655`) of that tramo → its `phase_id`, `kind 'workflow'`, `template_id`. 2) A group placement with `phaseId` → that fase. 3) The cleaned title's `nameKey` contains a fase name of the tramo as a whole word (longest match wins) → that fase. 4) Else `phase_id null`, sample `phaseReview: true`, warning `PHASE_UNRESOLVED`. A group never creates a fase |
| Espacio | `space` group → `space: group.title` (apply calls `findOrCreateSpace`); ref `project_space` externalId `<boardId>:<groupId>` |
| Admin | `admin` group → `kind 'admin'`, no tramo/fase/space/template; assignees that aren't administrators are dropped (kept in the import data) with warning `ADMIN_ASSIGNEE_CLEARED` |
| Client (brief §4.4) | Optional. No client → `client: null`; the project gets the admin task "Asignar cliente y origen" (ref `task` externalId `<projectExternalId>:assign_client`); warning `CLIENT_MISSING` (one per project). `CLIENT_UNRESOLVED` stays blocking for a chosen client that doesn't resolve |
| Status (brief §4.5) | The label text (from `statusLabels`, `translate.ts:425-456`) → `statusLabelKey = label.trim().toLowerCase().replace(/\s+/g, " ")` → `statusMap[key]` → else the built-in defaults table (frontend §4.6 item 5, matched by key; "Cancelado"/"En espera" resolve to the seeded custom statuses by name) → else `pendiente` + `STATUS_DEFAULTED`. `entry.priority` overrides the priority column. `bm.statusMaps` lookups (line 1282) and `STATUS_UNMAPPED` for missing label targets are removed; a saved entry pointing at a deleted custom status is `STATUS_UNMAPPED` (blocking) |
| Dates (brief §4.6) | `commitmentDate = commitment_date column ?? timeline.to`; `deliveryDate = delivery_date column ?? timeline.to`; `start = timeline.from` (+ cronograma, unchanged); `closed_date` column → `closedAt` (end of that day in America/Mexico_City), only kept when the mapped status closes the task; a closed task without the column gets `closedAt = updated_at` of the item when exported, else null |
| Title (brief §4.7) | `stripMondayNumbering(item.name)` (`lib/project-flow/names.ts`): removes `^\s*\d{1,3}\s*[.,:)\-–—]\s*` when the rest is non-empty and doesn't start with a digit ("1. Planos" → "Planos", "01 - Fachadas" → "Fachadas", "24, Renders" → "Renders", "8.Producción" → "Producción"; "1.5 m de muro" and "3 recámaras" stay). The original goes to `import_refs.data.source.originalTitle` |
| Project | `PlannedProject.phases` and `extraStages` removed; `tramos` = distinct tramos of its tasks; `currentWorkflowId` = highest `sort_order` tramo with tasks, else the board's tramo |
| Áreas | `taskAreaFor`, `PlannedTaskArea`, `PlannedArea`, `AREA_UNMAPPED` deleted |

### 10.4 `scripts/monday/plan.ts`

- Issue codes: + `PHASE_UNRESOLVED` (warning), `CLIENT_MISSING` (warning), `ADMIN_ASSIGNEE_CLEARED` (warning), `TRAMO_MISSING` (blocking: a board with groups or items that resolve no tramo), `PROJECT_NAME_TAKEN` (blocking: a new project whose name collides with a live active/paused project or another planned one); − `AREA_NAME_TAKEN`, `AREA_UNMAPPED`, the área checks at lines 724-755 and `taskAreaIssues`.
- **Already imported items produce no warnings (brief §4.9).** Compute `importedSets` before adding translate issues (today they're pushed at line 763, before the sets at line 766). Drop an issue when its `itemId` is a task, checklist parent or project that `isNew` reports as existing, and drop project-level issues (`CLIENT_MISSING`, `DATES_MISSING`) of already imported projects. Blocking issues about existing rows (e.g. `CLIENT_UNRESOLVED` on an existing project) are dropped too, since apply won't touch them.
- `PlanIssue` gains `group: PlanIssueCode` for the UI's grouping (it already has `code`); `formatPlanMarkdown` prints warnings grouped by code with counts.

### 10.5 `scripts/monday/apply.ts`

- Projects: `client_id` nullable; no `phase`/`phases` (lines 402-409); `origin = 'monday'`; `project_stages` rows for every tramo with tasks (`started_at` = earliest task `created_at`, `started_by_id` = importer), refs as today (`stageWorkflowId(s)`), `current_workflow_id` per §10.3; projects without a client get the `assign_client` admin task.
- Tasks: `phase_id`, `space_id` (via `findOrCreateSpace` inside the transaction, ref `project_space`), `kind`, `closed_at`, cleaned `title`. `phase` (line 444) removed.
- Áreas: `newAreas` creation (lines 376-382) removed.
- `refreshStageClosed` for every (project, tramo) written, in the same transaction.
- `import_batches.mapping` stores the v2 mapping with the `statusMap` snapshot.

### 10.6 `scripts/monday/init.ts`

- `draftMapping` writes v2: `groupTargets` from `resolveGroupTarget` defaults; `workflowId` = the tramo whose name the board name contains, else null; no `statusMaps` (`statusMaps()` at line 598 is deleted; `statusTarget` becomes the defaults table used by translate); `columnTargets` (line 388) maps columns titled like "Fecha que finalizó"/"Fecha de finalización"/"Finalizado" (by `nameKey`) to `closed_date`.
- `InitLookups` (line 223) reads fases, templates with `phaseId`, and the saved status map; no áreas.

### 10.7 `lib/monday-import/*`

| File | Change |
|---|---|
| `service.ts` `getImportChoices` (553-604) | New `MondayImportChoices` shape; reads `monday.status_map` |
| `service.ts` `previewImport`/`startApply` | Read the saved status map and snapshot it into the run's mapping right before apply |
| `service.ts` (new) `saveStatusMap(db, map)`, `suggestPosition(runId, userId, deps)` | §7.8, §10.8 |
| `wizard-steps.ts` | `ColumnTarget` labels ("Línea de tiempo → compromiso y entrega", "Fecha que finalizó"); no área/workflow steps |
| `board-cards.ts` `boardProblems` | − área and client problems; + "Elige un tramo." (blocking) and "{n} tareas sin fase." (warning) |
| `preview.ts`, `preview-issues.ts` | Sample `cincel` fields per frontend §7.8; issue grouping by code; the new codes |
| `people.ts` | Exposes per-person task placements for the suggestion |
| `task-areas.ts` (+test) | Deleted |
| `wizard-clients.ts` logic | Client no longer a blocker |

### 10.8 Puesto suggestion (brief §4.8)

`suggestPosition(runId, mondayUserId)`: translate the run (the same cached translation the preview uses), take the tasks where that monday user is manager or support, and count them per resolved fase. For each live, active puesto, score = tasks in its candidate fases. The suggestion is the highest score (ties: lower `sort_order`), or `position: null` when no task has a fase or no puesto scores. `tasks` = the person's task count; `topPhases` = up to three fases by count with tramo name.

### 10.9 Rollback

`scripts/monday/rollback.ts` handles the new entities. In `DELETE_STEPS` (`rollback.ts:649-686`), `project_space` goes **after** `deleteRefs("task")` and **before** `deleteRefs("project")`, because `tasks_space_fk` is `restrict` (a space is deleted when no live task outside the batch uses it). `tramo_start_batches` rows of imported projects (from a later start) go with the project: they cascade on project delete, and the tasks they created block rollback through the change check like any staff-made task. Also: the `project_stages` step (`rollback.ts:671-673`) stays where it is; the `assign_client` admin tasks (entity `task`, as any task), and `staff_positions` of created staff (cascade on staff delete). The change check (`row_updated_at`) still protects remapped rows, since the remap refreshes `row_updated_at` (§11.3).

---

## 11. Re-sorting imported projects ("Reacomodar importación")

### 11.1 Core (`scripts/monday/remap.ts`, takes `db`, no server-only)

```ts
loadRemapState(db, projectId): Promise<MondayRemapState>          // NOT_IMPORTED
planRemap(db, projectId, input: MondayRemapInput): Promise<{ preview: MondayRemapPreview; changes: TaskChange[] }>
applyRemap(db, projectId, input, actorId): Promise<{ updated: number }>
```

- **Pre-flight.** Before anything else, check that `import_batches.export_path` (`lib/db/schema/import.ts:38`) exists and holds the board files the project came from. If the folder is gone: `{ ok: false, error: "EXPORT_MISSING" }` from the actions (the UI shows frontend §9's copy: "Ya no están los archivos de la exportación de monday de este proyecto. Vuelve a exportar el tablero para reacomodarlo."), and the CLI exits non-zero with the same text. A missing single board is the `source: null` case below.
- **Sources.** The project's `import_refs` row (entity `project`, `row_id = projectId`) gives the batch and `data.source` (board, group or item). The batch's `export_path` gives the stored export (`readPlanExport`). The batch mapping is upgraded with `upgradeMappingV1`. A board whose files are missing → `source: null` (frontend copy "Este tablero ya no está…"), excluded from the input.
- **Current targets.** `groupTargets` come from the project ref's `data.groupTargets` when a previous remap saved them, else from `resolveGroupTarget` defaults over the upgraded mapping.
- **Plan.** Run `translate` for the project's boards with the input targets (other mapping parts unchanged), then match planned tasks to existing rows through `import_refs` (entity `task`, by monday item id). For each live task compute the new placement `{ projectId, kind, workflowId, phaseId, spaceId, templateId }`:
  - `ignore` group → unchanged (a remap never deletes tasks or history).
  - `project` group → the project imported for `<boardId>:<groupId>` if it exists, else a new project named after the group (name-only create rules, §9.4, without auto-start; `PROJECT_NAME_TAKEN` blocking if the name is taken).
  - A template link is kept only when the template belongs to the new tramo and the (project, template) slot is free; otherwise the task becomes `usuario` with the template cleared.
  - `admin` → `kind 'admin'`, everything else null; non-admin assignees removed with `ADMIN_ASSIGNEE_CLEARED`.
  - Statuses, dates and titles are not touched. People are not touched either, with one exception: a task moved to `admin` loses its non-admin manager and support rows (`ADMIN_ASSIGNEE_CLEARED`); the matching `task_support` import refs are deleted so a later rollback doesn't flag them.
  - Tasks moved to another project ("Proyecto aparte") take their `import_files` rows along (`project_id` updated), so Drive phase B and rollback find them.
- **Preview.** Counts per frontend `MondayRemapPreview` (`tramo`, `phase`, `space`, `admin`, `otherProject`, `unchanged`, `phaseUnresolved`), up to 10 samples ("Tramo · Fase · Espacio" before/after), grouped issues.
- **Apply** (one transaction, project row `for update`): create espacios/projects, update tasks, `recordChanges` per task (fields `projectId`, `kind`, `workflowId`, `phaseId`, `spaceId`, `templateId`), refresh `import_refs.row_updated_at` and append `{ at, by, before }` to `data.remaps` for each changed task, save `data.groupTargets` on the project ref, rebuild `project_stages` (add missing tramos with tasks, delete stage rows that the import created and that now have no tasks, recompute `closed_at`), set `current_workflow_id` to the highest tramo with tasks, and add one project comment "Reacomodar importación: {n} tareas.". Re-applying the same input changes nothing.

### 11.2 One-time run with the data migration

Pre-flight first: the command without `--apply` must report every board of the three projects with `source != null`. If any export is gone from the volume, re-export those boards before release A ships; otherwise acceptance §17.7 can't be met.

`npm run monday -- remap --projects "Madrid 22,Guadalajara 83,Local Espiropapa"` prints each preview; `--apply --by <admin email>` writes. It uses the default targets (Madrid 22: Presale/Diseño groups → Tramo, Proyecto Ejecutivo → Fase Diseño·Ejecutivo, Administrativo → Tareas de administración, Obra → Tramo Construcción via `--target "Obra=tramo:construccion"`; flags `--target "<group title>=<encoded target>"` override per group). Expected for Madrid 22: tramos Presale → Diseño → Construcción (current) and 210 tasks before and after (the preview's total must equal the live count). The output goes on the release issue.

### 11.3 Admin action

The wizard-admin actions of §7.8 wrap `loadRemapState` / `planRemap` / `applyRemap` with the app `db`. They are synchronous: a project has a few hundred tasks, well within one request.

---

## 12. Auth and security

- **Session and capabilities:** unchanged mechanism (`requireCapabilityUser`, `proxy.ts`, Configuración server redirects).
- **`canSeeAdminData(user)`** (`lib/auth/permissions.ts`): `user?.access === SYSTEM_ADMIN_ROLE` ("Administrador" only; Dirección doesn't count).
- **Server-side filtering:** every DTO builder takes `ViewerScope`; non-admins get `client: null`, `clientId: null`, `origin: null`, `originStaffId: null`, `originStaff: null`, `mondayImport: null`, `project.clientName: null`; admin tasks are absent from every read for non-admins (lists, board, calendar, ICS feed, Google Calendar sync, dashboard, task detail, subtasks, dependencies pickers).
  Also filtered for non-admins:
  - `fetchContactAction` (`contacts-repository.ts:137-146`): `projects` is `[]` and `stats` keeps counts only (no project names), unless the viewer is admin.
  - Project history (`fetchProjectHistoryAction`): events with field `clientId`, `origin`, `originStaffId` are removed.
  - Task-scoped reads of an admin task by id (history, checklist, links, attachments, attachment data, dependencies, subtasks, comments) return `null`/`[]`, and every write on it returns `FORBIDDEN`. One guard, `assertTaskVisible(taskId, viewer)` in `tasks-repository.ts`, is called by each task-scoped action.
  - `getImportDataAction` (`lib/actions/import-actions.ts`): `null` for an admin task; for a project, the values of monday columns mapped to `client`, `contact_email` and `contact_phone` are removed from `data`.
  - Accepted exception: `/proyectos/[id]/clientes` (`portal.manageAccess`) shows the client's portal contacts; the client is implied there by design (brief §1 non-goals: no portal changes beyond gating on a client).
- **Admin task assignees:** administrators only (`ASSIGNEE_NOT_ADMIN`).
- **Capabilities:** `areas.canManageAreas` → `positions.canManagePositions` (module id `positions`, label "Puestos"; defaults: Administrador and Dirección, as `canManageCompanyStructureByRole`, `permissions.ts:748-750`). The rest per frontend §8.
- **Google group mappings** (`lib/auth/workspace-access.ts`): `GroupMappings = { roles, positions: PositionGroupMapping[] }`; `loadGroupMappings` (lines 81-108) reads `kind = 'position'` on live positions; `evaluateAccess` (lines 122-158) returns `positionIds` and `positionsManaged` instead of `areaIds`/`areasManaged`; `applyAccess` (lines 175-195) replaces the person's `staff_positions` rows (both sources) with one `workspace` row per matched puesto when `positionsManaged`, else leaves them. `WorkspaceAccessResult` types and `lib/auth/workspace-access.test.ts` change accordingly. Role logic is untouched.
- **Input validation:** zod on every new action (§6); uuids validated before queries (as `retryProjectFolderAction` does).
- **Rate limiting / CORS / JWT:** not applicable (same-origin Server Actions, existing session cookies).

---

## 13. Background work

No new technology. Two existing patterns are reused:

| Work | Trigger | Mechanism |
|---|---|---|
| Drive folders on create; client folder when a client is set | `createProjectAction`, `updateProjectAction` | `after()` (as `projects-actions.ts:49`) |
| Stage closing + auto-start on ready | Task status changes, import apply, remap apply | `after()` → `onTaskClosingChanged` (§9.8) |
| monday export / apply / rollback | Wizard | Existing in-process jobs persisted in `wizard.json` (`lib/monday-import/runs.ts`) |
| Remap | Admin action / CLI | Synchronous (one transaction) |
| Data migration report, one-time remap | Ops | CLI scripts run by hand |

---

## 14. Environment, Docker, observability

- **Environment variables:** none new. `DATABASE_URL`, `CINCEL_ADMIN_EMAILS`, the Google and monday variables, and `MONDAY_IMPORT_DIR` are unchanged.
- **Docker / Compose:** no change. `scripts/migrate.mjs` gains the `ensureDefaultCatalog` call; the runtime image copies each script by name (`Dockerfile:34-36`), so `scripts/default-catalog.mjs` needs its own `COPY` line next to `default-workflows.mjs`.
- **Images:** built by CI and pushed to the private registry (`registry.cloudketer.dev`) as `<name>:<sha>` and `:latest`, as today.
- **Observability:** JSON log lines with `trace_id` for `after()` failures, start/undo and remap applies (`{ msg: "tramo.started", projectId, workflowId, created, skipped }`). No metrics or tracing stack.

---

## 15. Folder structure (changes only)

```
lib/db/schema/{workflows,tasks,projects,people,_schema,index}.ts   changed
lib/db/schema/flow-report.ts                                        new
lib/db/migrations/0023_project_flow_schema.sql                      new (generated + hand edits)
lib/db/migrations/0024_project_flow_backfill.sql                    new (custom)
lib/db/migrations/0025_project_flow_drops.sql                       new, release B
lib/project-flow/{names,catalog,readiness,start-tramo,auto-start,admin-tasks,closing}.ts (+ tests)  new
lib/validation/project-flow.ts                                      new
lib/auth/access-role.ts                                             new (moved from session.ts)
lib/actions/{tramo-start,positions}-actions.ts                      new
lib/actions/areas-actions.ts                                        deleted
lib/repositories/{workflow-phases,positions,project-spaces}-repository.ts  new
lib/repositories/areas-repository.ts                                deleted
lib/actividades/departamento.ts, lib/templates/*, lib/proyectos/phases.ts  deleted
lib/monday-import/task-areas.ts (+test)                             deleted
scripts/default-catalog.mjs, scripts/project-flow-report.ts         new
scripts/monday/remap.ts                                             new (+ cli.ts command)
package.json                                                        + "flow:report": "tsx scripts/project-flow-report.ts"
```

---

## 16. Test plan

Vitest only, next to the code (existing pattern). `*.db.test.ts` files run against the local Postgres as today; since `npm run db:migrate` (drizzle-kit) skips the `ensure*` steps, those fixtures seed the catalog themselves (`ensureDefaultCatalog`). This feature adds only vitest tests to the existing CI; changing the CI workflow is out of scope. Browser checks are local, on-demand runs (`CI=1 npm run test:e2e`) whose results are recorded on the issue. The e2e specs that must be updated with this feature: `tests/e2e/proyectos.spec.ts` (create with name only; the client is no longer required, lines 56-58; client change from the ficha) and `tests/e2e/equipo.spec.ts` (Puestos instead of the free-text Puesto and Áreas, line 35).

**Unit (pure):**
- `nameKey`, `stripMondayNumbering` (the four brief examples + "1.5 m", "3 recámaras", "2024 Plan").
- `closedAtPatch`; `isTaskCompleted` vs `isTaskClosed` (Cancelado closed, not completed).
- Readiness table of §9.1 (each row), including "fase not contracted" and "first tramo".
- `resolveGroupTarget` defaults (tramo name, fase of board tramo, fase of another tramo, "Administrativo", fallback, unresolved); encode/decode round trip; `groupTargetKinds` per strategy.
- `upgradeMappingV1` for each old kind and the status-map merge rule.
- Translate: fase resolution order (template → group fase → title → unresolved); status map lookup with priority and defaults; Timeline → both dates; `closed_date`; admin group assignee clearing; client-less project gets the admin task; no fase is ever created.
- Plan: issues of already imported items are dropped (fixture with a re-run of the same export); `PROJECT_NAME_TAKEN`; `TRAMO_MISSING`.
- Puesto suggestion scoring and ties.
- Drift guard: 0024 contains every `DEFAULT_CATALOG` row; the catalog has 10/29/12 templates; every `legacyTitle` equals a TS template description (checked before the TS files are deleted, then frozen as a fixture).

**Repository / DB (`*.db.test.ts`):**
- Constraints: a task with a fase of another tramo fails (`tasks_phase_fk`); a fase without a tramo fails; an admin task with a tramo, fase or espacio fails; an espacio of another project fails; `counts_as_completed` without `closes` fails; duplicate project names among active projects fail, but are allowed against a completed one.
- `createProject`: name only → Presale stage, 10 tasks, one `assign_client` admin task; with Presale auto-start off → no stage, no tasks; `NAME_TAKEN`.
- `startTramo`: assignment modes; idempotent repeat (`createdCount 0`, `skippedCount n`); two concurrent calls create each task once; `current` moves forward only; `PHASE_MISMATCH`, `NO_PHASES`.
- `undoStartTramo`: removes tasks and the created stage, restores `current`; `TOUCHED` after a title edit, a comment, a checklist item, a support row; `canUndo` on the board follows.
- `onTaskClosingChanged`: completing the last Cobro task makes the project ready for Diseño (`readySince`); with Diseño `on_ready`, it starts automatically, once.
- `updateProject` with a client closes the admin task; non-admin sending `clientId` → `FORBIDDEN`.
- Admin visibility: non-admin list/board/calendar/detail never return admin tasks or client names; `ASSIGNEE_NOT_ADMIN` on create, assign and support; and the Directorio client detail (`fetchContactAction` projects `[]`), project history (no `clientId`/`origin`/`originStaffId` events), the task-scoped reads of an admin task (history, checklist, links, attachments, dependencies → `null`/`[]`; writes → `FORBIDDEN`) and `getImportDataAction` (null for admin tasks, no client columns on projects) don't expose them either.
- Espacio delete nulls tasks' `space_id`.
- Positions: `IN_USE` with a Google mapping; `setStaffPositions` keeps workspace rows.
- Migrations 0023 + 0024 on a fixture with one `kind = 'area'` mapping and on one with none: both apply; final enum `('role','position')`, new check in place (§4.1).
- 0024 ordering: a fixture tramo whose tasks are all completed ends with `project_stages.closed_at` set. An existing closing "Cancelado" ends with `counts_as_completed = false` and no duplicate row. Duplicate names "X", "X", "X (2)" become "X", "X (3)", "X (2)" and the unique index is created.
- `ensureDefaultCatalog` run twice, and run after an admin soft-deleted "En espera" and a puesto: nothing comes back.
- Migration 0024 on a fixture database (dev-like: Madrid 22 free-text fases, an `areas` row, an area mapping, two same-named projects, a project started with the old "Iniciar plantilla"): fases normalized accent-insensitively, old template tasks linked (a later `startTramo` creates 0), report rows written, mapping kind renamed, names deduplicated, `closed_at` backfilled. Then 0025 on top.
- Remap on the Madrid 22 fixture: the default targets give Presale → Diseño → Construcción (current), 210 tasks before and after, zero deletions; re-apply is a no-op; rollback still works after a remap.

**Actions:** auth and error codes of every action in §7 (mocking `requireCapabilityUser` as the existing `*-actions.test.ts` do); `workspace-access.test.ts` for position groups; `monday-import-actions.test.ts` for the four new actions and the wizard admin guard.

---

## 17. Acceptance (backend)

1. A project can be created with a name only; it gets Presale with 10 tasks (when auto-start is on) and the admin task "Asignar cliente y origen", which closes when a client is set.
2. The DB refuses a task whose fase belongs to another tramo, and an admin task with a tramo, fase or espacio.
3. Completing Presale's Cobro tasks lists the project in Diseño's `ready`; `startTramoAction` creates the checked fases' tasks with the chosen assignment, is idempotent, and `undoStartTramoAction` removes them until one is edited (`canUndo` follows).
4. Non-admins never receive client, origin or admin tasks from any action.
5. No code path reads `areas`, `area_members`, `area_workflows`, `tasks.phase`, `projects.phases` or `DEPARTMENTOS` after release A; release B drops them.
6. The four pending monday boards plan with zero área and status warnings (status map saved), with every group mapped to one of the six targets, and already imported items raise no warnings.
7. After the one-time remap, Madrid 22 has tramos Presale → Diseño → Construcción (current) and keeps its 210 tasks.

---

## 18. API alignment verification (frontend §7)

```
✅ fetchWorkflowsAction(opts)            §7.1 (now readable by any staff for active rows)
✅ fetchTramosNavAction                  §7.1
✅ createWorkflowPhaseAction             §7.1
✅ updateWorkflowPhaseAction             §7.1
✅ reorderWorkflowPhasesAction           §7.1
✅ setWorkflowAutoStartAction            §7.1
✅ createTemplateAction / updateTemplateAction (phaseId, PHASE_MISMATCH)   §7.1 (+ NAME_TAKEN)
✅ deactivateTemplateAction / reorderTemplatesAction                       §7.1
✅ fetchPositionsAction / createPositionAction / updatePositionAction      §7.2
✅ deletePositionAction (IN_USE) / setPositionPhasesAction / reorderPositionsAction  §7.2
✅ setStaffPositionsAction               §7.2
✅ fetchAssignableStaffAction (suggested) §7.2
✅ fetchProjectsAction / fetchProjectAction (mondayImport)                 §7.3
✅ createProjectAction (name only, side effects)                           §7.3, §9.4
✅ updateProjectAction (admin-only keys, auto-close admin task)            §7.3, §9.5
✅ setProjectCurrentTramoAction (NOT_STARTED)                              §7.3
✅ fetch/create/rename/reorder/deleteProjectSpaceAction                    §7.3
✅ fetchTramoBoardAction (ready, upcoming, started[].canUndo)              §7.4, §9.2
✅ previewStartTramoAction / startTramoAction / undoStartTramoAction       §7.4, §9.6, §9.7
✅ fetchTasksAction / fetchMyTasksAction / fetchBoardAction / fetchCalendarAction (phaseId, spaceId, kind)  §7.5
✅ createUserTaskAction (PHASE_MISMATCH, SPACE_MISMATCH)                   §7.5
✅ updateTaskAction (ADMIN_TASK, PHASE_MISMATCH, SPACE_MISMATCH)           §7.5 (+ ASSIGNEE_NOT_ADMIN)
✅ createSubtaskAction (inherits)        §7.5
✅ fetchAdminTasksAction / createAdminTaskAction (ASSIGNEE_NOT_ADMIN)      §7.5
✅ assignTaskAction / setTaskSupportAction (ASSIGNEE_NOT_ADMIN)            §7.5
✅ createTaskStatusAction / updateTaskStatusAction (countsAsCompleted, INVALID)  §7.6
✅ group mapping actions (role | position)                                 §7.7, §12
✅ getMondayImportChoicesAction (new shape, statusMap)                     §7.8
✅ saveMondayStatusMapAction             §7.8
✅ createMondayStaffAction (positionIds) §7.8
✅ suggestMondayPositionAction           §7.8, §10.8
✅ getMondayRemapAction / previewMondayRemapAction / applyMondayRemapAction  §7.8, §11
✅ saveMondayMappingDraftAction / previewMondayImportAction / others       §7.8, §10
✅ Removed: previewApplyWorkflowAction, applyWorkflowAction, setProjectStageAction, setProjectStagesAction, setStaffAreasAction, areas-actions
⚠️ see §19 for the contract details that differ
```

---

## 19. Differences from the frontend spec

All 13 items below were applied to the frontend spec in review round 1 (`docs/review/project-flow-review.md`); kept here as a record.

1. **`fetchWorkflowsAction` auth.** Frontend §3.4 reads `presaleAutoStart` and §3.1 reads the tramo's fases through `fetchWorkflowsAction`, which today returns `[]` without `workflows.canViewWorkflows` (`workflows-actions.ts:23-24`). The backend opens it to any staff session for active rows; `includeInactive*` needs `canManageWorkflows`. The frontend should note this.
2. **`UserTaskInput.workflowId` required, with no error copy.** A missing or invalid tramo fails zod with `INVALID`; frontend §9 has `INVALID` only for statuses. Its copy table needs a generic `INVALID` row (or a task-specific one).
3. **`updateTaskAction` also returns `ASSIGNEE_NOT_ADMIN`** (`TaskPatch` includes `managerId`); frontend §7.6 lists it only for `createAdminTaskAction`, `assignTaskAction` and `setTaskSupportAction`.
4. **Template `NAME_TAKEN`.** `createTemplateAction` / `updateTemplateAction` can return `NAME_TAKEN` (same title in the same fase); frontend §7.2 lists only `FORBIDDEN`, `PHASE_MISMATCH`.
5. **Undo removes the stage row only when no other task of that tramo remains** (e.g. a quick-added task). Frontend §7.5 says "if `stageCreated`, the stage row". Also `undoStartTramoAction` returns `TOUCHED` when a later start batch of the same tramo exists.
6. **New monday issue codes:** `PROJECT_NAME_TAKEN` (blocking: firm-wide unique names) and `ADMIN_ASSIGNEE_CLEARED` (warning: non-admin assignees dropped from admin tasks). Frontend §4.6 item 9 / §7.8 should add titles ("Proyectos con nombre repetido ({n})", "Tareas de administración sin responsable ({n})").
7. **monday action errors:** `saveMondayStatusMapAction` can return `STATUS_NOT_FOUND`; `getMondayRemapAction` returns `NOT_IMPORTED` for projects not imported. Frontend §7.8 only says "error copy when the project wasn't imported".
8. **Status map key.** Frontend §7.8 says `lower(trim(label name))`; the backend also collapses inner whitespace (`label.trim().toLowerCase().replace(/\s+/g, " ")`). Compatible for normal labels; the frontend should build keys with the same helper (`statusLabelKey`, exported from `scripts/monday/mapping.schema.ts`).
9. **Mapping version.** `mapping.json` becomes `version: 2` with `upgradeMappingV1`; frontend §7.8 doesn't mention it. Uploading a v1 file in the wizard is upgraded server-side, not rejected.
10. **Admin subtasks.** A subtask of an admin task is an admin task (`kind` inherited); frontend §7.6 only mentions `workflowId` and `phaseId`.
11. **Auto-started tasks are unassigned.** Frontend §16 item 2 says "Presale with 10 tasks" without an assignee rule; the backend uses "Sin asignar" for `on_create` and `on_ready` starts.
12. **Tramo closing is automatic** (`project_stages.closed_at` set when all its tasks close). Frontend §3.5 shows "Cerrado el {fecha}" but no rule; nothing to change unless a manual close is wanted.
13. **Brief wording:** brief §6 still says "Taller de Diseño «Listos para iniciar»"; per the defaults table the tramo is "Diseño" everywhere (frontend §16 item 3 also says "Taller de Diseño").

---

## 20. Resolved decisions

Nothing is open. The owner answered this spec's two calls on 2026-11-06:

| # | Topic | Decision | Where applied |
|---|---|---|---|
| RD-1 | Seed template titles | Spelling fixed in `DEFAULT_CATALOG` and 0024 (accents restored, typos fixed: "Reporte Estado Actual", "Imágenes de Referencia", "Plano de distribución", "Volumetría", "Planos Arquitectónicos", "Supervisión de trabajos", "Cálculos Simulaciones", "Atención a calidad y detalles finos", "Bitácoras y Minutas", …). The fase backfill stays accent-insensitive, and old task titles still match through `flow_name_key` and `legacyTitle` | §5.2, §4.2 steps 3 and 5e, §16 |
| RD-2 | Gate fase not contracted | A Presale with no Cobro tasks makes the project ready for Diseño once Presale has started (same for Diseño without Ejecutivo → Construcción) | §9.1 |

---

## 21. Review round 1 fixes

From `docs/review/project-flow-review.md` (CHANGES NEEDED, 2026-11-06).

| Item | Fix | Where |
|---|---|---|
| B1 Quick-add closed off the start flow | A quick-add never writes `project_stages`; only `startTramo` starts a tramo (sheet, auto-start, import, remap). The sheet opens for any tramo of a project (deep link, "Agregar fases"), and `startTramo` adds missing fases when the stage exists. "Asignar tramo" goes through `startTramo` with `stageOnly` | §7.3, §7.5 `createUserTaskAction`, §9.1 |
| B2 Admin-only data through other reads | Contact detail, project history, task-scoped reads/writes of admin tasks, `getImportDataAction` filtered; portal contacts page is an accepted exception; tests extended | §12, §16 |
| B3 Stage `closed_at` before task `closed_at` | 0024 reordered: statuses (7) → task `closed_at` (8) → stages (9) → current tramo (10) | §4.2 |
| B4 Generated `group_mapping_kind` drop/recreate | 0023 hand edits: keep `task_kind` ADD VALUE and `workflow_auto_start`; delete every statement on `group_mapping_kind` / `workspace_group_mappings_kind_check`; `NOT VALID` on `tasks_closed_at_check`; hand-written `client_stats`; db test with and without an area mapping | §4.1, §16 |
| N1 Permission overrides aren't in the DB | Step 15 is a client-reader alias, no SQL | §4.2 step 15 |
| N2 Existing "Cancelado" counted as completed | Existing Cancelado / No se requiere / En espera reused and updated, never duplicated | §4.2 step 7 |
| N3 Seed resurrects deleted rows | `ensureDefaultCatalog` counts soft-deleted rows; statuses only on a fresh install | §5.4, §16 |
| N4 `INVALID` vs `EMPTY` | `parseInput` rule: a known code message wins, else `INVALID: <path>` | §6 |
| N5 Rollback order for espacios | `project_space` after task refs, before project refs; start batches cascade with the project | §10.9 |
| N6 Status-map upgrade needs label texts | `upgradeMappingV1` takes the stored export; both `bm.statusMaps` readers removed | §10 intro |
| N7 Export files may be gone | Remap pre-flight (`EXPORT_MISSING`), ops step requires `source != null` for every board | §4 table, §11.1, §11.2 |
| N8 Remap people and files | Admin-assignee exception written down, `task_support` refs removed; `import_files` move with "Proyecto aparte" | §11.1 |
| N9 Tasks with no tramo | `updateTaskAction` accepts `workflowId` when the task has none; project "Asignar tramo" | §7.3, §7.5 |
| N10 Drive tree without a client | Client and inbound folder ids nullable; completeness check depends on `withClientFolder` | §8.8 |
| N11 Drag reorder / status drag and undo | Both count as touched; stated | §9.7 |
| N12 Undo lock order | Project first, then batch; `refreshStageClosed` after undo | §9.7 |
| N13 Duplicate-name suffix | Loop to the first free suffix | §4.2 step 11 |
| N14 Template seed skip rule | Per-row `where not exists` | §4.2 step 3 |
| N15 Report detail | `area_member` detail includes `role` | §4.2 step 12 |
| N16 Revert effects | Known effects of reverting release A written down | §4 |
| N17 Housekeeping | §19 marked applied; `plan.ts` line numbers refreshed | §0.1, §10.4, §19 |
| CI wording | The feature adds vitest tests to the existing CI only; e2e specs to update listed; CI workflow cleanup out of scope | §16 |
| Round 2 items 1, 2, 4, 5 | Step 3 guard `(x.phase_id = <seed> or x.phase_id is null)`; fresh-install puesto candidates; `EXPORT_MISSING` copy aligned with frontend §9; `status_reused`/`status_created` report kinds with reopened-task count | §4.2 steps 3, 7, 14; §5.4; §11.1; §4.4 |
