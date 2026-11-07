# 0003 — Project flow: tramos, fases and puestos replace áreas

- **Status:** Accepted (2026-11-06)
- **Context source:** [project-flow-spec](../specs/source/project-flow-spec.md)
- **Related:** monday migration ([spec](../specs/source/monday-migration-spec.md)), Staff SSO ([spec](../specs/source/staff-sso-spec.md))

## Context

The app models one idea, "where a project is in the firm's flow and who works on it", in several unlinked ways:

| Where | What it stores | Shown as |
|---|---|---|
| `workflows` (presale, diseno, construccion) | the three stages | "Área" (dashboard, Actividades), "Departamento" (Mis tareas), "Etapa" (Proyectos, Calendario), "Workflow" (Configuración), a tab |
| `lib/actividades/departamento.ts` `DEPARTMENTOS` | hardcoded copy of the stages with their own labels and templates | sidebar, Actividades and Tablero tabs |
| `areas` + `area_members` + `area_workflows` | staff departments | Equipo, Configuración → Áreas |
| `projects.phases[]`, `tasks.phase`, `workflow_task_templates.phase` | free-text fases | Ficha, task tables, templates |
| `lib/templates/*.ts` and `workflow_task_templates` | two template systems | "Iniciar plantilla" and "Aplicar workflow" |

On dev (v0.33.0) this shows up as data that contradicts itself:
- `area_workflows` is empty, so all 6 projects are "Sin área" while their tasks show "Construcción".
- Madrid 22's "fases" are the monday groups Presale, Diseño, Proyecto Ejecutivo, Administrativo and Obra. That mixes stages, a fase and admin work at one level.
- Local Espiropapa's "fases" are other projects' names.

`projects.client_id` is required, so imports invent placeholder clients ("Prueba Cliente 1", "Cliente multiple 2"). The pending monday import of four boards shows 263 warnings.

Six real monday boards were checked against the alternatives. In every one, a monday group is one of five things:
- a stage (Arena Padel: "00 - Presale, Diseño, Construcción");
- a fase ("Proyecto Ejecutivo", "Post - Venta");
- a space (Depto 201 / Depto 204);
- another project (Local Espiropapa);
- no structure at all (Escritorio Acacias).

## Decision

**One hierarchy, one word per level, enforced by the database.**

```
Proyecto (name only to start; client/origin optional, admin-only)
  └─ Tramo      = workflows row: Presale → Diseño → Construcción (several open, one current)
       └─ Fase  = workflow_phases row, ordered catalog per tramo
            └─ Tarea  (optional Espacio = project_spaces row)

Persona → Puesto(s) → candidate Fases   (suggestion only; access role is separate)
```

1. **Remove áreas.** Drop `areas`, `area_members` and `area_workflows`. The skills side moves to `positions`, `staff_positions` and `position_phases`. Google group mappings become `role | position`.
2. **Fases are a catalog.** `tasks.phase_id` uses a composite FK `(phase_id, workflow_id)`, so a task's fase always belongs to its tramo. Templates use `phase_id`. `projects.phase` and `projects.phases` are dropped: a project's fases are derived from its tasks.
3. **One template system.** Use `workflow_task_templates`, seeded from `lib/templates/*.ts`. `DEPARTMENTOS`, the TS templates and the duplicate "Aplicar workflow" path are deleted. The navigation reads the `workflows` table.
4. **Tramos are started by pull.**
   - Presale starts automatically on project creation.
   - Diseño and Construcción appear as "Listos para iniciar" when the gate fase of the previous tramo is complete (Cobro, then Ejecutivo).
   - Starting one shows a preview, takes an assignment mode, and can be undone while the created tasks are untouched.
   - Starting is idempotent.
5. **Client is optional.** `projects.client_id` becomes nullable, and new `origin` fields are visible to admins only. A missing client creates an admin-only task. The portal invite and the client Drive folder are gated on a client. Project names are unique across the firm.
6. **Admin tasks** are a task kind visible only to administrators, with no tramo or fase.
7. **Espacio** is an optional per-project list on tasks. It filters; it never changes the flow.
8. **The status catalog is firm-wide.** Seed "Cancelado" (closes the task, not counted as completed) and "En espera". Monday status maps are firm-wide (label → status + priority), not per board.
9. **monday group targets** are exactly Tramo, Fase, Espacio, Proyecto aparte, Tareas de administración and Ignorar. A group never creates a fase.

## Alternatives considered

- **Keep áreas and link them to workflows (one owner área per tramo).** This fixes "Sin área" but keeps two parallel structures (people's departments and project stages) that must be kept in sync. It also doesn't express that a person can work several fases across tramos. Rejected in favour of puestos.
- **Fases as free text with autocomplete.** Cheap, but typos and imported group names keep leaking in, which is exactly what happened with Madrid 22. Rejected.
- **Flat fases with no tramo level.** Simpler, but the firm plans and talks in the three tramos, and the board, dashboard and readiness rules need them. Rejected; tramo is kept as the grouping of fases.
- **Keep the client required and import a placeholder.** It pollutes the contacts and dashboards, and blocks starting creative work. Rejected; Cincel is not a CRM.

## Consequences

- **Migration**
  - Existing fase text is normalized into the catalog, and unmatched values are reported.
  - `projects.phases` and area data are reported, then dropped.
  - Projects with no current tramo are flagged for admins.
  - Imported monday projects (Madrid 22, Guadalajara 83, Local Espiropapa) are re-mapped with the new group targets through their import refs.
- **Labels:** "Área", "Departamento", "Etapa" and "Workflow" disappear from the UI for this concept. "Actividades" stays only as the menu section name.
- **Pages:** Configuración → Áreas and Workflows are replaced by Puestos and "Tramos y fases". The Actividades General "Actividad / Proyecto" selector is removed; views always group by project and order tasks by fase.
- **Dashboard:** "Proyectos por tramo" uses the current tramo. Workload by fase and puesto replaces workload by área.
- **Risk:** this touches tasks, projects, templates, the importer and the access-gate group mappings at once. It ships in phases behind the migration report. Rollback is a DB restore from before the phase that drops columns.
- **Supersedes nothing.** It is compatible with ADR 0001 (name snapshots) and 0002 (audit logs).
