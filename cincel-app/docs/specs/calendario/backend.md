# Spec: Calendario and planning with the asistente (Backend)

Companion of [frontend.md](./frontend.md). Phases and issues: [calendario-milestones.md](../../phases/calendario-milestones.md). Decision record: [ADR 0007](../../adr/0007-calendar-proposals-and-undo.md). Design canvas: https://claude.ai/artifact/UxWfCgR5P3WKbmuhADXXZr (boards `Main`, `Esencial`, `Analitico`, `Asistente`, `P1-Barra`, `P2-Resumen`, `P3-Alertas`, `P4-Reunion`, `P5-Planear`). Supersedes #1056; follows the tool rules of #1055 (PR #1057).

Paths are relative to `cincel-app/`. Docs and identifiers are English; every string a user reads is Spanish, sentence case.

## 0. Context

### 0.1 What the code does today

| Area | Today | Where |
|---|---|---|
| Calendar page | None. #1028 (a6aa574) removed the Tareas Calendario view; `/calendario` redirects to `/tareas` | `lib/ui/legacy-redirects.ts:35`, `proxy.ts:72` |
| Event helpers | `buildCalendarEvents` (up to 3 events per task: commitment, review, delivery, plus an inferred meeting / site visit), `startOfWeek`, `addDays` | `lib/calendar/calendar-service.ts`, types in `lib/types/calendar.ts` |
| ICS feed | `GET /api/calendario/feed/<token>.ics`, token is the credential, `listMyTasks` → `buildCalendarEvents` → `buildIcs`, `private, max-age=300` | `app/api/calendario/feed/[file]/route.ts`, `lib/calendar/ics.ts`, `lib/repositories/calendar-feed-repository.ts` |
| Task range read | `fetchCalendarAction(from, to, filters)` → `tasksRepository.listCalendar` = `listTasks({...filters, dateFrom, dateTo})`: full rows, no aggregates, no paging | `lib/actions/tasks-actions.ts:63`, `lib/repositories/tasks-repository.ts:2286` |
| Google push | Tasks → a dedicated "Cincel" calendar the app creates (scope `calendar.app.created`), manual sync button | `lib/google/calendar-sync-service.ts`, `calendar-sync.ts`, `calendar-api.ts`; tables `google_calendar_syncs`, `google_calendar_events` (`lib/db/schema/auth.ts`) |
| Google read | `listOwnGoogleEvents(staffId, timeMin, timeMax)` reads the Cincel calendar minus mirrored tasks, and `primary` only when the `calendar_events` grant exists, live on each call | `lib/assistant/agenda/google-calendar.ts` |
| Google write | `insertPrimaryEvent` / `patchPrimaryEvent` / `deletePrimaryEvent` exist, but `STAFF_OAUTH_EXTRA_SCOPES` has no `calendar_events` key, so `calendarEventsGrantAvailable()` is false and `create_event`, `update_event`, `cancel_event`, `schedule_site_visit` are registered but unavailable | `lib/google/staff-oauth.ts:42`, `lib/assistant/tools/agenda.ts:119` |
| Free/busy | Not called. `find_free_slots` uses the caller's own events, the jornada and vacations; another person's calendar is never read | `lib/assistant/agenda/free-slots.ts` |
| Meetings, minutes | No table. A site visit is a Google event plus a task | — |
| Load | Counted in **tasks**: `occupancyPct(open, staff.capacity)`, `weekLoads(...)`. `positions.weekly_capacity_hours` (int 0–80, nullable) is stored and edited but unused | `lib/people/aggregates.ts`, `lib/db/schema/people.ts` |
| Hours per task | No column | `lib/db/schema/tasks.ts` |
| Dependencies | `task_dependencies (task_id, depends_on_task_id, kind = finish_to_start)` | `lib/db/schema/tasks.ts`, `lib/repositories/task-dependencies-repository.ts` |
| Bulk edits | `bulkUpdateTasksAction(ids, patch: TaskBulkPatch): Promise<ActionResult<TaskBulkResult>>`, one patch for many tasks, per-task permission, skipped rows with reason | `lib/actions/tasks-actions.ts:268`, `lib/types/core.ts:630` |
| Assistant tools | `defineTool({ name, description, schema, capability, available, confirm, write, summarize, run })`, registered in `lib/assistant/tools/index.ts` `DEFINED_TOOLS`; steps `TOOL_STEP_DEFS`, summaries `toolSummaries`, invalidation `TOOL_INVALIDATIONS` | `lib/assistant/define-tool.ts`, `tool-steps.ts`, `tool-summaries.ts`, `tool-invalidation.ts` |
| Approvals | AI SDK native approval; `assistant_actions` audit (`proposed → confirmed/cancelled → done/failed`); one card confirms all rows; no undo | `lib/assistant/approvals.ts`, `components/asistente/ConfirmationCard.tsx` |
| Page context | `AssistantContext = { route; projectId?; taskId?; personId? }` from `assistantContextFromRoute(pathname, search)` | `lib/types/redesign.ts`, `lib/assistant/page-context.ts` |
| Calendar permissions | `CalendarCapabilities { canViewCalendar, canViewDailyAgenda, canViewTeamCalendar }`; team view only for Administrador and Dirección | `lib/auth/permissions.ts:46,253` |
| Mail | `sendMail({to, subject, text, html?})` → `{sent:true} \| {sent:false; reason}` (SMTP); templates in `lib/email/templates/*` | `lib/email/index.ts` |
| Rate limits | `createRateLimiter({limit, windowMs})` (in-memory); no limit on assistant requests | `lib/auth/rate-limit.ts` |
| Stubs | `notImplementedAction`, `stubDefault`, `notImplemented`; per-module `*.flags.ts` with `IMPLEMENTED` | `lib/stubs.ts`, `lib/actions/*.flags.ts` |

### 0.2 After #1055 (PR #1057)
- The system prompt lists the tools of the request from the registry (`toolCatalogOf`, `buildSystemPrompt`).
- `AssistantStarterPrompt` and `EXAMPLES` carry `tools: readonly string[]`; `tool-references.test.ts` asserts that every named tool is registered and reachable for each role in `SYSTEM_ACCESS_ROLES`, that every write tool has a step, a summary and an invalidation entry (or a `WRITES_WITHOUT_LOCAL_CACHE` reason), and that descriptions are Spanish.
- `prompt-eval.test.ts` uses `MockLanguageModelV4` from `ai/test` with a recorded answer.

Every tool in §11 follows these rules. If #1057 is not merged when Phase 0 starts, Phase 0 adds the entries anyway and the guards apply when it lands.

## 1. Overview and decisions

- **One read per visible range.** `loadCalendarioRange(user, input)` returns the items of the range plus per-day aggregates computed in SQL. It never loads all tasks.
- **Two kinds of item.** Tasks (on `commitment_date`, fallback `delivery_date`) and events (meetings created in Cincel, and the viewer's own Google events cached in Postgres).
- **Google is read from a cache.** Range loads never call Google. A mutation refreshes the cache (incremental sync token), at most once per 5 minutes per person, plus a "Actualizar" action.
- **Proposals first** (ADR 0007). Every planning feature writes an `assistant_proposals` row; only `apply_proposal` changes data; undo is a server token.
- **Hours.** Tasks get `estimated_hours` (nullable). Effective hours = task value, else the template default, else 1 h. A person's workday = `positions.weekly_capacity_hours / 5` (their highest-capacity position), else the org setting `calendario.workday_hours` (default 6).
- **Deterministic planners.** Risk, blocking, overloads, redistribution and `plan_week` are pure functions over loaded rows, with explained outcomes. The model only phrases text and parses free text (`propose_from_text`, `extract_minutes`).

## 2. Module layout (new and changed)

```
lib/types/calendario.ts                 types of §6 (client-safe)
lib/validation/calendario.ts            zod schemas of §6 and §11 (client-safe)
lib/calendario/
  range.ts                              pure: view → {from,to}, week starts Monday, org time zone
  items.ts                              pure: row → CalItem, due date rule, overdue, tramo colour slot
  load.ts                               pure: effectiveHours, workdayHours, loadLabel, overlaps (§9)
  risk.ts                               pure: riskItems, blockingItems (§10.1)
  redistribute.ts                       pure: proposeRedistribution (§10.3)
  plan-week.ts                          pure: planWeek (§10.4)
  proposals.ts                          pure: change shapes, diff, undo plan (§6.3)
  copy.ts                               Spanish copy used by the server (lead paragraphs, reasons)
lib/repositories/calendario-repository.ts   range SQL, day aggregates, load per person/day (§5)
lib/repositories/calendar-events-repository.ts  calendar_events + attendees CRUD, visibility (§8)
lib/repositories/meeting-minutes-repository.ts  minutes, decisions, minute tasks (§8.3)
lib/repositories/proposals-repository.ts    assistant_proposals (§6.3)
lib/loaders/calendario.ts               "server-only": loadCalendarioRange, loadCalendarioList, loadDaySummary, loadWeekSummary, loadDayLoad, loadMeetingPrep, loadPlanWeek
lib/actions/page-data/calendario-actions.ts  "use server" reads: getCalendarioRange, getCalendarioList, getCalendarioDay, getCalendarioWeek, getCalendarioLoad, getMeetingDetail, getMeetingPrep, getPlanWeek, getProposal
lib/actions/calendario-actions.ts       "use server" writes (ActionResult): §12
lib/actions/calendario-actions.flags.ts IMPLEMENTED map (Rule 3)
lib/google/calendar-events-sync.ts      primary calendar read cache (sync token), write-through, free/busy (§7)
lib/assistant/tools/calendario.ts       new tool group (§11), imported in tools/index.ts
lib/assistant/tools/agenda.ts           changed: create/update/cancel_event become proposals; list_events and find_free_slots read calendar_events (§11.4)
lib/email/templates/orden-del-dia.ts, minuta.ts, invitacion-reunion.ts
```

`lib/calendar/*` (the old helpers) stays until Phase 8; new code does not import `buildCalendarEvents`, except the ICS route (§8.4).

## 3. Data model (Drizzle, schema `core`)

What is **stored** vs **computed**:

| Stored | Computed on read |
|---|---|
| Cincel meetings, their attendees and Google link | per-day counts, overdue, KPIs |
| cached Google events of each connected person (own calendar) | planned hours per person/day, load labels |
| minutes, decisions, tasks created from minutes | overlaps ("Se traslapan") |
| `tasks.estimated_hours`, `workflow_task_templates.default_estimated_hours` | effective hours (fallback chain) |
| proposals with before/after per change, applied changes, undo token | risk and "bloqueas a otros" lists |
| sync tokens and last sync time | lead paragraphs, meeting prep summary |

### 3.1 Enums (`lib/db/schema/_schema.ts`)
```ts
export const calendarEventSource = core.enum("calendar_event_source", ["cincel", "google"]);
export const calendarEventStatus = core.enum("calendar_event_status", ["confirmada", "cancelada"]);
export const attendeeResponse = core.enum("attendee_response", ["pendiente", "acepta", "rechaza", "tentativo"]);
export const meetingMinutesStatus = core.enum("meeting_minutes_status", ["borrador", "lista", "enviada"]);
export const proposalKind = core.enum("proposal_kind", [
  "mover_tareas", "crear_reunion", "editar_reunion", "cancelar_reunion",
  "repartir", "resolver_traslape", "pasar_a_manana", "planear_semana", "crear_tareas_minuta",
]);
export const proposalStatus = core.enum("proposal_status", ["propuesta", "aplicada", "parcial", "cancelada", "expirada", "deshecha"]);
// added values
historyEntity += "calendar_event"
notificationKind += "reunion"
```

### 3.2 `calendar_events` (new, `lib/db/schema/calendar.ts`)
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| source | `calendar_event_source` | `cincel` = created in Cincel; `google` = cached from a person's primary calendar |
| owner_staff_id | uuid → staff, null | for `google`: whose calendar it was read from (visibility = owner only) |
| organizer_id | uuid → staff, null | Cincel organizer; for `google`, the staff matching the organizer email if any |
| title | text not null | max 200 |
| description | text null | max 8 000 |
| starts_at, ends_at | timestamptz not null | check `ends_at > starts_at` |
| all_day | bool default false | all-day events keep `starts_at` at 00:00 org time |
| time_zone | text default `America/Mexico_City` | `TIME_TRACKING_TIME_ZONE` |
| location | text null | "Oficina Cincel · Sala 2", an address, or "En sitio" |
| meet_url | text null | from Google `conferenceData` or pasted |
| project_id | uuid → projects, null, on delete set null | |
| workflow_id | uuid → workflows, null | tramo colour of the edge; defaults to the project's current tramo |
| status | `calendar_event_status` default `confirmada` | cancel = status, never delete (history rule) |
| google_calendar_id, google_event_id, google_etag, google_html_link | text null | |
| google_sync_error | text null | last write-through error code |
| invites_via | text null, check in (`google`, `cincel`) | how the attendees were invited when the meeting was created (§7.6, D13); later updates and the cancel notice go the same way |
| synced_at | timestamptz null | last time read from / written to Google |
| created_by_id | uuid → staff | |
| created_at, updated_at, deleted_at | stamps | |

Indexes: `(starts_at)`, `(project_id, starts_at)`, `(owner_staff_id, starts_at) where source = 'google'`, unique `(owner_staff_id, google_event_id) where source = 'google'`, unique `(google_event_id) where source = 'cincel' and google_event_id is not null`.

A Google event whose id equals a Cincel meeting's `google_event_id` is not cached twice: the cache skips it. Events in the app-created "Cincel" calendar (mirrored tasks, `google_calendar_events`) are skipped too.

### 3.3 `calendar_event_attendees` (new)
`id`, `event_id → calendar_events (cascade)`, `staff_id → staff null`, `contact_id → contacts null`, `email text not null`, `name text not null` (name snapshot, ADR 0001), `response attendee_response default 'pendiente'`, `is_organizer bool default false`, `optional bool default false`. Unique `(event_id, lower(email))`. Index `(staff_id)`.

### 3.4 Minutes (new)
- `meeting_minutes`: `id`, `event_id → calendar_events unique`, `project_id null`, `notes text not null default ''` (max 20 000), `status meeting_minutes_status default 'borrador'`, `sent_at timestamptz null`, `created_by_id`, stamps.
- `meeting_decisions`: `id`, `minutes_id → meeting_minutes (cascade)`, `project_id null`, `text` (max 500), `history_event_id → history_events null`, `sort_order int`, `created_at`.
- `meeting_minute_tasks`: `minutes_id`, `task_id → tasks`, pk `(minutes_id, task_id)`.
- `meeting_minutes.open_points jsonb default '[]'`: `string[]` of items marked open, read by the next meeting's prep (§10.2).

### 3.5 Hours (changed)
- `tasks.estimated_hours numeric(5,2) null`, check `0 < x <= 80`.
- `workflow_task_templates.default_estimated_hours numeric(5,2) null`, same check. Tramo start copies it onto the task (`lib/project-flow/start-tramo.ts`), so later template edits don't change existing tasks.

### 3.6 `assistant_proposals` (new, `lib/db/schema/assistant.ts`)
| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| staff_id | uuid → staff | owner; only they can see, apply or undo it |
| thread_id | uuid → assistant_threads null | when made from the chat |
| tool_call_id | text null | |
| kind | `proposal_kind` | |
| status | `proposal_status` default `propuesta` | |
| title, line | text | the card's two lines (Spanish) |
| range_from, range_to | date null | where the overlay draws |
| changes | jsonb `ProposalChange[]` | before/after per change (§6.3), max 200 |
| deferred | jsonb `DeferredItem[]` default `[]` | what didn't fit, with reason |
| applied | jsonb `AppliedChange[]` default `[]` | what apply wrote, for undo |
| undo_token | text null, unique | random 32 bytes hex, stored hashed (sha-256) like `calendar_feed_tokens` |
| undo_expires_at | timestamptz null | `applied_at + 15 min` |
| expires_at | timestamptz | `created_at + 24 h` |
| created_at, applied_at, undone_at | timestamptz | |

Index `(staff_id, created_at desc)`, `(status, expires_at)`. A daily cron (`lib/cron/registry.ts`) marks `propuesta` rows past `expires_at` as `expirada` and deletes rows older than 90 days.

### 3.7 Google sync state (changed)
`google_calendar_syncs` gains `primary_sync_token text null`, `primary_synced_at timestamptz null`, `primary_error text null`, `primary_window_from date null`, `primary_window_to date null` (the cached window, §7.2).

### 3.8 `app_settings` keys (existing table)
- `calendario.workday_hours`: number, default `6` (Ajustes › General, admin).
- `calendario.day_start` / `calendario.day_end`: default from the jornada of Control de horario (`getTimeTrackingSettings()`), else `08:00` / `19:00`. The Día timeline range.

## 4. Migrations

Generated with `npm run db:generate` (drizzle-kit, `schemaFilter: ["core"]`); never hand-written except for data backfills in the same file. Latest today: `0034_oval_elektra.sql`. Numbers are assigned at merge time.

| Phase | Migration | Content |
|---|---|---|
| 0 | `0035_calendario_contracts` | all enums and enum values of §3.1; tables §3.2–§3.4, §3.6; columns §3.5, §3.7. Every later phase codes against it |
| 1 | `0036_calendario_range_indexes` | `create index idx_tasks_due on tasks ((coalesce(commitment_date, delivery_date))) where deleted_at is null and archived = false`; `idx_task_support_staff` if missing |
| 2 | `0037_calendar_events_backfill` | none if empty; else backfill `workflow_id` from `projects.current_workflow_id` |
| 5 | `0038_estimated_hours_defaults` | data only: seed `default_estimated_hours` for the catalog templates where the catalog gives a value (see Decision D4) |
| 3, 4, 6, 7, 8 | none expected | a phase that needs one adds exactly one, generated |

The migration test pattern of `lib/db/migrations/*migration.db.test.ts` applies: `0035` gets `calendario-migration.db.test.ts` (tables exist, checks reject bad rows, enum values present).

## 5. Range loader

### 5.1 Input and filters
```ts
// lib/types/calendario.ts
export type CalView = "dia" | "semana" | "mes";
export type CalMostrar = "todo" | "tareas" | "reuniones";
export type CalendarioFilters = {
  mostrar: CalMostrar;               // default "todo"
  quien: "yo" | "todos";             // default "yo"; "todos" needs canViewTeamCalendar, else forced to "yo"
  proyectos: string[];               // project ids, [] = all
  tramo: string | null;              // workflow id, "none" = sin tramo
  responsable: string | null;        // staff id, only with quien = "todos"
  apoyo: boolean;                    // include tasks where the person is support (task_support), default true
  ocultarCompletadas: boolean;       // default from useHideCompletedPreference
};
export type CalendarioRangeInput = { view: CalView; from: string; to: string; filters: CalendarioFilters };
```
Zod in `lib/validation/calendario.ts`: dates `z.iso.date()`, `to >= from`, span ≤ 42 days for `getCalendarioRange` (a month grid is 6 weeks), ≤ 92 days for `getCalendarioList`; ids `UuidSchema` (`lib/validation/project-flow.ts`); `proyectos` max 50.

### 5.2 Output
```ts
export type CalTramoRef = { id: string; key: string | null; name: string; colorSlot: 1 | 2 | 3 | 4 | 5 | null };
export type CalPersonRef = { id: string; name: string };
export type CalTaskItem = {
  kind: "task"; id: string /* "t:"+taskId */; taskId: string; title: string;
  date: string;                       // due date shown: commitment_date ?? delivery_date
  dateField: "commitmentDate" | "deliveryDate";
  project: { id: string; name: string } | null; tramo: CalTramoRef | null; phase: { id: string; name: string } | null;
  status: TaskStatus; statusLabel: string; priority: TaskPriority;
  manager: CalPersonRef | null; support: CalPersonRef[];
  overdue: boolean; completed: boolean; blocked: boolean;
  hours: number; hoursSource: "task" | "template" | "default";
  parentTaskId: string | null; canEdit: boolean;   // the viewer may change its date
};
export type CalEventItem = {
  kind: "event"; id: string /* "e:"+eventId */; eventId: string; source: "cincel" | "google";
  title: string; date: string; start: string; end: string; allDay: boolean;  // ISO with offset
  project: { id: string; name: string } | null; tramo: CalTramoRef | null;
  location: string | null; meetUrl: string | null;
  attendees: { name: string; staffId: string | null; response: AttendeeResponse }[];
  attendeeCount: number; organizer: CalPersonRef | null;
  googleHtmlLink: string | null; syncedAt: string | null; syncError: string | null;
  minutes: "ninguna" | "borrador" | "lista" | "enviada";
  canEdit: boolean;                   // organizer, or admin on a Cincel meeting
};
export type CalItem = CalTaskItem | CalEventItem;
export type CalDay = {
  date: string;
  tasks: number; events: number; overdue: number; completed: number;   // after filters
  shown: number;                       // items returned for the day (≤ perDayLimit)
  hours: number | null;                // planned hours of the viewer (quien=yo) — §9; null when quien=todos
  workday: number | null; loadLabel: LoadLabel | null; overlaps: number;
};
export type CalKpis = { tasks: number; meetings: number; meetingHours: number; overdue: number; overduePct: number; unassigned: number };
export type CalendarioRange = {
  from: string; to: string; today: string; days: CalDay[]; items: CalItem[]; kpis: CalKpis;
  truncated: boolean;                  // some day has more than perDayLimit
  google: { connected: boolean; eventsGrant: boolean; syncedAt: string | null; error: string | null };
};
```
`perDayLimit`: `mes` 3 (the grid shows "+n más" from `tasks + events - shown`), `semana` 12, `dia` 200. Order within a day: events by start, then overdue tasks, then open tasks by priority, then completed.

### 5.3 SQL
Due date `due := coalesce(t.commitment_date, t.delivery_date)`; open `:= t.status <> 'completado' and coalesce(ts.closes, false) = false` (same rule as `loadTareasSummary`). Viewer scope and admin-task visibility come from `viewerScopeOf(user)` exactly as `listTasks` (`canSeeAdminData`, `ViewerScope`); the repository reuses the `whereFilters` helper of `tasks-repository.ts` instead of a copy.

Day aggregates (one query, `generate_series` over the range so empty days return zeros):
```sql
with d as (select generate_series(:from::date, :to::date, '1 day')::date as day),
t as (
  select coalesce(t.commitment_date, t.delivery_date) as due, (t.status <> 'completado' and coalesce(ts.closes,false) = false) as open,
         t.manager_id, coalesce(t.estimated_hours, tpl.default_estimated_hours, 1) as hours
  from tasks t left join task_statuses ts on ts.id = t.custom_status_id left join workflow_task_templates tpl on tpl.id = t.template_id
  where <viewer scope> and <filters> and coalesce(t.commitment_date, t.delivery_date) between :from and :to
),
e as (
  select (ev.starts_at at time zone ev.time_zone)::date as day, ev.starts_at, ev.ends_at
  from calendar_events ev where <event visibility §8.2> and ev.status = 'confirmada' and ev.deleted_at is null
    and ev.starts_at < (:to::date + 1) and ev.ends_at > :from::date
)
select d.day,
  count(t.*) filter (where t.due = d.day)::int as tasks,
  count(t.*) filter (where t.due = d.day and t.open and d.day < :today)::int as overdue,
  count(t.*) filter (where t.due = d.day and not t.open)::int as completed,
  (select count(*) from e where e.day = d.day)::int as events,
  coalesce(sum(t.hours) filter (where t.due = d.day and t.open), 0) as task_hours,
  (select coalesce(sum(extract(epoch from (e.ends_at - e.starts_at)) / 3600), 0) from e where e.day = d.day) as meeting_hours
from d left join t on t.due = d.day group by d.day order by d.day
```
Items: one query for tasks with `row_number() over (partition by due order by …) <= :perDayLimit`, one for events; joined in `lib/calendario/items.ts`. Overlaps: a self-join on the viewer's events of each day (`a.starts_at < b.ends_at and b.starts_at < a.ends_at and a.id < b.id`), counted per day.

KPIs: `meetingHours` sums event durations in range; `unassigned` = open tasks with `manager_id is null`; `overduePct` = overdue / open.

### 5.4 Paging (Analítico)
`getCalendarioList({ from, to, filters, cursor, limit })` returns `{ rows: CalItem[]; nextCursor: string | null; total: number }`, keyset order `(date, kindOrder, start, title, id)`, `limit` default 50, max 100. The cursor is an opaque base64 JSON of the last key. Sorting by date desc is the only other order (`orderDir`).

### 5.5 Guard against loading everything
- `scripts/check-data-patterns.mjs` gains rule 11: in `lib/loaders/calendario.ts`, `lib/repositories/calendario-repository.ts` and `components/calendario/**`, no call to `listTasks(`, `fetchTasksAction(`, `fetchCalendarAction(` or `listMyTasks(`.
- A DB test seeds 5 000 tasks over 2 years and asserts that one month range returns ≤ `42 × 3` task items and that the query count is ≤ 4 (with the `tests/helpers` query counter).

## 6. Shared types for proposals

### 6.1 Page context for the asistente
```ts
// lib/types/redesign.ts, extends AssistantContext (optional fields only)
export type AssistantCalendarContext = {
  view: CalView; from: string; to: string;
  filters: Pick<CalendarioFilters, "mostrar" | "quien" | "proyectos" | "ocultarCompletadas">;
  selectedDate?: string; selectedItemId?: string;  // "t:<uuid>" | "e:<uuid>"
  openProposalId?: string;
};
export type AssistantContext = { route: string; projectId?: string; taskId?: string; personId?: string; calendar?: AssistantCalendarContext };
```
`requestContext()` (`lib/assistant/chat-request.ts`) keeps `calendar` (dates, ids and enums only; zod-validated; no titles). `context.ts` resolves `selectedItemId` to `{id, label}` with the same visibility checks (query-migration §4.8 rule 6).

### 6.2 Change shapes
```ts
export type ProposalChange =
  | { changeId: string; type: "task_date"; taskId: string; title: string; projectName: string | null;
      before: { date: string | null; field: "commitmentDate" | "deliveryDate" }; after: { date: string };
      reason?: string; staffId: string | null }
  | { changeId: string; type: "event_create"; draft: MeetingDraft }
  | { changeId: string; type: "event_update"; eventId: string; before: MeetingPatch; after: MeetingPatch; notify: boolean }
  | { changeId: string; type: "event_cancel"; eventId: string; notify: boolean }
  | { changeId: string; type: "task_create"; draft: { title: string; projectId: string; managerId: string | null; commitmentDate: string | null; tramoId: string | null; sourceText: string } }
  | { changeId: string; type: "decision"; minutesId: string; text: string };
export type MeetingDraft = { title: string; start: string; end: string; projectId: string | null; location: string | null;
  meet: boolean; attendees: { staffId?: string; contactId?: string; email: string; name: string }[]; description?: string };
export type MeetingPatch = Partial<Pick<MeetingDraft, "title" | "start" | "end" | "location" | "attendees">>;
export type DeferredItem = { taskId: string; title: string; reason: string };   // "Jorge ya está al 100 %"
export type Proposal = { id: string; kind: ProposalKind; status: ProposalStatus; title: string; line: string;
  rangeFrom: string | null; rangeTo: string | null; changes: ProposalChange[]; deferred: DeferredItem[];
  createdAt: string; expiresAt: string };
export type AppliedChange = { changeId: string; entity: "task" | "event" | "decision"; entityId: string; undo: unknown };
export type ApplyProposalResult = { proposalId: string; applied: string[]; skipped: { changeId: string; reason: string }[];
  undoToken: string | null; undoExpiresAt: string | null; toast: string };
export type UndoProposalResult = { restored: string[]; skipped: { changeId: string; reason: string }[]; toast: string };
```

### 6.3 Lifecycle and rules (ADR 0007)
- `createProposal(user, kind, { title, line, changes, deferred, range }, { threadId?, toolCallId? })` in `proposals-repository.ts` writes the row. `before` values are read inside the same call.
- `applyProposal(user, proposalId, changeIds?)` (`lib/calendario/apply.ts`, server-only):
  1. Loads the row; `FORBIDDEN` unless `staff_id = user.member.id`; `STALE` unless status `propuesta`; `EXPIRED` past `expires_at`.
  2. For each selected change: check permission (§13) and staleness (`before` still equals the current value). Skip with reason `Sin permiso` / `Cambió desde la propuesta` / `Ya no existe`.
  3. `task_date` changes grouped by `after.date` → one `bulkUpdateTasksAction(ids, { dueDate, dueField })` per group. Its `skipped` rows become skipped changes.
  4. `event_*` → `calendar-events-repository` then Google write-through (§7.3) after the DB commit.
  5. `task_create` → `createUserTaskAction`; `decision` → `meeting_decisions` + `recordComment` on the project.
  6. Writes `applied`, `status = aplicada | parcial`, `undo_token`, `undo_expires_at`; `recordViaAsistente` on each entity.
- `undoProposal(user, undoToken)`: within `undo_expires_at`; per applied change restores `before` if the current value equals `after`; events created are cancelled (Google delete, `sendUpdates: "all"`), tasks created are soft-deleted (`deleteTaskAction` path, which keeps history), decisions are deleted with a history line "Decisión retirada". Sets `status = deshecha`.
- Toast copy (server, `copy.ts`): "Moví 3 tareas al jueves 12 nov.", "Creé la junta del jueves a las 10:00 y envié la invitación.", "Pasé 2 tareas a mañana jueves 12. Tu día queda en 3 h.", "Creé 4 tareas y agendé la junta del 25 nov.", partial: "Apliqué 2 de 3 cambios. 1 no se pudo: sin permiso.". Undo: "Cambio deshecho." (same as `UNDONE_TOAST`), "Deshice 2 de 3 cambios; 1 cambió después de aplicar.".

## 7. Google Calendar

### 7.1 Scopes and grant
- New incremental grant key `calendar_events` in `STAFF_OAUTH_EXTRA_SCOPES` = `https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy`. `parseStaffOauthScope` accepts it; `/api/auth/google/start?scope=calendar_events&return_to=/calendario` asks for it. `calendarEventsGrantAvailable()` becomes true, so the existing agenda tools' `available()` turns on.
- **Decision D1 (decided 2026-11-11):** the Workspace admin grants `calendar.events` and `calendar.freebusy` for the OAuth client as an incremental grant (add them to `docs/google-workspace-admin-checklist.md` and the ops checklist #690). **Google is the main path:** every Cincel meeting is written to the organizer's primary calendar with a Meet link and Google's invitations, and every availability lookup (`find_free_slots`, `resolve_overlap`, `plan_week` when it reads meetings) uses free/busy.
- **The Cincel-only meeting is the failure path, not a mode.** It is used only when (a) the organizer has not granted `calendar_events` yet (or the admin hasn't allowed the scopes, so the grant ends in `access_denied`), (b) the token was revoked (`REAUTH`), or (c) Google is unavailable after the retries of §7.5. Then the meeting is stored and shown in Cincel, invitations go by email and in-app (§7.6), and there is no Meet link and no free/busy. The UI always says which path a meeting took and offers the way back to Google (connect, reconnect, retry).
- The UI asks for the grant at the moment it matters: the page banner, the Nueva reunión dialog and the meeting detail (frontend §6). It never silently falls back.

### 7.2 Read cache (`lib/google/calendar-events-sync.ts`)
```ts
export async function refreshPrimaryEvents(staffId: string, opts?: { force?: boolean; now?: Date }): Promise<{ upserted: number; deleted: number; syncedAt: string } | { skipped: "fresh" | "not_connected" | "no_grant" }>;
```
- Window: today − 35 days to today + 120 days. First run: `events.list(primary, timeMin, timeMax, singleEvents=true)`, paged; stores `nextSyncToken`. Later runs: `events.list(syncToken)`; a `410 Gone` resets the token and re-reads the window (`isGone` in `calendar-api.ts`).
- Skips events of the app-created Cincel calendar and events whose id is a Cincel meeting's `google_event_id` (§3.2). Cancelled events are deleted from the cache.
- Maps `attendees[]` to `calendar_event_attendees` (matching staff by email), `hangoutLink` / `conferenceData.entryPoints[video]` to `meet_url`, `htmlLink`, `etag`.
- Freshness: skipped unless `force` or `primary_synced_at` is older than 5 minutes.
- Callers: `refreshGoogleEventsAction()` (a mutation the page runs once per mount when stale, query-migration §4.8 rule 5), the "Actualizar" button, and the cron job `calendar-events-refresh` every 30 minutes for staff with the grant (lease via `cron_leases`).
- Range loads read only the cache. `google.syncedAt` gives "sincronizado hace 5 min".

### 7.3 Write-through
- Cincel meeting with the organizer's grant: `insertPrimaryEvent(organizerId, { summary, description, start, end, location, attendees, conferenceData: { createRequest: { requestId: eventId, conferenceSolutionKey: { type: "hangoutsMeet" } } } })` with `conferenceDataVersion=1&sendUpdates=all`. Stores `google_event_id`, `etag`, `html_link`, `meet_url`. Update: `patchPrimaryEvent` with `If-Match: etag`; `412` → re-read, apply the patch on top, retry once; cancel: `deletePrimaryEvent` with `sendUpdates=all`.
- `GoogleEventWrite` in `lib/assistant/agenda/google-calendar.ts` gains `conferenceData?` and `sendUpdates?`.
- Only the organizer's own calendar is written. Editing a cached Google event that someone else organized is refused (`ORGANIZER_ONLY_COPY` already exists).
- `retryMeetingSyncAction(eventId)` (organizer only) and the cron `calendar-meetings-resync` (every 15 min, `cron_leases`, meetings with `google_sync_error` in (`UNAVAILABLE`, `RATE_LIMITED`) that start in the future, max 3 tries) create or patch the Google event. When `invites_via = 'cincel'` the retry uses `sendUpdates=none`, so attendees are not invited twice (§7.6).

### 7.4 Free/busy
```ts
export async function freeBusy(staffId: string, emails: string[], timeMin: string, timeMax: string): Promise<{ busy: Record<string, BusyInterval[]>; unknown: string[] }>;
```
`POST https://www.googleapis.com/calendar/v3/freeBusy` with the caller's token, max 20 emails, max 31 days. Emails Google can't answer for (outside the domain, sharing off) come back in `unknown`; the planners treat them as free and say so ("No pude ver la agenda de 1 persona."). Cincel data is always added: confirmed `calendar_events` where the person attends, approved absences (`approvedAbsences`), and the jornada (`dayStart`/`dayEnd`/`workDays`).

### 7.5 Failure modes
| Failure | Behaviour |
|---|---|
| Not connected / no grant | page works on Cincel data; `google.connected=false`, `google.eventsGrant=false`; banner "Conecta Google Calendar…" once per session; the Nueva reunión dialog shows the connect prompt before saving (frontend §6); a meeting saved anyway is Cincel-only (`invites_via='cincel'`, `google_sync_error='NO_GRANT'`) and its detail offers "Conectar y crear en Google" |
| Scopes not allowed by the admin (`access_denied` on the grant) | same as no grant; `primary_error = 'ACCESS_DENIED'`; copy "Tu administrador todavía no habilita Google Calendar para Cincel." (no retry button, the admin step is #690) |
| Token revoked / `invalid_grant` | `google_oauth_accounts` flagged by the existing `staff-token.ts` path; `primary_error = 'REAUTH'`; a meeting write keeps the Cincel row with `google_sync_error='REAUTH'` (failure path, §7.6); detail shows "Vuelve a conectar Google Calendar" |
| 403 rate limit / 5xx | retry with backoff (2 tries) inside the action; then `primary_error`; cache stays as it was; meeting write keeps the Cincel row with `google_sync_error = 'UNAVAILABLE'` or `'RATE_LIMITED'`, takes the failure path for invitations (§7.6) and is retried by `retryMeetingSyncAction(eventId)` and the resync cron (§7.3) |
| 410 sync token | full window re-read |
| 412 etag | re-read and retry once, else `CONFLICT` "La reunión cambió en Google Calendar. Vuelve a intentarlo." |
| Event deleted in Google | cache delete; a Cincel meeting whose Google event vanished keeps the row (`google_sync_error='GONE'`) and shows "Ya no está en Google Calendar" with "Volver a crear en Google" (`retryMeetingSyncAction`, `sendUpdates=none`) |

### 7.6 Invitations on the failure path (Decision D13)
- **Google path** (`invites_via='google'`): Google sends the invitation, updates and the cancel notice (`sendUpdates=all`). Cincel adds only the in-app notification for staff attendees (`notify(staffIds, { kind: "reunion" })`).
- **Failure path** (`invites_via='cincel'`): at create, Cincel sends the invitation at once: `sendMail` with `invitacion-reunion` (text + html with date, place and the meeting link in Cincel; no `.ics` attachment, so no calendar copy exists that Google would later duplicate) to every attendee email, plus the in-app notification. Updates and the cancel go the same way.
- **When Google comes back** (retry, cron or "Conectar y crear en Google"): the Google event is created with `sendUpdates=none`; attendees in the Workspace see it on their calendar without a second email, and external attendees keep the email they already have. Later updates of that meeting keep `invites_via='cincel'` for the email notices and patch Google with `sendUpdates=none`, so nobody gets two notices for one change. The toast says "Ya está en Google Calendar." and the detail note disappears.
- The toast at create tells the organizer which path was taken: "Reunión creada. Envié la invitación a {n} personas." (Google) or "Reunión creada en Cincel. Envié la invitación por correo." (failure path, plus the reason line of frontend §6).

## 8. Meetings and minutes

### 8.1 Actions (`lib/actions/calendario-actions.ts`, all `ActionResult`)
```ts
createMeetingAction(input: MeetingDraft): Promise<ActionResult<CalEventItem>>
updateMeetingAction(eventId: string, patch: MeetingPatch & { notify?: boolean }): Promise<ActionResult<CalEventItem>>
cancelMeetingAction(eventId: string, opts: { notify: boolean }): Promise<ActionResult<{ eventId: string }>>
retryMeetingSyncAction(eventId: string): Promise<ActionResult<CalEventItem>>
refreshGoogleEventsAction(opts?: { force?: boolean }): Promise<ActionResult<{ syncedAt: string | null }>>
```
These are the direct UI paths (Nueva reunión dialog, detail edits). The asistente reaches the same repository code only through `apply_proposal`.

Default attendees when the asistente proposes a meeting for a project: project members (`project_members`) with role manager/coordinator plus the project's client contact when it has an email ("invito a Ana García, Luis Martínez y al cliente"). Default length 60 min; site visits 120 (`SITE_VISIT_MINUTES`).

Invitations: §7.6. With Google (the main path), Google sends them (`sendUpdates=all`) and Cincel only adds the in-app notification; on the failure path, `sendMail` with `invitacion-reunion` to every attendee email plus `notify(staffIds, { kind: "reunion", … })`. `createMeetingAction` sets `invites_via` once and never changes it.

### 8.2 Visibility
- `source = 'google'`: owner only (`owner_staff_id = viewer`). Another person's cached events are never returned, also not to admins (owner-only data, redesign BE §9.1). In "Todos", other people's meetings come only from Cincel meetings.
- `source = 'cincel'`: organizer, attendees (`staff_id`), members of the linked project, Administrador and Dirección.
- `quien = "yo"`: events the viewer organizes or attends, plus their own Google cache.

### 8.3 Minutes
```ts
saveMeetingNotesAction(eventId: string, notes: string): Promise<ActionResult<{ minutesId: string; updatedAt: string }>>   // autosave, debounced on the client
```
Creates the `meeting_minutes` row on first save. Only organizer and staff attendees can read or write minutes. Decisions are saved by applying a `crear_tareas_minuta` proposal (§11.6), which also writes each decision to the project history as a comment "Decisión: cocina en cuarzo blanco".

Meeting state chip (for the Reuniones list): `Hoy` (starts today), `Próxima` (future), `Minuta lista` (`status in ('lista','enviada')`), `Sin minuta` (past without one).

### 8.4 ICS
`app/api/calendario/feed/[file]/route.ts` adds the person's confirmed Cincel meetings (organizer or attendee) as `VEVENT` with `DTSTART/DTEND`, `LOCATION`, `URL` (meet), `UID = <eventId>@cincel`. Cached Google events are not exported (they are already in the person's Google calendar). Task events stay as they are.

## 9. Load and capacity (`lib/calendario/load.ts`)

```ts
export const DEFAULT_TASK_HOURS = 1;
export const DEFAULT_WORKDAY_HOURS = 6;
export function effectiveHours(t: { estimatedHours: number | null; templateHours: number | null }): { hours: number; source: "task" | "template" | "default" };
export function workdayHours(p: { weeklyCapacityHours: number | null; workDays: number }, orgDefault: number): number; // weekly / workDays, rounded to 0.5; else orgDefault
export type LoadLabel = "libre" | "bien" | "casi_lleno" | "sobrecargado";
export function loadLabel(hours: number, workday: number): LoadLabel; // < 50 % libre, ≤ 85 % bien, ≤ 100 % casi lleno, > 100 % sobrecargado
export const LOAD_LABEL_COPY: Record<LoadLabel, string> = { libre: "Libre", bien: "Bien", casi_lleno: "Casi lleno", sobrecargado: "Sobrecargado" };
export function overlaps(events: { id: string; start: string; end: string }[]): [string, string][];
```
- Planned hours of a person on a day = effective hours of their **open** tasks due that day where they are `manager` (support tasks count 0, Decision D5) + duration of their confirmed meetings that day (Cincel attendee or own Google cache), meetings clipped to the jornada. Overdue tasks count on their due day, not today.
- A person's position for capacity: the highest `positions.weekly_capacity_hours` among their `staff_positions` rows (nulls ignored); none → the org default. `staff_positions.source` is only `manual` / `workspace`, so there is no primary flag. Absent days (approved vacation) have workday 0 and label "Ausente".
- `loadCalendarioDayLoad(user, { from, to, staffIds? })` returns `DayLoad[] = { date; staffId; hours; workday; label; tasks: {taskId, hours}[]; meetings: {eventId, hours}[]; overlaps: [string,string][] }`. For others than the viewer, requires `canViewTeamCalendar` or a shared active project (the "Solo mi equipo" rule of #1000).
- This does not change the Personas load (tasks ÷ `staff.capacity`, estilos decision). Personas may switch to hours later; not in scope.

## 10. Planning rules (pure, deterministic)

### 10.1 Summaries (`lib/calendario/risk.ts`)
For a viewer and a day or week:
- **Reuniones**: the viewer's confirmed meetings in range, with `prep` hint (e.g. "Cotización pendiente desde el 6 nov" = the oldest overdue task of the meeting's project).
- **Vence hoy** / **Vence esta semana**: open tasks of the viewer (manager) due in range.
- **En riesgo**: union of
  1. tasks with status `bloqueado` that have successors (`task_dependencies.depends_on_task_id = task`) still open; line "Bloqueada hace 7 días · frena "Obra negra" (12 nov)" (days since the last status change to bloqueado in `history_events`);
  2. overdue open tasks of a project that has a meeting in range or within 7 days where the viewer attends; line "Vencida 2 días · la revisión de hoy depende de ella".
- **Bloqueas a otros**: open tasks where the viewer is manager and that are a dependency of an open task whose manager is someone else (`task_dependencies`), or the parent of a subtask assigned to someone else that is waiting (`parent_task_id`, subtask open and due after it). Line "Luis Martínez la necesita para "Detalles de cocina" (20 nov)".
- Each item carries one `action: SummaryAction`:
```ts
export type SummaryAction =
  | { kind: "prepare"; eventId: string; label: "Prepárame"; tool: "meeting_prep" }
  | { kind: "defer"; taskId: string; label: "Pasar a mañana"; tool: "move_tasks" }
  | { kind: "assign"; taskId: string; label: "Asignar"; tool: "assign_task" }
  | { kind: "notify"; taskId: string; staffId: string; label: string /* "Avisa a Jorge" */; tool: "notify_people" }
  | { kind: "propose_date"; taskId: string; label: "Propón fecha"; tool: "move_tasks" }
  | { kind: "resolve"; eventIds: [string, string]; label: "Resolver"; tool: "resolve_overlap" }
  | { kind: "redistribute"; date: string; label: "Reparte esto"; tool: "propose_redistribution" };
```
- **Lead paragraph**: built from templates in `copy.ts`, never from the model on page load. Greeting by org-time hour ("Buenos días" < 12:00, "Buenas tardes" < 19:00, else "Buenas noches") and first name. Day: "{n} reuniones y {m} entregas. Lo más urgente: {first risk or first overdue}." Week: "4 reuniones y 11 entregas. El jueves está sobrecargado (9.5 h) y tienes 3 tareas vencidas de la semana pasada." Order of urgency: blocked-with-successors > overdue a meeting depends on > overloaded day > overdue > due today.
- **Primary action**: Día "Pasa a mañana lo que no alcances hoy" (`propose_redistribution { date, target: "next_day" }`); Semana "Planea mi semana" (`plan_week`).

### 10.2 Meeting prep
`loadMeetingPrep(user, eventId)`:
- KPIs: project progress vs plan (`projects.progress` vs linear plan between `start_date` and `end_date`; "−8 vs plan"), current tramo and fase, overdue count "de 15 abiertas", last meeting of the project with minutes ("28 oct · 3 acuerdos, 1 abierto").
- `overdue`: open tasks of the project due before the meeting start, max 10, by days late.
- `agenda`: one item per overdue task ("Avance y nueva fecha de Ingenierías"), one per open point of the last minutes ("Decisión de acabado de cocina (pendiente del 28 oct)"), one per delivery due in the next 14 days ("Fechas de entrega de proyecto ejecutivo"); max 8, deduplicated.
- `summary`: one paragraph. Default from a template; the ✦ button asks the model for a rephrased version through the `meeting_prep` tool with `{ phrasing: true }` (Decision D6).
- Without a project: KPIs empty; agenda only from attendees' shared overdue tasks.

### 10.3 Redistribution (`lib/calendario/redistribute.ts`)
```ts
export function proposeRedistribution(input: {
  staffId: string; date: string; target: "spread" | "next_day"; horizonDays: number /* default 5 workdays */;
  load: DayLoad[]; tasks: { taskId: string; hours: number; priority: TaskPriority; blocked: boolean; fixed: boolean; dependsOn: string[]; dependents: { taskId: string; date: string }[] }[];
  workDays: number[]; absences: string[]; today: string;
}): { moves: { taskId: string; from: string; to: string; reason: string }[]; deferred: DeferredItem[] };
```
- Overload = `hours - workday`. Candidates on the day sorted by: blocked tasks first (they can't progress that day anyway), then lowest priority, then largest hours, then id. Meetings never move here.
- A task can't move after a dependent's date or before a dependency's date; `fixed` (delivery date equals the date and the task has no commitment date, i.e. a hard deadline) never moves later.
- `spread`: each candidate goes to the earliest later workday with room (`hours + task ≤ workday`), ties by lowest load. `next_day`: the next workday only; what doesn't fit is deferred with "No cabe mañana".
- Stops when the day is ≤ workday. Deterministic: stable sorts with id as last key.

### 10.4 Plan week (`lib/calendario/plan-week.ts`)
```ts
export function planWeek(input: {
  weekStart: string; days: string[] /* Mon–Fri workdays */;
  people: { staffId: string; name: string; workday: number; absent: string[]; booked: Record<string, number> /* hours already planned per day */ }[];
  backlog: { taskId: string; title: string; hours: number; priority: TaskPriority; managerId: string | null; deadline: string | null; dependsOn: string[]; projectId: string | null }[];
  now: string;
}): { placements: { taskId: string; staffId: string; date: string }[]; deferred: DeferredItem[]; cells: { staffId: string; date: string; before: number; after: number; workday: number }[] };
```
- Backlog = open tasks with no due date, or due in the past week and not done, or explicitly dropped on the drop zone; of the viewer (or of the selected people when the viewer can plan for others).
- Order: deadline asc (nulls last), priority (alta, media, baja), dependencies first (topological, ties by order), hours desc, id.
- Each task goes to its manager's lane; unassigned tasks stay unassigned and are deferred "Sin responsable" unless the viewer can assign (then the person with most room among project members, ties by name).
- Day: earliest day ≥ today where `booked + placed + hours ≤ workday`, not after the deadline, not before a dependency's placed date. No split of a task across days.
- Deferred reasons: "{Nombre} ya está al 100 %" (no day with room), "Vence antes de que haya espacio" (deadline), "Depende de {tarea}, que aún no tiene fecha", "Sin responsable", "{Nombre} está de vacaciones".
- The result is a `planear_semana` proposal of `task_date` changes (with `staffId`); assignment changes are out of scope for v1 (Decision D7).
- After apply, owners other than the viewer get `notify({ kind: "asignacion", title: "Tu semana cambió", body: "Ana García planeó 3 tareas tuyas para la semana del 16 nov." })` once per owner.

## 11. Assistant tools

All in `lib/assistant/tools/calendario.ts` unless noted, registered in `tools/index.ts`. Each has a Spanish description, `summarize = toolSummaries[name]`, a `TOOL_STEP_DEFS` entry (icon, tone, running, short, label, params, `href` → `/calendario?…`), and an invalidation entry. `available` reads `IMPLEMENTED` from `calendario-actions.flags.ts` (Rule 3). `run` returns `ActionResult`-shaped data or a `ToolFailure`.

Invalidation families (added to `tool-invalidation.ts`): `CALENDARIO = [qk.calendario.all]`, `PROPOSALS = [qk.calendario.proposals()]`. Writes add `TASKS` when tasks change and `qk.proyectos.history(id)` families when decisions are recorded.

### 11.1 Read tools
| Tool | Input (zod) | Output | Capability |
|---|---|---|---|
| `calendar_range` | `{ from: date, to: date, mostrar?: CalMostrar, quien?: "yo"\|"todos", projectIds?: uuid[] (≤10), cursor?: string }`; span ≤ 31 d | `{ days: CalDay[], items: CalItem[] (≤ 100), nextCursor, kpis }` (titles wrapped `untrusted` for event descriptions from Google) | `canViewCalendar`; `quien=todos` needs `canViewTeamCalendar` |
| `summarize_day` | `{ date?: date (default today) }` | `{ lead, tiles: { reuniones, venceHoy, enRiesgo, bloqueas }: SummaryTile[], primary: SummaryAction }` | `canViewCalendar` |
| `summarize_week` | `{ from?: date (Monday; default this week) }` | same with `venceSemana`, plus `overloadedDays` | `canViewCalendar` |
| `day_load` | `{ from: date, to: date (≤ 14 d), staffIds?: uuid[] (≤ 20) }` | `DayLoad[]` | own: everyone; others: `canViewTeamCalendar` or shared project |
| `find_overloads` | `{ from: date, to: date (≤ 31 d), staffIds?: uuid[] }` | `{ overloads: { date, staffId, hours, workday }[], overlaps: { date, eventIds }[] }` | as `day_load` |
| `meeting_prep` | `{ eventId: uuid, phrasing?: boolean }` | `MeetingPrep` (§10.2) | organizer / attendee / project member |

`list_events` and `find_free_slots` (agenda.ts) change source: Cincel events and the cache instead of live Google reads; `find_free_slots` adds `freeBusy` for other people when the caller has the grant.

### 11.2 Proposing tools (no data change; `write: false, confirm: false`)
| Tool | Input | Proposal kind | Notes |
|---|---|---|---|
| `move_tasks` | `{ moves: { taskId: uuid, toDate: date }[] (1–50) } \| { taskIds: uuid[], toDate: date }`, `reason?: string ≤ 200` | `mover_tareas` | rows the viewer can't change are dropped and listed in `deferred` "Sin permiso" |
| `create_event` (agenda.ts, changed) | existing `CreateEventSchema` + `projectId?`, `meet?: boolean (default true)`, `inviteProjectTeam?: boolean` | `crear_reunion` | default attendees §8.1; conflicts noted in `line` |
| `update_event` (changed) | existing schema | `editar_reunion` | organizer only |
| `cancel_event` (changed) | existing schema | `cancelar_reunion` | organizer only |
| `propose_from_text` | `{ text: string 3–300, view: CalView, from: date, to: date, selectedDate?: date }` | the kind the text maps to | runs one `generateText` with tools `[create_event, move_tasks]`, `toolChoice: "required"`, `stopWhen: stepCountIs(1)`, the same system prompt rules plus "solo propones"; returns the proposal or `{ ok: false, error: "NO_INTENT", message: "No entendí qué cambiar. Prueba con "Pasa lo vencido al jueves"." }`. `available` only from the Barra (not offered to the chat model, which already has both tools) |
| `propose_redistribution` | `{ date: date, staffId?: uuid, target?: "spread" \| "next_day" }` | `repartir` / `pasar_a_manana` | §10.3 |
| `resolve_overlap` | `{ eventIds: [uuid, uuid], keep?: uuid }` | `resolver_traslape` | moves the event the viewer organizes (or `keep`'s other) to the earliest common free slot of its attendees (§7.4) within 5 workdays, same length; `notify: true` → "Aplicar y avisar" |
| `plan_week` | `{ weekStart: date (Monday), staffIds?: uuid[] (≤ 20), taskIds?: uuid[] (≤ 100) }` | `planear_semana` | §10.4; others' lanes need `canChangeResponsible` or `isAgendaLead` |
| `extract_minutes` | `{ eventId: uuid, notes?: string ≤ 20 000 }` (default: the saved notes) | `crear_tareas_minuta` | `generateObject` with schema `{ decisions: string[] ≤ 10, tasks: { title, owner: string, due: string \| null }[] ≤ 20, followUp: { date, time? } \| null, openPoints: string[] }`; owners resolved by name among attendees (`byNameIlike`), dates by `parseQuickAdd` rules relative to the meeting date; unresolved owner → `managerId: null` with a flag. Notes are user content: wrapped as untrusted for the model |

Each returns `{ proposalId, kind, title, line, changes, deferred }`. The step def has `preview` rows (`op "~"` for moves, `"+"` for creates) so the chat shows the same rows.

### 11.3 Write tools (`write: true, confirm: true`)
| Tool | Input | Effect | Invalidation |
|---|---|---|---|
| `apply_proposal` | `{ proposalId: uuid, changeIds?: string[] }` | §6.3; returns `ApplyProposalResult` | `CALENDARIO`, `PROPOSALS`, `TASKS`, `EVENTS` |
| `undo_proposal` | `{ undoToken: string }` | §6.3 | same |
| `create_tasks_from_minutes` | `{ proposalId: uuid, changeIds?: string[], scheduleFollowUp?: boolean }` | `apply_proposal` restricted to kind `crear_tareas_minuta`; sets minutes `lista`, `meeting_minute_tasks`, open points | + `qk.proyectos.history(projectId)`, `qk.proyectos.tab(projectId,'tareas')` |
| `send_agenda` | `{ eventId: uuid, items: string[] 1–12, to?: "asistentes" }` | `sendMail` "Orden del día · {título}" (template `orden-del-dia`) to attendees; history line on the event | `WRITES_WITHOUT_LOCAL_CACHE` ("solo envía correo") |
| `send_minutes` | `{ eventId: uuid }` | `sendMail` "Minuta · {título}" (decisions, tasks with owner and date, next meeting) to attendees; minutes `enviada`, `sent_at` | `CALENDARIO` |

Confirmation card for `apply_proposal`: `toolPreviews.apply_proposal` reads the proposal rows (one `ToolPreviewRow` per change) and the card supports per-row checkboxes (FE §7.5); the approval response carries the checked `changeIds` as the tool input edit (`addToolApprovalResponse` + an input override) — if the AI SDK version can't edit input on approval, the card denies with reason `EDITED_REASON` and re-issues `apply_proposal` with the subset (Decision D8).

### 11.4 Existing tools touched
- `reschedule_task`: unchanged (Tareas). Its invalidation gains `CALENDARIO`.
- `schedule_site_visit`: unchanged flow (confirm card), but creates a Cincel meeting row (§3.2) linked to the task, so it shows on the calendar; invalidation gains `CALENDARIO`. Its `href` goes to `/calendario?vista=dia&fecha=…`.
- `assign_task`, `notify_people`, `create_task`: invalidation gains `CALENDARIO`.
- `list_events` / agenda step `href`s: `/calendario` instead of `/tareas`.

### 11.5 Suggestions and starters (with #1057's `tools` field)
- `ASSISTANT_TOOL_GROUPS` gains group `calendario` ("Calendario y planeación") with prompts: "Resume mi día de hoy" (`summarize_day`), "Planea mi semana" (`plan_week`), "Mueve todo lo vencido a días con menos carga" (`find_overloads`, `move_tasks`), "Busca un hueco de 2 horas para {persona} esta semana" (`find_free_slots`), "¿Qué vence antes de la entrega del {fecha}?" (`calendar_range`).
- `pickSuggestions` becomes route-aware: on `/calendario` it returns the four canvas suggestions ("¿Qué vence antes de la entrega del 17 nov?", "Resume mi día de hoy", "Busca un hueco de 2 horas para Jorge esta semana", "Mueve todo lo vencido a días con menos carga") with the real next delivery date and a real teammate name, falling back to "una persona".
- Composer placeholder on `/calendario`: "Agenda la visita de sitio de {proyecto} el jueves…" (the most recent project of the viewer).

### 11.6 Prompt rules (added to `buildSystemPrompt` when `context.calendar` is present)
- "Estás en el Calendario: {vista} del {from} al {to}, {filtros}. "Esta semana" y "este día" se refieren a ese rango." 
- "Nunca cambias datos directamente: usa las herramientas de propuesta y espera a que la persona aplique."
- "Si hay una propuesta abierta ({openProposalId}), las correcciones de la persona la reemplazan con una nueva propuesta."

## 12. Server actions (UI paths)

Reads (`lib/actions/page-data/calendario-actions.ts`, zod, `requireCapabilityUser` + `resolveCalendarCapabilities(user).canViewCalendar`, then the loader):
```ts
getCalendarioRange(input: CalendarioRangeInput): Promise<CalendarioRange>
getCalendarioList(input: CalendarioListInput): Promise<CalendarioListPage>
getCalendarioDaySummary(input: { date: string }): Promise<DaySummary>
getCalendarioWeekSummary(input: { from: string }): Promise<WeekSummary>
getCalendarioLoad(input: { from: string; to: string; staffIds?: string[] }): Promise<DayLoad[]>
getMeetingDetail(eventId: string): Promise<MeetingDetail | null>      // fields, Relacionado, Historial
getMeetingPrep(eventId: string): Promise<MeetingPrep | null>
getMeetingMinutes(eventId: string): Promise<MeetingMinutes | null>
getPlanWeek(input: { weekStart: string; staffIds?: string[] }): Promise<PlanWeekData>   // backlog + lanes + cells
getProposal(id: string): Promise<Proposal | null>
```
Writes (`lib/actions/calendario-actions.ts`, all `ActionResult`, via `toActionResult`): §8.1, §8.3, plus
```ts
proposeFromTextAction(input): Promise<ActionResult<Proposal>>        // the Barra; same function as propose_from_text
runProposingToolAction(name: "propose_redistribution" | "resolve_overlap" | "plan_week" | "extract_minutes" | "move_tasks", input: unknown): Promise<ActionResult<Proposal>>
applyProposalAction(id: string, changeIds?: string[]): Promise<ActionResult<ApplyProposalResult>>
cancelProposalAction(id: string): Promise<ActionResult<{ id: string }>>
undoProposalAction(undoToken: string): Promise<ActionResult<UndoProposalResult>>
sendAgendaAction(eventId: string, items: string[]): Promise<ActionResult<{ sent: number }>>
sendMinutesAction(eventId: string): Promise<ActionResult<{ sent: number }>>
setTaskEstimatedHoursAction(taskId: string, hours: number | null): Promise<ActionResult<TaskDetail>>
```
`runProposingToolAction` calls the tool's `run` from `findDefinedTool(name)` with a `ToolRunContext` whose `threadId` is `null`, so the ✦ buttons on the page and the chat share one implementation and one audit row (`assistant_actions` with `thread_id` null). `TaskBulkPatch` gains `{ estimatedHours: number | null }`.

## 13. Permissions

| Action | Rule |
|---|---|
| See the page | `canViewCalendar` (all roles today) |
| "Todos" / other people's lanes and loads | `canViewTeamCalendar` (Administrador, Dirección); others are forced to "yo", the option is hidden |
| See a task | `ViewerScope` as in Tareas; admin tasks only for admins (`canSeeAdminData`) |
| Move a task date | the same check as `bulkUpdateTasksAction` for `dueDate` (assertTaskVisible + date permission); skipped rows report `Sin permiso` |
| See a meeting | §8.2 |
| Create a meeting | `canViewCalendar`; linking a project requires seeing it |
| Edit / cancel a meeting | organizer; Administrador on a Cincel meeting (Google write uses the organizer's token, so an admin edit is Cincel-only and flagged `google_sync_error = 'NOT_ORGANIZER'`) |
| Minutes, send agenda / minutes | organizer and staff attendees |
| Create tasks from minutes | `canCreateActivity`; assigning others needs `canChangeResponsible`, else owner = viewer and the row says "Te la asigno a ti" |
| Plan others' week | `canChangeResponsible` or `isAgendaLead` |
| Apply / undo a proposal | only its owner (`staff_id`) |
| Estimated hours | same as editing the task's dates |

Every page-data action gets a DB test as a viewer without access (another user's proposal, another person's Google event, an admin task) → `null` / `FORBIDDEN` (query-migration §4.8 rule 3). Dehydrated state is public HTML: loaders strip attendee emails for non-organizers (name only) and never return Google descriptions of other people.

## 14. Rate limits

`createRateLimiter` per staff id (in-memory per instance, same as search):
| Path | Limit |
|---|---|
| `propose_from_text`, `extract_minutes`, `meeting_prep {phrasing}` (model calls) | 20 per 10 min |
| `apply_proposal`, `undo_proposal` | 60 per 10 min |
| `send_agenda`, `send_minutes` | 10 per hour, and 3 per event per hour |
| `refreshGoogleEventsAction` (`force`) | 6 per 10 min (the 5-minute freshness rule covers the rest) |
| `createMeetingAction` | 30 per hour |
Over the limit: `{ ok: false, error: "RATE_LIMITED" }` → "Demasiadas solicitudes. Intenta de nuevo en unos minutos." (`actionErrorText`).

## 15. Audit and history

- Proposals: `assistant_proposals` lifecycle; tool calls in `assistant_actions` as today (chat) or with `thread_id` null (page buttons).
- Applied changes: `history_events` through the existing actions (task date change = `recordChange` on `commitmentDate`), plus `recordViaAsistente({ entity, entityId, actorId, summary })` with the proposal title.
- Meetings: `history_events` with entity `calendar_event` for create, edit (field diff), cancel, minutes ready, minutes sent, agenda sent ("Ana García envió el orden del día a 3 asistentes"); this is the Historial of the Analítico drawer.
- Decisions: project history comment; deleting by undo writes "Decisión retirada".
- Logs: `logAssistantAction` JSON lines get `proposalId` and counts, never titles or notes.

## 16. Error codes

New codes in `lib/errors.ts` → Spanish copy: `STALE` "Esta propuesta ya no está vigente.", `EXPIRED` "La propuesta expiró. Pide una nueva.", `UNDO_EXPIRED` "Ya no se puede deshacer.", `NO_INTENT` (above), `GOOGLE_REAUTH` "Vuelve a conectar Google Calendar.", `GOOGLE_UNAVAILABLE` "Google Calendar no respondió. Guardé el cambio en Cincel.", `NOT_ORGANIZER` (existing copy), `RATE_LIMITED`, `RANGE_TOO_LONG` "El rango es demasiado largo.".

## 17. Tests

| Kind | What |
|---|---|
| Unit (pure) | `range.ts` (week starts Monday, month grid 6 weeks, DST-free org zone), `items.ts` (due rule, overdue at org midnight), `load.ts` (fallback chain, labels at 49/50/85/100/101 %, overlaps), `risk.ts` (each rule with fixtures from the canvas: Cimbra bloqueada frena Obra negra, Ingenierías vencida antes de la revisión), `redistribute.ts` and `plan-week.ts` (deterministic snapshots, dependencies, deadlines, absences, "Jorge ya está al 100 %"), `proposals.ts` (undo plan, stale detection), copy (sentence case, no weight/emoji) |
| DB (`*.db.test.ts`) | migration 0035; range SQL vs a JS reference on a seeded month; 5 000-task guard; visibility (§13) for every page-data action; `applyProposal` partial permission (a non-admin can't move an admin task; the card counts it), stale `before`, grouped bulk calls; `undoProposal` restores only unchanged rows and cancels created meetings; minutes → tasks + decisions + history |
| Google (mocked `fetch`) | sync token flow, 410 reset, skip mirrored and Cincel-owned events, write-through with conferenceData, 412 retry, free/busy unknown emails |
| Tools | every new tool: schema, capability per role in `SYSTEM_ACCESS_ROLES`, `available` flags, step/summary/invalidation present (the #1057 guards), outputs on mocked loaders |
| Eval-style (mocked provider) | `MockLanguageModelV4` recordings: "Junta con el cliente de Madrid 22 mañana a las 10" → `create_event` with Thu 10:00–11:00 + project team; "Pasa lo vencido al jueves" → `move_tasks` with the 3 overdue ids; "Resume mi semana" with `context.calendar` → `summarize_week` without asking for dates; minutes text of the canvas → 1 decision, 4 tasks with owners and dates, follow-up 25 nov. Assertions on the tool call and on the system prompt lines of §11.6; no live model in CI |
| Rate limits | limiter hit returns `RATE_LIMITED` |

## 18. Decisions needed (with defaults)

| # | Decision | Default |
|---|---|---|
| D1 | Ask for `calendar.events` + `calendar.freebusy` scopes (Workspace admin must allow them) | **Decided (2026-11-11):** the admin grants both scopes as the incremental grant `calendar_events`. Google write-through and free/busy are the main path; the Cincel-only meeting with email invitation is only the failure path (no grant yet, token revoked, Google unavailable), §7.1 |
| D2 | Cache other people's Google events for the team view | No: owner-only. Team view shows Cincel meetings and free/busy only |
| D3 | Workday hours source | `positions.weekly_capacity_hours / 5` of the person's highest-capacity position, else `calendario.workday_hours` = 6 |
| D4 | Task duration estimate | `tasks.estimated_hours` (nullable) → `workflow_task_templates.default_estimated_hours` → 1 h; Phase 5 seeds template defaults only where the catalog states one, else null |
| D5 | Support (apoyo) tasks in a person's hours | 0 h (they count for the manager only); shown in the list but not in the meter |
| D6 | Model use for summaries | Templates on page load; the model only rephrases on ✦ request |
| D7 | `plan_week` may reassign tasks | No in v1: it only sets dates; unassigned tasks are deferred "Sin responsable" |
| D8 | Per-row selection on the chat confirmation card | Input override on approval; fallback deny + re-issue with the subset |
| D9 | Undo window | 15 min server token; toast 10 s |
| D10 | Load label thresholds | < 50 % Libre, ≤ 85 % Bien, ≤ 100 % Casi lleno, > 100 % Sobrecargado (P5 board's "Con espacio / Lleno" map to Bien / Casi lleno) |
| D11 | Where a task's hours fall | All on its due day (no spreading across days in v1) |
| D12 | Meeting default length and attendees from the asistente | 60 min; project manager, coordinator and client contact with email |
| D13 | Invitations when a meeting takes the failure path and Google comes back later | Email (no `.ics`) and in-app at once, so nobody waits on Google; the resync (button, cron every 15 min, max 3 tries) creates the Google event with `sendUpdates=none` so attendees are never invited twice (§7.6) |
