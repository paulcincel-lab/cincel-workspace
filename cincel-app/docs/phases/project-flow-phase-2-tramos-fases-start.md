# Project Flow Phase 2: Tramos, Fases + Iniciar Tramo

## Goal
Every screen speaks Tramo / Fase / Espacio: each tramo's Actividades page lists "Listos para iniciar" and starts a tramo from one sheet with undo, tasks pick their fase from the catalog, and Configuración has "Tramos y fases".

## Deliverables

### Backend
- [ ] `fetchWorkflowsAction` open to any staff session for active rows; `includeInactive*` needs `canManageWorkflows` (BE §7.1, §19 item 1)
- [ ] Templates require `phaseId` (`PHASE_MISMATCH`, `NAME_TAKEN` per fase); the Phase 1 text fallback is removed (BE §7.1, §8.2)
- [ ] Tasks: `TaskFilters` + `phaseId`, `spaceId`; `createUserTaskAction` requires `workflowId`, checks `phaseId` / `spaceId` (`PHASE_MISMATCH`, `SPACE_MISMATCH`, `INVALID`), never writes `project_stages`; `updateTaskAction` with `phaseId` / `spaceId`, `workflowId` only for tasks with none; subtasks inherit `workflowId` / `phaseId`; `phase` key removed from inputs and DTOs; list order by tramo, fase, `sort_order` (BE §7.5, §8.6)
- [ ] Task status actions call `after(() => onTaskClosingChanged(...))` (stage closing + auto-start on ready, JSON log lines with `trace_id` on failure) (BE §9.8, §14)
- [ ] Projects: `setProjectCurrentTramoAction` (`NOT_STARTED`; admin "Asignar tramo" via `startTramo` `stageOnly`) replaces `setProjectStage(s)Action`; `previewApplyWorkflowAction` / `applyWorkflowAction` and `applyWorkflow` deleted; `phase` / `phases` and `area` removed from project DTOs (BE §7.3, §8.5)
- [ ] Project create keeps today's client-required form but Presale auto-starts through `startTramo` (`on_create`, unassigned) instead of "Etapa inicial" / template (BE §9.4 step 3)
- [ ] Dashboard `projectsByTramo` (current tramo, "Sin tramo"); task trend counts only statuses that count as completed (BE §8.8)
- [ ] Calendar service, ICS, Google Calendar sync: `tramo` / `tramoLabel`, `phaseId` / `phaseLabel` (BE §8.8, FE §3.9)
- [ ] Action tests for the changed task / project / workflow actions (BE §16 Actions)

### Frontend
- [ ] Sonner added with the shadcn CLI, `<Toaster position="bottom-right" />` in `app/layout.tsx` (FE §4.1, §10)
- [ ] Sidebar Actividades submenu from `fetchTramosNavAction()`; Configuración entry "Tramos y fases" (Áreas stays until Phase 3) (FE §3.16)
- [ ] `/actividades/[departamento]` → `/actividades/[tramo]` (workflows key, `notFound()` for unknown); tabs from `workflows` (FE §2, §3.1)
- [ ] Tramo page: `PhaseStrip`, `ReadyToStartCard`, `UpcomingProjects`, Fase / Espacio filters, project blocks ordered by fase with "Tramo actual" badge, drag only within a fase, quick-add with fase select, "Agregar fases", `?project=` deep link, inline page `Alert` instead of `window.alert` (FE §3.1, §4.3)
- [ ] `StartTramoSheet` (fases with counts and samples, candidates, assignment modes, admin auto-start checkbox, "Crear N tareas"), toast with "Deshacer" (10 s), then "Deshacer inicio" on the block while `canUndo` (FE §3.3, §4.3)
- [ ] `/actividades/general`: always one block per project with `TramoChips`, selector and its storage key removed, no "Sin área" (FE §3.2)
- [ ] Fase select in `NewTaskModal`, the Actividades Fase cell and `TaskDrawer` (+ Tramo select for tasks with no tramo); Espacio select when the project has espacios (FE §4.3)
- [ ] Ficha: "Tramos" card (`ProjectTramosCard`, current tramo select, "Iniciar {tramo}" link, admin "Asignar tramo"), "Espacios" card (`ProjectSpacesCard`), task list grouped Tramo → Fase; "Fases" checkboxes and "Aplicar workflow" removed (FE §3.5)
- [ ] Proyectos: Tramo and Fase activa columns, "Asignar tramo" / "Sin tramo"; "Etapa inicial" removed from the create sheet (FE §3.4)
- [ ] Labels: Dashboard "Proyectos por tramo" with `tramoColorVar`; "Tramo" in Requiere atención / Revisiones; Mis tareas "Tramo · Fase"; Tablero tabs from workflows + "Tramo · Fase" line; Calendario "Tramo" + "Fase" filters, "Tarea" column; export "Tarea" (FE §3.6–§3.9, §13)
- [ ] `TramoBadge` (from `AreaBadge`), `lib/tramos/tramo-color.ts` (from `lib/areas/area-color.ts`), `tramoPhaseLabel` in `lib/tasks/labels.ts` (FE §4.5)
- [ ] `/configuracion/tramos` (`TramosClient`, `PhaseEditorDrawer`, `TemplateTaskDrawer` with required fase select, auto-start switch, read-only readiness); `/configuracion/workflows` redirects (FE §3.11)
- [ ] `/configuracion/estatus`: "Cuenta como completada" column and switch (FE §3.13)
- [ ] "Iniciar plantilla" button and `NewProjectTemplateModal` no longer rendered; nothing reads `DEPARTMENTOS` or `lib/templates/*` any more (files deleted in Phase 5)
- [ ] Vitest component tests of FE §15 for StartTramoSheet, ActividadesClient (ready/upcoming, deep link, General, fase select, undo), NewTaskModal espacio, TramosClient, EstatusClient, Sidebar, `tramoColorSlot`, `tramoPhaseLabel`, `actionErrorText` codes of this phase; existing tests asserting "Área" / "Departamento" / "Etapa" / "Workflow" updated
- [ ] `tests/e2e/proyectos.spec.ts` updated for the Tramo column and no "Etapa"; local `CI=1 npm run test:e2e` run recorded on the issue

### Infrastructure
- [ ] None

## Done Definition
- No screen touched in this phase shows "Área", "Departamento", "Workflow" or "Etapa" for the tramo concept (FE §13)
- Creating a project starts Presale with 10 unassigned tasks
- Completing every Presale·Cobro task of a project moves it from "Próximos" to "Listos para iniciar" on Diseño; starting it with unchecked fases creates only the checked fases' tasks with the chosen assignment; "Deshacer" removes them; after a title edit "Deshacer inicio" is gone
- A task's Fase select lists only its tramo's active fases; no free-text fase input remains
- `rg "DEPARTMENTOS|lib/templates|applyWorkflow|setProjectStage"` finds no caller outside the files Phase 5 deletes
- Vitest green in the existing CI

## Parallel work
- BE: task/project action contract changes ∥ FE: Sonner, `TramoBadge`/labels, Sidebar and tabs (no BE dependency)
- FE tracks once the contract PR merges: Actividades page + `StartTramoSheet` ∥ ficha Tramos/Espacios cards + Proyectos columns ∥ Configuración Tramos y fases + Estatus ∥ Dashboard / Mis tareas / Tablero / Calendario labels
- Phase 3 BE (admin filtering, puestos) can start alongside this phase; Phase 4 BE (importer core) too

## Phase dependencies
- Requires: Project Flow Phase 1 deployed (0023/0024 applied, backfill done)
- Unblocks: Phase 3 FE (ficha/Proyectos/Actividades surfaces it extends), Phase 4 FE (fase catalog in the wizard), Phase 5

## Complexity
- Backend: M
- Frontend: XL
- Infra: S

## Risks
- Biggest UI phase; Actividades is one large client component. Split PRs by surface and keep the contract PR first
- Madrid 22, Guadalajara 83 and Local Espiropapa show their backfilled state (many "Sin fase · revisar", groups as tramos) until the Phase 4 remap; known and accepted, no worse than today's "Sin etapa"
- Candidates in the sheet are empty until people get puestos in Phase 3 ("Sin candidatos"); assignment still works
- The undo window ends on any drag reorder or Tablero status drag (BE §9.7); users may expect otherwise
