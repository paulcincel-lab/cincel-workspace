# Spec: Calendario and planning with the asistente (Frontend)

Companion of [backend.md](./backend.md) (types, loaders, tools). Phases and issues: [calendario-milestones.md](../../phases/calendario-milestones.md). Decision: [ADR 0007](../../adr/0007-calendar-proposals-and-undo.md) (proposals and undo). Design canvas: https://claude.ai/artifact/UxWfCgR5P3WKbmuhADXXZr. Supersedes #1056.

Board names used below: `Main` (Visual · Día / Semana / Mes), `Esencial`, `Analitico`, `Asistente` (panel on Semana), `Sidebar`, `P1-Barra` (Barra para pedir, Visual semana), `P2-Resumen` (Resumen, Esencial), `P3-Alertas` (Días que avisan, Visual semana), `P4-Reunion` (Antes y después, Analítico), `P5-Planear` (Planear mi semana, Visual por persona). Boards named `Artboard-…` are not part of the design.

Rules from `cincel-app/AGENTS.md`, ADR 0004 and 0005 apply everywhere: one layout per Estilo through `PageStyleLayout`; per-style markup only in `components/widgets/*`; tokens only (no hex in components; the canvas hexes map to the Azul Cincel tokens and tramo slots of #981); font weight ≤ 600; motion off under `prefers-reduced-motion`; Spanish sentence-case copy; reuse the kit before adding a component. Data rules from `docs/specs/query-migration/plan.md` and `zustand.md`: server state in TanStack Query, UI state in Zustand, shareable state in the URL; `scripts/check-data-patterns.mjs` must pass.

## 1. Overview

`/calendario` is a new main menu item after Tareas. It shows, for the visible range only:
- **Tasks** on their commitment date (fallback delivery date), coloured by tramo slot, overdue with a destructive outline, completed greyed (and hidden with "Ocultar completadas").
- **Meetings and events** with time, white card with a tramo-coloured left edge, from Google Calendar (the viewer's own) or created in Cincel, with attendees and place or Meet link.

Each Estilo has a Día / Semana / Mes selector and "Hoy". The asistente plans from here: the Barra para pedir, Resumen del día / semana, Días que avisan, Antes y después de la reunión and Planear mi semana. **The asistente never changes data on its own**: every change is a proposal first (dashed on the calendar, a soft card, or a table with checkboxes), then Aplicar / Cancelar, then Deshacer.

## 2. Routes, navigation and URL state

### 2.1 Route
| Route | File | Notes |
|---|---|---|
| `/calendario` | `app/(staff)/calendario/page.tsx` (server), `loading.tsx` (`route-skeletons.tsx` `CalendarioSkeleton`), `error.tsx` (`RouteError`) | `requireCapabilityUser`; `resolveCalendarCapabilities(user).canViewCalendar` else `PermissionDenied`; `resolvePageStyle`; prefetch (§9.3); `<Hydrate qc><CalendarioClient /></Hydrate>` with no data props |

### 2.2 Menu
- `lib/shell/nav-items/calendario.ts`: `NavItemSource { key: "calendario", section: "items", order: 35, resolve: session => canViewCalendar ? { key, label: "Calendario", href: "/calendario", icon: CalendarDays } : null }`, added to `NAV_ITEM_SOURCES`; `NavItemKey` (`lib/ui/nav.ts`) gains `"calendario"`. Order 35 puts it right after Tareas (30).
- Mobile: `BOTTOM_TAB_KEYS` stays four items (Decision F1); Calendario is in the "Más" sheet and `PAGE_TITLES.calendario = "Calendario"`.
- Hover prefetch: `NAV_PREFETCH.calendario` → `calendarioRangeOptions(defaultRangeInput(style, today))`, same 100 ms debounce (`NAV_PREFETCH_DEBOUNCE_MS`). The plan's "Inicio, Tareas, Mi espacio only" limit is extended to Calendario (Decision F2).

### 2.3 Redirects (`lib/ui/legacy-redirects.ts`)
- Remove `"/calendario": "/tareas"` from `STATIC_TARGETS`.
- `/tareas?vista=calendario` → `/calendario`, keeping `fecha` (`?fecha=`) and `cal` mapped to `vista` (`cal=month|week|day` → `mes|semana|dia`). Other `vista` values keep today's mapping. Tests in `app/legacy-redirect-stubs.test.tsx`.
- `CALENDAR_CONNECT_URL` already returns to `/calendario`.

### 2.4 URL state (`lib/calendario/url-state.ts`, client-safe)
| Param | Values | Default |
|---|---|---|
| `vista` | `dia` \| `semana` \| `mes` | Visual `mes`, Esencial `semana`, Analítico `semana` (Decision F3) |
| `fecha` | `YYYY-MM-DD`, anchor inside the range | today (org time zone) |
| `mostrar` | `todo` \| `tareas` \| `reuniones` | `todo` |
| `quien` | `yo` \| `todos` | `yo`; `todos` only with `canViewTeamCalendar` |
| `proyectos` | comma-separated ids | none |
| `tramo`, `responsable` | id | none |
| `apoyo` | `0` to exclude support tasks | included |
| `ocultar` | `1` / `0` | `useHideCompletedPreference()` |
| `modo` | `planear` | none (Planear mi semana, §7.6) |
| `evento` | `e:<uuid>` or `t:<uuid>` | event detail open (§5) |
| `tarea` | `<uuid>` | existing task sheet (`TASK_SHEET_PARAM`) |
| `propuesta` | `<uuid>` | an open proposal (§7.1) |
| `nueva` | `reunion` | reopens the Nueva reunión dialog after the Google grant redirect (§6.1) |

`parseCalendarioQuery(search): CalendarioQuery`, `toCalendarioSearch(q)`, `calendarioHref(q)`, `rangeOf(view, fecha): { from, to }` (from `lib/calendario/range.ts`), and the hook `useCalendarioQuery()` (reads `useSearchParams`). Writes use `replaceCalendarioUrl(q)` (`history.replaceState`, keeps `?estilo=`) for filters and `pushCalendarioUrl(q)` for range navigation, so Back walks through ranges. `estilo` is never part of a query key.

## 3. Page anatomy (all Estilos)

```
PageHeader  title "Calendario" · subtitle (range + counts) · actions: Suscribirse, + Nuevo, Estilo switch
CalendarioToolbar  Vista (Día / Semana / Mes) · Anterior / Hoy / Siguiente · range label
CalendarioFilters  per-style presentation of the same filter state
BarraParaPedir     (Phase 3) always at the top of the calendar body
ResumenPanel       (Phase 4) top of Día and Semana
DayAlerts banners  (Phase 5)
body               per Estilo × vista (§4)
EventDetail        per Estilo (§5)
ProposalOverlay    (Phase 3) draws the open proposal on the body
```

- **Subtitle** (from `CalendarioRange.kpis`, `Main`): Mes "Noviembre 2026 · 38 tareas y 9 reuniones · 5 vencidas"; Semana "Semana 46 · 9 tareas y 4 reuniones · 3 vencidas"; Día "Hoy · 3 tareas y 2 reuniones" (or "Miércoles 11 nov 2026 · …" for another day). "N vencidas" in `--destructive-ink`. Plurals: "1 tarea", "1 reunión", "1 vencida".
- **Suscribirse** opens `CalendarFeedDialog` (`components/calendario/CalendarFeedDialog.tsx`, unchanged API).
- **+ Nuevo** is a menu: "Tarea" (`useNewTaskUi(s => s.openNewTask)({ deliveryDate: fecha }, "calendario")`; `NewTaskSource` gains `"calendario"`; the date field the dialog fills is the commitment date, Decision F4) and "Reunión" (Phase 2, `NewMeetingDialog`).
- **Toolbar**: `role="group" aria-label="Vista"` with three `aria-pressed` buttons; "Anterior" / "Siguiente" are icon buttons with `aria-label` "Anterior" / "Siguiente" and prefetch the adjacent range on hover/focus (§9.3); "Hoy" jumps to today (disabled when the range contains today and `fecha` is today).
- **Filters** (one state, three presentations):
  - Visual (`Main`): segmented "Mostrar" (Todo / Tareas / Reuniones), segmented "Responsable" (Yo / Todos), `ProjectFilter` ("Proyecto: Todos ▾"), `HideCompletedSwitch` ("Ocultar completadas"), legend (Presale / Diseño / Construcción / Reunión (con hora) / Vencida; tramo names from `qk.catalog.tramos()`), hint "Clic en un número de día para abrir ese día" (Mes only).
  - Esencial (`Esencial`): pills "Mi agenda" / "Todo el equipo" (= quien), checkbox "Ocultar completadas". No project filter (Decision F5: it stays in the URL if set elsewhere and shows a removable chip).
  - Analítico (`Analitico`): `FilterCard` with groups MOSTRAR, RESPONSABLE, TRAMO, plus `ProjectFilter` and `IncludeSupportSwitch` in `extra`.
  - A shared `CalendarioYoTodos` control is **not** added; each style uses its kit control bound to the same URL param (Yo/Todos has no shared component today, `TareasAnalitico.tsx:495`).

## 4. Body per Estilo and vista

All three read the same `CalendarioRange` (`qk.calendario.range`). Item colours: tramo slot via `tramoColorVar` / `tramoColorClass` (`lib/tramos/tramo-color.ts`); no slot → `--muted-foreground`. Overdue: inset 1.5px `--destructive` ring; completed: 50 % opacity + line-through title; meeting: `--card` background, 1px `--border`, 3px left edge in the tramo colour, time in mono.

### 4.1 Visual (`Main`, `components/widgets/calendario/CalendarioVisual.tsx`)
- **Mes**: 7-column month grid (Mon–Sun) of 6 weeks, built on `buildMonthCells` + `CalendarWeekdayHeader` (`components/calendario/calendar-grid.tsx`). Each cell: day number as a button "Abrir el {día} {n}" that switches to Día; up to 3 chips (time prefix for meetings); "+n más" button (opens Día). Today: filled `--primary` circle on the number. Weekend cells `--muted` tint. Days outside the month muted.
- **Semana**: 7 columns; each column header "LUN 9"; items sorted by time (meetings with time first, then tasks by priority); empty days keep min height; the "Asistente" dashed button at the column foot (Phase 1 opens the panel with `selectedDate`; `Asistente` board).
- **Día**: hourly timeline `calendario.day_start`–`day_end` (default 08:00–19:00), 1 h rows, meeting blocks positioned by start/end, overlapping blocks side by side (two lanes), red "now" line (`--destructive`, 2px, only when the day is today, updates every minute through a `useNow(60_000)` hook — not a data fetch); right column "TAREAS DEL DÍA · SIN HORA" with task rows and "+ Tarea para este día" (`QuickAddRow variant="column"` with `dueDate = fecha`, or NewTaskDialog when quick-add is not allowed).
- **Drag to reschedule** (Mes and Semana; tasks with `canEdit` only): drag a task chip to another day → optimistic move in `qk.calendario.range` → `bulkUpdateTasksAction([taskId], { dueDate, dueField: item.dateField })` → toast "Moví «{título}» al {fecha}." with "Deshacer" (`UNDO_LABEL`, `UNDO_MS`), undo re-runs the action with the old date (`undoPatches`). Keyboard alternative: focus a chip, "Mover a otro día…" in its row menu (`RowActionsMenu`) opens a date picker; also `Alt+←/→` moves one day (announced). Meetings are not draggable in v1 (Decision F6).
- Dragging uses the existing drag pattern of `TaskBoardWidget` (pointer + keyboard sensors); no new drag library.

### 4.2 Esencial (`Esencial`, `components/widgets/calendario/CalendarioEsencial.tsx`)
- Centered column max 720px; `EsencialCard` per group with `EsencialItemRow`s:
  - Día: **Vencidas**, **Hoy**.
  - Semana: + **Mañana**, **Esta semana** (rest of the week).
  - Mes: + **Resto de {mes}** ("Resto de noviembre", sub "16 – 30 nov").
  - Group sub: count (Vencidas) or date ("mié 11 nov", "vie 13 – dom 15").
- Row: leading mark (a tramo-coloured ring for tasks, a tinted clock disc for meetings), title, line ("Reunión · Madrid 22" or "Madrid 22 · Diseño"), trailing mono when ("10:00", "hoy", "12 nov"; overdue dates as a destructive tint pill).
- **One-tap complete**: tapping the ring marks the task completed (`setTaskStatusAction` through `useActionMutation`, optimistic, toast "Tarea completada." + Deshacer). The rest of the row opens the detail sheet.
- Empty group hidden; all empty → empty state (§12).

### 4.3 Analítico (`Analitico`, `components/widgets/calendario/CalendarioAnalitico.tsx`)
- `KpiStrip`: TAREAS "{n}" secondary "en el rango"; REUNIONES "{n}" secondary "{h} h en total"; VENCIDAS "{n}" (destructive) secondary "{p} % del rango"; SIN RESPONSABLE "{n}" secondary "asígnalas desde la celda".
- `GroupedTable` grouped by Día (one group, the day, rows ordered by time), Semana (one group per day), Mes (one group per week "Semana 46 · 9 – 15 nov"; the canvas also merges the tail as "Semanas 48 – 49"; we keep one group per week, Decision F7). Group caption "{n} elementos". Range caption: "Hoy, miércoles 11 nov · por hora", "Semana 46, 9 – 15 nov · por día", "Noviembre 2026 · agrupado por semana".
- Columns: FECHA (sortable asc/desc, mono "mié 11"), HORA (mono, "—" for tasks), TIPO ("Tarea" / "Reunión"), TÍTULO (link: opens the drawer), PROYECTO, TRAMO (`TramoBadge variant="dot"`), RESPONSABLE / ASISTENTES (name, or "Ana García +2").
- Task rows use the task-table kit: `TableSelection` / `RowSelectCheckbox`, `TaskBulkBar` (status, responsable, fecha, delete via `useDeleteTasks`), `EditableCell` for Responsable and Fecha (`use-task-cell-edits.ts`). Meeting rows are not selectable.
- Rows come from `calendarioListInfiniteOptions` (§9.2); each group's "Cargar más" uses `LOAD_MORE_TEXT` / `loadMoreText(remaining)` (`components/widgets/table-rows.ts`), groups are computed from `CalendarioRange.days` counts so headers show totals before rows load. No client sort over pages (rule 9): sort is server order (`orderDir`).

## 5. Event detail per Estilo

One model, three presentations. `useCalendarioDetail()` reads `?evento=` and resolves the item from the range cache, else fetches `qk.calendario.meeting(id)` / `taskSheetOptions(id)`. Closing removes the param (`replaceState`) and returns focus to the item.

Shared fields:
- Meeting: tramo band, kind chip "Reunión · {tramo}", when ("Hoy, 10:00 – 11:00", "Viernes 13 nov, 12:00 – 13:00"), project · tramo, place, attendee avatars (`PeopleStack`) with "{n} asistentes · Google Calendar" or "· Cincel", note ("Enlace de Meet listo. 2 tareas del proyecto vencen antes de esta reunión." / "Lleva el plano actualizado. …" — the count from `MeetingDetail.relatedOverdue`).
- Task: kind chip "Tarea · {tramo}", "Vence el {fecha}" or "Vencía el {fecha}", responsable · estatus, note ("Fecha compromiso. Arrastra la tarea a otro día para cambiarla." or, overdue, "Lleva días de retraso. Reprográmala o pide al asistente que proponga una fecha.").

| | Visual (`Main`) | Esencial (`Esencial`) | Analítico (`Analitico`) |
|---|---|---|---|
| Container | floating card anchored to the item over the grid (`Popover`, `role="dialog"`, `aria-label` = title, "Cerrar detalle") | bottom sheet (`Sheet side="bottom"`), drag handle, big title 24/600 | right drawer (`Sheet side="right"`, 420px) |
| Meeting actions | "Unirse a Meet" (when `meetUrl`) or "Cómo llegar" (maps link of `location`), "Abrir proyecto", "✦ Prepara la reunión" | one primary 54px: "Cómo llegar" (or "Unirse a Meet"); secondaries "Abrir proyecto", "✦ Prepara la reunión" | field list (fecha, hora, lugar, proyecto, tramo, asistentes, origen "Google Calendar · sincronizado hace 5 min" or "Cincel"), RELACIONADO (tasks of the project due before: "Ingenierías (Madrid 22) · vencida 9 nov"), HISTORIAL (`history_events` of the event: "Ana García creó la reunión", "Se agregó a Luis Martínez", "El cliente confirmó asistencia"), actions "Unirse a Meet" / "Abrir en Google Calendar", "Crear minuta", "✦ Resume lo pendiente" |
| Task actions | "Marcar completada" (or "Reabrir"), "Abrir tarea" (`?tarea=`), "✦ Propón otra fecha" | primary "Marcar completada"; secondaries "Cambiar fecha" (date picker), "✦ Propón otra fecha" | fields código, estatus, responsable, fase, prioridad, subtareas; HISTORIAL ("Se creó desde el tramo Diseño", "Cambió la fecha compromiso"); actions "Marcar completada", "Abrir ficha", "✦ Propón otra fecha" |

- ✦ actions call tools (never free text): "Prepara la reunión" → opens the meeting's Antes tab (Phase 6; before that, the asistente panel with `meeting_prep`); "Propón otra fecha" → `move_tasks` via the asistente with `{ taskIds: [id] }` and the proposal overlay; "Resume lo pendiente" → `meeting_prep`; "Crear minuta" → Después tab.
- Google-only events (source google, not organizer): read-only; "Abrir en Google Calendar" only.
- Meeting edit (organizer): "Editar" in the header menu opens `NewMeetingDialog` in edit mode; "Cancelar reunión" asks with `ConfirmDeleteDialog` ("¿Cancelar la reunión? Se avisará a los asistentes.").

## 6. Meetings (Phase 2)

**Decision D1 (decided 2026-11-11):** Google Calendar is the main path for meetings. A meeting is created in the organizer's Google Calendar with a Meet link and Google's invitations; the Cincel-only meeting with an email invitation is only the failure path (no grant yet, token revoked, Google unavailable; backend §7.1, §7.6). The UI asks for the grant where it matters and always says which path a meeting took.

### 6.1 Nueva reunión dialog
- `NewMeetingDialog` (`components/calendario/NewMeetingDialog.tsx`, form with shadcn form primitives): Título, Fecha, Inicio, Fin (default +60 min), Proyecto (optional, `qk.catalog.projectOptions()`), Asistentes (staff combobox + free email; "Agregar al equipo del proyecto"), Lugar, "Crear enlace de Meet" (checkbox, default on), Descripción. Submit "Crear reunión" → `createMeetingAction`.
- **With the grant** (`google.eventsGrant`): the footer line reads "Se creará en tu Google Calendar y Google enviará la invitación." Toast "Reunión creada. Envié la invitación a {n} personas.".
- **Without the grant** (not connected, or connected without `calendar_events`): an inline `Alert` above the footer: "Conecta Google Calendar para crear la reunión con enlace de Meet y que Google envíe la invitación." with the primary "Conectar Google Calendar" and the secondary "Crear solo en Cincel". "Crear enlace de Meet" is disabled with the hint "Conecta Google Calendar para crear enlaces de Meet".
  - "Conectar Google Calendar" keeps the form draft in `sessionStorage` (`calendario.meetingDraft`, try/catch; a missing draft just opens an empty dialog) and goes to `/api/auth/google/start?scope=calendar_events&return_to=/calendario?nueva=reunion`; on return the dialog reopens with the draft and the alert gone (Decision F10).
  - "Crear solo en Cincel" saves on the failure path; toast "Reunión creada en Cincel. Envié la invitación por correo.".
  - When the admin has not allowed the scopes (`primary_error = 'ACCESS_DENIED'`), the alert reads "Tu administrador todavía no habilita Google Calendar para Cincel." with only "Crear solo en Cincel".
- **Google fails on save** (`GOOGLE_UNAVAILABLE`, `GOOGLE_REAUTH`): the meeting is saved on the failure path; toast "Reunión creada en Cincel. Envié la invitación por correo." with the reason line "Google Calendar no respondió; la agregaré en cuanto responda." or "Vuelve a conectar Google Calendar para agregarla.".

### 6.2 Google state of a meeting (detail, all Estilos)
The detail of a Cincel meeting shows a note with one action when it is not (yet) in Google, from `google_sync_error` and `invites_via` (backend §7.5–§7.6):

| State | Note | Action |
|---|---|---|
| in Google (no error) | origin "Google Calendar · sincronizado hace {t}" | "Abrir en Google Calendar" |
| `NO_GRANT` | "Esta reunión solo está en Cincel. La invitación se envió por correo." | "Conectar y crear en Google" (grant → `retryMeetingSyncAction`) |
| `ACCESS_DENIED` | "Tu administrador todavía no habilita Google Calendar para Cincel." | none |
| `UNAVAILABLE`, `RATE_LIMITED` | "Google Calendar no respondió. La invitación se envió por correo; la agregaré a Google en cuanto responda." | "Reintentar ahora" (`retryMeetingSyncAction`) |
| `REAUTH` | "Vuelve a conectar Google Calendar para que la reunión se agregue a Google." | "Volver a conectar" |
| `GONE` | "Ya no está en Google Calendar." | "Volver a crear en Google" |
| `NOT_ORGANIZER` | "Solo quien organiza puede actualizar Google Calendar. El cambio quedó en Cincel." | none |

Success of a retry: toast "Ya está en Google Calendar." and the note disappears. Visual shows the note inside the floating card, Esencial as a soft line above the primary action, Analítico in the ORIGEN field ("Cincel · pendiente de Google") with the action under the field list. Only the organizer sees the actions; attendees see the origin only.

### 6.3 Connection, refresh and settings
- Google status line (Analítico drawer and Ajustes › Integraciones): "Google Calendar · sincronizado hace {t}", "No conectado", "Vuelve a conectar Google Calendar".
- Refresh: the page runs `refreshGoogleEventsAction()` at most once per session when `google.syncedAt` is older than 5 min, as a mutation (`useActionMutation`, invalidating the `qk.calendario.range` family), and the "Actualizar" button runs it with `force`. It is never a `queryFn` and never an action call inside a bare `useEffect` (check-data-patterns rule 4): a small `useRefreshOnce(mutation, shouldRun)` hook in `components/calendario/` triggers the mutation from the hydration callback, mirroring the old auto-sync rule of query-migration §4.8 rule 5 (Decision F8).
- Ajustes › Integraciones (`lib/shell/settings-sections/integraciones/google-calendar.tsx`): new row "Reuniones y disponibilidad" with "Conectar" → `/api/auth/google/start?scope=calendar_events&return_to=/ajustes/integraciones`; when connected, "Conectado · sincronizado hace {t}"; on `ACCESS_DENIED` the admin copy of §6.1.

### 6.4 Meetings outside the calendar
- **Inicio** (`AgendaWidget`, `components/inicio/MyDayAgenda.tsx`): `AgendaItem` gets meetings from the same source in Phase 2 (`todayAgendaItems`). `AgendaItem` gains `meetUrl?: string` (Google Meet) next to the existing `meetingUrl` (Cutto). A Meet link renders "Unirse a Meet" (new tab, `rel="noopener noreferrer"`); a Cutto link keeps "Abrir en Cutto". The title opens `/calendario?evento=e:<id>`. A meeting on the failure path shows the same "solo en Cincel" origin as the detail, without actions.
- **Mi espacio › Bandeja** (`components/mi-espacio/Inbox.tsx`, `lib/my-space/inbox.ts`): the notification kind `reunion` gets the label "Reunión" and the `CalendarDays` icon; the row text comes from the server ("Ana García te invitó a «Revisión con cliente» · jue 12 nov, 10:00", "Cambió la hora de «Revisión con cliente»", "Se canceló «Revisión con cliente»") and opens `/calendario?evento=e:<id>`.
- **Ajustes › Notificaciones** (`components/ajustes/NotificacionesClient.tsx`): `NOTIFICATION_KIND_LABELS.reunion = "Reuniones"` with the description "Te invitan a una reunión o cambia una reunión tuya", in the channel matrix like the other kinds.

### 6.5 Calendario settings (Phase 5)
- **Ajustes › General** (`lib/shell/settings-sections/general/`, admin): a number field "Horas de trabajo por día" (`calendario.workday_hours`, 1–12, step 0.5, default 6) with the hint "Se usa para la carga del Calendario cuando el puesto no tiene capacidad semanal." Save through the existing general settings action.
- **Ajustes › Tramos** (`app/(staff)/ajustes/(admin)/tramos/TramosClient.tsx`): each task template row gains "Horas estimadas" (number, 0.5 step, empty = 1 h) for `workflow_task_templates.default_estimated_hours`.

## 7. Asistente features

### 7.1 Common: proposals overlay (Phase 3, ADR 0007)
- A proposal is `qk.calendario.proposal(id)` (`Proposal`, backend §6.2). The open one is `useCalendarioUi(s => s.proposal)` = `{ id, checked: string[] }` plus `?propuesta=` in the URL.
- **Visual**: `ProposalOverlay` draws, inside the grid/timeline/lanes, every change of the open proposal:
  - moved/new items: 2px dashed `--primary` outline, `--primary` 5 % tint, tag in mono "propuesta: desde 9 nov" / "propuesta: nueva reunión";
  - originals: 40 % opacity, line-through;
  - legend line "Cambio propuesto por el asistente (sin aplicar)".
- **Esencial**: a soft `EsencialCard` "Propuesta" above the groups with title + line, one primary 54px "Aplicar" and secondaries "Editar" / "Cancelar"; rows inside the groups get the dashed treatment.
- **Analítico**: a table "Cambiar {n} fechas compromiso" (or the kind's title) with a checkbox per change, "Título / Proyecto / Antes → Después" (old date struck in `--destructive-ink`), footer "Aplicar cambios" / "Cancelar". Same component as the chat card rows (§7.5).
- **Aplicar** → `applyProposalAction(id, checked)` (`useActionMutation`; invalidates `qk.calendario.all`, `qk.tareas.all`, `qk.inicio()`, `qk.shell.badges()`); toast with the server `toast` text and "Deshacer" for 10 s → `undoProposalAction(undoToken)`; partial results show "Apliqué 2 de 3 cambios. 1 no se pudo: sin permiso.".
- **Cancelar** → `cancelProposalAction(id)`, clears the overlay. **Editar** puts the proposal's text in the composer of the Barra (Barra proposals) or the asistente panel ("Editar" decision of #1007: deny with reason, then put the rows in the composer).
- One open proposal at a time; opening another replaces it (the previous stays `propuesta` until it expires).

### 7.2 Barra para pedir (Phase 3, `P1-Barra`)
- Always at the top of the calendar body. Input `aria-label="Pide algo para tu calendario"`, placeholder "Pide algo: “Junta con el cliente de Madrid 22 mañana a las 10”", submit "Pedir"; leading ✦ mark (decorative).
- Example chips under it (label "PRUEBA" in the canvas → "Ejemplos"): "Junta con el cliente de {proyecto} mañana a las 10", "Pasa lo vencido al jueves" — the project is the viewer's most recent project; chips fill the input and submit.
- Submit → `proposeFromTextAction({ text, view, from, to, selectedDate })` → the proposal opens (§7.1). While running: input disabled, "Pensando…" with `spin`. `NO_INTENT` → inline hint "No entendí qué cambiar. Prueba con "Pasa lo vencido al jueves"." Rate limit → `RATE_LIMITED` copy.
- Proposal card (Visual and Analítico inline under the bar, Esencial as the soft card): title ("Crear reunión · Junta con cliente · Madrid 22", "Mover 3 tareas vencidas al jueves 12 nov"), line ("Jueves 12 nov, 10:00 – 11:00 · invito a Ana García, Luis Martínez y al cliente · enlace de Meet", "Propuesta económica, Ingenierías y Levantamiento del sitio · el jueves queda en 7 h de trabajo"), Aplicar / Editar / Cancelar.
- Per Estilo: Visual = bar + overlay on the grid; Esencial = bar as a soft rounded input, the proposal as one big Aplicar; Analítico = bar above the `FilterCard`, the proposal as the checkbox table.

### 7.3 Resumen del día / semana (Phase 4, `P2-Resumen`)
- Shown at the top of Día and Semana (not Mes); collapsible ("Ocultar resumen", state in the store, per session).
- Data: `qk.calendario.day(date)` / `qk.calendario.week(from)` (`DaySummary` / `WeekSummary`).
- Content: greeting "Buenos días, Oscar" + lead paragraph (server text); four tiles **Reuniones**, **Vence hoy** (week: **Vence esta semana**), **En riesgo**, **Bloqueas a otros** with counts (risk and blocking counts in `--destructive-ink` when > 0). A tile expands (`aria-expanded`) to its items: title, line ("Proyecto Beta · Jorge Torres", "Bloqueada hace 7 días · frena "Obra negra" (12 nov)"), and one contextual action button: "Prepárame", "Pasar a mañana", "Asignar", "Avisa a Jorge", "Propón fecha", "Resolver", "Reparte esto".
- Action mapping (all through tools, backend §10.1 `SummaryAction`): Prepárame → Antes tab / `meeting_prep`; Pasar a mañana → `move_tasks` (proposal); Asignar → opens the Responsable cell editor (direct edit, not the asistente); Avisa a {nombre} → `notify_people` via the asistente panel with a prefilled message and its confirmation card; Propón fecha → `move_tasks` proposal; Resolver → `resolve_overlap`; Reparte esto → `propose_redistribution`.
- Primary button: Día "✦ Pasa a mañana lo que no alcances hoy" (`propose_redistribution { target: "next_day" }`) → after Aplicar, toast "Pasé 2 tareas a mañana jueves 12. Tu día queda en 3 h." + Deshacer. Semana "✦ Planea mi semana" → `?modo=planear` (§7.6), and "Reparte el jueves" when a day is overloaded.
- Per Estilo: Visual = a hero row with the four tiles as `KpiWidget`-style cards with sparkless counts and expanding panels over the grid; Esencial = one soft card with greeting, paragraph, tile pills and the big primary action (`P2-Resumen` is this one); Analítico = `KpiStrip` of the four counts + a grouped table "Resumen" (group per tile, action column).
- Below the summary in Esencial Día: "Tu día" agenda (the §4.2 groups).

### 7.4 Días que avisan (Phase 5, `P3-Alertas`)
- Data: `CalDay.hours / workday / loadLabel / overlaps` (from the range, viewer) and `qk.calendario.load(...)` for "Todos".
- Each day (Semana columns, Mes cells, Día header): a meter `role="meter" aria-valuemin=0 aria-valuemax={workday} aria-valuenow={hours} aria-label="Carga del día"`, text "{h} h de {w} h" and the label chip **Libre** / **Bien** / **Casi lleno** / **Sobrecargado**; overloaded days get a 3px `--destructive` top edge; overlapping meetings get a "Se traslapan" tag on both blocks.
- Header subtitle: "Semana 46 · tu carga por día (jornada de 6 h de trabajo)".
- Banners (`role="status"`, max 2, worst first): "El jueves 12 tiene 9.5 h de 6 h" with "✦ Reparte esto" (`propose_redistribution { target: "spread" }`) — the proposal moves N tasks to days with room and the meters show the after values while it is open (from the proposal's `cells`/changes), Aplicar / Cancelar / Deshacer; "El viernes se traslapan 2 reuniones" with "✦ Resolver traslape" (`resolve_overlap`), whose proposal shows the moved meeting dashed and the button "Aplicar y avisar" (sends the update to attendees).
- Per Estilo: Visual = meters in the column header, red top edge, banners above the grid; Esencial = one line per day group "Jueves · 9.5 h de 6 h · Sobrecargado" with a single "Reparte esto" action card; Analítico = a "Carga del día" table (fecha, horas, jornada, %, estado, traslapes) with heat cells (`HeatRule` warn 85, crit 100) and checkboxes in the proposal table.
- Estimated hours editing (Phase 5): task sheet field "Horas estimadas" (number, 0.5 step, placeholder from the template or "1 h"), Analítico cell, and quick-add token `~2h` added to `parseQuickAdd` (token kind `hours`).

### 7.5 Confirmation card in the chat (Phase 3)
- `ConfirmationCard` gains `selectable` for `apply_proposal`: one checkbox per `ToolPreviewRow` (`aria-label="Incluir {título}"`), the confirm button "Aplicar {n} cambios" counts checked rows, and it passes the checked `changeIds` (backend D8). After success the card shows "Deshacer" while the undo token is valid.
- `toolPreviews.apply_proposal` reads `qk.calendario.proposal(id)`; the rows match the Analítico proposal table.
- The asistente panel on `/calendario` shows the context line "Contexto: Calendario · 9 – 15 nov · Mis tareas" (`Asistente` board), the four suggestions (backend §11.5) and the placeholder "Agenda la visita de sitio de {proyecto} el jueves…".

### 7.6 Antes y después de la reunión (Phase 6, `P4-Reunion`)
- Lives in the meeting detail as tabs "Antes · preparar" / "Después · minuta" (`Tabs`), and in a "Reuniones" list (Analítico: table FECHA / REUNIÓN / PROYECTO / ESTADO; Visual and Esencial: a list card) with state chips **Hoy**, **Próxima**, **Minuta lista**.
- **Antes** (`qk.calendario.prep(eventId)`): KPI row AVANCE ("−8 vs plan"), TRAMO ("Diseño · Proyecto ejecutivo"), VENCIDAS ("2 de 15 abiertas"), ÚLTIMA JUNTA ("28 oct · 3 acuerdos, 1 abierto"); "✦ Resumen:" paragraph (template; "✦ Reescribir" asks `meeting_prep { phrasing: true }`); LO VENCIDO list ("Ingenierías · Luis Martínez · 9 nov · 2 d"); ORDEN DEL DÍA PROPUESTO checklist (editable, reorderable with buttons "Subir"/"Bajar"); "Enviar orden del día a asistentes" (`send_agenda` via its confirmation: a dialog listing recipients) and "Copiar" (clipboard, toast "Orden del día copiado.").
- **Después** (`qk.calendario.minutes(eventId)`): NOTAS DE LA REUNIÓN textarea (autosave 1 s debounce via `saveMeetingNotesAction`, "Guardado" status); "✦ Crear minuta" → `extract_minutes` → ACUERDOS · {d} DECISIÓN · {t} TAREAS: decisions ("Decisión: cocina en cuarzo blanco (se guarda en el historial del proyecto).") and a checkbox table TAREA / RESPONSABLE / FECHA (editable before applying; unresolved owner shows "Sin responsable" in `--warning`), follow-up row "Junta de seguimiento con cliente · 25 nov" when mentioned; primary "Crear {n} tareas en {proyecto}" (`create_tasks_from_minutes`) → toast "Creé 4 tareas y agendé la junta del 25 nov." + Deshacer; secondary "Enviar minuta por correo" (`send_minutes`).
- Per Estilo: Visual = tabs inside the floating card enlarged to a side card over the grid; Esencial = the bottom sheet with two tabs and one big action per tab ("Enviar orden del día" / "Crear tareas"); Analítico = drawer with tables (the `P4-Reunion` board).

### 7.7 Planear mi semana (Phase 7, `P5-Planear`)
- Entry: Semana view action "Planear la semana" or the Resumen button; URL `?modo=planear&fecha=<monday>`. Title "Planear mi semana", subtitle "Semana 47 · 16 – 20 nov · equipo de Madrid 22 y Proyecto Beta".
- Data: `qk.calendario.planWeek({ weekStart, staffIds })` (`PlanWeekData`: backlog, people, cells).
- Left **Por planear**: backlog rows with checkbox, drag handle (`aria-roledescription="arrastrable"`), title, project, est. hours ("2 h"); drop zone "✦ Arrastra tareas aquí para que el asistente las acomode" (adds to `taskIds` of the next `plan_week` call).
- Right **lanes per person × Lun–Vie**: header PERSONA + days; each cell a load meter "x/6" (label Con espacio / Lleno / Sobrecargado per D10 mapping) and task chips; dragging a backlog task into a cell creates a one-row `move_tasks` proposal (no direct write).
- "✦ Planear mi semana" → `plan_week` → placements drawn as dashed chips, cells show after values, a "No cupo" list with reasons ("Jorge ya está al 100 %"); Aplicar sets commitment dates and notifies owners (server); toast "Planeé {n} tareas de la semana. Avisé a {m} personas." + Deshacer.
- Keyboard alternative to drag: each backlog row has "Mover a…" (person + day selects) and Space/Enter to pick + arrow keys to choose a cell + Enter to drop, announced through a live region.
- Per Estilo: Visual = lanes grid (the board); Esencial = one card per day with the viewer's planned tasks and one big "Planear mi semana" (lanes of others hidden); Analítico = table person × day with hours and a checkbox proposal table.
- Others' lanes only with permission (backend §13); otherwise only the viewer's lane, and the subtitle says "tu semana".
- The canvas shows a reassignment chip ("MP→AG") on one placed task. `plan_week` does not reassign in v1 (D7), so the chip is not built; the task is deferred with "Sin responsable" or kept on its owner.

## 8. Components

New, per-style markup (guarded) — `components/widgets/calendario/`:
| Component | Props (sketch) | Phase |
|---|---|---|
| `CalendarioVisual` | `{ range: CalendarioRange; query: CalendarioQuery; onOpen(id); onMove(item, date) }` | 1 |
| `CalendarMonthGrid`, `CalendarWeekColumns`, `CalendarDayTimeline` | Visual pieces | 1 |
| `CalendarioEsencial` | `{ range; query; onOpen; onComplete(taskId) }` | 1 |
| `CalendarioAnalitico` | `{ range; query; list: InfiniteData<CalendarioListPage>; … }` | 1 |
| `CalendarItemChip` | `{ item: CalItem; density: "chip" \| "card" \| "block"; proposal?: "new" \| "ghost" }` | 1 |
| `EventDetailCard` / `EventDetailSheet` / `EventDetailDrawer` | `{ item: CalItem; detail?: MeetingDetail; actions: DetailAction[]; onClose }` | 1 (tasks), 2 (meetings) |
| `ProposalOverlay`, `ProposalCard`, `ProposalTable` | `{ proposal: Proposal; checked; onToggle; onApply; onCancel; onEdit; variant }` | 3 |
| `BarraParaPedir` | `{ context: AssistantCalendarContext; examples: string[]; onProposal(p) }` | 3 |
| `ResumenPanel` | `{ summary: DaySummary \| WeekSummary; onAction(a: SummaryAction) }` | 4 |
| `DayLoadMeter`, `DayAlertBanner` | `{ hours; workday; label }`, `{ kind: "overload" \| "overlap"; … }` | 5 |
| `MeetingPrepPanel`, `MeetingMinutesPanel`, `MeetingsList` | | 6 |
| `PlanWeekBoard` | `{ data: PlanWeekData; proposal?: Proposal; … }` | 7 |

Page level (no per-style markup) — `components/calendario/`: `CalendarioClient.tsx` (reads URL + queries, renders `PageHeader`, toolbar, then `PageStyleLayout({ visual, esencial, analitico })`), `CalendarioToolbar.tsx`, `NewMeetingDialog.tsx`, `use-calendario-page.ts` (queries, mutations), `use-calendario-detail.ts`, `use-proposal.ts`. Existing reused: `PageHeader`, `KpiStrip`, `FilterCard`, `GroupedTable`, `EsencialCard`, `EsencialItemRow`, `QuickAddRow`, `ProjectFilter`, `HideCompletedSwitch`, `IncludeSupportSwitch`, `TramoBadge`, `PeopleStack`, `StatusChip`, `TaskBulkBar`, `EditableCell`, `RowActionsMenu`, `ConfirmDeleteDialog`, `EmptyState`, `ErrorState`, `CalendarFeedDialog`, `calendar-grid.tsx`.

Guard allowlists (`components/*/…guard.test.ts`, `tests/guards/style-view.guard.test.ts`): add the `calendario` widgets; `CalendarioClient` imports only `@/components/widgets/*` names.

## 9. Data

### 9.1 Keys (`lib/query/keys.ts`, new section `calendario`)
```ts
calendario: {
  all: ["calendario"] as const,
  range: (i: { view: CalView; from: string; to: string; filters: CalendarioFilters }) => ["calendario", "range", i] as const,
  list: (i: { from: string; to: string; filters: CalendarioFilters; orderDir: "asc" | "desc" }) => ["calendario", "list", i] as const,
  day: (date: string) => ["calendario", "day", date] as const,
  week: (from: string) => ["calendario", "week", from] as const,
  load: (i: { from: string; to: string; staffIds: string[] }) => ["calendario", "load", i] as const,
  meeting: (id: string) => ["calendario", "meeting", id] as const,
  prep: (id: string) => ["calendario", "meeting", id, "prep"] as const,
  minutes: (id: string) => ["calendario", "meeting", id, "minutes"] as const,
  planWeek: (i: { weekStart: string; staffIds: string[] }) => ["calendario", "plan-week", i] as const,
  proposals: () => ["calendario", "proposals"] as const,
  proposal: (id: string) => ["calendario", "proposals", id] as const,
},
```
Filters are normalised (sorted ids, defaults filled) by `normalizeCalendarioFilters` before they enter a key. `tests/unit/query/keys.test.ts` snapshot updated.

### 9.2 Options (`lib/query/options/calendario.ts`)
| Function | Key | queryFn | staleTime | Notes |
|---|---|---|---|---|
| `calendarioRangeOptions(i)` | `range(i)` | `getCalendarioRange(i)` | `STALE.screen` | `placeholderData: keepPreviousData` |
| `calendarioListInfiniteOptions(i)` | `list(i)` | `getCalendarioList({...i, cursor})` | `STALE.screen` | `infiniteQueryOptions`, `initialPageParam: null`, `getNextPageParam: l => l.nextCursor` |
| `calendarioDaySummaryOptions(date)` / `…WeekSummaryOptions(from)` | `day` / `week` | page-data actions | `STALE.screen` | |
| `calendarioLoadOptions(i)` | `load(i)` | `getCalendarioLoad` | `STALE.screen` | |
| `meetingDetailOptions(id)`, `meetingPrepOptions(id)`, `meetingMinutesOptions(id)` | | | 30 s; minutes `Infinity` while editing | |
| `planWeekOptions(i)` | `planWeek(i)` | `getPlanWeek` | `STALE.screen` | |
| `proposalOptions(id)` | `proposal(id)` | `getProposal` | `Infinity` | seeded with `setQueryData` from the proposing call |
| `calendarioInvalidations(kind)` | — | — | — | `QueryKey[]` per write: tasks → `[qk.calendario.all, qk.tareas.all, qk.inicio(), qk.shell.badges()]`; meetings → `[qk.calendario.all, qk.inicio()]`; minutes → + `qk.proyectos.history(pid)` |

`lib/assistant/tool-invalidation.ts` uses the same families (backend §11), so a change made in the chat panel refreshes the calendar at once.

### 9.3 Prefetch and hydration
- `page.tsx`: `const qc = getQueryClient(); await prefetch(qc, calendarioRangeOptions(input), () => loadCalendarioRange(user, input));` with `input` from the URL and the resolved Estilo's default `vista`. Analítico also prefetches the first list page (`prefetchInfinite` pattern of Tareas). Día/Semana prefetch the summary in Phase 4 (`void` + streamed, pending dehydration).
- Range navigation: hover/focus on Anterior / Siguiente / a "+n más" prefetches the adjacent range (`queryClient.prefetchQuery`, debounced 100 ms, one at a time because actions are serial).
- Changing filters keeps the previous data visible (`keepPreviousData`) with a top progress line.

### 9.4 Mutations
All through `useActionMutation` (`lib/query/mutation.ts`) with `ActionResult` actions: drag move and complete (optimistic on `range` + `list`, rollback on error), `createMeetingAction`, `updateMeetingAction`, `cancelMeetingAction`, `refreshGoogleEventsAction`, `applyProposalAction`, `cancelProposalAction`, `undoProposalAction`, `saveMeetingNotesAction`, `sendAgendaAction`, `sendMinutesAction`, `setTaskEstimatedHoursAction`, `proposeFromTextAction`, `runProposingToolAction`. No `router.refresh`, no `revalidatePath` (rules 1 and 3).

### 9.5 Paging and limits
- Visual Mes: 3 items per day + "+n más"; Semana: 12 per day + "+n más" (opens Día); Día: all (≤ 200, then "Ver en Analítico").
- Analítico: 50 rows per page, "Cargar más" per group.
- `truncated` from the server shows nothing extra; counts always come from `days`.

## 10. Zustand UI store (`lib/stores/calendario-ui-store.ts`)

```ts
type CalendarioUiState = {
  selectedItemId: string | null;          // focus ring / keyboard selection (detail itself is ?evento=)
  selectedDate: string | null;            // Mes/Semana keyboard cursor; passed to the asistente context
  proposal: { id: string; checked: string[] } | null;
  setProposal(p: { id: string; checked: string[] } | null): void; toggleChange(changeId: string): void;
  resumenCollapsed: boolean; setResumenCollapsed(v: boolean): void;
  expandedTile: "reuniones" | "vence" | "riesgo" | "bloqueas" | null; setExpandedTile(t): void;
  barDraft: string; setBarDraft(t: string): void;
  planDrops: string[]; addPlanDrop(id: string): void; clearPlanDrops(): void;
  dragging: { itemId: string; overDate: string | null } | null; setDragging(d): void;
  reset(): void;
};
export const useCalendarioUi = create<CalendarioUiState>(…);  // always with a selector (rule 7)
registerUiStoreReset(resetCalendarioUi);                       // cleared on identity change
```
**View and range are URL state** (`vista`, `fecha`), not store state: they must be shareable and survive reload (zustand.md boundary). The store never copies server data (rule 5). Nothing is persisted; `resumenCollapsed` may use `localStorage` later.

The asistente page context is built by `useCalendarioAssistantContext()` from the URL + store (`AssistantCalendarContext`, backend §6.1) and passed through `AssistantLauncher` (`assistantContextFromRoute` gains the `/calendario` branch reading `vista`, `fecha`, filters, `evento`, `propuesta`). The "Asistente" button of a day column or of the detail opens `useAssistantUi` with `selectedDate` / `selectedItemId` set.

## 11. Accessibility

- axe clean (critical/serious) in light and dark for each Estilo × vista and for the detail, the Barra, the Resumen, the banners, Antes/Después and Planear; 390 px wide with no horizontal page scroll (the Semana grid and Planear lanes scroll inside their own box with a visible "Desliza para ver más días" hint and `tabindex=0` region with `aria-label`).
- **Month and week grid**: `role="grid"` with `aria-label="Noviembre 2026"`; rows `role="row"`, cells `role="gridcell"` with `aria-label="miércoles 11 de noviembre, 3 tareas, 1 reunión, 1 vencida"`; roving tabindex; arrows move by day, Home/End to week start/end, PageUp/PageDown to previous/next month (updates the URL), Enter opens Día, Tab enters the cell's items. Today has `aria-current="date"`.
- **Day timeline**: a list of hour rows (`role="list"`), each meeting block a button with full time text ("10:00 a 11:00, Revisión con cliente, Sala 2"); the now line is `aria-hidden` with a visually hidden "Ahora, 10:42" text.
- **Drag alternatives**: every drag has a menu or keyboard path (§4.1, §7.7); moves announce through a polite live region ("Moviste Ingenierías al jueves 12. Deshacer disponible.").
- **Detail**: Visual card is a non-modal dialog that traps nothing but returns focus on Escape; sheet and drawer are modal (`Sheet`), focus first heading.
- **Proposals**: dashed state is not colour-only: the "propuesta: …" tag text is always present; ghost originals have `aria-description="Se moverá"`.
- **Meters**: `role="meter"` with text; labels never rely on colour.
- Touch targets ≥ 44 px on mobile (chips become 44 px rows in the Esencial and in the Mes "+n más" list).

## 12. States

| State | Visual | Esencial | Analítico |
|---|---|---|---|
| Loading (first) | grid skeleton (6×7 cells / 7 columns / 12 hour rows) | 3 card skeletons | KPI ×4 + table skeleton |
| Loading (range change) | previous range dimmed + top progress line | same | same |
| Empty range | grid shown, centered note "No hay nada en este rango." + "Nueva tarea" | `EmptyState` "Tu agenda está libre." | `EmptyState` "No hay tareas ni reuniones en este rango." + "Quitar filtros" when filters are set |
| Empty because of filters | "No hay resultados con estos filtros." + "Quitar filtros" | same | same |
| Error | `ErrorState` "No se pudo cargar el calendario." + "Reintentar" (filters stay usable) | same | same |
| Google not connected | one-time banner "Conecta Google Calendar para ver tus reuniones." + "Conectar" / "Ahora no" | same | origin field "No conectado" |
| Google scopes not allowed by the admin | banner "Tu administrador todavía no habilita Google Calendar para Cincel." (no Conectar) | same | same |
| Google error (refresh) | detail note "No se pudo actualizar Google Calendar." + "Reintentar" | | |
| Meeting not in Google (failure path) | the note and action of §6.2 | same | same |
| Proposal stale/expired | card "Esta propuesta ya no está vigente." + "Pedir de nuevo" | | |
| No permission (team) | "Todos" option hidden | "Todo el equipo" hidden | RESPONSABLE group without "Todos" |

## 13. Copy deck (Spanish, sentence case)

| Key | Text |
|---|---|
| nav | Calendario |
| title / subtitle | Calendario · "{Mes} {año} · {t} tareas y {r} reuniones · {v} vencidas" · "Semana {n} · …" · "Hoy · …" |
| views | Día · Semana · Mes · Hoy · Anterior · Siguiente |
| header actions | Suscribirse · + Nuevo · Tarea · Reunión |
| filters | Mostrar · Todo · Tareas · Reuniones · Responsable · Yo · Todos · Mi agenda · Todo el equipo · Proyecto: Todos · Tramo · Incluir apoyo · Ocultar completadas · Quitar filtros |
| legend | Reunión (con hora) · Vencida · Cambio propuesto por el asistente (sin aplicar) |
| grid | Clic en un número de día para abrir ese día · +{n} más · Abrir el {día} {n} · TAREAS DEL DÍA · SIN HORA · + Tarea para este día · Asistente · Pedir al asistente para el {día} {n} |
| esencial groups | Vencidas · Hoy · Mañana · Esta semana · Resto de {mes} |
| analítico | TAREAS · en el rango · REUNIONES · {h} h en total · VENCIDAS · {p} % del rango · SIN RESPONSABLE · asígnalas desde la celda · FECHA · HORA · TIPO · TÍTULO · PROYECTO · TRAMO · RESPONSABLE / ASISTENTES · Tarea · Reunión · {n} elementos · Cargar más |
| detail (meeting) | Reunión · {n} asistentes · Google Calendar · Cincel · Unirse a Meet · Cómo llegar · Abrir proyecto · ✦ Prepara la reunión · Abrir en Google Calendar · Crear minuta · ✦ Resume lo pendiente · Enlace de Meet listo. · {n} tareas del proyecto vencen antes de esta reunión. · RELACIONADO · HISTORIAL · Google Calendar · sincronizado hace {t} · Editar · Cancelar reunión · Cerrar detalle |
| detail (task) | Tarea · Vence el {fecha} · Vencía el {fecha} · Marcar completada · Reabrir · Abrir tarea · Abrir ficha · Cambiar fecha · ✦ Propón otra fecha · Fecha compromiso. Arrastra la tarea a otro día para cambiarla. · Lleva días de retraso. Reprográmala o pide al asistente que proponga una fecha. · Sin asignar |
| meeting dialog | Nueva reunión · Título · Fecha · Inicio · Fin · Proyecto · Asistentes · Agregar al equipo del proyecto · Lugar · Crear enlace de Meet · Descripción · Crear reunión · Guardar cambios · Reunión creada. Envié la invitación a {n} personas. · Reunión creada en Cincel. Envié la invitación por correo. · ¿Cancelar la reunión? Se avisará a los asistentes. |
| google | Conecta Google Calendar para ver tus reuniones. · Conectar · Ahora no · Vuelve a conectar Google Calendar · No se pudo actualizar Google Calendar. · Reintentar · Actualizar · Reuniones y disponibilidad · Conecta Google Calendar para crear enlaces de Meet · Conecta Google Calendar para crear la reunión con enlace de Meet y que Google envíe la invitación. · Conectar Google Calendar · Crear solo en Cincel · Se creará en tu Google Calendar y Google enviará la invitación. · Tu administrador todavía no habilita Google Calendar para Cincel. · Esta reunión solo está en Cincel. La invitación se envió por correo. · Conectar y crear en Google · Google Calendar no respondió. La invitación se envió por correo; la agregaré a Google en cuanto responda. · Reintentar ahora · Vuelve a conectar Google Calendar para que la reunión se agregue a Google. · Volver a conectar · Ya no está en Google Calendar. · Volver a crear en Google · Solo quien organiza puede actualizar Google Calendar. El cambio quedó en Cincel. · Ya está en Google Calendar. · Cincel · pendiente de Google · Google Calendar no respondió; la agregaré en cuanto responda. · Vuelve a conectar Google Calendar para agregarla. |
| fuera del calendario | Unirse a Meet · Abrir en Cutto · Reunión · Reuniones · Te invitan a una reunión o cambia una reunión tuya · {nombre} te invitó a «{título}» · {día} {n} {mes}, {hora} · Cambió la hora de «{título}» · Se canceló «{título}» |
| ajustes | Horas de trabajo por día · Se usa para la carga del Calendario cuando el puesto no tiene capacidad semanal. · Horas estimadas |
| barra | Pide algo para tu calendario · Pide algo: “Junta con el cliente de Madrid 22 mañana a las 10” · Pedir · Ejemplos · Pensando… · No entendí qué cambiar. Prueba con "Pasa lo vencido al jueves". |
| proposal | Aplicar · Editar · Cancelar · Aplicar cambios · Aplicar {n} cambios · Aplicar y avisar · Deshacer · propuesta: desde {fecha} · propuesta: nueva reunión · Cambiar {n} fechas compromiso · Incluir {título} · Esta propuesta ya no está vigente. · Pedir de nuevo · Apliqué {a} de {n} cambios. {s} no se pudo: {motivo}. · Cambio deshecho. · No cupo |
| resumen | Buenos días, {nombre} · Buenas tardes, {nombre} · Buenas noches, {nombre} · Reuniones · Vence hoy · Vence esta semana · En riesgo · Bloqueas a otros · Prepárame · Pasar a mañana · Asignar · Avisa a {nombre} · Propón fecha · Resolver · Reparte esto · ✦ Pasa a mañana lo que no alcances hoy · ✦ Planea mi semana · Reparte el {día} · Tu día · Tu semana, {rango} · Ocultar resumen · Mostrar resumen |
| alertas | Carga del día · {h} h de {w} h · Libre · Bien · Casi lleno · Sobrecargado · Ausente · Se traslapan · El {día} {n} tiene {h} h de {w} h · ✦ Reparte esto · El {día} se traslapan {n} reuniones · ✦ Resolver traslape · Semana {n} · tu carga por día (jornada de {w} h de trabajo) · Horas estimadas |
| reunión | Antes · preparar · Después · minuta · AVANCE · {d} vs plan · TRAMO · VENCIDAS · de {n} abiertas · ÚLTIMA JUNTA · {n} acuerdos, {m} abierto · ✦ Resumen: · ✦ Reescribir · LO VENCIDO · ORDEN DEL DÍA PROPUESTO · Subir · Bajar · Enviar orden del día a asistentes · Copiar · Orden del día copiado. · NOTAS DE LA REUNIÓN · Guardado · ✦ Crear minuta · ACUERDOS · {d} DECISIÓN · {t} TAREAS · Decisión: {texto} (se guarda en el historial del proyecto). · TAREA · RESPONSABLE · FECHA · Sin responsable · Crear {n} tareas en {proyecto} · Enviar minuta por correo · Creé {n} tareas y agendé la junta del {fecha}. · Reuniones · Hoy · Próxima · Minuta lista · Sin minuta |
| planear | Planear la semana · Planear mi semana · Semana {n} · {rango} · equipo de {proyectos} · tu semana · Por planear · ✦ Arrastra tareas aquí para que el asistente las acomode · ✦ Planear mi semana · PERSONA · Con espacio · Lleno · Sobrecargado · {x}/{w} · No cupo · {Nombre} ya está al 100 % · Planeé {n} tareas de la semana. Avisé a {m} personas. · Mover a… · Desliza para ver más días |
| asistente | Contexto: Calendario · {rango} · {filtro} · ¿Qué vence antes de la entrega del {fecha}? · Resume mi día de hoy · Busca un hueco de 2 horas para {persona} esta semana · Mueve todo lo vencido a días con menos carga · Agenda la visita de sitio de {proyecto} el jueves… |
| states | No hay nada en este rango. · Tu agenda está libre. · No hay tareas ni reuniones en este rango. · No hay resultados con estos filtros. · No se pudo cargar el calendario. · Demasiadas solicitudes. Intenta de nuevo en unos minutos. |
| toasts | Moví «{título}» al {fecha}. · Tarea completada. · Moví {n} tareas al {fecha}. · Creé la junta del {día} a las {hora} y envié la invitación. · Pasé {n} tareas a mañana {día} {n}. Tu día queda en {h} h. |

`lib/calendario/copy.ts` (server) and `components/calendario/copy.ts` (client) hold these; a copy test checks sentence case and the absence of weights above 600 in class names.

## 14. Tests

| Kind | Files | What |
|---|---|---|
| Unit | `lib/calendario/url-state.test.ts`, `range.test.ts` | parse/serialize, defaults per Estilo, `rangeOf` for each vista, redirect mapping |
| Unit (components) | `components/widgets/calendario/*.test.tsx` with `renderWithQueryClient`, `mockAction` | each Estilo × vista renders fixtures from the canvas; "+n más"; drag move calls `bulkUpdateTasksAction` with the item's `dateField`, Deshacer restores; one-tap complete; Analítico paging calls the next cursor; detail actions per style; proposal overlay draws dashed + ghost; Aplicar sends checked `changeIds`; Barra NO_INTENT hint; Resumen tile actions call the mapped tool; meters and labels; Planear keyboard path |
| a11y | `components/widgets/calendario/calendario.a11y.test.tsx` | the `seriousViolations` pattern of `TareasEsencial.a11y.test.tsx` (`settle`, axe critical/serious, light and dark via `data-theme`, `data-style`), plus a 390 px case; grid keyboard (arrows, PageUp/PageDown, Enter) |
| Guards | `tests/guards/*`, `scripts/check-data-patterns.mjs` | widgets only under `components/widgets/calendario`; no full task reads (rule 11); selectors on `useCalendarioUi`; every suggestion and ✦ action names a registered tool (#1057 guard extended with the Calendario suggestions) |
| Query | `lib/query/options/calendario.test.ts`, `tests/unit/query/keys.test.ts` | key shapes, normalisation, invalidation lists |
| e2e | `tests/e2e/calendario.spec.ts` (Phase 8) | menu → page in three Estilos; switch Día/Semana/Mes and Hoy; filters persist in URL; drag + Deshacer; create a task on a day; Barra with the mocked provider route proposes, Aplicar, Deshacer; Resumen action; Planear proposal |

## 15. Decisions needed (with defaults)

| # | Decision | Default |
|---|---|---|
| F1 | Calendario in the mobile bottom tabs | No; keep 4 tabs, Calendario in "Más" |
| F2 | Hover prefetch for Calendario | Yes, debounced, current range only |
| F3 | Default vista per Estilo | Visual Mes, Esencial Semana, Analítico Semana |
| F4 | Which date "+ Tarea para este día" sets | Commitment date (the date the calendar shows) |
| F5 | Project filter in Esencial | Not shown; a chip shows it when set by URL |
| F6 | Drag meetings to move them | No in v1 (meetings move through the detail or a proposal) |
| F7 | Analítico Mes grouping | One group per ISO week (the canvas merges weeks 48–49) |
| F8 | Google refresh trigger | Once-per-session mutation on mount when older than 5 min, plus "Actualizar" |
| F9 | Where Resumen and Barra sit in Esencial on mobile | Barra first, Resumen collapsed to the greeting line |
| F10 | Keep the Nueva reunión draft across the Google grant redirect | Yes: `sessionStorage` draft + `?nueva=reunion` reopens the dialog |
| F11 | The "Tramos" legend in the sidebar (`Sidebar` board) | Not built: the shell sidebar is shared by every page; the tramo legend lives in the Visual filter row (§3) |
