# Query Migration: moving data loading to TanStack Query (inventory and plan)

This was a read-only audit of `/media/diva/git/git/cincel-workspace/cincel-app` (Next 16.2.10, React 19.2.4, `@tanstack/react-query` ^5.102.8, zustand ^5.0.15). Paths are relative to `cincel-app/`. "q" means one DB round trip. Query counts come from reading the repositories, not from measuring.

## Key findings

These shape the design.

1. **Server actions that call `revalidatePath` already send back a full re-render of the current route, root and `(staff)` layouts included.**
   - Today almost every mutation pays for one full page render. When `router.refresh()` follows, it pays for two.
   - Example: a Tablero drag runs `setTaskStatusAction` (→ `revalidatePath('/tareas')`), then `router.refresh()` (`components/tareas/TareasTablero.tsx:74`). That ships the 6.3 MB `/tareas` payload twice.
   - **Migration rule:** once a screen reads through TanStack, remove the `revalidatePath` calls that target it. Otherwise every `useMutation` still triggers an RSC re-render, on top of `invalidateQueries`.
2. **Most `revalidatePath` targets point at legacy routes that only redirect,** so they do nothing. Affected: `/tablero`, `/calendario`, `/dashboard`, `/mis-tareas`, `/actividades` (layout), `/equipo`, `/directorio`, `/recursos`, `/configuracion/*` (redirect map in `lib/ui/legacy-redirects.ts:27-41`).
   - Live pages that their own actions never revalidate: `/inicio`, `/personas*`, `/biblioteca/[seccion]`, `/ajustes/{puestos,estatus,tramos,google,monday}`, `/proyectos/[id]` (Resumen), `/proyectos/[id]/tareas`.
   - This is why the 35 `router.refresh()` calls and the hand-written `reload()` / `refetch()` helpers exist.
3. **The browser runs client-invoked server actions one at a time.**
   - Several `useQuery`s whose `queryFn` is an action run one after another.
   - A poll waits behind a slow mutation or a live Gmail read.
   - Hover-prefetching several links queues up.
   - This is the strongest reason for **one page-data call per route**.
   - For polled data (badges), use a small `GET` route handler, or accept the queue.
4. **Thrown action errors probably lose their message in production builds.** Next replaces it with a generic error plus digest; `lib/actions/calendar-actions.ts:93-95` notes this.
   - So `actionErrorText(err)` (`lib/errors.ts:104`), which parses `CODE` out of `err.message`, likely shows the generic copy in prod for every action that throws. **Confirm on a prod build.**
   - Only the actions that return `{ok:false,error}` keep their codes: portal, schedule `ActionResult`, workspace-access, monday-import, onboarding, calendar sync, `submitProjectCreateAction`.
   - The new mutation helper should handle both styles. Over time, move actions to returning results.
5. **Soft navigation does not re-render shared layouts.** The `(staff)` layout and `AppShell` run on hard loads, on `router.refresh()`, and on every revalidating action.
   - `next.config.ts:14` already sets `experimental.staleTimes.dynamic = 30`, so going back within 30 s reuses the RSC payload.
   - Each new page segment is still rendered on the server, page data included.
6. **TanStack is installed but unused.**
   - `components/providers/QueryProvider.tsx` (staleTime 30 s, `refetchOnWindowFocus:false`) is mounted at `app/layout.tsx:86`.
   - There are **0** `useQuery` / `useMutation` / `useQueryClient` calls and no `HydrationBoundary`.
   - `AppearanceProvider` (`app/layout.tsx:107`) and `<Toaster>` (`:109`) sit **outside** `QueryProvider`. Move `QueryProvider` up so it wraps both.
   - The only Zustand store is `lib/stores/session-store.ts:20` (`{access,setAccess}`). Its doc comment already says server data belongs in TanStack Query.
7. **No data repository or action is wrapped in React `cache()`.** Only session (`lib/auth/session.ts:110,137`), appearance (`lib/ui/preferences-server.ts:56,141`) and portal style/appearance (`lib/portal/style-server.ts:16,42`, `lib/portal/appearance.ts:31`) are. A read repeated within one render hits the DB again.
8. **Two pairs of actions share a name.** Key and mutation factories must namespace by module:
   - `setTaskStatusAction`: `tasks-actions.ts:170` and `schedule-actions.ts:78`.
   - `addChecklistItemAction`: `tasks-actions.ts:237` and `my-space-actions.ts:87`.
9. **Some reads have side effects:**
   - `fetchGmailThreadAction` marks the thread read and calls `revalidatePath('/mi-espacio','layout')` (`lib/actions/gmail-actions.ts:247-249`).
   - `/ajustes/monday` calls `openMondayImportRunAction(false)` during render, which creates or resumes a run (`app/(staff)/ajustes/(admin)/monday/page.tsx:39-43`).
   - `/ajustes/integraciones` may refresh a Google OAuth token over HTTP and write it to the DB while rendering (`lib/google/picker-drive.ts:73-82`, `lib/google/staff-token.ts:52-77`).
   - `TareasCalendario.tsx:131-133` fires `syncGoogleCalendarAction({auto:true})` on mount.

---

## 1. Route inventory

### 1.0 Root and `(staff)` layout (hard loads, refreshes and every revalidating action)

**`app/layout.tsx`**
- `:81` runs in parallel:
  - `getSessionAccess()`: cached; 1 q, plus a Google Directory call when an access re-check is due (`lib/auth/session.ts:137-162`).
  - `getResolvedAppearance()`: cached; `app_settings('appearance.theme')`, then `user_preferences`, 2 q in sequence.
- `:83` then runs `getGeneralSettings()` (`lib/settings/general-settings-server.ts:12`): not cached, 1 q.
- The appearance cookie is written but never read back (`readAppearanceCookie` is unused), so the DB is read on every request.

**`app/(staff)/layout.tsx`**, in order:

| Step | What | Cost |
|---|---|---|
| 1 | `getSessionAccess` (`:21`) | cached |
| 2 | `getResolvedAppearance` (`:26`) | cached |
| 3 | `loadPhotoUrl` → `findStaffPhoto` (`:35`, `:72`) | awaited **before** step 4. Selects every column, **including the photo `bytes` blob**, only to read `sha256` (`lib/repositories/preferences-repository.ts:34`). `lib/profile-photo/photo-url.ts:18` already has a sha-only variant. |
| 4a | `buildNavModel` (`lib/ui/nav.ts:95`) | runs every `lib/shell/nav-items/*` `resolve` in parallel (see below) |
| 4b | `fetchMyTodayAction` (`lib/actions/time-tracking-actions.ts:83`) | `requireCaller`, plus `getTimeTrackingSettings` (not cached, `lib/time-tracking/settings.ts:97`), plus the day's entries: about 3 q |

Nav items resolved in step 4a:

| Item | File | Cost |
|---|---|---|
| inicio | `lib/shell/nav-items/inicio.ts` | flag only |
| mi-espacio | `lib/shell/nav-items/mi-espacio.ts:21-34` | `loadBandejaUnread` → `fetchNotificationsAction({unreadOnly:true})`: **lists 31 rows plus a count, to use only the count** (`notifications-actions.ts:95-117`), plus `loadDueReminders` → `fetchRemindersAction`. About 3 q. |
| **tareas** | `lib/shell/nav-items/tareas.ts:30` | `fetchMyTasksAction()` → full `listTasks` for the viewer (7 correlated subqueries per row, plus `loadSupport`), **only to count open tasks**. Heaviest shell read. |
| proyectos / personas / biblioteca | — | capability checks (cached session) |
| asistente / ajustes | — | flags |
| (tramos list) | `loadTramos` → `listTramos` (`lib/tramos/compat.ts:51`) | 1 q |

**`components/shell/AppShell.tsx`**
- `renderSidebarSlots` (`:47-48`) mounts `SidebarSlotOutlet`, which calls `bandejaBadgeSlot.load` → `loadBandejaBadge` (`lib/shell/sidebar-slots/bandeja-badge.tsx:52`).
- That calls **`fetchNotificationsAction` and `fetchRemindersAction` again**, the same reads as the mi-espacio nav item: about 3 more q.
- `TimeClock` and `ClockInPrompt` take `today` from the layout (no extra server read).

**Shell total:** about 12–15 q plus a full task scan per render, in 3 waves (session → photo → nav and today).

**Client side of the shell**

| Component | What it does |
|---|---|
| `TimeClock` | `fetchMyTodayAction` on window focus and every 5 min (`components/shell/TimeClock.tsx:162,185-189`, `TIME_CLOCK_RESYNC_MS` `:46`); 1 s UI tick `:148-152`. Mutations: `clockInAction` / `pauseWorkAction` / `resumeWorkAction` / `clockOutAction` (`:218-223`), **no revalidation**; result shared through `publishTodayStatus`. |
| `ClockInPrompt` | `fetchMyTodayAction` resync (`components/shell/ClockInPrompt.tsx:122`), 15 s clock `:162`, `clockInAction` (`:193`), then `router.refresh()` (`:183`). |
| `CommandPalette` | debounced `searchWorkspaceAction` (`components/shell/CommandPalette.tsx:155-159`); `fetchMyTodayAction` each time it opens (`:174-177`); `clockInAction`, then `router.refresh()` (`:225-230`). |
| `AvatarMenu` | photo upload (`fetch` POST `/api/staff/me/photo`, `components/shell/photo-upload.ts:71`) or `removeMyPhotoAction` (`:115`), then `router.refresh()` (`:94`); `logoutAction`, then `router.push('/login')` and `router.refresh()` (`:127-130`). |
| `AppearanceProvider` | `updateMyPreferencesAction` (optimistic, debounced; `components/shell/AppearanceProvider.tsx:126,157-159`), no revalidation. |
| `EstiloSwitch` | `updateMyPreferencesAction({style})` (`components/shell/EstiloSwitch.tsx:65`). |
| `BandejaBadge` | client view; reads `useBandejaUnread` (a module store kept up to date only by the Inbox poll on `/mi-espacio`, `lib/my-space/bandeja-unread.ts`). **Stale on every other page.** |
| `AssistantLauncher` | lazy sheet plus a window event (`components/asistente/AssistantLauncher.tsx:20-34,52-82`). |

**Legacy redirect pages** (`app/(staff)/{configuracion/**,dashboard,mis-tareas,tablero,calendario,equipo,directorio,clientes,contratistas,profile,proveedores/*,recursos/**,actividades/[tramo]}`, each about 7 lines, `redirectLegacy`) sit under `(staff)`, so a hard hit on one runs the whole shell first. Moving them to `next.config` `redirects()` or the proxy saves about 15 q per hit.

### 1.1 `/inicio` (`app/(staff)/inicio/page.tsx`)

**Server, in order:**
1. `getResolvedAppearance` (cached)
2. `getSessionAccess` (cached)
3. `getFirstLoginState` (`lib/onboarding/first-login-server.ts:24-42`): `getOnboardingCompletedAt`, `resolveFirstLoginWizard`, `countGroupMappings`; about 3 q in sequence
4. `Promise.all([fetchInicioAction(), staffPhotoUrl(user.id)])` (`:46`). `staffPhotoUrl` **duplicates** the layout's photo read.

**`fetchInicioAction`** (`lib/actions/dashboard-actions.ts:119-262`) runs 7 reads in parallel (`:137-145`):

| Read | Cost |
|---|---|
| `tasksRepository.listTasks({archived:false, kind})` | **every** non-archived task, full rows, 7 correlated subqueries per row (`lib/repositories/tasks-repository.ts:343-417`) plus `loadSupport` with `inArray` of about 2,900 ids (`:273-288`) |
| `projectsRepository.listProjects` | 4 correlated subqueries per project, plus `loadStageRows` |
| `listTaskTrendSource` | 2–3 q |
| `inicioRepository.listStatusEvents('task', …)` | 1 q |
| `inicioRepository.listStatusEvents('project', …)` | 1 q |
| `staffRepository.listStaff` | 1 q |
| `remindersForDay` | 1 q |

Then CPU work: `dailySeries` × 5 KPIs over every task per day (`:174-180`), using `localIsoDate`, which builds a new `Intl.DateTimeFormat` per call (`lib/dashboard/task-trend.ts:34`), and `agendaSortKey` (`lib/dashboard/inicio.ts:424`). This is the 30 s; it is being fixed separately.

**Totals:** about 14–18 q.

**Payload:** an `InicioData` aggregate (`lib/types/redesign.ts:283`). Small and bounded. **Inicio already loads in one call.**

**Client:** `InicioClient` refreshes after the profile photo upload (`components/inicio/InicioClient.tsx:53`; the upload is `fetch` POST in `components/inicio/ProfilePhotoButton.tsx:67`). No other fetches.

**Invalidated by:** every task, project, status and reminder mutation. Its paths (`/dashboard`) are stubs, so today Inicio is never revalidated and only stays fresh because `staleTimes` re-renders it after 30 s.

### 1.2 `/tareas` (`app/(staff)/tareas/page.tsx`), plus `/tareas/[id]`, which redirects to `?tarea=`

**Server:**
1. `requireCapabilityUser`
2. `getResolvedAppearance`
3. `listTramos` (1 q), in sequence before the fan-out (`:65-70`)
4. `Promise.all` (`:95-102`):

| Read | Cost |
|---|---|
| `fetchTasksAction(base)` or `fetchMyTasksAction(base)` | **every task matching the filters except tramo and proyecto**, full `TaskListItem` (`Task` includes the description/`notes`). Shipped only so the client can compute the tramo chip counts and the Proyecto options (`components/tareas/TareasClient.tsx:156-187`). |
| `fetchBoardAction(viewFilters)` (vista=tablero, the **default** view) | `listBoard` → **a second full `listTasks`** grouped in JS (`tasks-repository.ts:1189-1202`) |
| `fetchCalendarAction` (vista=calendario) | another `listTasks` limited to the date range |
| `fetchAssignableStaffAction(tramoId)` | full `Staff` objects with `suggested` |
| `fetchTaskStatusesAction` (tablero) | 1 q |

**Totals:** about 8–10 q, two of them full task scans with 7 correlated subqueries per row.

**Payload:** about 2 × 2,900 full tasks (6.3 MB measured), tramos, staff and statuses. **No pagination or virtualization** in `RecordTable` (`components/widgets/RecordTable.tsx`), `TaskBoardWidget` or `TareasLista`.

**Every filter change is a full server render.** `TareasClient` writes the URL with `router.replace` (`:124-130`), including the debounced search (`:146-154`), so each change re-runs the page and ships 6.3 MB again.

**Client fetches:**

| Component | Fetches |
|---|---|
| `TaskSheet` (mounted over Tareas through `?tarea=`) | on each open, 5 action calls that run one after another: `fetchTaskAction` (`components/tareas/TaskSheet.tsx:367`), `fetchTaskStatusesAction` (`:383`), `fetchWorkflowsAction` (`:388`), `fetchAssignableStaffAction` (`:407`), `fetchProjectSpacesAction` (`:421`). `run()` refetches the task after every mutation (`:439-457`). |
| `TaskSubtasks` | `listSubtasksAction` (`components/tareas/TaskSubtasks.tsx:48,68`) |
| `TaskDependencies` | `listTaskDependenciesAction` (`components/tareas/TaskDependencies.tsx:125,146`) and **`fetchTasksAction({projectId})`, every task of the project, just for the dependency picker** (`:140`) |
| `NewTaskDialog` | `fetchProjectsAction({status:'activo'})` + `fetchWorkflowsAction` (`components/tareas/NewTaskDialog.tsx:99-102`); `fetchAssignableStaffAction` (`:133-136`) |
| `TareasCalendario` | `fetchCalendarAction` when the range leaves the loaded window (`components/tareas/TareasCalendario.tsx:147-152`); `syncGoogleCalendarAction({auto:true})` on mount (`:131-133`); 60 s "now" tick (`:396-398`) |
| `CalendarFeedDialog` | `fetchGoogleCalendarSyncStatusAction` (`components/calendario/CalendarFeedDialog.tsx:46,50`), `fetchCalendarFeedStatusAction` (`:148-151`) |
| `TareasStartSlot` (vista=lista) | `fetchTramoBoardAction` + `fetchAssignableStaffAction` through `lib/tramos/compat.ts:112-113` (`components/tareas/TareasStartSlot.tsx:62,69-77`); after a start, `router.replace` + `router.refresh()` (`:105,115`) |
| `StartTramoSheet` | `previewStartTramoAction` (`components/tareas/StartTramoSheet.tsx:124-135`) |

**`router.refresh()` calls:**
- `TareasTablero.tsx:74` (drag)
- `NewTaskDialog.tsx:195`
- `EventDetailPopover.tsx:116` (delete)
- `TareasStartSlot.tsx:115`

### 1.3 Proyectos

All task-scan costs come from `listTasks` above. Drive work happens on **every tab**.

Two helpers are involved:
- `loadProjectTabShell` (`lib/projects/project-tab-shell.ts:15-25,61-65`), used by Archivos, Clientes, Cronograma, Ficha and Tareas.
- `loadProjectResumen` (`lib/proyectos/project-resumen.ts`), used by Resumen.

Both compute the tab counts with:
- `getProject`: 2–3 q (8-relation `findFirst`, plus `loadStageRows`, plus `mondayImportOf` for admins; `lib/repositories/projects-repository.ts:251`);
- **a full `listTasks` just to count**;
- **all portal-access rows just to count**;
- **a full Drive `files.list` of the project root just for the Archivos count**: `getStaffFilesProject` + OAuth token (possibly refreshed over HTTP) + `listAll` (`lib/google/staff-files.ts:183`). This is the most expensive part of every tab.

| Route | Server calls (order) | ≈q | Payload | Client after mount | Refresh / reload |
|---|---|---|---|---|---|
| `/proyectos` (`page.tsx:48-62`) | appearance → user → `allSettled`[`fetchProjectsAction` (2 q, 4 correlated subqueries per project), `fetchProjectsPortfolioAction` (`listPortfolioRows`, 7 q, **loads every schedule task and payment of every project into Node** and runs `computeProgress` per project; `lib/repositories/projects-portfolio-repository.ts:33-89,182-203`), `fetchWorkflowsAction` (about 4 q, **used only for the `presaleAutoStart` boolean**, `:31-33`), `listTramos`, admin only `fetchContactsAction({type:'cliente'})` + `fetchStaffAction` (only for the create dialog)] | 14 / 17 | **all** `ProjectListItem`s plus all `PortfolioRow`s (unbounded); admin: all clients and staff | search and filter on the client | `submitProjectCreateAction` (`components/proyectos/ProjectsPortfolio.tsx:126`) + `updateProjectAction` (`:132`), then `router.push` |
| `/proyectos/[id]` Resumen (`page.tsx:48-53` → `project-resumen.ts:81-107`) | `getProject`, then parallel: `fetchTasksAction({projectId})` (counts only), **`fetchProjectsPortfolioAction()` for every project, then `.find()` one** (`:59-63`), `fetchScheduleAction` (6 q), root Drive listing, spaces (2 q), **`fetchStaffAction` (all staff, for an email/puesto map)**, tramo catalog, `listProjectPortalAccessAction().length` | 24–26 + Drive | full `ProjectDetail`, every schedule task (payments for admins only, `:135`), every root Drive item, **every staff member's email**, spaces, tramos, stats | `ProjectSummary` `useMemo(…, [props])` never hits (`components/proyectos/ProjectSummary.tsx:53`) | — |
| `/proyectos/[id]/archivos` | params → user and appearance → `getStaffFilesProject` + `listStaffProjectFiles`, **then** `loadProjectTabShell` (with `?folder=` it **lists the Drive root a second time**, `project-tab-shell.ts:65,115`) | 7–9 + 1–2 Drive | full folder listing (unbounded `listAll`) | folder navigation is `?folder=` links, so each click is a full server render (`lib/projects/project-files-view.ts:90`) | `retryProjectFolderAction` (`components/proyectos/ProjectFilesBrowser.tsx:140`), then `router.refresh()` (`:145`) |
| `/proyectos/[id]/clientes` | capabilities → [`listProjectPortalAccessAction`, `listInvitablePortalContactsAction` (≤4 q, one after another; `lib/repositories/portal-contacts-repository.ts:22-48`)] → `loadProjectTabShell` | 10–12 + Drive | all access rows (revoked included), invitable contacts | `PortalActivityCard` → `listProjectPortalActivityAction` (`components/proyectos/PortalActivityCard.tsx:29-31`); `PortalClientFolderHint` → `getProjectClientFolderUrlAction` (`components/proyectos/PortalClientFolderHint.tsx:19-21`) | `PortalAccessPanel.run()` **always** calls `router.refresh()` (`components/proyectos/PortalAccessPanel.tsx:147`), even after an error and after `resendPortalInviteAction` (which doesn't revalidate); `onInvited` → `router.refresh()` (`:260`) |
| `/proyectos/[id]/cronograma` | **fully sequential:** params → `fetchScheduleAction` (6 q; `lib/repositories/schedule-repository.ts:20-29`) → appearance → searchParams → user → `loadProjectTabShell` | 11–12 + Drive | full `CronogramaData`, **payments included for non-admins**; `getScheduleForProject` doesn't check `deleted_at` or viewer scope (`schedule-repository.ts:21`) | fallback fetch and `loadSchedule` (`components/cronograma/cronograma-view.tsx:50-84`); **`?week=` uses `router.push`, so a full server render for client-only state** (`components/cronograma/cronograma-header.tsx:39`) | `loadSchedule` after imports. **Probable bug:** optimistic status/flag changes (`:109,128`) never update `view` (`useState(initialView)`, `:43`), so the old value may come back. Needs a browser check. |
| `/proyectos/[id]/cronograma/reporte` | `fetchScheduleAction` only | 6 | same unbounded schedule, payments included | — | — |
| `/proyectos/[id]/ficha` | user → `loadProjectTabShell` (only renders the tabs) | 6 + Drive | none | **`reload()` = `Promise.all` of 7 actions that run one after another** (`app/(staff)/proyectos/[id]/ficha/ProjectFichaClient.tsx:137-174`): `fetchProjectAction` (repeats the shell), `fetchTasksAction` (repeat), `fetchStaffAction`, **`fetchContactsAction()` (every contact of every type, with people, tags and provider profiles)**, `fetchWorkflowsAction` (full), `fetchProjectSpacesAction`, admin only `fetchAdminTasksAction`. Plus `fetchProjectHistoryAction` (`components/proyectos/ProjectBitacoraCard.tsx:23-35`, unbounded), `getImportDataAction` (`components/ui/ImportDataPanel.tsx:216`), `getMondayRemapAction` (`components/proyectos/RemapImportSheet.tsx:226,243`). About 17–19 q in 9 queued POSTs. | full `reload()` after every save (`:244-300`, `:466`, `:602`) |
| `/proyectos/[id]/tareas` | params → appearance → user → [`loadProjectTabShell` (**a `listTasks` to count**), `fetchTasksAction({projectId, kinds})`]: **two scans of the same tasks** | 9–10 + Drive | all project tasks, full `TaskListItem` | estado chips and the responsable select change the URL, so a full server render (`components/proyectos/ProjectTasksByFase.tsx:106,125`); `NewTaskDialog` fetches as in 1.2 | `router.refresh()` **whenever the dialog closes, even with no changes** (`:117`) |

### 1.4 Personas

| Route | Server calls | ≈q | Payload | Client after mount | Refresh |
|---|---|---|---|---|---|
| `/personas` (`page.tsx:31-36`) | parallel: `fetchStaffAction` (`listStaff` + positions, 3 q); `fetchPeopleOverviewAction` (`people-actions.ts:164-200`: `listActiveStaffRows`, **the staff table read a second time**, then open tasks 2 q, active projects 3 q, absences 1 q, `getTimeTrackingSettings` → `weekHours` 2 q in sequence); `listTramos`; `fetchPositionsAction` (1 + 3 q). **Then, sequential:** `loadPersonasTabCounts` → **`fetchContactsAction()`, the full contacts table with relations, only for `.length`** (`lib/personas/tab-counts.ts:15-21`) | about 18 in 3 waves | `PersonDatum[]` (headcount), emails, counts, `Position[]` | none | `useMemberEditor` save = up to **4 sequential POSTs**: `createStaffAction` / `updateStaffAction`, `upsertStaffProfileAction`, `setStaffPositionsAction`, `setStaffCredentialAction` (`lib/equipo/use-member-editor.ts:279-336`). Each revalidates the stub `/equipo`; then `router.refresh()` (`components/personas/EquipoView.tsx:43`). `recheckStaffAccessAction` (`components/equipo/RecheckAccessButton.tsx:29`), then `router.refresh()` (`EquipoView.tsx:90`). |
| `/personas/{clientes,contratistas,proveedores}` (`lib/personas/contacts-page.server.ts:27-62`) | parallel: `fetchContactsAction()` (**every type**, unbounded), `fetchStaffAction()` (**only to count the Equipo tab**) | about 4 | `PersonasContact[]` of every type; tab, subfilter and search are applied on the client (`components/personas/PersonasContacts.tsx:139-143`) | `ContactEditorSheet` **always mounted, even closed: `fetchStaffAction` on mount** (`components/directorio/ContactEditorSheet.tsx:215-217`). `?contacto=`: `fetchContactAction` (`PersonasContacts.tsx:115-128`); opening a sheet uses `router.push`, so a full server reload **and** the client fetch (`:208`). `fetchContactHistoryAction` (`components/directorio/ClientDetailSheet.tsx:67-75`) then `getImportDataAction`. `openEdit` → `fetchContactAction` (`:155`). | `create` / `update` / `deleteContactAction` (`:176,179,193`; revalidate stub `/directorio`), then `router.refresh()` (`:183,197`) |
| `/personas/equipo/[id]` | `fetchPersonaDetailAction` (`people-actions.ts:79-161`): `getStaffRow`, then 7 in parallel (positions, tasks, projects, photo, absences, settings → hours, `listRecentActivity` 2 + 1 q) | about 15 in 3 waves | one `PersonaDetail` (activity capped at 10) | none | none |

### 1.5 Mi espacio / Bandeja

`/mi-espacio/notas/[id]` only redirects to `?nota=`.

**Server, `/mi-espacio` (`page.tsx:47-53`), in parallel:**

| Read | Cost | Notes |
|---|---|---|
| `fetchNotificationsAction({})` | 31 rows + count, 2 q | **repeats the layout badge's read** |
| `loadGmail()` | `fetchGmailStatusAction` → `fetchGmailThreadsAction`, in sequence; 2 + 3 q | `loadGmailAccess` runs twice (`gmail-actions.ts:184,200`) |
| `fetchRemindersAction(today..tomorrow)` | 1 q | up to 500 rows |
| `fetchChecklistsAction` | 1 + 1 q | |
| `fetchNotesAction` | 1 q | |

- About 11 q, plus about 3 for the badge.
- Payload: 30 notifications, 30 threads, ≤500 reminders, **checklists with all items (unbounded)**, **every note with full bodies up to 20,000 characters (unbounded)**.

**Client:**
- **Poll:** `setInterval(poll, 60_000)` while the page is visible, calling `fetchNotificationsAction({unreadOnly:true})` and `publishBandejaUnread` (`components/mi-espacio/Inbox.tsx:75,181,185-233`).
- Load more: `fetchNotificationsAction({cursor})` (`:311`), `fetchGmailThreadsAction({cursor})` (`:321`).
- **`fetchProjectsAction({})`, the full portfolio, just to resolve name chips**, loaded twice: `Inbox.tsx:239-252` and `GmailReader.tsx:140-154`.
- `GmailReader`: `fetchGmailThreadAction` (`components/mi-espacio/GmailReader.tsx:59-70`; a live Gmail API call that marks the thread read **and revalidates the layout**).
- `ReminderDialog`: debounced `parseReminderTextAction` (`components/mi-espacio/ReminderDialog.tsx:111-125`) and `searchWorkspaceAction` (`:312-330`).
- After QuickCapture: `fetchNotesAction` / `fetchChecklistsAction` / `fetchRemindersAction` (`components/mi-espacio/MiEspacioClient.tsx:96-106`). This is a **third** load, after the action's revalidation already re-rendered the page.

**Mutations:** every `my-space-actions.ts` write calls `revalidatePath('/mi-espacio')` (`:19-21`), so **each checkbox toggle re-renders the route and layout, about 15–20 q**.

### 1.6 Biblioteca

| Route | Server | Payload | Client / mutations |
|---|---|---|---|
| `/biblioteca`, `/biblioteca/[seccion]`, `/biblioteca/empresa/[doc]` | `loadBibliotecaData()` → `fetchResourceLinksAction()` → `listResourceLinks()`: 1 q with 3 joins, **every section and everyone's personal links**, filtered in JS (`lib/biblioteca/load.ts:27-42`) | index and section ship every visible link; the section filters on the client (`components/biblioteca/BibliotecaSection.tsx:84`) | favorites: `deleteResourceLinkAction` / `createResourceLinkAction` (`BibliotecaSection.tsx:105,108`), revalidating stub `/recursos`. `useState(links)` never resyncs (`:73`). **`DocumentReader.tsx:6` statically imports `AssistantSheet`**, pulling in `@ai-sdk/react`, `react-markdown`, `remark-gfm` and `recharts`, and mounts a second `useChat` (`:48,208`). Drive status: `fetch('/api/google/drive/status')` (`lib/google/use-drive-enabled.ts:12-14`). |
| `/biblioteca/vacaciones` | **3 waves:** `loadMisVacaciones` [`fetchMyVacationsAction` (4 q), `fetchTeamAbsencesAction`, `fetchResourceLinksAction({section})`] → `<VacationDeciders/>`, an async RSC (`components/biblioteca/VacationDeciders.tsx:14-15`) → `fetchPendingVacationRequestsAction` → `fetchVacationSettingsAction` (`lib/vacations/decider-sections.ts:32,41`). About 9 q. | current-year vacations, month absences, pending requests, settings | `reload()` = `fetchMyVacationsAction` then `fetchTeamAbsencesAction` after each mutation (`components/biblioteca/MisVacacionesClient.tsx:45-60`); `requestVacationAction` (`VacationForm.tsx:68`), `cancelVacationRequestAction` (`VacationHistory.tsx:56`), `decideVacationAction` (`TeamRequests.tsx:118`), then `router.refresh()` (`:122,126`); `saveVacationSettingsAction` (`VacationSettings.tsx:134`), then `router.refresh()` (`:138`) |

### 1.7 Asistente

**`/asistente` (`app/(staff)/asistente/page.tsx:26-29`)**
- `getSession`, then `fetchAssistantThreadsAction` (≤50) in parallel with an optional `fetchAssistantThreadAction`.
- The thread read is **unbounded**: every message, with its full `parts` JSON (`assistant-repository.ts:55-61`).
- About 3 q.

**Client (`components/asistente/AsistentePageClient.tsx`):**
- `selectThread` calls `fetchAssistantThreadAction` (`:77`), **then `router.replace('?thread=')` (`:79`)**. The replace re-runs the RSC, which loads the list and the thread again; the result is then ignored.
- `startNewConversation` calls `router.replace` (`:91`).
- `onTurnFinished` calls `router.replace` (`:109`) and `fetchAssistantThreadsAction` (`:110`), so the list loads twice per turn.
- `deleteAssistantThreadAction` (`:98`) revalidates `/asistente`.

**Other client pieces:**
- `AssistantSheet`: `fetchAssistantThreadAction` (`components/asistente/AssistantSheet.tsx:163,176`), `fetchAssistantThreadsAction` when the dropdown opens (`:267-272`).
- `use-confirmed-context.ts:19-60`: `fetchTaskAction`, **`fetchStaffDetailAction` (full detail including the PII profile, used only for a label)**, `fetchProjectAction`.

**Chat route (`app/api/asistente/chat/route.ts:162-311`):**
- Loads the full history (`:184`).
- **Upserts the entire history twice per turn** (`:234,281`).
- Runs `recordProposedAction` / `recordActionDecision` serially in a loop (`:206-232`).
- Tools that write data (tasks, notes, reminders, clock, email, events, portal) can't update the open page, so screens stay stale.

### 1.8 Ajustes

**Layouts**
- `ajustes/layout.tsx`: `requirePageCapability(() => true)` + `resolveAjustesSegments` (pure), 0 extra q.
- Each `(admin)/*/layout.tsx`: `guardAjustesSegment(cap)` (`lib/auth/ajustes-segment-guard.ts:13`), 0 q.
- google, primeros-pasos, monday, puestos and tramos also call `requireSettingsAdminPage()`, a duplicate guard.
- `ajustes/page.tsx` redirects to `/ajustes/apariencia`.

| Page | Server | ≈q | Client fetch | Mutations (call site) → today's refresh |
|---|---|---|---|---|
| estatus | `fetchTaskStatusesAction` | 1 | **refetches the same list on mount** (`components/configuracion/useTaskStatusesEditor.ts:55-58`) and after each mutation (`:99,113`) | `create`/`update`/`deleteTaskStatusAction` (`:93,87,112`), revalidating stub `/configuracion/estatus` + `/actividades`. **`/tareas` is never revalidated.** |
| general | `fetchGeneralSettingsAction` (**repeats the root layout's read**) | 1 | — | `saveGeneralSettingsAction` / `restoreGeneralSettingsAction` (`components/configuracion/use-general-settings-editor.ts:176,194`) revalidate `/` layout, **then `router.refresh()` (`:183,200`)** |
| google (and primeros-pasos) | [`listGroupMappingsAction`, `fetchPositionsAction` (4 q)], **then** `getGoogleHealthAction` (4 q) (`page.tsx:21,30`) | about 9 | — | `create`/`update`/`deleteGroupMappingAction` (`components/configuracion/GoogleGroupMappings.tsx:126-127,147`), then `router.refresh()` (`:134,151`); `GoogleSetupWizard.tsx:103`, then `refresh` (`:114`); `completeOnboardingAction` (`:196`); `ensureMissingProjectFoldersAction` (`components/configuracion/ProjectFoldersBackfill.tsx:45`, creates Drive folders serially), then `refresh` (`:46`) |
| horario | [`fetchTimeTrackingSettingsAction`, `fetchTeamHoursAction({weekStart})` (`teamHoursReport`: 3 sequential q)]; the setting is **read 3×** per request | about 6 | — | `saveTimeTrackingSettingsAction` (`components/ajustes/HorarioClient.tsx:86`) revalidates `/` layout, then `router.refresh()` (`:90`) |
| monday | parallel [`getMondayImportStatusAction`, **`openMondayImportRunAction(false)` (writes during GET; repeats `getRunState`)**, `getMondayImportChoicesAction` (3 q)], **then** `getMondayImportHistoryAction` | 10+ | on mount: `getMondayExportSourceAction`, `getMondayImportedProjectsAction`, `checkMondayRollbackAction`; per step: `getMondayImportOptionsAction`, `previewMondayImportAction`; **`setInterval` every 2 s → `getMondayImportRunAction`** (`components/configuracion/monday-import/MondayImportWizard.tsx:63,165-173,221-268,305,507`) | Wizard: `save…Step` / `startMondayExport` / `startMondayApply` / `startMondayRollback` / `saveMondayMappingDraft` / `uploadMondayMapping` / `openMondayImportRun(true)` / `completeOnboarding` (`:300-498`). Elsewhere: `connectMondayAction` (`ConnectStep.tsx:38`); `suggestMondayPosition` / `createMondayStaff` (`CreateStaffButton.tsx:55,82`); `createTaskStatusAction` and `saveMondayStatusMapAction` (`StatusMapTable.tsx:75,225,258`). Apply and rollback revalidate **nothing when they finish**. |
| permisos | `fetchStaffAction({includeInactive:true})` | about 3 | **refetches the whole staff list on every window `focus` and `storage` event** (`components/configuracion/usePermissionsWorkspace.ts:137-166`) | the matrix is saved to **localStorage only** (`:97,220`); it does not persist across browsers. Flag to the product owner. |
| puestos | [`fetchPositionsAction`, `fetchWorkflowsAction()` (about 5 q in 3 waves; reads all `workflow_phases` unfiltered, `lib/repositories/workflows-repository.ts:98-131`)] | about 9 | **refetches both on mount** (`app/(staff)/ajustes/(admin)/puestos/PuestosClient.tsx:87-90`) and after each mutation (`:125,146,162`) | `create`/`updatePositionAction` → `setPositionPhasesAction` in sequence (`:119-124`); `deletePositionAction` (`:144`); `reorderPositionsAction` (`:158`, optimistic) |
| tema | `fetchOrgAppearanceAction` (cached) | 0 | — | `saveOrgAppearanceAction` / `resetOrgAppearanceAction` (`components/ajustes/ThemeEditor.tsx:108,123`) revalidate `/` layout, then `router.refresh()` (`:112,129`) |
| tramos | `fetchWorkflowsAction({include…})` | about 5 | `refresh()` = `fetchWorkflowsAction` after every mutation (`app/(staff)/ajustes/(admin)/tramos/TramosClient.tsx:159-175`) | `setWorkflowAutoStartAction` (`:182`), `updateWorkflowPhaseAction` (`:203`), `reorderWorkflowPhasesAction` (`:209`), `create`/`updateTemplateAction` (`:244-246`), `deactivateTemplateAction` (`:264`), `reorderTemplatesAction` (`:277`), `create`/`updateWorkflowPhaseAction` (`components/configuracion/PhaseEditorDrawer.tsx:49-50`) |
| apariencia | [`fetchMyPreferencesAction` (**repeats `getResolvedAppearance`'s row**), `fetchOrgAppearanceAction`] | 1 | — | `AppearanceProvider.setPreference` → `updateMyPreferencesAction`; text size is **debounced twice** (`components/ajustes/AparienciaClient.tsx:173` + `AppearanceProvider.tsx:157-159`) |
| integraciones | [`fetchGmailStatusAction`, **`getPickerDriveStatus` (may refresh OAuth token over HTTP during render)**] | 2–4 | `fetchGmailStatusAction` after sync or disconnect (`components/ajustes/IntegracionesClient.tsx:178`) | `syncGmailAction` (`:192`), `disconnectGmailAction` (`:209`) |
| notificaciones | `fetchNotificationPreferencesAction` (2 q) | 2 | — | `updateNotificationPreferencesAction` (`components/ajustes/NotificacionesClient.tsx:147`). **Bug:** the page renders its own `PageHeader` + `AjustesNav` inside the layout that already renders them (`page.tsx:32-36`), so they show twice. |
| perfil | [`staffRepository.getStaff` (about 4 q), `getStaffPhotoUrl` (**repeats the layout read**), `loadWeekHours` = `fetchMyTodayAction` (**repeats the layout read**) → `fetchMyWeekHoursAction`] | about 10 | — | photo `fetch`, then `router.refresh()` (`components/ajustes/PerfilClient.tsx:120`); `removeMyPhotoAction` (`:133`), then refresh (`:136`); `updateStaffAction` (`:235`) + `upsertStaffProfileAction` (`:242`), then refresh (`:248`); `changePasswordAction` (`:413`) |

### 1.9 Portal

| Route | Server | ≈q | Client |
|---|---|---|---|
| `app/portal/layout.tsx:34` | root layout (`getResolvedAppearance`: 1 q) + parallel [`getPortalUser` (**not cached**; 1 q plus a daily write that extends the session), `getPortalAppearance`, `getPortalPresentation` → `getPortalStylePolicy`]. **`appearance.theme` is read 3× per request.** **Bug:** `StyleProvider` is not given `fixedByOrg` (`:43`); staff `AppShell.tsx:124` has the same omission. | about 5 | — |
| `/portal` | `requirePortalUser` (**session queried again**), `listPortalProjects` (1 q) | 5–6 | — |
| `/portal/proyectos/[id]` | `requirePortalUser` → `requireProjectAccess` → parallel [`getPortalProject` (**repeats the visibility join**), `getPortalSchedule` (2 q in sequence), `getPortalProjectTramos` (2 q in sequence, **re-checks visibility**), `loadSharedDocuments` (Drive, 60 s memory cache)] | about 10 + Drive | `PortalFileBrowser` `fetch GET /api/portal/projects/[pid]/files?folder` (`components/portal/PortalFileBrowser.tsx:93-120`), download `fetch` (`:133`); `PortalUploader` `fetch GET …/uploads` (`components/portal/PortalUploader.tsx:168,185`), XHR upload (`:107`), then reload (`~:211`) |
| `/portal/login`, `/portal/acceder`, `/portal/[...missing]` | no data; `PortalLoginForm` `fetch POST /api/portal/auth/link` (`:40`); acceder posts a native form | — | keep as RSC and route handlers |

---

## 2. Every client-side fetch path

### 2a. `fetch(` / XHR from client code

| file:line | Request |
|---|---|
| `components/inicio/ProfilePhotoButton.tsx:67` | POST `/api/staff/me/photo` |
| `components/shell/photo-upload.ts:71` | POST `/api/staff/me/photo` |
| `lib/profile-photo/reencode.ts:57` | POST `/api/staff/me/photo` |
| `components/recursos/DriveBrowser.tsx:75` (effect `:87-89`) | GET `/api/google/drive/status` |
| `components/recursos/DriveBrowser.tsx:105` (350 ms debounce `:133`) | GET `/api/google/drive/list` |
| `lib/google/use-drive-enabled.ts:14` (effect `:12`; used by DriveLinksEditor, BibliotecaSection, DocumentReader, ResourcePreview, DrivePickerDialog) | GET `/api/google/drive/status` |
| `components/portal/PortalLoginForm.tsx:40` | POST `/api/portal/auth/link` |
| `components/portal/PortalFileBrowser.tsx:100,133` | files list and download |
| `components/portal/PortalUploader.tsx:168,107` | uploads GET, XHR POST |
| `components/asistente/AssistantChat.tsx:60-62` | `useChat` → POST `/api/asistente/chat` |

### 2b. Server actions called to load data from effects, transitions or refetch helpers

**Shell**
- `components/shell/CommandPalette.tsx:159` (`searchWorkspaceAction`), `:177` (`fetchMyTodayAction`)
- `components/shell/ClockInPrompt.tsx:122`
- `components/shell/TimeClock.tsx:162`

**Tareas**
- `components/tareas/TaskSheet.tsx:367,383,388,407,421,439`
- `components/tareas/TaskSubtasks.tsx:48,68`
- `components/tareas/TaskDependencies.tsx:125,140,146`
- `components/tareas/NewTaskDialog.tsx:102,136`
- `components/tareas/TareasCalendario.tsx:152`
- `components/tareas/TareasStartSlot.tsx:62,77`
- `components/tareas/StartTramoSheet.tsx:135`
- `components/calendario/CalendarFeedDialog.tsx:46,151`

**Proyectos**
- `app/(staff)/proyectos/[id]/ficha/ProjectFichaClient.tsx:140-146`
- `components/proyectos/ProjectBitacoraCard.tsx:25`
- `components/proyectos/PortalActivityCard.tsx:31`
- `components/proyectos/PortalClientFolderHint.tsx:21`
- `components/proyectos/RemapImportSheet.tsx:226`
- `components/ui/ImportDataPanel.tsx:216`
- `components/cronograma/cronograma-view.tsx:52,67`

**Personas**
- `components/personas/PersonasContacts.tsx:118,155`
- `components/directorio/ClientDetailSheet.tsx:69`
- `components/directorio/ContactEditorSheet.tsx:216`
- `lib/equipo/use-member-editor.ts:155` (`fetchStaffDetailAction`)

**Mi espacio**
- `components/mi-espacio/MiEspacioClient.tsx:99-101`
- `components/mi-espacio/Inbox.tsx:192,242,311,321`
- `components/mi-espacio/GmailReader.tsx:61,143`
- `components/mi-espacio/ReminderDialog.tsx:116,320`

**Biblioteca**
- `components/biblioteca/MisVacacionesClient.tsx:48,54`

**Asistente**
- `components/asistente/AssistantSheet.tsx:163,176,269`
- `components/asistente/AsistentePageClient.tsx:66,77`
- `components/asistente/use-confirmed-context.ts:22,26,33`

**Ajustes**
- `components/configuracion/useTaskStatusesEditor.ts:52`
- `app/(staff)/ajustes/(admin)/puestos/PuestosClient.tsx:79`
- `app/(staff)/ajustes/(admin)/tramos/TramosClient.tsx:161`
- `components/configuracion/usePermissionsWorkspace.ts:149`
- `components/ajustes/IntegracionesClient.tsx:178`
- `components/configuracion/monday-import/MondayImportWizard.tsx:165,172-173,252,268,305,507`
- `components/configuracion/monday-import/CreateStaffButton.tsx:55`

### 2c. Polling and intervals that fetch

No `EventSource` or `WebSocket` exists.

| file:line | Interval | Calls |
|---|---|---|
| `components/mi-espacio/Inbox.tsx:211` | 60 s, while visible | `fetchNotificationsAction({unreadOnly})` |
| `components/configuracion/monday-import/MondayImportWizard.tsx:237` | 2 s, while a job runs | `getMondayImportRunAction` |
| `components/shell/TimeClock.tsx:189` | 5 min, plus focus | `fetchMyTodayAction` |

UI-only timers (no fetch): `TimeClock.tsx:151-152`, `ClockInPrompt.tsx:162`, `TareasCalendario.tsx:398`, `lib/shell/sidebar-slots/bandeja-badge-view.tsx:39`, `PortalLoginForm.tsx:72`, `PortalFileBrowser.tsx:150`; debounces at `TareasClient.tsx:149`, `AppearanceProvider.tsx:159`, `AparienciaClient.tsx:173`, `StatusMapTable.tsx:247`, `InvitePortalClientSheet.tsx:134`.

### 2d. `router.refresh()`: 35 real calls

Four more grep hits are only comments: `AppRouteGuard.tsx:88,95`, `MiEspacioClient.tsx:52`, `lib/settings/use-general-settings.ts:14`.

| # | file:line | After | Route |
|---|---|---|---|
| 1 | `components/inicio/InicioClient.tsx:53` | photo POST | /inicio |
| 2 | `components/shell/CommandPalette.tsx:230` | `clockInAction` | shell |
| 3 | `components/shell/ClockInPrompt.tsx:183` | `clockInAction` | shell |
| 4 | `components/shell/AvatarMenu.tsx:94` | photo upload / `removeMyPhotoAction` | shell |
| 5 | `components/shell/AvatarMenu.tsx:130` | `logoutAction` | shell |
| 6 | `components/tareas/TareasTablero.tsx:74` | `setTask(Custom)StatusAction` (drag) | /tareas tablero |
| 7 | `components/tareas/NewTaskDialog.tsx:195` | `createUserTask` → status → `createSubtask` | /tareas, /proyectos/[id]/tareas, /mi-espacio |
| 8 | `components/tareas/EventDetailPopover.tsx:116` | `deleteTaskAction` | /tareas calendario |
| 9 | `components/tareas/TareasStartSlot.tsx:115` | `startTramoAction` / undo | /tareas lista |
| 10 | `components/proyectos/ProjectTasksByFase.tsx:117` | dialog close | /proyectos/[id]/tareas |
| 11 | `components/proyectos/PortalAccessPanel.tsx:147` | resend / enable / revoke / disable | /proyectos/[id]/clientes |
| 12 | `components/proyectos/PortalAccessPanel.tsx:260` | `invitePortalClientAction` | /proyectos/[id]/clientes |
| 13 | `components/proyectos/ProjectFilesBrowser.tsx:145` | `retryProjectFolderAction` | /proyectos/[id]/archivos |
| 14 | `components/personas/PersonasContacts.tsx:183` | create / update contact | /personas/* |
| 15 | `components/personas/PersonasContacts.tsx:197` | delete contact | /personas/* |
| 16 | `components/personas/EquipoView.tsx:43` | member editor save | /personas |
| 17 | `components/personas/EquipoView.tsx:90` | `recheckStaffAccessAction` | /personas |
| 18 | `components/biblioteca/VacationSettings.tsx:138` | `saveVacationSettingsAction` | /biblioteca/vacaciones |
| 19 | `components/biblioteca/TeamRequests.tsx:122` | `decideVacationAction` | /biblioteca/vacaciones |
| 20 | `components/biblioteca/TeamRequests.tsx:126` | same, stale-error path | /biblioteca/vacaciones |
| 21 | `components/configuracion/GoogleSetupWizard.tsx:114` | `createGroupMappingAction` | /ajustes/google/primeros-pasos |
| 22 | `components/configuracion/GoogleGroupMappings.tsx:134` | create / update mapping | /ajustes/google |
| 23 | `components/configuracion/GoogleGroupMappings.tsx:151` | delete mapping | /ajustes/google |
| 24 | `components/configuracion/ProjectFoldersBackfill.tsx:46` | `ensureMissingProjectFoldersAction` | /ajustes/google |
| 25 | `components/ajustes/HorarioClient.tsx:90` | `saveTimeTrackingSettingsAction` | /ajustes/horario |
| 26 | `components/configuracion/use-general-settings-editor.ts:183` | save general | /ajustes/general |
| 27 | `components/configuracion/use-general-settings-editor.ts:200` | restore general | /ajustes/general |
| 28 | `components/ajustes/ThemeEditor.tsx:112` | save org theme | /ajustes/tema |
| 29 | `components/ajustes/ThemeEditor.tsx:129` | reset org theme | /ajustes/tema |
| 30 | `components/ajustes/PerfilClient.tsx:120` | photo upload | /ajustes/perfil |
| 31 | `components/ajustes/PerfilClient.tsx:136` | `removeMyPhotoAction` | /ajustes/perfil |
| 32 | `components/ajustes/PerfilClient.tsx:248` | `updateStaff` + `upsertStaffProfile` | /ajustes/perfil |
| 33 | `components/auth/AppRouteGuard.tsx:98` | session re-check on guard redirect | all |
| 34 | `components/auth/use-credentials-login.ts:80` | `loginAction` | /login |
| 35 | `components/auth/use-change-password.ts:69` | `completeFirstAccessAction` | /change-password |

Rows 33–35 (auth) should stay.

### 2e. `revalidatePath` (no `revalidateTag`, `updateTag` or `unstable_cache` anywhere)

⚠ marks a target that only redirects.

| Target | Where |
|---|---|
| `('/','layout')` | `org-appearance-actions.ts:44,64`; `staff-actions.ts:120`; `time-tracking-actions.ts:77`; `profile-photo-actions.ts:19`; `app-settings-actions.ts:27,36`; `lib/auth/auth-actions.ts:37,43,80,111`; `app/api/staff/me/photo/route.ts:75` |
| `/tareas` | `tasks-actions.ts:55`; `gmail-actions.ts:391` |
| `/tablero`⚠, `/calendario`⚠ | `tasks-actions.ts:56-57`; `projects-actions.ts:45,66`; `tramo-start-actions.ts:47,49` |
| `/proyectos/${id}/ficha` | `tasks-actions.ts:58`; `projects-actions.ts:37,292`; `tramo-start-actions.ts:42`; `monday-import-actions.ts:436` |
| `('/actividades','layout')`⚠ | `tasks-actions.ts:431`; `projects-actions.ts:43,64,294`; `tramo-start-actions.ts:39`; `task-statuses-actions.ts:12`; `workflows-actions.ts:48,106`; `monday-import-actions.ts:437` |
| `/dashboard`⚠ | `tasks-actions.ts:432`; `projects-actions.ts:44,65`; `tramo-start-actions.ts:46`; `monday-import-actions.ts:439`; `onboarding-actions.ts:23` |
| `/mis-tareas`⚠ | `tramo-start-actions.ts:48` |
| `/proyectos` | `projects-actions.ts:36`; `tramo-start-actions.ts:41`; `monday-import-actions.ts:438`; `workflows-actions.ts:47`; `workspace-access-actions.ts:208` |
| `('/proyectos','layout')` | `tramo-start-actions.ts:44`; `projects-actions.ts:293` |
| `('/proyectos/${id}','layout')` | `gmail-actions.ts:53` |
| `/proyectos/${id}/cronograma` | `schedule-actions.ts:39` |
| `('/proyectos/[id]/clientes','page')` | `portal-actions.ts:82` |
| `/mi-espacio` | `my-space-actions.ts:20`; `notifications-actions.ts:125`; `lib/assistant/tools/correo.ts:301` (no effect from a route handler) |
| `('/mi-espacio','layout')` | `gmail-actions.ts:49` |
| `/ajustes/perfil` | `staff-actions.ts:154` |
| `/ajustes/horario` | `time-tracking-actions.ts:78` |
| `/ajustes/integraciones` | `gmail-actions.ts:409` |
| `/ajustes/notificaciones` | `notifications-actions.ts:152` |
| `/equipo`⚠ | `staff-actions.ts:71,118,130,140,161,174,187,214`; `positions-actions.ts:31`; `workspace-access-actions.ts:182,185` |
| `/configuracion/puestos`⚠ | `staff-actions.ts:215`; `positions-actions.ts:30`; `workflows-actions.ts:46`; `workspace-access-actions.ts:65` |
| `/configuracion/estatus`⚠ | `task-statuses-actions.ts:11` |
| `/configuracion/{tramos,workflows}`⚠ | `workflows-actions.ts:44-45,81,91,101,105` |
| `/configuracion/google`⚠ | `positions-actions.ts:64`; `workspace-access-actions.ts:64,207` |
| `/configuracion/importar-monday`⚠ | `monday-import-actions.ts:401` |
| `/biblioteca/vacaciones` | `vacations-actions.ts:219,241,281,332` |
| `/personas` | `vacations-actions.ts:282` |
| `/recursos`⚠ | `resources-actions.ts:26` |
| `/directorio`⚠ | `contacts-actions.ts:28` |
| `/asistente` | `assistant-actions.ts:74,93` |

---

## 3. Mutation server actions used from the UI, by domain

The **Invalidates** column uses the query keys from §4.2. "RV" is what the action revalidates today.

### Tasks (`lib/actions/tasks-actions.ts`; RV `revalidateTareas` `:54-59`)

| Action:line | Caller(s) | Invalidates |
|---|---|---|
| `createUserTaskAction:103` | `NewTaskDialog.tsx:163` | `tareas.list*`, `tareas.facets`, `tareas.board*`, `tareas.calendar*`, `proyectos.tab(pid,'tareas')`, `proyectos.shell(pid)`, `proyectos.resumen(pid)`, `proyectos.list`, `inicio`, `shell.badges` |
| `createSubtaskAction:125` | `NewTaskDialog.tsx:185`, `TaskSubtasks.tsx:66` | same as above + `tasks.detail(parent)`, `tasks.subtasks(parent)` |
| `updateTaskAction:152` | `TaskSheet.tsx:526,546` | `tasks.detail(id)` (setQueryData from the result) + lists, board, calendar, project tab, `inicio` |
| `setTaskStatusAction:170` / `setTaskCustomStatusAction:339` | `TaskSheet.tsx:532`, `TareasTablero.tsx:45-46`, `NewTaskDialog.tsx:177-178` | **optimistic `setQueryData` on `tareas.board(filters)`**; then `tasks.detail`, `tareas.list*`, `tareas.facets`, project tab and resumen, `proyectos.cronograma(pid)`, `inicio`, `shell.badges` |
| `assignTaskAction:181` | `TaskSheet.tsx:665` | `tasks.detail` + lists + `inicio` (workload) + `shell.badges` |
| `deleteTaskAction:203` | `EventDetailPopover.tsx:114` | `removeQueries(tasks.detail)` + lists, calendar, project, `inicio`, `shell.badges` |
| `add` / `update` / `remove` / `reorderChecklist…:237-266` | `TaskSheet.tsx:828-833` | `tasks.detail(id)` (+ `tareas.list*` for checklist progress) |
| `addTaskCommentAction:290` | `TaskSheet.tsx:882` | `tasks.detail(id)` |
| `addTaskAttachmentAction:314` | `TaskSheet.tsx:554` | `tasks.detail(id)` |
| `add` / `removeTaskDependencyAction:381,391` | `TaskDependencies.tsx:156,174` | `tasks.dependencies(id)`, `tareas.list*` (waitingOn) |

No UI callers (assistant or none): `archiveTaskAction:193`, `mergeTasksAction:217`, `setTaskSupportAction:227`, `reorderProjectTasksAction:272`, `reorderTasksAction:281`, `add`/`removeTaskLinkAction:357,369`, `createAdminTaskAction:425`.

### Tramo start (`lib/actions/tramo-start-actions.ts`)
- `startTramoAction:74` (`StartTramoSheet.tsx:197`) and `undoStartTramoAction:105` (`components/tareas/start-tramo-toast.ts:23`).
- Invalidate: `tareas.startSlot`, `tareas.*`, `proyectos.list`, `proyectos.detail(pid)` prefix, `inicio`.

### Task statuses (`lib/actions/task-statuses-actions.ts`)
- `create:21` / `update:31` / `delete:44`, called from `useTaskStatusesEditor.ts:87-112` and `StatusMapTable.tsx:75`.
- Invalidate: `catalog.taskStatuses`, the `tareas` prefix (board columns), `tasks.detail` prefix, `monday.choices`, `inicio`, `proyectos.list`.

### Projects (`lib/actions/projects-actions.ts`)

| Action | Caller | Invalidates |
|---|---|---|
| `submitProjectCreateAction:100` / `createProjectAction:79` | `ProjectsPortfolio.tsx:126`, `project-create-form.tsx:37` | `proyectos.list`, `catalog.projectOptions`, `inicio` |
| `updateProjectAction:116` | `ProjectFichaClient.tsx:244`, `ProjectsPortfolio.tsx:132`, `ProjectAdminFields.tsx:105` | `proyectos.detail(id)` prefix, `proyectos.list`, `inicio`; client changed → `proyectos.tab(id,'clientes')` |
| `setProjectMembersAction:177`, `setProjectContactsAction:189` | `ProjectFichaClient.tsx:266,280` | `proyectos.tab(id,'ficha')`, `proyectos.resumen(id)`, `proyectos.list`; contacts also `proyectos.tab(id,'clientes')` |
| `add` / `removeProjectLinkAction:207,222` | `ProjectFichaClient.tsx:290,300` | `proyectos.tab(id,'ficha')` |
| `addProjectCommentAction:246` | `ProjectBitacoraCard.tsx:46` | `proyectos.history(id)` |
| `setProjectCurrentTramoAction:267` | `ProjectTramosCard.tsx:65` | `proyectos.detail(id)` prefix, `proyectos.list`, `tareas` prefix |
| space `create:305` / `rename:314` / `reorder:323` / `delete:331` | `ProjectSpacesCard.tsx:67,83,102,115` | `proyectos.tab(id,'ficha')`, `proyectos.resumen(id)`, `catalog.projectSpaces(id)`; delete also `tareas` prefix |
| `retryProjectFolderAction:146` | `ProjectFilesBrowser.tsx:140` | `proyectos.archivos(id)` prefix, `proyectos.resumen(id)`, `proyectos.shell(id)` |

### Schedule (`lib/actions/schedule-actions.ts`; returns `ActionResult`)
- `setTaskStatusAction:78` and `toggleTaskFlagAction:114` (`cronograma-view.tsx:109,128`): optimistic `setQueryData(proyectos.cronograma(pid))`, then invalidate `proyectos.resumen(pid)` and `proyectos.list`. This also fixes the stale-`view` bug.
- `add` / `deleteImprevistoAction:129,152` (`imprevistos-panel.tsx:60,75`): `proyectos.cronograma(pid)`.
- `commitImportScheduleAction:196` and `importLegacyStateAction:285` (`import-dialog.tsx:78,96`): `proyectos.cronograma(pid)`, `proyectos.resumen(pid)`, `proyectos.list`.
- `previewImportScheduleAction:172` is a read; call it with `useMutation` and no invalidation.

### Workflows / tramos (`lib/actions/workflows-actions.ts`)
- Templates: `create:110`, `update:129`, `deactivate:144`, `reorder:154` (`TramosClient.tsx:244-277`): `catalog.workflows`.
- Phases: `create:172`, `update:182`, `reorder:195` (`TramosClient.tsx:203,209`, `PhaseEditorDrawer.tsx:49-50`): `catalog.workflows`, `ajustes.puestos`, `tareas` prefix, `proyectos` prefix.
- `setWorkflowAutoStartAction:208` (`:182`): `catalog.workflows`, `proyectos.list`.
- The sidebar tramo list does not change: no UI calls `create`/`update`/`deleteWorkflowAction`.

### Positions (`lib/actions/positions-actions.ts`), all from `PuestosClient.tsx:119-158`
- `create:41`, `update:50`, `delete:60`, `setPositionPhases:68`, `reorder:78`.
- Invalidate: `ajustes.puestos`, `personas.equipo`, `catalog.assignableStaff` prefix, `ajustes.google`.

### Contacts (`lib/actions/contacts-actions.ts`)
- `create:58` / `update:68` (`PersonasContacts.tsx:176,179`, `ContactEditorSheet.tsx:138`) and `delete:81` (`:193`).
- Invalidate: `personas.contacts` prefix, `personas.counts`, `contacts.detail(id)` (setQueryData), `contacts.history(id)`, `catalog.contacts`.

### Staff (`lib/actions/staff-actions.ts`), called from `use-member-editor.ts:279-330` and `PerfilClient.tsx:235,242`
- `createStaffAction:65`, `updateStaffAction:106`, `upsertStaffProfileAction:143`, `setStaffCredentialAction:165`, `setStaffPositionsAction:198`.
- `recheckStaffAccessAction` (`workspace-access-actions.ts:175`, from `RecheckAccessButton.tsx:29`).
- Invalidate: `personas.equipo`, `personas.counts`, `personas.detail(id)`, `catalog.staff`, `catalog.assignableStaff` prefix, `ajustes.permisos`, `me.profile`.
- An own name edit keeps `revalidatePath('/','layout')`: the shell name is server-rendered.

### Time tracking (`lib/actions/time-tracking-actions.ts`)
- `clockInAction:90`, `pauseWorkAction:99`, `resumeWorkAction:106`, `clockOutAction:113` (`TimeClock.tsx:218-223`, `CommandPalette.tsx:225`, `ClockInPrompt.tsx:193`): `setQueryData(me.today)` from the result; invalidate `me.weekHours` and `ajustes.horario` prefix. Remove `publishTodayStatus` and both refreshes.
- `saveTimeTrackingSettingsAction:71` (`HorarioClient.tsx:86`): invalidate `ajustes.horario` prefix and `me.today`. **Keep** the layout revalidation (the TimeClock gate is server-rendered); drop `router.refresh`.

### Vacations (`lib/actions/vacations-actions.ts`)
- `requestVacationAction:190` and `cancelVacationRequestAction:224`: `me.vacations`, `vacations.absences` prefix, `vacations.pending`.
- `decideVacationAction:257`: `vacations.pending`, `vacations.absences`, `personas.equipo`, `personas.detail(staffId)`.
- `saveVacationSettingsAction:320`: `setQueryData(vacations.settings)`, `me.vacations`.

### Notifications / Mi espacio / Gmail

| Action | Invalidates |
|---|---|
| `markNotificationsReadAction` (`notifications-actions.ts:120`, `Inbox.tsx:269`) | patch `me.notifications` pages; `setQueryData(shell.badges, {unreadCount})` from the result |
| `updateNotificationPreferencesAction:140` | `me.notificationPrefs`, `me.preferences` |
| Notes `create` / `update` / `archive` / `restoreNoteAction` (`QuickCapture.tsx:99`, `NoteEditor.tsx:68,135,152`) | optimistic `me.notes` |
| Checklists `createChecklist:75` (`QuickCapture.tsx:107`), `addChecklistItem:87` (`ChecklistCard.tsx:119`), `toggleChecklistItem:95` (`:101`) | optimistic `me.checklists` |
| Reminders `create:131` (`ReminderDialog.tsx:168`), `snooze` / `cancel` (`RemindersList.tsx:74,85`; the component is **not mounted anywhere**) | `me.reminders`, `shell.badges` |
| Gmail `linkGmailThreadToProjectAction:277` (`Inbox.tsx:677,700`, `GmailReader.tsx:194`) | `me.gmail` prefix, project detail and history |
| Gmail `createTaskFromGmailThreadAction:352` (`GmailReader.tsx:179`, `Inbox.tsx:681`) | same as above + `tareas` prefix |
| Gmail `sendGmailDraftAction:334` (`GmailDraftSheet.tsx:126`) | `me.gmail.thread`, `me.gmail.threads` |
| Gmail `createGmailDraftAction:292` | none |
| Gmail `syncGmailAction:254` / `disconnectGmailAction:401` (`IntegracionesClient.tsx:192,209`) | `me.gmail` prefix, `ajustes.integraciones` |
| Gmail `fetchGmailThreadAction` | keep it as a query; **remove its `revalidatePath`**; set `unread:false` in the threads cache |

### Preferences / appearance / settings
- `updateMyPreferencesAction`: `setQueryData(me.preferences)`. No revalidation; the provider changes the DOM.
- `save` / `resetOrgAppearanceAction`, `save` / `restoreGeneralSettingsAction`: **keep `revalidatePath('/','layout')`** because the theme `<style>`, `<html>` attributes and `GeneralSettingsProvider` are server-rendered. Invalidate `ajustes.tema` / `ajustes.general`. Drop the `router.refresh` calls.
- `removeMyPhotoAction` (`AvatarMenu.tsx:115`, `PerfilClient.tsx:133`) keeps its layout revalidation; drop the follow-up refresh.
- The photo POST route already revalidates the layout (`route.ts:75`). On the client, replace `router.refresh` with nothing, or with `router.refresh` only where the shell avatar must change.

### Google / workspace access
- `create` / `update` / `deleteGroupMappingAction:130,144,161`: `ajustes.google`, `ajustes.puestos`, `catalog.staff`.
- `ensureMissingProjectFoldersAction:204`: `ajustes.google`, `proyectos` prefix.
- `completeOnboardingAction`: `inicio`.

### Monday import (all return results)
- `openRun`, `saveStep`, `connect`, `startExport`, `createMondayStaff`, `saveMappingDraft`, `uploadMapping`, `startApply`, `startRollback`, `saveStatusMap`, `applyMondayRemapAction:428`.
- Run state: `monday.run(id)` with `refetchInterval` while a job is running.
- **When apply or rollback finishes, detected by the poll:** invalidate `proyectos`, `tareas`, `catalog.staff`, `inicio`, `monday.history`.
- `createMondayStaff`: `catalog.staff`, `ajustes.puestos`.
- `applyMondayRemap`: `proyectos.detail(id)` prefix, `proyectos.list`.

### Portal (`lib/actions/portal-actions.ts`, called from `/proyectos/[id]/clientes`)
- `invite:85`, `revoke:143`: `proyectos.tab(id,'clientes')`, `proyectos.shell(id)`, `proyectos.clientesActivity(id)`.
- `disable:156` / `enable:169` affect the user's other projects too: invalidate `proyectos` with a predicate on `'clientes'`.
- `resend:125`: activity only; **remove the refresh**.

### Assistant
- `deleteAssistantThreadAction:69`: optimistic `asistente.threads`, `removeQueries(asistente.thread(id))`, drop the revalidate.
- Chat turn finished: invalidate `asistente.threads`, plus the domain keys implied by the tool parts in the final message:
  - notes → `me.notes`
  - checklists → `me.checklists`
  - reminders → `me.reminders` + `shell.badges`
  - `clock_*` → `me.today`
  - tasks → `tareas` + `inicio`
  - email → `me.gmail`
  - portal → `proyectos`

### Resources (Biblioteca favorites)
- `create` / `deleteResourceLinkAction:37,60`: optimistic `biblioteca.links({section})`, then invalidate the prefix.

---

## 4. Proposed design

### 4.1 Layers

```
lib/query/
  keys.ts            query-key factory (all keys below), `as const`
  client.ts          makeQueryClient() defaults (shared by browser + server)
  server.ts          "server-only": getQueryClient = cache(makeQueryClient); prefetch(...opts) helper
  hydrate.tsx        <Hydrate qc> = <HydrationBoundary state={dehydrate(qc)}>
  mutation.ts        useActionMutation(action, { invalidate, optimistic, errorContext, successToast })
  options/<domain>.ts  queryOptions() per page/sub-resource: { queryKey, queryFn: () => action(input), staleTime }
lib/loaders/<domain>.ts  "server-only" pure loaders: (user, input) => data   ← composed from repositories
lib/actions/page-data/<domain>-actions.ts  "use server": parse zod → requireCapabilityUser → loader
```

- **Server prefetch calls the loader directly.** It does not go through the action, so the RSC pays no extra POST or session check. `queryOptions` share the same key and point `queryFn` at the action for the client.
- Each page uses one of two shapes:
  - `void prefetch(qc, opts)` with `dehydrate(qc, { shouldDehydrateQuery: q => defaultShouldDehydrateQuery(q) || q.state.status === 'pending' })` to stream; or
  - `await` it for SEO-irrelevant pages, which is simpler and the recommended start.
- The client uses `useSuspenseQuery(opts)`.
- **Page action plus sub-key seeding.** A page-data action returns the whole bundle in one round trip. The page's `queryFn` can then `setQueryData` the granular keys, such as `tasks.detail` or `catalog.*`, so later invalidation stays targeted.
- `estilo` (`?estilo=`) is never part of a key: it's render-only.
- **`useActionMutation`** (`lib/query/mutation.ts`):
  - Runs the action. If the result is `{ok:false,error}` (`ActionResult`, portal and Google result types), it throws `new Error(error)`.
  - `onError`: `toast.error(actionErrorText(err, ctx))`, or a `onFormError(text)` callback for inline errors. This keeps the existing copy tables (`PORTAL_ERROR_MESSAGES`, `GROUP_MAPPING_ERROR_MESSAGES`, `tramosErrorText`).
  - `onMutate`: optional optimistic `setQueryData` with a snapshot. `onError` rolls it back.
  - `onSettled`: `invalidateQueries` for each key in `invalidate` (a static list or a function of variables and result).
  - Options to keep the STALE-code refetch (`TeamRequests.tsx:126`) and the partial-failure toast (`NewTaskDialog.tsx:192-193`).
- **Reads as server actions:** this is what the product owner asked for and it works, given the one-call-per-page budget.
  - Caveats: POST, no HTTP cache, serial per tab.
  - For polled data and hover prefetch, optionally add a thin `GET /api/q/[name]` route that runs the same loader. Polling or prefetching then doesn't queue behind mutations.
  - Decide this in phase 1. The `queryOptions` shape stays the same either way.

### 4.2 Key factory (`lib/query/keys.ts`)

```ts
export const qk = {
  shell:   { badges: () => ['shell','badges'] as const },                        // tareas open count + bandeja unread + due reminders
  me:      { today: () => ['me','today'] as const, weekHours: () => ['me','week-hours'] as const,
             preferences: () => ['me','preferences'] as const, profile: () => ['me','profile'] as const,
             notifications: (f: {unreadOnly?: boolean; kinds?: string[]}) => ['me','notifications',f] as const,
             gmail: { all: ['me','gmail'] as const, status: () => ['me','gmail','status'] as const,
                      threads: (q='') => ['me','gmail','threads',{q}] as const, thread: (id: string) => ['me','gmail','thread',id] as const },
             reminders: (range: 'today-tomorrow') => ['me','reminders',range] as const,
             checklists: () => ['me','checklists'] as const, notes: () => ['me','notes'] as const,
             vacations: () => ['me','vacations'] as const, notificationPrefs: () => ['me','notification-prefs'] as const },
  inicio:  () => ['inicio'] as const,
  tareas:  { all: ['tareas'] as const,
             page: (q: TareasPageInput) => ['tareas','page',q] as const,            // facets + first page / board / calendar
             list: (f: TareasListFilters, cursor?: string) => ['tareas','list',f,cursor ?? null] as const,
             board: (f: TareasListFilters) => ['tareas','board',f] as const,
             calendar: (f: TareasListFilters, from: string, to: string) => ['tareas','calendar',f,from,to] as const,
             startSlot: () => ['tareas','start-slot'] as const },
  tasks:   { detail: (id: string) => ['tasks',id] as const, subtasks: (id: string) => ['tasks',id,'subtasks'] as const,
             dependencies: (id: string) => ['tasks',id,'dependencies'] as const,
             options: (projectId: string, q: string) => ['tasks','options',projectId,q] as const },
  proyectos: { list: () => ['proyectos','list'] as const, detail: (id: string) => ['proyectos',id] as const,
             shell: (id: string) => ['proyectos',id,'shell'] as const, resumen: (id: string) => ['proyectos',id,'resumen'] as const,
             tab: (id: string, tab: 'tareas'|'ficha'|'clientes') => ['proyectos',id,tab] as const,
             archivos: (id: string, folder: string|null) => ['proyectos',id,'archivos',folder ?? 'root'] as const,
             cronograma: (id: string) => ['proyectos',id,'cronograma'] as const,
             history: (id: string) => ['proyectos',id,'history'] as const,
             clientesActivity: (id: string) => ['proyectos',id,'clientes','activity'] as const },
  personas: { equipo: () => ['personas','equipo'] as const, counts: () => ['personas','counts'] as const,
             contacts: (tab: PersonasContactsTab, tipo: string|null) => ['personas','contacts',tab,tipo] as const,
             detail: (staffId: string) => ['personas','detail',staffId] as const },
  contacts: { detail: (id: string) => ['contacts',id] as const, history: (id: string) => ['contacts',id,'history'] as const },
  biblioteca: { links: (section: string|null) => ['biblioteca','links',section] as const },
  vacations: { absences: (month: string) => ['vacations','absences',month] as const, pending: () => ['vacations','pending'] as const,
               settings: () => ['vacations','settings'] as const },
  asistente: { threads: () => ['asistente','threads'] as const, thread: (id: string) => ['asistente','thread',id] as const,
               context: (c: {projectId?: string; taskId?: string; personId?: string}) => ['asistente','context',c] as const },
  ajustes: { page: (seg: AjustesSegment, input?: object) => ['ajustes',seg,input ?? {}] as const },
  monday:  { run: (id: string) => ['monday','run',id] as const, history: () => ['monday','history'] as const, choices: () => ['monday','choices'] as const },
  catalog: { tramos: () => ['catalog','tramos'] as const, workflows: () => ['catalog','workflows'] as const,
             taskStatuses: () => ['catalog','task-statuses'] as const, staff: () => ['catalog','staff'] as const,
             assignableStaff: (workflowId: string|null) => ['catalog','assignable-staff',workflowId] as const,
             projectOptions: () => ['catalog','project-options'] as const, projectSpaces: (pid: string) => ['catalog','spaces',pid] as const,
             contacts: (type?: string) => ['catalog','contacts',type ?? null] as const },
  search:  (q: string, types?: string[]) => ['search',q,types ?? null] as const,
  portal:  { projects: () => ['portal','projects'] as const, project: (id: string, tab: string) => ['portal','project',id,tab] as const,
             files: (id: string, folder: string|null) => ['portal','files',id,folder] as const, uploads: (id: string) => ['portal','uploads',id] as const },
} as const;
```

**staleTime / gcTime defaults** (gcTime 5 min unless noted):

| Keys | staleTime | Notes |
|---|---|---|
| `catalog.*` | 5 min | |
| `inicio`, `tareas.*`, `proyectos.*`, `personas.*` | 30 s | aligned with `staleTimes.dynamic` |
| `tasks.detail` | 30 s | |
| `me.today` | 60 s | `refetchInterval: 5 min`, `refetchOnWindowFocus: true` (replaces `TimeClock`'s timers) |
| `shell.badges` | 30 s | `refetchInterval: 60_000`, `refetchIntervalInBackground: false` (replaces the Inbox poll and the module store) |
| `me.notes`, `me.checklists` | 5 min | |
| `asistente.thread` | Infinity | `useChat` owns live state |
| `ajustes.*` | 5 min | |
| `ajustes.google` health part | 30 s | |
| `monday.run` | 0 | `refetchInterval: running ? 2000 : false` |
| `search` | 30 s | `placeholderData: keepPreviousData` |
| `portal.*` | 60 s | clear the cache on portal logout |

### 4.3 Page-data contracts

Every action:
- is `"use server"`;
- parses its input with zod;
- re-checks the same capability as the page;
- returns existing `lib/types/*` names.

`UuidSchema` comes from `lib/validation/project-flow.ts:23`.

#### Shell
**`getShellBadgesAction(z.object({}))`** → `{ tareasOpen: number; bandeja: BandejaBadgeData }` (`lib/shell/sidebar-slots/bandeja-badge-view.tsx:13`)
- Composes a **new** `tasksRepository.countOpenTasksFor(staffId, viewer)` (a `COUNT(*)` with `isTaskClosed` semantics), replacing `fetchMyTasksAction` in `lib/shell/nav-items/tareas.ts:30`.
- Plus `countUnreadNotifications` (no list) and `loadDueReminders`.
- Prefetched in `app/(staff)/layout.tsx`, which drops the duplicate bandeja reads in the nav item and the slot.
- Nav items return no badge; `Sidebar` reads `useQuery(qk.shell.badges())`.

**Shell data that stays server-rendered** (not queries; see 4.6):
- `NavModel` structure and tramos
- session and photo URL (cached, sha-only)
- appearance
- `TodayStatus` seed, passed as `initialData` to `useQuery(qk.me.today())`

#### Inicio
**`getInicioPageData(z.object({}))`** → `{ inicio: InicioData; firstLogin: Pick<FirstLoginState,'showGoogleSetupBanner'> }`
- Composes the existing `fetchInicioAction` body (moved to `lib/loaders/inicio.ts`) and `getFirstLoginState`.
- Drops the duplicate `staffPhotoUrl`; it uses the shell's.
- The first-login redirect stays in the RSC page, before prefetch.

#### Tareas
This is the only page that needs a new paged repository.

```ts
export const TareasPageInput = z.object({
  vista: z.enum(['tablero','lista','calendario']),
  tramo: z.string().nullable(), proyecto: UuidSchema.nullable(),
  responsable: z.union([z.literal('yo'), UuidSchema]).nullable(),
  estado: z.enum(['pendiente','en_proceso','completado','bloqueado']).nullable(),
  q: z.string().max(TAREAS_SEARCH_MAX).nullable(),
  cal: z.enum(['mes','semana','dia']).default('mes'),
  range: z.object({ from: IsoDate, to: IsoDate }).optional(),        // calendario
  cursor: z.string().nullable().default(null), limit: z.number().int().min(10).max(200).default(50),
});
export type TareasPageData = {
  facets: { total: number; byTramo: Record<string, number>; projects: { id: string; name: string; count: number }[] }; // replaces shipping all tasks
  tramos: WorkflowRef[];
  staff: StaffOption[];                       // id + name only (today full Staff)
  list?:  { rows: TaskListRow[]; nextCursor: string | null; total: number };            // lista
  board?: { columns: Record<string /*status or custom id*/, { rows: TaskListRow[]; total: number; nextCursor: string|null }>;
            statuses: TaskStatusOption[] };                                              // tablero, N per column
  calendar?: TaskListRow[];                   // tablero/lista none; calendario bounded by range
  startSlot?: unknown;                        // TareasStartSlot data (lista) — fold fetchTramoBoardAction here
};
```

- **New `TaskListRow`** = `Omit<TaskListItem, 'notes' | …large fields>`. Keep `TaskListItem` for detail.
- **New repository functions:**
  - `tasksRepository.listTasksPage(filters, viewer, {cursor, limit, orderBy})`: keyset on (workflow sort, phase sort, sortOrder, commitmentDate, id).
  - `listBoardColumns(filters, viewer, perColumn)`: one `ROW_NUMBER() OVER (PARTITION BY status)` query.
  - `taskFacets(filters, viewer)`: `GROUP BY workflow_id, project_id`.
- Replace the 7 correlated subqueries with `LEFT JOIN (SELECT task_id, count(*) … GROUP BY task_id)` aggregates.
- `loadSupport` is then limited to the page's ids.
- Search, estado and responsable move into the key, with `placeholderData: keepPreviousData`.
- **Filters stop calling `router.replace`.** Use `window.history.replaceState` (Next 16 supports shallow `history.replaceState` syncing with `useSearchParams`) plus a key change, so no RSC re-render happens. Back/forward still works.
- More rows load with `useInfiniteQuery` (lista, per board column), and Analítico gets virtualization (`@tanstack/react-virtual`, new dependency) or pagination.

The Tareas sheet uses separate keys:
- `getTaskSheetData(z.object({ id: UuidSchema }))` → `{ task: TaskDetail; statuses: TaskStatusOption[]; workflows: WorkflowRef[]; assignable: StaffOption[]; spaces: ProjectSpace[] }`. This is one call instead of 5 queued ones. It seeds `tasks.detail` and the `catalog.*` keys.
- Subtasks and dependencies: `tasks.subtasks`, `tasks.dependencies`.
- The dependency picker uses a **new** `searchProjectTasksAction({projectId, q, limit:20})` → `TaskRef[]`, not `fetchTasksAction({projectId})`.

`NewTaskDialog` uses `catalog.projectOptions` (a **new** light `{id,name,status}` action, also used by Inbox and GmailReader), `catalog.workflows` (`WorkflowRef[]`) and `catalog.assignableStaff(workflowId)`. All are `enabled: open`.

#### Proyectos

| Action | Input | Return | Composes |
|---|---|---|---|
| `getProyectosPageData` | `z.object({})` | `{ projects: ProjectListItem[]; portfolio: PortfolioRow[]; tramos: WorkflowRef[]; presaleAutoStart: boolean; canSeeAdminData: boolean; canCreateProject: boolean }` | `listProjects`, `listPortfolioRows` (**move progress into SQL, or load schedules only of projects that have one**), `listTramos`, a new `workflowsRepository.presaleAutoStart()`. Admin create options become lazy `catalog.contacts('cliente')` and `catalog.staff` queries, `enabled: dialogOpen`. |
| `getProyectoShell` | `{ id: UuidSchema }` | `ProjectTabShell \| null` (`lib/projects/project-tab-shell.ts:13`) | a cached `getProjectForViewer`, a **new** `countProjectTasks(id, viewer)` and `countProjectPortalAccess(id)` (`COUNT(*)`). **No Drive.** `counts.archivos` comes from `proyectos.archivos(id,null)` when cached, or a lazy count query. |
| `getProyectoResumenData` | `{ id }` | `ProjectSummaryInput` (`lib/proyectos/project-summary.ts`) | the shell's project, slim task stats, `listPortfolioRows({projectIds:[id]})` (**new filter**), the same schedule source as Cronograma (payments stripped for non-admins), the root files query, spaces, staff `{id,email,role}` **only for members and contacts**, tramos |
| `getProyectoTareasData` | `{ id }` | `{ tasks: TaskListRow[]; includeAdmin: boolean }` | one `listTasks` (or paged). Estado and responsable become shallow URL state. |
| `getProyectoArchivosData` | `{ id, folderId: z.string().min(1).nullable() }` | `{kind:'ok';result:StaffFilesResult;canRetry:boolean} \| {kind:'not_found'} \| {kind:'drive_error'}` | `getStaffFilesProject`, `listStaffProjectFiles`. Client-side folder navigation, staleTime 2–5 min. |
| `getProyectoClientesData` | `{ id }` | `{ rows: PortalAccessRow[]; contacts: PortalInvitableContact[]; capabilities: PortalCapabilities; hasClient: boolean; canAssignClient: boolean; clientFolderUrl: string \| null }` | `listProjectAccess`, `listInvitableContacts` (make it **one** query), `findProjectClientFolderId`. Activity is a separate `proyectos.clientesActivity(id)` query → `PortalActivityRow[]`. |
| `getProyectoCronogramaData` | `{ id }` | `ScheduleViewData \| null` (`lib/actions/schedule-actions.ts:56`) | `getScheduleForProject` + **viewer-scope / `deleted_at` check, payments stripped for non-admins**. `weekOffset` becomes client state. Reporte reuses the key. |
| `getProyectoFichaData` | `{ id }` | `{ project: ProjectDetail; tasks: TaskListRow[]; spaces: ProjectSpace[]; importData: ImportData \| null }` | the shell's project, one `listTasks` with a kinds filter (merges `fetchAdminTasksAction`), `listSpaces`, `getImportDataAction`. Catalogs are separate keys: `catalog.staff`, `catalog.tramos` (`WorkflowRef[]`), `catalog.contacts()` trimmed to `{id,name,type}`. History: `proyectos.history(id)`. |

Every `/proyectos/[id]/*` page prefetches `getProyectoShell` plus its tab. Tab switches then hit the cache for the shell.

#### Personas

| Action | Input | Return | Composes |
|---|---|---|---|
| `getPersonasEquipoPageData` | `z.object({})` | `Omit<EquipoViewProps,'counts'>` (`components/personas/EquipoView.tsx:22`) | `listStaff` **once**, passed into the overview logic (drop `listActiveStaffRows`); open tasks, active projects, absences, `weekHours`, `listTramos`, `listPositions`, `buildTeamPeople` |
| `getPersonasCountsAction` | `z.object({})` | `Record<PersonasTab, number>` | **new** `contactsRepository.countByType()` (`GROUP BY type`) + active staff `COUNT(*)`. Replaces `loadPersonasTabCounts` and the staff read in `contacts-page.server.ts:44`. |
| `getPersonasContactsPageData` | `z.object({ tab: z.enum(['clientes','contratistas','proveedores']), tipo: z.string().nullish() })` | `Omit<PersonasContactsProps,'counts'>` (`PersonasContact[]`, `lib/personas/contacts.ts:79`) | `listContacts({types})` filtered **in SQL** with the `contactsForTab` mapping (`contacts.ts:151`) |
| `fetchPersonaDetailAction` (existing) | `{ staffId: UuidSchema }` | `PersonaDetail` | as is |
| `saveMemberAction` (**new mutation**) | the member editor's form (existing zod schemas combined) | `StaffDetail` | folds the 4 serial actions into one transaction |
| `fetchStaffOptionsAction` (**new**) | `{}` | `{id,name,lastName}[]` | for `ContactEditorSheet`, `enabled: open` |

Opening the contact sheet uses `history.replaceState` (as `components/mi-espacio/search-params.ts:22-26` already does), not `router.push`.

#### Mi espacio
**`getMiEspacioPageData(z.object({}))`** → `Omit<MiEspacioClientProps,'noteParam'>`, i.e. `{ notifications: NotificationsPage; gmail: { status: GmailStatus; threads: GmailThreadSummary[]; nextCursor: string|null } | null; reminders: Reminder[]; checklists: Checklist[]; notes: Note[] }`.
- Composes the five reads, with `loadGmailAccess` computed **once**.
- Seeds `me.notifications`, `me.gmail.*`, `me.reminders`, `me.checklists` and `me.notes`.
- Load-more uses `useInfiniteQuery`.
- Remove the Inbox `setInterval`: `me.notifications` either refetches when `shell.badges.unreadCount` rises, or uses its own `refetchInterval` while mounted.
- Remove `revalidatePath` from `my-space-actions.ts` and `notifications-actions.ts:125` once migrated.
- Add limits to notes and checklists (cursor pages, or a cap plus "ver más").

#### Biblioteca
**`getBibliotecaPageData(z.object({ section: z.enum([...BIBLIOTECA_SECTIONS,'empresa']).nullable() }))`** → `BibliotecaData` (`lib/biblioteca/load.ts:13`)
- Composes `listResourceLinks({section, viewerId})`, which filters section and personal links (`personal_for_id IS NULL OR = viewer`) **in SQL**, plus capabilities and `isPickerDriveConfigured`.

**`getMisVacacionesPageData(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }))`** → `MisVacacionesClientProps & { deciders: VacationDeciderData | null }` (`lib/vacations/decider-sections.ts:9`)
- One `Promise.all` covering my vacations, absences, links, pending and settings. This removes the 3-wave waterfall.
- Seeds `me.vacations`, `vacations.absences(month)`, `vacations.pending`, `vacations.settings` and `biblioteca.links('mis-vacaciones')`.

#### Asistente
**`getAsistentePageData(z.object({ threadId: UuidSchema.nullable() }))`** → `{ threads: AssistantThreadSummary[]; initialThread: AsistentePageThread | null; missingThread: boolean }`
- Thread switching uses `history.replaceState` plus `useQuery(qk.asistente.thread(id))`, which removes the RSC re-runs.
- `use-confirmed-context.ts` becomes `useQuery(qk.asistente.context(c))` using a **new** name-only lookup (not `fetchStaffDetailAction`).
- `listAssistantThreadMessages` should be paged (last N).
- The chat route should save only new or changed messages.

#### Ajustes
One action per segment, `getAjustes<Seg>PageData(z.object({}))`, under the key `qk.ajustes.page(seg)`. It replaces the mount refetches in `useTaskStatusesEditor`, `PuestosClient` and `TramosClient` and the focus listener in `usePermissionsWorkspace`.

| Segment | Returns |
|---|---|
| estatus | `{statuses: TaskStatusOption[]}` |
| general | `{general: LoadedGeneralSettings; canManage; canManageAppearance}` |
| google | `{mappings: GroupMapping[]; positions: Pick<Position,'id'\|'name'>[]; health: GoogleHealth\|null}`, all in one `Promise.all` |
| horario | input `{weekStart: IsoDate}` → `{settings: TimeTrackingSettings; rows: TeamHoursRow[]; canManage; canViewReport}` |
| monday | `{status; run: MondayImportRunState\|null; choices; history; errors}`. **`openMondayImportRunAction` moves out of render into an explicit `useMutation` on mount.** |
| permisos | `{staff: Staff[]; defaultPermissions: PermissionsState}` |
| puestos | `{positions: Position[]; workflows: WorkflowDetail[]}` |
| tema | `{org: OrgAppearance}` |
| tramos | `{workflows: WorkflowDetail[]}` |
| apariencia | `{preferences: UserPreferences; org: OrgAppearance; isAdmin}` |
| integraciones | `{gmail: GmailStatus; drive: Pick<PickerDriveStatus,'configured'\|'hasDriveGrant'>}`, with a **DB-only** Drive grant check |
| notificaciones | `{preferences: NotificationPreferences}`; also remove the duplicate header and nav |
| perfil | `{profile: PerfilData}` (move the type to `lib/types/redesign.ts`) + `me.weekHours` |

`ajustes/layout.tsx` and the segment guards stay as RSC.

#### Portal
- `getPortalHomeData(z.object({}))` → `{projects: PortalProjectDTO[]}`.
- `getPortalProjectData(z.object({ id: UuidSchema, tab: z.enum(['resumen','cronograma','archivos','enviar']) }))` → `{ project: PortalProjectDTO; schedule: PortalScheduleDTO|null; tramos: PortalTramoDTO[]; documents: PortalFileDTO[]|null }`.
  - Runs `requireProjectAccess` once; the later reads don't re-check visibility.
- Files and uploads: `useQuery` over the existing GET route handlers.
- Cache `getPortalUser` and merge the 3 `appearance.theme` reads into one cached read.
- Portal appearance stays in RSC.

### 4.4 Mutations
- Every `router.refresh()` in §2d except auth (rows 33–35) becomes `useActionMutation` with the invalidation lists in §3.
- Manual `reload()` / `refetch()` helpers are deleted: `ProjectFichaClient`, `TaskSheet.run`, `MisVacacionesClient`, `MiEspacioClient` QuickCapture, `PuestosClient`, `TramosClient`, `useTaskStatusesEditor`, `cronograma-view.loadSchedule`.
- **Tablero drag-and-drop:**
  - `onMutate`: cancel `tareas.board(f)`, snapshot it, move the card between columns in the cache (adjust `total`s), and also patch `tasks.detail(id)` if cached.
  - `onError`: roll back and show `toast.error(actionErrorText)`.
  - `onSettled`: invalidate `tareas.facets`/`tareas.list` (not the board just patched, unless `customStatus` semantics changed), `inicio` and `shell.badges`.
  - `TaskBoardWidget` already does an optimistic move with rollback (`components/widgets/TaskBoardWidget.tsx:50-68`); it then reads the cache instead of local state.
- **Cronograma status and flags:** same pattern on `proyectos.cronograma(pid)`.
- **Mi espacio** checklist toggles, notes and mark-read: optimistic `setQueryData`.
- **`revalidatePath` clean-up rule:**
  - When a domain migrates, remove the `revalidatePath` calls targeting its screens.
  - Delete every ⚠ stub target.
  - Keep only `('/','layout')` for org theme, general settings, time-tracking settings, own staff name and photo, and auth.
  - Until a domain migrates, add the **missing live paths** (`/inicio`, `/personas*`, `/biblioteca/[seccion]`, `/ajustes/*`) only if needed to keep it correct.

### 4.5 Prefetch, polling, staleness
- **Sidebar and BottomTabs links:**
  - `onMouseEnter`/`onFocus`: `queryClient.prefetchQuery(pageOptions(defaultInput))`.
  - When a link enters the viewport (IntersectionObserver), only for the 2–3 most-used items: Inicio, Tareas, Mi espacio.
  - Keep `next/link` prefetch for the RSC shell.
  - Because actions are serial, prefetch **one** page-data query per hover, debounced 100 ms. Or use the GET route variant.
- **Project tabs (`ProjectTabs`):** prefetch `proyectos.*` per tab on hover. The shell key is shared.
- **Tareas view switch (tablero / lista / calendario):** prefetch the other views' keys on hover of the switch.
- **Polling:**
  - `shell.badges` every 60 s, visible tab only.
  - `me.today` every 5 min plus on focus.
  - `monday.run` every 2 s while running.
  - No custom `setInterval`s that fetch remain.
- **Default `QueryClient`** (`lib/query/client.ts`): `staleTime: 30_000`, `gcTime: 5 * 60_000`, `refetchOnWindowFocus: false` (per-query opt-in), `retry: 1` for queries, `retry: 0` for mutations.

### 4.6 What stays server-rendered (shell and appearance)
- **Appearance:**
  - `<html>` attributes, `<style id="appearance">` and the system-mode script stay in `app/layout.tsx:53-104`.
  - `AppearanceProvider initial={appearance}`.
  - `StyleProvider style={appearance.style}` in `AppShell` and each page.
  - **Never** read appearance through a client query for first paint, because it would flash the wrong theme. `me.preferences` and `ajustes.page('tema')` only seed the editors.
  - Org theme and general-settings saves keep `revalidatePath('/','layout')`.
  - Optional: let `getResolvedAppearance` trust the cookie when its `v` matches, to avoid 2 q per request.
- **Shell:** `NavModel` (items, flags, capabilities, tramos), `session` (cached, sha-only photo), and the `today` seed stay RSC.
  - Badges are the only live part (`shell.badges`), prefetched in the layout and hydrated with a layout-level `HydrationBoundary`.
  - `TimeClock` and `ClockInPrompt` read `useQuery(qk.me.today(), { initialData: today })`. This removes `publishTodayStatus`/`subscribeTodayStatus` and both `router.refresh`es.
- **Provider placement:** move `QueryProvider` above `AppearanceProvider` and `<Toaster>` in `app/layout.tsx`.

### 4.7 Zustand (UI-only state) vs TanStack (server state)

The full UI-state inventory, the store designs (`useShellUi`, `useAssistantUi`, `useNewTaskUi`, `useTareasUi`, the dashboard store factory for Inicio/Proyectos/Personas, `usePresentationStyle`, `useRecentDocs`), the URL/Zustand/TanStack boundary, SSR and testing rules, and the Zustand work per phase are in [`zustand.md`](./zustand.md). That document supersedes the short list below where they differ.

**Zustand**
- **`useAssistantUi`**: `{open, mounted, context, threadId, openAssistant(ctx?), close()}`.
  - Replaces `AssistantLauncher` local state and the `OPEN_ASSISTANT_EVENT` window event (`components/asistente/AssistantLauncher.tsx:29-34,52-82`).
  - Removes the second sheet in `DocumentReader.tsx:48,208`, which becomes `openAssistant({route})`.
  - The sheet stays lazy, which also fixes the bundle problem.
- **`useTareasUi`** (optional): calendar cursor/selected day, popover, feed dialog, Analítico column state. Shareable filters stay in the URL.
- **`lib/stores/session-store.ts`** stays.

**Not Zustand**
- The Bandeja unread count and the TimeClock status are server state: TanStack.
- Editor drafts stay `useState`.
- Presentation style stays in `StyleProvider` plus `?estilo=`.

---

## 5. Phased migration

Every phase is shippable on its own. Phase 1 blocks the rest. Phases 2–11 can run in parallel; their only shared files are `lib/query/keys.ts` (append-only per domain section) and the action files whose `revalidatePath` they own.

### 5.0 Migration rule: switch fully, leave no old pattern behind

Every file a phase touches ends the phase on the TanStack pattern only. While editing a component, hook or page, remove in the same PR:
- `router.refresh()` after mutations → `useActionMutation` with targeted `invalidateQueries` / `setQueryData`;
- `useEffect` / `useTransition` calls that load data through a server action or `fetch`, and hand-written `reload()` / `refetch()` / `loadX()` helpers → `useQuery` / `useSuspenseQuery` / `useInfiniteQuery`;
- `initialData`/`initialX` props threaded from the RSC page into client state copies (`useState(initialX)`) → server `prefetch` + `HydrationBoundary` and reading the query;
- custom polling (`setInterval`, focus/visibility listeners that refetch) → `refetchInterval` / `refetchOnWindowFocus` per query;
- module-level stores, window events and `publish/subscribe` helpers that carry server data (for example `publishTodayStatus`, the Bandeja badge store) → the query cache;
- `revalidatePath` calls that target the migrated screens (keep only `('/', 'layout')` for theme, settings and auth);
- local `useState` copies of server data kept in sync by hand.

UI-only state that is shared, dashboard-like or must survive navigation moves to the domain's Zustand store (see §4.7); shareable filters stay in the URL.

A phase is not done while any touched file still contains one of the patterns above. Each phase PR lists the touched files and confirms with:
`rg -n "router\.refresh\(|useEffect\([^)]*\b(fetch|load|refetch)|setInterval\(|revalidatePath\(" <touched files>` returning nothing (or only auth and `('/', 'layout')` cases).

### Phase 1: foundation (one PR)

**Files:**
- `lib/query/{keys,client,server,hydrate,mutation}.ts(x)`
- move `QueryProvider` up in `app/layout.tsx`, using `makeQueryClient` from `lib/query/client.ts`
- `lib/query/test-utils.tsx`: `renderWithQueryClient`, `createTestQueryClient({retry:false})`, a `mockAction` helper, and a hydration-roundtrip helper
- optional `app/api/q/[name]/route.ts` GET wrapper (decide here)
- React `cache()` for:
  - `getGeneralSettings`
  - `getTimeTrackingSettings`
  - `findUserPreferences` (inside `getResolvedAppearance` and `fetchMyPreferencesAction`)
  - a sha-only `getStaffPhotoUrl`, used by the layout, Inicio and Perfil
  - `listTramos`
  - `getPortalUser`
- Confirm whether prod builds strip error messages. If they do, `useActionMutation` maps both thrown and result errors, and an issue is opened to move hot actions to `ActionResult`.

**Acceptance:**
- `useActionMutation` covers success and invalidation, `{ok:false}` → `actionErrorText` toast, thrown `Error('CODE')` → copy, optimistic rollback, and the inline-error callback.
- A `prefetch` + `HydrationBoundary` example passes a test where the server-fetched data renders with **0** client action calls.
- No behaviour change in the app. Existing unit and e2e tests stay green.

**Tests:** unit tests for `keys` (stable shapes), `mutation.ts` (all branches) and `hydrate` (dehydrate/rehydrate), plus a vitest helper smoke test.

### Phase 2: shell and sidebar

**Files:**
- `app/(staff)/layout.tsx` (photo, nav and badges prefetch in one `Promise.all`)
- `lib/shell/nav-items/{tareas,mi-espacio}.ts` (no badge reads)
- `lib/shell/sidebar-slots/bandeja-badge.tsx`
- `components/shell/{Sidebar,BottomTabs,TimeClock,ClockInPrompt,CommandPalette,AvatarMenu}.tsx`
- `lib/my-space/bandeja-unread.ts` (removed)
- new `getShellBadgesAction` + `countOpenTasksFor` repository function
- `lib/repositories/preferences-repository.ts` (no blob select)
- legacy redirect pages moved to `next.config` `redirects()`

**Acceptance:**
- One shell render runs ≤ 8 q and **no full task scan**.
- The badge updates within 60 s on every page, not only `/mi-espacio`.
- `CommandPalette.tsx:230`, `ClockInPrompt.tsx:183` and `AvatarMenu.tsx:94` contain no `router.refresh`.
- Clock in/out updates the sidebar clock with 0 RSC requests.
- Hovering a sidebar link issues exactly 1 page-data call.

**Tests:**
- unit: badge query plus poll interval with fake timers; TimeClock with a query (focus refetch); nav model without badge reads
- DB test: `countOpenTasksFor` equals the old `countOpenTasks(listMyTasks)`
- e2e: badge decrements after mark-read on Mi espacio, then navigating to Tareas shows the same count

### Phase 3: Inicio

**Files:** `app/(staff)/inicio/page.tsx`, `lib/loaders/inicio.ts` (moved from `dashboard-actions.ts:119`), `lib/actions/page-data/inicio-actions.ts`, `components/inicio/InicioClient.tsx`, `lib/query/options/inicio.ts`.

**Acceptance:**
- 1 page-data call.
- Inicio → Tareas → Inicio within staleTime issues **0** new requests for Inicio.
- No `router.refresh` in `components/inicio/*`.
- The photo change updates the avatar through `me.profile` / layout revalidation.
- This phase does not fix the CPU issue (separate work), but the loader must not call `listTasks` without a column projection.

**Tests:** hydration test (no client call on mount); the existing `inicio-actions.db.test.ts` runs against the loader.

### Phase 4: Tareas

The largest phase.

**Files:**
- `app/(staff)/tareas/page.tsx`
- `lib/loaders/tareas.ts`
- `lib/actions/page-data/tareas-actions.ts`: `getTareasPageData`, `getTaskSheetData`, `searchProjectTasksAction`
- `lib/repositories/tasks-repository.ts`: `listTasksPage`, `listBoardColumns`, `taskFacets`, aggregate joins, `TaskListRow` projection
- `lib/types/core.ts` (`TaskListRow`)
- `components/tareas/{TareasClient,TareasTablero,TareasLista,TareasCalendario,TaskSheet,TaskSubtasks,TaskDependencies,NewTaskDialog,EventDetailPopover,TareasStartSlot,StartTramoSheet}.tsx`
- `components/widgets/{TaskBoardWidget,RecordTable}.tsx` (cache-driven, infinite or virtualized)
- `lib/actions/tasks-actions.ts` and `tramo-start-actions.ts` (remove `/tareas` and stub revalidates once migrated)

**Acceptance:**
- Tareas first payload **under 200 KB** with 1 page-data call, measured with about 2,900 tasks.
- ≤ 6 DB q per page-data call.
- Changing a filter or search issues 1 page-data call and **0** RSC requests.
- Tablero drag moves the card instantly, sends 1 POST, and causes no RSC re-render. On error it rolls back with a toast.
- Opening a task makes 1 call (`getTaskSheetData`); reopening within staleTime makes 0.
- No `router.refresh` left in `components/tareas/*`.
- `fetchTasksAction({projectId})` is no longer used by `TaskDependencies`.

**Tests:**
- DB tests: `listTasksPage` keyset correctness (stable order, no duplicates or gaps); `listBoardColumns` per-column totals; `taskFacets` equals the old client chip counts.
- Unit: Tablero optimistic move and rollback; filters → key change → no `router.replace`.
- Update `TareasClient.test.tsx` / `TareasTablero.test.tsx` to use the query test utils.
- e2e: payload-size assertion (response bytes of the first document < 200 KB); drag e2e.

### Phase 5: Proyectos

**Files:**
- `app/(staff)/proyectos/**/page.tsx`
- `lib/loaders/proyectos.ts`
- `lib/actions/page-data/proyectos-actions.ts`
- `lib/projects/project-tab-shell.ts` (counts via `COUNT`, no Drive)
- `lib/proyectos/project-resumen.ts`
- `lib/repositories/projects-portfolio-repository.ts` (`projectIds` filter, schedule load limited to projects that have one)
- `lib/repositories/schedule-repository.ts` (scope, `deleted_at`, payments stripped)
- `components/proyectos/*`, `components/cronograma/*`
- `app/(staff)/proyectos/[id]/ficha/ProjectFichaClient.tsx`
- `lib/actions/{projects,schedule,portal}-actions.ts` (revalidate clean-up)

**Acceptance:**
- Each tab: 1 shell (cached across tabs) + 1 tab call.
- Switching Resumen → Ficha → Cronograma → Resumen within staleTime issues 0 calls for Resumen and the shell.
- **No Drive call** except on Archivos and Resumen files.
- Ficha has 0 client-only loading flashes and 0 `reload()`.
- `?week=`, `?folder=` and Tareas filters cause no RSC requests.
- Non-admins never receive schedule payments.
- No `router.refresh` in `components/proyectos/*`.
- `/proyectos` page-data call ≤ 8 q.

**Tests:**
- DB: tab counts equal the old lengths; portfolio row for one project equals the old full-portfolio `.find`; schedule scope test.
- Unit: cronograma optimistic status persists after settle (regression for the stale-`view` bug).
- e2e: invite a portal client, and the count in the tab updates without a refresh.

### Phase 6: Personas

**Files:**
- `app/(staff)/personas/**`
- `lib/personas/{contacts-page.server,tab-counts}.ts`
- `lib/actions/page-data/personas-actions.ts`
- `lib/repositories/contacts-repository.ts` (`countByType`, type filter)
- new `saveMemberAction`
- `lib/equipo/use-member-editor.ts`
- `components/personas/*`, `components/directorio/*`, `components/equipo/*`
- `contacts-actions.ts` / `staff-actions.ts` (stub revalidates removed)

**Acceptance:**
- `/personas` ≤ 10 q in 1 page-data call + 1 counts call.
- Contact tabs ship only their own types.
- Opening a contact causes 0 RSC requests.
- Saving a member is 1 POST.
- Closed sheets fetch nothing.
- No `router.refresh` in `components/personas/*`.

**Tests:** DB tests for `countByType` and the type filter; `saveMemberAction` transaction (partial failure rolls back); unit tests for the contact sheet using the URL replaceState.

### Phase 7: Mi espacio / Bandeja

**Files:**
- `app/(staff)/mi-espacio/page.tsx`
- `lib/actions/page-data/mi-espacio-actions.ts`
- `components/mi-espacio/{MiEspacioClient,Inbox,GmailReader,QuickCapture,NoteEditor,ChecklistCard,ReminderDialog}.tsx`
- `lib/actions/{my-space,notifications,gmail}-actions.ts` (revalidate removed, including `fetchGmailThreadAction`)
- `lib/repositories` notes and checklists paging
- delete `RemindersList` if it is confirmed dead

**Acceptance:**
- 1 page-data call.
- A checkbox toggle is 1 POST, 0 RSC requests, and instant.
- Opening an email causes no route re-render.
- No `setInterval` that fetches in `Inbox.tsx`.
- `fetchProjectsAction` is replaced by `catalog.projectOptions`, loaded once.
- Notes and checklists are bounded.

**Tests:** unit tests for the optimistic toggle and rollback, the infinite notifications/threads load-more, and the badge patch from `markNotificationsReadAction`.

### Phase 8: Biblioteca and Vacaciones

**Files:**
- `app/(staff)/biblioteca/**`
- `lib/biblioteca/load.ts`
- `lib/repositories/resources-repository.ts` (SQL filter)
- `components/biblioteca/*` (`DocumentReader` opens the assistant through `useAssistantUi`)
- `lib/vacations/*`
- `vacations-actions.ts` / `resources-actions.ts`

**Acceptance:**
- Vacaciones loads in 1 wave.
- No `router.refresh` / `reload()` in `components/biblioteca/*`.
- The section page ships only its own links.
- The `DocumentReader` route chunk no longer includes `@ai-sdk/react`, `recharts` or `react-markdown` (bundle analyzer check).

**Tests:** unit tests for the favorites optimistic add/remove and the decide-vacation invalidation of the Personas keys; bundle check script.

### Phase 9: Ajustes

**Files:** every `app/(staff)/ajustes/(admin|personal)/*/page.tsx`, `lib/actions/page-data/ajustes-actions.ts`, `components/ajustes/*`, `components/configuracion/**`, `PuestosClient` / `TramosClient`, and the revalidate clean-up in `task-statuses-`, `workflows-`, `positions-`, `workspace-access-`, `monday-import-`, `app-settings-`, `org-appearance-` and `time-tracking-actions`.

**Acceptance:**
- No client mount refetches.
- No focus-triggered staff refetch.
- The Monday page performs **no writes on GET**, and its poll is `refetchInterval`.
- Integraciones makes no OAuth HTTP calls during render.
- The Notificaciones duplicate header is fixed.
- Theme, general and horario saves keep the layout revalidation and no longer call `router.refresh`.
- Task-status changes invalidate the Tareas board keys.

**Tests:** per-segment hydration tests; Monday poll stops when done and invalidates project and task keys; ThemeEditor save → the `<html>` style updates (existing test, adapted).

### Phase 10: Asistente

**Files:** `app/(staff)/asistente/page.tsx`, `components/asistente/*`, new `lib/stores/assistant-ui-store.ts`, `use-confirmed-context.ts`, `app/api/asistente/chat/route.ts` (incremental saves), `lib/repositories/assistant-repository.ts` (paged messages).

**Acceptance:**
- Switching threads causes 0 RSC requests and 1 thread call, or 0 if cached.
- The thread list loads once per turn.
- Tool outputs invalidate the matching domain keys (for example, an assistant "create note" appears in Mi espacio without a reload).
- The confirmed context does not load PII.

**Tests:** unit test for the tool-part → invalidation mapper; route test that only new messages are written.

### Phase 11: Portal (independent of the staff phases)

**Files:** `app/portal/**`, `lib/portal/{session,queries,appearance,style-server}.ts`, `components/portal/*`.

**Acceptance:**
- Portal project page ≤ 6 q.
- One `appearance.theme` read per request.
- File browser and uploads use `useQuery`.
- `fixedByOrg` is passed to `StyleProvider` (both portal and staff).

**Tests:** query tests for files/uploads with a mocked fetch; DB test that visibility is checked once.

**Global acceptance after every phase:**
- `rg "router.refresh\(\)" components app lib` lists only the auth files.
- Every remaining `revalidatePath` targets a live route.

---

## 6. Other performance problems found

| # | Problem | Where |
|---|---|---|
| 1 | `listTasks` selects the full task row plus **7 correlated subqueries per row**, unbounded; `loadSupport` uses `inArray` over every id | `lib/repositories/tasks-repository.ts:343-417`, `:273-288` |
| 2 | `listBoard` runs a second full `listTasks`; `/tareas` tablero scans twice | `tasks-repository.ts:1189-1202`; `app/(staff)/tareas/page.tsx:95-102` |
| 3 | Shell Tareas badge: full `listMyTasks` just to count | `lib/shell/nav-items/tareas.ts:30` |
| 4 | Bandeja: the notifications list (31 rows) is used only for a count, and it is read twice per render (nav item + slot), plus a third time on `/mi-espacio` | `lib/shell/sidebar-slots/bandeja-badge.tsx:26`; `lib/shell/nav-items/mi-espacio.ts:25`; `app/(staff)/mi-espacio/page.tsx:47` |
| 5 | Layout photo lookup selects the image blob, and is awaited before nav and today | `lib/repositories/preferences-repository.ts:34`; `app/(staff)/layout.tsx:35-37` |
| 6 | `listProjects` has 4 correlated subqueries per project | `lib/repositories/projects-repository.ts:158` |
| 7 | Portfolio loads every schedule task and payment of every project into Node; Resumen computes the whole portfolio to use one row | `lib/repositories/projects-portfolio-repository.ts:33-89,182-203`; `lib/proyectos/project-resumen.ts:59-63` |
| 8 | Full Drive `files.list` on **every project tab** just for a count (×2 on Archivos sub-folders) | `lib/projects/project-tab-shell.ts:15-25,65,115`; `lib/proyectos/project-resumen.ts:52-57,96` |
| 9 | `listTasks` used as a counter (tab shell, Resumen); `/proyectos/[id]/tareas` scans the same tasks twice | `project-tab-shell.ts:61-63`; `project-resumen.ts:93`; `app/(staff)/proyectos/[id]/tareas/page.tsx:54-60` |
| 10 | Ficha: 9 queued client POSTs on mount and after every save; all contacts and full workflows | `app/(staff)/proyectos/[id]/ficha/ProjectFichaClient.tsx:137-174` |
| 11 | Sequential server waterfalls | Cronograma `page.tsx:30-47`; Archivos `:109-116`; Clientes `:58-62`; vacaciones (`VacationDeciders.tsx:15` → `decider-sections.ts:32,41`); Google `page.tsx:30`; Monday `:53`; staff layout `:35`; `listInvitableContacts` 4 sequential q (`portal-contacts-repository.ts:22-48`) |
| 12 | URL-only UI state triggers full server re-renders | `TareasClient.tsx:124-154`; `cronograma-header.tsx:39`; `ProjectTasksByFase.tsx:106,125`; `project-files-view.ts:90`; `PersonasContacts.tsx:208`; `AsistentePageClient.tsx:79,91,109` |
| 13 | Contacts fetched with relations just for tab counts; every contacts tab ships all types; staff fetched just for a count | `lib/personas/tab-counts.ts:15-21`; `lib/repositories/contacts-repository.ts:92-114`; `lib/personas/contacts-page.server.ts:44` |
| 14 | Staff table read twice on `/personas` | `staff-actions.ts:49`; `people-actions.ts:166` |
| 15 | Always-mounted closed sheet fetches staff | `components/directorio/ContactEditorSheet.tsx:215-217` |
| 16 | Member save = 4 serial POSTs | `lib/equipo/use-member-editor.ts:279-336` |
| 17 | Mi espacio mutations and email reads re-render the whole route | `lib/actions/my-space-actions.ts:19-21`; `lib/actions/gmail-actions.ts:247-249` |
| 18 | Full project portfolio loaded twice for name chips | `components/mi-espacio/Inbox.tsx:242`; `GmailReader.tsx:143` |
| 19 | Unbounded lists | notes/checklists (`lib/my-space/notes-checklists.ts:88,142`), assistant messages (`assistant-repository.ts:55-61`), project history (`ProjectBitacoraCard.tsx:23`), portal access rows, Drive `listAll` (`lib/google/staff-files.ts:183`) |
| 20 | Biblioteca loads every section and everyone's personal links, filtered in JS | `lib/biblioteca/load.ts:35-39` |
| 21 | Chat route upserts the full history twice per turn; serial decision loop | `app/api/asistente/chat/route.ts:206-232,234,281` |
| 22 | Heavy client import: `DocumentReader` statically imports `AssistantSheet` (ai-sdk, recharts, react-markdown) and mounts a second `useChat` | `components/biblioteca/DocumentReader.tsx:6,48,208` |
| 23 | Cronograma panels all mount eagerly; `computeProgress` runs twice per render; `computeSCurve` is O(weeks×tasks) | `components/cronograma/cronograma-view.tsx:100`; `lib/cronograma/schedule-table.ts:19`; `lib/cronograma/metrics.ts:113-141` |
| 24 | `new Intl.DateTimeFormat` / `NumberFormat` per call in hot paths. Hoist them to module scope or a per-timezone `Map`, as `lib/my-space/zoned-time.ts:18` already does. | `lib/dashboard/task-trend.ts:34` (Inicio, being fixed); `lib/dashboard/inicio.ts:424`; `lib/proyectos/project-summary.ts:75,83,90,110` (per Gantt bar and file); `lib/people/activity.ts:118` + `lib/people/aggregates.ts:10` (about 3 per activity row); `lib/time-tracking/local-time.ts:21`; `lib/calendar/calendar-agenda.ts:81`; `components/mi-espacio/gmail-format.ts:158-159` (2 per message); `components/tareas/TaskSheet.tsx:319`; `components/tareas/EventDetailPopover.tsx:37`; `lib/my-space/note-ui.ts:87`; `lib/project-flow/start-tramo.ts:52`; `lib/project-flow/admin-tasks.ts:14` |
| 25 | `ProjectSummary` `useMemo` keyed on the props object never hits | `components/proyectos/ProjectSummary.tsx:53` |
| 26 | Uncached settings reads repeated per render | `getTimeTrackingSettings` (`lib/time-tracking/settings.ts:97`, 3× on horario and perfil); `getGeneralSettings` (`app/layout.tsx:83` + `ajustes/(admin)/general/page.tsx:18`); `findUserPreferences`; `fetchMyTodayAction` (layout + perfil); `appearance.theme` 3× on portal |
| 27 | Duplicate client refetch right after server data | `useTaskStatusesEditor.ts:55`; `PuestosClient.tsx:87`; `MiEspacioClient.tsx:96-106`; `MisVacacionesClient.tsx:45-60`; `AsistentePageClient.tsx:110` |
| 28 | Permisos refetches all staff on every window focus; the matrix is saved only to localStorage | `components/configuracion/usePermissionsWorkspace.ts:97,137-166,220` |
| 29 | `listWorkflows` reads all `workflow_phases` unfiltered, in 3 round trips | `lib/repositories/workflows-repository.ts:98-131` |
| 30 | Loops of statements | `importLegacyStateAction`, 2 statements per key in a transaction (`lib/actions/schedule-actions.ts:305-337`); `ensureMissingProjectFoldersAction` creates Drive folders serially in-request (`workspace-access-actions.ts:204`); `reorderStaff` N updates (`staff-repository.ts:181-187`) |
| 31 | No pagination or virtualization in task tables and board | `components/widgets/RecordTable.tsx`, `TaskBoardWidget.tsx`, `components/tareas/TareasLista.tsx` |
| 32 | Double debounce on text size | `components/ajustes/AparienciaClient.tsx:173` + `components/shell/AppearanceProvider.tsx:157-159` |

**Bugs found along the way.** These are not perf, but worth their own issues:
- Cronograma optimistic value likely reverts (`cronograma-view.tsx:43,109,128`; needs a browser check).
- Schedule payments sent to non-admins on Cronograma and Reporte; `getScheduleForProject` doesn't check scope or `deleted_at`.
- `/ajustes/notificaciones` renders the header and nav twice.
- `fixedByOrg` is not passed to `StyleProvider` (portal and staff).
- Permisos never reaches the server.
- `RemindersList` is not mounted anywhere.
- `PortalAccessPanel.run()` refreshes even after an error.
- Resumen ships every staff member's email.
