# Spec: UI/UX redesign, Mi espacio, Control de horario and assistant everywhere (Frontend)

**Status:** Ready for review · **Owner:** Oscar · **Date:** 2026-11-07
**Source brief:** `docs/specs/source/redesign-spec.md` (decisions there are final; this file doesn't revisit them).
**Companion:** `docs/specs/redesign/backend.md` (data model, migrations, scheduler, Gmail, assistant runtime). §7 here is the contract the backend must match.
**Visual source:** design canvas "Cincel UI Redesign" (https://claude.ai/artifact/QFQ2oCZE1P6XwYJbduq8p1). Frames are cited as `Frame.dc.html`. Each frame is literal markup: copy, sizes, colors and spacing in this spec come from those frames. When a frame and this spec disagree, this spec wins.

Conventions (from the repository guidelines and the existing app): Next.js 16 App Router, React 19, TypeScript, Server Actions in `lib/actions/*-actions.ts`, Drizzle/Postgres, plain shadcn/ui in `components/ui/shadcn` (variants only; **no custom-colored wrappers and no `className` color overrides: color comes only from tokens**), `DataTable`, `Sheet` drawers for editing, Spanish (Mexico) copy in sentence case. Types live in `lib/types/`. Actions throw `Error("CODE")` or `Error("CODE: detail")` and the UI maps the code to Spanish copy with `actionErrorText` (§9), the same mapper Project Flow specifies (whichever feature lands first creates it with the same signature).

No Zustand stores and no TanStack Query for this feature. Pages are server components that load initial data; client components keep local state, call server actions and refetch. `@tanstack/react-table` stays (through `DataTable`).

Vocabulary follows Project Flow: **Tramo** (Presale, Diseño, Construcción), **Fase**, **Espacio**, **Puesto**. Where the canvas says "Área" or shows a fourth "Decoración" color, read **Tramo** and the three tramo colors (§14.4).

---

## 1. Project overview

**What:** a lighter, consistent Cincel. One shell for every staff page; seven navigation destinations; one page header per page; three color **themes** (Azul Cincel, Cálido, Grafito, each light and dark) and three **presentation styles** (Visual, Esencial, Analítico) chosen by the organization and, if allowed, by each user. New personal workspace (**Mi espacio**: notes, checklists, reminders, inbox with Gmail), organization **Control de horario** (time tracking with a sidebar clock), and the **assistant on every page** with confirmations.

**Target users**
- Every staff member: Inicio, Mi espacio, Tareas, Proyectos, Personas, Biblioteca, Asistente, Ajustes › Perfil / Apariencia / Notificaciones / Integraciones.
- Administrators: Ajustes › Tema y estilo, Control de horario, General, Tramos y fases, Puestos, Estatus, Permisos, monday, Google; team hours report; vacation decisions.
- Clients: the portal (restyled, three styles).

**UX goals**
- Content starts within 96 px of the top of the page on desktop (one `PageHeader`, no global header).
- No font weight above 600. Page title 22 px. Icon buttons 36 px.
- The same data renders in three styles with identical numbers.
- Every action toward other people is confirmed (assistant, Gmail send).
- Every screen has explicit empty, loading and error states (§4.2).

**Non-goals**
- Cutto UI inside Cincel (calls, channels, voice rooms). Cincel only deep-links to Cutto (§4.9).
- Native apps. The mobile experience is responsive web (§4.1 `BottomTabs`).
- Moving the permission matrix out of localStorage.
- Rebuilding Cronograma, the monday wizard or the portal internals; they are restyled and put in the new shell.

---

## 2. Route architecture

### 2.1 Routes

| Route | Purpose | Auth | Frames |
|---|---|---|---|
| `/inicio` | Home: greeting, profile photo, KPIs and widgets in three styles | staff, `dashboard.canViewDashboard` | `Dashboard`, `InicioEsencial`, `InicioAnalitico`, `InicioCalido`, `InicioGrafito`, `InicioOscuro` |
| `/mi-espacio` | Personal workspace: capture, Bandeja, recordatorios, checklists, notas | staff (owner data only) | `MiEspacio`, `MiEspacioEsencial`, `MiEspacioAnalitico`, `MiEspacioGmail`, `NotaEditor`, `NuevoRecordatorio` |
| `/mi-espacio?nota=<id>` | Same page with `NoteEditor` open (search param; the page stays mounted) | owner | `NotaEditor` |
| `/tareas` | Unified tasks: `?vista=tablero\|lista\|calendario&cal=mes\|semana\|dia&tramo=&responsable=yo\|<id>&proyecto=&estado=&q=&tarea=<id>&nueva=1&project=<id>&iniciar=1` | staff, `activities.canViewActivities` | `Tareas`, `TareasLista`, `Calendario`, `CalendarioSemana`, `CalendarioDia` (+ Esencial/Analítico), `EventoDetalle` |
| `/tareas?tarea=<id>` | Same page with `TaskSheet` open over the current view (search param, so the board stays mounted; closing removes the param with `router.replace`) | staff | `TareaDetalle` |
| `/proyectos` | Project list in three styles; "Nuevo proyecto" dialog | `projects.canViewProjects` | `Proyectos`, `ProyectosEsencial`, `ProyectosAnalitico`, `NuevoProyecto` |
| `/proyectos/[id]` | Project Resumen tab | `canViewProjects` | `Proyecto`, `ProyectoEsencial`, `ProyectoAnalitico` |
| `/proyectos/[id]/tareas` | Project tasks by fase | `canViewProjects` | `ProyectoTareas` (+ variants) |
| `/proyectos/[id]/cronograma` | Existing Cronograma in the new shell + styles | `canViewProjects` | `ProyectoCronograma` (+ variants) |
| `/proyectos/[id]/cronograma/reporte` | Existing printable report, restyled | `canViewProjects` | `ProyectoReporte` |
| `/proyectos/[id]/archivos` | Existing files browser, restyled + styles | `canViewProjects` | `ProyectoArchivos` (+ variants) |
| `/proyectos/[id]/clientes` | Existing portal access panel, restyled | `portal.manageAccess` | `ProyectoClientes` |
| `/proyectos/[id]/ficha` | Existing ficha form, restyled | `canViewProjects` (admin fields per Project Flow) | `ProyectoFicha` |
| `/personas` | Equipo tab | `team.canViewTeam` | `Personas` (+ variants) |
| `/personas/clientes` | Clients (from Directorio) | `clients.canViewClients` | `PersonasClientes` (+ variants) |
| `/personas/contratistas` | Contractors (from Directorio) | `clients.canViewClients` | `PersonasContratistas` (+ variants) |
| `/personas/proveedores` | Suppliers (from Directorio), sub-filter Colaboradores / Contratistas / Tiendas | `clients.canViewClients` | `PersonasProveedores` (+ variants) |
| `/personas/equipo/[id]` | Person detail | `team.canViewTeam` | `PersonaDetalle` (+ variants) |
| `/biblioteca` | Recursos + Empresa catalog | `resources` view rules | `Biblioteca` (+ variants) |
| `/biblioteca/[seccion]` | A resource section (`formacion`, `formatos-obra`, `plantillas-diseno`, `mis-documentos`, `mis-favoritos`) | `canViewResourceSection` | `BibliotecaSeccion` (+ variants) |
| `/biblioteca/empresa/[doc]` | Company document (`book`, `manual-de-la-empresa`, `imagen-de-la-empresa`, `rfc`, `politicas-de-la-empresa`) | `canViewResourceSection` | `BibliotecaDocumento` |
| `/biblioteca/vacaciones` | Mis vacaciones (balance, request, history, team strip, documents of the old `mis-vacaciones` section) and, for `canDecideVacations`, "Solicitudes del equipo" | staff | `MisVacaciones` (+ variants) |
| `/asistente` | Full-page assistant with history and tools panel | `requireCapabilityUser` (existing) | `AsistentePagina` |
| `/ajustes` | Redirects to `/ajustes/apariencia` | staff | — |
| `/ajustes/perfil` | Profile (photo, data, signature, password) | staff | `Perfil` |
| `/ajustes/apariencia` | Theme, mode, style, density, text size, redesign toggle | staff | `Ajustes` |
| `/ajustes/notificaciones` | Kind × channel matrix, quiet hours (digest fixed at 07:30) | staff | `AjustesNotificaciones` |
| `/ajustes/integraciones` | Gmail, Google Calendar, Drive, Cutto (links), monday | staff | `AjustesIntegraciones` |
| `/ajustes/general` | Organization data (existing `GeneralSettingsWorkspace`, restyled) + header links | admin | `AjustesGeneral` |
| `/ajustes/tema` | Organization theme and style editor | `canManageAppearance` (server guard, §8) | `AjustesAdmin` |
| `/ajustes/horario` | Control de horario settings (`canManageTimeTracking`) + team report (`canViewTeamHours`, three styles) | server guard: either capability (§8) | `AjustesHorario` (+ variants) |
| `/ajustes/tramos` | Project Flow "Tramos y fases" page, rendered here when Project Flow's page exists; otherwise the route 404s and `AjustesNav` hides the item (§21.2) | admin | `AjustesAreas` (layout reference only) |
| `/ajustes/puestos` | Project Flow "Puestos" page, same rule as Tramos | admin | — |
| `/ajustes/estatus` | Existing `EstatusClient`, restyled | admin | `AjustesEstatus` |
| `/ajustes/permisos` | Existing `PermissionsWorkspace`, restyled (storage unchanged) | admin | `AjustesPermisos` |
| `/ajustes/monday` | Existing monday wizard + import history | admin (bootstrap rule unchanged) | `AjustesMonday`, `BienvenidaMonday` |
| `/ajustes/google` | Existing Google settings and group mappings | admin | `BienvenidaGoogle` (wizard) |
| `/login`, `/login/denegado`, `/change-password` | Restyled auth pages | public / session | `Login`, `LoginDenegado`, `CambioContrasena` |
| `/portal/*` | Restyled portal; project page in three styles | portal session | `PortalLogin`, `PortalProyecto` (+ variants), `Portal404` |

`AjustesWorkflows.dc.html` (automation rules) is a visual reference for a later feature; no route in this spec.

### 2.2 Redirects

Old `page.tsx` files become server `redirect()` stubs (bookmarks keep working). Query strings are preserved where they map.

| Old route | New route |
|---|---|
| `/`, `/dashboard` | `/inicio` |
| `/tablero` | `/tareas?vista=tablero` |
| `/mis-tareas` | `/tareas?vista=lista&responsable=yo` |
| `/calendario` | `/tareas?vista=calendario` |
| `/actividades/general` | `/tareas?vista=lista` |
| `/actividades/[tramo]` | `/tareas?vista=lista&tramo=[tramo]`; with `?project=X` (Project Flow's start deep link) → `/tareas?vista=lista&tramo=[tramo]&project=X&iniciar=1` |
| `/equipo` | `/personas` |
| `/directorio` | `/personas/clientes` |
| `/clientes`, `/contratistas`, `/proveedores/*` | `/personas/clientes`, `/personas/contratistas`, `/personas/proveedores` |
| `/recursos` | `/biblioteca` |
| `/recursos/[seccion]` | `/biblioteca/[seccion]`; `mis-vacaciones` → `/biblioteca/vacaciones` |
| `/recursos/empresa`, `/recursos/empresa/[doc]` | `/biblioteca`, `/biblioteca/empresa/[doc]` |
| `/profile` | `/ajustes/perfil` |
| `/configuracion`, `/configuracion/[x]` | `/ajustes/apariencia`, `/ajustes/[x]` (`workflows` → `tramos`, `areas` → `puestos`, `importar-monday` → `monday`, `google/primeros-pasos` → `/ajustes/google/primeros-pasos`) |
| `/tareas/[id]`, `/mi-espacio/notas/[id]` (canonical link forms returned by search and notifications, BE §7.3) | `/tareas?tarea=[id]`, `/mi-espacio?nota=[id]` (server `redirect()`, so the sheet opens over the mounted view) |

### 2.3 Feature flag and route group

- **Flag:** `UserPreferences.redesignEnabled` (default `OrgAppearance.redesignDefault`). `resolveAppearance` forces it to `false` when the org kill switch `OrgAppearance.redesignAvailable` is `false`, and `updateMyPreferencesAction({ redesignEnabled: true })` then throws `DISABLED`. There is no client-only kill switch.
- **Route group:** every staff page moves once into `app/(staff)/` (Phase 1, §20). `app/(staff)/layout.tsx` is a server component that reads preferences server-side:
  - **flag on** → renders `AppShell` around `children`;
  - **flag off** → renders `children` bare. Legacy pages keep their own `Sidebar` + `Header` imports and render exactly as today until the Cleanup phase. A page that has been restyled renders `LegacyFrame` (thin wrapper that mounts the old `Sidebar` + `Header`) in its flag-off branch, so the flag-off path never loses the old shell and the flag-on path never shows two sidebars.
- **New-only routes** (`/inicio`, `/mi-espacio`, `/tareas`, `/personas*`, `/biblioteca*`, `/ajustes/*`) redirect to their legacy equivalent when the flag is off (e.g. `/inicio` → `/dashboard`, `/ajustes/apariencia` → `/dashboard`). **Legacy routes** redirect to the new ones when it is on (§2.2). Routes that exist in both worlds (`/proyectos/*`, `/asistente`) never redirect; they render inside or outside `AppShell` by the layout rule above.
- **Opt-in without navigation:** a dismissible banner on the legacy dashboard ("Prueba el nuevo diseño" + "Activar") and an entry in the legacy avatar/user menu ("Probar el nuevo diseño") call `updateMyPreferencesAction({ redesignEnabled: true })` directly and then `router.refresh()`. In the new shell, the avatar menu has "Volver al diseño anterior" (`redesignEnabled: false`). Neither path goes through an admin page.
- **Legacy look unchanged while the flag is off (B17):** when `resolveAppearance(...).redesignEnabled` is false, the root layout renders exactly today's pipeline — the `primary-color` style block, the `globals.css` grayscale (Grafito) values and `ThemeToggle` with `data-theme`. The new `<style id="appearance">` block, the `<html>` appearance attributes (`data-theme`, `data-theme-id`, `data-style`, `data-density`) and the system-mode head script are emitted **only** when `redesignEnabled` is true. `app/globals.css` keeps today's Grafito values as the fallback until Phase 9. The org seed defaults to Azul, but it is rendered only for flag-on users.
- The flag value reaches the server through the `cincel-appearance` cookie (§4.1) and is re-validated from the DB in the layout; redirect stubs check it server-side, so there is no client flash.
- The Cleanup phase deletes the flag, `LegacyFrame`, the old shell and the stubs' conditional branch (stubs keep redirecting).

---

## 3. Page inventory

Notation: **RSC** = server component (`page.tsx`), **CC** = client component. "Style" = the user's resolved presentation style (§15). Every data page renders `PageHeader` with `EstiloSwitch` in its actions; the switch persists the preference (no route change). Layout numbers are desktop at 1440 px; the main column has `padding: 0 28px 40px` and `gap: 16px` (`shape.gap`).

Every page lists its states. Standard states (§4.2):
- **Loading:** route `loading.tsx` renders `LoadingSkeleton` matching the page (variants `kpis`, `cards`, `list`, `table`).
- **Empty:** `EmptyState` with the copy given per page.
- **Error:** route `error.tsx` renders `ErrorState` ("No se pudo cargar esta página." + "Reintentar").

**Composition rule (reuse first):** every page below is built from the widget library (§4.10) and the shared patterns (§4.11). The per-style descriptions in this section describe what the **widgets** render in each style; pages pass one data shape per widget and never write per-style markup. Each subsection lists its widgets in a **Widgets** line (full mapping in §4.10.2).

### 3.1 Shell (every staff page)

Frames: `Sidebar`, every screen frame, `Movil*`.
- **Sidebar** (248 px, `sidebar` token background, right border `sidebar-border`): logo block (30 px square mark + "CINCEL" letter-spaced 0.14em + system name), search button ("Buscar" + `⌘K`) opening `CommandPalette`, `TimeClock` card (only when time tracking is enabled for the viewer, §3.13), nav items (36 px, radius 10, icon 17 px stroke 1.8): Inicio, Mi espacio (badge = `unreadCount` + my open reminders still due today), Tareas (badge = my open tasks), Proyectos, Personas, Biblioteca, Asistente — count badges are the Badge `count` variant (mono 11 px, primary tint) and hide at 0; section "Áreas" with the tramos (9 px color square in the tramo's chart color + name) linking `/tareas?tramo=key`; spacer; footer: Ajustes item, user block (avatar 30 px + name + access role; the name links `/ajustes/perfil`; avatar opens a menu: Perfil, Apariencia, Instagram / Sitio web / Correo links from General settings, "Cerrar sesión").
- Active item: `sidebar-primary` background, `sidebar-primary-foreground` text, weight 500.
- **Assistant button**: fixed bottom-right, 48 px pill "Pregúntale a Cincel" + `⌘J` hint, opens `AssistantSheet` (§3.12). Hidden on `/asistente`.
- **Toaster**: exactly one shadcn `sonner` `<Toaster position="bottom-right" offset={72} />`, mounted in the root `app/layout.tsx` by Phase 1 (so it serves both shells). Project Flow Phase 2 must not add a second one (§21.2).
- **Badges freshness:** the layout computes `unreadCount`, today's due reminders and my open tasks on each full render; the client keeps them fresh from the Bandeja poll (`fetchNotificationsAction({ unreadOnly: true })`, 60 s while visible) and re-reads my open tasks after task mutations.
- **Mobile (< 768 px)**: Sidebar hidden; `BottomTabs` (Inicio, Tareas, Mi espacio, Proyectos, Más → `Sheet` with the rest); compact top bar with page title, `TimeClock` compact (when enabled) and avatar (frames `MovilInicio`, `MovilTareas`, `MovilMiEspacio`, `MovilProyecto`). Touch targets ≥ 44 px.

### 3.2 `/inicio`

Frames: `Dashboard` (Visual), `InicioEsencial`, `InicioAnalitico`; theme references `InicioCalido`, `InicioGrafito`, `InicioOscuro`.
- **Widgets:** `KpiWidget`, `DistributionWidget`, `WidgetCard` + chart line, `AttentionListWidget`, `AgendaWidget`, `ProgressListWidget`, `PeopleWidget` (§4.10).
- **RSC** loads `fetchInicioAction()`, `fetchMyPreferencesAction()`, photo URL. **CC** `InicioClient`.
- **Header block** (replaces `PageHeader` on this page only): avatar 72 px (photo or initials on `secondary`), camera button 28 px (`primary`) opening a file picker (`accept="image/jpeg,image/png,image/webp"`); the client re-encodes the image through `<canvas>` to JPEG ≤ 1024 px (this drops EXIF, including GPS) and uploads it to `POST /api/staff/me/photo` (route handler, 2 MB limit, EXIF/XMP metadata also stripped server-side; `TOO_LARGE`, `INVALID_TYPE`, `RATE_LIMITED`); "Buenos días, {firstName}" (22/600; "Buenas tardes" after 12:00, "Buenas noches" after 19:00), role line, date line "viernes, 6 de noviembre · {n} eventos hoy · {m} tareas vencidas" (`Intl.DateTimeFormat("es-MX")`, lowercase). Right: "Nueva tarea" (primary) → `/tareas?nueva=1`, and `EstiloSwitch`.
- **Visual**: KPI row (4 tiles: Proyectos activos, Vencidas, Bloqueadas, Revisiones · 7 días; number 30/500, 7-point sparkline, delta pill, tramo split bar, caption); "Tareas abiertas por tramo" donut (ring 5.5/42, center total, legend with count and %); "Ritmo semanal" line chart (8 weeks, Completadas solid `chart-1` with area, Creadas dashed `chart-4`, horizontal grid only); "Requiere atención" list (left 4 px tramo bar, title links `/tareas?tarea=<id>`, project · tramo, reason pill, avatar, due date mono `destructive`); "Mi día" agenda (time mono + tinted event block) with "Sin revisiones en los próximos 7 días" dashed empty line; "Avance de proyectos activos" bars; "Carga por persona" stacked bars (En proceso / Pendiente / Vencida) with legend.
- **Esencial**: max-width 980; one card of four big numbers + labels; two-column "Requiere atención" (title, "proyecto · persona · motivo fecha") and "Mi día" (time + title + project); three lists: tareas abiertas por tramo, avance de proyectos (name … %), carga por persona (name … n tareas). No charts, no tints, no avatars.
- **Analítico**: KPI table (Indicador, Hoy, Δ 7 días, Prom. 30 días, Mín – máx 30 d, Tendencia 7 d sparkline 72×18) incl. "Completadas · semana"; "Tareas por tramo" table (Abiertas, Vencidas, % venc. heat cell, Días prom., Total row); "Ritmo semanal" table (Semana, Creadas, Completadas, Neto colored text); "Requiere atención" table (Tarea, Proyecto, Tramo dot, Resp. initials, Motivo, Vence, Retraso); "Proyectos activos" table (Real, Plan, Desv., Presup.); "Carga por persona" table (En proceso, Pendiente, Vencidas, Total).
- **Empty:** no projects → `EmptyState` "Aún no hay proyectos activos" + "Nuevo proyecto". No tasks needing attention → line "Nada requiere atención hoy".
- **Visibility (B8):** project/task scoping by `scopeDashboardProjects/Tasks` (existing). For viewers without `canSeeAdminData` (§21.2 compat), `attention`, `myDay`, `projectsProgress[].next` and KPI counts exclude admin tasks (Project Flow `kind = "admin"`) and never include client/origin fields; the server applies this, the page renders what it gets.
- **Per-style KPIs:** "Completadas · semana" has `visibleIn: ["analitico"]`; `KpiWidget` filters by `visibleIn` internally (the page never checks the style).

### 3.3 `/mi-espacio`

Frames: `MiEspacio` (+ `MiEspacioEsencial`, `MiEspacioAnalitico`), `MiEspacioGmail`, `NotaEditor`, `NuevoRecordatorio`.
- **Widgets / patterns:** `RecordTable` (Bandeja, recordatorios, checklists index), `EntityCardGrid` (notas), `AgendaWidget`, `WidgetCard`; editors are `FormSheet` / `FormDialog` (§4.10, §4.11).
- **RSC** loads notifications (first page), Gmail status + first threads (when connected), reminders (today/tomorrow), checklists, notes. **CC** `MiEspacioClient`.
- Header: "Mi espacio" + chip "Solo tú lo ves" (lock icon); description "Tu bandeja, notas, checklists y recordatorios."; `EstiloSwitch`.
- **QuickCapture** card: input "Escribe una nota, “recuérdame mañana 9am llamar a Juanma” o “- [ ] checklist”"; buttons "Nota", "Checklist", "Recordatorio". Enter: text starting with "- [ ]" → `createChecklistAction`; text parsed by `parseReminderTextAction` with a `dueAt` → opens `ReminderDialog` prefilled; otherwise → `createNoteAction`.
- **Inbox** (left, flexible): header "Bandeja" + Gmail status chip ("Gmail conectado · sincronizado hace {n} min" `success`; or "Conectar Gmail" link to `/ajustes/integraciones`). Tabs (links with counts): Todo, Gmail, Notificaciones, Menciones. Rows: 34 px icon chip, sender/source, time mono, subject (600 when unread), snippet, source chip, for Gmail rows "Crear tarea" (`createTaskFromGmailThreadAction` via a small project picker) and "Vincular a proyecto" (`linkGmailThreadToProjectAction`). Clicking a Gmail row opens the reading pane (frame `MiEspacioGmail`): headers, body rendered in an `<iframe sandbox srcdoc>` (sanitized HTML; remote images blocked by default with "Mostrar imágenes"), attachments list (each a download link to `GET /api/gmail/attachments/[messageId]/[attachmentId]`), actions "Responder" (opens `GmailDraftSheet`: each save calls `createGmailDraftAction` with the current `draftId`, so Gmail updates one draft; "Enviar" → `FormDialog` "¿Enviar este correo a {destinatarios}?" → `sendGmailDraftAction(draftId, confirmToken)`; on `EXPIRED` the dialog re-saves the draft to get a new token), "Crear tarea", "Vincular a proyecto" with suggested project chip. Linking shows the note "El asunto del correo quedará en la bitácora del proyecto." because the backend writes the subject to project history. Notification rows link to their `url` and mark read. Footer: "Los correos con el nombre de un proyecto se sugieren para vincular." + "Ajustes de Gmail".
- **Right column:** "Recordatorios" (hoy y mañana; bell icon, text, context, time mono; overflow menu Posponer 1 h / Mañana / Cancelar), "Checklists" (title, n/m, progress bar, checkbox items toggling with `toggleChecklistItemAction`, add item input).
- **Notas** grid (`minmax(220px,1fr)`): tinted cards by `note.color` (tints via `color-mix`, §14.5), pin icon, body with line breaks, meta "editada hoy"; "Nueva nota" (primary) opens `NoteEditor`.
- **NoteEditor** (Sheet right, 560 px): title input, toolbar (bold, italic, lista, checklist, enlace) on a textarea with markdown, color swatches (neutral, blue, amber, violet, cyan → token tints), pin switch, "Convertir en tarea" (opens `NewTaskDialog` prefilled), footer "Guardar" / close.
- **ReminderDialog** (Dialog): text, parsed preview chip ("mañana 9:00"), date + time inputs, Repetir select (No se repite, Diario, Semanal, Mensual), vincular a tarea/proyecto (combobox), Avisar por (En la app, Correo), "Crear recordatorio".
- **Esencial**: inbox and reminders as plain lists (15 px), notes as white cards with title and text, checklists as text lists with checkboxes; no chips or tints.
- **Analítico**: inbox table (Origen, De, Asunto, Proyecto, Recibido, Estado), reminders table (Texto, Cuándo, Repite, Vinculado, Canales), checklists table (Lista, Hechos, Total, %), notes index table (Título, Color, Fijada, Editada).
- **Empty:** Bandeja empty → "Todo al día" + "No tienes notificaciones ni correos sin leer."; no notes → "Escribe tu primera nota" + button; no reminders → "Sin recordatorios para hoy y mañana".
- **Permissions:** owner only (server filters by session).

### 3.4 `/tareas`

Frames: `Tareas` (+ `TareasEsencial`, `TareasAnalitico`), `TareasLista` (+ variants), `Calendario`, `CalendarioSemana` (+ variants), `CalendarioDia`, `TareaDetalle`, `NuevaTarea`, `EventoDetalle`.
- **Widgets / patterns:** `ListPage` + `FiltersBar`, `RecordTable`, `DistributionWidget`, `AgendaWidget`, `StatusChip`, `TramoBadge`; `TaskSheet` = `FormSheet`, `NewTaskDialog` = `FormDialog` (§4.10, §4.11). The Visual board columns are the only non-widget surface (existing `TableroClient` drag-and-drop).
- **RSC** reads search params (`TareasQuery`, §4.6), loads `fetchBoardAction` / `fetchTasksAction` / `fetchCalendarAction` (existing) for the selected view and filters, `fetchAssignableStaffAction`, workflows (tramos). **CC** `TareasClient`.
- **Header:** "Tareas" + description "Todas los tramos en un solo lugar. Arrastra una tarjeta para cambiar su estatus." (tablero) / "Fechas de entrega y agenda del equipo. Las horas con ≈ son estimadas." (calendario); view switch (segmented links Tablero / Lista / Calendario, 30 px items on `muted`); `EstiloSwitch`; "Nueva tarea" (primary) → `NewTaskDialog`.
- **Filters bar:** tramo chips (Todas + tramo color square + count; `aria-pressed`), "Responsable: Yo ▾" (combobox: Yo, Todos, people), "Proyecto ▾" (combobox), search. Filters write the URL (`router.replace`, no scroll). "Mis tareas" is "Responsable: Yo".
- **Tablero / Visual:** columns 290 px on `muted` background (radius 14, padding 10): status ring + name + count; cards (white, radius 12): tramo chip (tint + ink + dot), priority text, title (link `/tareas?tarea=<id>`), project, subtask progress bar + n/m, avatar + name, due date mono (`destructive` when overdue); "+ Agregar" quick-add at the end of each open column (`TaskBoardWidget` `onQuickAdd(columnKey)`, wired by `TareasTablero`): opens `NewTaskDialog` with `defaults.status` = that column; after `createUserTaskAction` the dialog sets the status (`setTaskStatusAction` / `setTaskCustomStatusAction`) and refreshes, so the card lands in the column. Empty status columns collapse to 52 px vertical strips (ring, "0", vertical label). Drag-and-drop between columns calls `setTaskStatusAction` (existing) with optimistic move and rollback on error.
- **Tablero / Esencial:** list grouped by estatus with counts ("Pendiente · 4"), rows title / project / responsable / due as text; Completado collapsed with a link to the list view.
- **Tablero / Analítico:** estatus summary strip (count and % per estatus, "vencidas / abiertas" cell) + 10-column table (Tarea, Proyecto, Tramo, Fase, Responsable, Estatus, Prioridad, Vence, Días de retraso, Subtareas) with a totals row.
- **Lista / Visual:** grouped table (Pendiente, En proceso, Completado collapsed with count): checkbox, tarea (link), proyecto, tramo chip, responsable avatar+name, vence, prioridad, subtareas progress.
- **Lista / Esencial:** groups Vencidas / Esta semana / Más adelante, text rows.
- **Lista / Analítico:** by-project table (Abiertas, Vencidas, % vencidas heat, retraso promedio) above the detailed table sorted by delay.
- **Calendario** (`cal=mes|semana|dia`; existing `UnifiedCalendar` logic, new presentation): toolbar "Hoy", prev/next (`aria-label` "Mes anterior"/"Mes siguiente"), title "noviembre de 2026", tramo legend, Mes/Semana/Día segmented links; right aside: selected day agenda ("viernes 6", "4 eventos"), "Entregas por semana" stacked bars, "Sincronizar con Google Calendar" (existing `CalendarFeedDialog`).
  - Mes / Visual: 7-column grid, 112 px cells, events as tinted blocks with 3 px tramo left border (`Calendario`), "+n más", today = `primary` circle.
  - Mes / Esencial: agenda list grouped by day. Mes / Analítico: calendar shaded by daily load (counts) + tramo summary + table of the month's deliveries.
  - Semana / Visual: time grid 8:00–19:00 + all-day row for due dates (`CalendarioSemana`). Esencial: day-by-day list. Analítico: daily summary (shaded, Δ vs last week) + events table (Día, Hora, Duración, Proyecto, Tramo, Asistentes) with daily subtotals.
  - Día: single-day timeline with a "now" line + "Vence hoy" panel (`CalendarioDia`; one style only, the agenda is already a list).
  - Event click → `EventDetailPopover` (`EventoDetalle`): title, time, project chip, attendees, location, linked tasks, "Abrir en Cutto" only when the event carries a stored Cutto URL (`AgendaItem.meetingUrl` non-null; until Cutto's API exists, only URLs pasted into the event), "Editar" / "Eliminar".
- **TaskSheet** (`/tareas?tarea=<id>`, Sheet 520 px, frame `TareaDetalle`): header status select + close (back), title (inline edit), properties grid (Estatus, Responsable, Proyecto, Tramo, Fase, Espacio, Fecha compromiso, Revisión, Prioridad), descripción, subtareas checklist with progress, adjuntos thumbnails, actividad/comentarios timeline (existing history), comment composer with "@" mentions. Uses existing task actions. Close removes `tarea` from the URL (`router.replace`), so the view underneath never unmounts. Fase and Espacio fields render only when that data exists (§21.2 compat).
- **NewTaskDialog** (frame `NuevaTarea`): Título, Proyecto, Tramo, Fase (Project Flow catalog; hidden when the tramo has none), Responsable, Fecha de entrega, Prioridad (segmented), Descripción, Subtareas, link "Usar plantilla del tramo"; "Cancelar" / "Crear tarea" (existing `createUserTaskAction`).
- When `tramo` is a single tramo and Project Flow's contracts exist (Q2), the Lista view shows Project Flow's "Listos para iniciar" / "Próximos" cards above the table and its `StartTramoSheet`; `project=X&iniciar=1` (from the `/actividades/[tramo]?project=X` redirect) opens that sheet for project X, preserving Project Flow's deep link. Without Project Flow, nothing renders there and `iniciar` is ignored.
- **Empty:** no tasks for filters → "No hay tareas con estos filtros" + "Quitar filtros". **Permissions:** existing activities capabilities.

### 3.5 `/proyectos` and `/proyectos/[id]/*`

Frames: `Proyectos` (+ variants), `NuevoProyecto`, `Proyecto` (+ variants), `ProyectoTareas`, `ProyectoCronograma`, `ProyectoArchivos` (+ variants), `ProyectoClientes`, `ProyectoFicha`, `ProyectoReporte`.
- **Widgets / patterns:** `ListPage`, `EntityCardGrid`, `RecordTable`, `DistributionWidget`, `ProgressListWidget`, `KpiWidget`, `PhaseStepper`, `WidgetCard`; `NewProjectDialog` = `FormDialog` (§4.10, §4.11).
- **List RSC:** `fetchProjectsAction` + `fetchProjectsPortfolioAction` (Annex C). Header "Proyectos" + "{n} activos · avance, fase y entregas de cada obra."; search; `EstiloSwitch`; "Nuevo proyecto" → `NewProjectDialog` (frame `NuevoProyecto`; fields per Project Flow: name only for non-admins, client/origin for admins).
  - Visual: "Proyectos por tramo" strip (one flexible segment per tramo, flex = count, tint background, 3 px bottom border, count + name); cards grid `minmax(300px,1fr)`: tinted 84 px head with tramo chip and progress ring 52 px, name, place, tramo step bar, "n abiertas · m vencidas", team avatars, next delivery row.
  - Esencial: phase summary line + plain list (nombre, lugar, tramo, % as text, próxima entrega).
  - Analítico: phase summary table with totals + portfolio table (Real, Plan, Desv., Presup. ejercido (admins only; the column is absent for others), Abiertas, Vencidas, Días a entrega, Próxima entrega, sparkline, totals row). "Próxima entrega" never names an admin task (server rule, B8).
- **Project shell** (`ProjectTabs` + header, all tabs): breadcrumb "Proyectos / {name}", 48 px icon tile, name 22/600, tramo chip, meta line "{tipo} · {ciudad} · Responsable: {name}", actions "Reporte" (outline → `/cronograma/reporte`) and "Nueva tarea", tabs: Resumen, Tareas (count), Cronograma, Archivos (count), Clientes (count; shown with `portal.manageAccess`), Ficha. `EstiloSwitch` right-aligned under the tabs on data tabs.
- **Resumen** Visual: tramo stepper (done ✓ / current / next, date ranges), progress ring 64 px "Avance · 32 de 39 tareas", budget bar "Presupuesto · ejercido [MONTO] de [MONTO]" (admins only), mini Gantt "Cronograma de obra" (partidas, month grid, today line), "Archivos recientes" grid, "Ficha" key/value list, "Cliente y contactos" (with a Cutto chat link per staff contact). **Visibility (B8):** the card renders when `canSeeAdminData(user)` or when the viewer is a member of the project (responsable, coordinador or miembro) **and** has `clients.canViewClients`; otherwise it is absent from the DOM. The staff-contacts part (team) is always visible. Esencial: summary, tramos, partidas, files, ficha, contacts as text lists. Analítico: indicators table, partidas table, budget by item table ([MONTO]), tramos table, folders table, contacts table.
- **Tareas tab:** tasks grouped by fase/partida with progress per group, rows (estatus, tarea → `/tareas?tarea=<id>`, responsable, vence, subtareas), filters, "+ Agregar tarea" per group. Esencial: one card per group with text rows. Analítico: per-group summary + dense table.
- **Cronograma tab:** existing `cronograma-view` content; Visual = existing panels in the new card style; Esencial = partidas with dates and % as text + milestones; Analítico = `RecordTable` directly (Partida, Responsable, Inicio, Fin, Duración, % real, % plan, Desviación, Holgura, monthly text timeline), via the `ListPage` widget spec (§4.11).
- **Archivos tab:** existing `ProjectFilesBrowser` behavior; Visual = folders + cards + detail panel (frame `ProyectoArchivos`); Esencial = plain list; Analítico = `RecordTable` directly: storage by folder and type + file table (Nombre, Carpeta, Tipo, Tamaño, Versión, Autor, Modificado).
- **Clientes**, **Ficha**, **Reporte:** existing behavior in the new shell and tokens (no styles; forms/print).
- **Empty:** no projects → "Aún no hay proyectos" + "Nuevo proyecto"; no files → "Este proyecto aún no tiene archivos" + upload.

### 3.6 `/personas` and `/personas/*`

Frames: `Personas`, `PersonasClientes`, `PersonasContratistas`, `PersonasProveedores`, `PersonaDetalle` (+ variants).
- **Widgets / patterns:** `ListPage`, `PeopleWidget`, `RecordTable`, `EntityCardGrid`, `KpiWidget`, `ProgressListWidget`, `AttentionListWidget` (§4.10, §4.11).
- **Header:** "Personas" + "Equipo interno y directorio externo en un solo lugar."; tabs (links, with counts): Equipo, Clientes, Contratistas, Proveedores; `EstiloSwitch` (tab links keep the style); "Agregar persona" (opens the existing member/contact editors per tab).
- **Equipo** (RSC: `fetchStaffAction`, `fetchPeopleOverviewAction` Annex C): Visual = "Disponibilidad esta semana" grid (5 days, libre/ocupado/saturado/vacaciones legend) + person cards (avatar 44, name → `/personas/equipo/[id]`, puesto (Project Flow; access role is not shown as puesto), tramo chip, "n proyectos", load bar colored by %, actions "Ver tareas", correo, "Abrir chat en Cutto" link). Esencial = directory list with availability as a sentence ("Libre jue y vie"). Analítico = table (Abiertas, Vencidas, Horas semana*, % ocupación heat, Proyectos activos, Último contacto) with averages row. *Horas only when the server returns them (`canViewTeamHours` or self, B4); otherwise the column is absent.
- **Clientes / Contratistas / Proveedores**: existing Directorio data (`fetchContactsAction`), rendered per frame; `?contacto=<contactId>` (from search results) opens the existing `ClientDetailSheet` for that contact; Proveedores has sub-filter chips Colaboradores / Contratistas / Tiendas. Existing `ClientDetailSheet` / `ContactEditorSheet` stay. Esencial/Analítico per frames (Analítico adds cotizaciones 90 d and tiempo de entrega only when the data exists; otherwise the column is omitted).
- **Detalle** (`fetchPersonaDetailAction`): header (avatar, puesto, tramo, contact buttons incl. "Abrir chat en Cutto"), stats (abiertas, vencidas, horas esta semana*), proyectos, tareas asignadas, disponibilidad strip, actividad reciente (`recentActivity`: Visual dot + sentence + mono time, Esencial sentence over time, absent in Analítico; empty "Sin actividad reciente"). Esencial/Analítico per frames.
- **Empty:** "Aún no hay {clientes/contratistas/proveedores}" + "Agregar".

### 3.7 `/biblioteca`, `/biblioteca/[seccion]`, `/biblioteca/empresa/[doc]`, `/biblioteca/vacaciones`

Frames: `Biblioteca`, `BibliotecaSeccion`, `BibliotecaDocumento`, `MisVacaciones` (+ variants).
- **Widgets / patterns:** `EntityCardGrid`, `ListPage` + `RecordTable`, `KpiWidget` (saldo), `AgendaWidget` (ausencias), `FormSheet` (`VacationForm`) (§4.10, §4.11).
- Uses existing `ResourcesWorkspaceServer` data and resource actions. Header "Biblioteca" + search + `EstiloSwitch`.
- Index Visual: section "Empresa" (cards: Book, Manual de la empresa, Imagen de la empresa, RFC, Políticas de la empresa) and "Recursos" (Formación, Formatos de obra, Plantillas de diseño, Mis documentos, Mis favoritos, Mis vacaciones), each card icon chip + count + updated; "Abiertos recientemente" row (from `cincel.resources.recent-docs.v1`, unchanged). Esencial: plain lists. Analítico: catalog table (Sección, Documentos, Actualizado). Views/downloads columns shown in the frames are deferred (no tracking exists).
- Sección: breadcrumb, filters (tipo, tramo), table/grid with open/download and favorite toggle (existing behavior).
- Documento: left TOC, reading column, right panel (versión, actualizado por, "Descargar PDF", "Preguntar al asistente sobre este documento" → opens `AssistantSheet` with the document in context).
- Vacaciones: balance (Disponibles / Tomados / Pendientes ring + bars), `VacationForm` (Desde, Hasta, Tipo, Comentario, "Enviar solicitud" → `requestVacationAction`), history table with status chips (cancel pending → `cancelVacationRequestAction`), team strip for the month (`fetchTeamAbsencesAction`; absences show the kind only when the server returns it, otherwise "Ausencia" — the kind is returned only to the owner and to `canDecideVacations`, B12), and a "Documentos" section listing the existing `resource_links` rows of section `mis-vacaciones` (existing resource actions), so nothing is lost behind the redirect.
- **Solicitudes del equipo** (only for `canDecideVacations` = Administrador, Dirección): `RecordTable` of pending requests (Persona, Desde, Hasta, Días, Tipo, Comentario, Solicitada) with row actions "Aprobar" / "Rechazar" (`FormDialog` with optional note → `decideVacationAction`); a requester never sees their own row there. Below it, for the same viewers, a `SettingsSection` "Días de vacaciones": "Días por año" (org default) and a per-person override table (Persona, Días; empty = default) → `fetchVacationSettingsAction` / `saveVacationSettingsAction` (placed here, not in Ajustes › General, because Dirección decides vacations but can't open General).
- Esencial/Analítico per frames.

### 3.8 `/ajustes/*`

Frames: `Ajustes`, `AjustesAdmin`, `AjustesHorario` (+ variants), `Perfil`, `AjustesNotificaciones`, `AjustesIntegraciones`, `AjustesGeneral`, `AjustesAreas`, `AjustesEstatus`, `AjustesPermisos`, `AjustesMonday`, component `AjustesNav`.
- **Patterns:** every Ajustes page is `SettingsSection` / `SettingsRow` (§4.11); the team hours report is a `RecordTable`; confirmations are `FormDialog`.
- Layout: `PageHeader` "Ajustes" + "Tus preferencias y, si eres administrador, las de la organización."; left `AjustesNav` (240 px; group "Personal": Perfil, Apariencia, Notificaciones, "Gmail, calendario y Cutto"; group "Organización", each item with an "Admin" badge and rendered only when the viewer has the **same capability that guards its segment** (table in §8), absent from the DOM otherwise; Tramos y fases and Puestos also only when Project Flow's pages exist); right content as `SettingsSection`s.
- **Server guards (B4, R2):** personal pages live in `app/(staff)/ajustes/(personal)/`. Each organization segment has **its own** `app/(staff)/ajustes/(admin)/<segment>/layout.tsx` that calls `requirePageCapability(cap)` with that segment's capability (§8) and calls `notFound()` on failure — everywhere, including direct URL access. There is no shared admin layout and the client `AppRouteGuard` prefix check is not relied on for `/ajustes`. On `/ajustes/horario`, the settings sections need `canManageTimeTracking` and the report section `canViewTeamHours`; the segment layout admits either and each section checks its own capability.
- **Apariencia** (`/ajustes/apariencia`): "Tema" radio cards (Azul Cincel "Organización" badge, Cálido, Grafito) with mini previews; note "El tema de la organización es {name}. Puedes usar otro solo para ti." + "Editar tema de la organización" (admins); "Estilo de presentación" radio cards (Visual / Esencial / Analítico with icon and one-line description); "Modo" (Claro / Oscuro / Sistema), "Densidad" (Cómoda / Compacta), "Tamaño de texto" slider 13–16 step 0.5; live "Vista previa"; "Nuevo diseño" switch ("Probar el nuevo diseño") bound to `redesignEnabled`. Every change calls `updateMyPreferencesAction` immediately (optimistic) and re-applies the appearance without reload. When the org disallows overrides, Tema and Estilo cards are disabled with "La organización fijó el tema y el estilo." (`OVERRIDE_DISABLED`).
- **Tema y estilo** (`/ajustes/tema`, `ThemeEditor`): breadcrumb; actions "Restablecer" (`resetOrgAppearanceAction(base)` after confirm), "Exportar CSS" (downloads the resolved `:root` + `.dark` blocks), "Publicar para todos" (`saveOrgAppearanceAction`). "Partir de:" chips (Azul Cincel, Cálido, Grafito). Sections: "Estilo de la organización" (three cards + checkbox "Permitir que cada persona elija su estilo y tema" → `allowUserOverride`; checkbox "Nuevo diseño para todos" → `redesignDefault`), "Interfaz" / "Navegación" / "Tramos y estatus" token rows (`TokenRow`: color input + label + `--name` + hex chip; a Claro/Oscuro switch above the rows selects which mode is edited), "Tipografía" (font family select; `TypeScaleRow` per role: size slider, value, weight select), "Forma y espacio" (radius 0–24, card padding 8–28, gap 6–28, sombra Ninguna/Suave/Marcada). Right: sticky live preview of a mini app using the draft values + `ContrastBadge` ("Contraste texto / fondo: {r}:1 · cumple 4.5:1" or the failing copy). "Publicar para todos" is disabled while any pair of the shared list fails (`lib/ui/contrast.ts`, §14.6). After publishing, other users see the change **on their next page load** (the action revalidates the root layout and bumps the cookie version `v`).
- **Control de horario** (`/ajustes/horario`): switch "Control de horario activado/desactivado" with state copy; "Obligatorio a partir de" date input (min tomorrow); timeline strip (Hoy · Prueba · Obligatorio desde {fecha}); "Reglas de la jornada" (Entrada, Salida, Horas esperadas por día, Tolerancia de retardo, Días laborales toggles, checkboxes: pedir registro al iniciar sesión, cierre automático a las {hh:mm}, descontar {n} min de comida, excluir roles); "Lo que ve el equipo al iniciar sesión" preview of `ClockInPrompt`; "Horas del equipo · semana del {fecha}" `TeamHoursTable` with "Exportar CSV" (`/api/horario/export?week=`) — the only part that changes with style (Esencial: list per person; Analítico: per-day columns, total, meta, diferencia, retardos, % cumplimiento heat, averages row). "Guardar cambios" → `saveTimeTrackingSettingsAction`. The location option of the frame is not built (brief default). Viewers with only `canViewTeamHours` (Dirección) see the report and a read-only summary of the rules (no switch, no save).
- **Perfil:** photo (upload through `POST /api/staff/me/photo` after client re-encode, §3.2; remove with `removeMyPhotoAction`), "Mis horas esta semana" line (`fetchMyWeekHoursAction`, only when time tracking is enabled), nombre, puesto (read-only, from Equipo), correo (read-only, from Google), teléfono, firma de correo, idioma y zona horaria (read-only es-MX / America/Mexico_City), "Cambiar contraseña" (existing form), "Guardar" (existing staff update action for own editable fields).
- **Notificaciones:** matrix (rows: Asignación, Mención, Vencimiento, Comentario, Aprobación del cliente, Recordatorio, Sistema; columns: En la app, Correo, Resumen diario) checkboxes; quiet hours (from/to); the daily digest is sent at 07:30 (fixed, shown as "Resumen diario a las 07:30"); "Guardar" → `updateNotificationPreferencesAction`. The frame's "Cutto" column is not built.
- **Integraciones:** cards Gmail (status, account, "Conectar" → `/api/auth/google/start?grant=gmail`, "Sincronizar ahora" → `syncGmailAction`, "Desconectar" → `FormDialog` "¿Desconectar Gmail de Cincel?" with copy "Cincel dejará de leer tu correo y borrará la copia de tus conversaciones guardada aquí. Tu cuenta de Google sigue conectada para Drive y Calendar; para quitar el permiso de correo por completo, entra a los permisos de tu cuenta de Google." + link "Abrir permisos de Google" (`https://myaccount.google.com/permissions`, new tab) → `disconnectGmailAction()`), Google Calendar (existing sync controls), Google Drive (existing status), Cutto (link-only card "Abrir Cutto" + copy "Cutto es una aplicación aparte. Cincel enlaza a los canales de cada proyecto."), monday (link `/ajustes/monday`).
- **General / Estatus / Permisos / Tramos / Puestos / monday / Google:** existing components moved under `/ajustes` and restyled with tokens; no behavior change (Tramos and Puestos are Project Flow pages). General gains the three header link fields (Instagram, Sitio web, Correo) previously in localStorage (storage per BE).

### 3.9 `/asistente` and the assistant sheet

Frames: `Asistente` (sheet), `AsistentePagina`, `AsistenteWidgets`, `AsistenteHerramientas`.
- **Widgets:** assistant widgets are adapters onto the library (`render_table` → `RecordTable`, `render_stat_grid` → `KpiWidget`, `render_chart` → `DistributionWidget`, `render_timeline` → `AgendaWidget`, `render_list` → `AttentionListWidget`).
- **AssistantSheet** (right, 460 px, radius 18, inset 12 px): header (avatar mark, "Cincel", context chip "Viendo: {entity}", buttons Historial, Pantalla completa → `/asistente?thread=id`, Cerrar), message list (user bubbles `foreground` on dark ink; assistant text + widgets), footer quick actions chips (Resumen del día, Minuta → tareas, Cuantificar material, Revisar normativa, Bitácora con fotos), composer (textarea "Pregunta, pide un cálculo o arrastra un plano…", attach, dictate, send). Opens with `⌘J` or the floating button; Escape closes; focus returns to the trigger.
- **Context:** `AssistantContext` built from the route: `/proyectos/[id]*` → `projectId`; `/tareas?tarea=<id>` → `taskId`; `/personas/equipo/[id]` → `personId`; always `route`. Sent with every message.
- **Confirmations (AI SDK native approval, B9):** tools with `confirm: true` are declared with `needsApproval: true`. When the stream contains a tool part in state `approval-requested`, the message renders `ConfirmationCard` from that part's `toolName` and `input`; the summary line comes from the client-safe map `lib/assistant/tool-summaries.ts` (pure functions, tool name → `summarize(input)`, the same functions `defineTool` registers on the server), so no extra metadata travels in the stream. "Confirmar" / "Cancelar" call `addToolApprovalResponse({ id, approved })` (sent to the route as `approvals: [{ toolCallId, approved }]`); `useChat` resubmits when `lastAssistantMessageIsCompleteWithApprovalResponses` is true, the server runs (or skips) the tool and the model receives the result in the same conversation. The card then shows "Hecho", "Cancelado" or the error copy. Audit lives in `assistant_actions`; the full page can list it with `fetchAssistantActionsAction`.
- **Threads:** the client generates the thread id (`crypto.randomUUID()`) when a conversation starts and sends it as `id` in the request body; the server upserts the thread and loads the history from the database. The client sends only the new user message (or the approval responses), never the full history. "Pantalla completa" opens `/asistente?thread=<id>` with that id.
- **Context safety:** the route resolves `context.projectId`/`taskId`/`personId` through the viewer-scoped reads and drops ids the viewer can't see; the context chip shows only what the server confirms.
- **Calendar writes disabled:** the `calendar.events` Google grant is out of scope (BE keeps it out), so the agenda tools that create, update or cancel events (`create_event`, `update_event`, `cancel_event`, `schedule_site_visit`, and the calendar part of `create_meeting`) are registered disabled; the assistant explains "Aún no puedo crear eventos en tu calendario" and offers a reminder or a task instead. Read tools (`list_events`, `find_free_slots`) work.
- **External content:** text from Gmail, documents and attachments is marked untrusted for the model; any write in a turn that read external content requires approval (server rule), so the card may appear for tools that are otherwise direct.
- **Widgets:** existing `render_chart`, `render_card`, `render_stat_grid`, `render_list`; new `render_table` (columns, rows, optional totals; renders the Analítico table style), `render_timeline` (agenda/mini-Gantt items), `render_confirmation` (ConfirmationCard).
- **Full page** (`/asistente`): left history (`fetchAssistantThreadsAction`, grouped Hoy / Esta semana / Anteriores, delete), center conversation, right "Herramientas" panel (buttons that insert a starter prompt per tool group). Threads are server-side. On first load the client reads the legacy localStorage thread (`cincel.asistente.thread.v1`), calls `importLegacyAssistantThreadAction(messages)` once (no model call) and deletes the key on success.

### 3.10 Auth and first run

Frames: `Login`, `LoginDenegado`, `CambioContrasena`, `LoginJornada`, `BienvenidaGoogle`, `BienvenidaMonday`.
- Existing pages and logic; new split layout (left brand panel with CSS-shape pattern, right form card). "Continuar con Google" is the primary button (neutral "G" mark, no Google colors). Denied page shows the email and "Usar otra cuenta" / "Contactar al administrador" (`mailto:` from General settings email).
- **ClockInPrompt** (`LoginJornada`): after sign-in, when `TodayStatus.enabled && state === 'off' && promptAtLogin` and today is a work day, the first staff page shows a centered `Dialog`: "Buenos días, {name}", copy "Registra tu entrada para empezar el día." + (before `requiredFrom`) "Opcional hasta el {fecha}.", current time, "Registrar entrada" (`clockInAction({source:'login'})`), "Ahora no" (only while not required). When required, the dialog cannot be dismissed (Escape and outside click disabled) and "Ahora no" is absent — except after `clockInAction` fails with any code other than `ALREADY_ON` (e.g. `DISABLED` right after an admin turns the feature off): then the error copy shows and "Cerrar" appears, so nobody is locked out.
- Wizards (`/ajustes/google/primeros-pasos`, `/ajustes/monday`): existing steps, restyled stepper.

### 3.11 Portal

Frames: `PortalLogin`, `PortalProyecto` (+ `PortalProyectoEsencial`, `PortalProyectoAnalitico`), `Portal404`.
- **Widgets:** `PhaseStepper`, `ProgressListWidget`, `AgendaWidget`, `RecordTable`; style switch via `EstiloSwitch scope="portal"`.
- Existing routes and data. Portal uses the organization theme (no client override). The project page gets the three styles via `EstiloSwitch` in the portal top bar, stored in a portal cookie `cincel-portal-style` (portal users have no `user_preferences` row). Approvals/messages sections drawn in the frame are shown only where portal data exists today; the rest is out of scope.

### 3.12 States, 404, search

Frames: `EstadosSistema`, `Error404`, `BuscarCmdK`.
- `app/not-found.tsx` (staff): illustration from CSS shapes, "No encontramos esta página", "Volver a Inicio", "Buscar" (opens `CommandPalette`).
- `CommandPalette` (`⌘K`, shadcn `Command` in a `Dialog`): input "Buscar tareas, proyectos, personas, archivos…", results grouped by type from `searchWorkspaceAction` (types `proyecto`, `tarea`, `persona`, `archivo`, `nota`; debounce 200 ms, min 2 chars; with fewer than 2 characters no call is made and the palette shows "Escribe al menos 2 letras." plus the actions group); a static, client-side "Acciones" group of commands (Crear tarea → `/tareas?nueva=1`, Nuevo proyecto → `/proyectos?nuevo=1`, Nueva nota → `/mi-espacio?nota=nueva`, Preguntar al asistente → opens `AssistantSheet`, Registrar entrada → `clockInAction`, shown only when `fetchMyTodayAction().enabled` is true — false until Phase 6), filtered by the query; result urls are used as returned (`/tareas/<id>`, `/mi-espacio/notas/<id>`, `/personas/clientes?contacto=<id>`, `/personas/equipo/<id>`, `/proyectos/<id>`, Drive link for files), footer hints "↑↓ navegar · ↵ abrir · esc cerrar".
- Offline banner: `navigator.onLine === false` → top `Alert` "Sin conexión. Los cambios se guardarán cuando vuelvas a estar en línea." (informational; no offline queue).

### 3.13 Time clock (sidebar, when enabled)

Frames: `Sidebar` (tracker on), `AjustesHorario`, `LoginJornada`, `MovilInicio`.
- `TimeClock` card under the search button: clock icon + "Jornada" + status pill (En curso `success`, En pausa `warning`, Sin iniciar `muted`, Cerrada `primary`), live time `HH:MM:SS` mono 24 px (ticks every second client-side from `startedAt` and `workedSeconds`; re-synced with `fetchMyTodayAction` on focus and every 5 min), progress bar toward `TodayStatus.hoursPerDay`, sub-line "de 8 h · entrada 9:02", buttons by state: off/done → "Registrar entrada"; on → "Pausa" + "Salida"; pausa → "Reanudar" + "Salida"; footnote "Opcional hasta el {fecha}" (before `TodayStatus.requiredFrom`) or nothing. Everything comes from one `TodayStatus` (NB 12).
- Renders only when `TodayStatus.enabled` and the viewer's role is not exempt. Mobile: compact pill in the top bar opening a popover with the same controls.

---

## 4. Component architecture

All new shared components live in `components/shell/` unless noted. Feature components live under their feature folder. Props below are the contracts.

### 4.1 Shell

```ts
// components/shell/AppShell.tsx (RSC wrapper + client parts)
export type AppShellProps = {
  children: React.ReactNode;
  appearance: ResolvedAppearance;
  session: { staffId: string; name: string; role: string; isAdmin: boolean; photoUrl: string | null };
  nav: NavModel;                       // from buildNavModel(session) in lib/ui/nav.ts
  today: TodayStatus | null;           // null when time tracking is disabled or exempt
  hideAssistant?: boolean;             // true on /asistente
};

// lib/ui/nav.ts
export type NavItemKey = "inicio" | "mi-espacio" | "tareas" | "proyectos" | "personas" | "biblioteca" | "asistente" | "ajustes";
export type NavItem = { key: NavItemKey; label: string; href: string; icon: LucideIcon; badge?: number };
export type NavModel = { items: NavItem[]; tramos: { key: string; name: string; colorVar: string; href: string }[]; footer: NavItem[] };

// components/shell/Sidebar.tsx (client)
export type SidebarProps = { nav: NavModel; activeKey: NavItemKey | null; session: AppShellProps["session"]; today: TodayStatus | null; onOpenSearch(): void };

// components/shell/TimeClock.tsx (client)
export type TimeClockProps = { initial: TodayStatus; variant?: "card" | "compact" };   // requiredFrom and hoursPerDay are on TodayStatus

// components/shell/BottomTabs.tsx (client, < 768 px)
export type BottomTabsProps = { activeKey: NavItemKey | null; items: NavItem[] /* first 4 */; more: NavItem[] };

// components/shell/AppearanceProvider.tsx (client)
export type AppearanceProviderProps = { initial: ResolvedAppearance; children: React.ReactNode };
export function useAppearance(): { appearance: ResolvedAppearance; setPreference(patch: Partial<UserPreferences>): Promise<void> };

// app/layout.tsx (server) — appearance render contract (B2), only when redesignEnabled (B17); otherwise today's pipeline
// <html lang="es" data-theme={"light" | "dark"} data-theme-id={theme} data-style={style} data-density={density} class={dark ? "dark" : undefined}>
//   <head>
//     <style id="appearance">{`html:root[data-theme="light"]{${light vars}} html:root[data-theme="dark"]{${dark vars}}`}</style>   // from ResolvedAppearance.cssVars; specificity 0,2,1 (B18)
//     {mode === "system" && <script id="appearance-mode">{SYSTEM_MODE_SCRIPT}</script>}  // ≤ 1 KB, no deps, blocking
//   </head>
```

- **SSR first (B2):** the root layout reads the `cincel-appearance` cookie (JSON `{ theme, mode, style, density, textSize, v }`, written by `updateMyPreferencesAction` and at sign-in), re-validates it against the DB preferences and the org appearance, and, when `redesignEnabled` is true, renders the `<html>` attributes and the `<style id="appearance">` block above. **On flag-on pages `<html>` always carries `data-theme="light"|"dark"`** (the server sets it from the cookie for explicit modes; in `system` mode the head script sets it). The block uses `html:root[data-theme="light"]{…}` and `html:root[data-theme="dark"]{…}` (specificity 0,2,1), so it beats the legacy `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` rule in `globals.css` (B18). `ResolvedAppearance.cssVars` is `{ light, dark }`, both in the stylesheet; `data-theme` selects between them, and the `.dark` class is kept in sync for Tailwind's `dark:` utilities. With the flag off, nothing of this is emitted (§2.3, B17). **No inline `style` attributes** carry token values (they would beat the stylesheet).
- **System mode:** a tiny blocking head script sets `data-theme="light"|"dark"` and toggles `.dark` on `<html>` from `matchMedia("(prefers-color-scheme: dark)")` before first paint and on change, so neither the token block nor Tailwind's `dark:` variant (`@custom-variant dark (&:is(.dark *))`) flashes.
- **`AppearanceProvider` (client)** only updates attributes and the class (`data-theme`, `data-style`, `data-density`, `data-theme-id`, `.dark` — `data-theme` and `.dark` always change together, `--text-base` through the class `text-size-{n}` defined in `globals.css`) and, for a theme change, swaps the content of `<style id="appearance">` with the vars returned by `updateMyPreferencesAction`; it never writes variables on `documentElement.style`. `setPreference` applies optimistically, calls the action, rolls back and toasts the error code on failure. Slider changes (text size) are debounced 300 ms.
- Org appearance changes reach other users on their **next page load** (the save revalidates the root layout and bumps the cookie version `v`; a mismatching `v` makes the layout re-resolve).
- `useAppearance` replaces `ThemeToggle` and its localStorage key (read once, migrated, deleted).
- **Fonts:** `app/layout.tsx` declares Geist, Inter and DM Sans with `next/font` (Inter and DM Sans with `preload: false`); `--font-sans` points to the selected family's `variable`.
- `lang="es"` on `<html>` (today "en").

### 4.2 Shared

```ts
// components/v2/layout/PageHeader.tsx — edited in place (adds breadcrumb and badge, 22 px title; its 8 importers keep working), re-exported from components/shell
export type PageHeaderProps = {
  title: string;
  description?: string;
  breadcrumb?: { label: string; href?: string }[];
  actions?: React.ReactNode;          // right side; wraps under 768 px
  badge?: React.ReactNode;            // e.g. "Solo tú lo ves", "Admin"
};

// components/shell/EstiloSwitch.tsx (client)
export type EstiloSwitchProps = { scope?: "staff" | "portal" };   // reads/writes the style through useStyle()

// components/shell/StyleProvider.tsx (client)
export function StyleProvider(props: { style: PresentationStyle; scope: "staff" | "portal"; children: React.ReactNode }): JSX.Element;
export function useStyle(): { style: PresentationStyle; setStyle(style: PresentationStyle): void; isOverridden: boolean };

// components/widgets/StyleView.tsx (client) — importable ONLY inside components/widgets/* (guard test, §18)
export type StyleViewProps = {
  visual: () => React.ReactNode;
  esencial: () => React.ReactNode;
  analitico: () => React.ReactNode;
};

// components/shell/EmptyState.tsx
export type EmptyStateProps = { icon?: LucideIcon; title: string; description?: string; action?: { label: string; href?: string; onClick?(): void } };

// components/shell/ErrorState.tsx
export type ErrorStateProps = { title?: string; description?: string; onRetry?(): void; code?: string };

// components/shell/LoadingSkeleton.tsx
export type LoadingSkeletonProps = { variant: "kpis" | "cards" | "list" | "table" | "board" | "calendar"; rows?: number };

// components/shell/CommandPalette.tsx (client)
export type CommandPaletteProps = { open: boolean; onOpenChange(open: boolean): void };
```

- `EstiloSwitch`: three links styled as a segmented control (`role="radiogroup"` on the group; each option `role="radio"` with `aria-checked`), icons (pie, list, grid) + labels "Visual", "Esencial", "Analítico", leading label "Estilo". Changing it calls `setStyle` (which calls `updateMyPreferencesAction({ style })`) and re-renders the page's `StyleView` in place. Disabled with tooltip "La organización fijó el estilo." when overrides are off.
- `?estilo=visual|esencial|analitico` in the URL overrides the style for that render only (Estilos board, Ajustes previews). It is read on the server (page `searchParams`) and passed to `StyleProvider`, so server and client render the same style; `isOverridden` is true and the switch shows the override.

### 4.3 Inicio

`InicioClient` ({ data: InicioData; photoUrl: string | null; me: { firstName: string; role: string } }), `ProfilePhotoButton` ({ photoUrl; initials; onChange(url) }), `KpiTiles` (visual), `KpiTable` (analítico), `TramoDonut`, `WeeklyPaceChart` (shadcn `ChartContainer`), `AttentionList` ({ items; variant: "visual" | "esencial" | "analitico" }), `MyDayAgenda`, `ProjectProgressList`, `WorkloadBars`. Every widget takes data already shaped by `fetchInicioAction`; style picks the component (§15).

### 4.4 Mi espacio

```ts
// components/mi-espacio/*
export type QuickCaptureProps = { onCreated(kind: "nota" | "checklist" | "recordatorio"): void };
export type InboxProps = {
  notifications: { items: NotificationItem[]; nextCursor: string | null; unreadCount: number };
  gmail: { status: { connected: boolean; scopeOk: boolean; lastSyncedAt: string | null; lastError: string | null }; threads: GmailThreadSummary[]; nextCursor: string | null } | null;
  tab: "todo" | "gmail" | "notificaciones" | "menciones";
};
export type GmailReaderProps = { threadId: string; onClose(): void };
export type GmailDraftSheetProps = { open: boolean; replyToThreadId?: string; to?: string[]; subject?: string; onOpenChange(open: boolean): void };
export type NoteEditorProps = { note: Note | null; open: boolean; onOpenChange(open: boolean): void; onSaved(note: Note): void };
export type ReminderDialogProps = { open: boolean; initialText?: string; parsed?: { cleanText: string; dueAt: string | null; repeat: Reminder["repeat"] }; onOpenChange(open: boolean): void; onCreated(r: Reminder): void };
export type ChecklistCardProps = { checklist: Checklist; onChange(c: Checklist): void };
export type NotesGridProps = { notes: Note[]; onOpen(note: Note): void };
```

### 4.5 Tareas

```ts
// lib/tareas/query.ts
export type TareasVista = "tablero" | "lista" | "calendario";
export type TareasQuery = { vista: TareasVista; cal: "mes" | "semana" | "dia"; tramo: string | null; responsable: "yo" | string | null; proyecto: string | null; estado: string | null; q: string | null; nueva?: boolean };
export function parseTareasQuery(sp: URLSearchParams): TareasQuery;
export function toTareasSearch(q: Partial<TareasQuery>): string;

// components/tareas/*
export type TareasClientProps = { query: TareasQuery; initial: { tasks?: TaskListItem[]; board?: TaskBoard; calendar?: CalendarData }; staff: StaffOption[]; tramos: WorkflowRef[] };
export type TaskSheetProps = { taskId: string; onClose(): void };
export type NewTaskDialogProps = { open: boolean; onOpenChange(open: boolean): void; defaults?: { projectId?: string; tramoKey?: string; title?: string; description?: string } };
export type EventDetailPopoverProps = { event: CalendarItem; anchor: HTMLElement; onClose(): void };
```

`TaskSheet` and `NewTaskDialog` reuse the existing `TaskDrawer` / `NewTaskModal` internals (fields, actions, history) with the new layout; the old components are deleted in cleanup.

### 4.6 Proyectos

`ProjectTabs` ({ project: ProjectRef & { tramo: WorkflowRef | null }; active: "resumen" | "tareas" | "cronograma" | "archivos" | "clientes" | "ficha"; counts: { tareas: number; archivos: number; clientes: number }; canManagePortal: boolean }), `ProjectsPortfolio` ({ projects; portfolio: PortfolioRow[] }), `ProjectSummary` (style variants), `ProjectTasksByFase`, `NewProjectDialog` (Project Flow fields).

### 4.7 Personas and Biblioteca

`PersonasTabs` ({ active: "equipo" | "clientes" | "contratistas" | "proveedores"; counts }), `TeamGrid` / `TeamTable`, `AvailabilityWeek` ({ rows: { staffId; name; days: ("libre" | "ocupado" | "saturado" | "vacaciones")[] }[] }), `PersonaDetail` ({ detail: PersonaDetail }), `BibliotecaIndex`, `BibliotecaSection`, `DocumentReader` ({ doc; toc }), `VacationForm` ({ balance: VacationBalance; onSubmitted(r: VacationRequest): void }), `VacationHistory`, `TeamAbsencesStrip`.

### 4.8 Ajustes

```ts
export type AjustesNavProps = { active: "perfil" | "apariencia" | "notificaciones" | "integraciones" | "general" | "tema" | "horario" | "tramos" | "puestos" | "estatus" | "permisos" | "monday" | "google"; isAdmin: boolean };
export type ThemeEditorProps = { initial: OrgAppearance; presets: Record<ThemeId, OrgAppearance> };
export type TokenRowProps = { name: TokenName; label: string; value: string; onChange(hex: string): void };
export type TypeScaleRowProps = { role: TypeRole; label: string; value: { size: number; weight: 400 | 500 | 600 }; min: number; max: number; onChange(v: { size: number; weight: 400 | 500 | 600 }): void };
export type ContrastBadgeProps = { pairs: { fg: string; bg: string; label: string }[] };   // shows the worst ratio
export type TeamHoursTableProps = { weekStart: string; rows: TeamHoursRow[]; style: PresentationStyle };
export type ClockInPromptProps = { status: TodayStatus; requiredFrom: string | null; now: Date };
```

### 4.9 Assistant and Cutto links

```ts
export type AssistantButtonProps = { onOpen(): void };
export type AssistantSheetProps = { open: boolean; onOpenChange(open: boolean): void; context: AssistantContext; threadId?: string };
export type ConfirmationCardProps = {
  part: { toolCallId: string; toolName: string; input: unknown; state: "approval-requested" | "output-available" | "output-denied" | "output-error"; approvalId: string; errorText?: string };   // summary = toolSummaries[toolName](input) from lib/assistant/tool-summaries.ts
  onRespond(approved: boolean): void;            // calls addToolApprovalResponse({ id: approvalId, approved })
};
export type RenderTimelineArgs = { title?: string; items: AgendaItem[] };          // same shape as AgendaWidget
export type RenderTableArgs = RecordTableData & { title?: string };                                   // render_table args = RecordTableData (lib/types/widgets.ts)
// render_confirmation is the visual of the native approval request: ConfirmationCard renders the approval-requested tool part (no separate args)
```

- Cutto deep links come only from `lib/integrations/cutto-links.ts` (client-safe, reads `NEXT_PUBLIC_CUTTO_BASE_URL`): `channelUrl(projectId)`, `meetingUrl(meetingId)`, `personChatUrl(email)` (BE §11.2). Callers pass the person's email from the staff DTO they already load (it is not part of `PersonDatum`). Links open in a new tab with `rel="noopener"` and the label "Abrir en Cutto" / "Abrir chat en Cutto". No client component imports `lib/integrations/cutto-api.server.ts`. No Cutto UI is rendered inside Cincel.

### 4.10 Reusable widget library (top priority: reuse)

**Rule:** pages never write per-style markup. A page composes a few **style-aware widgets**; each widget takes **one typed data shape** and renders the three styles internally through `StyleView`. All style differences (§15) live inside `components/widgets/*`. The per-feature components of §4.3–§4.8 are thin compositions of these widgets plus the shared patterns of §4.11; where §4.3–§4.8 name a component (e.g. `KpiTiles`, `TramoDonut`, `TeamGrid`), it is an instance of the widget below, not a separate implementation.

#### 4.10.1 Widgets

Data shapes are imported from **`lib/types/widgets.ts`** (single source, owned by the backend, BE §6.1; landed in Phase 1). There is no `components/widgets/types.ts`. UI-only inputs (`actions` on `PeopleWidget`, `footer` on `EntityCardGrid`, `renderCell` on `RecordTable`) are **widget props**, never fields of the data shapes, so the server can return the shapes as-is. Icons in data are lucide names (`EntityCard.iconName`) resolved by the widget. Field list (identical to BE §6.1):

```ts
// lib/types/widgets.ts (BE-owned; FE imports)
export type Series7 = number[];                                    // 7 points, oldest → newest
export type Tone = "default" | "ok" | "warn" | "critical";
export type TramoKey = string;                                     // workflows.key
export type Availability = "libre" | "ocupado" | "saturado" | "vacaciones";

export type KpiDatum = { key: string; label: string; value: number; display?: string;
  delta?: { value: number; good: boolean; caption: string }; series7?: Series7;
  avg30?: number; min30?: number; max30?: number; split?: { tramo: TramoKey; share: number }[];
  caption?: string; href?: string;
  visibleIn?: PresentationStyle[] };                               // omitted = all styles (B13)
export type DistributionSegment = { key: string; label: string; value: number; colorVar: string; secondary?: number; extra?: Record<string, number | string> };
export type ProgressItem = { id: string; label: string; sublabel?: string; real: number; plan?: number | null; budgetPct?: number | null; colorVar?: string; href?: string; next?: { title: string; date: string } | null };
export type AttentionItem = { id: string; title: string; href: string; project: string; tramo: TramoKey | null; reason: string; tone: Tone; assignee: { id: string; name: string; initials: string } | null; due: string | null; daysLate: number | null };
export type AgendaItem = { id: string; title: string; start: string; end?: string; allDay?: boolean; estimated?: boolean; project?: string; tramo?: TramoKey | null; attendees?: string[]; href?: string; meetingUrl?: string /* only when a Cutto URL is stored on the event */ };
export type PersonDatum = { id: string; name: string; initials: string; photoUrl?: string | null; puesto?: string | null; tramo?: TramoKey | null; open: number; overdue: number; activeProjects?: number; occupancyPct?: number; weekHours?: number | null; availability?: Availability[]; href?: string };
export type EntityCard = { id: string; title: string; subtitle?: string; href?: string; iconName?: string /* lucide icon name */; tramo?: TramoKey | null; progress?: number; badges?: { label: string; tone: Tone }[]; meta?: { label: string; value: string }[] };
export type RecordColumn = { key: string; label: string; align?: "left" | "right"; mono?: boolean; width?: number; format?: "text" | "count" | "percent" | "hours" | "days" | "date" | "delta" | "mxn"; hideOn?: PresentationStyle[] };
export type RecordTableData = { columns: RecordColumn[]; rows: Record<string, unknown>[]; groupBy?: string; totals?: Record<string, string | number> | "auto"; heat?: { key: string; warnAt: number; critAt: number }[] };
```

| Widget | Props (data shape) | Visual | Esencial | Analítico | Reuse |
|---|---|---|---|---|---|
| `WidgetCard` | `{ title: string; icon?: LucideIcon; tone?: Tone; actions?: ReactNode; children; padded?: boolean }` | card + icon chip + title + action link | same card, no icon chip, no shadow | table container (radius 10, header row) | **extends** shadcn `Card` (`CardHeader`/`CardAction`) |
| `KpiWidget` | `{ items: KpiDatum[] }` (filters `visibleIn` by the current style internally) | tiles: value, sparkline, delta pill, split bar | number + label grid | `RecordTable` rows: hoy, Δ 7 d, prom. 30 d, mín–máx, tendencia | **extends** `components/v2/layout/KpiRow` + `KpiTile` (adds `series7`, `delta`, styles) |
| `DistributionWidget` | `{ title: string; segments: DistributionSegment[]; totalLabel?: string; secondaryLabel?: string; extraColumns?: { key: string; label: string }[] }` | donut + legend (`chart.tsx`) | text list "label … value" | `RecordTable` with %, heat on `secondary/value`, extra columns, total row | **reuses** `chart.tsx` (replaces `app/dashboard/DonutCard.tsx`) |
| `ProgressListWidget` | `{ title: string; items: ProgressItem[]; variant?: "bars" \| "rings" }` | bars or rings 52–64 px | "label … n%" list | `RecordTable`: real, plan, desviación (signed, colored text), presupuesto, próxima entrega | **reuses** `components/v2/status/CapacityRing`, `LoadBar` |
| `AttentionListWidget` | `{ title: string; items: AttentionItem[]; totalCount?: number; moreHref?: string }` | rows with tramo bar, reason pill, avatar, due date | title + "proyecto · persona · motivo fecha" | `RecordTable`: tarea, proyecto, tramo dot, resp., motivo, vence, retraso | **reuses** `StatusChip`, `TramoBadge`, `PersonAvatar` |
| `AgendaWidget` | `{ title: string; items: AgendaItem[]; mode: "day" \| "week" \| "month"; groupBy?: "day" \| "none"; emptyText?: string }` | tinted time blocks (day) / time grid (week) / month grid | list grouped by day | `RecordTable` with daily subtotals; month = load heat table | **wraps** existing `components/calendario/UnifiedCalendar` for week/month grids (presentation only) |
| `PeopleWidget` | `{ people: PersonDatum[]; show: ("load" \| "hours" \| "availability" \| "projects")[]; layout?: "cards" \| "rows"; actions?: (p: PersonDatum) => ReactNode }` | avatar cards (load bar, chips) or availability grid | directory list; availability as a sentence | `RecordTable`: abiertas, vencidas, horas, % ocupación heat, proyectos, averages row | **reuses** `PersonAvatar`, `LoadBar`, `AppAvatar` |
| `RecordTable` | `{ data: RecordTableData; renderCell?: (columnKey: string, row: Record<string, unknown>) => ReactNode \| undefined; density?: "comoda" \| "compacta"; selectable?: boolean; rowActions?: RowAction[]; emptyState?: EmptyStateProps }` (cells format by `column.format` unless `renderCell` returns a node) | lists inside Visual pages | plain lists (no heat, no totals) | dense: 12.5 px, mono numbers, header `muted`, totals row, heat cells; columns with `hideOn` are dropped per style | **extends** `components/ui/DataTable` (TanStack) + `components/v2/table/RowActionsMenu`, `bulk-select`, `BulkActionBar`, `components/ui/ExportMenu` |
| `EntityCardGrid` | `{ items: EntityCard[]; table?: RecordTableData; footer?: (item: EntityCard) => ReactNode; minWidth?: number; emptyState?: EmptyStateProps }` (badges and icon come from the data) | card grid with tinted head / icon chip / badges | white bordered cards, title + text meta | `table` (or one built from `title`, `subtitle`, `meta`) | **new** (no existing equivalent; built on shadcn `Card`) |
| `TaskBoardWidget` | `{ board: TaskBoard; table: RecordTableData; onMove(taskId: string, statusId: string): Promise<void> }` | kanban columns with drag-and-drop, collapsed empty columns | `RecordTable` grouped by estatus | estatus summary (`DistributionWidget`) + dense `RecordTable` | **evolves** `components/tablero/TableroClient` (drag-and-drop logic kept) |
| `StatusChip` | `{ status: TaskStatusRef; size?: "sm" \| "md" }` | tinted chip | text | text | thin **adapter** over `components/v2/status/StatusBadge` (which takes `{ label, token }`): maps the status (and custom status base) to `{ label, token }` |
| `TramoBadge` | `{ tramo: WorkflowRef; variant?: "chip" \| "dot" \| "text" }` | chip (tint + ink) | text | dot + text | until Project Flow renames it, **is** `components/v2/status/AreaBadge` wrapped by `lib/tramos/compat.ts` (`tramoColorSlot`, `tramoLabel`), §21.2 |

Each widget renders its own `EmptyState` (via an `emptyText`/`emptyState` prop) and `LoadingSkeleton` variant, so pages don't handle widget-level states.

#### 4.10.2 Page → widgets

| Page (§3) | Widgets used |
|---|---|
| Inicio | `KpiWidget`, `DistributionWidget` (tareas por tramo), `WidgetCard` + `chart.tsx` line (ritmo semanal; Analítico via `RecordTable`), `AttentionListWidget`, `AgendaWidget` (Mi día), `ProgressListWidget` (avance), `PeopleWidget` (carga) |
| Mi espacio | `RecordTable` (Bandeja rows, reminders, checklists index), `EntityCardGrid` (notes), `AgendaWidget` (recordatorios hoy/mañana), `WidgetCard` |
| Tareas · Tablero | `ListPage` with `spec.kind = "board"` → `TaskBoardWidget` (all three styles inside the widget) |
| Tareas · Lista | `ListPage` with `spec.kind = "table"` → `RecordTable` grouped (`groupBy`); by-project summary rows are `RecordTableData` columns hidden in Visual/Esencial (`hideOn`) |
| Tareas · Calendario | `AgendaWidget` (`mode` = mes/semana/día), `DistributionWidget` (entregas por semana) |
| Proyectos | `ListPage` with `spec.kind = "cards"` → `EntityCardGrid` (renders its `table` in Esencial/Analítico) + `DistributionWidget` (por tramo) |
| Proyecto · Resumen | `PhaseStepper` (tramos), `ProgressListWidget` (partidas, presupuesto), `KpiWidget` (avance), `EntityCardGrid` (archivos recientes), `RecordTable` (ficha, contactos) |
| Proyecto · Tareas / Cronograma / Archivos | `RecordTable` grouped (tareas); Cronograma: existing panels inside `WidgetCard` for Visual and a `CronogramaWidget` (library, wraps the existing panels + a `RecordTable` for Esencial/Analítico: holgura, duración); Archivos: `ListPage` `spec.kind = "cards"` (storage by type is `RecordTableData`) |
| Personas (all tabs) | `ListPage` with `spec.kind = "people"` (equipo) or `"cards"`/`"table"` (clientes, contratistas, proveedores) |
| Persona detalle | `KpiWidget`, `ProgressListWidget` (proyectos), `AttentionListWidget` (tareas), `PeopleWidget` single-row availability, `ActivityFeedWidget` (actividad reciente) |
| Biblioteca / sección | `EntityCardGrid` (index), `ListPage` with `RecordTable` (sección) |
| Mis vacaciones | `KpiWidget` (saldo), `RecordTable` (historial), `AgendaWidget` month strip (ausencias), `FormSheet` (solicitud) |
| Ajustes › Control de horario | `SettingsSection`/`SettingsRow` (§4.11) + `RecordTable` (horas del equipo; heat on % cumplimiento) |
| Portal proyecto | `PhaseStepper`, `ProgressListWidget`, `AgendaWidget` (entregas), `RecordTable` (documentos, pagos) |
| Assistant widgets | `render_table` → `RecordTable`, `render_stat_grid` → `KpiWidget`, `render_chart` → `DistributionWidget`/chart, `render_timeline` → `AgendaWidget`, `render_list` → `AttentionListWidget` |

### 4.11 Shared patterns (forms, settings, list pages)

| Pattern | Contract | Used by | Reuse |
|---|---|---|---|
| `FormSheet` | `{ title: string; description?: string; open: boolean; onOpenChange(o: boolean): void; onSubmit(): Promise<void>; submitLabel: string; pending?: boolean; error?: string \| null; size?: "md" \| "lg"; children }` (right `Sheet`, sticky footer "Cancelar" + submit, inline `Alert` for errors, `actionErrorText`) | `NoteEditor`, `TaskSheet` (edit mode), `GmailDraftSheet`, project ficha edits, contact/member editors, `VacationForm` (sheet on mobile) | **extends** existing `Sheet` editors (`MemberEditorDrawer`, `ContactEditorSheet`, `TaskDrawer` footers are refactored onto it) |
| `FormDialog` | same props with `Dialog` | `ReminderDialog`, `NewTaskDialog`, `NewProjectDialog`, `ClockInPrompt` (`dismissible?: boolean`), confirmations (Gmail send, reset theme) | **extends** existing `NewTaskModal` / `ProjectCreateModal` dialog shells |
| `SettingsSection` / `SettingsRow` | Section `{ title: string; description?: string; actions?: ReactNode; children }`; Row `{ label: string; description?: string; control: ReactNode; htmlFor?: string }` | every `/ajustes/*` page (Apariencia, Tema y estilo, Horario, Perfil, Notificaciones, Integraciones, General, Estatus, Permisos) | **new** (replaces the ad-hoc card layouts in `GeneralSettingsWorkspace`, `PermissionsWorkspace`) |
| `ListPage` | `{ header: PageHeaderProps; filters?: ReactNode; tabs?: ReactNode; spec: ListSpec; empty?: EmptyStateProps }` with `ListSpec = { kind: "table"; data: RecordTableData; renderCell?: RecordTableProps["renderCell"]; rowActions?: RowAction[] } \| { kind: "cards"; items: EntityCard[]; table: RecordTableData; footer?: EntityCardGridProps["footer"] } \| { kind: "people"; people: PersonDatum[]; show: PeopleWidgetProps["show"] } \| { kind: "board"; board: TaskBoard; table: RecordTableData }`. `ListPage` renders `PageHeader` + `EstiloSwitch` + filters + **one library widget** chosen by `spec.kind` (`RecordTable`, `EntityCardGrid`, `PeopleWidget`, `TaskBoardWidget`); the widget decides how each style looks. `ListPage` itself never imports `StyleView` and pages never pass per-style markup | Tareas tablero/lista, Proyectos, Personas tabs, Biblioteca sección, Proyecto archivos/cronograma (Analítico tables) | **new**, composing the v2 `PageHeader` + library widgets |
| `FiltersBar` | `{ chips?: { key: string; label: string; count?: number; colorVar?: string; pressed: boolean; href: string }[]; selects?: ReactNode[]; search?: { value: string; placeholder: string; onChange(v: string): void } }` | Tareas, Proyectos, Personas, Biblioteca | **extends** `components/tareas/TaskMemberProjectFilters` |

#### 4.11.1 Reuse ledger (every new component)

| Component (§4) | Status |
|---|---|
| `AppShell` | new (no shared staff layout exists); composes existing shadcn `sidebar` |
| `Sidebar` | **replaces** `components/layout/Sidebar.tsx` (same shadcn `sidebar` primitives, nav from `lib/ui/nav.ts`, `nav-active.ts` reused) |
| `TimeClock`, `ClockInPrompt` | new (no time tracking exists); `ClockInPrompt` = `FormDialog` |
| `PageHeader` | **edits in place** `components/v2/layout/PageHeader.tsx` (adds breadcrumb, badge; 22 px title), re-exported from `components/shell` |
| `EstiloSwitch`, `StyleProvider` | new (no style concept exists); built on shadcn `toggle-group` |
| `StyleView` | new, lives in `components/widgets/` and is imported only by library widgets |
| `EmptyState`, `ErrorState`, `LoadingSkeleton` | new thin wrappers over shadcn `Alert`, `Skeleton`, `Button` |
| `CommandPalette` | new, built on existing shadcn `command` + `dialog` |
| `BottomTabs` | new (mobile) |
| `AppearanceProvider` | **replaces** `components/layout/ThemeToggle.tsx` and the `<style id="primary-color">` injection (`getPrimaryColor` folded into `resolveAppearance`) |
| `ProfilePhotoButton` | **replaces** the photo controls in `components/layout/Header.tsx` (`profile` variant) and `lib/auth/profile-photo.ts` localStorage |
| `Inbox`, `GmailReader` | new; rows are `RecordTable` / list rows |
| `NoteEditor`, `ReminderDialog`, `GmailDraftSheet` | new instances of `FormSheet` / `FormDialog` |
| `NotesGrid` | instance of `EntityCardGrid` |
| `ChecklistCard` | **reuses** the checklist rows of `components/tareas` (`ChecklistProgressCell`, task checklist item UI) |
| `TareasClient` | **evolves** `MisTareasClient` / `ActividadesClient` (URL-synced filters); views are `ListPage` specs over `TaskBoardWidget`, `RecordTable` and `AgendaWidget` (which wraps `UnifiedCalendar`) |
| `TaskSheet` | **extends** `components/tareas/TaskDrawer` (same fields/actions; `FormSheet` shell; history via `HistoryEventList`) |
| `NewTaskDialog` | **extends** `components/tareas/NewTaskModal` |
| `EventDetailPopover` | **extends** the existing calendar event popover in `UnifiedCalendar` |
| `ProjectTabs` | **extends** `components/proyectos/ProjectSectionNav` (adds Resumen, Tareas) |
| `ProjectsPortfolio`, `ProjectSummary`, `ProjectTasksByFase` | compositions of library widgets (no new primitives) |
| `TaskBoardWidget` | **evolves** the existing `TableroClient` board (drag-and-drop kept) into a library widget |
| `CronogramaWidget` | library widget **wrapping** the existing `components/cronograma/*` panels (Visual) + `RecordTable` (Esencial/Analítico) |
| `LegacyFrame` | new (thin wrapper that mounts the existing `Sidebar` + `Header` for the flag-off branch; deleted in Cleanup) |
| `NewProjectDialog` | **extends** `components/proyectos/ProjectCreateModal` |
| `PersonasTabs` | new (tabs as links) |
| `TeamGrid`, `TeamTable`, `AvailabilityWeek` | instances of `PeopleWidget` |
| `PersonaDetail` | composition of `KpiWidget`, `ProgressListWidget`, `AttentionListWidget` (replaces `MemberProfileModal` content) |
| `BibliotecaIndex`, `BibliotecaSection` | **evolve** `ResourcesWorkspace` (`mode="overview"`/section) with `EntityCardGrid`/`ListPage` |
| `DocumentReader` | **extends** the resource viewer in `ResourcesWorkspace` |
| `VacationForm`, `VacationHistory`, `TeamAbsencesStrip` | `FormSheet`/`FormDialog` + `RecordTable` + `AgendaWidget` |
| `AjustesNav` | new (settings sub-navigation) |
| `ThemeEditor`, `TokenRow`, `TypeScaleRow`, `ContrastBadge` | **evolve** `components/configuracion/PrimaryColorPicker` (becomes `TokenRow`); rows are `SettingsRow` |
| `HorarioClient`, `TeamHoursTable` | `SettingsSection` + `RecordTable` |
| `AssistantButton`, `AssistantSheet` | **extends** `components/asistente/AssistantChat` (same `useChat`, rendered in a `Sheet`) |
| `ConfirmationCard` | new (no confirmation exists); shadcn `Card` + `Button` |
| `AssistantTableMessage`, `AssistantTimelineMessage` | thin adapters to `RecordTable` / `AgendaWidget`; existing `AssistantChartMessage`, `AssistantCardMessage`, `AssistantStatGridMessage`, `AssistantListMessage` **migrate** onto `DistributionWidget`/`WidgetCard`/`KpiWidget`/`AttentionListWidget` |

---

## 5. Server vs client components, and local state

| Surface | Server component (loads) | Client component (local state) |
|---|---|---|
| Shell | `app/(staff)/layout.tsx` (new route group): session, `resolveAppearance`, nav model, `fetchMyTodayAction` | `Sidebar` (search open), `TimeClock` (status, ticking seconds, pending), `AssistantSheet` (open, thread, messages), `CommandPalette` (query, results) |
| Inicio | `fetchInicioAction`, photo URL | `InicioClient`: photo, style |
| Mi espacio | notifications, Gmail status/threads, reminders, checklists, notes | `MiEspacioClient`: tab, selected thread, editors open, optimistic lists |
| Tareas | tasks/board/calendar for `TareasQuery`, staff, tramos | `TareasClient`: query (URL-synced), drag state, sheet/dialog open |
| Proyectos | projects, portfolio; per project: project, counts, tab data | `ProyectosClient`, tab clients |
| Personas | staff + overview / contacts / detail | tab clients |
| Biblioteca | resource data, vacations | section clients, `VacationForm` |
| Ajustes | preferences, org appearance, time-tracking settings, team hours, notification prefs, Gmail status | `ThemeEditor` (draft `OrgAppearance`, mode being edited), `AparienciaClient`, `HorarioClient` (draft settings), form clients |
| Asistente page | threads list | `AsistentePageClient` |

All staff pages move once into the `app/(staff)/` route group (Phase 1). The group layout mounts `AppShell` only when the flag is on; with the flag off it renders `children` bare and legacy pages keep their own `Sidebar`/`Header` (restyled pages render `LegacyFrame` in their flag-off branch) until the Cleanup phase (§2.3).

---

## 6. Data refresh and revalidation

Client components refetch through read actions after each mutation; actions also call `revalidatePath`:

| Action | `revalidatePath` |
|---|---|
| `updateMyPreferencesAction` | none (client applies the returned `appearance`; cookie rewritten). Toggling `redesignEnabled` is followed by `router.refresh()` on the client |
| `saveOrgAppearanceAction`, `resetOrgAppearanceAction` | `/`, `layout` (other users: next page load) |
| `POST /api/staff/me/photo`, `removeMyPhotoAction` | `/`, `layout` |
| notifications actions | `/mi-espacio` |
| notes / checklists / reminders actions | `/mi-espacio` |
| Gmail actions | `/mi-espacio` (link/task also `/proyectos/{id}`, `/tareas`); `disconnectGmailAction` also `/ajustes/integraciones` |
| `saveTimeTrackingSettingsAction` | `/`, `layout`, `/ajustes/horario` |
| clock actions | none (the client uses the returned `TodayStatus` immediately) |
| vacation actions | `/biblioteca/vacaciones`, `/personas`; vacation settings also `/ajustes/general` |
| assistant actions | `/asistente` |

Client refetch: Bandeja polls `fetchNotificationsAction({ unreadOnly: true })` every 60 s while visible (updates the sidebar badge); `TimeClock` re-syncs on focus and every 5 min; Tareas refetches the current view after task mutations (existing pattern).

---

## 7. API contract (server actions the UI calls)

All are `"use server"` functions in the files named (routes are marked). Errors are thrown as `Error(code[: detail])`. UI copy per code is in §9. Types in §7.1 live in `lib/types/redesign.ts` (re-exported from `lib/types/core.ts`); widget shapes in `lib/types/widgets.ts` (§4.10.1). This section is identical to BE §7 after review round 1.

### 7.1 Types

```ts
export type ThemeId = "azul" | "calido" | "grafito";
export type ColorMode = "light" | "dark" | "system";
export type PresentationStyle = "visual" | "esencial" | "analitico";
export type Density = "comoda" | "compacta";
export type TextSize = 13 | 13.5 | 14 | 14.5 | 15 | 15.5 | 16;

export type UserPreferences = {
  theme: ThemeId | null;              // null = organization theme
  mode: ColorMode;
  style: PresentationStyle | null;    // null = organization default
  density: Density;
  textSize: TextSize;
  redesignEnabled: boolean;           // forced false when OrgAppearance.redesignAvailable is false
  quietHours: { from: string; to: string } | null;   // "HH:MM"
};

export type TokenName =
  | "background" | "foreground" | "card" | "card-foreground" | "popover" | "popover-foreground"
  | "primary" | "primary-foreground" | "secondary" | "secondary-foreground" | "muted" | "muted-foreground"
  | "accent" | "accent-foreground" | "destructive" | "warning" | "warning-ink" | "success"
  | "border" | "border-strong" | "input" | "ring"
  | "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5"
  | "chart-1-ink" | "chart-2-ink" | "chart-3-ink" | "chart-4-ink" | "chart-5-ink"
  | "sidebar" | "sidebar-foreground" | "sidebar-primary" | "sidebar-primary-foreground"
  | "sidebar-accent" | "sidebar-accent-foreground" | "sidebar-border" | "sidebar-ring";

export type TypeRole = "pageTitle" | "sectionTitle" | "cardTitle" | "body" | "label" | "kpi";

export type OrgAppearance = {
  baseTheme: ThemeId;
  tokens: Record<TokenName, { light: string; dark: string }>;
  typeScale: Record<TypeRole, { size: number; weight: 400 | 500 | 600 }>;
  fontFamily: "Geist" | "Inter" | "DM Sans";
  shape: { radius: number; cardPadding: number; gap: number; shadow: "none" | "suave" | "marcada" };
  styleDefault: PresentationStyle;
  allowUserOverride: boolean;
  redesignDefault: boolean;
  redesignAvailable: boolean;         // org kill switch (B3)
};

export type ResolvedAppearance = {
  theme: ThemeId; mode: ColorMode; style: PresentationStyle; density: Density; textSize: TextSize;
  redesignEnabled: boolean;
  cssVars: { light: Record<string, string>; dark: Record<string, string> };   // B2
  version: number;                    // appearance version `v` (bumped on every org save)
};

// The cookie "cincel-appearance" holds JSON { theme, mode, style, density, textSize, v } (BE §8.2); FE reads it only through the layout.

export type NotificationKind = "asignacion" | "mencion" | "vencimiento" | "comentario" | "aprobacion_cliente" | "recordatorio" | "sistema";
export type NotificationItem = { id: string; kind: NotificationKind; title: string; body: string; entity: HistoryEntity | null; entityId: string | null; url: string | null; readAt: string | null; createdAt: string };

export type Note = { id: string; title: string; body: string; color: "neutral" | "blue" | "amber" | "violet" | "cyan"; pinned: boolean; projectId: string | null; updatedAt: string };
export type ChecklistItem = { id: string; text: string; done: boolean; sortOrder: number };
export type Checklist = { id: string; title: string; projectId: string | null; items: ChecklistItem[] };
export type Reminder = { id: string; text: string; dueAt: string; repeat: "none" | "daily" | "weekly" | "monthly"; channels: ("app" | "email")[]; taskId: string | null; projectId: string | null; firedAt: string | null; cancelledAt: string | null };

export type GmailThreadSummary = { id: string; subject: string; from: string; snippet: string; receivedAt: string; unread: boolean; projectId: string | null; suggestedProjectId: string | null };
export type GmailMessage = { id: string; from: string; to: string[]; cc: string[]; date: string; html: string /* sanitized */; text: string };
export type GmailAttachment = { messageId: string; attachmentId: string; name: string; mime: string; size: number };

export type TimeTrackingSettings = { enabled: boolean; requiredFrom: string | null; dayStart: string; dayEnd: string; hoursPerDay: number; lateToleranceMin: number; workDays: number[]; promptAtLogin: boolean; autoCloseAt: string | null; lunchMinutes: number; exemptRoles: string[] };
export type TodayStatus = { state: "off" | "on" | "pausa" | "done"; startedAt: string | null; workedSeconds: number; required: boolean; promptAtLogin: boolean; enabled: boolean; requiredFrom: string | null; hoursPerDay: number };
export type TeamHoursRow = { staffId: string; name: string; days: { date: string; hours: number }[]; total: number; target: number; lateCount: number; status: "completo" | "incompleto" | "sin_registro" };

export type VacationKind = "vacaciones" | "personal" | "enfermedad";
export type VacationRequest = { id: string; from: string; to: string; kind: VacationKind; comment: string; status: "pendiente" | "aprobada" | "rechazada" | "cancelada" };
export type VacationBalance = { entitled: number; taken: number; pending: number; available: number };

export type SearchResult = { type: "proyecto" | "tarea" | "persona" | "archivo" | "nota"; id: string; title: string; subtitle: string; url: string };   // "Acciones" is a static frontend group

export type AssistantContext = { route: string; projectId?: string; taskId?: string; personId?: string };
export type AssistantActionRecord = { id: string; threadId: string; toolCallId: string; tool: string; summary: string; input: unknown; status: "proposed" | "confirmed" | "cancelled" | "done" | "failed"; result: unknown | null; error: string | null; createdAt: string; decidedAt: string | null };

export type InicioData = { kpis: KpiDatum[]; tasksByTramo: DistributionSegment[]; weeklyPace: { weekStart: string; created: number; completed: number }[]; attention: AttentionItem[]; myDay: AgendaItem[]; projectsProgress: ProgressItem[]; workload: PersonDatum[] };
export type PersonaDetail = { staff: Staff; person: PersonDatum; stats: KpiDatum[]; projects: ProgressItem[]; tasks: AttentionItem[]; weekHours: { date: string; hours: number }[] | null; availability: Availability[]; recentActivity: PersonaActivityItem[] };
export type PersonaActivityItem = { id: string; text: string; at: string; when: string; href: string }; // last 10, admin items only with canSeeAdminData (BE §7.11)
export type PortfolioRow = { projectId: string; real: number; plan: number | null; deviation: number | null; budgetSpentPct: number | null; open: number; overdue: number; daysToDelivery: number | null; nextDelivery: { title: string; date: string } | null; series7: number[] };
export type PeopleOverviewRow = { staffId: string; open: number; overdue: number; activeProjects: number; occupancyPct: number; weekHours: number | null; availability: Availability[] };
```

Visibility rules on these outputs (server-enforced, B8): `attention`, `myDay`, `tasks`, `nextDelivery`, `projectsProgress[].next`, search results and assistant read tools exclude admin tasks and client/origin fields for viewers without `canSeeAdminData`; `budgetSpentPct` is `null` for non-admins; `weekHours` is `null` unless `canViewTeamHours` or self; the absence `kind` is `"ausencia"` unless owner or `canDecideVacations`.

### 7.2 Preferences (`lib/actions/preferences-actions.ts`) and org appearance (`lib/actions/org-appearance-actions.ts`)

`fetchMyPreferencesAction` and `updateMyPreferencesAction` live in `preferences-actions.ts` (Phase 1, implemented). The three org appearance actions live in `org-appearance-actions.ts` (`fetchOrgAppearanceAction` implemented in Phase 1; save/reset implemented in Phase 6).

| Action | Input | Output / errors |
|---|---|---|
| `fetchMyPreferencesAction()` | — | `UserPreferences` |
| `updateMyPreferencesAction(patch)` | `Partial<UserPreferences>` | `{ preferences: UserPreferences; appearance: ResolvedAppearance }` (also rewrites the `cincel-appearance` cookie) / `INVALID`, `OVERRIDE_DISABLED`, `DISABLED` (`redesignEnabled: true` while `redesignAvailable` is false) |
| `fetchOrgAppearanceAction()` | — | `OrgAppearance` |
| `saveOrgAppearanceAction(input)` | `OrgAppearance` | `OrgAppearance` / `FORBIDDEN`, `INVALID`, `LOW_CONTRAST: <pair> <mode> <ratio>[, …]` |
| `resetOrgAppearanceAction(base)` | `ThemeId` | `OrgAppearance` / `FORBIDDEN` |

### 7.3 Profile photo

| Action / route | Input | Output / errors |
|---|---|---|
| `POST /api/staff/me/photo` (route handler) | `multipart/form-data` field `file` (≤ 2 MB; jpeg/png/webp by magic bytes; client sends a canvas re-encode without EXIF) | `200 { url }` / `413 TOO_LARGE`, `415 INVALID_TYPE`, `429 RATE_LIMITED`, `401` |
| `removeMyPhotoAction()` | — | `void` |
| `GET /api/staff/[id]/photo` (route) | — | image (`ETag`, `304`); 404 when none; 401 without session |

### 7.4 Search (`lib/actions/search-actions.ts`)

| Action | Input | Output / errors |
|---|---|---|
| `searchWorkspaceAction(input)` | `{ query: string; types?: SearchResult["type"][]; limit?: number }` | `SearchResult[]` (urls: `/proyectos/<id>`, `/tareas/<id>`, `/personas/equipo/<id>`, `/personas/clientes?contacto=<id>`, `/mi-espacio/notas/<id>`, Drive link for files; no `accion` results) / `INVALID`, `RATE_LIMITED` |

### 7.5 Notifications (`lib/actions/notifications-actions.ts`)

| Action | Input | Output / errors |
|---|---|---|
| `fetchNotificationsAction(input)` | `{ unreadOnly?: boolean; kinds?: NotificationKind[]; cursor?: string }` | `{ items: NotificationItem[]; nextCursor: string \| null; unreadCount: number }` (in-app rows only) / `INVALID` |
| `markNotificationsReadAction(ids)` | `string[] \| "all"` | `{ unreadCount: number }` / `INVALID` |
| `fetchNotificationPreferencesAction()` | — | `{ rows: { kind: NotificationKind; inApp: boolean; email: boolean; digest: boolean }[]; quietHours: { from: string; to: string } \| null }` |
| `updateNotificationPreferencesAction(input)` | same shape | same / `INVALID` |

### 7.6 Mi espacio (`lib/actions/my-space-actions.ts`)

Owner-only (`FORBIDDEN` for someone else's row, `NOT_FOUND` for a missing one). Linked `projectId`/`taskId` must be visible to the caller (`FORBIDDEN` otherwise).

| Action | Input | Output / errors |
|---|---|---|
| `fetchNotesAction()` | — | `Note[]` |
| `createNoteAction(input)` | `{ title?: string; body?: string; color?: Note["color"]; pinned?: boolean; projectId?: string \| null }` | `Note` / `INVALID`, `FORBIDDEN` |
| `updateNoteAction(id, patch)` | `string`, `Partial<Omit<Note, "id" \| "updatedAt">>` | `Note` / `NOT_FOUND`, `FORBIDDEN`, `INVALID` |
| `archiveNoteAction(id)` | `string` | `void` / `NOT_FOUND`, `FORBIDDEN` |
| `restoreNoteAction(id)` | `string` | `Note` / `NOT_FOUND`, `FORBIDDEN` (undo of archive) |
| `fetchChecklistsAction()` | — | `Checklist[]` |
| `createChecklistAction(input)` | `{ title: string; items?: string[]; projectId?: string }` | `Checklist` / `INVALID`, `FORBIDDEN` |
| `addChecklistItemAction(checklistId, text)` | `string`, `string` | `ChecklistItem` / `NOT_FOUND`, `FORBIDDEN`, `INVALID` |
| `toggleChecklistItemAction(itemId, done)` | `string`, `boolean` | `ChecklistItem` / `NOT_FOUND`, `FORBIDDEN` |
| `reorderChecklistItemsAction(checklistId, ids)` | `string`, `string[]` | `void` / `NOT_FOUND`, `FORBIDDEN`, `INVALID` |
| `archiveChecklistAction(id)` | `string` | `void` / `NOT_FOUND`, `FORBIDDEN` |
| `fetchRemindersAction(input)` | `{ from?: string; to?: string }` | `Reminder[]` / `INVALID` |
| `parseReminderTextAction(text)` | `string` | `{ cleanText: string; dueAt: string \| null; repeat: Reminder["repeat"] }` / `INVALID` |
| `createReminderAction(input)` | `{ text: string; dueAt: string; repeat?: Reminder["repeat"]; channels?: ("app" \| "email")[]; taskId?: string; projectId?: string }` | `Reminder` / `INVALID`, `PAST_TIME`, `FORBIDDEN` |
| `snoozeReminderAction(id, until)` | `string`, ISO | `Reminder` / `NOT_FOUND`, `FORBIDDEN`, `PAST_TIME` |
| `cancelReminderAction(id)` | `string` | `void` / `NOT_FOUND`, `FORBIDDEN` |

### 7.7 Gmail (`lib/actions/gmail-actions.ts`)

| Action / route | Input | Output / errors |
|---|---|---|
| `fetchGmailStatusAction()` | — | `{ connected: boolean; scopeOk: boolean; lastSyncedAt: string \| null; lastError: string \| null }` |
| `fetchGmailThreadsAction(input)` | `{ query?: string; cursor?: string }` | `{ threads: GmailThreadSummary[]; nextCursor: string \| null }` / `NOT_CONNECTED`, `SCOPE_MISSING` |
| `fetchGmailThreadAction(id)` | `string` | `{ thread: GmailThreadSummary; messages: GmailMessage[]; attachments: GmailAttachment[] }` / `NOT_FOUND`, `NOT_CONNECTED`, `SCOPE_MISSING` |
| `syncGmailAction()` | — | `{ synced: number }` / `NOT_CONNECTED`, `RATE_LIMITED` |
| `linkGmailThreadToProjectAction(threadId, projectId)` | `string`, `string \| null` | `void` (writes the subject to project history) / `NOT_FOUND`, `FORBIDDEN` |
| `createGmailDraftAction(input)` | `{ to: string[]; subject: string; body: string; replyToThreadId?: string; draftId?: string /* update this draft instead of creating one */ }` | `{ draftId: string; confirmToken: string; expiresAt: string }` / `INVALID`, `NOT_CONNECTED`, `SCOPE_MISSING`, `NOT_FOUND` (draftId) |
| `sendGmailDraftAction(draftId, confirmToken)` | `string`, `string` | `{ messageId: string }` / `CONFIRM_REQUIRED`, `EXPIRED`, `NOT_CONNECTED` |
| `createTaskFromGmailThreadAction(threadId, input)` | `string`, `{ projectId: string; title?: string }` | `{ taskId: string }` / `NOT_FOUND`, `FORBIDDEN`, `NOT_CONNECTED` |
| `disconnectGmailAction()` | — | `void` (stops sync, deletes the caller's `gmail_threads` cache, sets `gmail_accounts.disconnected_at`; does **not** revoke the shared Google token) |
| `GET /api/auth/google/start?grant=gmail` (route) | — | incremental consent `gmail.readonly` + `gmail.compose` |
| `GET /api/gmail/attachments/[messageId]/[attachmentId]` (route) | — | attachment bytes (`Content-Disposition: attachment`); owner only; 404 / 401 |

### 7.8 Time tracking (`lib/actions/time-tracking-actions.ts`)

| Action / route | Input | Output / errors |
|---|---|---|
| `fetchTimeTrackingSettingsAction()` | — | `TimeTrackingSettings` |
| `saveTimeTrackingSettingsAction(input)` | `TimeTrackingSettings` | `TimeTrackingSettings` / `FORBIDDEN`, `INVALID` (incl. `requiredFrom` earlier than tomorrow when it changes) |
| `fetchMyTodayAction()` | — | `TodayStatus` |
| `clockInAction(input)` | `{ source: "sidebar" \| "login" \| "assistant" }` | `TodayStatus` / `DISABLED`, `ALREADY_ON` |
| `pauseWorkAction()` | — | `TodayStatus` / `NOT_ON` |
| `resumeWorkAction()` | — | `TodayStatus` / `NOT_ON` |
| `clockOutAction()` | — | `TodayStatus` / `NOT_ON` |
| `fetchMyWeekHoursAction()` | — | `{ days: { date: string; hours: number }[]; total: number; target: number }` |
| `fetchTeamHoursAction(input)` | `{ weekStart: string }` (a Monday) | `TeamHoursRow[]` / `FORBIDDEN`, `INVALID` |
| `GET /api/horario/export?week=YYYY-MM-DD` (route) | — | CSV for `canViewTeamHours` (403 otherwise); formula-leading cells escaped |

### 7.9 Vacations (`lib/actions/vacations-actions.ts`)

| Action | Input | Output / errors |
|---|---|---|
| `fetchMyVacationsAction()` | — | `{ balance: VacationBalance; requests: VacationRequest[] }` |
| `requestVacationAction(input)` | `{ from: string; to: string; kind: VacationRequest["kind"]; comment?: string }` | `VacationRequest` / `INVALID`, `OVERLAP` |
| `cancelVacationRequestAction(id)` | `string` | `void` / `NOT_FOUND`, `FORBIDDEN`, `STARTED` |
| `fetchPendingVacationRequestsAction()` | — | `(VacationRequest & { staffId: string; name: string; days: number })[]` (pendiente, oldest first) / `FORBIDDEN` (not `canDecideVacations`) |
| `decideVacationAction(id, decision, note?)` | `string`, `"aprobada" \| "rechazada"`, `string?` | `VacationRequest` / `FORBIDDEN`, `NOT_FOUND`, `INVALID` |
| `fetchTeamAbsencesAction(input)` | `{ month: string }` | `{ staffId: string; name: string; from: string; to: string; kind: VacationKind \| "ausencia" }[]` / `INVALID` |
| `fetchVacationSettingsAction()` | — | `{ daysPerYear: number; overrides: { staffId: string; name: string; days: number \| null }[] }` / `FORBIDDEN` (not `canDecideVacations`) |
| `saveVacationSettingsAction(input)` | `{ daysPerYear: number /* 0–60 */; overrides: { staffId: string; days: number \| null }[] }` | same as fetch / `FORBIDDEN`, `INVALID` |

### 7.10 Aggregates (`dashboard-actions.ts`, `people-actions.ts`, `projects-actions.ts`)

| Action | Input | Output / errors |
|---|---|---|
| `fetchInicioAction()` | — | `InicioData` |
| `fetchPersonaDetailAction(staffId)` | `string` | `PersonaDetail` / `NOT_FOUND` |
| `fetchPeopleOverviewAction()` | — | `PeopleOverviewRow[]` |
| `fetchProjectsPortfolioAction()` | — | `PortfolioRow[]` |

### 7.11 Assistant (`lib/actions/assistant-actions.ts`, `app/api/asistente/chat/route.ts`)

| Action / route | Input | Output / errors |
|---|---|---|
| `fetchAssistantThreadsAction()` | — | `{ id: string; title: string; updatedAt: string }[]` |
| `fetchAssistantThreadAction(id)` | `string` | `{ thread: { id: string; title: string; context: AssistantContext; updatedAt: string }; messages: UIMessage[] }` / `NOT_FOUND` |
| `deleteAssistantThreadAction(id)` | `string` | `void` / `NOT_FOUND` |
| `importLegacyAssistantThreadAction(messages)` | `UIMessage[]` (from `cincel.asistente.thread.v1`, ≤ 200; no model call) | `{ id: string }` of the new thread / `INVALID` |
| `fetchAssistantActionsAction(input)` | `{ threadId?: string; cursor?: string }` | `AssistantActionRecord[]` (newest first, page 30) / `NOT_FOUND` (thread) |
| `POST /api/asistente/chat` (route) | `{ id: string /* thread uuid generated by the client */; message?: UIMessage /* the new user message */; approvals?: { toolCallId: string; approved: boolean }[]; context: AssistantContext }` | UI message stream. Server upserts the thread, loads history from `assistant_messages` (client history ignored), resolves `context` ids through viewer-scoped reads, runs tools; tools with `confirm: true` are `needsApproval: true`; the client renders the summary from `lib/assistant/tool-summaries.ts`; tools report `available(ctx)` and stubs are not offered (§20 Rule 3) |

### 7.12 Scheduler and integrations (modules the UI depends on)

- `POST /api/cron/tick` (header `Authorization: Bearer ${CRON_SECRET}`): runs the registered jobs under lease locks — `notifications-deliver`, `daily-digest` at 07:30 (Phase 1), `reminders-fire`, `gmail-sync` (Phase 5), `auto-close-jornadas` (Phase 6). 401 without the secret. Not called by the UI.
- `lib/integrations/cutto-links.ts` (client-safe): `channelUrl(projectId)`, `meetingUrl(meetingId)`, `personChatUrl(email)` from `NEXT_PUBLIC_CUTTO_BASE_URL`.
- `lib/integrations/cutto-api.server.ts` (`import "server-only"`): API client; methods throw `DISABLED` while `CUTTO_API_URL` is unset.

## 8. Auth and access

- Every staff route requires a session (existing `getSession`). The `(staff)` layout redirects to `/login` without one.
- **Server guards, not the client prefix check (B4, R2):** one `layout.tsx` per admin segment folder (`app/(staff)/ajustes/(admin)/<segment>/layout.tsx`) calls `requirePageCapability(cap)`; failure = `notFound()` everywhere. `AppRouteGuard`'s `CONFIG_ROUTE_PREFIX` is kept only for the legacy `/configuracion` paths (which redirect anyway); `/ajustes/(personal)/*` needs only a session.
- **Capabilities** (added to `lib/auth/permissions.ts` in Phase 1; names as in BE §12): `canManageAppearance` (Administrador), `canManageGeneralSettings` (alias of today's General settings rule, keeping Dirección if today's rule allows it; `saveGeneralSettingsAction`/`restoreGeneralSettingsAction` switch to it in Phase 6), `canManageTimeTracking` (Administrador), `canViewTeamHours` (Administrador, Dirección — checked as `user.access === "Dirección"` like `canViewSensitiveStaffData`), `canDecideVacations` (Administrador, Dirección), `canSeeAdminData` (re-export via `lib/tramos/compat.ts`, §21.2). Existing capability objects keep their real names (`team.canViewTeam`, `portal.manageAccess`, `clients.canViewClients`, `activities.canViewActivities`, `projects.canViewProjects`, `dashboard.canViewDashboard`).

| Surface | Rule |
|---|---|
| Mi espacio, preferences, notifications, reminders, notes, checklists, Gmail | session; owner-only data (server filters by `staffId`) |
| `/ajustes/general` (segment guard and nav item) | `canManageGeneralSettings` |
| `/ajustes/tema` (segment guard and nav item), `saveOrgAppearanceAction`, `resetOrgAppearanceAction` | `canManageAppearance` (Administrador) |
| `/ajustes/horario` settings sections | `canManageTimeTracking` (Administrador) |
| `/ajustes/horario` report section (segment guard and nav item admit either capability) | `canViewTeamHours` (Administrador, Dirección) |
| `/ajustes/estatus`, `permisos`, `monday`, `google`, `tramos`, `puestos` (segment guards and nav items) | Administrador (today's rule) |
| `fetchTeamHoursAction`, CSV export | `canViewTeamHours` |
| Hours in Personas / Persona detalle / Perfil | server returns `weekHours` only for `canViewTeamHours` or self |
| `decideVacationAction`, `fetchPendingVacationRequestsAction`, "Solicitudes del equipo" | `canDecideVacations` (never on one's own request) |
| Absence kind in `fetchTeamAbsencesAction` | owner and `canDecideVacations`; others get `"ausencia"` |
| `fetchVacationSettingsAction`, `saveVacationSettingsAction` | `canDecideVacations` |
| Proyecto · Resumen "Cliente y contactos" | `canSeeAdminData`, or project member with `clients.canViewClients` |
| Admin tasks, client/origin in aggregates, search and assistant reads | excluded without `canSeeAdminData` (server) |
| Assistant | `requireCapabilityUser` (existing); each tool checks its capability (BE §12) |
| `AjustesNav` items | rendered only when the viewer has the item's capability (absent from the DOM otherwise) |

- Client gating mirrors these capabilities for rendering only; the server enforces every rule.

---

## 9. Error handling

`actionErrorText(err: unknown, context?: ErrorContext): string` in `lib/errors.ts` (the one signature; `ErrorContext` = `"search" | "cutto" | "photo" | "gmail" | "vacations"` plus Project Flow's keys) returns Spanish copy; it accepts an `Error`, a `"CODE: detail"` string or an HTTP status from the photo route. Codes are additive across features. Codes not listed fall back to "No se pudo completar la acción. Intenta de nuevo."

| Code | Copy |
|---|---|
| `FORBIDDEN` | "No tienes permiso para realizar esta acción." |
| `NOT_FOUND` | "Ya no existe. Recarga la página." |
| `INVALID` | "Faltan datos o no son válidos. Revisa el formulario e intenta de nuevo." |
| `INVALID` (search) | "Escribe al menos 2 letras." |
| `OVERRIDE_DISABLED` | "La organización fijó el tema y el estilo. Pídele a un administrador que lo cambie." |
| `LOW_CONTRAST` | "Algunos textos no se leerían bien (contraste menor a 4.5:1). Ajusta los colores marcados." |
| `INVALID_TYPE` | "Ese archivo no es una imagen. Usa JPG, PNG o WebP." |
| `PAST_TIME` | "Esa fecha ya pasó. Elige una hora futura." |
| `NOT_CONNECTED` | "Gmail no está conectado. Conéctalo en Ajustes › Gmail, calendario y Cutto." |
| `SCOPE_MISSING` | "Falta dar permiso para leer el correo. Vuelve a conectar Gmail." |
| `CONFIRM_REQUIRED` | "Confirma el envío antes de continuar." |
| `EXPIRED` | "Esta confirmación venció. Vuelve a intentarlo." |
| `ALREADY_ON` | "Ya registraste tu entrada hoy." |
| `NOT_ON` | "Tu jornada no está en curso." |
| `DISABLED` | "Esta función está desactivada." |
| `DISABLED` (redesign opt-in) | "El nuevo diseño no está disponible por ahora." |
| `DISABLED` (Cutto) | "La integración con Cutto aún no está disponible. Usa el enlace para abrir Cutto." |
| `OVERLAP` | "Ya tienes una solicitud en esas fechas." |
| `NOT_IMPLEMENTED` | "Esta función todavía no está disponible." |
| `RATE_LIMITED` (gmail) | "Se sincronizó hace un momento. Intenta de nuevo en unos minutos." |
| `RATE_LIMITED` (search, photo, other) | "Demasiados intentos seguidos. Espera unos segundos e intenta de nuevo." |
| `STARTED` | "Esa solicitud ya empezó; ya no se puede cancelar. Habla con quien la aprobó." |
| `TOO_LARGE` (photo route, 413) | "La imagen pesa más de 2 MB. Elige una más ligera." |

- **Stubs (§20 Rule 1):** while a domain's actions are Phase 1 stubs (its `IMPLEMENTED` entries, imported from the plain flags module `lib/actions/<domain>-actions.flags.ts` — no `"use server"` — are `false`, or its read action reports disabled/empty), the UI **hides the entry point** (nav item, button, palette command, sidebar slot), so no write stub is reachable from the UI; `NOT_IMPLEMENTED` copy exists only as a safety net.
- **Where errors show:** forms and dialogs inline under the field (`aria-describedby`) or an `Alert variant="destructive"` above the footer; optimistic actions (preferences, checklist toggles, drag-and-drop, clock) roll back and show a Sonner error toast; page loads use `ErrorState`.
- **Toasts:** this feature makes Sonner the standard for transient feedback: success after create/save ("Nota guardada", "Recordatorio creado para {fecha}", "Entrada registrada 9:02"), error on rollback, and undo where the action is reversible (archive note: "Nota archivada" + "Deshacer" 10 s).

---

## 10. shadcn inventory

Added with the shadcn CLI: `sonner`, `calendar`, `popover` date-picker pattern (`calendar` + `popover`), `toggle-group` (segmented controls), `slider`, `hover-card` (not required; omit if unused). Existing primitives are reused.

| Feature | Primitives |
|---|---|
| Shell | `sidebar`, `sheet` (mobile Más, assistant), `command` + `dialog` (palette), `dropdown-menu` (avatar menu), `tooltip`, `badge`, `sonner` |
| Inicio | `card`, `chart`, `progress`, `table`, `avatar`, `button` |
| Mi espacio | `card`, `tabs`, `sheet`, `dialog`, `input`, `textarea`, `checkbox`, `switch`, `calendar`, `popover`, `select`, `dropdown-menu` |
| Tareas | `toggle-group`, `badge`, `card`, `table` (via `DataTable`), `sheet`, `dialog`, `popover`, `calendar`, `select`, `command` (comboboxes) |
| Proyectos / Personas / Biblioteca | `tabs` (as links), `card`, `table`, `progress`, `avatar`, `breadcrumb`, `dialog`, `sheet` |
| Ajustes | `radio-group`, `toggle-group`, `slider`, `switch`, `select`, `input` (color + text), `checkbox`, `alert`, `card` |
| Asistente | `sheet`, `card`, `button`, `textarea`, `scroll-area`, `table` |
| Time clock | `card`, `badge`, `progress`, `dialog` (login prompt), `popover` (mobile) |

Rules: variants only; no component receives a color class. Tints are produced by the tint utilities of §14.5, not by arbitrary hex classes. Icons are `lucide-react` (stroke 1.8–2), replacing the Sidebar's hand-drawn SVGs. `components/v2/*` components are reused where they fit (`KpiTile`, `StatusBadge`, `PersonAvatar`, `PhaseStepper`) and restyled through tokens.

---

## 11. Environment (frontend-facing)

| Variable | Use |
|---|---|
| `NEXT_PUBLIC_CUTTO_BASE_URL` | Base for Cutto deep links in `lib/integrations/cutto-links.ts` (default `https://cutto.cloudketer.dev`) |

There is no client-side kill switch: the org setting `appearance.redesignAvailable` is enforced on the server (§2.3). Server-only variables (`CRON_SECRET`, `CUTTO_API_URL`, `CUTTO_API_TOKEN`, Gmail scopes) are in BE §14.

---

## 12. Folder structure (changes only)

```
app/
  (staff)/inicio/page.tsx
  (staff)/mi-espacio/page.tsx            # ?nota=<id> opens NoteEditor
  (staff)/mi-espacio/notas/[id]/page.tsx # redirect → /mi-espacio?nota=[id]
  (staff)/tareas/{page.tsx,loading.tsx,error.tsx}   # ?tarea=<id> opens TaskSheet
  (staff)/tareas/[id]/page.tsx       # redirect → /tareas?tarea=[id]
  (staff)/proyectos/... (moved; adds [id]/page.tsx Resumen and [id]/tareas)
  (staff)/personas/{page.tsx,clientes,contratistas,proveedores,equipo/[id]}
  (staff)/biblioteca/{page.tsx,[seccion],empresa/[doc],vacaciones}
  (staff)/asistente/page.tsx
  (staff)/layout.tsx                 # flag on → AppShell; off → children bare
  (staff)/ajustes/page.tsx
  (staff)/ajustes/(personal)/{perfil,apariencia,notificaciones,integraciones}
  (staff)/ajustes/(admin)/<segment>/layout.tsx   # one per segment: requirePageCapability(cap) → notFound()
  (staff)/ajustes/(admin)/{general,tema,horario,tramos,puestos,estatus,permisos,monday,google}
  api/staff/me/photo/route.ts        # POST upload (2 MB; metadata stripped server-side)
  api/staff/[id]/photo/route.ts
  api/gmail/attachments/[messageId]/[attachmentId]/route.ts
  api/horario/export/route.ts
  not-found.tsx
  (old routes keep page.tsx as redirect stubs)
components/widgets/     StyleView, WidgetCard, KpiWidget, DistributionWidget, ProgressListWidget, AttentionListWidget, AgendaWidget, PeopleWidget, RecordTable, EntityCardGrid, TaskBoardWidget, CronogramaWidget, fixtures/ (one fixture per widget and style) (StatusChip, TramoBadge re-exported)
components/patterns/    FormSheet, FormDialog, SettingsSection, SettingsRow, ListPage, FiltersBar
components/shell/       AppShell, LegacyFrame, Sidebar, TimeClock, BottomTabs, PageHeader (re-export of v2), EstiloSwitch, StyleProvider, EmptyState, ErrorState, LoadingSkeleton, CommandPalette, AppearanceProvider, ClockInPrompt
components/inicio/      InicioClient, ProfilePhotoButton, KpiTiles, KpiTable, TramoDonut, WeeklyPaceChart, AttentionList, MyDayAgenda, ProjectProgressList, WorkloadBars
components/mi-espacio/  MiEspacioClient, QuickCapture, Inbox, GmailReader, GmailDraftSheet, NoteEditor, NotesGrid, ReminderDialog, ChecklistCard
components/tareas/      TareasClient, TaskSheet, NewTaskDialog, EventDetailPopover (existing files kept until cleanup)
components/proyectos/   ProjectTabs, ProjectsPortfolio, ProjectSummary, ProjectTasksByFase, NewProjectDialog
components/personas/    PersonasTabs, TeamGrid, TeamTable, AvailabilityWeek, PersonaDetail
components/biblioteca/  BibliotecaIndex, BibliotecaSection, DocumentReader, VacationForm, VacationHistory, TeamAbsencesStrip
components/ajustes/     AjustesNav, AparienciaClient, ThemeEditor, TokenRow, TypeScaleRow, ContrastBadge, HorarioClient, TeamHoursTable, NotificacionesClient, IntegracionesClient
components/asistente/   AssistantButton, AssistantSheet, ConfirmationCard, AssistantTableMessage, AssistantTimelineMessage (existing files kept)
lib/ui/                 preferences.ts (resolveAppearance), nav.ts, themes.ts (presets §14), tints.ts, contrast.ts
lib/tareas/query.ts
lib/integrations/cutto-links.ts      # client-safe
lib/integrations/cutto-api.server.ts # server-only (BE)
lib/tramos/compat.ts                 # Project Flow compatibility (§21.2)
lib/shell/nav-items/<domain>.ts      # nav extension points (§21.1)
lib/types/redesign.ts
lib/types/widgets.ts                 # BE-owned widget shapes
```

---

## 13. Label table

| Old | New |
|---|---|
| "Dashboard", "Dashboard ejecutivo" | "Inicio" |
| "Bienvenido, {name}" (every page) | "Buenos días, {name}" on Inicio only |
| "Actividades", "Tablero", "Mis tareas", "Calendario" (menu) | "Tareas" (views Tablero / Lista / Calendario; "Responsable: Yo") |
| "Área", "Departamento", "Etapa", "Workflow" (tramo concept) | "Tramo" (Project Flow §13) |
| "Taller de diseño" | "Diseño" |
| "Equipo", "Directorio", "Clientes", "Proveedores" (menu) | "Personas" (tabs Equipo, Clientes, Contratistas, Proveedores) |
| "Recursos", "Empresa" (menu) | "Biblioteca" |
| "Mis vacaciones" (resource section) | "Mis vacaciones" under Biblioteca |
| "Configuración" | "Ajustes" |
| "Seguridad y datos de acceso" (/profile) | "Perfil" |
| "Workflows" (config) | "Tramos y fases" |
| "Áreas" (config) | "Puestos" |
| "Viernes, 6 De Noviembre" | "viernes, 6 de noviembre" (`Intl.DateTimeFormat("es-MX")`, no title case) |
| "Noviembre De 2026" | "noviembre de 2026" |
| "Dashboard · PÁGINA" sidebar block | removed |
| Header icon tiles (Instagram, web, correo, salir) | avatar menu entries |

---

## 14. Design tokens and themes

**Single source of truth for values:** every token value (three themes × light/dark, ink tokens, `warning-ink`, `border-strong`), the type scale defaults and the shape defaults are defined in **backend.md §5** (seeded into `appearance.theme` and exported as presets by `lib/ui/themes.ts`). This spec does not repeat hex values; implementers read BE §5 and the preset test guarantees FE and BE use the same file. The canvas frames (`Tokens`, `AjustesAdmin`, `InicioCalido`, `InicioGrafito`, `InicioOscuro`) are visual references only.

### 14.1 Mechanism

- Presets: `lib/ui/themes.ts` (`Record<ThemeId, OrgAppearance>`, from BE §5). The org value starts from a preset and may override any token, type role or shape value.
- `resolveAppearance(org, user)` returns `cssVars: { light, dark }` with every `--{token}`, plus `--radius`, `--card-padding`, `--gap`, `--shadow-card`, `--font-sans` and `--type-{role}-size` / `--type-{role}-weight`. Rendered server-side, for flag-on users only, in `<style id="appearance">` as `html:root[data-theme="light"]{…}` and `html:root[data-theme="dark"]{…}` (§4.1, B18). `globals.css` keeps today's Grafito values as the static fallback (what flag-off users see) and the `@theme inline` mapping until Phase 9, which switches the fallback to Azul.
- Mode: `light` / `dark` / `system`; `data-theme` (and `.dark` in sync) on `<html>` — server for explicit modes, head script for system.

### 14.2 Roles

| Role | Tokens |
|---|---|
| Page and surfaces | `background`, `card`, `popover`, `muted`, `accent`, `border`, `border-strong` (control borders, table heads), `input` |
| Text | `foreground`, `card-foreground`, `muted-foreground`, `secondary-foreground`, `accent-foreground` |
| Actions | `primary` / `primary-foreground`, `secondary` / `secondary-foreground`, `ring` |
| Semantic | `destructive` (vencido, bloqueado, error), `warning` (fill) with `warning-ink` (text), `success` |
| Data series | `chart-1` Presale, `chart-2` Diseño, `chart-3` Construcción (via `tramoColorSlot`, §21.2); `chart-4`, `chart-5` generic series (e.g. "Creadas", En proceso) |
| Text on data colors | **always** `chart-N-ink` (never `chart-N` as text color) |
| Navigation | `sidebar`, `sidebar-foreground`, `sidebar-primary`, `sidebar-primary-foreground`, `sidebar-accent`, `sidebar-accent-foreground`, `sidebar-border`, `sidebar-ring` |

Status colors: Pendiente `muted-foreground`, En proceso `chart-4`, Completado `success`, Bloqueado / vencido `destructive`; custom statuses take their base status color.

### 14.3 Type scale, density and text size

Roles (`TypeRole`): `pageTitle`, `sectionTitle`, `cardTitle`, `body`, `label`, `kpi`; default sizes and weights per BE §5.4 (page title 22/600, body 14/400, label 12/500, KPI 28/500; no weight above 600). Style adjustments (applied by the widgets, not by tokens): Esencial body 15 / label 13 / KPI 30; Analítico body 12.5 / table headers 11.5 / numbers in Geist Mono.

- Text size preference scales `body` (and proportionally `label`, `cardTitle`) through `--text-base` (13–16); headings stay fixed.
- Density: `comoda` (card padding `shape.cardPadding`, row padding 10–12 px) / `compacta` (card padding −4 px, row padding 7–8 px).
- Fonts: Geist (default), Inter, DM Sans (§4.1); Geist Mono for dates and numbers.

### 14.4 Shape and spacing

`shape.radius` (cards; controls use `radius − 4`, chips full), `shape.cardPadding`, `shape.gap`, `shape.shadow` (`none` | `suave` | `marcada`); defaults per theme in BE §5.4. Page padding `0 28px 40px` (desktop), 16 px (mobile). Esencial cards never show a shadow; Analítico uses radius 10 and no shadow (widget rule).

### 14.5 Tints

`chart-N-tint` = `color-mix(in oklab, var(--chart-N) 14%, var(--card))` (light) / `22%` (dark), defined once in `globals.css` as `@utility tint-chart-N` and `ink-chart-N`; text on a tint uses `chart-N-ink`. Note colors: neutral → `muted`, blue → chart-1, violet → chart-2, amber → chart-3, cyan → chart-4. The same formula is implemented in `lib/ui/contrast.ts` so the checker evaluates the real tint.

### 14.6 Contrast rules

One pure module, **`lib/ui/contrast.ts`** (BE-owned, client-importable), with **one pair list** used by the editor (`ContrastBadge`, row warnings), by `saveOrgAppearanceAction` and by the preset test:

- **Text ≥ 4.5:1:** foreground/background, foreground/card, muted-foreground/background, muted-foreground/card, primary-foreground/primary, secondary-foreground/secondary, destructive/card, destructive/background, success/card, warning-ink/card, sidebar-foreground/sidebar, sidebar-primary-foreground/sidebar-primary, chart-N-ink/chart-N-tint.
- **Non-text ≥ 3:1:** chart-1..5/card, border-strong/card, ring/background.

The editor disables "Publicar para todos" and marks the failing rows when `checkContrast(draft)` returns any failure; the server returns `LOW_CONTRAST: <pair> <mode> <ratio>[, …]` for the same list. A Vitest test asserts every preset passes in all six theme × mode combinations (values from BE §5).

---

## 15. Presentation styles

### 15.1 Resolution

`style = urlOverride ?? (org.allowUserOverride ? user.style : null) ?? org.styleDefault` (`urlOverride` read on the server from `?estilo=`). The layout passes it to `StyleProvider`; inside the library, `StyleView` calls exactly one of its three render props for the current style (never renders all three hidden). Pages never see `StyleView`. Changing style re-renders client-side without refetch: every data page loads the data needed by all three styles in one action (e.g. `fetchInicioAction`).

### 15.2 Rules per style

| Aspect | Visual | Esencial | Analítico |
|---|---|---|---|
| Charts, rings, sparklines, progress bars | yes | no | sparklines only (56–72 × 16–18, `foreground` stroke) |
| Tinted chips / colored fills | yes (tints §14.5) | no (plain text; optional 6 px `muted-foreground` dot) | tramo shown as 8 px color dot only |
| Avatars | yes | no (names as text) | initials text only |
| Containers | cards with shadow per theme | white cards, 1 px border, no shadow | tables (radius 10, header row `muted`), no shadow |
| Body text | 14 px | 15 px; meta 13 px | 12.5 px; headers 11.5 px |
| Numbers | Geist, KPI 28–30 px | Geist, 30 px for KPIs | Geist Mono, right-aligned |
| Extra data | — | — | Δ vs previous period, averages, min–max, % columns, totals row, heat cells (> 60% `destructive` tint, > 45% `warning` tint) |
| Max content width | full | 980 px | full |
| Overdue | `destructive` pill / date | `destructive` text only | `destructive` text in "Retraso" column |

### 15.3 Matrix (from `Estilos.dc.html`)

| Widget | Visual | Esencial | Analítico |
|---|---|---|---|
| Indicadores | tile: number, sparkline, delta pill | number + label | table: hoy, Δ 7 días, prom. 30 días, mín–máx, tendencia |
| Tareas por tramo | donut + legend | list with counts | table: abiertas, vencidas, % heat, días prom., total |
| Avance de proyectos | rings / bars | list with % | real vs plan, desviación, presupuesto |
| Requiere atención | tinted rows with avatar | title + date | compact table with days late |
| Tablero de tareas | columns with color cards | list grouped by estatus | dense table + estatus summary |
| Calendario | events with tramo color | agenda per day | load heat map + deliveries table |
| Proyectos / cronograma | cards with ring, Gantt | list with tramo and % | portfolio: real vs plan, deviation, budget |
| Personas | cards with avatar and availability | directory list | occupancy, hours (if allowed), overdue table |
| Density / text | comfortable, 14 px | roomy, 15 px | compact, 12–13 px, mono numbers |

Pages listed in brief decision 3 implement all three; every other page (forms, dialogs, settings, auth) ignores the style.

---

## 16. Accessibility

- Every page passes axe with no serious/critical violations in all three themes, light and dark (Vitest `*-a11y.test.tsx` per new page client).
- Text contrast per §14.6. Focus ring 2 px `ring` with 2 px offset on every interactive element (sidebar uses `sidebar-ring`).
- `EstiloSwitch`, theme cards and segmented controls are radio groups (arrow keys move, Space selects). View switch and tabs that navigate are links with `aria-current="page"`.
- `TimeClock` time is `role="timer"` with `aria-live="off"`; state changes announce via a polite live region ("Entrada registrada a las 9:02").
- Sheets/dialogs trap focus, close with Escape (except a required `ClockInPrompt`), and return focus. The required prompt has a visible explanation.
- Drag-and-drop on the board has a keyboard alternative: the card's status select (existing) and "Mover a…" menu.
- Charts have `role="img"` + `aria-label` with the key numbers, and the Analítico table is the accessible equivalent.
- Icon-only buttons have `aria-label`. No color-only meaning: tramo dots always have a text label nearby; status uses text.
- `prefers-reduced-motion`: no sheet/dialog animation, no ticking animation (time still updates).
- `<html lang="es">`.

---

## 17. Testing

Vitest + Testing Library colocated (existing pattern); Playwright e2e in `tests/e2e/` (`CI=1 npm run test:e2e` locally, results on the issue).

**Unit:** `resolveAppearance` (org/user/override/url precedence), `contrast` (known pairs), every preset passes contrast, `parseTareasQuery`/`toTareasSearch` round trip, tint utilities, nav model per role, `actionErrorText` for every §9 code, date formatting (lowercase es-MX).

**Components (each with an a11y test):**
- `AppShell`/`Sidebar`: active item, badges, Organización hidden for non-admins, `TimeClock` only when enabled and not exempt, mobile `BottomTabs` under 768 px.
- `TimeClock`: buttons per state; ticking from `startedAt`; rollback on `NOT_ON`; "Opcional hasta…" before `requiredFrom`.
- `ClockInPrompt`: dismissible before `requiredFrom`, not dismissible after; calls `clockInAction({source:"login"})`; becomes dismissible after an error other than `ALREADY_ON`.
- `EstiloSwitch` + `StyleView`: renders only the chosen style; keyboard selection; disabled with `OVERRIDE_DISABLED`; `?estilo=` override.
- Root layout flag-off: renders today's pipeline only (the `primary-color` style block, `ThemeToggle` `data-theme`), and emits no `<style id="appearance">`, no appearance attributes and no head script (B17).
- Root layout + `AppearanceProvider` (flag on): server renders `<html>` attributes, `.dark` for explicit dark, `data-theme` always present, the `<style id="appearance">` block with `html:root[data-theme="light"]` and `html:root[data-theme="dark"]` sections; no `style` attribute on `<html>` ever carries a token; the system-mode head script toggles `.dark` from `matchMedia`; theme change swaps the style block; rollback on error.
- `ThemeEditor`: editing a token updates the preview; failing contrast disables publish and marks rows; "Partir de" loads a preset; reset confirms.
- `InicioClient`: three styles render the same numbers (snapshot of the KPI values per style); photo upload errors (`TOO_LARGE`, `INVALID_TYPE`).
- `Inbox`, `GmailReader`, `GmailDraftSheet` (send requires confirmation dialog), `NoteEditor`, `ReminderDialog` (`PAST_TIME`), `ChecklistCard`, `QuickCapture` routing (note / checklist / reminder).
- `TareasClient`: URL-synced filters, "Responsable: Yo", view switch, collapsed empty columns, drag rollback; `TaskSheet` deep link and back; `NewTaskDialog` fase list per tramo.
- `ProjectTabs` (Clientes only with permission), `ProjectsPortfolio` styles.
- `PersonasTabs` keep style across tabs; hours column hidden for non-allowed viewers.
- `VacationForm` (`OVERLAP`), `TeamHoursTable` styles, `CommandPalette` grouping and min length.
- `AssistantSheet`: context chip only for server-confirmed context; a tool part in `approval-requested` renders `ConfirmationCard` with the tool summary, and Confirmar/Cancelar call `addToolApprovalResponse`; output-available / output-denied / output-error states render; the client sends a generated thread id and only the new message; legacy localStorage thread calls `importLegacyAssistantThreadAction` once and deletes the key; `render_table`/`render_timeline` render through `RecordTable`/`AgendaWidget`.
- Redirect stubs: each old route redirects to its §2.2 target when the flag is on and renders as today when off; new-only routes redirect to legacy when off; `/actividades/[tramo]?project=X` keeps `project` and adds `iniciar=1`.
- `(staff)` layout: flag on mounts `AppShell` once; flag off renders children bare (legacy pages show their own sidebar; restyled pages show `LegacyFrame`); never two sidebars.
- Admin guards: each `/ajustes/(admin)/<segment>/layout.tsx` returns 404 for a viewer without the segment capability of §8 (server test per segment), and `AjustesNav` omits exactly those items; Dirección reaches `/ajustes/horario` (report only) and `/ajustes/general` when `canManageGeneralSettings` allows it.
- Stub phase: with Phase 1 stubs (`IMPLEMENTED` flags false in `lib/actions/<domain>-actions.flags.ts`, read actions disabled/empty), no nav item, palette command, sidebar slot or button that would call a write stub is rendered (one test per domain); "Registrar entrada" is absent from the palette while `fetchMyTodayAction().enabled` is false.
- `ConfirmationCard` renders the summary from `lib/assistant/tool-summaries.ts` for the part's `toolName` and `input`.
- Visibility (B8): `InicioClient`, `PersonaDetail`, `ProjectsPortfolio` render no admin task and no client data from fixtures that mark them as excluded; the Resumen "Cliente y contactos" card is absent for a non-member without `canViewClients`.
- Vacations: "Solicitudes del equipo" only for `canDecideVacations`; absences show "Ausencia" when the kind is `"ausencia"`; `STARTED` copy on cancel.
- Gmail: "Desconectar" dialog copy and link; reader body inside a sandboxed iframe; editing a draft passes `draftId`.

**Flags check (B20):** a Vitest test imports every `lib/actions/*-actions.ts` and its sibling `*-actions.flags.ts` and fails when an exported action has no key in `IMPLEMENTED` (or a key names no action), and when a `"use server"` file exports anything other than async functions (so `IMPLEMENTED` can never live in an actions file).

**Guard test:** fails when any file outside `components/widgets/*` imports `StyleView` or branches on the presentation style (`style ===`, `useStyle().style` in a conditional). Allowlist: `components/widgets/*` (everything), and `components/shell/EstiloSwitch.tsx` / `components/shell/StyleProvider.tsx` (they read and set the style but render no per-style markup).

**Widget library:** each widget has one test per style (same data → expected visual / esencial / analítico output, e.g. `KpiWidget` renders the same value in tile, number and table row), an empty-state test and an a11y test; `RecordTable` covers grouping, totals ("auto"), heat thresholds and mono alignment; the guard test of §18 item 15.

**E2E dark-mode checks (B18):** with the flag on and the browser context set to `colorScheme: "dark"`, the computed `--background` of `<html>` equals the light value in mode `light`, the dark value in mode `dark`, and follows the OS in mode `system` (switching the emulated scheme updates it without reload); with the flag off and `colorScheme: "dark"`, the page shows today's legacy dark rendering unchanged.

**E2E (Playwright):** shell + navigation + redirects; preferences persist across reload (theme, style, mode); admin publishes a theme and another user sees it; Mi espacio note/checklist/reminder flow (reminder fires via a test call to `/api/cron/tick`); time tracking: enable, clock in/pause/out, required-from date makes the prompt mandatory; Tareas board drag and task sheet; assistant opens on three pages with the right context and a confirm-required tool shows the card. Existing e2e specs touching `/dashboard`, `/tablero`, `/mis-tareas`, `/equipo`, `/directorio`, `/recursos`, `/configuracion/*` are updated to the new routes.

---

## 18. Acceptance (frontend)

1. With the flag on, every route in §2.1 renders inside `AppShell` with exactly one page header, and every old route in §2.2 redirects (query preserved).
2. With the flag off, the old screens render unchanged and new routes redirect to their old equivalents.
3. Changing theme, mode, style, density or text size in Ajustes › Apariencia applies on the current page without reload and persists on another device after sign-in.
4. Every page in brief decision 3 renders Visual, Esencial and Analítico from the same data (the KPI numbers match across styles) and the `EstiloSwitch` is operable by keyboard.
5. An admin can change any token, type role and shape value; "Publicar para todos" is disabled while any pair of `lib/ui/contrast.ts` fails, and every seeded preset publishes without change; after publishing, other users see the change on their next page load.
6. With overrides off, users cannot change theme or style (controls disabled with the §9 copy).
7. Mi espacio: create/edit/archive notes (with undo), checklists with toggles, reminders from natural text; a reminder due now appears in Bandeja within one minute.
8. Gmail: connect, list threads, open one, link it to a project, create a task from it, draft a reply; sending requires the confirmation dialog.
9. Control de horario: when enabled, the sidebar clock appears for non-exempt users; start/pause/resume/end work; before `requiredFrom` the login prompt can be skipped; after, it cannot; the admin report shows completo/incompleto/sin registro and exports CSV.
10. The assistant button is on every staff page (except `/asistente`), shows the current entity in its context chip, and every confirm-required tool shows a `ConfirmationCard` before acting.
11. Cutto appears only as links that open cutto.cloudketer.dev in a new tab.
12. No page shows a font weight above 600, a global header, or the labels on the left side of §13.
13. Axe reports no serious or critical violations on each new page in all three themes, light and dark.
14. Mobile (390 px): bottom tabs, no horizontal scroll on any page, touch targets ≥ 44 px.
15. No page renders per-style markup directly: every difference between Visual, Esencial and Analítico lives inside the widget library (`components/widgets/*`, §4.10). `StyleView` is imported only inside `components/widgets/` (EstiloSwitch and StyleProvider in `components/shell/` are allowlisted); the guard test of §17 enforces it, and `ListPage` passes data plus a widget spec, never markup per style.
16. Every new component in the reuse ledger (§4.11.1) marked "extends/replaces/evolves" is implemented by changing the named existing component, not by adding a parallel one; the replaced component is deleted in the cleanup phase.
17. With the flag off (or `redesignAvailable` false), every legacy page renders exactly as today (same colors, `primary-color` block, `ThemeToggle`; no appearance block emitted) with its old sidebar and header, and opting in from the banner or user menu works for a non-admin without visiting any admin page.
18. Every `/ajustes` admin segment is guarded on the server; a non-admin gets 404 on `/ajustes/permisos`, `/ajustes/general` and `/ajustes/estatus`, while Perfil and Apariencia work for every staff member.
19. No aggregate, search result or assistant read shows an admin task or client/origin data to a viewer without `canSeeAdminData`, and absence kinds are visible only to the owner and approvers.
20. A confirm-required assistant tool shows `ConfirmationCard` from the native approval request; after Confirmar, the model receives the tool result in the same conversation; after Cancelar, it receives the denial.

---

## 19. Resolved decisions

| # | Topic | Decision | Where applied |
|---|---|---|---|
| RD-1 | Style in the URL | No; preference-driven, `?estilo=` only as a one-render override | §4.2, §15.1 |
| RD-2 | Global header | Removed; its links move to the avatar menu and Ajustes › General | §3.1, §3.8 |
| RD-3 | Route group | All staff pages move to `app/(staff)` with one `AppShell` | §5, §12 |
| RD-4 | Theme application | CSS variables from `resolveAppearance`, SSR via cookie, no flash | §4.1, §14.1 |
| RD-5 | Cutto | Deep links only (`lib/integrations/cutto-links.ts`); no embedded UI | §4.9, §11 |
| RD-6 | Project Flow overlap | Tareas uses Project Flow contracts when present; otherwise `workflows` rows; never blocks | §3.4 |
| RD-7 | Views/downloads in Biblioteca Analítico | Deferred (no tracking exists) | §3.7 |
| RD-8 | Location in Control de horario | Not built | §3.8 |
| RD-9 | Notification "Cutto" channel | Not built | §3.8 |
| RD-10 | Automations (`AjustesWorkflows` frame) | Later feature; no route here | §2.1 |
| RD-11 | Toasts | Sonner is the standard for transient feedback in this feature | §9 |
| RD-12 | Header links, profile photo, theme, assistant thread | Move from localStorage to the DB (read once, migrate, delete key) | §3.8, §4.1, §3.9 |
| RD-13 | Reuse | Style-aware widget library + shared patterns; pages compose, never branch on style; existing components are evolved before new ones are added | §4.10, §4.11, §18 items 15–16 |
| RD-14 | Deep-link sheets | Search params (`/tareas?tarea=`, `/mi-espacio?nota=`), not intercepting routes; the path forms `/tareas/[id]` and `/mi-espacio/notas/[id]` (used by search and notifications) redirect to them | §2.1, §2.2 |
| RD-15 | Profile photo upload | Route handler `POST /api/staff/me/photo` (2 MB) after a client canvas re-encode that strips EXIF | §3.2, §7.3 |
| RD-16 | Assistant confirmation | AI SDK 7 native tool approval (`needsApproval`, `addToolApprovalResponse`); no separate confirm/cancel actions | §3.9, §7.11 |
| RD-17 | Token values | Defined only in BE §5; FE §14 keeps roles and rules | §14 |
| RD-18 | Backend Annex C.2 consumers | C2 vacation settings → "Días de vacaciones" in Mis vacaciones (deciders); C3 Gmail attachments route → reader download links; C6 `fetchMyWeekHoursAction` → Perfil line; C4 (`calendar.events` grant) and C5 (parametric costs editor) → **out of scope** for this feature (no FE screen) | §3.3, §3.8, §7 |
| RD-19 | Search "Acciones" group | Static client-side commands; the server returns only entity results (no `accion` type) | §3.12 |

---

## 20. Phase plan and file ownership

Rule 1. Phase 1 creates every new file. Each later phase owns the implementation of the files listed for it, exclusively. Phase 1 stubs: read actions return safe defaults (empty lists, `enabled: false`, `connected: false`); write actions throw `NOT_IMPLEMENTED` (new shared code, Spanish copy "Esta función todavía no está disponible.", §9). Each actions file has a sibling plain flags module `lib/actions/<domain>-actions.flags.ts` (`export const IMPLEMENTED = { … } as const`, no `"use server"`); Phase 1 creates every flags file, and the phase that owns an actions file owns its flags file and flips its entries. The UI imports the flags file and hides an entry point while its `IMPLEMENTED` flag is false (or its read action reports it disabled or empty), so nothing calls a write stub from the UI.
Rule 2. Phases 2–8 depend only on Phase 1 and never on each other. Phase 9 (Cleanup) runs after all.
Rule 3. Assistant tools register an `available(ctx)` check that imports the flags files (`lib/actions/<domain>-actions.flags.ts`) of the actions they call (§3.9); a tool whose backing action is still a stub reports unavailable and is not offered to the model.

| Phase | Name | Owns (implements) |
|---|---|---|
| 1 | Contracts and foundation | ONE migration PR with all new tables (incl. `cron_leases`) (BE §4); `lib/types/redesign.ts`, `lib/types/widgets.ts` (§4.10.1, §7.1); all 62 §7 action signatures + zod schemas as stubs (Rule 1), each actions file with its sibling flags module `lib/actions/<domain>-actions.flags.ts` (`IMPLEMENTED`, §9); user-preference actions `fetchMyPreferencesAction` / `updateMyPreferencesAction` fully implemented; `fetchOrgAppearanceAction` implemented as a reader in `org-appearance-actions.ts`; `general_settings.company` schema fields `instagramUrl`, `contactEmail` + defaults in `lib/settings/general-settings-schema.ts`; photo routes `POST /api/staff/me/photo`, `GET /api/staff/[id]/photo` + `removeMyPhotoAction` fully implemented (§7.3); `lib/errors.ts` (`actionErrorText` + new codes incl. `NOT_IMPLEMENTED`, §9); capabilities in `lib/auth/permissions.ts` (`canManageAppearance`, `canManageGeneralSettings`, `canManageTimeTracking`, `canViewTeamHours`, `canDecideVacations`, `canSeeAdminData` re-export) and per-segment guards (§8); `lib/tramos/compat.ts`; `lib/ui/contrast.ts`, `lib/ui/themes.ts`, appearance resolver + cookie + SSR style block (flag-gated, B17/B18, §4.1, §14); `app/(staff)/layout.tsx`, AppShell, Sidebar (TimeClock slot hidden while `IMPLEMENTED.clockInAction` in `time-tracking-actions.flags.ts` is false / the `fetchMyTodayAction` stub reports `enabled: false`), PageHeader, EstiloSwitch, StyleProvider/StyleView, Toaster, EmptyState/ErrorState/LoadingSkeleton; the whole widget library + ListPage/FiltersBar/FormSheet/FormDialog/SettingsSection; nav config with extension points; `lib/notifications/notify.ts` (full: row insert, preferences, quiet hours, email pending, BE §8.3) + cron jobs `notifications-deliver` and `daily-digest`; the daily-producers registry `lib/cron/daily-producers/index.ts` with a stub `vencimiento.ts` (BE §13); ALL new email templates (recordatorio, resumen-diario, vacaciones-decision, vacaciones-solicitud, BE §11.3); read helpers fully implemented: `lib/time-tracking/week-hours.ts`, `lib/vacations/approved-absences.ts`, `lib/my-space/reminders-for-day.ts` (BE §8.12); cron registry + lease + `/api/cron/tick` (BE §8.0.4, BE §13); assistant `defineTool` + registry + `summarize(input)` + client-safe `lib/assistant/tool-summaries.ts` + ConfirmationCard + render_table/render_timeline/render_confirmation (UI only; chat route untouched) (§3.9, §4.9) |
| 2 | Shell, navigation and states | redirects (both directions, flag-aware), CommandPalette (⌘K) + `search-actions.ts`, avatar menu UI, opt-in banner + avatar-menu opt-in UI, BottomTabs (mobile), Error404/error.tsx/loading.tsx per route group |
| 3 | Inicio, Tareas y Calendario | `fetchInicioAction`, `/inicio`, `/tareas` (tablero, lista, calendario views), TaskSheet, NewTaskDialog, calendar style variants, notify hooks inside `tasks-actions.ts` (asignación, mención, comentario), daily producer `lib/cron/daily-producers/vencimiento.ts` (vencimiento) |
| 4 | Proyectos, Personas, Biblioteca y Vacaciones | `fetchProjectsPortfolioAction`, `fetchPeopleOverviewAction`, `fetchPersonaDetailAction`, `/proyectos` + project tabs, `/personas/*`, `/biblioteca/*`, `vacations-actions.ts` (all), Mis vacaciones incl. "Días de vacaciones" settings section and "Solicitudes del equipo" |
| 5 | Mi espacio, Bandeja y Gmail | `my-space-actions.ts`, `notifications-actions.ts`, `gmail-actions.ts`, Gmail consent grant + attachment route, cron jobs `reminders-fire`, `gmail-sync`, `/mi-espacio/*`, Ajustes › Notificaciones and Ajustes › Integraciones pages |
| 6 | Ajustes, tema y Control de horario | `org-appearance-actions.ts` save/reset + Tema y estilo editor, Apariencia page, `time-tracking-actions.ts`, TimeClock behavior, login clock-in prompt, team hours report + `/api/horario/export`, cron job `auto-close-jornadas`, Perfil page, Ajustes › General UI (company links fields already in the schema from Phase 1) and the save/restore switch to `canManageGeneralSettings`, per-segment admin pages restyle (estatus, permisos, monday, google; tramos/puestos link to Project Flow pages when present) |
| 7 | Asistente en todas partes | `app/api/asistente/chat/route.ts`, `assistant-actions.ts`, AssistantButton/AssistantSheet, `/asistente` page, tool domain files `lib/assistant/tools/<domain>.ts` for all 65 new tools (each guarded by Rule 3), legacy thread import |
| 8 | Acceso y portal | login, denegado, cambio de contraseña, first-login wizards restyle, portal pages restyle + styles |
| 9 | Cleanup | remove flag and legacy shell/routes/pages, ThemeToggle data-theme legacy, switch `globals.css` fallback from Grafito to Azul, delete localStorage readers |

Cron job names (canonical): `notifications-deliver`, `daily-digest` (Phase 1); `reminders-fire`, `gmail-sync` (Phase 5); `auto-close-jornadas` (Phase 6).
Existing shared files modified by exactly one phase: `lib/actions/tasks-actions.ts` → 3; `lib/settings/general-settings-schema.ts` → 1 (company link fields + defaults); `lib/actions/app-settings-actions.ts` (switch save/restore to canManageGeneralSettings) → 6; `app/layout.tsx` and `app/globals.css` → 1 (and 9 for the fallback switch); `components/layout/Sidebar.tsx` and `Header.tsx` (legacy) → untouched until 9; `lib/auth/permissions.ts` → 1.
Hidden-dependency resolutions: command palette "Registrar entrada" appears only when `fetchMyTodayAction().enabled` (stub false until 6); Inicio "Mi día" reads `remindersForDay` helper (Phase 1) — empty until Phase 5 writes reminders; Personas hours read `weekHours` helper (Phase 1) — zeros until Phase 6; hours report target reads `approvedAbsences` helper (Phase 1) — none until Phase 4; vacations decision email uses the Phase 1 template.

---

## 21. Extension points and Project Flow coordination

### 21.1 Extension points

Phase 1 creates the registries **and** every registered file (as a stub, Rule 1 of §20); the owning phase replaces the stub's implementation. No phase edits a registry.

| Extension point | Registry (Phase 1) | Implemented by |
|---|---|---|
| Nav items | `lib/shell/nav-items/<domain>.ts`, collected by `lib/ui/nav.ts`; an item hides while its read action reports disabled/empty or its `IMPLEMENTED` flag (imported from `lib/actions/<domain>-actions.flags.ts`) is false | Phase 3 (inicio, tareas), 4 (proyectos, personas, biblioteca), 5 (mi-espacio), 6 (ajustes items), 7 (asistente) |
| Sidebar slots | `lib/shell/sidebar-slots/<name>.tsx` (server loader + client component) | Phase 6 (`time-clock`), Phase 5 (Bandeja badge loader) |
| Settings sections | `lib/shell/settings-sections/<page>/<name>.tsx` | Phase 5 (notificaciones, integraciones › Gmail), Phase 6 (everything else) |
| Assistant tools | `lib/assistant/tools/<domain>.ts` (index auto-collects; `defineTool` with `available(ctx)` importing `IMPLEMENTED` from `lib/actions/<domain>-actions.flags.ts` and `summarize(input)`) | Phase 7 |
| Daily producers | `lib/cron/daily-producers/index.ts` (registry; run only by the `daily-digest` job to create the day's notifications), stub `vencimiento.ts` | Phase 3 (`vencimiento.ts`) |
| Action flags | one plain module per actions file, `lib/actions/<domain>-actions.flags.ts` (`export const IMPLEMENTED = { … } as const`, no `"use server"`), imported by nav items, entry points and tool `available(ctx)`; `"use server"` files export only async functions | the phase that owns the actions file owns its flags file and flips its entries |
| Cron jobs | `lib/cron/jobs/<name>.ts` (registry + lease + `/api/cron/tick`) | Phase 1 (`notifications-deliver`, `daily-digest`), Phase 5 (`reminders-fire`, `gmail-sync`), Phase 6 (`auto-close-jornadas`) |

Migrations: all redesign tables ship in **one** migration generated with drizzle-kit against current `main` right before merge, never renumbered by hand; if Project Flow migrations merge first, the redesign migration is regenerated on top (and vice versa) (BE §4).

### 21.2 Project Flow coordination

- `lib/tramos/compat.ts` (Phase 1): `listTramos` (from `workflows`, keys `presale`/`diseno`/`construccion`), `tramoLabel`, `tramoColorSlot`, `tramoColorVar`, `phaseLabel` (null without a fase catalog), `canSeeAdminData` (re-export from Project Flow when present, else `isAdministratorRole`). Redesign code imports only from here.
- `TramoBadge` is `components/v2/status/AreaBadge` wrapped by compat until Project Flow renames it.
- Fase, Espacio and Puesto UI renders only when that data exists.
- **One `Toaster`**, in the root layout (Phase 1). Project Flow Phase 2 must not add a second one.
- The legacy `components/layout/Sidebar.tsx` may still be edited by Project Flow; the new `Sidebar` reads tramos from `listTramos`, so neither blocks the other.
- `/actividades/[tramo]?project=X` → `/tareas?tramo=…&project=X&iniciar=1` keeps Project Flow's start deep link.
- `/ajustes/tramos` and `/ajustes/puestos` render Project Flow's pages when present; otherwise they are hidden from `AjustesNav` and 404.
- A short addendum recording this coordination is added to the Project Flow specs separately.

---

## Annex A: Brief → spec mapping

| Brief | Spec |
|---|---|
| Decision 1 (three themes) | §14 |
| Decision 2 (three styles) | §15 |
| Decision 3 (styles on every data view) | §3.2–§3.8, §15.3 |
| Decision 4 (admin editor, overrides) | §3.8 Tema y estilo, §14.6 |
| Decision 5 (lighter chrome) | §3.1, §4.2 `PageHeader`, §14.3 |
| Decision 6 (navigation) | §2, §3.1 |
| Decision 7 (Tareas one page) | §3.4 |
| Decision 8 (Personas, Biblioteca, Proyecto) | §3.5–§3.7 |
| Decision 9–10 (Mi espacio, Gmail) | §3.3, §7.6, §7.7 |
| Decision 11 (Control de horario) | §3.8, §3.10, §3.13, §7.8 |
| Decision 12 (assistant everywhere) | §3.9, §4.9, §7.10 |
| Decision 13 (Cutto separate) | §4.9, RD-5 |
| Decision 14 (vocabulary) | §13, §14.1 |
| Decision 15 (no blocked chains, flag) | §2.3 |
| Defaults (rollout, mobile, Gmail scopes, reminders, storage) | §2.3, §3.1, §7.7, §7.11, RD-12 |

## Annex B: Contract names introduced here

Types: `NavItemKey`, `NavItem`, `NavModel`, `TareasVista`, `TareasQuery`, `RenderTableArgs`, `RenderTimelineArgs`, `ListSpec`, `ConfirmationCardProps`, `AppearanceCookie`. Modules: `lib/ui/preferences.ts`, `lib/ui/nav.ts` (`buildNavModel`), `lib/ui/themes.ts`, `lib/ui/tints.ts`, `lib/ui/contrast.ts`, `lib/tareas/query.ts` (`parseTareasQuery`, `toTareasSearch`). Cookies: `cincel-appearance`, `cincel-portal-style`. Route groups: `app/(staff)`, `app/(staff)/ajustes/(personal)`, `app/(staff)/ajustes/(admin)`. Modules: `lib/tramos/compat.ts`, `lib/integrations/cutto-links.ts`, registries of §21.1. Every server action name is in §7 and matches the canonical contract list.

## Annex C: Contract additions requested (accepted by the backend in round 1; now part of §7)

| # | Addition | Why |
|---|---|---|
| 1 | `createGmailDraftAction` output becomes `{ draftId: string; confirmToken: string; expiresAt: string }` | `sendGmailDraftAction(draftId, confirmToken)` needs a token the UI can obtain; the canonical list doesn't say where it comes from |
| 2 | `TokenName` adds `"chart-1-ink" \| "chart-2-ink" \| "chart-3-ink" \| "chart-4-ink" \| "chart-5-ink"` | Text on tints needs an editable, contrast-checked color per series (§14.2); until added, inks are derived |
| 3 | `fetchProjectsPortfolioAction(): PortfolioRow[]` in `lib/actions/projects-actions.ts`, `PortfolioRow = { projectId; real: number; plan: number \| null; deviation: number \| null; budgetSpentPct: number \| null /* admins only */; open: number; overdue: number; daysToDelivery: number \| null; nextDelivery: { title: string; date: string } \| null; series7: number[] }` | Proyectos Analítico (real vs plan, deviation, budget) has no data source today |
| 4 | `fetchPeopleOverviewAction(): { staffId; open: number; overdue: number; activeProjects: number; occupancyPct: number; weekHours: number \| null /* null unless viewer may see hours */; availability: ("libre" \| "ocupado" \| "saturado" \| "vacaciones")[] }[]` in `lib/actions/people-actions.ts` | Personas Equipo (Visual availability grid, Analítico table) needs one aggregate instead of N calls |
| 5 | `general_settings.company` gains `instagramUrl`, `websiteUrl` (exists as `website`), `contactEmail` used by the avatar menu | Header links leave localStorage (RD-12); `saveGeneralSettings` schema change |

---

## Review round 1 fixes

Source: `docs/review/redesign-review.md` (round 1).

| Item | Resolution in this spec |
|---|---|
| B1 Contrast | One pair list in `lib/ui/contrast.ts` (BE-owned, client-importable) used by editor, server and preset test; `warning-ink`, `border-strong`, `chart-N-ink` roles; text on charts always `chart-N-ink`; values come from BE §5, which fixes the failing presets (§14) |
| B2 SSR appearance | Cookie JSON `{theme, mode, style, density, textSize, v}`; `<html>` attributes + `.dark` from the server; `<style id="appearance">` with `:root` and `.dark`; no inline vars; system-mode head script; `cssVars = { light, dark }`; "next page load" (§4.1, §7.1, §18.5) |
| B3 Rollout | `(staff)` layout: flag on → `AppShell`, off → bare children with legacy shells / `LegacyFrame`; new-only routes redirect to legacy when off; opt-in from banner and user menu via `updateMyPreferencesAction`; server-side kill switch `redesignAvailable` (§2.3, §11) |
| B4 Authorization | `/ajustes/(admin)` server guard per segment; four capabilities named; `AjustesNav` per capability; Dirección reaches the hours report (§3.8, §8) |
| B5 Ownership | §20 (canonical phase plan) and §21.1 (extension points); widget library and patterns in Phase 1; widget shapes only in `lib/types/widgets.ts` |
| B6 Migrations | One generated migration, regenerated on top of whichever lands first; no hand renumbering (§21.1, BE §4) |
| B7 Project Flow | `lib/tramos/compat.ts`; AreaBadge as TramoBadge; conditional Fase/Espacio/Puesto UI; one Toaster; `?project` deep link kept (`project` + `iniciar`); tramos/puestos pages only when present (§21.2) |
| B8 Admin-only data | Visibility rules per page (Inicio, Proyecto Resumen, Proyectos, Personas) and on §7.1 outputs |
| B9 Assistant approvals | Native `needsApproval` + `addToolApprovalResponse`; `ConfirmationCard` from the tool part with `summarize(input)`; client-generated thread id in the body; only the new message is sent; `importLegacyAssistantThreadAction`; `fetchAssistantActionsAction` replaces confirm/cancel actions (§3.9, §4.9, §7.11) |
| B10 Notifications | FE unchanged: Bandeja lists in-app rows; delivery and digest are server jobs |
| B11 Cutto env | `NEXT_PUBLIC_CUTTO_BASE_URL` in client-safe `cutto-links.ts`; API client server-only; `personChatUrl(email)` (§4.9, §11) |
| B12 Vacations | "Solicitudes del equipo" for `canDecideVacations` (Administrador, Dirección) with `fetchPendingVacationRequestsAction`; kind privacy (`"ausencia"`); vacation settings in Mis vacaciones for deciders (§3.7, §7.9) |
| B13 Style rule | `ListPage` takes data + widget spec; `StyleView` only in `components/widgets`; guard test; `KpiDatum.visibleIn` (§4.10, §4.11, §17, §18.15) |
| B14 Cron lock | Backend lease table; FE unaffected (§7.12) |
| B15 Gmail disconnect | `disconnectGmailAction` with the "Desconectar" dialog copy and Google permissions link; token not revoked (§3.8, §7.7) |
| NB 1 | Photo through a route handler (2 MB) after a client canvas re-encode (EXIF removed) |
| NB 2 | Org changes "on next page load"; badges refreshed by the Bandeja poll |
| NB 3 | All three fonts declared, Inter and DM Sans with `preload: false` |
| NB 4 | External content untrusted; writes in a turn that read it require approval |
| NB 5 | Context ids resolved through viewer-scoped reads; chip shows only confirmed context |
| NB 6 | Chat route loads history from the DB; client sends only the new message or approvals |
| NB 7 | `createGmailDraftAction` accepts `draftId` to update one draft |
| NB 8 | Email body in `<iframe sandbox srcdoc>` |
| NB 9 | Backend doc item (internal consent screen); no FE change |
| NB 10 | Search urls aligned with BE (`/tareas/<id>`, `/mi-espacio/notas/<id>` redirect to the sheet params; `?contacto=` handled); "Acciones" is a static client group |
| NB 11 | Capability names: `team.canViewTeam`, `portal.manageAccess`, Dirección via `user.access` |
| NB 12 | `TodayStatus` carries `requiredFrom` and `hoursPerDay` |
| NB 13 | Search-param sheets instead of nested pages |
| NB 14, 15 | Backend fixes; FE shows the CSV link only to hours viewers |
| NB 16 | Header links storage per BE §3.12 (rollback note there) |
| NB 17 | Backend schema fix; FE unaffected |
| NB 18 | One `actionErrorText(err, context?)` signature with context keys; context copy for `RATE_LIMITED`; `STARTED` code |
| NB 19, 20 | Backend rules (linked ids visible; no private text in history); FE surfaces `FORBIDDEN` copy |
| NB 21 | RD-18: C2, C3, C6 have FE consumers; C4, C5 out of scope |
| NB 22 | "Abrir en Cutto" only for events with a stored Cutto URL |
| NB 23 | `components/v2/layout/PageHeader.tsx` edited in place, re-exported from `components/shell` |
| NB 24 | `updateMyPreferencesAction` revalidates nothing (client applies; slider debounced); photo revalidates the layout |
| NB 25 | Mis vacaciones lists the old `mis-vacaciones` resource links |
| NB 26 | Legacy e2e specs keep testing old routes while the org flag is off; CI cleanup is a separate infra issue |
| NB 27 | `middleware.ts` untouched |
| FE notes | `StatusChip` adapter over `StatusBadge {label, token}`; Cronograma/Archivos Analítico use `RecordTable`; shadcn additions with the repo's base-ui CLI style; `ClockInPrompt` dismissible after a non-`ALREADY_ON` error; `?estilo=` read on the server |

---

## Review round 2 fixes

Source: `docs/review/redesign-review.md` (round 2).

| Item | Resolution in this spec |
|---|---|
| B16 Phase plan and ownership | §20 replaced with the canonical phase plan (identical to BE §21): Rule 1 (Phase 1 creates every file; stubs with safe defaults and `NOT_IMPLEMENTED`), Rule 2 (Phases 2–8 depend only on Phase 1), Rule 3 (assistant tools `available(ctx)`); single owner per shared file; canonical cron job names; hidden-dependency resolutions. Extension points and Project Flow coordination moved to §21 |
| B17 Legacy look with flag off | Flag off renders today's pipeline (`primary-color` block, Grafito `globals.css`, `ThemeToggle` `data-theme`); the appearance block, attributes and head script are emitted only when `redesignEnabled`; new selectors `:root` and `.dark, :root[data-theme="dark"]`; Grafito fallback kept until Phase 9 (§2.3, §4.1, §14.1, §17, §18.17) |
| R2-1 Guards | One `layout.tsx` per admin segment with `requirePageCapability(cap)` and `notFound()` everywhere (§3.8, §8, §12) |
| R2-2 Segment capabilities | Table in §8; nav visibility uses the same capability; `canManageGeneralSettings` added (General save/restore switch in Phase 6) |
| R2-3 Approval summary | `ConfirmationCard` from the approval part's `toolName` + `input` with `lib/assistant/tool-summaries.ts` (§3.9, §4.9, §7.11) |
| R2-4 `assistant_messages` key | Backend change (`(thread_id, id)`, ownership check); FE sends the client-generated thread `id` |
| R2-5 `render_timeline` | `{ title?: string; items: AgendaItem[] }` (§4.9) |
| R2-6 Vacation settings | In Mis vacaciones ("Días de vacaciones", `canDecideVacations`), not Ajustes › General (§3.7) |
| R2-7 Guard-test false positive | `StyleView` forbidden outside `components/widgets/*`; `EstiloSwitch` and `StyleProvider` allowlisted in `components/shell/*` (§17, §18.15) |
| R2-8 `LOW_CONTRAST` format | `LOW_CONTRAST: <pair> <mode> <ratio>[, …]` in §7.2 and §14.6 |
| R2-9 Project Flow spec | Coordination recorded here (§21.2); the Project Flow addendum is added separately |
| R2-10 Contrast coverage | Pair `destructive/background` ≥ 4.5 added; Azul light `destructive` fixed in BE §5 (§14.6) |
| Other round-2 decisions | `NOT_IMPLEMENTED` copy and hidden entry points while read stubs report disabled/empty; palette "Registrar entrada" only when `fetchMyTodayAction().enabled`; canonical cron names `notifications-deliver`, `daily-digest`, `reminders-fire`, `gmail-sync`, `auto-close-jornadas` (§3.12, §7.12, §9, §17, §20, §21.1) |

---

## Review round 3 fixes

Source: `docs/review/redesign-review.md` (round 3).

| Item | Resolution in this spec |
|---|---|
| B18 Dark-mode specificity | Flag-on `<html>` always carries `data-theme="light"\|"dark"` (server from the cookie; head script in `system`); the appearance block uses `html:root[data-theme="light"]` / `html:root[data-theme="dark"]` (specificity 0,2,1) and beats the legacy `@media (prefers-color-scheme: dark)` rule; `.dark` kept in sync; Playwright checks with `colorScheme: "dark"` for light, dark and system (flag on) and the flag-off check (§2.3, §4.1, §14.1, §17) |
| B19a General settings schema | `instagramUrl` and `contactEmail` added to `general-settings-schema.ts` in Phase 1 (schema + defaults); Phase 6 keeps the General UI and the save/restore capability switch (§20) |
| B19b Preferences ownership | `fetchMyPreferencesAction` and `updateMyPreferencesAction` fully implemented in Phase 1 (`preferences-actions.ts`, single owner); org appearance in `lib/actions/org-appearance-actions.ts` (reader in Phase 1, save/reset in Phase 6); Phase 2 keeps only the opt-in banner and avatar-menu UI (§7.2, §20) |
| B19c Implementation flags | Every actions module has a sibling plain flags module exporting `IMPLEMENTED` (see round 4); owning phases flip their own entries; tool `available(ctx)` and UI entry points read the flags (§9, §20 Rules 1 and 3, §21.1) |
| R3-1 Digest time | 07:30 everywhere (Ajustes › Notificaciones copy, cron table) |
| R3-2 Daily producers | Phase 1 creates `lib/cron/daily-producers/index.ts` with a stub `vencimiento.ts`; Phase 3 implements it (§20, §21.1) |
| R3-3 Photo routes | `POST /api/staff/me/photo`, `GET /api/staff/[id]/photo` and `removeMyPhotoAction` fully implemented in Phase 1; Phase 2 keeps the avatar menu UI (§20) |

---

## Review round 4 fixes

Source: `docs/review/redesign-review.md` (round 4).

| Item | Resolution in this spec |
|---|---|
| B20 `IMPLEMENTED` in `"use server"` files | Flags live in plain sibling modules `lib/actions/<domain>-actions.flags.ts` (no `"use server"`); §20 Rule 1, Rule 3 and the Phase 1 row are copied verbatim from BE §21 (cross-references adapted); §9, §21.1 and the tests import the flags from those modules; new Vitest flags check in §17 (every exported action has a key; `"use server"` files export only async functions) |
| R4-1 Rule wording | §20 Rule 1 and Rule 3 are verbatim copies of BE §21 (the UI hides entry points while the flag is false), and the Phase 1 row follows BE's order and text (cross-references adapted to FE sections or marked "BE §x") |
| R4-2 Producer runner | Daily producers run once a day, only in the `daily-digest` job (not `notifications-deliver`), as in BE §13 (§21.1) |

