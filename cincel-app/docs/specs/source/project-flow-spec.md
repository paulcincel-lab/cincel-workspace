# Cincel Workspace: Project flow (tramos, fases, puestos) and monday port

**Status:** Ready to spec · **Owner:** Oscar · **Date:** 2026-11-06
**Builds on:** Staff SSO (spec 1), monday migration (spec 3), Client Portal (spec 2). All are merged.

---

## 0. Context for the implementer

- Same app: Next.js (App Router) + TypeScript + Server Actions + Drizzle (Postgres) + shadcn/ui. No Zustand, no TanStack Query, no separate API server. Follow `cincel-app/AGENTS.md` and the existing patterns in `lib/actions/*`, `lib/repositories/*`, `components/*`.
- Today the app models the same idea several ways. One `workflows` row (presale, diseno, construccion) is shown as "Área", "Departamento", "Etapa", "Workflow" or an Actividades tab depending on the screen. A hardcoded list (`lib/actividades/departamento.ts` `DEPARTMENTOS`) drives the sidebar and tabs. The `areas` table (staff departments) is barely linked: `area_workflows` is empty on dev, so every project shows "Sin área". Fases are free text in three places (`projects.phases[]`, `tasks.phase`, `workflow_task_templates.phase`). Two template systems exist: TS files in `lib/templates/{presale,diseno,operativas}.ts` ("Iniciar plantilla") and `workflow_task_templates` ("Aplicar workflow").
- A project requires a client (`projects.client_id NOT NULL`), so imports invent placeholders ("Prueba Cliente 1", "Cliente multiple", "Cliente multiple 2").
- Evidence from dev (v0.33.0, 2026-11-06): Madrid 22 (210 imported tasks) shows "Sin etapa" and its "fases" are the monday groups Presale, Diseño, Proyecto Ejecutivo, Administrativo, Obra. Local Espiropapa's "fases" are other projects' names. The pending monday import of Arena Padel, Depto 201 y 204, Escritorio Acacias has 263 warnings: 167 unmatched people, 21 unmatched status labels, 75 items without a timeline.

### Decisions already made (don't revisit)
1. **Áreas are removed as a concept.** No `areas`, `area_members`, `area_workflows`. Who can do what moves to **puestos** (job positions).
2. **Three tramos:** Presale → Diseño → Construcción. They are the existing `workflows` rows. UI word: **Tramo**. "Workflow", "Departamento", "Etapa" and "Área" disappear from the UI.
3. **Fases are a catalog per tramo**, ordered, never free text. A task's fase belongs to its tramo. The catalog is seeded from the current TS templates (below).
4. **Puestos:** a catalog of job positions. A person has one or more puestos; each puesto lists its candidate fases. Candidates are **suggested** when assigning, never enforced. Puesto is separate from the app access role (today the Equipo "Puesto" column shows the access role; fix that).
5. **A project starts with only a name.** Client and origin (who brought the project in) are optional and visible only to administrators. Creating a project without a client creates an admin-only task "Asignar cliente y origen". The client portal invite and the client Drive folder wait until a client is assigned. Project names are unique across the firm.
6. **Admin tasks** are a task kind visible only to administrators, with no fase (e.g. "Asignar cliente y origen", compras, presupuestos adicionales, trámites).
7. **Starting a tramo is a pull.** Each tramo's Actividades page lists projects "Listos para iniciar". Clicking one opens a side sheet with the tramo's template tasks grouped by fase (uncheck fases not contracted), an assignment mode (Asignarme todas / Por fase con candidatos / Sin asignar), and "Crear N tareas". A toast confirms with "Deshacer" while no created task was touched. Starting is idempotent.
8. **Auto-start:** Presale starts automatically when a project is created. Later tramos are manual by default; an administrator can turn on "iniciar automáticamente" per tramo (firm-wide setting).
9. **Readiness ("Listos para iniciar"):** Diseño is ready when Presale's Cobro fase tasks are completed; Construcción is ready when Diseño's Ejecutivo fase tasks are completed. Projects not ready appear collapsed under "Próximos".
10. **One template system:** `workflow_task_templates` with a fase FK. Port the TS templates into it and delete `lib/templates/*`, `DEPARTMENTOS`, `NewProjectTemplateModal` and the "Aplicar workflow" duplicate path.
11. **Actividades always groups by project.** Remove the General "Actividad / Proyecto" selector. Inside a project block, tasks are ordered by fase (catalog order). The sidebar and tabs come from the `workflows` table.
12. **Espacio (new, optional):** a project-scoped list (e.g. "Depto 201", "Depto 204", "Planta baja"). A task may have one espacio. It filters; it does not change the flow.
13. **Status catalog is firm-wide.** Built-ins stay (Pendiente, En proceso, Completado, Bloqueado). Seed two custom statuses: **Cancelado** (closes the task, not counted as completed) and **En espera** (open).
14. **A project can have several tramos open; one is current.** Dashboard and board use the current one.

### Fase catalog seed (from `lib/templates/*.ts`)

| Tramo | Fases (order) | Template tasks |
|---|---|---|
| Presale | Inicial · Presentación · Con Cliente · Minutas · Cobro | 10 |
| Diseño | Anteproyecto · Proyecto Arquitectónico · Ejecutivo · Proyecto Estructural · Proyecto Sustentable · Paisajismo · Minutas | 29 |
| Construcción | Residencia · Postventa | 12 |

"Minutas" exists in Presale and Diseño as two different fases.

### Defaults to confirm (build with these unless told otherwise)

| Topic | Default |
|---|---|
| UI word for the three big stages | "Tramo" |
| Minutas | Kept as a fase; revisit later |
| Monday "Administrativo" group | Admin tasks |
| Puestos seed | Arquitecto proyectista, Proyectista ejecutivo, Dibujante, Comercial, Residente de obra, Administración (editable) |
| Undo window for "Iniciar tramo" | Toast "Deshacer" for 10 s, then "Deshacer inicio" on the project block until any created task is edited |
| Re-sorting already imported projects | One-time script run with the data migration, plus an admin action "Reacomodar importación" per project |
| Readiness rules (Cobro → Diseño, Ejecutivo → Construcción) | Fixed in code, shown read-only in Configuración |
| Firm-wide monday status map | Saved setting, reused by every later import |
| Existing table columns (Checklist, Equipo in Actividades; Encargado, Estado in Proyectos) | Kept; the new columns are added, nothing removed |
| Display name of the Diseño tramo | "Diseño" everywhere (no "Taller de Diseño") |
| `staff.role` | Access role only; puestos live in their own tables |
| "Asignar cliente y origen" closes | Automatically when a client is set (origin optional) |
| Who can be assigned admin tasks | Administrators only |
| Workload widget by fase and puesto | Out of scope for this feature |

---

## 1. Goals and non-goals

**Goals**
- One word per concept on every screen; data that cannot contradict itself.
- Start work with a project name; tramos are started from each tramo's Actividades page.
- Port monday boards into tramo / fase / espacio cleanly, and re-sort the projects already imported.

**Non-goals**
- CRM features (pipelines, leads). Cincel is not a CRM.
- Changing staff sign-in, the client portal (beyond gating on client), or Drive folder layout.
- Monday sync. The migration stays one-time per board.

---

## 2. Data model changes

- `workflow_phases` (new): id, workflow_id → workflows, name, sort_order, active. Unique (workflow_id, lower(name)).
- `tasks`: add `phase_id` → workflow_phases with composite FK (phase_id, workflow_id) so the fase belongs to the task's tramo; add `space_id` → project_spaces (nullable); add `kind = 'admin'` (admin-only, no workflow/fase); add `closed_at` if not present (used for "Fecha que finalizó"). Drop `tasks.phase` after migration.
- `workflow_task_templates`: `phase` text → `phase_id`.
- `projects`: `client_id` nullable; add `origin` (text) and `origin_staff_id` (nullable); drop `phase` and `phases`; unique lower(name) among non-archived projects. Keep `current_workflow_id` as the current tramo, which must have a `project_stages` row.
- `project_stages`: add `started_at`, `started_by`, `closed_at`.
- `project_spaces` (new): id, project_id, name, sort_order. Unique (project_id, lower(name)).
- `positions` (new), `staff_positions` (staff ↔ position), `position_phases` (position ↔ candidate fase).
- `workflow_settings` or columns on `workflows`: `auto_start` (`on_create` | `on_ready` | `manual`).
- Remove `areas`, `area_members`, `area_workflows`; `workspace_group_mappings.kind` becomes `role | position`.
- `task_statuses`: seed "Cancelado" (closes = true, counts_as_completed = false) and "En espera".

## 3. UX (see the design canvas "Madrid 22 · Flujo propuesto")

- **Proyectos:** "+ Nuevo proyecto" asks for the name only. Table columns: Proyecto · Tramo · fase activa · Tareas abiertas · Cliente (admins only; "Por asignar" in red).
- **Actividades → [Tramo]:** header with the tramo's fases; "Listos para iniciar" card; "Próximos" collapsed; one block per project with its tasks ordered by fase (columns: Fase, Tarea, Responsable, Estado, Compromiso, Próxima revisión, Fecha de entrega). General: one block per project with tramo chips; no selector.
- **Iniciar tramo sheet:** fases with checkboxes and counts, sample task names, candidate per fase, assignment mode, auto-start checkbox (admins), "Crear N tareas", toast with "Deshacer".
- **Task create/edit:** fase is a select from the tramo's catalog (no "Otro…"); espacio select when the project has espacios.
- **Equipo:** Puestos column (one or more) and "Fases candidatas"; access role in its own column. Configuración gets "Puestos" (catalog + candidate fases) and "Tramos y fases" (catalog, templates, auto-start). "Áreas" and "Workflows" pages are replaced.
- **Admin tasks:** a "Para administración" card on Presale and the dashboard, admins only.
- **Labels:** Dashboard "Proyectos por tramo"; Mis tareas "Tramo · Fase"; Calendario filters "Tramo" and "Fase"; export column "Tarea".

## 4. monday importer changes

1. Each monday group's target is one of: **Tramo**, **Fase** (of a tramo), **Espacio**, **Proyecto aparte**, **Tareas de administración**, **Ignorar**. Remove "fase nueva del proyecto", "fase de workflow", "etapa" (`lib/monday-import/group-targets.ts`, `scripts/monday/group-targets.ts`, `mapping.schema.ts`).
2. Remove per-board Departamento, Workflow and "Área y workflow de las tareas" (`TaskAreaWorkflowSection.tsx`, `task-areas.ts`). A board with no structure picks one tramo.
3. Each task's fase: match the tramo's template task first, then the title against fase names, else "Sin fase · revisar". A group never creates a fase.
4. Client optional (`EquivalenciasStep.tsx:432`); without one, create the admin task.
5. Status mapping is firm-wide (today `statusMaps` is per board, `mapping.schema.ts:128`); a monday label maps to status + optional priority. Defaults: En Proceso → En proceso; Entregado, Confirmado → Completado; Cancelado, No se Requiere → Cancelado; En espera → En espera; Importante, Siguiente Paso → Pendiente + prioridad Alta; "-" → Pendiente.
6. Dates: Timeline → commitment and delivery dates (+ cronograma); "Fecha que finalizó" → task `closed_at`.
7. Strip monday numbering from titles ("1.", "01 -", "24,", "8.Producción").
8. People: "Crear integrante" offers a suggested puesto from the fases where that person's tasks land.
9. Warnings grouped by type with counts; never warn about items that will be skipped as already imported (`scripts/monday/plan.ts:761`).
10. Re-sort already imported projects (Madrid 22, Guadalajara 83, Local Espiropapa) with the same targets, as part of the data migration.

## 5. Data migration

- Normalize existing `tasks.phase` / template `phase` text into `workflow_phases` per tramo (case and accent insensitive). Unmatched values → NULL fase, listed in a migration report.
- `projects.phases` values are listed in the report before the columns are dropped.
- Projects without a current tramo are flagged "Asignar tramo" for admins.
- `areas`/`area_members` data is reported and dropped; Google group mappings of kind `area` are removed.
- Imported monday projects are re-mapped through the importer's new group targets (admin action or script), using their import refs.

## 6. Acceptance (high level)

- No screen shows "Área", "Departamento", "Workflow" or "Etapa" for the same concept; the label table in §3 holds everywhere.
- A project can be created with only a name; Presale starts with 10 tasks and an admin task exists.
- Completing Presale's Cobro makes the project appear in Diseño "Listos para iniciar"; starting it creates the checked fases' tasks with the chosen assignment; Deshacer removes them.
- A task's fase can only be one of its tramo's fases (DB enforced).
- The four pending monday boards import with zero "Sin área" and status warnings, and with each group mapped to one of the five targets.
- Madrid 22 ends with tramos Presale → Diseño → Construcción (current) and its 210 tasks keep their counts.
