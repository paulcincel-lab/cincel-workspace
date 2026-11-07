# Redesign Phase 4: Proyectos, Personas, Biblioteca y Vacaciones

## Goal
Flag-on users browse projects (list and one tabbed project page), people (Equipo, Clientes, Contratistas, Proveedores, detail) and the Biblioteca in three styles, and request, cancel and decide vacations from Mis vacaciones.

## Deliverables

### Backend
- [ ] `fetchProjectsPortfolioAction` → `PortfolioRow[]` (real / plan / deviation, `budgetSpentPct` only with `canSeeAdminData`, open / overdue without admin tasks, `daysToDelivery`, non-admin `nextDelivery`, `series7`) (BE §7.12)
- [ ] `lib/actions/people-actions.ts`: `fetchPeopleOverviewAction`, `fetchPersonaDetailAction` (availability from `approvedAbsences` + load, `weekHours` from the Phase 1 helper only for `canViewTeamHours` or self, admin tasks only with `canSeeAdminData`) (BE §7.11, §8.12)
- [ ] `lib/actions/vacations-actions.ts` all actions + `lib/vacations/balance.ts`: request (`INVALID`, `OVERLAP`, notifies deciders with `vacaciones-solicitud`), cancel (`STARTED`), pending list, decide (not one's own; in-app + `vacaciones-decision` email), team absences with kind masking, vacation settings (BE §7.8, §8.8, §9.6)
- [ ] Flags flipped: `projects-actions.flags.ts` (`fetchProjectsPortfolioAction`), `people-actions.flags.ts`, `vacations-actions.flags.ts` (Rule 1)
- [ ] Action, db and acceptance tests: admin-only filtering for portfolio / overview / detail; vacation request → decision → balance and availability (BE §16)

### Frontend
- [ ] `/proyectos`: `ListPage` `spec.kind = "cards"` → `EntityCardGrid` + `DistributionWidget` "Proyectos por tramo"; `NewProjectDialog` (extends `ProjectCreateModal` on `FormDialog`, Project Flow fields); `?nuevo=1`; nav item `proyectos.ts` (FE §3.5)
- [ ] `ProjectTabs` (extends `ProjectSectionNav`) + project header; Resumen tab: `PhaseStepper`, `ProgressListWidget`, `KpiWidget`, `EntityCardGrid`, `RecordTable`; budget admins only; "Cliente y contactos" only for `canSeeAdminData` or member with `clients.canViewClients`; Cutto chat links via `cutto-links.ts` (FE §3.5, §4.6)
- [ ] Proyecto · Tareas tab grouped by fase / partida (`RecordTable` grouped, "+ Agregar tarea") (FE §3.5)
- [ ] Proyecto · Cronograma tab on `CronogramaWidget`; printable report restyled (FE §3.5)
- [ ] Proyecto · Archivos (styles via `ListPage` cards), Clientes and Ficha restyled in the new shell (FE §3.5)
- [ ] `/personas` Equipo (`PeopleWidget`, availability week, hours column only when returned) + `PersonasTabs` keeping the style; nav item `personas.ts` (FE §3.6, §4.7)
- [ ] `/personas/clientes`, `/contratistas`, `/proveedores` (sub-filter chips), `?contacto=<id>` opens `ClientDetailSheet` (FE §3.6)
- [ ] `/personas/equipo/[id]` `PersonaDetail` (replaces `MemberProfileModal` content) (FE §3.6)
- [ ] `/biblioteca` index, `/biblioteca/[seccion]`, `/biblioteca/empresa/[doc]` (`DocumentReader`, "Preguntar al asistente…" opens the sheet when Phase 7's flag is on, hidden otherwise); nav item `biblioteca.ts` (FE §3.7)
- [ ] `/biblioteca/vacaciones`: balance, `VacationForm`, history with cancel, team strip, "Documentos" from the `mis-vacaciones` resource rows (FE §3.7)
- [ ] "Solicitudes del equipo" and the "Días de vacaciones" `SettingsSection`, only for `canDecideVacations` (FE §3.7)
- [ ] Vitest + a11y: `ProjectTabs` Clientes permission, `ProjectsPortfolio` styles, `PersonasTabs` style kept, hours hidden, `VacationForm` `OVERLAP`, "Ausencia" masking, `STARTED` copy, B8 fixtures (FE §17)
- [ ] Playwright: existing specs for `/equipo`, `/directorio`, `/recursos` updated; vacation request + decision flow; run locally, result on the issue (FE §17)

### Infrastructure
- [ ] None

## Visual reference
Canvas: https://claude.ai/artifact/QFQ2oCZE1P6XwYJbduq8p1

- Proyectos: `Proyectos`, `ProyectosEsencial`, `ProyectosAnalitico`; `NuevoProyecto`
- Proyecto: `Proyecto`, `ProyectoEsencial`, `ProyectoAnalitico`; `ProyectoTareas` (+ `ProyectoTareasEsencial`, `ProyectoTareasAnalitico`); `ProyectoCronograma` (+ `ProyectoCronogramaEsencial`, `ProyectoCronogramaAnalitico`); `ProyectoArchivos` (+ `ProyectoArchivosEsencial`, `ProyectoArchivosAnalitico`); `ProyectoClientes`, `ProyectoFicha`, `ProyectoReporte` (no styles)
- Personas: `Personas`, `PersonasClientes`, `PersonasContratistas`, `PersonasProveedores`, `PersonaDetalle`, each with its `…Esencial` / `…Analitico` variant
- Biblioteca: `Biblioteca`, `BibliotecaSeccion` (+ variants), `BibliotecaDocumento`; `MisVacaciones` (+ `MisVacacionesEsencial`, `MisVacacionesAnalitico`)
- Mobile content: `MovilProyecto`
- Variant frames follow the canvas convention `<Frame>Esencial` / `<Frame>Analitico`
- Not implemented: `InicioCutto`, `CuttoLlamada`; views/downloads columns of the Biblioteca Analítico frames (RD-7)

## Done Definition
- Proyectos, Proyecto (resumen, tareas, cronograma, archivos), Personas (all tabs, detalle), Biblioteca (+ sección) and Mis vacaciones render Visual, Esencial and Analítico from the same data, switch by keyboard (FE §18 item 4)
- Guard test green: no page here writes per-style markup (FE §18 item 15); `NewProjectDialog`, `ProjectTabs`, `PersonaDetail`, Biblioteca evolve the named existing components (FE §18 item 16)
- No portfolio, overview or detail response shows an admin task or client/origin data without `canSeeAdminData`; absence kinds only for the owner and deciders (FE §18 item 19; BE §17 items 8 and 13)
- Vacation request rejects overlaps; a decider can't decide their own; approval updates the balance and the availability grid (BE §17 item 8)
- Cutto appears only as links opening cutto.cloudketer.dev in a new tab (FE §18 item 11)
- Flag off: `/equipo`, `/directorio`, `/recursos` render as today; flag on: Proyectos, Personas, Biblioteca nav items appear
- Axe clean on every new page in all three themes, light and dark (FE §18 item 13)
- Playwright runs recorded; Vitest green in the existing CI

## Parallel work
- BE: portfolio ∥ people overview + detail ∥ vacations — all independent
- FE tracks: Proyectos list ∥ project tabs (Resumen / Tareas / Cronograma / Archivos+Clientes+Ficha) ∥ Personas tabs ∥ Persona detalle ∥ Biblioteca ∥ Mis vacaciones + Solicitudes
- Runs alongside Phases 2, 3 and 5–8 (Rule 2)

## Phase dependencies
- Requires: Phase 1 only
- Unblocks: Phase 9

## Complexity
- Backend: L
- Frontend: XL
- Infra: S

## Risks
- Personas hours are zeros until Phase 6 writes time entries (hidden-dependency resolution); hide the column only by the server rule, not because values are zero
- Project Flow renames / new fields (puesto, fases, espacios, client optional) arrive independently; read them through `lib/tramos/compat.ts` and render Fase / Espacio / Puesto only when data exists
- Cronograma and the files browser are large existing components; restyle without touching internals (non-goal: rewriting Cronograma)
- "Preguntar al asistente" depends on Phase 7 being on; it must stay hidden via the assistant flags, never call a stub
