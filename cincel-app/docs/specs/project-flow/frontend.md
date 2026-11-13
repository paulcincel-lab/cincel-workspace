# Spec: Project flow (tramos, fases, puestos) and monday port (Frontend)

## Glosario

- **etapa (antes tramo)**: a department stage of a project (Presale, Diseño, Construcción…). This spec was written when it was called *tramo* and keeps that wording below; read every "tramo" as "etapa". Stored values (`tramo_started`, `tramo_start_undone`, `task_tramo_inferred`, `project_without_tramo`) keep the old name; the table is `etapa_start_batches`.

**Status:** Ready for review · **Owner:** Oscar · **Date:** 2026-11-06
**Source brief:** `docs/specs/source/project-flow-spec.md` (decisions there are final; this file doesn't revisit them).
**Companion:** `docs/specs/project-flow/backend.md` (data model, migration, server behavior). §7 here is the contract the backend must match.

Conventions (from the repository guidelines and the existing app): Next.js 16 App Router, React 19, TypeScript, Server Actions in `lib/actions/*-actions.ts`, Drizzle/Postgres, plain shadcn/ui in `components/ui/shadcn` (variants only, no custom-colored wrappers), `DataTable`, `AccordionPanels`, `PageHeader`, `Sheet` drawers for editing, Spanish (Mexico) copy in sentence case. Monochrome chrome; color only for semantic status (`destructive`) and for dashboard data widgets, where tramos keep fixed chart tokens (Presale `chart-1`, Diseño `chart-2`, Construcción `chart-3`). Types live in `lib/types/`. Actions throw `Error` with a code-like message (`"FORBIDDEN: …"`, `"NAME_TAKEN"`), and the UI maps it to Spanish copy. The monday wizard keeps its `{ ok: true } | { ok: false, error }` result style.

This feature adds no Zustand stores and no TanStack Query (the app has `@tanstack/react-query` and `zustand` installed for the session only; this feature doesn't use either). Pages are server components that load initial data; client components keep local state and call server actions directly, then refetch. `@tanstack/react-table` stays (through `DataTable`).

---

## 1. Project overview

**What:** one consistent way to run a project through the firm. A project starts with only a name. Work happens in three **tramos** (Presale → Diseño → Construcción). Each tramo has an ordered catalog of **fases**, and each fase has template tasks. Someone in each tramo *pulls* projects that are ready ("Listos para iniciar"), picks the fases that were contracted and who does them, and creates the tasks in one click, with an undo. People have **puestos** (job positions) that suggest who fits each fase. Client and origin are admin-only data, and missing data becomes an admin-only task. The monday importer maps boards onto the same tramo / fase / espacio model.

**Target users**
- Tramo leads and staff (Presale, Diseño, Construcción): start tramos, work tasks by fase.
- Administrators: client, origin, admin tasks, catalogs (puestos, tramos y fases, estatus), monday import.
- Every staff member: Mis tareas, Tablero, Calendario, Dashboard with the same words.

**UX goals**
- One word per concept on every screen: **Tramo**, **Fase**, **Puesto**, **Espacio**, **Tarea**. "Área", "Departamento", "Workflow" and "Etapa" disappear from the UI for this concept (§13).
- Start a project with a name; start a tramo from that tramo's Actividades page in one sheet.
- Fase is always picked from a catalog, never typed.
- Admin-only data never renders for non-admins (server-filtered, not only hidden).

**Non-goals**
- CRM features, monday sync, Drive layout or staff sign-in changes, client portal changes beyond gating on a client (brief §1).
- Enforcing puesto candidates: they're suggestions only.
- A UI to edit the readiness rules. They're fixed in code and shown read-only (§17 RD-4).

---

## 2. Route architecture

| Route | Purpose | Auth |
|---|---|---|
| `/actividades/general` | Every tramo's tasks, one block per project, tramo chips | protected (staff, `activities.canViewActivities`) |
| `/actividades/[tramo]` | One tramo (`[tramo]` = `workflows.key`: `presale`, `diseno`, `construccion`): Listos para iniciar, Próximos, project blocks by fase. Folder renamed from `[departamento]` | protected (staff); 404 when no active workflow has that key |
| `/proyectos` | Project list; name-only create | protected (`projects.canViewProjects`) |
| `/proyectos/[id]/ficha` | Ficha: tramos, espacios, admin-only client/origin | protected (`canViewProjects`); client/origin admin only |
| `/proyectos/[id]/clientes` | Portal access; gated until the project has a client | protected (`portal.manageAccess`) |
| `/dashboard` | "Proyectos por tramo", "Para administración" (admins) | protected |
| `/tablero` | Kanban; tabs by tramo from the `workflows` table | protected |
| `/mis-tareas` | My tasks; "Tramo · Fase" column | protected |
| `/calendario` | Filters "Tramo" and "Fase" | protected |
| `/equipo` | Puestos, Fases candidatas, Acceso columns | protected (`team.canViewTeam`) |
| `/directorio` (client sheet) | Client projects list for admins, counts only for others (§3.17) | protected (`clients.canViewClients`) |
| `/configuracion/puestos` | **New.** Puestos catalog and candidate fases | admin (`Administrador`) |
| `/configuracion/tramos` | **New.** Tramos y fases: fase catalog, templates, auto-start | admin |
| `/configuracion/estatus` | Status catalog (+ "Cuenta como completada"; seeds Cancelado, En espera) | admin |
| `/configuracion/google` | Group mappings: kind "Rol" or "Puesto" | admin |
| `/configuracion/importar-monday` | monday wizard with the new targets | admin, not the bootstrap admin (unchanged) |
| `/configuracion/areas` | **Removed.** Redirects to `/configuracion/puestos` | admin |
| `/configuracion/workflows` | **Removed.** Redirects to `/configuracion/tramos` | admin |

The redirects are server `redirect()` stubs in the old `page.tsx` files, so bookmarks keep working. `proxy.ts` and session handling are unchanged.

---

## 3. Page inventory

Notation: **RSC** = server component (`page.tsx`), **CC** = client component. "Actions" are server actions from §7.

### 3.1 `/actividades/[tramo]` (one tramo)

- **Files:** `app/actividades/[tramo]/page.tsx` (RSC), `app/actividades/[tramo]/ActividadesClient.tsx` (CC; today `app/actividades/[departamento]/ActividadesClient.tsx`).
- **Server data (parallel):** `fetchWorkflowsAction()` (to resolve `[tramo]` → workflow with `phases`), `fetchTasksAction({ workflowId })`, `fetchTramoBoardAction(workflowId)`, `fetchProjectsAction()`, `fetchAssignableStaffAction(workflowId)`, and for admins on Presale only `fetchAdminTasksAction()`.
- **Layout, top to bottom:**
  1. `PageHeader`: title = `workflow.name`, description = `workflow.description`. Right side: tramo `Tabs` (General + one per active workflow, by `sortOrder`), built from `workflows`, not `DEPARTMENTOS`.
  2. **Fase strip** (`PhaseStrip`): the tramo's active fases in catalog order, "Anteproyecto · Proyecto Arquitectónico · Ejecutivo · …", with each fase's share of open tasks drawn by the existing `LoadBar` (replaces "Mezcla por fase", which read the TS template).
  3. Workload rings (`CapacityRing`), unchanged.
  4. **"Para administración"** card (`AdminTasksCard`), Presale page only and only for admins.
  5. **"Listos para iniciar"** card (`ReadyToStartCard`): one row per ready project. Each row shows the project name, "Listo desde {fecha}" and an "Iniciar" button that opens the Iniciar tramo sheet (§4.3). The card is hidden for users without `canCreateActivity`, who see a read-only count instead.
  6. **"Próximos"** (`UpcomingProjects`): collapsed by default (one `Accordion` item titled "Próximos ({n})"). Each row reads "{proyecto} · falta {fase} de {tramo}: {abiertas} de {total} tareas abiertas", with no action.
  7. Filter bar (existing): Buscar, Proyecto, Responsable, Estatus, Fecha de entrega, Mostrar completadas, Activas/Archivadas, Limpiar filtros, export. Adds **Fase** (catalog of this tramo) and **Espacio**. Espacio shows only when a listed project has espacios, and its options are "{proyecto} · {espacio}".
  8. **Project blocks** (`AccordionPanels`): one per project with this tramo started or with tasks in it, sorted by project name. Block title = project name, plus a `Badge variant="outline"` "Tramo actual" when this tramo is the project's current one. While the latest start of this tramo is still undoable (`TramoBoard.started[].canUndo`), the header also shows "Deshacer inicio" (§4.3). Inside, a `DataTable` sorted by fase `sortOrder`, then the manual `sortOrder`, then `createdAt`. Tasks with no fase sort last and show "Sin fase · revisar".
- **Columns (in this order):** selection, Fase, Tarea (title + `SubtaskOfLine` + espacio as a secondary line), Checklist, Responsable, Equipo, Estado (+ `WaitingBadge`), Compromiso, Próxima revisión, Fecha de entrega, row actions. Today's columns are all kept; Fase now comes from the catalog (RD-6).
- **Drag to reorder:** allowed only within the same fase. A drop across fases is refused, and the row snaps back.
- **Quick-add row** per block: a compact fase `Select` next to the input. It defaults to the fase of the block's last open task, else the first fase. Enter creates the task. A quick-add (or "+ Nueva tarea") **never starts a tramo**: it writes no stage row. The project keeps showing in "Listos para iniciar" / "Próximos" until it is started from the sheet (B1).
- **"Agregar fases"** (B1): a block-header action (`Button variant="ghost" size="sm"`, users with `canCreateActivity`). It opens the same `StartTramoSheet` for that project and this tramo, so fases left out at start, or tasks quick-added before a start, can get their template tasks later. The sheet lists only fases whose template tasks don't exist yet.
- **Removed:** "Iniciar plantilla de …" button and `NewProjectTemplateModal`, the `missingWorkflow` alert copy that pointed to Configuración → Workflows, and the inline "Otro..." + `window.prompt` fase editor.
- **States:**
  - Loading: the RSC renders with data. Client refetches show `DataTable isLoading` skeleton rows. The cards show a `Skeleton` line while `fetchTramoBoardAction` reloads.
  - Empty:
    - No ready projects: the card says "No hay proyectos listos para iniciar {tramo}."
    - No upcoming: the section is hidden.
    - No blocks: "Sin tareas en {tramo}." With filters: "No hay tareas que coincidan con los filtros actuales."
  - Error: the initial load fails silently to empty, and the client hydrates itself (existing pattern). Action errors show an inline `Alert` at the top of the page, replacing today's `window.alert`, with copy from §9.
  - Unknown slug: `notFound()`.

### 3.2 `/actividades/general`

- Same files and server data: `fetchTasksAction()` for every tramo, plus `fetchWorkflowsAction()` for every tramo's fases.
- **One block per project, always.** The "Proyecto / Actividad" selector and its storage key `cincel.actividades.general.groupBy.v1` are removed (the client deletes the key once). The "Sin área" group is removed.
- **Block header:** the project name plus tramo chips (`TramoChips`), one per started tramo in tramo order. The current tramo uses `Badge` (default variant), the other open tramos `variant="outline"`, and closed tramos `variant="outline"` with a check icon and `aria-label="{tramo}, cerrado"`.
- **Columns:** selection, Tramo (`TramoBadge`), Fase, Tarea, Checklist, Responsable, Equipo, Estado, Compromiso, Próxima revisión, Fecha de entrega, actions. Rows are sorted by tramo order, then fase order.
- No "Listos para iniciar" or "Próximos" sections, and no fase strip. Admin tasks don't appear here (they live in "Para administración").
- Empty: "No hay tareas." / filter copy as above.

### 3.3 Iniciar tramo sheet (opened from 3.1)

The full behavior is in §4.3. Data comes from `previewStartTramoAction(projectId, workflowId)` when the sheet opens. Submitting calls `startTramoAction(input)`, and the toast's "Deshacer" calls `undoStartTramoAction(batchId)`.

### 3.4 `/proyectos`

- **Files:** `app/proyectos/page.tsx` (RSC, unchanged), `app/proyectos/ProyectosClient.tsx` (CC), `components/proyectos/ProjectCreateModal.tsx` (CC), and `lib/proyectos/use-projects-data.ts`.
- **Server data:** `fetchProjectsAction()`. `client` comes back `null` for non-admins.
- **"+ Nuevo proyecto"** opens the `Sheet` with a single field, "Nombre del proyecto". Submit "Crear proyecto" ("Creando…" while pending) calls `createProjectAction({ name })`, then navigates to the ficha (existing behavior).
  - Sheet description: "Solo necesitas el nombre. Presale se inicia automáticamente." When Presale's auto-start is off, the second sentence is omitted. The sheet reads that setting from the result of `fetchWorkflowsAction` in the RSC, passed down as `presaleAutoStart`.
  - Validation: empty → "El nombre del proyecto es obligatorio." `NAME_TAKEN` → "Ya existe un proyecto con ese nombre." Both render as inline `aria-describedby` text under the field.
  - Client, Etapa inicial, Tipo, Encargado and Fecha de inicio leave the create sheet. They stay editable in the ficha.
- **Columns:** selection, Proyecto, Tramo, Fase activa, Encargado, Tareas abiertas, Estado, Cliente (admins only), row actions. Encargado and Estado are kept from today; Tramo replaces Etapas, and Fase activa is new (RD-6).
  - Tramo: `TramoBadge` of the current tramo. When the project has none (`needsTramo`), admins see a `Badge variant="destructive"` "Asignar tramo" that links to the ficha's Tramos card, and others see "Sin tramo".
  - Fase activa: `activePhase.name`, else "—".
  - Cliente: name, or `Badge variant="destructive"` "Por asignar" when null. The column isn't in the column defs at all for non-admins.
- **Export:** Proyecto, Tramo, Fase activa, Encargado, Tareas abiertas, Estado, plus Cliente for admins only.
- **States:** existing `DataTable isLoading` and empty messages.

### 3.5 `/proyectos/[id]/ficha`

- **File:** `app/proyectos/[id]/ficha/page.tsx` (CC page, unchanged pattern).
- **Data:** `fetchProjectAction(id)` (for admins it includes `mondayImport`), `fetchTasksAction({ projectId })`, `fetchWorkflowsAction()`, `fetchProjectSpacesAction(id)`, and for admins `fetchContactsAction({ type: "cliente" })` and `fetchStaffAction()`.
- **Changes:**
  - Header line "Cliente: …" renders for admins only. When no client: `Badge variant="destructive"` "Por asignar" plus a link "Asignar".
  - The edit form's Cliente select becomes optional ("Sin cliente") and adds **Origen**: a text input plus "Quién trajo el proyecto", a staff `Select` with "Nadie del equipo". Both are admin-only. The form drops the "Fases (puedes elegir varias)" checkboxes and the `projectPhaseOptions` helper.
  - While the project has no client, a hint sits under Cliente: "Al asignar el cliente se cierra la tarea «Asignar cliente y origen»." Origin is optional. After saving a client, the ficha refetches the project and its admin tasks, and the backend has already closed that task (RD-10).
  - **"Reacomodar importación"** (admins only): a header action, `Button variant="outline"`, shown only when `project.mondayImport` is set (the project came from monday). It opens `RemapImportSheet` (§4.6, item 10).
  - The "Etapas" card becomes **"Tramos"**. It lists the started tramos (name, "Iniciado el {fecha}" or "Cerrado el {fecha}"). A tramo closes automatically when all its live tasks are closed, and reopens if one reopens; there's no manual close button. It also has a `Select` "Tramo actual" limited to started tramos that calls `setProjectCurrentTramoAction`. A "Iniciar {tramo}" link (any tramo not started yet, ready or not) goes to `/actividades/{key}?project={id}`, which opens the sheet directly (B1).
  - **"Asignar tramo"** (admins only): shown when the project has no current tramo (`needsTramo`) or has tasks without a tramo. It's a `Select` of active tramos plus "Iniciar". A tramo not started yet goes through the same deep link and sheet. A started one is set as current with `setProjectCurrentTramoAction`. Tasks without a tramo are listed under "Sin tramo" in the task list, each one fixable from the drawer (§4.3 `TaskDrawer`). The "Aplicar workflow" select, its preview and `applyWorkflowAction` are removed.
  - **New "Espacios" card** (`ProjectSpacesCard`): an ordered list with drag reorder, inline rename, "+ Agregar espacio" and delete with an `AlertDialog`: "Las tareas de {espacio} quedarán sin espacio." Empty state: "Sin espacios. Agrega espacios como «Depto 201» o «Planta baja» para filtrar tareas."
  - The task list groups by **Tramo → Fase**, replacing "group by free-text phase in order of first appearance". Tasks without a fase go last as "Sin fase · revisar".
  - Admins also get an "Administración" group with the project's admin tasks.
  - **Bitácora** (`ProjectBitacoraCard`): for non-admins the server drops history events about `clientId`, `origin` and `originStaffId`, so they never render (B2). The card shows what it receives.
  - **Datos de monday** (`ImportDataPanel`): for non-admins the monday client column values are removed from a project's import data (B2).
- **Accepted exception (B2):** `/proyectos/[id]/clientes` shows the client's portal contacts to `portal.manageAccess` users, who aren't all administrators. The client is implied there by design (brief §1).
- **Portal gating:** while `client` is null, the Clientes tab stays visible to `portal.manageAccess` users. `InvitePortalClientSheet` and `PortalClientFolderHint` are replaced by an `Alert`: "Asigna un cliente al proyecto para invitarlo al portal y crear su carpeta." Non-admins with portal rights see the same alert without the link.

### 3.6 `/dashboard`

- **File:** `app/dashboard/DashboardClient.tsx`.
- "Proyectos por departamento" → **"Proyectos por tramo"**: active projects grouped by **current** tramo. Projects without a tramo are counted as "Sin tramo" (neutral). Colors come from `tramoColorVar(workflow)` (§4.5). `projectsByArea` in `lib/dashboard/donut-groups.ts` becomes `projectsByTramo`.
- "Requiere atención" and "Revisiones próximas" tables: column "Área" → "Tramo" (`TramoBadge`), "Sin área" → "Sin tramo". Admin tasks show "Administración" in plain text.
- **"Para administración"** card (`AdminTasksCard`), admins only. Data is `fetchAdminTasksAction()`, loaded client-side after first paint so the RSC stays shared.
  - Rows: project, task, responsable, commitment date. "Ver todas →" links to the Presale page.
  - Empty: "Nada pendiente para administración."

### 3.7 `/mis-tareas`

- Column "Departamento" → **"Tramo · Fase"**, as text "Diseño · Ejecutivo". Tramo only: "Diseño". Admin task: "Administración". No tramo: "—".
- Search also matches fase name and espacio.

### 3.8 `/tablero`

- **File:** `app/tablero/TableroClient.tsx`.
- Tabs: "Todos" plus one per active workflow, from the `workflows` prop (no `DEPARTMENTOS`). The filter stays `fetchBoardAction({ workflowId })`.
- Cards show "Tramo · Fase" as the secondary line.
- Brief rule 14 ("board uses the current tramo"): when "Todos" is selected, each card shows a muted "Tramo actual del proyecto: {tramo}" line only if the task's tramo isn't the project's current one.

### 3.9 `/calendario`

- **Files:** `components/calendario/UnifiedCalendar.tsx`, `lib/calendar/calendar-service.ts`, `lib/calendar/ics.ts`, `lib/types/calendar.ts`.
- Filter "Etapa: Todas" → **"Tramo: Todos"**. A new filter **"Fase: Todas"** lists the selected tramo's fases. It is disabled until a tramo is picked, with the tooltip "Elige un tramo para filtrar por fase".
- Agenda table: column "Etapa" → "Tramo", and "Actividad" → "Tarea". The ICS description line "Etapa: …" → "Tramo: … · Fase: …".
- `CalendarEvent` gains `phaseId`, `phaseLabel`. `stage` / `stageLabel` are renamed `tramo` / `tramoLabel`.

### 3.10 `/equipo`

- **Files:** `app/equipo/EquipoClient.tsx`, `components/equipo/MemberEditorDrawer.tsx`.
- **Columns:**
  - Colaborador.
  - **Puestos**: badges, "Sin puesto" when empty.
  - **Fases candidatas**: comma list "Ejecutivo, Proyecto Estructural", truncated to two with "+N" and a `Tooltip` listing all as "{tramo} · {fase}".
  - **Acceso**: the access role, which today wrongly sits under "Puesto".
  - Carga, Disponibilidad, Último acceso, Emergencia (unchanged).
  - The "Área" column is removed.
- **Drawer:**
  - The free-text "Puesto" field and the "Áreas" multiselect are replaced by **"Puestos"**: `TeamMultiSelect` over the catalog, saved with `setStaffPositionsAction`. Below it, a read-only line "Fases candidatas: …" derived live from the selected puestos.
  - "Acceso" stays as is.
  - Google-managed members: Puestos is read-only with `GoogleManagedBadge`, the same as Acceso today.
  - Empty catalog: "Aún no hay puestos. Créalos en Configuración → Puestos." (link, admins only).
- Drag reorder is gated by `team.canEditCollaborator` (today `areasCapabilities.canManageAreas`).

### 3.11 `/configuracion/tramos` (Tramos y fases, new)

- **Files:** `app/configuracion/tramos/page.tsx` (RSC) and `app/configuracion/tramos/TramosClient.tsx` (CC; replaces `app/configuracion/workflows/WorkflowsClient.tsx`). Also `components/configuracion/WorkflowTemplateDrawer.tsx` (renamed `TemplateTaskDrawer`) and the new `components/configuracion/PhaseEditorDrawer.tsx`.
- **Data:** `fetchWorkflowsAction({ includeInactive: true, includeInactiveTemplates: true, includeInactivePhases: true })`.
- **Layout:**
  - `PageHeader` "Tramos y fases", description "Fases, tareas de plantilla e inicio automático de cada tramo."
  - `Tabs` per tramo. Per tramo:
    1. **Inicio**: a `Switch` "Iniciar automáticamente", saved through `setWorkflowAutoStartAction`. Helper text depends on the tramo:
       - First tramo: "Se inicia al crear un proyecto."
       - Others: "Se inicia solo cuando el proyecto está listo ({fase} de {tramo anterior} completada). Si está apagado, el proyecto aparece en «Listos para iniciar»."
       - The readiness rule is read-only text: fixed in code (RD-4).
    2. **Fases**: a `DataTable` with columns Orden (drag), Fase, Tareas de plantilla (count), Estado ("Activa" / "Inactiva" badge), and actions (Editar, Desactivar / Activar).
       - "+ Nueva fase" opens `PhaseEditorDrawer`, which has one field, "Nombre".
       - Errors: `NAME_TAKEN` → "Ya existe una fase con ese nombre en {tramo}." `IN_USE` on deactivate isn't an error: deactivating hides the fase from selects and keeps it on existing tasks.
    3. **Tareas de plantilla**: the existing templates table with columns # · Tarea · Fase · Prioridad · Estado, grouped visually by fase order.
       - Seeded titles come from the former TS templates with spelling fixed in the seed: "Reporte Estado Actual" (was "Resporte"), "Plano de distribución" (was "distribicion"), "Supervisión de trabajos" (was "Supervicion"), and accents restored ("Cálculos", "Proyecto Arquitectónico"). Admins can still rename any of them here. A title must be unique within its fase (`NAME_TAKEN` → "Ya existe una tarea de plantilla con ese nombre en {fase}.").
       - The drawer's "Fase" input becomes a `Select` of the tramo's active fases. It's required, so a template always has a fase. There's no "Otro…".
       - "+ Nueva tarea de plantilla" replaces "+ Nueva plantilla".
- **Copy:** "Workflow: {name}" in the drawer → "Tramo: {name}". Empty tramos: "Este tramo aún no tiene fases."
- Non-admins can't reach the route (redirect to `/dashboard`, same as the other Configuración pages).

### 3.12 `/configuracion/puestos` (new)

- **Files:** `app/configuracion/puestos/page.tsx` (RSC), `app/configuracion/puestos/PuestosClient.tsx` (CC), `components/configuracion/PositionEditorDrawer.tsx`.
- **Data:** `fetchPositionsAction()`, `fetchWorkflowsAction()` (fases grouped by tramo).
- **Table columns:** Orden (drag), Puesto, Fases candidatas (badges "Diseño · Ejecutivo"), Integrantes (count), actions (Editar, Eliminar).
- **Drawer:** "Nombre" plus "Fases candidatas", a checkbox list grouped by tramo with headings in tramo order and fases in catalog order. Saving calls `createPositionAction` or `updatePositionAction`, then `setPositionPhasesAction`.
- **Delete:** an `AlertDialog` with "¿Eliminar el puesto {nombre}? {n} integrantes lo perderán." The Google mapping case returns `IN_USE`, shown as "Este puesto se asigna desde un grupo de Google. Quita el grupo en Configuración → Google primero."
- **Empty:** "Aún no hay puestos." The seed list is created by the migration, so this is rare.
- **Hint line** under the header: "Los candidatos solo se sugieren al asignar tareas; cualquiera puede asignarse."

### 3.13 `/configuracion/estatus`

- **File:** `app/configuracion/estatus/EstatusClient.tsx`.
- New column **"Cuenta como completada"** (Sí / No). In the editor, a `Switch` with the same label. It's enabled only when "Cierra la tarea" is on and resets to off when "Cierra la tarea" is turned off.
- Helper text: "Apágalo para estatus como Cancelado: cierran la tarea pero no cuentan como trabajo terminado."
- The seeded "Cancelado" (cierra, no cuenta) and "En espera" (abierto) appear like any custom status.

### 3.14 `/configuracion/google`

- **Files:** `components/configuracion/GoogleGroupMappings.tsx`, `GoogleSetupWizard.tsx`, `app/configuracion/google/primeros-pasos/page.tsx`.
- `KIND_LABELS = { role: "Rol", position: "Puesto" }`. The "Área" select becomes a "Puesto" select fed by `fetchPositionsAction()`, and the `areas` prop becomes `positions`.

### 3.15 `/configuracion/importar-monday`

Covered in §4.6.

### 3.16 Sidebar (every page)

- `components/layout/Sidebar.tsx`: the Actividades submenu becomes "General" plus one entry per active workflow, in `sortOrder`, with the label `workflow.name`.
  - It loads once on mount through `fetchTramosNavAction()`. While loading, it shows three `Skeleton` rows, and on error only "General".
- The old hardcoded sidebar and tab label for this tramo goes away. The Diseño tramo shows as **"Diseño"** everywhere (sidebar, tabs, chips, page title), from `workflows.name` (RD-8).
- Configuración submenu: General, Permisos, **Puestos**, Estatus, **Tramos y fases**, Google, Importar de monday. "Áreas" and "Workflows" are gone.

### 3.17 Directorio client sheet (B2)

- **File:** `components/directorio/ClientDetailSheet.tsx`.
- For non-admins, `fetchContactAction` returns `projects: []` and `stats` with counts only. The "Proyectos" section then shows only the count line "{n} proyectos activos", with no project names or links.
- Admins see the project list as today.
- Empty for admins: "Sin proyectos."

---

## 4. Component architecture

### 4.1 Layout

| Component | Path | Change |
|---|---|---|
| `Sidebar` | `components/layout/Sidebar.tsx` | Tramo submenu from `fetchTramosNavAction`; Configuración entries (§3.16) |
| `Toaster` | `app/layout.tsx` | Mount shadcn `sonner` `<Toaster position="bottom-right" />` once (new; §10) |

### 4.2 Pages (client roots)

`ActividadesClient` (3.1/3.2), `ProyectosClient`, ficha page, `DashboardClient`, `MisTareasClient`, `TableroClient`, `UnifiedCalendar`, `EquipoClient`, `TramosClient` (new), `PuestosClient` (new), `EstatusClient`, `MondayImportWizard`. All keep the existing pattern: initial props from the RSC, then local `useState` and refetch through actions.

### 4.3 Feature components: Actividades and tasks

**`StartTramoSheet`** (new): `components/tareas/StartTramoSheet.tsx`

```ts
interface StartTramoSheetProps {
  open: boolean;
  projectId: string | null;
  workflow: WorkflowRef;            // the tramo of the page
  viewerId: string;
  isAdmin: boolean;                 // shows the auto-start checkbox
  staff: Array<Staff & { suggested: boolean }>;
  onClose: () => void;
  onStarted: (result: StartTramoResult) => void;  // parent refreshes and shows the toast
}
```

- **State:** local.
  - Data: `preview: StartTramoPreview | null`, `checkedPhaseIds: Set<string>`.
  - Assignment: `mode: "self" | "by_phase" | "none"`, `managers: Record<phaseId, staffId | null>`.
  - Auto-start and status: `autoStart: boolean`, `error`, `isPending` (`useTransition`).
- **Effect:** when `open && projectId`, call `previewStartTramoAction(projectId, workflow.id)`. Cancel stale responses with a `cancelled` flag, as in `ActividadesClient`.
- **Render** (`Sheet`, right side, `sm:max-w-xl`):
  - **Title and description:** "Iniciar {tramo} · {proyecto}". Description: "Elige las fases contratadas y quién las hará."
  - **Fases** (`fieldset` with `legend` "Fases"): one row per fase in catalog order.
    - Each row has a `Checkbox` labelled "{fase} · {n} tareas", plus up to three sample task names in muted text ("Planos de conjunto, Fachadas, Cortes y 4 más").
    - It also shows a candidate line: "Candidatos: Ana López (Proyectista ejecutivo), Luis P." or "Sin candidatos".
    - Only fases with template tasks still to create are listed (B1). Fases whose tasks all exist are left out, and a muted line under the list names them: "Ya tienen sus tareas: Anteproyecto, Ejecutivo."
    - All other fases are checked by default.
  - **Asignación** (`RadioGroup`, `legend` "Asignación"):
    - "Asignarme todas" (default for non-admins).
    - "Por fase con candidatos". Each checked fase row then gets a responsable `Select` with the groups "Candidatos" (the fase's candidates, sorted by lower open-task load) and "Todo el equipo". It's preselected with the first candidate, else empty ("Sin asignar"). Any staff can be picked: candidates are suggestions.
    - "Sin asignar".
  - **Admins only:** a `Checkbox` "Iniciar {tramo} automáticamente en los próximos proyectos", initialized from `preview.autoStart`. Its helper text says it changes the setting for the whole firm.
  - **Footer:** "Cancelar" and a primary "Crear {N} tareas", where N is the sum of the checked fases' new templates. The button is disabled when N = 0 or while pending ("Creando…").
- **Submit:** `startTramoAction({ projectId, workflowId, phaseIds, assignment, autoStart })`. `autoStart` is sent only when an admin changed it. On success → `onStarted(result)` and close.
- **Nothing to create:** when `preview.alreadyStarted` and no fase has new templates, the body is an `Alert`: "{tramo} ya está iniciado en {proyecto} y no hay tareas nuevas que crear." The only button is "Cerrar".
- **Errors:** inline `Alert variant="destructive"` in the sheet (copy in §9).
- **Loading:** three `Skeleton` fase rows. Load error: `Alert` "No se pudo cargar la plantilla de {tramo}." with a "Reintentar" button.
- **Toast** (in `ActividadesClient.onStarted`): `toast("Se crearon {n} tareas de {tramo} en {proyecto}.", { action: { label: "Deshacer", onClick }, duration: 10000 })`.
  - "Deshacer" calls `undoStartTramoAction(batchId)`. Success → toast "Se deshizo el inicio de {tramo}." and refresh. `TOUCHED` → toast "No se puede deshacer: ya se editó una de las tareas creadas."
  - `n = 0` (only the stage row was opened) → toast "{tramo} iniciado en {proyecto}." with no Deshacer.
  - After the 10 s toast closes, undo stays available on the project block as **"Deshacer inicio"** until any created task is edited (RD-7):
    - It's a `Button variant="ghost" size="sm"` in the block header of `/actividades/[tramo]`, shown when `TramoBoard.started[]` has `canUndo: true` for that project.
    - It opens an `AlertDialog`: "¿Deshacer el inicio de {tramo} en {proyecto}? Se eliminarán las {n} tareas creadas." Confirming calls `undoStartTramoAction(batchId)` and then refreshes.
    - `TOUCHED` (a task was edited meanwhile) shows the inline page `Alert` with the copy from §9 and hides the button after the refresh.
    - Drag-and-drop counts as an edit. Reordering tasks inside the project block rewrites every task's order, and moving a card to another status column on Tablero changes it. Either one ends the undo window for the batch, so "Deshacer inicio" disappears after the next refresh. The `AlertDialog` doesn't warn about this; the button is simply gone.

**`ReadyToStartCard`** (new): `components/tareas/ReadyToStartCard.tsx`

```ts
interface ReadyToStartCardProps {
  workflow: WorkflowRef;
  ready: TramoCandidateProject[];
  canStart: boolean;
  onStart: (projectId: string) => void;
}
```

Presentational. A `Card` with a `CardHeader` "Listos para iniciar ({n})". Rows are a list (`ul`), with "Iniciar" as `Button size="sm" variant="outline"` and `aria-label="Iniciar {tramo} en {proyecto}"`. If `?project={id}` is in the URL, `ActividadesClient` opens the sheet for that project on mount **whether or not it is ready**, since the backend doesn't require readiness to start (B1). This is the deep link from the ficha's "Iniciar {tramo}" and "Asignar tramo". The sheet's "alreadyStarted" state covers a tramo that is already started.

**`UpcomingProjects`** (new): `components/tareas/UpcomingProjects.tsx`. Props `{ upcoming: TramoCandidateProject[] }`. An `Accordion` with one item, collapsed. Presentational.

**`PhaseStrip`** (new): `components/tareas/PhaseStrip.tsx`. Props `{ phases: WorkflowPhaseRef[]; openByPhase: Record<string, number> }`. Renders the fase names joined by "·" and a `LoadBar`. Fases with open tasks use `text-foreground`, the rest `text-muted-foreground`.

**`TramoChips`** (new): `components/tareas/TramoChips.tsx`. Props `{ tramos: ProjectTramo[] }`. Badges as in 3.2.

**`AdminTasksCard`** (new): `components/tareas/AdminTasksCard.tsx`

```ts
interface AdminTasksCardProps {
  initialTasks?: TaskListItem[];   // RSC-provided on Presale; omitted on the dashboard (self-fetch)
  limit?: number;                  // dashboard: 5
  onOpenTask?: (id: string) => void;
}
```

- Self-fetches `fetchAdminTasksAction()` when `initialTasks` is undefined.
- Rows: project link, title, responsable, commitment date with `text-destructive` when late, and a status cell (`TaskStatusCell`).
- "+ Tarea de administración" opens `NewTaskModal` in admin mode (no fase, no tramo) and creates with `createAdminTaskAction`.
- Responsable pickers for admin tasks (this card, the modal in admin mode, the drawer, inline cells) list **administrators only**. The list is `staff` filtered by access "Administrador", with "Sin responsable" allowed (RD-12).
- Renders nothing for non-admins. That check is client-side for layout only; the action also refuses.

**`NewTaskModal`** (changed): `components/tareas/NewTaskModal.tsx`

```ts
export type NewTaskFormValues = {
  projectId: string;
  phaseId: string | null;      // was phase: string
  spaceId: string | null;      // new
  title: string;
  managerId: string | null;
  supportIds: string[];
  notes: string;
  commitmentDate: string;
  reviewDate: string;
};
type Props = {
  open: boolean;
  mode?: "tramo" | "admin";               // admin: hides Fase and Espacio
  projects: ProjectOption[];
  staff: StaffOption[];
  phases: WorkflowPhaseRef[];             // the tramo's active catalog (was phaseOptions: string[])
  spacesByProject: Record<string, ProjectSpaceRef[]>;
  onClose: () => void;
  onSave: (task: NewTaskFormValues) => void;
};
```

- **Fase:** a `Select` over `phases` only. It's required in tramo mode and defaults to the first fase. There's no "Otro…" and no free-text default "Inicial".
- **Espacio:** a `Select` "Espacio" ("Sin espacio" + list), shown only when the selected project has espacios. It resets to "Sin espacio" when the project changes.
- **Admin mode** title: "Nueva tarea de administración". The Responsable and Equipo pickers list administrators only.

**`ActividadesClient` Fase cell** (changed). The inline editor becomes a `Select` of the **task's own tramo** fases: `workflowsById[task.workflowId].phases`, active only, plus the task's current fase if it's inactive, shown as "{fase} (inactiva)". Saving calls `updateTaskAction(id, { phaseId })`. "Sin fase · revisar" displays in `text-muted-foreground`. Fase editing is gated by `canReorderPhases` (unchanged capability name).

**`TaskDrawer`** (changed): `components/tareas/TaskDrawer.tsx`. The header chip shows "{tramo} · {fase}" (or "Administración"), and adds an "Espacio" chip when set. New optional props:

```ts
phases?: WorkflowPhaseRef[];                 // the task's tramo catalog; enables the Fase select
spaces?: ProjectSpaceRef[];                  // the task's project espacios; enables the Espacio select
onChangePhase?: (phaseId: string | null) => void;
onChangeSpace?: (spaceId: string | null) => void;
```

When the callbacks are given, the chips become `Select`s in the drawer's detail section, labelled "Fase" and "Espacio". The parent calls `updateTaskAction`.

A non-admin task whose tramo is null (legacy rows the migration couldn't infer) also shows a **"Tramo"** `Select` of the active tramos. It's enabled for `canReorderPhases` and its prop is `onChangeTramo?: (workflowId: string) => void`. Choosing one calls `updateTaskAction(id, { workflowId })`, and the Fase select then lists that tramo's catalog. Once a task has a tramo, the Tramo select isn't shown again.

**Removed:** `components/tareas/NewProjectTemplateModal.tsx`, `lib/actividades/departamento.ts` (`DEPARTMENTOS`, `phasesFor`, `departamentoSlugFor*`), `lib/templates/{presale,diseno,operativas}.ts`, and `lib/proyectos/phases.ts` (`projectPhaseOptions`, `normalizePhases`). Deep links that used `departamentoSlugForStage` / `departamentoSlugForWorkflow` use `workflow.key` directly (`/actividades/${task.workflow.key}`).

### 4.4 Feature components: Proyectos, Equipo, Configuración

- **`ProjectCreateModal`** (changed): props are unchanged in shape (`onClose`, `onConfirm: (input: ProjectCreateInput) => Promise<void>`) plus `presaleAutoStart: boolean`. Local state: `name`, `error`, `saving`. No fetches on mount any more (contacts, workflows and staff are gone).
- **`ProjectSpacesCard`** (new): `components/proyectos/ProjectSpacesCard.tsx`.
  ```ts
  interface ProjectSpacesCardProps { projectId: string; initialSpaces: ProjectSpace[]; canEdit: boolean }
  ```
  Local list state and calls to the espacios actions (§7.4). Rename is inline (`InlineEditable`). Reorder is by drag through the same `onReorderRows` that `DataTable` already supports.
- **`ProjectTramosCard`** (new, extracted from the ficha): `components/proyectos/ProjectTramosCard.tsx`.
  ```ts
  interface ProjectTramosCardProps { project: ProjectDetail; workflows: WorkflowRef[]; canChangeTramo: boolean; onChanged: (p: ProjectDetail) => void }
  ```
  `canChangeTramo` = `projects.canChangeProjectStage` (capability name kept).
- **`ProjectAdminFields`** (new): `components/proyectos/ProjectAdminFields.tsx`. Cliente, Origen and "Quién trajo el proyecto". It renders only for admins and saves through `updateProjectAction(id, { clientId, origin, originStaffId })`.
- **`MemberEditorDrawer`** (changed): `areaOptions: Area[]` → `positionOptions: Position[]`. `draft.areaIds` → `draft.positionIds`. The free-text "Puesto" input (bound to `staff.role`) is removed: `staff.role` holds the access role only, edited through "Acceso", and puestos live in their own tables (RD-9).
- **`PositionEditorDrawer`** (new): `components/configuracion/PositionEditorDrawer.tsx`.
  ```ts
  interface PositionEditorDrawerProps {
    open: boolean; position: Position | null;  // null = new
    workflows: WorkflowDetail[];               // fases grouped by tramo
    onClose: () => void; onSaved: (p: Position) => void;
  }
  ```
- **`PhaseEditorDrawer`** (new): `components/configuracion/PhaseEditorDrawer.tsx`.
  ```ts
  interface PhaseEditorDrawerProps { open: boolean; workflow: WorkflowRef; phase: WorkflowPhase | null; onClose: () => void; onSaved: (p: WorkflowPhase) => void }
  ```
- **`TemplateTaskDrawer`** (renamed from `WorkflowTemplateDrawer`): `draft.phase: string` → `draft.phaseId: string`. It gains a `phases: WorkflowPhaseRef[]` prop.
- **Removed:** `app/configuracion/areas/AreasClient.tsx`, `components/configuracion/AreaEditorDrawer.tsx` (+ test), `app/configuracion/workflows/WorkflowsClient.tsx`, `lib/actions/areas-actions.ts` (backend), and `lib/areas/area-color.ts` (moved, §4.5).

### 4.5 Shared / ui

- **`TramoBadge`** (renamed from `components/v2/status/AreaBadge.tsx` to `TramoBadge.tsx`): `{ tramo: WorkflowRef | null }`.
  - Renders an outline `Badge` with a color dot and the name, so color is never the only cue. `null` renders "Sin tramo" muted.
  - The dot is allowed under the dashboard data-widget exception and in tables already using it today.
- **`lib/tramos/tramo-color.ts`** (moved from `lib/areas/area-color.ts`): `tramoColorSlot(w: { key: string; sortOrder: number }): 1|2|3|4|5|null`. It keeps today's mapping by key (`presale` 1, `diseno` 2, `construccion` 3), else `sortOrder` 1..5. It exports `tramoColorClass` and `tramoColorVar`. There's no color column in the DB.
- **`tramoPhaseLabel(task)`** in `lib/tasks/labels.ts` (new): returns "Diseño · Ejecutivo", "Diseño", "Administración" or "—". It's used by Mis tareas, Tablero, Calendario, the drawer and exports.

### 4.6 Feature components: monday import wizard

Files are in `components/configuracion/monday-import/*`, `lib/monday-import/*` and `scripts/monday/mapping.schema.ts`. Each change below names the brief §4 item it implements.

1. **Group targets** (§4.1). File: `GroupTargetsTable.tsx` with `lib/monday-import/group-targets.ts`. Each group's `ChoiceSelect` offers these options, in this order:
   - `Tramo «Presale»`, `Tramo «Diseño»`, `Tramo «Construcción»`: the group's tasks go to that tramo, and their fase is resolved per task (item 3).
   - `Fase «{fase}» · {tramo}`: every active fase of every tramo, grouped by tramo.
   - `Espacio «{grupo}»`: a project espacio named after the group. The group's tasks take that espacio, and their tramo and fase resolve per task.
   - `Proyecto aparte «{grupo}»`: board_as_project boards only. The optional client select per group stays.
   - `Tareas de administración`: the group's items become admin tasks (no tramo, no fase). Default for groups titled "Administrativo".
   - `Ignorar`: shows "Los elementos de este grupo no se importan."
   - Removed options: "Fase nueva «…» del proyecto", "Fase «…» de workflow" (as free-text phase) and "Etapa «…»".
   - **Defaults:** case- and accent-insensitive matching.
     - Group title = tramo name → Tramo. Title = fase name of the board's tramo (else of any tramo) → Fase.
     - "Administrativo" → Tareas de administración.
     - Otherwise → the board's tramo.
   - The table header changes to "Grupo de monday · En Cincel". The "Grupo como proyecto" suggestion `Alert` stays.
2. **Board-level selects** (§4.2). In `EquivalenciasStep.tsx`, the section "Grupos, departamento y workflow" becomes **"Grupos y tramo"**.
   - "Departamento" and "Workflow" are removed. One select remains: **"Tramo del tablero"**, the tramo for groups and items that don't resolve one. It's required only when no group targets a Tramo or Fase. When missing, the board card chip shows "Elige un tramo."
   - `TaskAreaWorkflowSection.tsx` and `lib/monday-import/task-areas.ts` are deleted, along with "Área y workflow de las tareas" and "Área sin equivalente".
3. **Task fase** (§4.3). The section "Plantillas del workflow" becomes **"Tareas de plantilla"**.
   - Each item shows its matched template task (the select stays for overrides) and the resulting "Tramo · Fase".
   - Items with no match and no fase-name match show `Badge variant="outline"` **"Sin fase · revisar"**.
   - There's no UI to create a fase from a group.
4. **Client optional** (§4.4). At `EquivalenciasStep.tsx:432` the title "Cliente (obligatorio)" becomes **"Cliente (opcional)"**.
   - New description: "Sin cliente, cada proyecto se crea con la tarea de administración «Asignar cliente y origen»."
   - Removed: the destructive "Faltan clientes" alerts, "Sin cliente: … la Vista previa no dejará importar", the "(sin cliente)" suffix in the board picker, and `lacksClient` / `boardsWithoutClient` as blockers. `boardProblems` drops "Sin cliente.".
   - "Nuevo contacto" and "relation column" still work.
5. **Firm-wide status map** (§4.5).
   - **New `StatusMapTable`** (`components/configuracion/monday-import/StatusMapTable.tsx`), shown in two places:
     - As the first section of `EquivalenciasStep`, "Estatus de monday", with the description "Se guarda para todo el despacho y se usa en esta y en las próximas importaciones."
     - Inside `BoardMappingSheet`, filtered to that board's labels, with the note "Cambiarlo aquí lo cambia para todos los tableros y para las próximas importaciones."
   - **Rows:** one per distinct monday label across the run's boards, keyed with the shared helper `statusLabelKey(label)` exported from `scripts/monday/mapping.schema.ts` (trim, lowercase, collapse inner whitespace). The UI never builds keys by hand. Columns: Etiqueta, Elementos (count), **Estatus de Cincel** (built-ins + custom, with "Crear estatus…" inline as today), and **Prioridad** (`Select`: "Sin cambio", "Alta", "Media", "Baja").
   - **Prefilled defaults:**

     | monday label | Estatus de Cincel | Prioridad |
     |---|---|---|
     | En Proceso | En proceso | — |
     | Entregado, Confirmado | Completado | — |
     | Cancelado, No se Requiere | Cancelado | — |
     | En espera | En espera | — |
     | Importante, Siguiente Paso | Pendiente | Alta |
     | "-" | Pendiente | — |

   - Unknown labels default to Pendiente, flagged "Sin equivalente" (outline badge) until changed.
   - **Persistence (RD-5):** the map is a saved firm-wide setting, not part of one run.
     - `getMondayImportChoicesAction()` returns it as `choices.statusMap`, and the table starts from it. Labels seen before keep their saved choice. Labels not in the saved map get the default from the table above, else Pendiente + "Sin equivalente".
     - Each change is saved with `saveMondayStatusMapAction(entries)`. The `StatusMapTable` local state is optimistic and saves debounced 500 ms, the same cadence the wizard uses for draft saves. A status line "Guardado" / "Guardando…" sits under the table.
     - Save error: inline `Alert variant="destructive"` "No se pudo guardar el mapa de estatus." with "Reintentar". The local value is kept. `STATUS_NOT_FOUND` uses its §9 copy, and the affected row is marked `aria-invalid`.
     - Preview and apply always read the saved setting. The server snapshots it into the run's mapping at apply time, so the batch records what was used.
   - The per-board "Estatus" section (`StatusLabelRow` per column) is removed.
   - The "Crear estatus" inline form gains "Cuenta como completada" next to "Cierra la tarea".
6. **Dates** (§4.6). In `ColumnTarget` labels (`lib/monday-import/wizard-steps.ts`):
   - "Línea de tiempo" reads "Línea de tiempo → compromiso y entrega".
   - New target **"Fecha que finalizó"** (`closed_date`) → task `closed_at`, prefilled for columns titled like it.
7. **Titles** (§4.7). No UI control. Vista previa samples show the cleaned title, with the original monday name on the left (existing layout), so stripping is visible.
8. **People** (§4.8). `CreateStaffButton.tsx` becomes a two-step control. "Crear integrante" opens a `Popover` with a "Puesto" `Select` ("Sin puesto" + catalog).
   - The select is preselected with the suggestion from `suggestMondayPositionAction`, and the reason sits underneath: "Sugerido por sus tareas: 34 de 40 en Diseño · Ejecutivo."
   - "Crear integrante" in the popover calls `createMondayStaffAction(runId, userId, { positionIds })`.
   - Loading suggestion: `Skeleton` line. No suggestion: "Sin sugerencia: sus tareas no tienen fase." The same control appears in `PeopleStep` and in Vista previa's person issues.
9. **Grouped warnings** (§4.9). In `PreviewStep.tsx`, blocking issues stay as a list. Warnings become an `Accordion` with one item per issue code, titled with a count, collapsed by default. Titles:

   | Code | Title |
   |---|---|
   | `PERSON_UNMATCHED` | Personas sin equivalente ({n}) |
   | `STATUS_DEFAULTED` | Estatus sin equivalente ({n}) |
   | `DATES_MISSING` | Elementos sin línea de tiempo ({n}) |
   | `PHASE_UNRESOLVED` | Tareas sin fase ({n}) |
   | `CLIENT_MISSING` | Proyectos sin cliente ({n}) |
   | `ADMIN_ASSIGNEE_CLEARED` | Tareas de administración sin responsable ({n}) |
   | other | issue text |

   Blocking issues stay a flat list, but `PROJECT_NAME_TAKEN` is titled **"Proyectos con nombre repetido ({n})"**. It fires when a new project's name collides with a live project or another planned one, because names are unique across the firm. "Corregir" opens "Nombres y códigos de proyecto" on its board. `ADMIN_ASSIGNEE_CLEARED` is the warning that non-administrator assignees were dropped from admin tasks (they stay in the import data).

   - Each item keeps its "Corregir" link. `PERSON_UNMATCHED` items keep "Crear integrante".
   - Items skipped as already imported never produce warnings (backend). The counts tile "Ya importados" remains.
   - Sample details: "Workflow: …", "Área: …" and "Sin workflow" become "Tramo · Fase: …", "Espacio: …" and "Administración" (`sampleDetails`).
10. **Re-sort imported projects** (§4.10). The three known projects (Madrid 22, Guadalajara 83, Local Espiropapa) are re-sorted by a one-time script run with the data migration, so they need no UI. On top of that, admins get **"Reacomodar importación"** per imported project (RD-2):
    - **Entry point:** the project ficha header (§3.5), admins only, when `project.mondayImport` is set.
    - **`RemapImportSheet`** (new, `components/proyectos/RemapImportSheet.tsx`, right `Sheet`, `sm:max-w-3xl`). It loads `getMondayRemapAction(projectId)`, which returns the project's boards, each with its source groups and current targets, plus the choices.
      - Each board gets a section with its name as heading, the **"Tramo del tablero"** select, and the reused **`GroupTargetsTable`**.
      - The same six targets apply:
        - "Proyecto aparte" moves the group's tasks to the project named after the group; the preview shows that name.
        - "Ignorar" leaves the group's tasks untouched. A remap never deletes tasks or history.
    - **"Vista previa"** (`Button variant="outline"`) calls `previewMondayRemapAction(projectId, input)` and shows:
      - The counts as text: "{n} tareas cambian de tramo, {n} de fase, {n} de espacio, {n} pasan a administración, {n} sin cambios, {n} sin fase · revisar".
      - Up to 10 sample rows in a `Table` with columns Tarea · Antes · Después ("Tramo · Fase · Espacio").
      - Grouped issues, using the same `Accordion` grouping as `PreviewStep`.
    - **"Aplicar"** (primary) is enabled only after a preview of the current targets. Any target change clears the preview. It opens an `AlertDialog`, "¿Reacomodar {n} tareas de {proyecto}?", then calls `applyMondayRemapAction(projectId, input)`.
      - Success: close the sheet, refetch the ficha, and show an inline `Alert` "Se reacomodaron {n} tareas."
      - Errors: inline `Alert variant="destructive"` in the sheet.
    - Statuses, people, dates and titles aren't touched by a remap. It only re-sorts tramo / fase / espacio / project / admin.
    - **States:**
      - Loading: `Skeleton` table rows.
      - Load error: `Alert` "No se pudo cargar la importación de este proyecto." with "Reintentar".
      - Board missing from the stored export: that section shows "Este tablero ya no está en la exportación guardada; no se puede reacomodar." and is excluded from the input.
      - Every board missing (the stored export files are gone): the whole sheet body is an `Alert variant="destructive"` "Los archivos de la exportación de monday de este proyecto ya no están en el servidor. Vuelve a exportar sus tableros en Importar de monday para poder reacomodarlo." "Vista previa" and "Aplicar" aren't rendered.

Board cards (`lib/monday-import/board-cards.ts` `boardProblems`): drop the área and client problems. Add "Elige un tramo." and "{n} tareas sin fase." The latter is a warning that doesn't block the "listo" chip.

---

## 5. Server vs client components, and local state

(Replaces the template's Zustand section; there are no stores.)

| Surface | Server component (loads) | Client component (local state) |
|---|---|---|
| Actividades | `app/actividades/[tramo]/page.tsx`: workflows, tasks, tramo board, projects, assignable staff, admin tasks (Presale + admin) | `ActividadesClient`: `tasks`, `board` (`TramoBoard`), filters (+ `phaseFilter`, `spaceFilter`), `selected`, `startProjectId`, `selectedTaskId/Detail`, `pageError` |
| Iniciar tramo | none | `StartTramoSheet`: preview, checked fases, mode, managers, autoStart, pending/error |
| Proyectos | `app/proyectos/page.tsx`: projects; + `presaleAutoStart` from workflows | `ProyectosClient` (via `useProjectsData`), `ProjectCreateModal` (`name`, `error`, `saving`) |
| Ficha | none (client page today; unchanged) | project, tasks, spaces, workflows, draft |
| Dashboard | `app/dashboard/page.tsx`: projects | `DashboardClient`, `AdminTasksCard` (self-fetch) |
| Equipo | `app/equipo/page.tsx`: staff (now with positions) | `EquipoClient`: + `positionOptions` (replaces `areaOptions`) |
| Tramos y fases | `app/configuracion/tramos/page.tsx`: workflows with phases and templates | `TramosClient`: selected tramo, drawers, drafts |
| Puestos | `app/configuracion/puestos/page.tsx`: positions, workflows | `PuestosClient`: list, drawer draft |
| monday wizard | `app/configuracion/importar-monday/page.tsx` (unchanged) | `MondayImportWizard` draft mapping; `StatusMapTable` holds the firm-wide map (saved on change) |
| Reacomodar importación | none (opened from the ficha) | `RemapImportSheet`: remap state, per-board targets draft, preview (cleared on any change), pending/error |

Admin gating in client components uses `isAdmin = authenticatedUser?.access === SYSTEM_ADMIN_ROLE` (the check `Sidebar` and `EquipoClient` already use), wrapped as `canSeeAdminData(user)` in `lib/auth/permissions.ts` (§8). Server actions and DTOs enforce the same rule.

---

## 6. Data refresh and revalidation

(Replaces the template's query-key section.)

Client components refetch through the read actions after each mutation (existing pattern: `refresh()` in `ActividadesClient`). Actions also call `revalidatePath` so RSC payloads are fresh on the next navigation:

| Action | `revalidatePath` |
|---|---|
| `createProjectAction`, `updateProjectAction`, `setProjectCurrentTramoAction` | `/proyectos`, `/proyectos/{id}/ficha`, `/actividades` (layout), `/dashboard`, `/tablero` |
| espacios actions | `/proyectos/{id}/ficha`, `/actividades` (layout) |
| `startTramoAction`, `undoStartTramoAction` | `/actividades` (layout), `/proyectos`, `/proyectos/{id}/ficha`, `/dashboard`, `/tablero`, `/mis-tareas`, `/calendario` |
| task create/update (incl. `phaseId`, `spaceId`), `createAdminTaskAction` | existing paths + `/actividades` (layout), `/dashboard` |
| fase / template / auto-start actions | `/configuracion/tramos`, `/actividades` (layout), `/configuracion/puestos` |
| puesto actions, `setStaffPositionsAction` | `/configuracion/puestos`, `/equipo` |
| status actions | `/configuracion/estatus` (existing) |
| group mapping actions | `/configuracion/google` (existing) |

Client refetch after each mutation:

| Mutation | Client refetches |
|---|---|
| `startTramoAction` / `undoStartTramoAction` | `fetchTasksAction({ workflowId })`, then `fetchTramoBoardAction(workflowId)` |
| Fase change completing the readiness fase | `fetchTramoBoardAction` of the **next** tramo isn't on screen; nothing to do |
| Status change on any task on a tramo page | `fetchTramoBoardAction(workflowId)` (cheap; keeps "Próximos" counts honest) |
| Ficha client/origin save | `fetchProjectAction(id)` |

---

## 7. API contract (server actions the UI calls)

All are `"use server"` functions. Errors are thrown as `Error(code[: detail])` unless noted. The UI copy for each code is in §9. "Admin" = `canSeeAdminData` (§8).

### 7.1 Types (`lib/types/core.ts`)

```ts
export type TaskKind = "workflow" | "usuario" | "admin";
export type WorkflowAutoStart = "on_create" | "on_ready" | "manual";

export type WorkflowRef = { id: string; key: string; name: string; sortOrder: number };   // + sortOrder

export type Workflow = {
  id: string; key: string; name: string; description: string | null;
  active: boolean; sortOrder: number;
  autoStart: WorkflowAutoStart;                       // new
};

export type WorkflowPhaseRef = { id: string; name: string; sortOrder: number };
export type WorkflowPhase = WorkflowPhaseRef & {
  workflowId: string; active: boolean;
  templateCount: number;                              // active templates in this fase
};
export type WorkflowPhaseInput = { name: string; active?: boolean };

/** Read-only: when this tramo's projects become "Listos para iniciar". Null for the first tramo. */
export type TramoReadiness = { afterWorkflow: WorkflowRef; afterPhase: WorkflowPhaseRef } | null;

export type WorkflowDetail = Workflow & {
  phases: WorkflowPhase[];                            // catalog order
  templates: WorkflowTaskTemplate[];
  readiness: TramoReadiness;
  // `areas` removed
};

export type WorkflowTaskTemplate = {
  id: string; workflowId: string;
  phaseId: string; phaseName: string;                 // was phase: string | null
  title: string; notes: string | null; defaultPriority: TaskPriority;
  commitmentOffsetDays: number | null; reviewOffsetDays: number | null; deliveryOffsetDays: number | null;
  sortOrder: number; active: boolean;
};
export type WorkflowTaskTemplateInput = Omit<Partial<WorkflowTaskTemplate>, "id" | "workflowId" | "phaseName"> & {
  title: string; phaseId: string;
};

// ── Puestos
export type PositionRef = { id: string; name: string };
export type Position = PositionRef & {
  sortOrder: number; active: boolean;
  phases: Array<WorkflowPhaseRef & { workflowId: string; workflowName: string }>;
  staffCount: number;
  googleManaged: boolean;                             // referenced by a Google group mapping
};
export type PositionInput = { name: string; active?: boolean };

// Staff additions
export type Staff = /* existing fields */ {
  // …
  positions: PositionRef[];
  candidatePhases: Array<WorkflowPhaseRef & { workflowName: string }>;
};
export type StaffDetail = Staff & { profile: StaffProfile | null; positions: PositionRef[]; access: StaffAccess | null };
// `StaffAreaRef`, `Area`, `AreaDetail`, `AreaInput` removed

// ── Espacios
export type ProjectSpaceRef = { id: string; name: string };
export type ProjectSpace = ProjectSpaceRef & { projectId: string; sortOrder: number; taskCount: number };

// ── Projects
export type ProjectTramo = WorkflowRef & { startedAt: string | null; closedAt: string | null; current: boolean };

export type Project = {
  id: string; code: string | null; name: string;
  clientId: string | null;                            // nullable; null for non-admins
  origin: string | null;                              // admin only (null for others)
  originStaffId: string | null;                       // admin only
  status: ProjectStatus; currentWorkflowId: string | null;
  // `phase`, `phases` removed
  projectType: string | null; addressStreet: string | null; addressCity: string | null; addressState: string | null;
  managerId: string | null; coordinatorId: string | null; progress: number;
  startDate: string | null; endDate: string | null; contractAmountMxn: string | null;
  createdAt: string; updatedAt: string;
};

export type ProjectListItem = Project & {
  client: ContactRef | null;                          // null: none, or viewer isn't admin
  currentWorkflow: WorkflowRef | null;
  tramos: ProjectTramo[];                             // replaces `stages`
  activePhase: WorkflowPhaseRef | null;               // first catalog fase of the current tramo with open tasks
  needsTramo: boolean;                                // no current tramo (migration flag "Asignar tramo")
  manager: StaffRef | null; coordinator: StaffRef | null;
  taskCounts: { total: number; open: number; blocked: number };
  // `area` removed
};
export type ProjectDetail = Omit<ProjectListItem, "taskCounts" | "activePhase"> & {
  originStaff: StaffRef | null;
  /** Admins only (null for others, and for projects not imported): the monday boards it came from. */
  mondayImport: { boards: Array<{ id: string; name: string }> } | null;
  members: Array<StaffRef & { role: string | null; active: boolean }>;
  contacts: Array<ContactRef & { role: string | null }>;
  links: ProjectLink[];
};
export type ProjectCreateInput = { name: string };
export type ProjectInput = {
  code?: string | null; name?: string; status?: ProjectStatus;
  clientId?: string | null; origin?: string | null; originStaffId?: string | null;   // admin only
  projectType?: string | null; addressStreet?: string | null; addressCity?: string | null; addressState?: string | null;
  managerId?: string | null; coordinatorId?: string | null; progress?: number;
  startDate?: string | null; endDate?: string | null; contractAmountMxn?: string | null;
};
// `ApplyWorkflowPreview` removed

// ── Tasks
export type Task = /* existing */ {
  // …
  kind: TaskKind;
  phaseId: string | null;                             // was phase: string | null
  spaceId: string | null;
  closedAt: string | null;
};
export type TaskListItem = Task & {
  customStatus: { id: string; name: string; closes: boolean; countsAsCompleted: boolean } | null;
  project: { id: string; name: string; clientName: string | null };   // null for non-admins
  workflow: WorkflowRef | null;
  phase: WorkflowPhaseRef | null;
  space: ProjectSpaceRef | null;
  // `areaColorSlot` removed; other fields unchanged
};
export type UserTaskInput = {
  projectId: string; title: string; notes?: string | null;
  workflowId: string;                                 // required for usuario tasks
  phaseId?: string | null; spaceId?: string | null;
  managerId?: string | null; supportIds?: string[]; priority?: TaskPriority;
  commitmentDate?: string | null; reviewDate?: string | null; deliveryDate?: string | null;
};
export type AdminTaskInput = Omit<UserTaskInput, "workflowId" | "phaseId" | "spaceId">;
export type SubtaskInput = Omit<UserTaskInput, "projectId" | "phaseId" | "workflowId">;  // spaceId allowed
export type TaskPatch = Partial<Pick<Task,
  "title" | "notes" | "phaseId" | "spaceId" | "priority" | "status" | "managerId"
  | "commitmentDate" | "reviewDate" | "deliveryDate" | "workflowId">>;  // `phase` removed; `workflowId` only when the task has none (else INVALID)
export type TaskFilters = {
  projectId?: string; workflowId?: string; phaseId?: string; spaceId?: string;
  kind?: TaskKind | TaskKind[];                       // default excludes "admin"
  status?: TaskStatus | TaskStatus[]; managerId?: string; involvesStaffId?: string;
  archived?: boolean; dateFrom?: string; dateTo?: string; search?: string;
};

export type TaskStatusOption = { id: string; name: string; closes: boolean; countsAsCompleted: boolean; sortOrder: number };
export type TaskStatusInput = { name: string; closes?: boolean; countsAsCompleted?: boolean; sortOrder?: number };

// ── Starting a tramo
export type TramoCandidateProject = {
  project: { id: string; name: string };
  currentTramo: WorkflowRef | null;
  readySince: string | null;                          // ISO; null in "Próximos"
  pending: { tramo: WorkflowRef; phase: WorkflowPhaseRef; open: number; total: number } | null;  // "Próximos" only
};
export type TramoBoard = {
  workflow: WorkflowRef;
  ready: TramoCandidateProject[];                     // not started here, readiness met
  upcoming: TramoCandidateProject[];                  // not started here, readiness not met
  /** Projects with this tramo started; drives "Deshacer inicio" on the project block. */
  started: Array<{
    projectId: string;
    batchId: string | null;                           // latest start batch of this tramo; null if none
    createdCount: number;
    canUndo: boolean;                                 // no created task edited yet
  }>;
};
export type StaffCandidate = { id: string; name: string; positions: string[]; openTasks: number };
export type StartTramoPreview = {
  project: { id: string; name: string };
  workflow: WorkflowRef;
  alreadyStarted: boolean;
  autoStart: boolean;                                 // workflow.autoStart !== "manual"
  phases: Array<{
    phase: WorkflowPhaseRef;
    templates: Array<{ id: string; title: string }>;  // templates still to create (idempotent)
    existing: number;                                 // templates already created on this project
    candidates: StaffCandidate[];                     // staff whose puestos list this fase
  }>;
};
export type StartTramoAssignment =
  | { mode: "self" }
  | { mode: "by_phase"; managers: Record<string /* phaseId */, string | null> }
  | { mode: "none" };
export type StartTramoInput = {
  projectId: string; workflowId: string;
  phaseIds: string[];                                 // checked fases
  assignment: StartTramoAssignment;
  autoStart?: boolean;                                // admin only; sets the firm-wide setting
};
export type StartTramoResult = {
  batchId: string | null;                             // null when nothing was created
  createdCount: number; skippedCount: number;
  stageCreated: boolean;                              // a project_stages row was opened
  project: { id: string; name: string }; workflow: WorkflowRef;
};
```

### 7.2 Tramos y fases (`lib/actions/workflows-actions.ts`)

| Action | Input | Output / errors |
|---|---|---|
| `fetchWorkflowsAction(opts?)` | `{ includeInactive?, includeInactiveTemplates?, includeInactivePhases? }` | `WorkflowDetail[]` (sorted by `sortOrder`). Open to any staff session for active rows; Actividades, Proyectos (`presaleAutoStart`), Equipo and Puestos read it. Any `includeInactive*` flag needs `workflows.canManageWorkflows` and is ignored otherwise, so only Tramos y fases passes them |
| `fetchTramosNavAction()` | | `WorkflowRef[]` (active only; staff session) |
| `createWorkflowPhaseAction(workflowId, input)` | `WorkflowPhaseInput` | `WorkflowPhase` / `FORBIDDEN`, `NOT_FOUND`, `NAME_TAKEN`, `EMPTY` |
| `updateWorkflowPhaseAction(id, patch)` | `Partial<WorkflowPhaseInput>` (rename, activate/deactivate) | `WorkflowPhase` / `FORBIDDEN`, `NOT_FOUND`, `NAME_TAKEN`, `EMPTY` |
| `reorderWorkflowPhasesAction(workflowId, orderedIds)` | | `void` / `FORBIDDEN`, `NOT_FOUND` |
| `setWorkflowAutoStartAction(workflowId, autoStart)` | `boolean` (UI switch; backend stores `on_create` for the first tramo, `on_ready` for others, `manual` when false) | `Workflow` / `FORBIDDEN`, `NOT_FOUND` |
| `createTemplateAction(workflowId, input)` | `WorkflowTaskTemplateInput` | `WorkflowTaskTemplate` / `FORBIDDEN`, `PHASE_MISMATCH`, `NAME_TAKEN` (same title in the same fase) |
| `updateTemplateAction(id, patch)` | `Partial<WorkflowTaskTemplateInput>` | `WorkflowTaskTemplate` / `FORBIDDEN`, `PHASE_MISMATCH`, `NAME_TAKEN` (same title in the same fase) |
| `deactivateTemplateAction(id)`, `reorderTemplatesAction(workflowId, ids)` | unchanged | unchanged |

`createWorkflowAction`, `updateWorkflowAction` and `deleteWorkflowAction` are no longer called by the UI. The three tramos are fixed (brief decision 2).

### 7.3 Puestos (`lib/actions/positions-actions.ts`, new) and staff

| Action | Input | Output / errors |
|---|---|---|
| `fetchPositionsAction()` | | `Position[]` (any staff session; used by pickers) |
| `createPositionAction(input)` | `PositionInput` | `Position` / `FORBIDDEN`, `NAME_TAKEN`, `EMPTY` |
| `updatePositionAction(id, patch)` | `Partial<PositionInput>` | `Position` / `FORBIDDEN`, `NOT_FOUND`, `NAME_TAKEN`, `EMPTY` |
| `deletePositionAction(id)` | | `void` / `FORBIDDEN`, `NOT_FOUND`, `IN_USE` (Google mapping) |
| `setPositionPhasesAction(id, phaseIds)` | `string[]` | `Position` / `FORBIDDEN`, `NOT_FOUND` |
| `reorderPositionsAction(orderedIds)` | | `void` / `FORBIDDEN` |
| `setStaffPositionsAction(staffId, positionIds)` (`staff-actions.ts`, replaces `setStaffAreasAction`) | `string[]` | `GoogleManagedRefusal \| void` / `FORBIDDEN`, `NOT_FOUND` |
| `fetchAssignableStaffAction(workflowId?)` | unchanged signature | `Array<Staff & { suggested: boolean }>`, where `suggested` = has a puesto with a candidate fase in that tramo |

### 7.4 Projects and espacios (`lib/actions/projects-actions.ts`)

| Action | Input | Output / errors |
|---|---|---|
| `fetchProjectsAction(filters?)` | unchanged | `ProjectListItem[]` (client/origin nulled for non-admins) |
| `fetchProjectAction(id)` | | `ProjectDetail \| null` |
| `createProjectAction(input)` | `ProjectCreateInput` | `ProjectDetail` / `FORBIDDEN`, `EMPTY`, `NAME_TAKEN`. Side effects (backend): Presale auto-start when enabled, admin task "Asignar cliente y origen" |
| `updateProjectAction(id, patch)` | `Partial<ProjectInput>` | `ProjectDetail` / `FORBIDDEN` (incl. non-admin sending `clientId`/`origin`/`originStaffId`), `NAME_TAKEN`, `NOT_FOUND` |
| `setProjectCurrentTramoAction(id, workflowId)` (replaces `setProjectStageAction`/`setProjectStagesAction`) | | `ProjectDetail` / `FORBIDDEN`, `NOT_FOUND`, `NOT_STARTED` (no `project_stages` row) |
| `fetchProjectSpacesAction(projectId)` | | `ProjectSpace[]` |
| `createProjectSpaceAction(projectId, name)` | | `ProjectSpace` / `FORBIDDEN`, `NAME_TAKEN`, `EMPTY` |
| `renameProjectSpaceAction(id, name)` | | `ProjectSpace` / `FORBIDDEN`, `NAME_TAKEN`, `EMPTY`, `NOT_FOUND` |
| `reorderProjectSpacesAction(projectId, orderedIds)` | | `void` |
| `deleteProjectSpaceAction(id)` | | `void` (its tasks keep their fase, lose the espacio) / `FORBIDDEN`, `NOT_FOUND` |

Note: the backend's `stageOnly` path of `startTramo` (admin "Asignar tramo" on a tramo with no stage, backend §7.3) is admin and back-end only; the UI never sends it and always starts tramos through the sheet.

Removed from the UI: `previewApplyWorkflowAction`, `applyWorkflowAction`, `setProjectStageAction`, `setProjectStagesAction`.

Espacios permissions: whoever has `projects.canEditProjectGeneral`.

### 7.5 Starting a tramo (`lib/actions/tramo-start-actions.ts`, new)

| Action | Input | Output / errors |
|---|---|---|
| `fetchTramoBoardAction(workflowId)` | | `TramoBoard` / `NOT_FOUND` |
| `previewStartTramoAction(projectId, workflowId)` | | `StartTramoPreview` / `FORBIDDEN`, `NOT_FOUND` |
| `startTramoAction(input)` | `StartTramoInput` | `StartTramoResult` / `FORBIDDEN` (no `canCreateActivity`, or non-admin `autoStart`), `NOT_FOUND`, `PHASE_MISMATCH`, `NO_PHASES` |
| `undoStartTramoAction(batchId)` | | `void` / `FORBIDDEN`, `NOT_FOUND`, `TOUCHED` |

Behavior the UI relies on:
- **Idempotent:** templates already created on the project are skipped and counted in `skippedCount`. A repeated submit never duplicates.
- **"Asignarme todas"** sets the viewer as manager.
- **Auto-started tramos** (`on_create` for Presale, `on_ready` for later tramos) create every active fase's template tasks **unassigned** ("Sin asignar").
- **Undo** soft-deletes the batch's tasks (history stays). It removes the stage row only when the batch opened it (`stageCreated`) **and** no other live task of that tramo remains on the project, e.g. a quick-added one. It's allowed only while no created task has been touched. It also returns `TOUCHED` when a later start batch of the same tramo exists on the project, since only the latest batch can be undone. `TramoBoard.started[].canUndo` reports all of this, so the project block can offer "Deshacer inicio" after the toast is gone. Auto-started batches follow the same rule.
- **Client assignment** (`updateProjectAction` with a non-null `clientId`) closes the project's open "Asignar cliente y origen" admin task automatically. Origin isn't required.
- **Who can start:** `activities.canCreateActivity`.

### 7.6 Tasks (`lib/actions/tasks-actions.ts`)

| Action | Change |
|---|---|
| `fetchTasksAction(filters)`, `fetchMyTasksAction`, `fetchBoardAction`, `fetchCalendarAction` | `TaskFilters` gains `phaseId`, `spaceId`, `kind`. Admin tasks are excluded unless `kind` includes `"admin"` **and** the viewer is admin; Mis tareas includes the viewer's own admin tasks |
| `createUserTaskAction(input)` | `UserTaskInput` with `phaseId`, `spaceId` / + `PHASE_MISMATCH`, `SPACE_MISMATCH`. Never writes a stage row: a quick-add doesn't start the tramo (B1) |
| `updateTaskAction(id, patch)` | `TaskPatch` with `phaseId`, `spaceId` / + `PHASE_MISMATCH`, `SPACE_MISMATCH`, `ADMIN_TASK` (setting a fase on an admin task), `ASSIGNEE_NOT_ADMIN` (`managerId` on an admin task set to a non-administrator), `INVALID` (a `workflowId` on a task that already has a tramo, or malformed input) |
| `createSubtaskAction(parentId, input)` | inherits `workflowId` and `phaseId` from the parent (as today with `phase`). A subtask of an admin task is an admin task (`kind` inherited, no tramo or fase, administrator assignees only: `ASSIGNEE_NOT_ADMIN`) |
| `fetchAdminTasksAction(filters?)` (new) | `{ projectId?: string; includeClosed?: boolean }` → `TaskListItem[]` / `FORBIDDEN` (non-admin) |
| `createAdminTaskAction(input)` (new) | `AdminTaskInput` → `TaskDetail` / `FORBIDDEN`, `NOT_FOUND`, `ASSIGNEE_NOT_ADMIN` |
| `assignTaskAction`, `setTaskSupportAction` on an admin task | + `ASSIGNEE_NOT_ADMIN` |

Task statuses (`lib/actions/task-statuses-actions.ts`): `createTaskStatusAction` / `updateTaskStatusAction` accept `countsAsCompleted`. Sending `countsAsCompleted: true` with `closes: false` fails with `INVALID`.

### 7.7 Google group mappings (`lib/actions/workspace-access-actions.ts`)

```ts
export type GroupMappingKind = "role" | "position";
export type GroupMapping = { id: string; groupEmail: string; kind: GroupMappingKind; role: string | null;
  positionId: string | null; positionName: string | null; rank: number };
export type GroupMappingInput = { groupEmail: string; kind: GroupMappingKind; role?: string | null;
  positionId?: string | null; rank?: number | null };
```

Actions keep their names and result style (`GroupMappingResult`).

### 7.8 monday import (`lib/actions/monday-import-actions.ts`, `lib/types/monday-import.ts`, `scripts/monday/mapping.schema.ts`)

```ts
// mapping.schema.ts
export const GroupTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tramo"), workflowId: z.uuid() }),
  z.object({ kind: z.literal("phase"), phaseId: z.uuid() }),
  z.object({ kind: z.literal("space") }),
  z.object({ kind: z.literal("project") }),
  z.object({ kind: z.literal("admin") }),       // "Tareas de administración" (RD-1)
  z.object({ kind: z.literal("ignore") }),
]);
// ColumnTarget += "closed_date"
// BoardMapping: remove areaId, taskAreaSource, taskAreas, statusMaps; keep workflowId ("Tramo del tablero"), client (optional)
export const StatusMapEntry = z.object({
  target: StatusTarget,
  priority: z.enum(["alta", "media", "baja"]).nullable().default(null),
});
// Mapping += statusMap: z.record(z.string() /* statusLabelKey(label) */, StatusMapEntry).default({})
//   (server-written snapshot of the saved firm-wide map at apply time; the wizard edits the saved setting)
// statusLabelKey(label) = label.trim().toLowerCase().replace(/\s+/g, " ")   (shared by wizard, translate and saved map)
// Mapping.version becomes z.literal(2). v1 files (stored drafts, uploaded files, past batches used by the remap)
//   are upgraded server-side with upgradeMappingV1, never rejected; the wizard only ever sees v2.
export type MondayStatusMap = Record<string /* statusLabelKey(label) */, z.infer<typeof StatusMapEntry>>;

// lib/types/monday-import.ts
export interface MondayImportChoices {
  statuses: { id: string; name: string; closes: boolean; countsAsCompleted: boolean }[];
  workflows: { id: string; name: string; phases: { id: string; name: string; sortOrder: number }[] }[];
  templates: { id: string; workflowId: string; phaseId: string; name: string }[];
  positions: { id: string; name: string; phaseIds: string[] }[];
  clients: { id: string; name: string }[];
  staff: { id: string; name: string; email: string | null }[];
  providerSubtypes: string[];
  statusMap: MondayStatusMap;                            // saved firm-wide setting (RD-5)
  // `areas` removed
}
// MondayPreviewSample.cincel: remove area, areaUnmapped, workflow; add
//   tramo: string | null; phase: string | null; phaseReview: boolean; space: string | null; admin: boolean;
//   kind: "workflow" | "usuario" | "admin" | null;
// PlanIssueCode: + "PHASE_UNRESOLVED" (warning), "CLIENT_MISSING" (warning), "ADMIN_ASSIGNEE_CLEARED" (warning),
//   "TRAMO_MISSING" (blocking), "PROJECT_NAME_TAKEN" (blocking);
//   − "AREA_NAME_TAKEN", "AREA_UNMAPPED"; "CLIENT_UNRESOLVED" stays (a chosen client that doesn't resolve)
export interface MondayPositionSuggestion {
  position: { id: string; name: string } | null;
  tasks: number;                                         // the person's tasks in this import
  topPhases: { workflowName: string; phaseName: string; tasks: number }[];  // up to 3
}

// Reacomodar importación (RD-2)
export interface MondayRemapBoard {
  boardId: string; name: string;
  source: MondayBoardSource | null;                      // null: board missing from the stored export
  workflowId: string | null;                             // "Tramo del tablero"
  groupTargets: Record<string, GroupTarget>;             // current targets, prefilled from the import refs
}
export interface MondayRemapState {
  project: { id: string; name: string };
  boards: MondayRemapBoard[];
  choices: MondayImportChoices;
}
export type MondayRemapInput = Array<{ boardId: string; workflowId: string | null; groupTargets: Record<string, GroupTarget> }>;
export interface MondayRemapPreview {
  tasks: number;
  changes: { tramo: number; phase: number; space: number; admin: number; otherProject: number; unchanged: number; phaseUnresolved: number };
  samples: Array<{ taskId: string; title: string; before: string; after: string }>;   // "Tramo · Fase · Espacio", up to 10
  issues: MondayPreviewIssue[];
}
```

| Action | Input | Output |
|---|---|---|
| `createMondayStaffAction(runId, mondayUserId, options?)` | `{ positionIds?: string[] }` (new optional arg) | `MondayImportResult<{ staff: CreatedStaff }>` |
| `suggestMondayPositionAction(runId, mondayUserId)` (new) | | `MondayImportResult<{ suggestion: MondayPositionSuggestion }>` |
| `getMondayImportChoicesAction()` | | `MondayImportResult<{ choices: MondayImportChoices }>` (new shape) |
| `saveMondayStatusMapAction(entries)` (new) | `MondayStatusMap` (the whole map) | `MondayImportResult<{ statusMap: MondayStatusMap }>`; `{ ok: false, error: "STATUS_NOT_FOUND" }` when an entry points at a custom status that no longer exists |
| `getMondayRemapAction(projectId)` (new) | | `MondayImportResult<{ remap: MondayRemapState }>`; `{ ok: false, error: "NOT_IMPORTED" }` when the project has no monday import ref; `{ ok: false, error: "EXPORT_MISSING" }` when the stored monday export files are gone |
| `previewMondayRemapAction(projectId, input)` (new) | `MondayRemapInput` | `MondayImportResult<{ preview: MondayRemapPreview }>` |
| `applyMondayRemapAction(projectId, input)` (new) | `MondayRemapInput` | `MondayImportResult<{ updated: number }>` |
| `saveMondayMappingDraftAction`, `previewMondayImportAction`, others | unchanged signatures | new mapping and preview shapes |

The four new actions are Administrador only and not the bootstrap admin, the same guard as the rest of the wizard. Remap actions revalidate `/proyectos/{id}/ficha`, `/actividades` (layout), `/proyectos` and `/dashboard`.

---

## 8. Auth and access

- **Mechanism:** unchanged (staff Google sign-in, `requireCapabilityUser`, `proxy.ts`). No new routes need proxy rules. Configuración pages keep their server-side admin redirect.
- **New helper** `canSeeAdminData(user: AuthenticatedUser | null): boolean` in `lib/auth/permissions.ts`: `user?.access === "Administrador"`, the same check as the Configuración menu and the monday page. "Dirección" and other access roles don't count (RD-3). Used for:
  - Client and origin (Proyectos column, ficha fields, export).
  - Admin tasks (cards, ficha group, filters).
  - The "Asignar tramo" badge.
  - The auto-start checkbox in the sheet.
- **Server-side enforcement:** non-admins get `client: null`, `origin: null`, `originStaffId: null`, and `project.clientName: null` on tasks. `kind = "admin"` tasks are excluded from every read action except an admin's own Mis tareas, and admin tasks can be assigned (responsable or equipo) to administrators only: the action refuses with `ASSIGNEE_NOT_ADMIN` (RD-12). The UI never relies on hiding alone.
- **Other reads filtered for non-admins (B2):**
  - Directorio client detail: no project list, counts only (§3.17).
  - Project history: no `clientId` / `origin` / `originStaffId` events.
  - Admin tasks are never returned by any read. That covers lists, by-id detail, history, checklist, links, attachments, dependencies, subtasks and Datos de monday: `getImportDataAction` returns `null` for an admin task. Writes on them return `FORBIDDEN`.
  - A project's Datos de monday drops the monday client column values.
  - So a non-admin can't open an admin task anywhere: no list includes it and the drawer gets `null` ("Ya no existe").
- **Accepted exception:** `/proyectos/[id]/clientes` (portal contacts for `portal.manageAccess`).
- **Capabilities reused:**
  - `activities.canCreateActivity`: start a tramo, quick-add.
  - `activities.canReorderPhases`: edit a task's fase.
  - `projects.canCreateProject`, `projects.canEditProjectGeneral`: espacios.
  - `projects.canChangeProjectStage`: current tramo.
  - `workflows.canManageWorkflows`: Tramos y fases.
  - Puestos uses `areas.canManageAreas`, renamed `positions.canManagePositions`. The Permisos page label changes from "Áreas" to "Puestos".
- Token refresh and session storage are unchanged.

---

## 9. Error handling

- **Action error shape:** `Error` messages `"CODE"` or `"CODE: detail"`. A shared mapper `actionErrorText(err, context)` in `lib/errors.ts` (existing file) returns Spanish copy:

| Code | Copy |
|---|---|
| `FORBIDDEN` | "No tienes permiso para realizar esta acción." |
| `NOT_FOUND` | "Ya no existe. Recarga la página." |
| `EMPTY` | "Escribe un nombre." |
| `NAME_TAKEN` (project) | "Ya existe un proyecto con ese nombre." |
| `NAME_TAKEN` (fase / puesto / espacio) | "Ya existe {una fase / un puesto / un espacio} con ese nombre." |
| `NAME_TAKEN` (tarea de plantilla) | "Ya existe una tarea de plantilla con ese nombre en {fase}." |
| `PHASE_MISMATCH` | "Esa fase no pertenece al tramo de la tarea." |
| `SPACE_MISMATCH` | "Ese espacio es de otro proyecto." |
| `ADMIN_TASK` | "Las tareas de administración no tienen fase ni espacio." |
| `NO_PHASES` | "Elige al menos una fase." |
| `NOT_STARTED` | "Ese tramo aún no se inicia en el proyecto." |
| `TOUCHED` | "No se puede deshacer: ya se editó una de las tareas creadas o {tramo} se inició de nuevo después." |
| `IN_USE` (puesto) | "Este puesto se asigna desde un grupo de Google. Quita el grupo en Configuración → Google primero." |
| `INVALID` (status) | "Solo un estatus que cierra la tarea puede contar como completado." |
| `INVALID` (other, e.g. a task without a tramo or a malformed input) | "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo." |
| `STATUS_NOT_FOUND` (monday status map) | "Uno de los estatus elegidos ya no existe. Elige otro y vuelve a guardar." |
| `NOT_IMPORTED` (remap) | "Este proyecto no viene de una importación de monday." |
| `EXPORT_MISSING` (remap) | "Ya no están los archivos de la exportación de monday de este proyecto. Vuelve a exportar el tablero para reacomodarlo." |
| `ASSIGNEE_NOT_ADMIN` | "Las tareas de administración solo se asignan a administradores." |
| other | "No se pudo completar la acción. Intenta de nuevo." |

- **Where errors show:**
  - Forms and drawers: inline text under the field (`aria-describedby`) or an `Alert variant="destructive"` above the footer.
  - Page actions: `ActividadesClient` replaces `window.alert` with a dismissible `Alert` at the top of the page, which is focused when it appears.
  - Undo: a toast (§4.3). The undo flow is the only toast use, a brief-mandated exception to the "no toasts" convention.
- **Error boundaries:** unchanged (the App Router's existing `error.tsx` / page-level try/catch fallbacks). RSC load failures render empty and let the client hydrate (existing pattern).
- **Destructive confirmations:** `AlertDialog` for deleting a puesto or espacio. The existing `window.confirm` calls in the touched files (task delete, client change in the ficha) move to `AlertDialog` while those files change.
- **Form validation:** the app has no React Hook Form; it uses local state plus inline checks. These forms keep that approach: name required, trimmed, at most 120 chars. Zod is used only where it is today (monday mapping).

---

## 10. shadcn/ui inventory

| Component | Where |
|---|---|
| `Sheet` | Iniciar tramo, Nuevo proyecto, Nueva tarea, Puesto, Fase, Tarea de plantilla drawers, monday board sheet |
| `Checkbox` | Sheet fase rows, auto-start (sheet), Puesto candidate fases |
| `RadioGroup` | Sheet "Asignación" |
| `Select` | Fase, Espacio, responsable per fase, Tramo actual, Cliente, Quién trajo, Tramo/Fase filters, group targets (`ChoiceSelect`), Prioridad in status map, Puesto in Crear integrante |
| `Switch` | Tramo "Iniciar automáticamente", Estatus "Cuenta como completada" |
| `Card` | Listos para iniciar, Para administración, Tramos, Espacios |
| `Accordion` | Próximos, grouped monday warnings |
| `Badge` | `TramoBadge`, tramo chips, "Por asignar" / "Asignar tramo" (`destructive`), "Sin fase · revisar", "Tramo actual" (`outline`) |
| `Alert` | Inline errors, portal gating, nothing-to-create |
| `AlertDialog` | Delete puesto / espacio |
| `Popover` | Crear integrante with puesto |
| `Tabs` | Tramo tabs (Actividades, Tablero, Tramos y fases) |
| `Tooltip` | Fases candidatas overflow, disabled Fase filter |
| `Skeleton` | Sheet preview, sidebar tramos, cards |
| `Table` / `DataTable` | All lists |
| **`Sonner`** (new) | Undo toast. Add with the shadcn CLI (`sonner` package, a new dependency) and mount `<Toaster />` in `app/layout.tsx`. It uses default monochrome styles with no `richColors` |

---

## 11. Environment variables

None new. Existing ones (`CINCEL_ADMIN_EMAILS`, Google, monday, database) are unchanged.

---

## 12. Folder structure (changes only)

```
app/
  actividades/[tramo]/                  # renamed from [departamento]
    page.tsx  ActividadesClient.tsx  ActividadesClient.test.tsx
  configuracion/
    tramos/page.tsx  tramos/TramosClient.tsx              # new
    puestos/page.tsx puestos/PuestosClient.tsx            # new
    areas/page.tsx       → redirect("/configuracion/puestos")   (AreasClient.tsx deleted)
    workflows/page.tsx   → redirect("/configuracion/tramos")    (WorkflowsClient.tsx deleted)
  layout.tsx                            # + <Toaster />
components/
  tareas/
    StartTramoSheet.tsx  ReadyToStartCard.tsx  UpcomingProjects.tsx
    PhaseStrip.tsx  TramoChips.tsx  AdminTasksCard.tsx          # new
    NewProjectTemplateModal.tsx                                  # deleted
  proyectos/
    ProjectSpacesCard.tsx  ProjectTramosCard.tsx  ProjectAdminFields.tsx
    RemapImportSheet.tsx                                         # new
  configuracion/
    PositionEditorDrawer.tsx  PhaseEditorDrawer.tsx              # new
    TemplateTaskDrawer.tsx                                       # renamed from WorkflowTemplateDrawer.tsx
    AreaEditorDrawer.tsx (+test)                                 # deleted
    monday-import/
      StatusMapTable.tsx                                         # new
      TaskAreaWorkflowSection.tsx                                # deleted
  ui/shadcn/sonner.tsx                                           # new (CLI)
  v2/status/TramoBadge.tsx                                       # renamed from AreaBadge.tsx
lib/
  actions/positions-actions.ts  tramo-start-actions.ts           # new
  actions/areas-actions.ts                                       # deleted
  actividades/departamento.ts                                    # deleted
  templates/{presale,diseno,operativas}.ts                       # deleted
  proyectos/phases.ts (+test)                                    # deleted
  areas/area-color.ts (+test)        → lib/tramos/tramo-color.ts (+test)
  tasks/labels.ts                                                # new (tramoPhaseLabel)
  monday-import/task-areas.ts (+test)                            # deleted
```

---

## 13. Label table (UI copy that must hold everywhere)

| Concept | Use | Never (for this concept) |
|---|---|---|
| Presale / Diseño / Construcción | **Tramo** (tabs, columns, filters, chips) | Área, Departamento, Workflow, Etapa |
| Ordered step within a tramo | **Fase** (from the catalog) | free text, "Otro…" |
| Job position | **Puesto** | Área, Rol |
| App access level | **Acceso** | Puesto |
| Project sub-place | **Espacio** | Fase, Grupo |
| Unit of work | **Tarea** (including export column) | Actividad (as a column header) |
| Template | **Tareas de plantilla** | Plantilla de workflow |

Specific renames:
- Dashboard: "Proyectos por departamento" → "Proyectos por tramo".
- Mis tareas: "Departamento" → "Tramo · Fase".
- Calendario: "Etapa" → "Tramo", plus a new "Fase" filter.
- Actividades export: "Actividad" → "Tarea", and "Estatus" stays.
- Proyectos: "Etapas" → "Tramo".
- Ficha: "Etapas" → "Tramos".
- Nuevo proyecto: "Etapa inicial" is removed.
- Sidebar: "Áreas" and "Workflows" → "Puestos" and "Tramos y fases".

"Actividades" stays as the menu and page name. The Directorio contact-person field "Departamento" (`components/directorio/ContactEditorSheet.tsx:347`) is a different concept, a client company's department, and stays.

---

## 14. Accessibility

- **Iniciar tramo sheet:**
  - Focus moves to the sheet title on open and returns to the "Iniciar" button on close. Fases sit in a `fieldset`/`legend` and "Asignación" is a `RadioGroup` with a legend.
  - Per-fase responsable selects have `aria-label="Responsable de {fase}"`.
  - The "Crear {N} tareas" count lives in the button's accessible name. A polite `aria-live` line, "{N} tareas seleccionadas", updates as fases toggle.
- **Undo toast:** Sonner's region is `aria-live="polite"`. "Deshacer" is a real button reachable with the keyboard while the toast is visible, and the 10 s duration pauses on hover and focus (Sonner default).
- **Color is never the only cue:** `TramoBadge` has text, "Por asignar" / "Asignar tramo" have text, and late dates keep their text.
- **Chips and badges:** closed tramo chips carry `aria-label="{tramo}, cerrado"`. Tramo tabs are `Tabs` (arrow-key navigation).
- **Drag reorder** (fases, puestos, espacios, tasks within a fase) keeps the keyboard handles `DataTable` already provides. A refused cross-fase drop announces "Solo puedes reordenar dentro de la misma fase."
- **Hidden fields:** admin-only columns are absent from the DOM for non-admins, not just visually hidden.
- **monday:** warning groups are `Accordion` triggers with counts in their names. The "Crear integrante" popover traps focus, and Escape closes it.
- **Motion:** sheets respect `motion-reduce` (existing pattern in `BoardMappingSheet`).

---

## 15. Testing

Vitest + Testing Library, next to the components (existing pattern). The feature adds Vitest tests that run in the existing CI test step. It adds no CI jobs, and cleaning up the CI workflow is out of scope. New end-to-end or browser checks for this feature are local, on-demand scripts whose results go on the issue.

**Unit:**
- `tramoColorSlot`.
- `tramoPhaseLabel`.
- Fase sort (catalog order, "Sin fase" last).
- Group target defaults and encode/decode (`group-targets.test.ts`).
- Status map defaults and the label key normalization.
- Warning grouping by code.
- `actionErrorText`.

**Components:**
- `StartTramoSheet`: renders fases with counts and samples; unchecking updates "Crear N tareas"; "Por fase" preselects the first candidate; fases whose tasks all exist are not listed (only the "Ya tienen sus tareas" line); the auto-start checkbox renders only for admins; error copy appears.
- `ActividadesClient`:
  - Ready/Próximos sections and the deep link opening the sheet.
  - General has no selector and its blocks show tramo chips.
  - The Fase select lists only the task's tramo fases, with no "Otro…".
  - The toast's Deshacer calls `undoStartTramoAction`.
- `ProjectCreateModal`: a name-only submit; the `NAME_TAKEN` copy.
- `ProyectosClient`: the Cliente column and "Por asignar" only for admins.
- `NewTaskModal`: the Espacio select appears only when the project has espacios.
- `EquipoClient` / `MemberEditorDrawer`: Puestos and Acceso columns; candidate fases derived.
- `PuestosClient`, `TramosClient`, `EstatusClient` ("Cuenta como completada" disabled unless "Cierra").
- `Sidebar`: tramos from the action.
- monday:
  - `GroupTargetsTable` offers exactly the targets of §4.6.1.
  - `EquivalenciasStep` shows no Departamento or Workflow selects and an optional client.
  - `StatusMapTable` prefills defaults with priority.
  - `PreviewStep` groups warnings with counts.
  - `CreateStaffButton` preselects the suggested puesto.
  - `StatusMapTable` starts from `choices.statusMap`, saves on change, and keeps the value on save error.
  - `RemapImportSheet`: reuses `GroupTargetsTable`, clears the preview on any target change, enables "Aplicar" only after a preview, and shows the missing-board copy.
- "Deshacer inicio" shows only with `canUndo`, confirms, and calls `undoStartTramoAction`.
- Admin-task responsable pickers list administrators only.
- The ficha shows "Reacomodar importación" only for admins and only on imported projects.
- Update existing tests that assert "Área", "Departamento", "Etapa", "Workflow" or "Sin área" copy. That includes the existing Playwright specs `tests/e2e/proyectos.spec.ts` (name-only create, Tramo column, no "Etapa") and `tests/e2e/equipo.spec.ts` (Puestos / Acceso columns, no "Áreas"), which the current CI e2e job runs.
- B1: the `?project=` deep link opens the sheet for a non-ready project; "Agregar fases" opens it for a started project and lists only fases still to create; a quick-add doesn't remove the project from "Listos para iniciar".
- B2: `ClientDetailSheet` shows counts only for non-admins; `ImportDataPanel` renders nothing when the action returns `null`.
- `TaskDrawer` shows the Tramo select only when the task has no tramo.
- `RemapImportSheet` shows the export-gone alert when every board's `source` is `null`.

---

## 16. Acceptance (frontend)

1. No screen shows "Área", "Departamento", "Workflow" or "Etapa" for the tramo concept, and §13 holds on every page listed in §3.
2. "+ Nuevo proyecto" asks only for the name. The new project shows Presale with 10 unassigned tasks, and admins see "Asignar cliente y origen" in "Para administración" and "Por asignar" in Proyectos.
3. Completing Presale's Cobro tasks moves the project from "Próximos" to "Listos para iniciar" on Diseño. Starting it creates the checked fases' tasks with the chosen assignment. "Deshacer" (toast, 10 s), then "Deshacer inicio" on the project block, removes them until one is edited.
4. A task's Fase select lists only its tramo's catalog, with no free text.
5. Equipo shows Puestos, Fases candidatas and Acceso as separate columns. Configuración has Puestos and Tramos y fases, and has no Áreas or Workflows.
6. Actividades keeps Checklist and Equipo, and Proyectos keeps Encargado and Estado, alongside the new columns.
7. Setting a client on a project closes "Asignar cliente y origen" automatically.
8. Admins can "Reacomodar importación" on an imported project from its ficha, with a preview before applying.
9. The monday wizard offers exactly Tramo / Fase / Espacio / Proyecto aparte / Tareas de administración / Ignorar per group, with no Departamento or Workflow, an optional client, one firm-wide status table with priority that is saved and reused by the next import, grouped warnings with counts, and a suggested puesto on "Crear integrante".

---

## 17. Resolved decisions

The product owner's answers are recorded in the brief's "Defaults to confirm" table, §4.1, and ADR 0003 decision 9. Nothing is left open for this spec.

| # | Topic | Decision | Where applied |
|---|---|---|---|
| RD-1 | monday "Administrativo" group | Six group targets. **Tareas de administración** is a final target (`kind: "admin"`) and the default for "Administrativo" | §4.6 item 1, §7.8 |
| RD-2 | Re-sorting imported projects | One-time script with the data migration (Madrid 22, Guadalajara 83, Local Espiropapa), **plus** the admin action **"Reacomodar importación"** per imported project, from the ficha | §3.5, §4.6 item 10, §7.8 |
| RD-3 | Who is "administrator" | Access **"Administrador"** only | §8 |
| RD-4 | Readiness rules | Fixed in code (Presale·Cobro → Diseño, Diseño·Ejecutivo → Construcción); shown read-only in Tramos y fases | §1, §3.11, §7.1 `TramoReadiness` |
| RD-5 | Firm-wide monday status map | A **saved setting** reused by every later import. `getMondayImportChoicesAction` returns it; it's edited in the wizard and saved with `saveMondayStatusMapAction` | §4.6 item 5, §7.8 |
| RD-6 | Existing table columns | **Kept**: Checklist and Equipo in Actividades, Encargado and Estado in Proyectos. New columns are added, nothing is removed | §3.1, §3.2, §3.4 |
| RD-7 | Undo window | Toast with "Deshacer" for 10 s, then **"Deshacer inicio"** on the project block while `canUndo` (no created task edited) | §3.1, §4.3, §7.1 `TramoBoard.started` |
| RD-8 | Diseño display name | **"Diseño"** everywhere, with no other label for this tramo | §1, §3.16, §16 |
| RD-9 | `staff.role` | Access role only; puestos live in their own tables | §3.10, §4.4 |
| RD-10 | "Asignar cliente y origen" | Closes automatically when a client is set; origin is optional | §3.5, §7.5 |
| RD-11 | Design canvas | Not used; existing app patterns govern layout | whole spec |
| RD-12 | Admin task assignees | Administrators only (`ASSIGNEE_NOT_ADMIN` otherwise) | §4.3, §7.6, §8, §9 |
| RD-13 | Workload widget by fase and puesto | Out of scope for this feature | none |

---

## Annex A: Brief → spec mapping

| Brief | Spec |
|---|---|
| §3 Proyectos | §3.4, §4.4 |
| §3 Actividades → [Tramo], General | §3.1, §3.2, §4.3 |
| §3 Iniciar tramo sheet | §3.3, §4.3, §7.5 |
| §3 Task create/edit | §4.3 (`NewTaskModal`, Fase cell, `TaskDrawer`), §7.6 |
| §3 Equipo, Configuración | §3.10–§3.14, §4.4, §7.3 |
| §3 Admin tasks card | §3.1, §3.6, §4.3 (`AdminTasksCard`) |
| §3 Labels | §3.6–§3.9, §13 |
| §4 monday 1–10 | §4.6 items 1–10, §7.8 |
| Defaults table (answers) | §17 RD-1…RD-13 |
| Decisions 5, 8, 9, 12, 13, 14 | §3.4/§3.5, §3.11, §3.1, §3.5, §3.13, §3.6/§3.8 |

## Annex B: Contract names introduced here (backend to confirm)

- **Actions:**
  - Projects and espacios: `fetchTramosNavAction`, `setProjectCurrentTramoAction`, `fetchProjectSpacesAction`, `createProjectSpaceAction`, `renameProjectSpaceAction`, `reorderProjectSpacesAction`, `deleteProjectSpaceAction`.
  - Fases and auto-start: `createWorkflowPhaseAction`, `updateWorkflowPhaseAction`, `reorderWorkflowPhasesAction`, `setWorkflowAutoStartAction`.
  - Puestos: `fetchPositionsAction`, `createPositionAction`, `updatePositionAction`, `deletePositionAction`, `setPositionPhasesAction`, `reorderPositionsAction`, `setStaffPositionsAction`.
  - Starting a tramo: `fetchTramoBoardAction`, `previewStartTramoAction`, `startTramoAction`, `undoStartTramoAction`.
  - Admin tasks: `fetchAdminTasksAction`, `createAdminTaskAction`.
  - monday: `suggestMondayPositionAction`, `saveMondayStatusMapAction`, `getMondayRemapAction`, `previewMondayRemapAction`, `applyMondayRemapAction`.
- **Types:** `WorkflowPhase`, `WorkflowPhaseRef`, `TramoReadiness`, `Position`, `ProjectSpace`, `ProjectTramo`, `ProjectCreateInput`, `AdminTaskInput`, `TramoBoard`, `TramoCandidateProject`, `StaffCandidate`, `StartTramoPreview`, `StartTramoAssignment`, `StartTramoInput`, `StartTramoResult`, `MondayPositionSuggestion`, `StatusMapEntry`, `MondayStatusMap`, `MondayRemapBoard`, `MondayRemapState`, `MondayRemapInput`, `MondayRemapPreview`.
- **Fields:** `countsAsCompleted`, `activePhase`, `needsTramo`, `autoStart`, `TramoBoard.started[].canUndo`, `ProjectDetail.mondayImport`, `MondayImportChoices.statusMap`.
- **Error codes:** `NAME_TAKEN`, `PHASE_MISMATCH`, `SPACE_MISMATCH`, `ADMIN_TASK`, `NO_PHASES`, `NOT_STARTED`, `TOUCHED`, `IN_USE`, `INVALID`, `ASSIGNEE_NOT_ADMIN`.
- **monday issue codes:** `PHASE_UNRESOLVED`, `CLIENT_MISSING`, `ADMIN_ASSIGNEE_CLEARED`, `TRAMO_MISSING`, `PROJECT_NAME_TAKEN`.
- **monday action errors:** `STATUS_NOT_FOUND`, `NOT_IMPORTED`, `EXPORT_MISSING`. Helpers: `statusLabelKey`, `upgradeMappingV1` (mapping v2).

## Review round 1 fixes

From `docs/review/project-flow-review.md` (frontend parts).

| Item | Fix | Where |
|---|---|---|
| B1: no way to start a tramo outside the ready list | The `?project=` deep link opens the sheet whether or not the project is ready. Project blocks get "Agregar fases" (`canCreateActivity`), which opens the same sheet. The sheet lists only fases whose tasks don't exist yet. A quick-add never starts a tramo | §3.1 (quick-add, "Agregar fases"), §3.5 ("Iniciar {tramo}"), §4.3 (`StartTramoSheet` fase rows, `ReadyToStartCard`), §7.6 (`createUserTaskAction`), §15 |
| B2: admin-only data reaching non-admins | Contact sheet shows counts only; no client/origin history events; admin tasks never returned by any read, including Datos de monday; project import data drops the client column. Portal contacts on `/proyectos/[id]/clientes` are an accepted exception | §3.5 (Bitácora, Datos de monday, exception), §3.17 (new), §8, §15 |
| NB-9: tasks with no tramo | Admin "Asignar tramo" on the ficha (and the Proyectos badge links there). The drawer offers a "Tramo" select when the task's tramo is null. `TaskPatch.workflowId` is allowed only then | §3.4, §3.5, §4.3 (`TaskDrawer`), §7.1 (`TaskPatch`) |
| NB-11: drag-and-drop and the undo window | Reordering in a block or moving a Tablero card ends the undo window; stated next to "Deshacer inicio" | §4.3 |
| NB-7: remap with missing export files | Whole-sheet error when every board's export is gone; per-board copy kept | §4.6 item 10 |
| NB-17: orphaned table row | `| other | issue text |` moved into the warnings table | §4.6 item 9 |
| NB-18: CI claim | No self-hosted lint → test → build claim. The feature adds Vitest tests to the existing CI. `tests/e2e/proyectos.spec.ts` and `tests/e2e/equipo.spec.ts` must be updated. CI workflow cleanup is out of scope | §15 |

---

## Coordination with the UI/UX redesign (2026-11-07)

The redesign (`docs/specs/redesign/`, brief `docs/specs/source/redesign-spec.md`) runs alongside this feature without blocking it. Rules that bind both:

1. **Migrations are never renumbered by hand.** Whichever feature merges its migration second regenerates it with `drizzle-kit generate` on top of the current `main` right before merging.
2. **One Toaster.** Sonner's `<Toaster />` is mounted once in `app/layout.tsx` by whichever feature lands first; the other reuses it.
3. **`actionErrorText`** in `lib/errors.ts` has one signature; the second feature only adds codes.
4. **Deep link kept.** The redesign redirects `/actividades/[tramo]?project=<id>` to `/tareas?tramo=<key>&project=<id>&iniciar=1`, which opens the same Iniciar tramo sheet.
5. **Compat layer.** The redesign reads tramos, fases and `canSeeAdminData` through `lib/tramos/compat.ts`; when this feature lands, the compat layer re-exports its real implementations (`TramoBadge`, `tramoColorVar`, `fetchTramosNavAction`, `canSeeAdminData`).
