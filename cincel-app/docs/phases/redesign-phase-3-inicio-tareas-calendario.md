# Redesign Phase 3: Inicio, Tareas y Calendario

## Goal
Flag-on users start the day on Inicio (greeting, photo, KPIs and widgets in three styles) and work every task from one Tareas page with Tablero / Lista / Calendario views, a task sheet and a new-task dialog, while assignments, mentions, comments and due dates produce notifications.

## Deliverables

### Backend
- [ ] `fetchInicioAction` → `InicioData` (kpis incl. `completadas_semana` with `visibleIn: ["analitico"]`, `tasksByTramo`, 8-week `weeklyPace`, `attention`, `myDay` (events, tasks due today, `remindersForDay`), `projectsProgress`, `workload`), built with the Phase 1 metrics helper and widget builders, scoped by `scopeDashboardProjects/Tasks`, admin tasks and client/origin data only with `canSeeAdminData` (BE §7.10, §8.0, §9.7)
- [ ] `dashboard-actions.flags.ts` entry for `fetchInicioAction` flipped (Rule 1)
- [ ] Notify hooks in `lib/actions/tasks-actions.ts` (the only phase that edits it): three `after(() => notify(...))` calls at the end of `assignTaskAction` (asignación), `createUserTaskAction` (asignación) and `addTaskCommentAction` (comentario, mención for `@` names) (BE §8.3, §21.1)
- [ ] Daily producer `lib/cron/daily-producers/vencimiento.ts`: tasks due tomorrow and overdue, dedupe per task/day, admin tasks to admins only (BE §13)
- [ ] Action and db tests: Inicio admin-only filter, producer dedupe, notify hooks call counts (BE §16)

### Frontend
- [ ] `/inicio` (RSC + `InicioClient`): header block with `ProfilePhotoButton` (canvas re-encode to JPEG ≤ 1024 px, upload to the Phase 1 photo route, `TOO_LARGE` / `INVALID_TYPE` copy), greeting by hour, date line in lowercase es-MX, "Nueva tarea", `EstiloSwitch`; composition of `KpiWidget`, `DistributionWidget`, `WidgetCard` + `chart.tsx` line (Analítico via `RecordTable`), `AttentionListWidget`, `AgendaWidget`, `ProgressListWidget`, `PeopleWidget`; empty states (FE §3.2, §4.3, §4.10.2)
- [ ] Nav items `lib/shell/nav-items/inicio.ts` and `tareas.ts` (Tareas badge = my overdue) (FE §21.1)
- [ ] `lib/tareas/query.ts` (`parseTareasQuery`, `toTareasSearch`) and `TareasClient` (evolves `MisTareasClient` / `ActividadesClient`): URL-synced filters via `FiltersBar` (tramo chips, "Responsable: Yo", Proyecto, search), view switch links, `EstiloSwitch` (FE §3.4, §4.5)
- [ ] Tablero view: `ListPage` `spec.kind = "board"` → `TaskBoardWidget`, optimistic drag with rollback, collapsed empty columns, keyboard "Mover a…" (FE §3.4, §16)
- [ ] Lista view: `ListPage` `spec.kind = "table"` → grouped `RecordTable` with the by-project summary as `hideOn` columns; with a single tramo and Project Flow present, its "Listos para iniciar" / "Próximos" cards and `StartTramoSheet`, `project=X&iniciar=1` opening the sheet (FE §3.4, §21.2)
- [ ] Calendario view (`cal=mes|semana|dia`): `AgendaWidget` modes over the existing `UnifiedCalendar` logic, toolbar, tramo legend, aside (day agenda, "Entregas por semana" `DistributionWidget`, `CalendarFeedDialog`); Día single style (FE §3.4)
- [ ] `EventDetailPopover` (extends the `UnifiedCalendar` popover; "Abrir en Cutto" only with a stored `meetingUrl`) (FE §3.4, §4.9)
- [ ] `TaskSheet` (`/tareas?tarea=<id>`, extends `TaskDrawer` on `FormSheet`): properties grid, Fase / Espacio only when data exists, subtareas, adjuntos, history timeline, comment composer with "@" mentions; close removes the param with `router.replace` (FE §3.4, §4.5)
- [ ] `NewTaskDialog` (extends `NewTaskModal` on `FormDialog`): Fase list per tramo from compat, "Usar plantilla del tramo", `?nueva=1` (FE §3.4)
- [ ] Vitest + a11y: `InicioClient` same KPI numbers in three styles, photo errors; `TareasClient` filters / view switch / drag rollback; `TaskSheet` deep link and back; `NewTaskDialog` fase list; B8 visibility fixtures (FE §17)
- [ ] Playwright: existing specs for `/dashboard`, `/tablero`, `/mis-tareas`, `/calendario` updated to the new routes; Tareas board drag + task sheet flow; run locally, result on the issue (FE §17)

### Infrastructure
- [ ] None

## Visual reference
Canvas: https://claude.ai/artifact/QFQ2oCZE1P6XwYJbduq8p1

- Inicio: `Dashboard` (Visual), `InicioEsencial`, `InicioAnalitico`; theme references `InicioCalido`, `InicioGrafito`, `InicioOscuro` (checked, not separate screens)
- Tareas: `Tareas`, `TareasEsencial`, `TareasAnalitico`; `TareasLista`, `TareasListaEsencial`, `TareasListaAnalitico`
- Calendario: `Calendario`, `CalendarioEsencial`, `CalendarioAnalitico`; `CalendarioSemana`, `CalendarioSemanaEsencial`, `CalendarioSemanaAnalitico`; `CalendarioDia` (one style)
- Sheets and dialogs: `TareaDetalle`, `NuevaTarea`, `EventoDetalle`
- Mobile content: `MovilInicio`, `MovilTareas`
- Variant frames follow the canvas convention `<Frame>Esencial` / `<Frame>Analitico`
- Not implemented: `InicioCutto`, `CuttoLlamada` (Cutto is linked, never embedded)

## Done Definition
- Inicio, Tareas (tablero, lista) and Calendario (mes, semana) render Visual, Esencial and Analítico from the same data; KPI numbers match across styles; `EstiloSwitch` works by keyboard (FE §18 item 4)
- No page file in this phase imports `StyleView` or branches on the style; all differences live in `components/widgets/*` (guard test) (FE §18 item 15)
- `TaskSheet`, `NewTaskDialog`, `TareasClient`, `EventDetailPopover` change the existing `TaskDrawer`, `NewTaskModal`, `MisTareasClient` / `ActividadesClient`, `UnifiedCalendar` popover rather than adding parallel ones (FE §18 item 16)
- A non-admin's Inicio shows no admin task and no client/origin field (FE §18 item 19; BE §17 item 13)
- Assigning a task to someone creates one `asignacion` notification for them and none for the actor; a task due tomorrow produces one `vencimiento` per day from `daily-digest` (BE §17 item 5)
- Flag off: `/inicio` and `/tareas` are not reachable (redirect helper; Phase 2) and `/dashboard`, `/tablero`, `/mis-tareas`, `/calendario` render as today; flag on: Inicio and Tareas nav items appear
- Axe clean on Inicio and Tareas (all views) in all three themes, light and dark (FE §18 item 13); no weight above 600 and no global header (FE §18 item 12)
- Playwright runs recorded on the issues; Vitest green in the existing CI

## Parallel work
- BE: `fetchInicioAction` ∥ notify hooks ∥ `vencimiento` producer ∥ FE: everything (Inicio builds on widget fixtures until the action lands)
- FE tracks: Inicio ∥ Tareas shell + Tablero ∥ Lista ∥ Calendario + EventDetailPopover ∥ TaskSheet ∥ NewTaskDialog
- Runs alongside Phases 2 and 4–8 (Rule 2)

## Phase dependencies
- Requires: Phase 1 only
- Unblocks: Phase 9

## Complexity
- Backend: M
- Frontend: XL
- Infra: S

## Risks
- `tasks-actions.ts` is also rewritten by Project Flow Phase 2; whichever merges second rebases (the redesign change is three `after()` calls) (BE §21.1)
- Without Project Flow, Fase / Espacio fields and the start slot render nothing; with it, its contracts must be read only through `lib/tramos/compat.ts`
- "Mi día" stays empty until Phase 5 writes reminders; expected (hidden-dependency resolution)
- `TableroClient` drag logic moved into `TaskBoardWidget` in Phase 1; regressions show up here first. Keep the existing board e2e green
- `UnifiedCalendar` presentation swap is large; keep its data logic untouched
