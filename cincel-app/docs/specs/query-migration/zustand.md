# Query Migration: client UI state (Zustand, URL or TanStack)

Companion to `plan.md` (§4.7). Line numbers are from `main` @ e985f58.

**Verdict key:** **Z** = Zustand (store name) · **URL** = search param · **TQ** = TanStack (it is really server state) · **L** = keep `useState`/local.

## 0. Key findings (read first)

1. **Dashboards hold no UI state today.** `InicioClient.tsx:43-44` only holds `photo` and `renderedAt`. KpiTiles, TramoDonut, WeeklyPaceChart, WorkloadBars, AttentionList, MyDayAgenda and ProjectProgressList have no `useState`, toggles or selection. Proyectos (`ProjectsPortfolio`) and Personas (`EquipoView`) are the same. The dashboard store is therefore **new behaviour**, not a move of existing state. Each interaction it enables (selected KPI, range, collapse, chart/table view, series toggles) needs product sign-off before it is built.
2. **Assistant open is wired twice, and one path is dead.**
   - `AssistantLauncher.tsx:29-32` exports `openAssistant()`, which fires the window event `cincel:open-assistant`.
   - `lib/ui/shell-openers.ts:45` exports a second `openAssistant()` through a module registry. Nobody ever calls `registerShellOpener("assistant", …)`; the only registration is `"search"` at `CommandPalette.tsx:147`.
   - So `CommandPalette.tsx:191` `canOpenShellOverlay("assistant")` is always false, and the palette's "Preguntar al asistente" command never shows.
   - `DocumentReader.tsx:48,208` mounts a **second, eager `AssistantSheet`** with its own conversation.
3. **StyleProvider desync (bug).** There are two levels of provider:
   - `AppShell.tsx:55` wraps the shell with `appearance.style`. The layout does not re-render on client navigation.
   - Each page wraps its own provider (`inicio/page.tsx:51`, `tareas/page.tsx:119`, `proyectos/page.tsx:92`, `proyectos/[id]/page.tsx:59`, `[id]/tareas:69`, `[id]/cronograma:50`, `[id]/archivos:123`).
   - `personas/page.tsx:48-55`, `biblioteca/page.tsx:19-25`, `[seccion]:46` and `vacaciones:33` add a provider **only when `?estilo=` is set**, so they normally use the shell provider.
   - `EstiloSwitch.tsx:52-70` calls `updateMyPreferencesAction` directly. That action has no `revalidatePath`, and `AppearanceProvider` is never told, so `<html data-style>` goes stale too.
   - Repro: change the style on Inicio, then open Personas or Biblioteca. They show the old style until a hard reload.
4. **Session user is read as a non-reactive snapshot** with `useState(() => getCurrentAuthenticatedUser())`:
   - `TareasClient.tsx:120`, `TaskSheet.tsx:356`, `TareasStartSlot.tsx:50`, `EquipoView.tsx:42`.
   - `TareasCalendario.tsx:98` adds a window `focus` listener (`:137`) just to refresh it.
   - These should all read `useSessionStore(selector)`.
5. **Cross-component sync through ad-hoc stores and events. All of it is server state and moves to TQ:**
   - `lib/my-space/bandeja-unread.ts`: module store. `Inbox.tsx:181,266,275` publishes; `bandeja-badge-view.tsx:52` reads.
   - `lib/time-tracking/today-events.ts`: window CustomEvent. `ClockInPrompt.tsx:182` publishes; `TimeClock.tsx:175` subscribes. `CommandPalette.tsx:230` clock-in does **not** publish, it calls `router.refresh()`.
   - Two `TimeClock` instances, the sidebar slot (`lib/shell/sidebar-slots/time-clock.tsx:31`) and the mobile one (`MobileTopBar.tsx:57`), each run their own focus and 5-minute poll (`TimeClock.tsx:188`).
6. **`NewTaskDialog` is mounted 5 times,** each loading its own catalog:
   - `TareasClient.tsx:310` (`?nueva=1`)
   - `TareasTablero.tsx:96` (quick-add)
   - `ProjectTasksByFase.tsx:227`
   - `NoteEditor.tsx:304`
   - `NewTaskDialog.tsx:431-438` (from the URL)

   Its API is only `open` / `onOpenChange` / `defaults` (`:48-53`), so a single host fed by a store is a clean fit.
7. **Prop drilling (3 or more levels):**
   - `TareasClient` builds `header`, `filters` and `empty`, then passes them through `TareasTablero`/`TareasLista`/`TareasCalendarioView` → `ListPage` → `TaskBoardWidget`/`RecordTable`.
   - `onQuickAdd` and `onMove` go `TareasTablero.tsx:69-77` → `ListPage.tsx:79` → `TaskBoardWidget.tsx:182` → `BoardVisual` → card menu (`:310`).
   - `onOpenSearch` goes `AppShellClient.tsx:50` → `Sidebar.tsx:44,102`.
8. **State that should survive navigation but doesn't:**
   - Proyectos search (`ProjectsPortfolio.tsx:85`)
   - Personas contacts search (`PersonasContacts.tsx:104`)
   - Tareas calendar cursor and selected day (`TareasCalendario.tsx:105-106`); the mode `cal` is in the URL but the date is not
   - Biblioteca searches (`BibliotecaIndex.tsx:47`, `BibliotecaSection.tsx:74`)
9. **Things that look like UI state but aren't:**
   - Board column collapse is *derived* (empty columns, `TaskBoardWidget.tsx:217,260`), not toggleable.
   - The shadcn sidebar cookie (`ui/shadcn/sidebar.tsx:28`) is unused because the Sidebar is `collapsible="none"` (`Sidebar.tsx:87`).
   - `UnifiedCalendar` default export (`components/calendario/UnifiedCalendar.tsx:204-232`) is dead; only its helpers are imported, by `AgendaWidget.tsx:6`.

---

## 1. Inventory per page

### Shell (layout, AppShell, Sidebar, BottomTabs, CommandPalette, Assistant, TimeClock, Style/Appearance)

| UI state | file:line | Current | Verdict | Reason |
|---|---|---|---|---|
| Search palette open | `AppShellClient.tsx:50` → prop `Sidebar.tsx:44,102`; `CommandPalette.tsx:146-147` ⌘K + `registerShellOpener("search")`; `shell-openers.ts:16` registry | useState + prop + module registry | **Z `useShellUi`** | Opened from the Sidebar, ⌘K and other pages; replaces the registry and the prop. |
| 404 palette open + second ⌘K listener | `NotFoundSearchButton.tsx:16,25` | useState (root `app/not-found.tsx`, outside the shell) | **Z `useShellUi`** (same actions) | One opener API everywhere; no double ⌘K handler if the 404 ever renders inside the shell. |
| Palette query text | `CommandPalette.tsx:126` | useState | L | Input draft, reset on close. |
| Palette results / error | `CommandPalette.tsx:127,153-169` | useState + debounced action | TQ `qk.search(q)` | Server data (`keepPreviousData`). |
| Palette `today` | `CommandPalette.tsx:128,172-184` | useState fetched on open | TQ `qk.me.today()` | Same data as TimeClock. |
| Palette clockingIn | `CommandPalette.tsx:129` | useState | TQ mutation `isPending` | Mutation state. |
| Assistant open / mounted | `AssistantLauncher.tsx:51,53`; event `:29-32,76-80`; `shell-openers.ts:45` | useState + window event + dead registry | **Z `useAssistantUi`** | Opened by the button, ⌘J, the palette and DocumentReader. Removes the event and the registry. |
| Assistant page context | `AssistantLauncher.tsx:57-60` (route + `?tarea`) | derived useMemo | derived + **Z** `contextOverride` | Route-derived by default; callers like DocumentReader pass an override. |
| Assistant sheet conversation id | `AssistantSheet.tsx:113-116,223` | useState | **Z `useAssistantUi.threadId`** | Lets the palette, `/asistente` and the sheet share a thread; survives navigation. |
| Sheet messages / thread list | `AssistantSheet.tsx:120,156,174-187` | useState + actions | TQ `qk.assistant.threads()`, `qk.assistant.thread(id)` | Server data. |
| Sheet input / files / listening / error | `AssistantSheet.tsx:117-119,121,123` | useState | L | Composer draft. |
| Sheet context store | `AssistantSheet.tsx:128` (`AssistantContextStore`) | class instance | L (fed from the Z context) | Transport plumbing. |
| Confirmed context chip | `use-confirmed-context.ts:44` | useState + effect | TQ `qk.assistant.confirmedContext(key)` | Server lookup. |
| Bottom "Más" sheet | `BottomTabs.tsx:81` | useState | L | One component. |
| TimeClock status | `TimeClock.tsx:138`; events `:175`; poll `:188` | useState + window event + interval ×2 instances | TQ `qk.me.today()` (`refetchInterval` 5 min, `refetchOnWindowFocus`) | Server state (plan §4.7). |
| TimeClock tick / announcement / pending | `TimeClock.tsx:139-141` | useState | L (pending → mutation) | Per instance. |
| ClockInPrompt open | `ClockInPrompt.tsx:130,147` | useState after mount | L | Single component. |
| ClockInPrompt "seen today" | `ClockInPrompt.tsx:55,105,113` (`cincel.clockInPrompt.seen`) | localStorage | L (optionally move to Z persist) | Already read after mount; one reader. Move only if another surface needs it. |
| Bandeja unread | `bandeja-unread.ts:10-43`; `bandeja-badge-view.tsx:52` | module store | TQ `qk.shell.badges()` | Server state (plan). |
| Badge clock | `bandeja-badge-view.tsx:33` | useState tick | L | — |
| Avatar photo | `AvatarMenu.tsx:84` (duplicated by `InicioClient.tsx:43` and `PerfilClient`) | useState ×3 + `router.refresh` | TQ `qk.me.profile()` | Server state; one cache replaces three copies. |
| Presentation style | `StyleProvider.tsx:49-55`; shell provider `AppShell.tsx:55`; per-page providers; `EstiloSwitch.tsx:52-70` | context ×2 levels | **StyleProvider stays the API.** Back its *persisted* value with **Z `usePresentationStyle`** (see §2.6) or revalidate the layout. | Fixes finding 3 without a second style API. Needs a decision: plan §4.7 says the style stays in StyleProvider. |
| Appearance (theme/mode/density/text size) | `AppearanceProvider.tsx:95-96`, context `:29` | context + `<html>` writes | L (context) | SSR-seeded first paint (plan §4.6); must not flash. |
| Mobile breakpoint | `use-mobile-shell.ts:35`, `hooks/use-mobile.ts:6` | useSyncExternalStore / useState (duplicate hooks) | L | Browser media state; dedupe the hooks separately. |
| Offline | `OfflineBanner.tsx:34` | useSyncExternalStore | L | Browser state. |
| Session access | `lib/stores/session-store.ts` | Zustand | keep | Already correct; make consumers reactive (finding 4). |

### Inicio (`app/(staff)/inicio/page.tsx`, `components/inicio/*`)

| UI state | file:line | Current | Verdict | Reason |
|---|---|---|---|---|
| Profile photo | `InicioClient.tsx:43,51-55` | useState + `router.refresh` | TQ `qk.me.profile()` | Server state. |
| renderedAt | `InicioClient.tsx:44` | useState initializer | L | SSR/CSR-stable greeting. |
| Photo upload pending / error | `ProfilePhotoButton.tsx:49-50` | useState | L → mutation | — |
| WidgetCard empty detection | `WidgetCard.tsx:57` | useState + MutationObserver | L | DOM-derived. |
| Selected KPI, range, collapsed widgets, chart/table per widget, series toggles | *(none today)*: KpiTiles, WeeklyPaceChart (fixed 8 weeks, `types/redesign.ts:288-289`), TramoDonut, WorkloadBars | — | **Z `useInicioDashboard`** (new) | Owner's dashboard pattern. Range is a client window over the 8 weeks already loaded unless the loader grows a range input (then it becomes URL + query key). |
| Style (Visual/Esencial/Analítico) | `inicio/page.tsx:51`, `EstiloSwitch` `InicioClient.tsx:72` | StyleProvider | StyleProvider | Not duplicated in the dashboard store. |

### Tareas: tablero / lista / calendario + TaskSheet

| UI state | file:line | Current | Verdict | Reason |
|---|---|---|---|---|
| vista, cal, tramo, responsable, proyecto, estado, q | `lib/tareas/query.ts:11-20`; `TareasClient.tsx:124-131` | URL (`router.replace`) | **URL** (unchanged) | Shareable. Phase 4 swaps the RSC re-render for a query-key change. |
| Search draft | `TareasClient.tsx:136-153` | useState + debounce to `q` | L | Input draft. |
| Facet counts / options | `TareasClient.tsx:156-218` | useMemo over all tasks | TQ `taskFacets` (plan) | Server aggregation. |
| `?nueva=1` new-task dialog | `use-new-task-param.ts:26-32`; `TareasClient.tsx:119,310` | URL | URL as **entry** → **Z `useNewTaskUi.open()`** | Keep the deep link; one host dialog. |
| Quick-add column | `TareasTablero.tsx:68-69,96` (second dialog) | useState, drilled via `ListPage` → `TaskBoardWidget` → `BoardVisual` | **Z `useNewTaskUi.open({status})`** | Removes the second mount and the `onQuickAdd` drill. |
| Board move + optimistic | `TareasTablero.tsx:71-77` (`router.refresh`); `TaskBoardWidget.tsx:211-235` | useState optimistic | TQ mutation (optimistic `setQueryData`) | Server state. |
| Drag state | `useBoardDrag.ts:21-22` | useState | L | One board instance; transient. |
| Column collapse | `TaskBoardWidget.tsx:217,260` | derived (empty columns) | none | Not user state. |
| Lista row selection | `RecordTable.tsx:101-114` | useState | L | Only feeds export inside the same widget. Move to Z only if a bulk bar outside the table appears. |
| Filter combobox open | `TareasFilterCombobox.tsx:44` | useState | L | — |
| Calendar rows / loaded range / error | `TareasCalendario.tsx:102-104,152-174` | useState + action | TQ `qk.tareas.calendar({from,to,filters})` | Server data. |
| Calendar cursor (month/week anchor) | `TareasCalendario.tsx:105,197-200` | useState (lost on reload/back) | **URL `?fecha=YYYY-MM-DD`** | Bookmarkable; matches Cronograma `?week=`. |
| Calendar selected day | `TareasCalendario.tsx:106` | useState | **Z `useTareasUi.calendar.selectedDay`** | Survives switching views and back within the session. Not worth a URL entry. |
| Feed dialog open | `TareasCalendario.tsx:107,124-127` (reopened after OAuth return) | useState | L | One component; the OAuth reopen stays local. |
| Event popover | `TareasCalendario.tsx:108`; `EventDetailPopover.tsx:95-96` | useState | L | Anchor-bound. |
| now tick | `TareasCalendario.tsx:395` | useState | L | — |
| Authenticated user snapshot | `TareasClient.tsx:120`, `TareasCalendario.tsx:98,137`, `TaskSheet.tsx:356`, `TareasStartSlot.tsx:50` | useState(getter) | **Z `useSessionStore`** selector | Reactive; drop the focus listener. |
| TaskSheet open / id | `TaskSheet.tsx:96-108` (`?tarea=`), `:463` push | URL | **URL** | Shareable deep link. |
| TaskSheet task / statuses / workflows / staff / spaces | `TaskSheet.tsx:346-350` | useState + effects | TQ `getTaskSheetData` + `catalog.*` | Server data. |
| TaskSheet title/notes draft, busy, errors | `TaskSheet.tsx:351-354` | useState | L | Form draft. |
| Comment composer + mentions | `TaskSheet.tsx:157-162` | useState | L | — |
| Subtasks list / add | `TaskSubtasks.tsx:40-44` | useState | TQ list; L draft | — |
| Dependencies + picker | `TaskDependencies.tsx:115-121` | useState | TQ deps/candidates; L picker open + pendingRemove | — |
| NewTaskDialog catalog / staff | `NewTaskDialog.tsx:80-82` | useState + action per mount | TQ `catalog.projectOptions`, `catalog.staff` | Loaded once instead of five times. |
| NewTaskDialog draft / errors / pending | `NewTaskDialog.tsx:77-79,83-85` | useState | L | Draft. |
| Start slot board / candidates | `TareasStartSlot.tsx:55-57` | useState | TQ | Server. |
| Start slot target project | `TareasStartSlot.tsx:58,92-105` (`?project&iniciar`) | useState + URL | URL entry + L | Deep link. |
| StartTramoSheet preview / load | `StartTramoSheet.tsx:113-116` | useState | TQ | Server. |
| StartTramoSheet form (phases, mode, managers, autoStart) | `StartTramoSheet.tsx:117-121` | useState | L | Form. |
| Google feed dialog status / url | `CalendarFeedDialog.tsx:40-43,142-146` | useState | TQ status; L copied/busy | — |
| Header/filters/empty drilled to views | `TareasClient.tsx:220-300` → views → `ListPage` | props, 3 levels | keep props | Render slots (ReactNode), not state; acceptable. |

### Proyectos: list + tabs (Resumen, Ficha, Tareas, Cronograma, Archivos, Clientes)

| UI state | file:line | Current | Verdict | Reason |
|---|---|---|---|---|
| Portfolio search | `ProjectsPortfolio.tsx:85` | useState (lost on navigation) | **URL `?q=`** (+ local draft debounce like Tareas) | Shareable; consistent with Tareas. |
| New project dialog | `ProjectsPortfolio.tsx:86,91-123` (`?nuevo=1`) | useState + URL | URL entry + L | One component. |
| Dashboard widgets (tramo strip, cards/table) | `ProjectsPortfolio.tsx:103-105` | none | **Z `useProyectosDashboard`** (new, optional) | Same pattern as Inicio, if approved. |
| Tab nav | `ProjectSectionNav.tsx:92`, `ProjectTabs.tsx:78-104` | route | route | — |
| Ficha project / tasks / spaces / staff / contacts / workflows / loading / notFound | `ProjectFichaClient.tsx:105-113` | useState + effects | TQ | Server (plan: no client loading flashes). |
| Ficha isEditing / draft / adminDraft / confirmClientChange / save | `ProjectFichaClient.tsx:114-119` | useState | L | Form. |
| Ficha remap sheet + notice | `ProjectFichaClient.tsx:134-135` | useState | L | — |
| Spaces list | `ProjectSpacesCard.tsx:40` | useState copy | TQ (optimistic) | Server. |
| Spaces add/delete UI | `ProjectSpacesCard.tsx:41-45` | useState | L | — |
| Tramos card | `ProjectTramosCard.tsx:49-51` | useState | L / mutation | — |
| Project tareas search | `ProjectTasksByFase.tsx:70` | useState (initial `query.q`) | L draft → URL `q` (already parsed) | Keep in step with the URL. |
| Project tareas filters | `ProjectTasksByFase.tsx:125` | URL push | URL | — |
| Project new-task dialog | `ProjectTasksByFase.tsx:71,227` | useState + own mount | **Z `useNewTaskUi`** | Single host. |
| Cronograma week | `cronograma-view.tsx:41`, `cronograma-header.tsx:31-39` | URL `?week=` | URL | Shareable. |
| Cronograma view / loading / notFound / error | `cronograma-view.tsx:43-46` | useState | TQ `qk.proyectos.schedule(id)` | Server. |
| Cronograma announcement | `cronograma-view.tsx:47` | useState | L | a11y live region. |
| Imprevistos list | `imprevistos-panel.tsx:39` | useState + useOptimistic | TQ | Server. |
| Imprevistos form | `imprevistos-panel.tsx:45-47` | useState | L | — |
| Import dialog | `import-dialog.tsx:31-44` | useState | L (preview → mutation result) | — |
| Archivos folder | `ProjectFilesBrowser.tsx:56-58` (`?folder=`) | URL | URL | — |
| Archivos selected file | `ProjectFiles.tsx:65` | useState | L | Preview pane, one component. |
| Portal access panel invite / confirm / notice | `PortalAccessPanel.tsx:134-136` | useState | L | — |
| Invite sheet form | `InvitePortalClientSheet.tsx:71-78` | useState | L | — |
| Portal activity / bitácora / folder hint | `PortalActivityCard.tsx:25-27`, `ProjectBitacoraCard.tsx:19-21`, `PortalClientFolderHint.tsx:16-17` | useState + effect | TQ | Server. |
| Remap import sheet | `RemapImportSheet.tsx:214-219` | useState | TQ load/preview; L targets, confirming | — |

### Personas: Equipo / Clientes / Contratistas / Proveedores + PersonaDetalle

| UI state | file:line | Current | Verdict | Reason |
|---|---|---|---|---|
| Tab | `PersonasTabs.tsx:27-42` (route + `?estilo` carried) | route | route | — |
| Authenticated user | `EquipoView.tsx:42` | useState snapshot | Z `useSessionStore` selector | Reactive. |
| Member editor (show, editingId, editingStaff, access preview, draft, error, saving) | `use-member-editor.ts:73-79` → ~15 props into `MemberEditorDrawer` (`EquipoView.tsx:72-91`) | hook + props (1 level) | L (editingStaff/access → TQ) | Single page; editor scoped. |
| Contacts search | `PersonasContacts.tsx:104` | useState | **URL `?q=`** (debounced) | Shareable, survives back. |
| Contact editor (show, editingId, draft, error, delete) | `PersonasContacts.tsx:105-110` | useState | L | Form. |
| Contact detail sheet | `PersonasContacts.tsx:112,132-137` (`?contacto=`) | URL | URL | Shareable. |
| Contact detail data | `PersonasContacts.tsx:113-127` | useState + effect | TQ `qk.personas.contact(id)` | Server. |
| Subfilter (proveedores) | `PersonasContacts.tsx:100` (prop from URL) | URL | URL | — |
| Contact editor staff options | `ContactEditorSheet.tsx:213` | useState | TQ `catalog.staff` | — |
| Client history | `ClientDetailSheet.tsx:64` | useState | TQ | — |
| Recheck access | `RecheckAccessButton.tsx:22-23` | useState | L / mutation | — |
| Availability / team widgets | `AvailabilityWeek`, `TeamGrid`, `TeamTable` | none | **Z `usePersonasDashboard`** (new, optional) | Dashboard pattern if approved. |
| PersonaDetalle (`/personas/equipo/[id]`) | `PersonaDetail.tsx` | no state | — | — |

### Mi espacio / Bandeja / Gmail

| UI state | file:line | Current | Verdict | Reason |
|---|---|---|---|---|
| Notes / checklists / reminders lists | `MiEspacioClient.tsx:51-81` (`useSyncedList`) | useState mirror of props | TQ | Server. |
| Bandeja tab | `MiEspacioClient.tsx:87` (URL) **and** `Inbox.tsx:137,159-162` (local copy synced from props) | URL + duplicate useState | **URL only** | Remove the duplicate. |
| Note editor | `MiEspacioClient.tsx:90-94`, `search-params.ts:7-27` (`?nota=`, `history.replaceState`) | URL | URL | Shareable. |
| Gmail reading pane | `MiEspacioClient.tsx:88` (`?correo=`) | URL | URL | — |
| Notifications / threads / cursors / unread / loadingMore | `Inbox.tsx:138-142,144,158-175` | useState | TQ infinite + `qk.shell.badges` | Server. |
| Inbox poll | `Inbox.tsx:188-227` | setInterval + visibilitychange | TQ `refetchInterval` | Plan. |
| Inbox now tick | `Inbox.tsx:143` | useState | L | — |
| Project options | `Inbox.tsx:145`, `GmailReader.tsx:132` | useState ×2 | TQ `catalog.projectOptions` | Duplicate fetch. |
| Row action panel (link / task per thread) | `Inbox.tsx:122,146` | useState | L | One list. |
| Panel form | `Inbox.tsx:656-659` | useState | L | — |
| Gmail thread data / attempt | `GmailReader.tsx:56-57` | useState | TQ `qk.gmail.thread(id)` | — |
| Show images / pickedId / pending / error / draftOpen | `GmailReader.tsx:131,134-137` | useState | L | — |
| Linked project | `GmailReader.tsx:133` | useState copy | TQ (thread field) | — |
| Draft sheet | `GmailDraftSheet.tsx:40-57` | useState | L | Form. |
| Checklist current / source | `ChecklistCard.tsx:73-74` | useState mirror | TQ optimistic | — |
| Checklist add draft | `ChecklistCard.tsx:84-86` | useState | L | — |
| Note editor draft | `NoteEditor.tsx:95-97` | useState | L | — |
| Note → task dialog | `NoteEditor.tsx:98,304-312` | useState + own mount | **Z `useNewTaskUi.open({title, description, projectId})`** | Single host. |
| Quick capture | `QuickCapture.tsx:69-72` | useState | L | — |
| Reminder dialog form | `ReminderDialog.tsx:90-94` | useState | L | — |
| Reminder link search | `ReminderDialog.tsx:307-309` | useState | L open/query; TQ results | — |
| RemindersList | `RemindersList.tsx:56-57` | useState mirror | delete if dead (plan Phase 7) | — |

### Biblioteca and Mis vacaciones

| UI state | file:line | Current | Verdict | Reason |
|---|---|---|---|---|
| Index search | `BibliotecaIndex.tsx:47` | useState | L (or URL `?q=`) | Low value; keep local unless product wants it shareable. |
| Recent documents | `use-recent-documents.ts:11-52` + `resources-model.ts:12,67-115` (`cincel.resources.recent-docs.v1`) + `notifyRecentDocumentsChanged` (`DocumentReader.tsx:61-62`, `BibliotecaSection.tsx:93-94`) | localStorage + custom window event + useSyncExternalStore | **Z `useRecentDocs`** (persist, same key and shape) | Removes the custom event; multi-tab through the persist `storage` listener. |
| Section links (favorites) | `BibliotecaSection.tsx:73` | useState copy | TQ optimistic | Server. |
| Section search | `BibliotecaSection.tsx:74` | useState | L | — |
| Preview / drive preview / pending / error | `BibliotecaSection.tsx:75-78`, `DocumentReader.tsx:47` | useState | L | — |
| DocumentReader assistant | `DocumentReader.tsx:48,208` (second `AssistantSheet`) | useState + eager sheet | **Z `useAssistantUi.openAssistant({context:{route}})`** | One lazy sheet (plan Phase 8). |
| Drive browser path / search | `DriveBrowser.tsx:62,64` | useState | L | Picker-local. |
| Drive entries / account / consent | `DriveBrowser.tsx:63,65-68` | useState | TQ | — |
| Drive picker selection | `DrivePickerDialog.tsx:19` | useState | L | — |
| Vacaciones mine / absences | `MisVacacionesClient.tsx:42-43` | useState | TQ | — |
| Vacation form | `VacationForm.tsx:41-44` | useState | L | — |
| Vacation history cancel target | `VacationHistory.tsx:36-38` | useState | L | — |
| Team requests decided set | `TeamRequests.tsx:90` | useState optimistic | TQ optimistic | — |
| Team requests target / note | `TeamRequests.tsx:91-93` | useState | L | — |
| Vacation settings view / draft | `VacationSettings.tsx:98-102` | useState | TQ view; L draft | — |

### Ajustes (all segments)

| UI state | file:line | Current | Verdict | Reason |
|---|---|---|---|---|
| Apariencia preferences / textSize / locked | `AparienciaClient.tsx:110-113`, `apariencia-context.tsx:16-38` | useState + page context | L (context) on top of `AppearanceProvider` | Page-scoped form context, reset per segment. Correct as is. |
| Horario | `HorarioClient.tsx:52-56`, `horario-context.tsx:30` | useState + context | L (saved → TQ) | — |
| Notificaciones matrix / quiet hours | `NotificacionesClient.tsx:96-99`, context `:81` | useState + context | L | Form. |
| Perfil data / form / password | `PerfilClient.tsx:85,195-197,395-397`, context `:70` | useState + context | TQ data; L form | — |
| Integraciones status / dialogs | `IntegracionesClient.tsx:121,161-164`, context `:100` | useState + context | TQ status; L | — |
| Theme editor draft / published / mode / reset | `ThemeEditor.tsx:71-76` | useState | L draft and mode; TQ published | — |
| Estatus editor | `EstatusSettings.tsx`, `useTaskStatusesEditor.ts` (10) | useState | TQ list; L editor | — |
| Permisos custom matrix | `usePermissionsWorkspace.ts:94,103,226` + `lib/auth/permissions.ts:6,830` (`cincel.permissions.custom.v1`) | localStorage | **Out of scope; flag** | Org configuration kept per browser; should be server state (separate issue), not Zustand. |
| General settings legacy key | `lib/settings/general-settings.ts:4,223,242` | localStorage read/remove | leave | Legacy cleanup. |
| Monday wizard steps | `MondayImportWizard.tsx` (22 useState) | useState | L (run status → TQ poll) | Wizard-local. |
| Monday reviewed ids | `MondayImportWizard.tsx:78-88` (`reviewedKey(runId)`) | localStorage | L (route through `browser-state-repository`) | Per-run scratch, one reader. |
| Puestos / Tramos editors | `PuestosClient.tsx` (12), `TramosClient.tsx` (13), `PhaseEditorDrawer`, `PositionEditorDrawer` | useState | TQ lists; L editors | — |
| Settings nav | `AjustesNavFromPath` | route | route | — |

### Asistente (`/asistente`)

| UI state | file:line | Current | Verdict | Reason |
|---|---|---|---|---|
| Active thread | `AsistentePageClient.tsx:52-56,79,95,111` (`?thread=`) | useState + URL | **URL** for the page; mirror into **Z `useAssistantUi.threadId`** | Shareable, and the sheet can continue the same thread. |
| Threads list | `AsistentePageClient.tsx:51,63-69` | useState | TQ `qk.assistant.threads()` | — |
| Thread messages / loadingId | `:58,72-87` | useState | TQ `qk.assistant.thread(id)` (`isFetching`) | — |
| Notice | `:57` | useState | L | — |
| Prompt draft injection | `:59,115-117` → `AssistantChat.tsx:83` | useState nonce | L | Page-local. |
| Chat input / error | `AssistantChat.tsx:47-52` | useState | L | — |
| Confirmation responded | `ConfirmationCard.tsx:46` | useState | L | — |

### Portal (phase 11, for completeness)

`PortalFileBrowser.tsx:85-91` (folder → URL; list → TQ), `PortalUploader.tsx:160-163` (upload queue and drag → L; uploads → TQ), `PortalLoginForm` (L). The portal `StyleProvider` (`app/portal/layout.tsx:43`) uses a cookie. **No Zustand store is needed.**

---

## 2. Proposed stores

### Conventions for every store
- File `lib/stores/<name>-store.ts`, `"use client"`. Export:
  - the hook `use<Name>`
  - a `<NAME>_INITIAL` constant
  - `reset<Name>()` for tests
- Selectors live next to the store. Components select primitives, or use `useShallow` for objects and tuples. Never `useStore()` without a selector.
- Actions are stable, in the same `create` call. Components read them with `useX((s) => s.open)`.

### 2.1 `useShellUi`: `lib/stores/shell-ui-store.ts`
```ts
type ShellUiState = {
  searchOpen: boolean;
  /** True while a CommandPalette is mounted (replaces canOpenShellOverlay("search")). */
  searchAvailable: boolean;
  openSearch(): void;
  closeSearch(): void;
  setSearchOpen(open: boolean): void;
  toggleSearch(): void;
  setSearchAvailable(available: boolean): void;
};
```
- **Persist:** none. **Reset:** session; it lives in the layout. On route change: `AppShellClient` calls `closeSearch()` when the pathname changes (the palette already closes on result click).
- **Writes:**
  - `CommandPalette`: ⌘K → `toggleSearch`, `onOpenChange` → `setSearchOpen`, mount/unmount → `setSearchAvailable`
  - `Sidebar` search button → `openSearch`, which drops the `onOpenSearch` prop
  - `NotFoundSearchButton`
- **Reads:** `CommandPalette` (`open`).
- **Delete:** `lib/ui/shell-openers.ts`. Keep `openCommandPalette()` as `useShellUi.getState().openSearch()` for non-React callers.

### 2.2 `useAssistantUi`: `lib/stores/assistant-ui-store.ts` (plan §4.7, Phase 10)
```ts
type AssistantOpenOptions = { context?: Partial<AssistantContext>; threadId?: string | null; prompt?: string };
type AssistantUiState = {
  open: boolean;
  /** Sheet chunk requested at least once; stays true so the sheet keeps its state and close animation. */
  mounted: boolean;
  /** True while AssistantLauncher is active on this route (replaces canOpenShellOverlay("assistant")). */
  available: boolean;
  /** Caller-provided context merged over the route context (DocumentReader → { route }). */
  contextOverride: Partial<AssistantContext> | null;
  threadId: string | null;
  pendingPrompt: { text: string; nonce: number } | null;
  openAssistant(opts?: AssistantOpenOptions): void;
  close(): void;
  toggle(): void;
  setOpen(open: boolean): void;
  setAvailable(available: boolean): void;
  setThreadId(id: string | null): void;
  consumePrompt(): void;
};
```
- **Persist:** none for `open`, `mounted` and `contextOverride`. `threadId` optionally persists to **sessionStorage**, key `cincel.ui.assistant.v1`, so a reload keeps the conversation. This is a product decision; the default is no persistence.
- **Reset:** `close()` clears `contextOverride`. `threadId` is kept across navigation; "Nueva conversación" sets it to null.
- **Writes:** `AssistantButton` (onOpen), the ⌘J handler in `AssistantLauncher`, `CommandPalette` "Preguntar al asistente" (shown when `available`), `DocumentReader` (`openAssistant({context:{route}})`), `AssistantSheet` (`setThreadId` on a new thread or on "Nueva"), `AsistentePageClient` (`setThreadId` on select).
- **Reads:** `AssistantLauncher` (`mounted`, `open`, `available`), `AssistantSheet` (`threadId`, `contextOverride`, `pendingPrompt`).
- **Delete:** the `OPEN_ASSISTANT_EVENT` window event (`AssistantLauncher.tsx:29-32,76-80`), the second sheet in `DocumentReader.tsx:208`, and `shell-openers.openAssistant`.

### 2.3 `useNewTaskUi`: `lib/stores/new-task-store.ts`
```ts
type NewTaskUiState = {
  open: boolean;
  defaults: NewTaskDefaults | undefined;
  /** Which surface opened it, for focus return and analytics. */
  source: "tareas" | "tablero-quick-add" | "proyecto" | "nota" | "url" | "inicio" | null;
  openNewTask(defaults?: NewTaskDefaults, source?: NewTaskUiState["source"]): void;
  closeNewTask(): void;
};
```
- **Persist:** none.
- **Host:** a single `<NewTaskDialogHost/>` mounted once in `AppShellClient`, gated by the `canCreateActivity` capability read from `useSessionStore`. It reads the store and renders `NewTaskDialog`. `?nueva=1` (`use-new-task-param.ts`) becomes an effect in the host: it calls `openNewTask(fromUrl, "url")` and strips the param. The Inicio "Nueva tarea" link keeps `/tareas?nueva=1` or calls `openNewTask()` directly.
- **Writers:** `TareasClient` button, `BoardVisual` "+ Agregar" (`openNewTask({status})`, which removes the `onQuickAdd` drill through `ListPage`), `ProjectTasksByFase`, `NoteEditor`.
- **Removes:** 4 extra `NewTaskDialog` mounts and their per-mount catalog loads; the catalog goes to TQ.

### 2.4 `useTareasUi`: `lib/stores/tareas-ui-store.ts`
```ts
type TareasUiState = {
  calendar: { selectedDay: string | null /* YYYY-MM-DD */ };
  selectCalendarDay(day: string | null): void;
  reset(): void;
};
```
- The cursor goes to the **URL** (`?fecha=`), added to `TareasQuery` and `parseTareasQuery`/`toTareasSearch`. `selectedDay` defaults to `?fecha` or today when null.
- **Persist:** none. **Reset:** the session; also cleared when `?fecha` moves outside the visible range.
- **Readers/writers:** `TareasCalendario` (day cells, aside), `AgendaWidget` if it highlights the day.
- Keep it small. The plan's "popover, feed dialog" stay **local** (one component each). Analítico has no column state today.

### 2.5 Dashboard store factory: `lib/stores/dashboard-store.ts`, with instances
- `lib/stores/inicio-dashboard-store.ts`: `useInicioDashboard = createDashboardStore<InicioWidget, InicioKpiKey>("inicio")`
- `lib/stores/proyectos-dashboard-store.ts` and `lib/stores/personas-dashboard-store.ts` (optional, same factory)

```ts
export type WidgetView = "chart" | "table";
export type DashboardRange = "4w" | "8w" | "12w";

export type DashboardUiState<W extends string, K extends string> = {
  selectedKpi: K | null;                        // session only
  range: DashboardRange;                         // client window over loaded data
  collapsed: Partial<Record<W, boolean>>;
  /** Per-style overrides: what the user picked while in that style. */
  views: Partial<Record<PresentationStyle, Partial<Record<W, WidgetView>>>>;
  hiddenSeries: Partial<Record<W, string[]>>;
  selectKpi(key: K | null): void;
  toggleKpi(key: K): void;
  setRange(range: DashboardRange): void;
  toggleCollapsed(widget: W): void;
  setCollapsed(widget: W, collapsed: boolean): void;
  setWidgetView(style: PresentationStyle, widget: W, view: WidgetView): void;
  toggleSeries(widget: W, series: string): void;
  reset(): void;
};

export function createDashboardStore<W extends string, K extends string>(
  id: "inicio" | "proyectos" | "personas",
  defaults?: Partial<Pick<DashboardUiState<W, K>, "range" | "collapsed">>,
): UseBoundStore<StoreApi<DashboardUiState<W, K>> & { persist: … }>;
```
- **Persist:** `persist` + `createJSONStorage(() => localStorage)`, key `cincel.ui.dashboard.<id>.v1`, `version: 1` with `migrate`. `partialize: ({range, collapsed, views, hiddenSeries}) => …`. `selectedKpi` is not persisted (session only). Use `skipHydration: true` (see §3 SSR).
- **Reset:** survives navigation (module store). `selectedKpi` clears on `reset()` or when the KPI disappears from data.
- **Composition with Visual/Esencial/Analítico, without duplicating StyleProvider:**
  - The store never holds the current style. Style-dependent selectors take it as an argument from `useStyle()`:
    ```ts
    export function useWidgetView<W extends string>(store: DashboardStore<W, any>, widget: W, fallback: Record<PresentationStyle, WidgetView>) {
      const { style } = useStyle();
      return store((s) => s.views[style]?.[widget] ?? fallback[style]);
    }
    ```
  - Per-style defaults stay in the widgets. For example `KpiWidget` already renders a table in Analítico, and the `KpiDatum.visibleIn` server config stays server-side. The store only stores *user overrides keyed by style*, so a "table" pick in Visual doesn't leak into Esencial.
  - `selectedKpi`, `range` and `collapsed` are style-agnostic.
  - `StyleView` and `StyleContent` stay as the only branching points.
- **Selectors:**
  - Each widget uses one primitive selector, e.g. `useInicioDashboard((s) => s.collapsed.weeklyPace ?? false)`.
  - Action bundles use `useShallow((s) => [s.toggleCollapsed, s.setWidgetView])`.
  - KpiTiles reads `selectedKpi` only, and widgets that react to it read only that.
- **Inicio wiring:**
  - Widget ids: `kpis | tramoDonut | weeklyPace | attention | myDay | projectsProgress | workload`.
  - `KpiTiles` writes `toggleKpi`. `WidgetCard` gets a collapse toggle (`actions` slot) that writes `toggleCollapsed`. `WeeklyPaceChart` reads `range` (slices `weeklyPace`) and `hiddenSeries.weeklyPace` (created/completed). `TramoDonut` and `WorkloadBars` read `useWidgetView`.
  - `InicioClient` stays style-agnostic.
- **Rule:** if a dashboard control ever changes what the **server returns** (for example a 12-week range beyond the loaded 8), it is a **query-key input**. It moves to the **URL** (shareable), not the store.

### 2.6 `usePresentationStyle`: `lib/stores/presentation-style-store.ts` (fixes finding 3; needs a decision)
```ts
type PresentationStyleState = {
  /** The persisted user style, seeded from the server once per session. */
  userStyle: PresentationStyle | null;
  seed(style: PresentationStyle): void;   // first seed wins until setUserStyle
  setUserStyle(style: PresentationStyle): void;
};
```
- `StyleProvider` keeps its public API (`useStyle()`).
  - Without `isOverridden`, it renders `userStyle ?? props.style`.
  - With `?estilo=`, it keeps local state as today.
- `EstiloSwitch` calls `setUserStyle` (and rolls it back on error), then `useAppearance().setPreference({style})` instead of calling the action directly. That keeps `<html data-style>` and `AppearanceProvider` in sync.
- Not persisted; the server is the source.
- Alternative without a store: make `updateMyPreferencesAction({style})` revalidate the layout. The store avoids the round trip.
- **Seeding must be SSR-safe.** Use a `<PresentationStyleSeed style>` client component, or a context-scoped store.

### 2.7 `useRecentDocs`: `lib/stores/recent-docs-store.ts`
```ts
type RecentDocsState = {
  docs: RecentDocument[];        // max RECENT_DOCS_LIMIT
  remember(doc: RecentDocumentInput, opts?: { href?: string }): void;
  clear(): void;
};
```
- **Persist:** key **`cincel.resources.recent-docs.v1` (unchanged)**. A custom `storage` adapter reads and writes the existing bare-array shape: zustand wraps state as `{state, version}`, so either migrate once or use a custom `getItem`/`setItem` that maps to the array. `skipHydration` + rehydrate after mount.
- Multi-tab sync: a `window.addEventListener("storage", () => useRecentDocs.persist.rehydrate())` in the store module.
- **Removes:** `use-recent-documents.ts` and `notifyRecentDocumentsChanged`.
- **Writers:** `DocumentReader.tsx:61`, `BibliotecaSection.tsx:93`. **Reader:** `BibliotecaIndex` "Abiertos recientemente".

### 2.8 Existing `useSessionStore`: keep, and add selectors
`lib/stores/session-store.ts` adds `selectAuthenticatedUser`, a memoized selector equivalent to `toAuthenticatedUser`. Replace the `useState(() => getCurrentAuthenticatedUser())` snapshots listed in finding 4.

**Not stores (explicit):** TimeClock status, Bandeja unread, avatar photo, all lists, catalogs and detail data (all TQ); every form draft (L); `AppearanceProvider` (context, SSR-seeded); `ClockInPrompt` seen-date (L; already mount-safe).

---

## 3. Migration rules

**Where state goes:**

| Kind of state | Goes to | Examples |
|---|---|---|
| Changes what the server returns, and shareable | **URL** + query key | Filters, view, `cal`, `?fecha`, `?week`, `?folder`, `?q` on list pages, `?tab` |
| Identifies an open entity sheet | **URL** | `?tarea`, `?contacto`, `?nota`, `?correo`, `?thread` |
| Changes the server payload, not shareable | Zustand value read **into the query key** | Rare; prefer URL |
| Anything from the DB | **TanStack** | Optimistic copies too: `setQueryData`, never `useState(props)` mirrors like `useSyncedList` or Inbox `synced` |
| UI state read or written by **2+ components not in a parent/child pair**, opened from elsewhere, must survive navigation, or a user layout preference | **Zustand** | — |
| Single-component transient state | **useState** | Drafts, a popover/dialog owned by one component, hover/drag, a11y announcements, "pending" before TQ owns it |
| Page-scoped form contexts | stay **context** | Apariencia, Horario, Notificaciones, Perfil, Integraciones; reset per segment |

- **Never put in Zustand:** the presentation style itself (StyleProvider; §2.6 only backs its persisted value), server data, data derived from server data (derive with selectors or `useMemo` from TQ data), or URL params (don't mirror them into a store; read `useSearchParams`).
- **Event and registry ban.** No new `window.dispatchEvent`/CustomEvent, module-level `let` stores or opener registries for UI coordination. Remove `OPEN_ASSISTANT_EVENT`, `shell-openers.ts`, `today-events.ts` and `bandeja-unread.ts` (the last two go to TQ).

**SSR safety:**
1. Module-singleton stores (`create()`) are allowed **only** if they hold request-independent defaults and are **never written on the server**. All stores above qualify.
2. A store seeded from server props per request (like §2.6) must either:
   - seed in a client effect or seeder component, with the provider rendering `props.style` until seeded so server and first client render match; or
   - use the zustand Next.js pattern `createStore` + `<XStoreProvider>` with `useRef` per request and `useStore(ctx, selector)`.
3. Persisted stores use `persist(..., { skipHydration: true })`. One `<UiStoresHydrator/>` client component in `AppShellClient` calls `useInicioDashboard.persist.rehydrate()`, `useRecentDocs.persist.rehydrate()` etc. in a `useEffect`. The first render always uses defaults, so server HTML equals the first client render.
4. If a persisted value changes layout (a collapsed widget), accept the post-mount shift, or render the collapsed state behind `useHasHydrated(store)` to avoid flicker. Don't move it to cookies unless product requires SSR-correct collapse.
5. No `localStorage` access outside `persist` storage or `lib/repositories/browser-state-repository.ts`.

**Selectors:**
- One selector per primitive.
- `useShallow` for object or array picks.
- Actions selected individually.
- No `useStore()` without a selector in components. A lint rule or grep guard enforces it: `rg "use[A-Z]\w+Ui\(\)"` must return nothing.

**Testing:**
- Each store exports `INITIAL` and `reset()`.
- Add `tests/setup/zustand-reset.ts` to `vitest.config.ts` `setupFiles`. It registers every store (or uses the zustand docs `__mocks__/zustand.ts` pattern that captures `create` and resets all stores in `afterEach`).
- Persisted stores: `localStorage.clear()` in `afterEach`, plus a test that `rehydrate()` reads the legacy key (recent docs).
- Component tests drive state through the real store (`useShellUi.setState({searchOpen:true})`), not `vi.mock`. Current tests mock `session-store` (`AvatarMenu.test.tsx:37`); new tests should set state instead.
- Store unit tests live in `lib/stores/<name>-store.test.ts`. Each covers actions, `partialize` keys, `migrate` from version 0, and the reset rules.
- **SSR test:** `renderToString` of a component using a persisted store equals the first client render (no hydration warning) in `happy-dom`.

**Naming:**
- File `lib/stores/<kebab>-store.ts`; hook `use<Pascal>`, with suffix `Ui` for overlay stores (`useShellUi`, `useAssistantUi`, `useNewTaskUi`, `useTareasUi`) and `Dashboard` for dashboards.
- Persist keys `cincel.ui.<name>.v<N>`, except `cincel.resources.recent-docs.v1`, which is kept for compatibility.
- Actions are verbs (`openX`/`closeX`/`toggleX`/`setX`/`selectX`); state is nouns. Selectors are named `select<Thing>` and exported from the store file.

---

## 4. Zustand work per Query Migration phase

**Phase 1 (foundation)**, added here because the other phases need it:
- Add `tests/setup/zustand-reset.ts`, the `<UiStoresHydrator/>` skeleton and `useHasHydrated(store)` in `lib/stores/use-has-hydrated.ts`.
- Add `selectAuthenticatedUser` to `session-store.ts`.
- Add a grep guard test: no `window.dispatchEvent(new (Custom)?Event("cincel:` in `components/` or `lib/` once phases 2 and 10 land.

### Phase 2: shell and sidebar
- **Stores:** create `useShellUi`. Optionally create `usePresentationStyle` (§2.6) if the product owner approves; otherwise open a bug for the layout revalidation.
- **Components:**
  - `AppShellClient.tsx` (drop `searchOpen`; mount `UiStoresHydrator`)
  - `Sidebar.tsx` (drop the `onOpenSearch` prop; call `openSearch`)
  - `CommandPalette.tsx` (`open`/`onOpenChange` from the store; ⌘K → `toggleSearch`; `setSearchAvailable`)
  - `NotFoundSearchButton.tsx`
  - delete `lib/ui/shell-openers.ts`
  - `TimeClock`, `ClockInPrompt` and the badge go to TQ per the plan (not Zustand)
  - delete `today-events.ts` and `bandeja-unread.ts`
  - replace the snapshot reads in shell components with `useSessionStore`
  - if §2.6 is approved: `StyleProvider.tsx`, `EstiloSwitch.tsx` (go through `useAppearance().setPreference`), and a seed in `AppShell.tsx`
- **Acceptance:**
  - ⌘K, the Sidebar button and the 404 button all open the same palette.
  - `rg "registerShellOpener|openShellOverlay|cincel:today-status"` is empty.
  - Changing Estilo on Inicio, then opening Personas (no `?estilo`), shows the new style without a reload. `html[data-style]` matches.
  - No hydration warnings.
- **Tests:**
  - store unit tests
  - `CommandPalette.test.tsx` and `layout.test.tsx` adapted to the store
  - a test that ⌘K toggles via the store
  - a style regression test (two providers, set on one, read on the other)

### Phase 3: Inicio
- **Stores:** create the `createDashboardStore` factory and `useInicioDashboard` (persisted, `skipHydration`).
- **Components:**
  - `KpiTiles.tsx` (selectable tiles: `aria-pressed`, `toggleKpi`)
  - `WidgetCard.tsx` (optional collapse action: `aria-expanded`)
  - `WeeklyPaceChart.tsx` (range segmented control 4/8 weeks over the 8 loaded; series toggles)
  - `TramoDonut.tsx` and `WorkloadBars.tsx` (`useWidgetView` chart/table)
  - `InicioClient.tsx` stays style-agnostic. The photo goes to TQ `me.profile`, with no Zustand.
  - The Inicio "Nueva tarea" link can call `useNewTaskUi.openNewTask()` once Phase 4 lands.
- **Product gate:** the interactions are new, so confirm the list before building.
- **Acceptance:**
  - Collapse, range, view and series choices survive Inicio → Tareas → Inicio and a reload.
  - `selectedKpi` survives navigation but not a reload.
  - Switching Estilo does not carry a per-style view override into the other style.
  - The first render equals the SSR render (defaults), and persisted values apply after mount.
  - Zero new server calls caused by store changes.
- **Tests:**
  - factory unit tests (actions, `partialize`, `migrate`, per-style views)
  - `InicioClient.test.tsx` with a seeded store
  - an SSR snapshot equality test
  - an a11y test for the tile toggle and the collapse buttons

### Phase 4: Tareas
- **Stores:**
  - create `useNewTaskUi` and `<NewTaskDialogHost/>` (mounted in `AppShellClient`)
  - create `useTareasUi`
  - add `fecha` to `TareasQuery`
- **Components:**
  - `TareasClient.tsx`: remove the dialog mount at `:310`; the button calls `openNewTask`; `useSessionStore`
  - `TareasTablero.tsx`: remove `quickAddStatus` and the second dialog
  - `ListPage.tsx`, `TaskBoardWidget.tsx`: drop `onQuickAdd`; `BoardVisual` calls `openNewTask({status})`
  - `NewTaskDialog.tsx`: `NewTaskDialogFromUrl` becomes the host effect for `?nueva=1`
  - `use-new-task-param.ts`
  - `TareasCalendario.tsx`: cursor ↔ `?fecha`, `selectedKey` ↔ `useTareasUi`, user from `useSessionStore` (drop the focus listener)
  - `TaskSheet.tsx`, `TareasStartSlot.tsx`: session selector
  - `lib/tareas/query.ts` (parse and serialize `fecha`)
- **Acceptance:**
  - Exactly one `NewTaskDialog` in the React tree on any page (`rg "<NewTaskDialog" components` → only the host).
  - The quick-add, Tareas, `?nueva=1` and Proyectos/Nota entry points all open it with the right defaults.
  - The calendar date survives reload and back/forward via `?fecha`. The selected day survives switching to Lista and back.
  - No `useState(() => getCurrentAuthenticatedUser())` left in `components/tareas`.
- **Tests:**
  - `new-task-store` and `tareas-ui-store` unit tests
  - `NewTaskDialogHost` (URL param → opens → strips the param)
  - update `TareasTablero.test.tsx` (quick-add through the store)
  - `TareasCalendario.test.tsx` (`?fecha` round trip, selected day kept)
  - `lib/tareas/query` round-trip test for `fecha`

### Phase 5: Proyectos
- **Stores:**
  - use `useNewTaskUi`
  - optionally `useProyectosDashboard` (factory)
  - Portfolio search goes to the URL
- **Components:**
  - `ProjectTasksByFase.tsx` (drop `dialogDefaults` and its dialog mount; `openNewTask({projectId, tramoKey, …})`)
  - `ProjectsPortfolio.tsx` (`?q=` with a debounced local draft, like Tareas)
  - if the dashboard is approved: the tramo strip and card/table view through `useWidgetView`
  - Cronograma: no Zustand (`?week` URL, TQ data)
  - `ProjectFiles.tsx` `selectedId` stays local
- **Acceptance:**
  - Portfolio search survives opening a project and going back.
  - The project Tareas "Nueva tarea" uses the host dialog.
  - No `NewTaskDialog` mount in `components/proyectos`.
- **Tests:**
  - `ProjectsPortfolio.test.tsx` (`?q` round trip)
  - `ProjectTasksByFase.test.tsx` (store called with defaults)

### Phase 6: Personas
- **Stores:**
  - `useSessionStore` selector
  - contacts search goes to the URL `?q`
  - optionally `usePersonasDashboard`
- **Components:**
  - `EquipoView.tsx` (session selector)
  - `PersonasContacts.tsx` (`?q` + debounced draft)
  - `PersonasTabs.tsx` (carry `q`? No: reset per tab; keep `estilo` only)
  - if approved: `AvailabilityWeek`, `TeamGrid`/`TeamTable` through the dashboard store
  - `use-member-editor.ts` stays local; its staff/access data goes to TQ
- **Acceptance:**
  - Contact search survives opening and closing `?contacto=` and the back button.
  - No snapshot user reads.
- **Tests:** `PersonasContacts.test.tsx` (`?q`), an `EquipoView` test with the session store set.

### Phase 7: Mi espacio / Bandeja
- **Stores:** use `useNewTaskUi` (`NoteEditor`). Everything else is TQ or URL.
- **Components:**
  - `NoteEditor.tsx` (drop `taskOpen` and its dialog mount → `openNewTask({title, description, projectId}, "nota")`)
  - `Inbox.tsx` (remove the duplicate `tab` state `:137,159-162`; read `?tab` only; remove the `publishBandejaUnread` calls)
  - `MiEspacioClient.tsx` (remove `useSyncedList`)
- **Acceptance:**
  - Bandeja tab = URL only.
  - "Convertir en tarea" opens the host dialog.
  - `rg "publishBandejaUnread|useSyncedList"` is empty.
- **Tests:** `NoteEditor.test.tsx` (store called), `Inbox.test.tsx` (tab from the URL only).

### Phase 8: Biblioteca and Vacaciones
- **Stores:** create `useRecentDocs` (persist on the legacy key). Use `useAssistantUi` if Phase 10 has landed; otherwise this phase creates the store.
- **Components:**
  - `DocumentReader.tsx` (remove `assistantOpen` and the `AssistantSheet` import → `openAssistant({context:{route}})`; `remember` via the store)
  - `BibliotecaSection.tsx` (`remember` via the store)
  - `BibliotecaIndex.tsx` (read `useRecentDocs`)
  - delete `use-recent-documents.ts` and `notifyRecentDocumentsChanged`
  - `resources-model.ts` keeps the pure helpers
  - Vacaciones: no Zustand
- **Acceptance:**
  - Existing recent-docs entries still show after the upgrade (legacy array read).
  - Opening a doc updates "Abiertos recientemente" in another tab.
  - The `DocumentReader` chunk has no `AssistantSheet`/`@ai-sdk/react` (bundle check, plan).
  - No `cincel:recent-docs-changed`.
- **Tests:**
  - store test (legacy key migration, limit, multi-tab `storage` rehydrate)
  - `DocumentReader` test (calls `openAssistant` with the route context)

### Phase 9: Ajustes
- **Stores:** none new.
  - Keep the page-scoped contexts (Apariencia, Horario, Notificaciones, Perfil, Integraciones). They are correct form scopes, reset per segment.
  - If §2.6 shipped, `AparienciaClient`'s style change must also call `usePresentationStyle.setUserStyle` (or go through `AppearanceProvider`, which does it).
- **Flag (separate issue):** `cincel.permissions.custom.v1` (`usePermissionsWorkspace.ts:94-226`, `lib/auth/permissions.ts:830`) stores org permissions in the browser; that is server state. Monday reviewed-ids localStorage stays local, routed through `browser-state-repository`.
- **Acceptance:** changing Estilo in Ajustes › Apariencia is reflected by the next page's `useStyle()` without a reload. No Zustand store holds a settings draft.
- **Tests:** an Apariencia → style store integration test (if §2.6).

### Phase 10: Asistente
- **Stores:** create `useAssistantUi` (§2.2), unless Phase 8 already did.
- **Components:**
  - `AssistantLauncher.tsx` (drop `open`, `sheetMounted` and the event; ⌘J → `toggle`; `setAvailable(active)`)
  - `AssistantSheet.tsx` (`open`, `threadId`, `contextOverride` and `pendingPrompt` from the store; `setThreadId` on new/reset)
  - `CommandPalette.tsx` ("Preguntar al asistente" visible when `available`, calls `openAssistant()`)
  - `AsistentePageClient.tsx` (`?thread` stays the URL; `setThreadId` on select so the floating sheet elsewhere continues it; threads and messages go to TQ)
  - `use-confirmed-context.ts` goes to TQ
  - remove `OPEN_ASSISTANT_EVENT` and both old `openAssistant` exports
- **Acceptance:**
  - The palette command is visible and opens the sheet on every staff page except `/asistente`.
  - ⌘J toggles it. The sheet keeps its conversation across navigation, and "Abrir en página completa" lands on the same `?thread`.
  - Only one `AssistantSheet` mount exists in the tree.
  - `rg "cincel:open-assistant|OPEN_ASSISTANT_EVENT"` is empty.
- **Tests:**
  - store unit tests (open with context merge, `close` clears the override, thread kept)
  - `AssistantLauncher` (⌘J, lazy mount once)
  - `CommandPalette` (command shown when `available`)
  - an a11y test for focus return to the button after close

### Phase 11: Portal
- **Stores:** none. The portal style stays the cookie plus `StyleProvider` (`fixedByOrg` passed). The file browser folder goes to the URL or stays local; lists and uploads go to TQ. The upload queue and drag state stay local in `PortalUploader.tsx:160-161`.
- **Acceptance:** no `lib/stores/*` import under `components/portal` or `app/portal`. If §2.6 shipped, the portal `StyleProvider` path (scope `"portal"`) is unchanged.
- **Tests:** existing portal tests stay green; add a guard test for the no-store rule.

**Global acceptance after all phases:**
- `lib/stores/` contains only: `session`, `shell-ui`, `assistant-ui`, `new-task`, `tareas-ui`, `dashboard` (+ instances), `recent-docs`, and optionally `presentation-style`.
- No UI coordination through window events, module registries or `useState(props)` mirrors.
- Every persisted store uses `skipHydration`, a versioned key and a reset helper registered in the test setup.
