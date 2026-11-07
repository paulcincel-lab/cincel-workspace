# Project Flow Phase 3: Name-only Projects, Admin Tasks + Puestos

## Goal
A project starts with only a name; client, origin and admin tasks are visible to administrators only (server-filtered); people have puestos with candidate fases, managed in Equipo and Configuración → Puestos.

## Deliverables

### Backend
- [ ] `lib/auth/access-role.ts` (exported `staffAccessRole`, moved from `session.ts`) and `canSeeAdminData(user)` in `permissions.ts` (BE §7.5, §12)
- [ ] `createProject` rewritten (BE §9.4): name only (`ProjectCreateInputSchema`), `NAME_TAKEN`, `ensureAssignClientTask`, Presale auto-start, `after(syncProjectFolders)` without client folder
- [ ] `updateProject`: `clientId` / `origin` / `originStaffId` admin only (`FORBIDDEN`), `closeAssignClientTask` when a client is set, `after(syncProjectFolders)` (BE §7.3, §9.5)
- [ ] `lib/project-flow/admin-tasks.ts` (`ensureAssignClientTask`, `closeAssignClientTask`, `assertAdminAssignees`); `fetchAdminTasksAction`, `createAdminTaskAction`; `ASSIGNEE_NOT_ADMIN` on create / update / assign / support / subtask of admin tasks; `ADMIN_TASK` for fase/espacio; `mergeTasks` refuses mixed kinds (BE §7.5, §8.6, §9.5)
- [ ] `ViewerScope` through every read: `TaskFilters.kind` (default excludes `admin`), admin tasks only for admins (lists, board, calendar, ICS, Google Calendar sync, dashboard, Mis tareas own), `assertTaskVisible` for every task-scoped read/write; `client` / `clientId` / `origin` / `originStaff` / `clientName` nulled for non-admins (BE §7.5, §8.5, §12)
- [ ] B2 filtering: `fetchContactAction` projects `[]` for non-admins; project history drops `clientId` / `origin` / `originStaffId` events; `getImportDataAction` null for admin tasks and no client columns on projects (BE §12)
- [ ] Portal gating: `portal-contacts-repository` / `portal-access-repository` with nullable client; `invitePortalClientAction` refuses with `no_client` (BE §8.8)
- [ ] `ensureProjectFolders(…, { withClientFolder })`, nullable client / inbound folder ids, completeness check depends on it (BE §8.8)
- [ ] Puestos: `setStaffPositionsAction` replaces `setStaffAreasAction` (Google-managed refusal); `Staff` DTOs with `positions`, `candidatePhases`; `listAssignableStaff` via `staff_positions → position_phases` with `suggested`; `staff.role` no longer written as a job title (BE §7.2, §8.7)
- [ ] Capability `areas.canManageAreas` → `positions.canManagePositions` (module `positions`, label "Puestos"); client reader maps a stored `areas` module to `positions` for one release (BE §4.2 step 15, §12)
- [ ] DB / action tests: name-only create (Presale stage, 10 tasks, one `assign_client`), auto-start off, client set closes the task, non-admin `clientId` → `FORBIDDEN`, admin visibility across every read listed in BE §16, `ASSIGNEE_NOT_ADMIN`, positions `IN_USE` and `setStaffPositions` keeping workspace rows

### Frontend
- [ ] `ProjectCreateModal`: single "Nombre del proyecto" field, `presaleAutoStart` description, `NAME_TAKEN` / empty copy (FE §3.4, §4.4)
- [ ] Proyectos: Cliente column (admins only, "Por asignar"), export Cliente admin only (FE §3.4)
- [ ] Ficha: admin-only "Cliente" header line, `ProjectAdminFields` (optional client, Origen, "Quién trajo el proyecto"), hint about the admin task, "Administración" task group; portal gating `Alert` replaces invite sheet / folder hint while no client; `window.confirm` on client change → `AlertDialog` (FE §3.5, §9)
- [ ] `AdminTasksCard` on the Presale page and the dashboard (self-fetch), `NewTaskModal` admin mode, administrator-only responsable pickers (FE §3.1, §3.6, §4.3)
- [ ] Directorio `ClientDetailSheet`: counts only for non-admins (FE §3.17)
- [ ] Equipo: Puestos, Fases candidatas, Acceso columns, "Área" removed; `MemberEditorDrawer` Puestos multiselect with live candidate fases, free-text Puesto removed, Google-managed read-only (FE §3.10, §4.4)
- [ ] `/configuracion/puestos` (`PuestosClient`, `PositionEditorDrawer`, delete `AlertDialog`, `IN_USE` copy); `/configuracion/areas` redirects; sidebar entry "Puestos" replaces "Áreas"; Permisos label "Puestos" (FE §3.12, §3.16, §8)
- [ ] Vitest component tests of FE §15 for ProjectCreateModal, ProyectosClient admin column, EquipoClient / MemberEditorDrawer, PuestosClient, AdminTasksCard pickers, ClientDetailSheet, ImportDataPanel null
- [ ] `tests/e2e/proyectos.spec.ts` (name-only create, client from the ficha) and `tests/e2e/equipo.spec.ts` (Puestos / Acceso) updated; local `CI=1 npm run test:e2e` run recorded on the issue

### Infrastructure
- [ ] None

## Done Definition
- "+ Nuevo proyecto" asks only for the name; the project gets Presale with 10 unassigned tasks and an admin task "Asignar cliente y origen"; setting a client closes it and creates the "02 Cliente" / "03 Del cliente" Drive folders
- Signed in as a non-administrator: no client name, origin or admin task appears in Proyectos, ficha, Actividades, Mis tareas, Tablero, Calendario, dashboard, Directorio client sheet or project history; a crafted call on an admin task returns `FORBIDDEN`
- Assigning an admin task to a non-administrator returns `ASSIGNEE_NOT_ADMIN`
- Equipo shows Puestos, Fases candidatas and Acceso as separate columns; Configuración shows Puestos and has no Áreas; the start sheet lists candidates for staff with puestos
- Portal invite is blocked with the gating alert while the project has no client
- Vitest green in the existing CI

## Parallel work
- BE track A: name-only create + admin tasks + viewer filtering ∥ BE track B: puestos + capability rename
- FE: Equipo + Configuración Puestos (needs track B) ∥ Proyectos / ficha / AdminTasksCard / Directorio (needs track A)
- Can run alongside Phase 4 (importer); the ficha header is touched by both ("Reacomodar importación" in Phase 4), so merge one before rebasing the other

## Phase dependencies
- Requires: Project Flow Phase 1 deployed; Phase 2 merged for the FE parts that extend the new ficha, Proyectos and Actividades surfaces (BE work can start right after Phase 1)
- Unblocks: Phase 4 apply of client-less projects and admin-group tasks (uses `ensureAssignClientTask`, admin visibility), Phase 5

## Complexity
- Backend: L
- Frontend: L
- Infra: S

## Risks
- Admin-only data must be filtered in every read path; one missed reader leaks client names. Mitigation: the BE §16 visibility tests cover each listed reader
- Reverting this release shows admin tasks to everyone and hides client-less projects (BE §4); acceptable, nothing is lost
- Firm-wide unique names may surprise users who reused names per client; `NAME_TAKEN` copy explains it
