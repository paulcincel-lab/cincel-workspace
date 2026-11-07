# Cincel Workspace: UI/UX redesign, Mi espacio, Control de horario and assistant everywhere

**Status:** Ready to spec · **Owner:** Oscar · **Date:** 2026-11-07
**Builds on:** Phases 16–18 (v2 component library, merged), Staff SSO, Client Portal, Cronograma, monday migration (merged). Runs alongside Project Flow (specs approved, not built) and uses its vocabulary and contracts (Tramo, Fase, Espacio, Puesto).
**Visual source:** design canvas "Cincel UI Redesign", https://claude.ai/artifact/QFQ2oCZE1P6XwYJbduq8p1 (117 frames). Frames are named below as `Frame.dc.html`; every element in them is a selectable layer and every state is its own frame.

---

## 0. Context for the implementer

- Same app: Next.js (App Router) + TypeScript + Server Actions + Drizzle (Postgres) + shadcn/ui + Tailwind v4. No new state library. Follow `cincel-app/AGENTS.md` and existing patterns in `lib/actions/*`, `lib/repositories/*`, `components/*`.
- Today every staff page mounts `Sidebar` and `Header` itself (22 imports); there is no shared staff layout. The header is 112 px tall with a greeting, social links and a 48 px icon-button row. Pages stack three headings (greeting, page card, card title).
- Tokens live in `app/globals.css` (grayscale, black sidebar, `chart-1..5`). The DB already stores `appearance.primary_color` and `general_settings` in `core.app_settings`. Theme choice is localStorage (`cincel.theme`); the profile photo, header links, permission matrix and assistant thread are localStorage too.
- There are no tables for user preferences, notifications, reminders, notes, checklists, time tracking, vacation requests or assistant threads. There is no toast component, no scheduler/cron, and no Gmail API (only SMTP sending).
- The assistant (`lib/assistant/tools.ts`, 17 tools, AI SDK v7, OpenAI-compatible provider) renders four widget types and has no confirmation mechanism beyond the prompt.
- Calendar month/week/day, Cronograma, project Archivos/Clientes, the portal and the first-login wizards already exist and are restyled, not rebuilt.

### Decisions already made (don't revisit)
1. **Three themes, one token set.** Themes are value sets for the same shadcn CSS variables: **Azul Cincel** (organization default: gray-blue page `#f1f4f9`, white cards with soft shadow, primary `#2563eb`), **Cálido** (warm stone, brown ink, earthy data colors) and **Grafito** (black/white like cincel.mx, today's look). Each has a light and a dark variant. Components never hard-code colors.
2. **Three presentation styles**, independent from the theme: **Visual** (charts, rings, tinted cards; default), **Esencial** (numbers, text and lists; no charts; roomier, 15 px body) and **Analítico** (dense tables, deltas, averages, heat cells, totals; 12.5 px; mono numbers). Style changes only how data is presented. Forms, dialogs, settings, auth and the portal chrome look the same in all three.
3. **Every data view has the three styles** and an `EstiloSwitch` in its header: Inicio, Tareas (tablero, lista), Calendario (mes, semana), Proyectos, Proyecto (resumen, tareas, cronograma, archivos), Personas (equipo, clientes, contratistas, proveedores, detalle), Mi espacio, Biblioteca (+ sección), Mis vacaciones, Control de horario report, portal project page. The switch changes the user's preference and re-renders in place (no separate routes).
4. **Admin sets the organization theme and style; users may override** unless the admin turns overrides off. Admin can edit every color token, the font family, the size and weight of six text roles, card radius, card padding, spacing and shadow, with a live preview and a contrast check (text vs background ≥ 4.5:1 blocks publishing).
5. **Lighter chrome:** one `PageHeader` per page (title 22 px/600, optional description, actions on the right). The greeting lives only on Inicio. Global header removed; social links move to Ajustes › General and the avatar menu. Icon buttons 36 px. No bold (700) anywhere.
6. **Navigation (7 destinations):** Inicio, Mi espacio, Tareas, Proyectos, Personas, Biblioteca, Asistente, plus Ajustes at the bottom with the user block. Old routes redirect (table in §3).
7. **Tareas is one page** with views Tablero / Lista / Calendario and filters Tramo, Responsable ("Yo" = old Mis tareas), Proyecto. It replaces `/tablero`, `/mis-tareas`, `/calendario` and `/actividades/*` as entry points. Project Flow's tramo-specific pieces ("Listos para iniciar", Iniciar tramo sheet) appear inside Tareas when the Tramo filter is a single tramo.
8. **Personas** merges Equipo and Directorio (tabs Equipo, Clientes, Contratistas, Proveedores). **Biblioteca** merges Recursos and Empresa. **Proyecto** is one page with tabs Resumen, Tareas, Cronograma, Archivos, Clientes, Ficha.
9. **Mi espacio** is private per user: quick capture, notes (color, pin), checklists, reminders (natural-language time), and a Bandeja (inbox) that merges Cincel notifications and Gmail threads.
10. **Gmail** is read + draft. Sending always requires an explicit confirmation. Mail with a project name is suggested for linking to that project.
11. **Control de horario** (time tracking) is an organization setting: on/off, and a date from which it is **required**. Before that date entries are optional (trial: no alerts, not exported to payroll). When on, the clock lives at the top of the sidebar on every page (start, pause/resume, end) and a clock-in prompt appears at the first login of the day. Admins see a weekly team report and export CSV.
12. **The assistant is on every page** as a floating button (⌘J) that opens a right-side sheet aware of the current page (project, task, person). It is the same assistant as `/asistente` (full page with history). Actions toward other people (messages, emails, invites, scheduling with others, reassigning, deleting) always show a confirmation card and wait for the user.
13. **Cutto (cutto.cloudketer.dev) is a separate product.** Cincel does not embed it: no Cutto tab, no call screen, no voice-room dock. Cincel only deep-links to Cutto (project channel, meeting, person chat) and the assistant uses a `CuttoClient` adapter whose implementation waits for Cutto's API (open question Q1). Frames `InicioCutto`, `CuttoLlamada` and the sidebar open-mic dock are references for Cutto's own build.
14. **Vocabulary follows Project Flow:** Tramo (Presale, Diseño, Construcción), Fase, Espacio, Puesto. The canvas label "Área" and the fourth color "Decoración" are mock-ups; tramo colors are `chart-1..3`.
15. **No blocked chains.** One contracts phase (data model, types, action signatures, shared components) merges first; every other phase depends only on it and can run in parallel. Each issue is mergeable on its own behind the `ui.redesign` flag.
16. **Reuse first.** A small style-aware widget library (KpiWidget, DistributionWidget, ProgressListWidget, AttentionListWidget, AgendaWidget, PeopleWidget, RecordTable, EntityCardGrid, WidgetCard) renders every data concept in all three styles; pages only compose widgets and never write per-style markup. One ListPage template, one FormSheet/FormDialog pattern and one SettingsSection/SettingsRow pattern cover lists, forms and every Ajustes page. Existing components (`components/v2`, `components/ui/DataTable`, shadcn primitives, `chart.tsx`, TaskDrawer, NewTaskModal, UnifiedCalendar, cronograma) are evolved before anything new is created, and aggregate actions return shared data shapes those widgets consume.

### Defaults to confirm (build with these unless told otherwise)

| Topic | Default |
|---|---|
| Rollout | Per-user flag `ui.redesign` (Ajustes › Apariencia "Probar el nuevo diseño"), then organization-wide, then old screens removed in a cleanup phase |
| Mobile | Responsive web (bottom tab bar under 768 px), no native app |
| Gmail scopes | `gmail.readonly` + `gmail.compose` via incremental consent, per user, opt-in |
| Reminder delivery | In-app + email; scheduler is an authenticated `/api/cron/tick` route called every minute by the server's cron |
| Time tracking location | Never stored (the "approximate location" option ships off and hidden) |
| Time tracking enforcement default date | Empty (admin must choose) |
| Assistant thread storage | Server-side per user, last 50 threads |
| Permission matrix | Stays localStorage in this feature (moving it to the DB is out of scope) |
| Theme of the client portal | Follows the organization theme; clients can't override |
| Fonts offered in the editor | Geist (default), Inter, DM Sans |

### Open questions

| # | Question | Default if unanswered |
|---|---|---|
| Q1 | Does Cutto expose an API for creating meetings, posting messages and reading channels? | Ship deep links only; assistant Cutto tools stay disabled behind `CUTTO_API_URL` |
| Q2 | Ship order vs Project Flow Phase 2 (both rework Actividades) | Redesign Tareas consumes Project Flow contracts when present and falls back to `workflows` rows; no blocking |
| Q3 | Payroll export format for Control de horario | CSV: persona, fecha, entrada, salida, pausas, horas |
| Q4 | Who may see others' hours | Administrador and Dirección only |

---

## 1. Goals and non-goals

**Goals:** lighter, consistent UI on stock shadcn; one shell; 7-item navigation; three themes × three styles with admin control; Mi espacio; Control de horario; assistant on every page with confirmations and the tool catalog of §5; every screen of the canvas implemented with its states (empty, loading, error) and mobile layout.

**Non-goals:** Cutto UI or calls inside Cincel; native mobile apps; moving the permission matrix to the DB; rewriting Cronograma internals; new client-portal features beyond restyle and styles.

## 2. Data model (new)

All in schema `core`, one migration per table group, soft delete where noted.

| Table | Purpose | Key columns |
|---|---|---|
| `user_preferences` | Per-staff UI preferences | staff_id PK, theme (`azul`/`calido`/`grafito`/null=org), mode (`light`/`dark`/`system`), style (`visual`/`esencial`/`analitico`/null=org), density (`comoda`/`compacta`), text_size (13–16), redesign_enabled bool, updated_at |
| `app_settings` keys (existing table) | Org theme and style | `appearance.theme` (JSON: base theme + token overrides + type scale + shape), `appearance.style_default`, `appearance.allow_user_override` |
| `staff_photos` | Profile photo (replaces localStorage) | staff_id PK, mime, bytes (≤ 1 MB), updated_at |
| `notifications` | Inbox items | id, staff_id, kind (`asignacion`, `mencion`, `vencimiento`, `comentario`, `aprobacion_cliente`, `recordatorio`, `sistema`), title, body, entity, entity_id, url, read_at, created_at |
| `notification_preferences` | Channels per kind | staff_id, kind, in_app, email, digest; quiet_hours on staff prefs |
| `notes` | Mi espacio notes | id, staff_id, title, body (markdown), color, pinned, project_id?, soft delete |
| `checklists`, `checklist_items` | Personal checklists | checklist: id, staff_id, title, project_id?; item: id, checklist_id, text, done, sort_order |
| `reminders` | Personal reminders | id, staff_id, text, due_at, repeat (`none`/`daily`/`weekly`/`monthly`), channels[], task_id?, project_id?, fired_at, cancelled_at |
| `gmail_accounts` | Gmail link per staff | staff_id PK, history_id, last_synced_at, last_error (tokens stay in `google_oauth_accounts`) |
| `gmail_threads` | Cached thread headers | id (Gmail thread id), staff_id, subject, from, snippet, received_at, unread, labels[], project_id? |
| `time_tracking_settings` | in `app_settings` key `time_tracking` | enabled, required_from (date), day_start, day_end, hours_per_day, late_tolerance_min, work_days[], prompt_at_login, auto_close_at, lunch_minutes, exempt_roles[] |
| `time_entries` | Clock events | id, staff_id, work_date, started_at, ended_at?, pauses jsonb [{from,to}], source (`sidebar`/`login`/`assistant`/`auto_close`), flagged, note |
| `vacation_requests` | Mis vacaciones | id, staff_id, from_date, to_date, kind, comment, status (`pendiente`/`aprobada`/`rechazada`/`cancelada`), decided_by, decided_at |
| `assistant_threads`, `assistant_messages` | Server-side assistant history | thread: id, staff_id, title, context (route + entity), updated_at; message: id, thread_id, role, parts jsonb, created_at |
| `assistant_actions` | Audit + confirmations | id, thread_id, tool, input jsonb, status (`proposed`/`confirmed`/`cancelled`/`done`/`failed`), result jsonb, created_at |

## 3. UX (screens; frame names in parentheses)

- **Shell:** `AppShell` (Sidebar, compact top area, assistant button, toaster). Sidebar: logo, search (⌘K), clock (when time tracking is on), 7 items with counts, tramos shortcut list, Ajustes, user block (`Sidebar.dc.html`). Mobile: bottom tabs (`Movil*.dc.html`).
- **Redirects:** `/dashboard`→`/inicio`; `/tablero`→`/tareas?vista=tablero`; `/mis-tareas`→`/tareas?responsable=yo`; `/calendario`→`/tareas?vista=calendario`; `/actividades/[tramo]`→`/tareas?tramo=…`; `/equipo`→`/personas`; `/directorio`→`/personas/clientes`; `/recursos*`→`/biblioteca*`; `/recursos/empresa*`→`/biblioteca/empresa*`; `/profile`→`/ajustes/perfil`; `/configuracion/*`→`/ajustes/*`; `/proyectos/[id]/ficha` stays and becomes the Ficha tab; `/proyectos/[id]` shows Resumen.
- **Inicio** (`Dashboard`, `InicioEsencial`, `InicioAnalitico`, themes `InicioCalido|Grafito|Oscuro`): profile photo upload, greeting, KPI tiles, tasks by tramo, weekly pace, needs-attention, Mi día, project progress, workload.
- **Tareas** (`Tareas`, `TareasLista`, `Calendario`, `CalendarioSemana`, `CalendarioDia`, each with Esencial/Analítico; `TareaDetalle`, `NuevaTarea`, `EventoDetalle`, `BuscarCmdK`).
- **Proyectos / Proyecto** (`Proyectos`, `Proyecto`, `ProyectoTareas`, `ProyectoCronograma`, `ProyectoArchivos`, `ProyectoClientes`, `ProyectoFicha`, `ProyectoReporte`, `NuevoProyecto`, variants).
- **Personas** (`Personas`, `PersonasClientes`, `PersonasContratistas`, `PersonasProveedores`, `PersonaDetalle`, variants).
- **Biblioteca** (`Biblioteca`, `BibliotecaSeccion`, `BibliotecaDocumento`, `MisVacaciones`, variants).
- **Mi espacio** (`MiEspacio`, `MiEspacioGmail`, `NotaEditor`, `NuevoRecordatorio`, variants).
- **Ajustes** (`Ajustes` Apariencia, `AjustesAdmin` Tema y estilo, `AjustesHorario` + variants, `Perfil`, `AjustesNotificaciones`, `AjustesIntegraciones`, `AjustesGeneral`, `AjustesAreas`→Tramos y fases per Project Flow, `AjustesEstatus`, `AjustesPermisos`, `AjustesWorkflows`, `AjustesMonday`).
- **Asistente** (`Asistente` sheet, `AsistentePagina`, `AsistenteWidgets`, `AsistenteHerramientas`).
- **Acceso y portal** (`Login`, `LoginDenegado`, `CambioContrasena`, `LoginJornada`, `BienvenidaGoogle`, `BienvenidaMonday`, `PortalLogin`, `PortalProyecto` + variants, `Portal404`).
- **States** (`EstadosSistema`, `Error404`): empty, skeleton, inline error with retry, toasts (success, error, undo), offline banner, permission denied, form validation.

## 4. Contracts every phase relies on (defined in the contracts phase)

- `lib/ui/preferences.ts`: `type ThemeId`, `type PresentationStyle = 'visual'|'esencial'|'analitico'`, `type UserPreferences`, `type OrgAppearance`, `resolveAppearance(org, user): ResolvedAppearance`.
- `components/shell/*`: `AppShell`, `PageHeader` (v3), `EstiloSwitch`, `StyleProvider` + `useStyle()`, `StyleView` (`visual`/`esencial`/`analitico` slots), `EmptyState`, `ErrorState`, `LoadingSkeleton`, Sonner `Toaster`.
- `lib/errors.ts`: `actionErrorText(code)` (shared with Project Flow; created by whichever lands first, same signature).
- Action signatures (stubs allowed until implemented): preferences, appearance (org), notifications, notes, checklists, reminders, gmail, time tracking, vacations, search, assistant threads/actions. Exact names and error codes in the FE §7 / BE §7 tables.
- Assistant: `defineTool({ name, schema, capability, confirm: boolean })` wrapper; `render_confirmation`, `render_table`, `render_timeline` widgets; `CuttoClient` interface with a no-op implementation.

## 5. Assistant tool catalog

As drawn in `AsistenteHerramientas.dc.html`: 16 existing tools kept; new groups Consulta (4), Tareas (6), Agenda (6), Notificaciones y recordatorios (7), Correo (5), Mi espacio y jornada (6), Personas/clientes/proveedores (5), Arquitectura (8), Widgets (3), and Cutto (15, disabled until Q1). Rules: confirm before acting toward others; capability check per tool; page context as default project; respect notification preferences; log every action in `history_events` with actor "vía asistente"; destructive actions archive, not delete.

## 6. Acceptance (feature level)

1. With `ui.redesign` on, every route in §3 renders in the new shell with one header, and every old route redirects.
2. Switching theme, mode, style, density and text size changes the current page immediately and persists across devices.
3. Every data view listed in decision 3 renders all three styles with the same data, and the switch is keyboard-accessible.
4. The admin editor can change any token and size, blocks publishing below 4.5:1 contrast, and published changes reach all users on next navigation.
5. Mi espacio notes, checklists, reminders and Bandeja work end to end; reminders fire within one minute of due time.
6. With time tracking on and before `required_from`, users can clock in/out from the sidebar and the login prompt is skippable; after it, the prompt is mandatory and the admin report shows completo/incompleto/sin registro.
7. The assistant button opens on every staff page, knows the current entity, and every tool marked "Confirmar" shows a confirmation card before acting.
8. Axe shows no serious violations on each new page; text contrast ≥ 4.5:1 in all three themes, light and dark.
