# Spec: UI/UX redesign, Mi espacio, Control de horario and assistant everywhere (Backend)

**Status:** Ready for review (round 2) · **Owner:** Oscar · **Date:** 2026-11-07
**Source brief:** `docs/specs/source/redesign-spec.md`. Its "Decisions already made" and "Defaults to confirm" table are final, and this spec builds with them. Open questions Q1–Q4 are built with the brief's defaults.
**Companion:** `docs/specs/redesign/frontend.md`. Its §7 is the contract this file implements; §18 checks every item and §19 lists mismatches.
**Visual source:** design canvas "Cincel UI Redesign" (frames named `Frame.dc.html` below).
**Stack:** the existing app. Next.js App Router + TypeScript, Server Actions in `lib/actions/<entity>-actions.ts` (authorized through `requireCapabilityUser` in `lib/auth/session.ts`), repositories in `lib/repositories/*`, Drizzle ORM on Postgres 17 (`lib/db/schema/*`, migrations in `lib/db/migrations`, drizzle-kit), vitest, AI SDK v7 for the assistant. No new service, queue or database. The only new runtime piece is an authenticated cron route (`/api/cron/tick`) called by the host's cron every minute.

---

## 0. Context

### 0.1 What the code does today

| Concept | Today | Where |
|---|---|---|
| Theme | Grayscale tokens in CSS (black sidebar, `chart-1..5`); one stored org override, `appearance.primary_color` (a Tailwind `<family>-<shade>` token) injected as `<style id="primary-color">` in the root layout | `app/globals.css`, `lib/theme/primary-color{,-server}.ts`, `app/layout.tsx` |
| Light/dark | `ThemeToggle` writes localStorage `cincel.theme` and sets `data-theme` on `<html>`; no server knowledge, so the first paint follows the OS | `components/layout/ThemeToggle.tsx` |
| Org settings | `core.app_settings (key text PK, value text)`; `general_settings` JSON (#673), `appearance.primary_color`. Writes gated by `canManageAppearance(user)` (= `canViewSensitiveStaffData`) | `lib/db/schema/shared.ts:151-155`, `lib/actions/app-settings-actions.ts`, `lib/auth/permissions.ts:1382` |
| User preferences | None in the DB. localStorage keys: `cincel.theme`, `cincel.header.links.v1`, `cincel.dashboard.profile.photo.v1`, `cincel.asistente.thread.v1`, `cincel.actividades.general.groupBy.v1` | various |
| Profile photo | Data URL in localStorage only | `lib/auth/profile-photo.ts` |
| Notifications, reminders, notes, checklists (personal) | Do not exist. `task_checklist_items` exists but belongs to tasks | — |
| Time tracking | Does not exist. `staff.availability` is free text ("Vacaciones") | `lib/db/schema/people.ts:31` |
| Vacations | Only a Recursos section `mis-vacaciones` (resource links) | `shared.ts` `resource_links.section` check |
| Google | Staff SSO + incremental grants `?scope=drive|calendar` on `GET /api/auth/google/start`; tokens per staff in `google_oauth_accounts` (`scope` space-separated); `STAFF_OAUTH_EXTRA_SCOPES = { drive, calendar }` | `app/api/auth/google/start/route.ts`, `lib/google/staff-oauth.ts:34-43`, `lib/db/schema/auth.ts:57-69` |
| Gmail | No Gmail API. Outgoing mail is SMTP via nodemailer, `sendMail(message)` returns `{sent}`; templates `invitacion`, `enlace-acceso`, `archivo-recibido`, `layout` | `lib/email/index.ts:98`, `lib/email/templates/*` |
| Calendar | One-way push to a "Cincel" Google calendar on a manual action; ICS feed | `lib/google/calendar-sync*.ts`, `lib/calendar/ics.ts` |
| Background work | `after()` only (Drive folders, portal mail). No cron, no scheduler | `lib/actions/projects-actions.ts:47-49`, `instrumentation.ts` |
| Search | None global; per-list ILIKE; `pg_trgm` enabled with trigram indexes on `staff.name`, `contacts.name` | `0000_greenfield.sql:1,383,390` |
| Assistant | `POST /api/asistente/chat`: `streamText` with `buildAssistantTools(user)` (17 tools, capability-gated), `stopWhen: stepCountIs(5)`, provider from `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL`. Thread kept client-side in localStorage. No confirmation mechanism (prompt-only). Widgets: `render_chart`, `render_card`, `render_stat_grid`, `render_list` | `app/api/asistente/chat/route.ts`, `lib/assistant/{tools,prompt,provider}.ts` |
| Audit | `history_events` append-only (entity enum: task, project, contact, resource_link, staff, area, workflow) | `shared.ts:16-40` |
| Errors | Actions throw `Error("CODE")` / `Error("CODE: detail")`. `actionErrorText` is specified by Project Flow FE §9 but does not exist yet | `lib/errors.ts` |
| Migrations | Last applied: `0022_staff_onboarding.sql`. Project Flow reserves 0023–0025 | `lib/db/migrations/` |

### 0.2 Decisions applied (from the brief; not revisited)

1. Three themes (Azul Cincel default, Cálido, Grafito), each light + dark, as value sets for the same shadcn variables. Components never hard-code colors.
2. Three presentation styles (Visual default, Esencial, Analítico), independent from the theme; they change data presentation only, never data.
3. The org admin sets theme, tokens, type scale, shape and default style, and may disable user overrides. Publishing is blocked when text vs background contrast is below 4.5:1.
4. Mi espacio is private per user (notes, checklists, reminders, Bandeja). Every Mi espacio read and write is owner-only.
5. Gmail is read + draft; sending always needs explicit confirmation.
6. Control de horario is an org setting with `enabled` and `requiredFrom`; before that date entries are optional and excluded from payroll export; location is never stored.
7. The assistant runs on every page with page context; tools marked "Confirmar" require an approval from the user (AI SDK `needsApproval`) before acting.
8. Cutto is a separate product; Cincel only deep-links and keeps an adapter whose API methods are disabled until `CUTTO_API_URL` is set.
9. Vocabulary follows Project Flow (Tramo, Fase, Espacio, Puesto). Tramo colors are `chart-1..3` (Presale, Diseño, Construcción).
10. No blocked chains: Phase 1 (contracts) lands the migration, types, capabilities, shell, widget library, registries and extension points; every later phase depends only on it and owns its own files (§21).
11. Rollout via `user_preferences.redesign_enabled` with org default `OrgAppearance.redesignDefault` and kill switch `OrgAppearance.redesignAvailable`, enforced server-side.
12. Round 1 of the senior review (`docs/review/redesign-review.md`) is applied with the coordinator's binding decisions; see "Review round 1 fixes" at the end.

---

## 1. Project overview

**What this backend does.** It persists UI preferences and the org appearance (and turns them into CSS variables), adds Mi espacio data (notes, checklists, reminders), a notification system with per-user channels, Gmail read/draft sync, time tracking with an enforcement date, vacation requests, a global search, server-side assistant threads with native tool approvals and an audit trail, a new assistant tool catalog, and a cron route that drives reminders, digests, auto-close and Gmail sync.

**Consumers.** Only the Next.js UI through Server Actions (frontend §7), three route handlers (`/api/staff/[id]/photo`, `/api/horario/export`, `/api/cron/tick`), the existing chat route, and the assistant tools (which call the same services).

**Non-goals.** Any Cutto UI or API beyond the adapter; native apps; moving the permission matrix (`cincel.permissions.custom.v1`) to the DB; payroll integrations; geolocation; a public HTTP API; new infrastructure.

---

## 2. Module layout

**Reuse first.** Reusability is the top priority of this feature: every module below either **extends** an existing module (named) or is **new** because nothing equivalent exists. Three generic helpers carry most of the new logic (§8.0): the metrics helper (every KPI/series producer), the owner-scoped CRUD helper (every Mi espacio table) and the cron job registry (every background job). Aggregate actions return the shared widget shapes of §6.1, so one frontend widget library renders every page.

| Module | Status | Reuses |
|---|---|---|
| `lib/types/redesign.ts` | new (no existing equivalent); re-exported from `lib/types/core.ts` | — |
| `lib/types/widgets.ts` (§6.1 shared widget shapes) | new (no existing equivalent) | consumed by every aggregate action |
| `lib/validation/redesign.ts` | extends the zod pattern of `lib/settings/general-settings-schema.ts` | same strict-parse style |
| `lib/metrics/series.ts` (§8.0.1) | extends `lib/dashboard/task-trend.ts` (reuses `localIsoDate`, `taskTrendBuckets`, `TASK_TREND_TIME_ZONE`) | one helper for 7-day series, 30-day avg/min/max, week-over-week delta |
| `lib/metrics/widgets.ts` (§8.0.2) | extends `lib/dashboard/donut-groups.ts` (`tasksByBaseStatus`, `projectsByArea` → generalized to `toDistribution`) | builders `toDistribution`, `toProgressItems`, `toAttentionItems`, `toAgendaItems`, `toPersonDatum`, `toEntityCards`, `toRecordTable` |
| `lib/repositories/owner-scoped.ts` (§8.0.3) | new generic helper (no existing equivalent) | used by notes, checklists, reminders, notifications, gmail threads, assistant threads |
| `lib/cron/registry.ts`, `lib/cron/tick.ts`, `lib/cron/lock.ts` (§8.0.4) | new (no scheduler exists) | `app_settings`-free; `cron_runs` table |
| `lib/ui/preferences.ts`, `lib/ui/themes.ts` | extends `lib/theme/primary-color{,-server}.ts` (same read-with-fallback pattern, `app-settings-repository`) | `getAppSetting` / `setAppSetting` |
| `lib/ui/appearance-css.ts` | extends the `<style id="primary-color">` injection in `app/layout.tsx` | replaces it |
| `lib/ui/contrast.ts` | new (pure, client-importable; one pair list for editor, action and test) | — |
| `lib/tramos/compat.ts` | new; wraps existing `workflows` rows, `lib/areas/area-color.ts`, `isAdministratorRole` (Project Flow helpers when present) | review B7 |
| `lib/shell/nav-items/<domain>.ts` | new extension point (one file per phase) | review B5 |
| `lib/notifications/notify.ts`, `digest.ts` | new (no notification system); sends through `lib/email/index.ts` `sendMail` and `lib/email/templates/layout.ts` | `after()` like `projects-actions.ts` |
| `lib/my-space/reminder-parser.ts` | new (no existing equivalent) | `localIsoDate` from `task-trend.ts` |
| `lib/time-tracking/week-hours.ts`, `lib/vacations/approved-absences.ts`, `lib/my-space/reminders-for-day.ts` | new Phase 1 read helpers (§8.12) | consumed by Phases 3, 4, 6 |
| `lib/assistant/tool-summaries.ts` | new, client-safe (§10.1) | used by `ConfirmationCard` |
| `lib/cron/daily-producers/index.ts` + `vencimiento.ts` | new extension point (§13); Phase 1 creates the registry and the stub `vencimiento.ts` | Phase 3 implements `vencimiento.ts` |
| `lib/my-space/reminders.ts` | new; jobs registered in the cron registry | `notify` |
| `lib/gmail/{client,sync,suggest,sanitize}.ts` | extends `lib/google/staff-token.ts` (token refresh) and the incremental-grant flow of `lib/google/staff-oauth.ts` | existing OAuth start/callback routes |
| `lib/time-tracking/{settings,state,report}.ts` | settings extend `app_settings` (pattern of `general_settings`); report uses `lib/metrics/*` | permissions resolvers |
| `lib/vacations/balance.ts` | new (only a Recursos section exists) | `app_settings` for defaults |
| `lib/search/search.ts` | extends the list scoping of `tasks-repository.ts`, `projects-repository.ts`, `staff-repository.ts`, `contacts-repository.ts` (same scope helpers, `pg_trgm` indexes) | — |
| `lib/assistant/define-tool.ts`, `approvals.ts`, `threads.ts`, `tools/<domain>.ts` (+ `index.ts`) | extends `lib/assistant/tools.ts` and uses AI SDK v7 `needsApproval` (resolvers `resolveProject`, `resolveStaff`, capability resolvers) | `history-repository.ts` for audit |
| `lib/integrations/cutto-links.ts` (client-safe), `cutto-api.server.ts` (server-only) | new (no Cutto code exists) | review B11 |
| `lib/actions/preferences-actions.ts` | new; user preferences, fully implemented in Phase 1 (review B19b) | — |
| `lib/actions/org-appearance-actions.ts` | new; follows the guard pattern of `lib/actions/app-settings-actions.ts` (`fetchOrgAppearanceAction` reader in Phase 1; save/reset in Phase 6) | — |
| `lib/actions/{profile-photo,search,notifications,my-space,gmail,time-tracking,vacations,assistant,people}-actions.ts` | new action files; each delegates to existing repositories where the data exists (staff, tasks, projects, contacts, history) | `requireCapabilityUser` |
| `lib/actions/dashboard-actions.ts` | extends (`fetchInicioAction` next to `fetchDashboardTaskTrendAction`; reuses `lib/dashboard/*` through `lib/metrics/*`) | — |
| `lib/actions/tasks-actions.ts` | extends (notify hooks on assign/comment) | — |
| `lib/repositories/{preferences,notifications,my-space,gmail,time-entries,vacations,assistant}-repository.ts` | new; the owner-scoped ones are thin instances of `owner-scoped.ts` | — |
| `lib/email/templates/{recordatorio,resumen-diario,vacaciones-decision}.ts` | extends `lib/email/templates/layout.ts` (same `MailContent`, `escapeHtml`) | — |
| `lib/errors.ts` | extends (+ `actionErrorText`, shared signature with Project Flow) | — |
| `app/api/staff/[id]/photo/route.ts` | extends the pattern of `app/api/team/sensitive/[id]` (session + capability in the handler) | — |
| `app/api/horario/export/route.ts` | extends `lib/utils/export-service.ts` (CSV) | — |
| `app/api/cron/tick/route.ts` | new; runs the registry | — |
| `app/api/auth/google/start` + callback | extends (gmail grant) | — |
| `lib/db/schema/{preferences,notifications,my-space,gmail,time,vacations,assistant}.ts` | new tables (§3); `app_settings` reused for org settings; `history_events` reused for audit | — |

---

## 3. Data model (Drizzle schema changes)

All tables in schema `core`, using the shared `stamps` (created_at/updated_at) and `soft` (deleted_at) fragments from `lib/db/schema/_schema.ts`. Every `staff_id` FK is `onDelete: "cascade"` (personal data dies with the person) except audit-like references (`decided_by`, `actor`) which are `set null`.

### 3.1 ER overview

```
staff 1─1 user_preferences
staff 1─1 staff_photos
staff 1─* notifications ; staff 1─* notification_preferences (one per kind)
staff 1─* notes ; staff 1─* checklists 1─* checklist_items ; staff 1─* reminders (→ tasks?, projects?)
staff 1─1 gmail_accounts ; staff 1─* gmail_threads (→ projects?)
staff 1─* time_entries
staff 1─* vacation_requests ; staff_profiles.vacation_days (override)
staff 1─* assistant_threads 1─* assistant_messages ; assistant_threads 1─* assistant_actions
app_settings: appearance.theme (OrgAppearance JSON), time_tracking (TimeTrackingSettings JSON), vacations (VacationSettings JSON)
cron_runs (job windows), cron_leases (tick lease)
```

### 3.2 Enums (`_schema.ts`)

```ts
export const themeId = core.enum("theme_id", ["azul", "calido", "grafito"]);
export const colorMode = core.enum("color_mode", ["light", "dark", "system"]);
export const presentationStyle = core.enum("presentation_style", ["visual", "esencial", "analitico"]);
export const density = core.enum("density", ["comoda", "compacta"]);
export const notificationKind = core.enum("notification_kind", [
  "asignacion", "mencion", "vencimiento", "comentario", "aprobacion_cliente", "recordatorio", "sistema",
]);
export const noteColor = core.enum("note_color", ["neutral", "blue", "amber", "violet", "cyan"]);
export const reminderRepeat = core.enum("reminder_repeat", ["none", "daily", "weekly", "monthly"]);
export const timeEntrySource = core.enum("time_entry_source", ["sidebar", "login", "assistant", "auto_close"]);
export const vacationKind = core.enum("vacation_kind", ["vacaciones", "personal", "enfermedad"]);
export const vacationStatus = core.enum("vacation_status", ["pendiente", "aprobada", "rechazada", "cancelada"]);
export const assistantRole = core.enum("assistant_role", ["user", "assistant", "system", "tool"]);
export const assistantActionStatus = core.enum("assistant_action_status", [
  "proposed", "confirmed", "cancelled", "done", "failed",
]);
```

`historyEntity` gains `"note"`, `"reminder"`, `"time_entry"`, `"vacation_request"` (assistant actions on these are logged; §9.9).

### 3.3 `user_preferences` (new, `preferences.ts`)

```ts
export const userPreferences = core.table("user_preferences", {
  staffId: uuid("staff_id").primaryKey().references(() => staff.id, { onDelete: "cascade" }),
  theme: themeId("theme"),                          // null = org theme
  mode: colorMode("mode").notNull().default("system"),
  style: presentationStyle("style"),                // null = org default style
  density: density("density").notNull().default("comoda"),
  textSize: numeric("text_size", { precision: 3, scale: 1, mode: "number" }).notNull().default(14),
  redesignEnabled: boolean("redesign_enabled"),    // null = org redesignDefault
  quietFrom: time("quiet_from"),                    // both null or both set
  quietTo: time("quiet_to"),
  ...stamps,
}, (t) => [
  check("user_preferences_text_size_check", sql`${t.textSize} in (13, 13.5, 14, 14.5, 15, 15.5, 16)`),
  check("user_preferences_quiet_pair_check", sql`(${t.quietFrom} is null) = (${t.quietTo} is null)`),
]);
```

A missing row means all defaults. `redesignEnabled: boolean|null` is resolved to the canonical `boolean` in the resolver (§8.1).

### 3.4 `staff_photos` (new, `preferences.ts`)

```ts
export const staffPhotos = core.table("staff_photos", {
  staffId: uuid("staff_id").primaryKey().references(() => staff.id, { onDelete: "cascade" }),
  mime: text("mime").notNull(),
  bytes: bytea("bytes").notNull(),
  sha256: text("sha256").notNull(),                 // ETag
  ...stamps,
}, (t) => [
  check("staff_photos_mime_check", sql`${t.mime} in ('image/jpeg','image/png','image/webp')`),
  check("staff_photos_size_check", sql`octet_length(${t.bytes}) <= 1048576`),
]);
```

### 3.5 `notifications`, `notification_preferences` (new, `notifications.ts`)

`notify()` **always inserts a row** (review B10). Delivery state lives on the row, so deferred emails and digest-only kinds are never lost, and a later change of preferences doesn't change what was already decided.

```ts
export const notificationEmailStatus = core.enum("notification_email_status", ["none", "pending", "sent", "failed"]);

export const notifications = core.table("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  kind: notificationKind("kind").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  entity: historyEntity("entity"),
  entityId: uuid("entity_id"),
  url: text("url"),
  dedupeKey: text("dedupe_key"),                    // e.g. "vencimiento:<taskId>:2026-11-09"
  inApp: boolean("in_app").notNull(),               // listed in the Bandeja
  emailStatus: notificationEmailStatus("email_status").notNull().default("none"),
  digest: boolean("digest").notNull().default(false),   // include in the next daily digest
  digestedAt: timestamp("digested_at", { withTimezone: true }),
  deliverAfter: timestamp("deliver_after", { withTimezone: true }).notNull().defaultNow(),   // quiet hours
  emailedAt: timestamp("emailed_at", { withTimezone: true }),
  emailError: text("email_error"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("notifications_entity_pair_check", sql`(${t.entity} is null) = (${t.entityId} is null)`),
  check("notifications_delivery_check", sql`${t.inApp} or ${t.emailStatus} <> 'none' or ${t.digest}`),
  index("idx_notifications_inbox").on(t.staffId, t.createdAt).where(sql`${t.inApp}`),
  index("idx_notifications_unread").on(t.staffId).where(sql`${t.inApp} and ${t.readAt} is null`),
  index("idx_notifications_email_pending").on(t.deliverAfter).where(sql`${t.emailStatus} = 'pending'`),
  index("idx_notifications_digest_pending").on(t.staffId).where(sql`${t.digest} and ${t.digestedAt} is null`),
  uniqueIndex("notifications_dedupe_uq").on(t.staffId, t.dedupeKey).where(sql`${t.dedupeKey} is not null`),
]);

export const notificationPreferences = core.table("notification_preferences", {
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  kind: notificationKind("kind").notNull(),
  inApp: boolean("in_app").notNull().default(true),
  email: boolean("email").notNull().default(false),
  digest: boolean("digest").notNull().default(false),
  ...stamps,
}, (t) => [primaryKey({ columns: [t.staffId, t.kind] })]);
```

A kind with all three channels off produces no row (the check above). Retention: rows read (or never in-app) and older than 180 days are purged by the `daily-digest` job's housekeeping step (§13). Missing preference rows use `NOTIFICATION_DEFAULTS` (§9.3).

### 3.6 `notes`, `checklists`, `checklist_items`, `reminders` (new, `my-space.ts`)

```ts
export const notes = core.table("notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  title: text("title").notNull().default(""),
  body: text("body").notNull().default(""),         // markdown, ≤ 20 000 chars (validation)
  color: noteColor("color").notNull().default("neutral"),
  pinned: boolean("pinned").notNull().default(false),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  ...stamps, ...soft,
}, (t) => [
  check("notes_not_empty_check", sql`length(${t.title}) > 0 or length(${t.body}) > 0`),
  index("idx_notes_staff_live").on(t.staffId, t.pinned, t.updatedAt).where(sql`${t.deletedAt} is null`),
]);

export const checklists = core.table("checklists", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  ...stamps, ...soft,
}, (t) => [index("idx_checklists_staff_live").on(t.staffId).where(sql`${t.deletedAt} is null`)]);

export const checklistItems = core.table("checklist_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  checklistId: uuid("checklist_id").notNull().references(() => checklists.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  done: boolean("done").notNull().default(false),
  sortOrder: integer("sort_order").notNull(),
  ...stamps,
}, (t) => [
  check("checklist_items_text_check", sql`length(trim(${t.text})) > 0`),
  index("idx_checklist_items_list").on(t.checklistId, t.sortOrder),
]);

export const reminders = core.table("reminders", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  repeat: reminderRepeat("repeat").notNull().default("none"),
  channels: text("channels").array().notNull().default(sql`'{app}'::text[]`),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "set null" }),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  firedAt: timestamp("fired_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  ...stamps,
}, (t) => [
  check("reminders_channels_check", sql`${t.channels} <@ array['app','email']::text[] and cardinality(${t.channels}) > 0`),
  index("idx_reminders_due_open").on(t.dueAt).where(sql`${t.firedAt} is null and ${t.cancelledAt} is null`),
  index("idx_reminders_staff").on(t.staffId, t.dueAt),
]);
```

A repeating reminder is one row whose `due_at` moves forward when it fires (`fired_at` stays null; `last_fired_at` is not needed because the notification row carries the dedupe key `recordatorio:<id>:<due_at ISO>`).

### 3.7 `gmail_accounts`, `gmail_threads` (new, `gmail.ts`)

```ts
export const gmailAccounts = core.table("gmail_accounts", {
  staffId: uuid("staff_id").primaryKey().references(() => staff.id, { onDelete: "cascade" }),
  historyId: text("history_id"),                    // last Gmail historyId seen
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  lastError: text("last_error"),
  nextSyncAfter: timestamp("next_sync_after", { withTimezone: true }),  // backoff on 429/5xx
  disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),  // disconnectGmailAction (review B15)
  ...stamps,
});

export const gmailThreads = core.table("gmail_threads", {
  id: text("id").notNull(),                         // Gmail thread id
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  subject: text("subject").notNull().default(""),
  fromName: text("from_name").notNull().default(""),
  fromEmail: text("from_email").notNull().default(""),
  snippet: text("snippet").notNull().default(""),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  unread: boolean("unread").notNull().default(true),
  labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  suggestedProjectId: uuid("suggested_project_id").references(() => projects.id, { onDelete: "set null" }),
  ...stamps,
}, (t) => [
  primaryKey({ columns: [t.staffId, t.id] }),
  index("idx_gmail_threads_staff_received").on(t.staffId, t.receivedAt),
  index("idx_gmail_threads_project").on(t.projectId).where(sql`${t.projectId} is not null`),
]);
```

Only headers and snippets are cached; message bodies and attachments are read live from Gmail (`fetchGmailThreadAction`). Tokens stay in `google_oauth_accounts`. The cache keeps the last 500 threads per staff (older rows purged by the sync).

### 3.8 `time_entries` (new, `time.ts`)

```ts
export const timeEntries = core.table("time_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  workDate: date("work_date").notNull(),            // local date in America/Mexico_City
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  pauses: jsonb("pauses").$type<{ from: string; to: string | null }[]>().notNull().default(sql`'[]'::jsonb`),
  source: timeEntrySource("source").notNull(),
  closedBy: text("closed_by"),                      // 'user' | 'auto_close' | null while open
  flagged: boolean("flagged").notNull().default(false),
  note: text("note"),
  ...stamps,
}, (t) => [
  check("time_entries_order_check", sql`${t.endedAt} is null or ${t.endedAt} >= ${t.startedAt}`),
  check("time_entries_closed_by_check", sql`(${t.endedAt} is null) = (${t.closedBy} is null)`),
  uniqueIndex("time_entries_one_open_uq").on(t.staffId).where(sql`${t.endedAt} is null`),
  index("idx_time_entries_staff_date").on(t.staffId, t.workDate),
  index("idx_time_entries_date").on(t.workDate),
]);
```

Entries are never deleted (decision: "Nunca eliminar historial"); corrections are a new `history_events` row of entity `time_entry` (admin edits are out of scope for this feature; flagged rows show in the report).

### 3.9 `vacation_requests` (new, `vacations.ts`) and `staff_profiles.vacation_days` (changed)

```ts
export const vacationRequests = core.table("vacation_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  fromDate: date("from_date").notNull(),
  toDate: date("to_date").notNull(),
  kind: vacationKind("kind").notNull(),
  comment: text("comment").notNull().default(""),
  days: integer("days").notNull(),                  // work days in range, computed on insert
  status: vacationStatus("status").notNull().default("pendiente"),
  decidedBy: uuid("decided_by").references(() => staff.id, { onDelete: "set null" }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  decisionNote: text("decision_note"),
  ...stamps,
}, (t) => [
  check("vacation_requests_range_check", sql`${t.toDate} >= ${t.fromDate}`),
  check("vacation_requests_days_check", sql`${t.days} > 0`),
  index("idx_vacation_requests_staff").on(t.staffId, t.fromDate),
  index("idx_vacation_requests_decided_by").on(t.decidedBy),
  index("idx_vacation_requests_range").on(t.fromDate, t.toDate).where(sql`${t.status} in ('pendiente','aprobada')`),
]);
```

`staff_profiles` gains `vacationDays: integer("vacation_days")` (nullable; check `>= 0`): a per-person override of the org default `app_settings('vacations').daysPerYear` (review B12). The earlier `vacation_allowances` table is dropped from the design.

### 3.10 `assistant_threads`, `assistant_messages`, `assistant_actions` (new, `assistant.ts`)

```ts
export const assistantThreads = core.table("assistant_threads", {
  id: uuid("id").primaryKey(),                       // generated by the client (review B9); the server upserts
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  title: text("title").notNull().default("Nueva conversación"),
  context: jsonb("context").$type<AssistantContext>(),
  importedFrom: text("imported_from"),               // "localStorage" for importLegacyAssistantThreadAction
  ...stamps, ...soft,
}, (t) => [index("idx_assistant_threads_staff").on(t.staffId, t.updatedAt).where(sql`${t.deletedAt} is null`)]);

export const assistantMessages = core.table("assistant_messages", {
  id: text("id").notNull(),                          // AI SDK UIMessage id (unique per thread only)
  threadId: uuid("thread_id").notNull().references(() => assistantThreads.id, { onDelete: "cascade" }),
  role: assistantRole("role").notNull(),
  parts: jsonb("parts").$type<unknown[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.threadId, t.id] }),        // review R2-4
  index("idx_assistant_messages_thread").on(t.threadId, t.createdAt),
]);

export const assistantActions = core.table("assistant_actions", {      // audit of approval-gated tool calls
  id: uuid("id").primaryKey().defaultRandom(),
  threadId: uuid("thread_id").notNull().references(() => assistantThreads.id, { onDelete: "cascade" }),
  staffId: uuid("staff_id").notNull().references(() => staff.id, { onDelete: "cascade" }),
  toolCallId: text("tool_call_id").notNull(),
  tool: text("tool").notNull(),
  input: jsonb("input").notNull(),
  summary: text("summary").notNull(),               // from the tool's summarize(input)
  status: assistantActionStatus("status").notNull().default("proposed"),
  result: jsonb("result"),
  error: text("error"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex("assistant_actions_call_uq").on(t.threadId, t.toolCallId),
  index("idx_assistant_actions_staff").on(t.staffId, t.createdAt),
]);
```

`assistantActionStatus` enum = `proposed`, `confirmed`, `cancelled`, `done`, `failed` (no `expired`: approval state lives in the AI SDK message parts). Retention: the last 50 live threads per staff; older ones are soft-deleted by the `daily-digest` housekeeping step. Actions are kept (audit).

### 3.11 `cron_runs` and `cron_leases` (new, `shared.ts`)

```ts
export const cronLeases = core.table("cron_leases", {      // review B14: replaces advisory locks
  job: text("job").primaryKey(),                    // "tick" for the whole tick, or a job name
  lockedUntil: timestamp("locked_until", { withTimezone: true }).notNull().default(sql`'epoch'`),
  owner: text("owner"),                             // random id of the holder
});

export const cronRuns = core.table("cron_runs", {
  job: text("job").notNull(),
  windowKey: text("window_key").notNull(),          // idempotency key, e.g. "daily-digest:2026-11-09"
  status: text("status").notNull(),                 // 'running' | 'done' | 'failed'
  detail: jsonb("detail"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (t) => [primaryKey({ columns: [t.job, t.windowKey] })]);
```

Lease acquire (one statement, works on any pooled connection): `insert into core.cron_leases(job) values ($1) on conflict do nothing;` then `update core.cron_leases set locked_until = now() + $2::interval, owner = $3 where job = $1 and locked_until < now() returning job`. Release: `update core.cron_leases set locked_until = now() where job = $1 and owner = $3`. A crashed tick never blocks later ones: its lease expires on its own (interval = 55 s for the tick).

### 3.12 `app_settings` keys (existing table)

| Key | Value (JSON, versioned `{ version: 1, data }` like `general_settings`) | Parser |
|---|---|---|
| `appearance.theme` | `OrgAppearance` (§6), including `styleDefault`, `allowUserOverride`, `redesignDefault`, `redesignAvailable` (kill switch), plus an integer `v` bumped on every save (review B2) | `OrgAppearanceSchema` |
| `time_tracking` | `TimeTrackingSettings` | `TimeTrackingSettingsSchema` |
| `vacations` | `{ daysPerYear: number }` (default 12); per-person override in `staff_profiles.vacation_days` | `VacationSettingsSchema` |
| `appearance.primary_color` | kept, read only to seed `appearance.theme` (§4), then ignored; deleted in the Cleanup phase | — |
| `general_settings` (existing, #673) | `company` gains `instagramUrl: string \| null` and `contactEmail: string \| null`; `websiteUrl` is the existing `website` field (renamed only in the parsed type). They feed the avatar-menu links; localStorage `cincel.header.links.v1` is read once by the client and then ignored (FE Annex C5). **Known rollback effect:** the schema is `.strict()`, so an image older than this feature can't parse a row that has the new fields and General settings fall back to defaults until the row is re-saved; the rollback runbook strips the two keys with one SQL statement (documented in `docs/deployment.md`) | extends `lib/settings/general-settings-schema.ts` (both optional, `https://` URLs, email validated); schema fields and defaults land in Phase 1, the Ajustes › General UI in Phase 6 (review B19a) |

### 3.13 FK index check

Every new FK column has an index or is a PK prefix: `notifications.staff_id` (idx), `notes.staff_id`, `notes.project_id` (add `idx_notes_project` where not null), `checklists.staff_id`, `checklist_items.checklist_id`, `reminders.staff_id`, `reminders.task_id`/`project_id` (add partial indexes where not null), `gmail_threads.project_id`, `time_entries.staff_id`, `vacation_requests.staff_id`, `vacation_requests.decided_by` (add), `assistant_*` (idx). drizzle-kit generates them from the table definitions above plus the three added partial indexes.

---

## 4. Migration plan

**Rule (review B6): never hand-renumber or edit journal timestamps.** All redesign tables, enums, columns and seeds ship in **one** migration PR in Phase 1 (contracts), generated with `drizzle-kit generate` against the current `main` right before merge. If anything touching `lib/db/migrations` merged meanwhile (for example a Project Flow migration), the branch rebases, deletes its generated migration and snapshot, and regenerates, so the journal `when` and the snapshot `prevId` chain are always newer than every applied migration. The same rule binds Project Flow: whichever feature merges second regenerates on top. This avoids drizzle's "only `when` > last applied" skip.

The single migration (`<generated>_redesign_contracts.sql`) contains, in order:
1. Enums of §3.2 and §3.5 (`ALTER TYPE core.history_entity ADD VALUE IF NOT EXISTS …` for the four new entity values).
2. Tables of §3.3–§3.11 and the `staff_profiles.vacation_days` column.
3. Custom SQL appended by hand **inside the generated file** (allowed; only numbering and timestamps are off limits): seeds of `app_settings('appearance.theme')`, `('time_tracking')`, `('vacations')` when missing (below).

Seeds:
- `appearance.theme`: `baseTheme = 'azul'` with the Azul preset (§5), rendered only for flag-on users (review B17; flag-off users keep today's `globals.css` + `appearance.primary_color` pipeline). Always `styleDefault = 'visual'`, `allowUserOverride = true`, `redesignDefault = false`, `redesignAvailable = true`, `fontFamily = 'Geist'`, type scale and shape of §5.4, `v = 1`.
- `time_tracking`: `{ enabled:false, requiredFrom:null, dayStart:"09:00", dayEnd:"18:00", hoursPerDay:8, lateToleranceMin:15, workDays:[1,2,3,4,5], promptAtLogin:true, autoCloseAt:"20:00", lunchMinutes:60, exemptRoles:[] }`.
- `vacations`: `{ daysPerYear: 12 }`.

Not migrated: the localStorage profile photo (never reached the server; users re-upload), the localStorage assistant thread (imported once by the client through `importLegacyAssistantThreadAction`, no model call), `resource_links` rows of section `mis-vacaciones` (kept and listed on `/biblioteca/vacaciones` under "Documentos"; FE).

A `*.db.test.ts` applies the migration on an empty DB and on a fixture with `appearance.primary_color` set, which must stay untouched (§16).

---

## 5. Seed data: themes, type scale, shape

`lib/ui/themes.ts` (the frontend's module name, FE §14.1; one module for both sides) exports `THEME_PRESETS: Record<ThemeId, OrgAppearance>`. **This section is the single source of truth for token values (review B1): the frontend spec §14 references these tables instead of repeating them, and the seed migration (§4), `THEME_PRESETS` and the presets test use them. The `globals.css` fallback stays today's Grafito values until Phase 9 (review B17).** `chart-1..3` are the tramo colors (Presale, Diseño, Construcción); `chart-4`/`chart-5` are extra series; `chart-N-ink` is text on a `chart-N` tint (accepted from FE, Annex C · FE2).

### 5.1 Token values (light/dark per theme; source of truth for both specs)

Bold values changed in review rounds 1–2 so every pair of §5.5 passes. `warning-ink` (warning used as text) and `border-strong` (control borders, focus-adjacent outlines) are new tokens (review B1).

| Token | Azul light | Azul dark | Cálido light | Cálido dark | Grafito light | Grafito dark |
|---|---|---|---|---|---|---|
| background | #f1f4f9 | #0f1115 | #f7f5f2 | #171412 | #f5f5f4 | #141414 |
| foreground | #0f172a | #e8ebf0 | #26211c | #ece6de | #0a0a0a | #e4e4e4 |
| card | #ffffff | #1a1e24 | #ffffff | #201c19 | #ffffff | #1e1e1e |
| card-foreground | #0f172a | #e8ebf0 | #26211c | #ece6de | #0a0a0a | #e4e4e4 |
| popover | #ffffff | #1a1e24 | #ffffff | #201c19 | #ffffff | #1e1e1e |
| popover-foreground | #0f172a | #e8ebf0 | #26211c | #ece6de | #0a0a0a | #e4e4e4 |
| primary | #2563eb | **#60a5fa** | #26211c | #e08a62 | #0a0a0a | #e4e4e4 |
| primary-foreground | #ffffff | **#0b1220** | #fbf9f6 | #171412 | #ffffff | #141414 |
| secondary | #dbeafe | #1e2a44 | #f6e3d9 | #3a2a22 | #f2f2f2 | #292929 |
| secondary-foreground | #1d4ed8 | #93b4fb | #8f4421 | #f0b597 | #0a0a0a | #e4e4e4 |
| muted | #f1f5f9 | #232830 | #f3efe9 | #2a2521 | #ededed | #242424 |
| muted-foreground | **#606f86** | #9aa3ae | #6e665c | #a89f94 | #6b6b6b | #b0b0b0 |
| accent | #eef2f7 | #232830 | #f1ede7 | #2a2521 | #e6e6e6 | #303030 |
| accent-foreground | #0f172a | #e8ebf0 | #26211c | #ece6de | #0a0a0a | #e4e4e4 |
| destructive | **#d81844** | #fb7185 | #b8432f | #ef8a78 | #c6362b | **#e25a4d** |
| warning | #b45309 | #fbbf24 | #8a6414 | #e2b65a | #8a5e00 | #e0b44a |
| warning-ink | #b45309 | #fbbf24 | #8a6414 | #e2b65a | #8a5e00 | #e0b44a |
| success | #047857 | #34d399 | #3f6b4c | #8fbf9c | #1e7a46 | #4fbe84 |
| border | #e5eaf1 | #2a2f37 | #ebe6df | #332d28 | #e5e5e5 | rgba(255,255,255,0.14) |
| border-strong | **#8b939f** | **#636a77** | **#9a9289** | **#6f6761** | **#939393** | **#6a6a6a** |
| border-strong | **#8b939f** | **#636a77** | **#9a9289** | **#6f6761** | **#939393** | **#6a6a6a** |
| input | #e2e8f0 | #2a2f37 | #e3ddd4 | #3a332d | #e5e5e5 | rgba(255,255,255,0.18) |
| ring | #2563eb | #60a5fa | #cf6f45 | #e08a62 | #0a0a0a | #e4e4e4 |
| chart-1 (Presale) | #3b82f6 | #60a5fa | #cf6f45 | #e08a62 | #2a78d6 | #3987e5 |
| chart-2 (Diseño) | #8b5cf6 | #a78bfa | #9670a6 | #b896c6 | #eb6834 | #d95926 |
| chart-3 (Construcción) | **#ce8300** | #fbbf24 | **#b98b31** | #e2b65a | **#16a774** | #199e70 |
| chart-4 | **#00a0bc** | #22d3ee | #4c78a8 | #7fa3cc | **#c78600** | #c98500 |
| chart-5 | **#04a874** | #34d399 | #5e8c6a | #8fbf9c | #6250d6 | #9085e9 |
| sidebar | #f8fafc | #14171c | #f1ede7 | #1c1815 | #0a0a0a | #1b1b1b |
| sidebar-foreground | #334155 | #c3c9d2 | #4a433b | #d6cec4 | #d4d4d4 | #e4e4e4 |
| sidebar-primary | #2563eb | **#60a5fa** | #ffffff | #e08a62 | #ffffff | #e4e4e4 |
| sidebar-primary-foreground | #ffffff | **#0b1220** | #26211c | #171412 | #0a0a0a | #141414 |
| sidebar-accent | #eef2f7 | #1d2128 | #e9e3db | #2a2521 | #1f1f1f | #292929 |
| sidebar-accent-foreground | #0f172a | #e8ebf0 | #26211c | #ece6de | #ffffff | #e4e4e4 |
| sidebar-border | #e2e8f0 | #2a2f37 | #e3ddd4 | #332d28 | #262626 | rgba(255,255,255,0.14) |
| sidebar-ring | #2563eb | #60a5fa | #cf6f45 | #e08a62 | #ffffff | #e4e4e4 |

### 5.2 Ink tokens (text on tints)

| Token | Azul light | Azul dark | Cálido light | Cálido dark | Grafito light | Grafito dark |
|---|---|---|---|---|---|---|
| chart-1-ink | #1d4ed8 | #93b4fb | #8f4421 | #f0b597 | #1f5fae | #8ab8f0 |
| chart-2-ink | #6d28d9 | #c4b0fb | #654775 | #d9c2e3 | #b4461b | #f0a07d |
| chart-3-ink | **#af5006** | #f5c56b | #7a5810 | #f0d08f | #137a55 | #6fd3a8 |
| chart-4-ink | #0e7490 | #67d6e6 | #365d86 | #b3cbe6 | #8a5e00 | #f0c76a |
| chart-5-ink | #047857 | #6ee7b7 | #3f6b4c | #bfe0c8 | #4b3bb0 | #b9b0f2 |

Changes from the first draft:

| Combo | Token | Before → after |
|---|---|---|
| Azul dark | `primary` | `#3b82f6` → `#60a5fa` |
| Azul dark | `primary-foreground` | `#ffffff` → `#0b1220` |
| Azul dark | `sidebar-primary` | `#3b82f6` → `#60a5fa` |
| Azul dark | `sidebar-primary-foreground` | `#ffffff` → `#0b1220` |
| Azul light | `chart-3` | `#f59e0b` → `#ce8300` |
| Azul light | `chart-4` | `#06b6d4` → `#00a0bc` |
| Azul light | `chart-5` | `#10b981` → `#04a874` |
| Azul light | `border-strong` | `#a3acb9` → `#8b939f` |
| Azul light | `muted-foreground` | `#64748b` → `#606f86` |
| Azul light | `chart-3-ink` | `#b45309` → `#af5006` |
| Azul dark | `border-strong` | `#4b5260` → `#636a77` |
| Cálido light | `chart-3` | `#d4a03c` → `#b98b31` |
| Cálido light | `border-strong` | `#b3aba0` → `#9a9289` |
| Cálido dark | `border-strong` | `#4f4740` → `#6f6761` |
| Grafito light | `chart-3` | `#1baf7a` → `#16a774` |
| Grafito light | `chart-4` | `#eda100` → `#c78600` |
| Grafito light | `border-strong` | `#a3a3a3` → `#939393` |
| Grafito dark | `border-strong` | `#4a4a4a` → `#6a6a6a` |
| Grafito dark | `destructive` | `#e0574a` → `#e25a4d` |
| Azul light (round 2) | `destructive` | `#e11d48` → `#d81844` (new pair `destructive/background`, review R2-10) |

### 5.3 Notes

- **Legacy look unchanged while the flag is off (review B17):** `app/globals.css` keeps today's grayscale/Grafito values as the static fallback until Phase 9 (Cleanup), when `npm run themes:css` regenerates it from `THEME_PRESETS.azul`. The preset Grafito differs from today's file only in the bold round-1 fixes, which are rendered only for flag-on users through `<style id="appearance">`. Azul dark comes from the `InicioOscuro` frame; Cálido dark is proposed.
- Tints are not tokens: `color-mix(in oklab, var(--chart-N) 14%, var(--card))` light / 22% dark (FE §14.5). The tint is part of the contrast pair list (§5.5).
- Shadow per preset: Azul `suave`; Cálido and Grafito `none`.

### 5.4 Type scale and shape defaults (all themes)

`TYPE_SCALE_DEFAULT` (= FE §14.3): `pageTitle {22, 600}`, `sectionTitle {16, 600}`, `cardTitle {14, 500}`, `body {14, 400}`, `label {12, 500}`, `kpi {28, 500}`. Bounds enforced by `OrgAppearanceSchema`: pageTitle 18–32, sectionTitle 14–20, cardTitle 12–20, body 12–17, label 10–14, kpi 20–40; weights ∈ {400, 500, 600}.
`SHAPE_DEFAULT` (= FE §14.4): `radius 14`, `cardPadding 20`, `gap 16`, `shadow 'suave'` for Azul and `'none'` for Cálido and Grafito. Bounds: radius 0–24, cardPadding 8–28, gap 6–28.
Accepted color syntax for tokens: `#rgb`, `#rrggbb`, `#rrggbbaa`, `rgba(r,g,b,a)`; anything else → `INVALID`.

### 5.5 Contrast pairs and computed ratios

`lib/ui/contrast.ts` (pure, client-importable, owned by this spec) exports **one** pair list, `CONTRAST_PAIRS`, used by the theme editor, `saveOrgAppearanceAction` and the presets test (review B1). Ratios are WCAG 2.1 (relative luminance on linearized sRGB); `rgba` values are composited over the pair's background; `chart-N-tint` = `chart-N` mixed into `card` in oklab at 14 % (light) / 22 % (dark). Text on a chart color always uses `chart-N-ink`, never `chart-N`.

- **Text (≥ 4.5:1):** `foreground/background`, `foreground/card`, `muted-foreground/background`, `muted-foreground/card`, `primary-foreground/primary`, `secondary-foreground/secondary`, `destructive/card`, `destructive/background` (round 2), `success/card`, `warning-ink/card`, `sidebar-foreground/sidebar`, `sidebar-primary-foreground/sidebar-primary`, `chart-N-ink/chart-N-tint` (N = 1–5).
- **Non-text (≥ 3:1):** `chart-N/card` (N = 1–5), `border-strong/card`, `ring/background`.

Computed ratios for the §5.1–§5.2 values (every cell passes its minimum):

| Pair (min) | Azul light | Azul dark | Cálido light | Cálido dark | Grafito light | Grafito dark |
|---|---|---|---|---|---|---|
| `foreground` / `background` (4.5) | 16.19 | 15.81 | 14.66 | 14.79 | 18.15 | 14.49 |
| `foreground` / `card` (4.5) | 17.85 | 14.00 | 15.95 | 13.64 | 19.80 | 13.11 |
| `muted-foreground` / `background` (4.5) | 4.63 | 7.40 | 5.19 | 7.03 | 4.89 | 8.49 |
| `muted-foreground` / `card` (4.5) | 5.10 | 6.55 | 5.65 | 6.49 | 5.33 | 7.69 |
| `primary-foreground` / `primary` (4.5) | 5.17 | 7.36 | 15.18 | 6.97 | 19.80 | 14.49 |
| `secondary-foreground` / `secondary` (4.5) | 5.49 | 6.91 | 5.60 | 7.67 | 17.68 | 11.44 |
| `destructive` / `card` (4.5) | 5.08 | 6.22 | 5.41 | 6.91 | 5.30 | 4.61 |
| `destructive` / `background` (4.5) | 4.61 | 7.02 | 4.97 | 7.49 | 4.86 | 5.09 |
| `success` / `card` (4.5) | 5.48 | 8.70 | 6.14 | 8.14 | 5.35 | 7.17 |
| `warning-ink` / `card` (4.5) | 5.02 | 10.02 | 5.37 | 8.92 | 5.70 | 8.57 |
| `sidebar-foreground` / `sidebar` (4.5) | 9.90 | 10.78 | 8.35 | 11.32 | 13.36 | 13.55 |
| `sidebar-primary-foreground` / `sidebar-primary` (4.5) | 5.17 | 7.36 | 15.95 | 6.97 | 19.80 | 14.49 |
| `chart-1-ink` / `chart-1-tint` (4.5) | 5.74 | 5.70 | 5.99 | 6.74 | 5.34 | 6.15 |
| `chart-2-ink` / `chart-2-tint` (4.5) | 6.00 | 6.24 | 6.56 | 7.27 | 4.76 | 6.14 |
| `chart-3-ink` / `chart-3-tint` (4.5) | 4.61 | 6.60 | 5.67 | 7.48 | 4.64 | 6.89 |
| `chart-4-ink` / `chart-4-tint` (4.5) | 4.67 | 6.37 | 5.72 | 7.21 | 4.98 | 7.62 |
| `chart-5-ink` / `chart-5-tint` (4.5) | 4.78 | 7.23 | 5.23 | 7.98 | 6.75 | 6.17 |
| `chart-1` / `card` (3.0) | 3.68 | 6.58 | 3.49 | 6.43 | 4.42 | 4.58 |
| `chart-2` / `card` (3.0) | 4.23 | 6.15 | 4.07 | 6.62 | 3.20 | 4.29 |
| `chart-3` / `card` (3.0) | 3.06 | 10.02 | 3.09 | 8.92 | 3.08 | 4.90 |
| `chart-4` / `card` (3.0) | 3.11 | 9.26 | 4.61 | 6.45 | 3.07 | 5.43 |
| `chart-5` / `card` (3.0) | 3.06 | 8.70 | 3.86 | 8.14 | 5.77 | 5.33 |
| `border-strong` / `card` (3.0) | 3.10 | 3.07 | 3.07 | 3.05 | 3.07 | 3.08 |
| `ring` / `background` (3.0) | 4.69 | 7.43 | 3.21 | 6.97 | 18.15 | 14.49 |

---

## 6. Types and validation

`lib/types/redesign.ts` (re-exported from `lib/types/core.ts`), exactly the canonical contract:

```ts
export type ThemeId = "azul" | "calido" | "grafito";
export type ColorMode = "light" | "dark" | "system";
export type PresentationStyle = "visual" | "esencial" | "analitico";
export type Density = "comoda" | "compacta";
export type TextSize = 13 | 13.5 | 14 | 14.5 | 15 | 15.5 | 16;
export type UserPreferences = {
  theme: ThemeId | null; mode: ColorMode; style: PresentationStyle | null; density: Density;
  textSize: TextSize; redesignEnabled: boolean; quietHours: { from: string; to: string } | null;
};
export type TokenName =
  | "background" | "foreground" | "card" | "card-foreground" | "popover" | "popover-foreground"
  | "primary" | "primary-foreground" | "secondary" | "secondary-foreground" | "muted" | "muted-foreground"
  | "accent" | "accent-foreground" | "destructive" | "warning" | "warning-ink" | "success"
  | "border" | "border-strong" | "input" | "ring"                                  // warning-ink, border-strong: review B1
  | "chart-1" | "chart-2" | "chart-3" | "chart-4" | "chart-5"
  | "chart-1-ink" | "chart-2-ink" | "chart-3-ink" | "chart-4-ink" | "chart-5-ink"   // accepted from FE (Annex C · FE2)
  | "sidebar" | "sidebar-foreground" | "sidebar-primary" | "sidebar-primary-foreground"
  | "sidebar-accent" | "sidebar-accent-foreground" | "sidebar-border" | "sidebar-ring";
export type TypeRole = "pageTitle" | "sectionTitle" | "cardTitle" | "body" | "label" | "kpi";
export type OrgAppearance = {
  baseTheme: ThemeId;
  tokens: Record<TokenName, { light: string; dark: string }>;
  typeScale: Record<TypeRole, { size: number; weight: 400 | 500 | 600 }>;
  fontFamily: "Geist" | "Inter" | "DM Sans";
  shape: { radius: number; cardPadding: number; gap: number; shadow: "none" | "suave" | "marcada" };
  styleDefault: PresentationStyle; allowUserOverride: boolean; redesignDefault: boolean;
  redesignAvailable: boolean;     // org kill switch (review B3); false forces redesignEnabled = false
};
export type ResolvedAppearance = {
  theme: ThemeId; mode: ColorMode; style: PresentationStyle; density: Density; textSize: TextSize;
  redesignEnabled: boolean;
  cssVars: { light: Record<string, string>; dark: Record<string, string> };   // review B2
  version: number;                // appearance version `v` (bumped on every org save)
};
export type NotificationKind =
  | "asignacion" | "mencion" | "vencimiento" | "comentario" | "aprobacion_cliente" | "recordatorio" | "sistema";
export type NotificationItem = {
  id: string; kind: NotificationKind; title: string; body: string; entity: HistoryEntity | null;
  entityId: string | null; url: string | null; readAt: string | null; createdAt: string;
};
export type Note = {
  id: string; title: string; body: string; color: "neutral" | "blue" | "amber" | "violet" | "cyan";
  pinned: boolean; projectId: string | null; updatedAt: string;
};
export type ChecklistItem = { id: string; text: string; done: boolean; sortOrder: number };
export type Checklist = { id: string; title: string; projectId: string | null; items: ChecklistItem[] };
export type Reminder = {
  id: string; text: string; dueAt: string; repeat: "none" | "daily" | "weekly" | "monthly";
  channels: ("app" | "email")[]; taskId: string | null; projectId: string | null;
  firedAt: string | null; cancelledAt: string | null;
};
export type GmailThreadSummary = {
  id: string; subject: string; from: string; snippet: string; receivedAt: string; unread: boolean;
  projectId: string | null; suggestedProjectId: string | null;
};
export type TimeTrackingSettings = {
  enabled: boolean; requiredFrom: string | null; dayStart: string; dayEnd: string; hoursPerDay: number;
  lateToleranceMin: number; workDays: number[]; promptAtLogin: boolean; autoCloseAt: string | null;
  lunchMinutes: number; exemptRoles: string[];
};
export type TodayStatus = {
  state: "off" | "on" | "pausa" | "done"; startedAt: string | null; workedSeconds: number;
  required: boolean; promptAtLogin: boolean; enabled: boolean;
  requiredFrom: string | null; hoursPerDay: number;   // for the sidebar TimeClock (one call from the layout)
};
export type TeamHoursRow = {
  staffId: string; name: string; days: { date: string; hours: number }[]; total: number; target: number;
  lateCount: number; status: "completo" | "incompleto" | "sin_registro";
};
export type VacationKind = "vacaciones" | "personal" | "enfermedad";
export type VacationRequest = {
  id: string; from: string; to: string; kind: VacationKind; comment: string;
  status: "pendiente" | "aprobada" | "rechazada" | "cancelada";
};
export type VacationBalance = { entitled: number; taken: number; pending: number; available: number };
export type SearchResult = {
  type: "proyecto" | "tarea" | "persona" | "archivo" | "nota";        // "Acciones" is a static frontend group
  id: string; title: string; subtitle: string; url: string;
};
export type AssistantContext = { route: string; projectId?: string; taskId?: string; personId?: string };
export type AssistantActionRecord = {     // audit of approval-gated tool calls (review B9)
  id: string; threadId: string; toolCallId: string; tool: string; summary: string; input: unknown;
  status: "proposed" | "confirmed" | "cancelled" | "done" | "failed";
  result: unknown | null; error: string | null; createdAt: string; decidedAt: string | null;
};
export type GmailMessage = { id: string; from: string; to: string[]; cc: string[]; date: string; html: string; text: string };
export type GmailAttachment = { messageId: string; attachmentId: string; name: string; mime: string; size: number };
```

`HistoryEntity` is the existing union from `lib/types/core.ts` plus the four new values. `GmailThreadSummary.from` is `"<name> <email>"` rendered from `from_name`/`from_email`. `InicioData` and `PersonaDetail` are defined in §7.10/§7.11 below and are composed only of the shared shapes of §6.1.

### 6.1 Shared widget data shapes (`lib/types/widgets.ts`, single source)

`lib/types/widgets.ts` is the **only** definition of the widget data shapes (review B5). It is landed by the contracts phase; the frontend widget library (`components/widgets/*`, FE §4.10) imports these types directly and there is no `components/widgets/types.ts`. The shapes are serializable (server actions return them); UI-only concerns are **component props**, not data fields: `actions` (`ReactNode`) on `PeopleWidget`, `footer` on `EntityCardGrid`, `renderCell` on `RecordTable`. This reconciles FE §4.10.1 and the earlier BE draft into one definition:

```ts
import type { PresentationStyle } from "@/lib/types/redesign";

export type Series7 = number[];                                   // 7 points, oldest → newest
export type Tone = "default" | "ok" | "warn" | "critical";
export type TramoKey = string;                                    // workflows.key

export type KpiDatum = {
  key: string; label: string; value: number; display?: string;
  delta?: { value: number; good: boolean; caption: string };     // week-over-week
  series7?: Series7; avg30?: number; min30?: number; max30?: number;
  split?: { tramo: TramoKey; share: number }[];                  // share 0–1
  caption?: string; href?: string;
  visibleIn?: PresentationStyle[];                               // omitted = all styles (review B13)
};

export type DistributionSegment = {
  key: string; label: string; value: number; colorVar: string;  // e.g. "var(--chart-1)"
  secondary?: number; extra?: Record<string, number | string>;
};

export type ProgressItem = {
  id: string; label: string; sublabel?: string; real: number;   // 0–100
  plan?: number | null; budgetPct?: number | null; colorVar?: string; href?: string;
  next?: { title: string; date: string } | null;
};

export type AttentionItem = {
  id: string; title: string; href: string; project: string; tramo: TramoKey | null;
  reason: string; tone: Tone;
  assignee: { id: string; name: string; initials: string } | null;
  due: string | null; daysLate: number | null;
};

export type AgendaItem = {
  id: string; title: string; start: string; end?: string; allDay?: boolean; estimated?: boolean;
  project?: string; tramo?: TramoKey | null; attendees?: string[]; href?: string;
  meetingUrl?: string;           // only when a Cutto URL is stored on the event (none until Cutto Q1)
};

export type Availability = "libre" | "ocupado" | "saturado" | "vacaciones";

export type PersonDatum = {
  id: string; name: string; initials: string; photoUrl?: string | null;
  puesto?: string | null;        // Project Flow positions when present, else null (no access role as puesto)
  tramo?: TramoKey | null; open: number; overdue: number; activeProjects?: number; occupancyPct?: number;
  weekHours?: number | null; availability?: Availability[]; href?: string;
};

export type EntityCard = {
  id: string; title: string; subtitle?: string; href?: string; iconName?: string;   // lucide icon name
  tramo?: TramoKey | null; progress?: number;
  badges?: { label: string; tone: Tone }[];
  meta?: { label: string; value: string }[];
};

export type RecordColumn = {
  key: string; label: string; align?: "left" | "right"; mono?: boolean; width?: number;
  format?: "text" | "count" | "percent" | "hours" | "days" | "date" | "delta" | "mxn";
  hideOn?: PresentationStyle[];
};
export type RecordTableData = {
  columns: RecordColumn[]; rows: Record<string, unknown>[];
  groupBy?: string; totals?: Record<string, string | number> | "auto";
  heat?: { key: string; warnAt: number; critAt: number }[];
};
```

Rules: Esencial and Analítico render from the same data (Analítico reads `avg30`/`min30`/`max30`, `plan`, `secondary`/`extra`, heat; Esencial reads `label`/`value`); `visibleIn` lets a datum appear only in some styles without the page branching on style. `colorVar` for tramos comes from `tramoColorVar(workflowKey)` in `lib/tramos/compat.ts`; `vacaciones` comes from approved vacation requests.

---

## 7. Server actions

Every actions file listed below has a sibling flags module `<file>.flags.ts` exporting `IMPLEMENTED` (§9.10); the actions files themselves are `"use server"` and export only async functions.

Auth notation: **staff** = any session from `requireCapabilityUser()` (the caller is `user.member.id`); **owner** = staff, and every query filters by the caller's id (a row of someone else → `FORBIDDEN`, a missing row → `NOT_FOUND`); capabilities are the §12 helpers (`canManageAppearance`, `canManageTimeTracking`, `canViewTeamHours`, `canDecideVacations`) or existing resolved capabilities by their real names (`team.canViewTeam`, `clients.canViewClients`, `activities.canCreateActivity`, `activities.canChangeResponsible`, `portal.manageAccess`). Admin-only data (Project Flow admin tasks, client and origin fields) is filtered in every read through `canSeeAdminData` from `lib/tramos/compat.ts` (§9.7). Error codes are thrown as `Error("CODE")` or `Error("CODE: detail")` and mapped by `actionErrorText(err, context?)` (§9.10).

### 7.1 Preferences and org appearance

**`lib/actions/preferences-actions.ts`** (new; implemented in Phase 1, review B19b):

| Action | Input | Output | Auth | Errors | revalidatePath |
|---|---|---|---|---|---|
| `fetchMyPreferencesAction()` | | `UserPreferences` (defaults when no row) | staff | | |
| `updateMyPreferencesAction(patch)` | `Partial<UserPreferences>` (`UserPreferencesPatchSchema`) | `{ preferences: UserPreferences; appearance: ResolvedAppearance }`; sets the `cincel-appearance` cookie (§8.2) | staff | `INVALID`; `OVERRIDE_DISABLED` (theme or style non-null while `allowUserOverride = false`); `DISABLED` (`redesignEnabled: true` while `redesignAvailable = false`) | **none**: the client applies `appearance.cssVars` immediately; the next navigation renders from the cookie (the text-size slider is debounced 400 ms) |

**`lib/actions/org-appearance-actions.ts`** (new; `fetchOrgAppearanceAction` is a Phase 1 reader, save/reset are owned by Phase 6; guards follow `app-settings-actions.ts`):

| Action | Input | Output | Auth | Errors | revalidatePath |
|---|---|---|---|---|---|
| `fetchOrgAppearanceAction()` | | `OrgAppearance` | staff | | |
| `saveOrgAppearanceAction(input)` | `OrgAppearance` (`OrgAppearanceSchema`) | `OrgAppearance` | `canManageAppearance` | `FORBIDDEN`, `INVALID`, `LOW_CONTRAST: <pair> <mode> <ratio>[, …]` (pair list of `lib/ui/contrast.ts`, §8.2) | `/` (`layout`); bumps the appearance version `v` |
| `resetOrgAppearanceAction(base)` | `ThemeId` | `OrgAppearance` = preset `base` (tokens, type scale, shape); keeps `styleDefault`, `allowUserOverride`, `redesignDefault`, `redesignAvailable` | `canManageAppearance` | `FORBIDDEN` | `/` (`layout`); bumps `v` |

### 7.2 Profile photo (`lib/actions/profile-photo-actions.ts`, new, + route handlers)

| Action / route | Input | Output | Auth | Errors | revalidatePath |
|---|---|---|---|---|---|
| `POST /api/staff/me/photo` (route handler, not an action) | `multipart/form-data` field `file` (≤ 2 MB; the client re-encodes through `<canvas>` to JPEG ≤ 1024 px first) | `200 { url }` (`/api/staff/<id>/photo?v=<sha8>`); EXIF/XMP metadata stripped server-side (§8.11) | staff (401) | `413 { error: "TOO_LARGE" }`, `415 { error: "INVALID_TYPE" }` (magic bytes via `file-type` not jpeg/png/webp), `429 { error: "RATE_LIMITED" }` | the handler calls `revalidatePath("/", "layout")` |
| `removeMyPhotoAction()` | | `void` | staff | | `/` (`layout`) |
| `GET /api/staff/[id]/photo` | | image bytes; `ETag` = sha256, `Cache-Control: private, max-age=86400`, `304` on match | staff (401) | `404` when none | |

### 7.3 `lib/actions/search-actions.ts` (new; extends list scoping of the existing repositories)

| Action | Input | Output | Auth | Errors | revalidatePath |
|---|---|---|---|---|---|
| `searchWorkspaceAction(input)` | `{ query: string; types?: SearchResult["type"][]; limit?: number }` (limit 1–50, default 20) | `SearchResult[]` ranked (§8.9). Types: `proyecto`, `tarea`, `persona`, `archivo`, `nota` (the "Acciones" group is static in the frontend; the backend returns no `accion` results) | staff; scoped like the list actions; contacts only with `clients.canViewClients`; notes owner-only; admin data via `canSeeAdminData` | `INVALID` (trimmed query < 2), `RATE_LIMITED` (> 30/min) | |

URLs: proyecto `/proyectos/<id>`; tarea `/tareas/<id>`; staff `/personas/equipo/<id>`; contact `/personas/clientes?contacto=<id>` (opens the contact sheet); archivo = Drive web view link; nota `/mi-espacio/notas/<id>`.

### 7.4 `lib/actions/notifications-actions.ts` (new)

| Action | Input | Output | Auth | Errors | revalidatePath |
|---|---|---|---|---|---|
| `fetchNotificationsAction(input)` | `{ unreadOnly?: boolean; kinds?: NotificationKind[]; cursor?: string }` (cursor `<createdAt ISO>_<id>`, page 30) | `{ items: NotificationItem[]; nextCursor: string \| null; unreadCount: number }` (rows with `in_app = true` only) | owner | `INVALID` | |
| `markNotificationsReadAction(ids)` | `string[] \| "all"` | `{ unreadCount }` | owner (others' ids ignored) | `INVALID` | `/mi-espacio` |
| `fetchNotificationPreferencesAction()` | | `{ rows: { kind; inApp; email; digest }[]; quietHours: { from; to } \| null }` (one row per kind, defaults filled) | owner | | |
| `updateNotificationPreferencesAction(input)` | same shape | same | owner | `INVALID` | `/ajustes/notificaciones` |

`notify(staffIds, payload)` (`lib/notifications/notify.ts`) is an internal producer, not an action (§8.3).

### 7.5 `lib/actions/my-space-actions.ts` (new; all repositories are `ownerScoped` instances, §8.0.3)

| Action | Input | Output | Auth | Errors | revalidatePath |
|---|---|---|---|---|---|
| `fetchNotesAction()` | | `Note[]` live, pinned first, then `updatedAt desc` | owner | | |
| `createNoteAction(input)` | `{ title?; body?; color?; pinned?; projectId? }` | `Note` | owner; `projectId` must be visible to the caller | `INVALID` (both empty; body > 20 000; project not visible) | `/mi-espacio` |
| `updateNoteAction(id, patch)` | partial of the same | `Note` | owner | `NOT_FOUND`, `FORBIDDEN`, `INVALID` | `/mi-espacio` |
| `archiveNoteAction(id)` | | `void` (soft delete) | owner | `NOT_FOUND`, `FORBIDDEN` | `/mi-espacio` |
| `restoreNoteAction(id)` | | `Note` (clears `deleted_at`; undo of `archiveNoteAction`) | owner | `NOT_FOUND`, `FORBIDDEN` | `/mi-espacio` |
| `fetchChecklistsAction()` | | `Checklist[]` live, items by `sortOrder` | owner | | |
| `createChecklistAction(input)` | `{ title; items?: string[]; projectId? }` | `Checklist` | owner; project visible | `INVALID` | `/mi-espacio` |
| `addChecklistItemAction(checklistId, text)` | | `ChecklistItem` (appended) | owner of the checklist | `NOT_FOUND`, `FORBIDDEN`, `INVALID` | `/mi-espacio` |
| `toggleChecklistItemAction(itemId, done)` | | `ChecklistItem` | owner | `NOT_FOUND`, `FORBIDDEN` | `/mi-espacio` |
| `reorderChecklistItemsAction(checklistId, ids)` | exactly the checklist's item ids | `void` | owner | `NOT_FOUND`, `FORBIDDEN`, `INVALID` | `/mi-espacio` |
| `archiveChecklistAction(id)` | | `void` | owner | `NOT_FOUND`, `FORBIDDEN` | `/mi-espacio` |
| `fetchRemindersAction(input)` | `{ from?: ISO; to?: ISO }` (default now − 1 day … now + 30 days, open only) | `Reminder[]` by `dueAt` | owner | `INVALID` | |
| `parseReminderTextAction(text)` | `string` (≤ 280) | `{ cleanText: string; dueAt: string \| null; repeat: Reminder["repeat"] }` (§8.4) | staff | `INVALID` | |
| `createReminderAction(input)` | `{ text; dueAt; repeat?; channels?; taskId?; projectId? }` | `Reminder` | owner; task/project visible to the caller | `INVALID`, `PAST_TIME` (dueAt < now − 60 s) | `/mi-espacio` |
| `snoozeReminderAction(id, until)` | ISO | `Reminder` (`dueAt = until`, `firedAt = null`) | owner | `NOT_FOUND`, `FORBIDDEN`, `PAST_TIME` | `/mi-espacio` |
| `cancelReminderAction(id)` | | `void` | owner | `NOT_FOUND`, `FORBIDDEN` | `/mi-espacio` |

### 7.6 `lib/actions/gmail-actions.ts` (new; extends `lib/google/staff-token.ts` and the incremental-grant flow)

| Action | Input | Output | Auth | Errors | revalidatePath |
|---|---|---|---|---|---|
| `fetchGmailStatusAction()` | | `{ connected: boolean; scopeOk: boolean; lastSyncedAt: string \| null; lastError: string \| null }` (`connected` false after `disconnectGmailAction`) | owner | | |
| `fetchGmailThreadsAction(input)` | `{ query?: string; cursor?: string }` (cache: ILIKE subject/from/snippet; page 30) | `{ threads: GmailThreadSummary[]; nextCursor: string \| null }` | owner | `NOT_CONNECTED`, `SCOPE_MISSING` | |
| `fetchGmailThreadAction(id)` | Gmail thread id | `{ thread: GmailThreadSummary; messages: GmailMessage[]; attachments: GmailAttachment[] }` (live; marks read in Gmail and in the cache; `html` sanitized, rendered by the client in `<iframe sandbox srcdoc>`) | owner | `NOT_FOUND`, `NOT_CONNECTED`, `SCOPE_MISSING` | |
| `syncGmailAction()` | | `{ synced: number }` | owner | `NOT_CONNECTED`, `RATE_LIMITED` (< 30 s since last, or backoff) | `/mi-espacio` |
| `linkGmailThreadToProjectAction(threadId, projectId)` | `projectId: string \| null` | `void`; a link writes a project history comment "Correo vinculado: <asunto>" visible to the project's viewers (the UI says so before linking) | owner + project visible | `NOT_FOUND`, `FORBIDDEN` | `/mi-espacio`, `/proyectos/[id]` |
| `createGmailDraftAction(input)` | `{ to: string[] (1–20); subject; body (markdown); replyToThreadId?; draftId? }` (with `draftId` the existing draft is updated through `drafts.update`, so edits don't pile up drafts) | `{ draftId: string; confirmToken: string; expiresAt: string }` (token valid 10 min, §8.6) | owner | `INVALID`, `NOT_CONNECTED`, `SCOPE_MISSING`, `NOT_FOUND` (unknown `draftId`) | |
| `sendGmailDraftAction(draftId, confirmToken)` | | `{ messageId }` | owner | `CONFIRM_REQUIRED` (missing/invalid), `EXPIRED` (> 10 min), `NOT_CONNECTED` | `/mi-espacio` |
| `createTaskFromGmailThreadAction(threadId, input)` | `{ projectId; title? }` (title defaults to the subject) | `{ taskId }` (existing `createUserTask` path; notes = sender + snippet + Gmail link; also links the thread) | owner + `activities.canCreateActivity` + project visible | `NOT_FOUND`, `FORBIDDEN`, `NOT_CONNECTED` | `/mi-espacio`, `/tareas` |
| `disconnectGmailAction()` | | `void`: stops sync, deletes the caller's `gmail_threads`, sets `gmail_accounts.disconnected_at`. It does **not** revoke the shared Google token (Drive and Calendar use it); the UI says so and links to https://myaccount.google.com/permissions | owner | | `/mi-espacio`, `/ajustes/integraciones` |

Route `GET /api/gmail/attachments/[messageId]/[attachmentId]` (used by Mi espacio › Gmail): owner only (the message must be in the caller's mailbox; 401 without session, 404 otherwise, 409 `NOT_CONNECTED`), streams the bytes from `messages.attachments.get` with the attachment's mime type, `Content-Disposition: attachment; filename*=UTF-8''<name>`, `X-Content-Type-Options: nosniff`, `Cache-Control: private, no-store`; nothing is cached server-side.

Consent: `GET /api/auth/google/start?grant=gmail` (alias of the existing `scope=` parameter, §11.1). Reconnecting after a disconnect clears `disconnected_at` and runs a full first sync.

### 7.7 `lib/actions/time-tracking-actions.ts` (new; settings extend `app_settings`)

| Action | Input | Output | Auth | Errors | revalidatePath |
|---|---|---|---|---|---|
| `fetchTimeTrackingSettingsAction()` | | `TimeTrackingSettings` | staff | | |
| `saveTimeTrackingSettingsAction(input)` | `TimeTrackingSettings` | `TimeTrackingSettings` | `canManageTimeTracking` | `FORBIDDEN`; `INVALID` (dayEnd ≤ dayStart; hoursPerDay ∉ 1–12; workDays empty or ∉ 0–6; exemptRoles ∉ `OFFICIAL_CINCEL_ROLES`; a **changed** `requiredFrom` earlier than tomorrow, so trial days never become payroll days retroactively) | `/` (`layout`), `/ajustes/horario` |
| `fetchMyTodayAction()` | | `TodayStatus` (incl. `requiredFrom`, `hoursPerDay`, §9.5) | staff | | |
| `clockInAction(input)` | `{ source: "sidebar" \| "login" \| "assistant" }` | `TodayStatus` | staff | `DISABLED` (off or exempt), `ALREADY_ON` | none (client updates from the result) |
| `pauseWorkAction()` | | `TodayStatus` | staff | `NOT_ON` | none |
| `resumeWorkAction()` | | `TodayStatus` | staff | `NOT_ON` | none |
| `clockOutAction()` | | `TodayStatus` (closes an open pause first) | staff | `NOT_ON` | none |
| `fetchTeamHoursAction(input)` | `{ weekStart: "YYYY-MM-DD" }` (a Monday) | `TeamHoursRow[]` (active, non-exempt staff) | `canViewTeamHours` | `FORBIDDEN`, `INVALID` | |
| `fetchMyWeekHoursAction()` | | `{ days: { date: string; hours: number }[]; total: number; target: number }` (the caller's current week, Mon–Sun, same rules as §8.7; used by Perfil) | staff | | |

Route `GET /api/horario/export?week=YYYY-MM-DD`: `canViewTeamHours` (403), `text/csv; charset=utf-8` with BOM, file `horario-<week>.csv`, columns `persona,fecha,entrada,salida,pausas_min,horas,origen,marcada`; every cell beginning with `=`, `+`, `-`, `@`, tab or CR is prefixed with `'` (formula injection); days before `requiredFrom` are excluded and counted in header `X-Cincel-Trial-Days`.

### 7.8 `lib/actions/vacations-actions.ts` (new)

| Action | Input | Output | Auth | Errors | revalidatePath |
|---|---|---|---|---|---|
| `fetchMyVacationsAction()` | | `{ balance: VacationBalance; requests: VacationRequest[] }` (current year) | owner | | |
| `requestVacationAction(input)` | `{ from; to; kind; comment? }` | `VacationRequest`; notifies deciders (`sistema`) | owner | `INVALID` (to < from; > 30 days; 0 work days), `OVERLAP` | `/biblioteca/vacaciones` |
| `cancelVacationRequestAction(id)` | | `void` (→ cancelada; pendiente, or aprobada with `from` in the future) | owner | `NOT_FOUND`, `FORBIDDEN` (another person's request), `STARTED` (aprobada and already started) | `/biblioteca/vacaciones` |
| `fetchPendingVacationRequestsAction()` | | `(VacationRequest & { staffId; name; days })[]` pendiente, oldest first ("Solicitudes del equipo") | `canDecideVacations` | `FORBIDDEN` | |
| `decideVacationAction(id, decision, note?)` | `'aprobada' \| 'rechazada'` | `VacationRequest`; notifies the requester (in-app + email `vacaciones-decision`) | `canDecideVacations`, not the requester | `FORBIDDEN`, `NOT_FOUND`, `INVALID` (not pendiente) | `/biblioteca/vacaciones`, `/personas` |
| `fetchTeamAbsencesAction(input)` | `{ month: "YYYY-MM" }` | `{ staffId; name; from; to; kind: VacationKind \| "ausencia" }[]` (aprobada; pendiente too for deciders). `kind` is the real one only for the owner's own rows and for `canDecideVacations`; everyone else gets `"ausencia"` | staff | `INVALID` | |
| `fetchVacationSettingsAction()` | | `{ daysPerYear: number; overrides: { staffId; name; days: number \| null }[] }` (active staff) | `canDecideVacations` | `FORBIDDEN` | |
| `saveVacationSettingsAction(input)` | `{ daysPerYear: number (0–60); overrides: { staffId; days: number \| null }[] }` | same as fetch | `canDecideVacations` | `FORBIDDEN`, `INVALID` | `/biblioteca/vacaciones` (the "Días de vacaciones" section of Mis vacaciones, visible to `canDecideVacations`; review R2-6) |

### 7.9 Assistant (`lib/actions/assistant-actions.ts`, `app/api/asistente/chat/route.ts`)

| Action | Input | Output | Auth | Errors | revalidatePath |
|---|---|---|---|---|---|
| `fetchAssistantThreadsAction()` | | `{ id; title; updatedAt }[]` (live, newest first, max 50) | owner | | |
| `fetchAssistantThreadAction(id)` | | `{ thread: { id; title; context; updatedAt }; messages: UIMessage[] }` | owner | `NOT_FOUND` | |
| `deleteAssistantThreadAction(id)` | | `void` (soft delete) | owner | `NOT_FOUND` | `/asistente` |
| `importLegacyAssistantThreadAction(messages)` | `UIMessage[]` from `cincel.asistente.thread.v1` (≤ 200; tool parts kept as display only) | `{ id }` of the new thread; no model call | owner | `INVALID` | `/asistente` |
| `fetchAssistantActionsAction(input)` | `{ threadId?: string; cursor?: string }` | `AssistantActionRecord[]` (audit of approval-gated tool calls, newest first, page 30) | owner | `NOT_FOUND` (thread) | |

Chat route `POST /api/asistente/chat`, body `{ id: string (thread uuid generated by the client); message?: UIMessage (the new user message); approvals?: { toolCallId: string; approved: boolean }[]; context: AssistantContext }`. The server upserts the thread (owner check), **loads the history from `assistant_messages`** (client history is ignored), appends the new message or applies the approval responses, runs `streamText` with `buildAssistantTools(user, context)`, and persists the turn in `onFinish`. Tools with `needsApproval` (§10.1) stream an approval request that the client renders with `ConfirmationCard` (`render_confirmation` visual) and answers with `addToolApprovalResponse`; the model then receives the tool result (or the denial) and continues. Each approval-gated call is audited in `assistant_actions` (§8.10).

### 7.10 `lib/actions/dashboard-actions.ts` (extends: `fetchInicioAction` next to `fetchDashboardTaskTrendAction`)

| Action | Input | Output | Auth | Errors | revalidatePath |
|---|---|---|---|---|---|
| `fetchInicioAction()` | | `InicioData` | staff; scoped by `scopeDashboardProjects` / `scopeDashboardTasks`; admin tasks only with `canSeeAdminData` | | |

`InicioData` (FE §7.9 field names) uses only the shared shapes (§6.1):

```ts
export type InicioData = {
  kpis: KpiDatum[];               // proyectos_activos, vencidas, bloqueadas, revisiones_7d, completadas_semana (visibleIn: ["analitico"])
  tasksByTramo: DistributionSegment[];   // value = open, secondary = overdue, extra = { diasProm }
  weeklyPace: { weekStart: string; created: number; completed: number }[];   // 8 weeks
  attention: AttentionItem[];
  myDay: AgendaItem[];            // events, tasks due today, the caller's reminders
  projectsProgress: ProgressItem[];
  workload: PersonDatum[];
};
```

KPI values come from the metrics helper (§8.0.1) over the existing dashboard sources; `tasksByTramo` uses the generalized grouping (§8.0.2) with `tramoColorVar` from `lib/tramos/compat.ts`. `plan`/`budgetPct` are `null` until a plan source exists (budget only with `canSeeAdminData`).

### 7.11 `lib/actions/people-actions.ts` (new)

| Action | Input | Output | Auth | Errors | revalidatePath |
|---|---|---|---|---|---|
| `fetchPersonaDetailAction(staffId)` | | `PersonaDetail` | `team.canViewTeam`; `weekHours` only for `canViewTeamHours` or self; tasks without admin tasks unless `canSeeAdminData` | `NOT_FOUND` | |
| `fetchPeopleOverviewAction()` | | `PeopleOverviewRow[]` (active staff) | `team.canViewTeam` | | |

```ts
export type PersonaDetail = {      // FE §7.9 field names
  staff: Staff;
  person: PersonDatum;
  stats: KpiDatum[];               // abiertas, vencidas, horas_semana (viewer/self), proyectos_activos
  projects: ProgressItem[];        // sublabel = role: responsable | coordinador | miembro
  tasks: AttentionItem[];          // open assigned tasks, overdue first
  weekHours: { date: string; hours: number }[] | null;
  availability: Availability[];    // Mon–Fri
};
export type PeopleOverviewRow = {
  staffId: string; open: number; overdue: number; activeProjects: number;
  occupancyPct: number;            // open / capacity × 100 (capacity 0 → 0)
  weekHours: number | null;        // canViewTeamHours or self, else null
  availability: Availability[];    // Mon–Fri
};
```

`availability`: `vacaciones` from approved requests; else open tasks due that day vs `capacity / 5` (≤ 60 % libre, ≤ 100 % ocupado, > 100 % saturado). Counts exclude admin tasks unless the viewer has `canSeeAdminData`.

### 7.12 `lib/actions/projects-actions.ts` (extends)

| Action | Input | Output | Auth | Errors | revalidatePath |
|---|---|---|---|---|---|
| `fetchProjectsPortfolioAction()` | | `PortfolioRow[]` | same scope as `fetchProjectsAction` | | |

```ts
export type PortfolioRow = {
  projectId: string;
  real: number;                       // 0–100 (Cronograma progress when a schedule exists, else projects.progress)
  plan: number | null;                // schedule planned % today
  deviation: number | null;           // real − plan (points)
  budgetSpentPct: number | null;      // canSeeAdminData only, else null
  open: number; overdue: number;      // admin tasks excluded unless canSeeAdminData
  daysToDelivery: number | null;      // to projects.end_date
  nextDelivery: { title: string; date: string } | null;   // next open non-admin task by commitment date
  series7: number[];                  // open tasks per day, last 7 days
};
```

### 7.13 Routes and modules the UI depends on

| Route / module | Contract |
|---|---|
| `POST /api/staff/me/photo`, `GET /api/staff/[id]/photo` | §7.2 |
| `GET /api/horario/export` | §7.7 |
| `GET /api/gmail/attachments/[messageId]/[attachmentId]` | §7.6 |
| `GET /api/auth/google/start?grant=gmail` | §11.1 |
| `POST /api/asistente/chat` | §7.9 |
| `POST /api/cron/tick` | §13 (host cron only) |
| `lib/integrations/cutto-links.ts` (client-safe) | `channelUrl(projectId)`, `meetingUrl(meetingId)`, `personChatUrl(email)` from `NEXT_PUBLIC_CUTTO_BASE_URL` (§11.2) |
| `lib/ui/contrast.ts` (client-safe) | `CONTRAST_PAIRS`, `checkContrast(tokens, mode)` (§8.2) |
| `lib/tramos/compat.ts` | `listTramos`, `tramoLabel`, `tramoColorSlot`, `tramoColorVar`, `phaseLabel`, `canSeeAdminData` (§9.7) |

---

## 8. Repositories and services

### 8.0 Generic helpers (reused everywhere)

#### 8.0.1 Metrics helper (`lib/metrics/series.ts`, extends `lib/dashboard/task-trend.ts`)

One implementation for every KPI and series in the app:

```ts
type DailyCounter = (from: string, to: string) => Promise<Map<string, number>>;   // local ISO date → value
dailySeries(counter: DailyCounter, days: number, now: Date, tz = TASK_TREND_TIME_ZONE): Promise<{ date: string; value: number }[]>
kpiFromDaily(key: string, label: string, daily: { date: string; value: number }[],
  opts: { goodWhen: "up" | "down"; display?: (v: number) => string; href?: string }): KpiDatum
//   value = last point; series7 = last 7; delta.value = last − point 7 days earlier, delta.good from goodWhen,
//   delta.caption = "vs. semana pasada"; avg30/min30/max30 over the last 30 points
weeklyCounts(buckets: TaskTrendBucket[], counters: Record<string, (b: TaskTrendBucket) => number>): { weekStart: string; [k: string]: number | string }[]
//   reuses taskTrendBuckets / bucketTaskTrend; feeds InicioData.weeklyPace and the Analítico weekly tables
```
Producers only supply a `DailyCounter` (one SQL `generate_series` over dates joined to their table). Consumers: Inicio KPIs, `PortfolioRow.series7`, Persona stats, time report, assistant `render_stat_grid`.

#### 8.0.2 Widget builders (`lib/metrics/widgets.ts`, extends `lib/dashboard/donut-groups.ts`)

Pure, isomorphic functions (no `server-only`) mapping existing DTOs to §6.1 shapes: `toDistribution(items, { keyOf, labelOf, colorVarOf, secondaryOf?, extraOf? })` (generalizes `tasksByBaseStatus` and `projectsByArea`), `toProgressItems(projects, portfolio?)`, `toAttentionItems(tasks, now)` (reason/tone: vencida → critical, sin responsable / bloqueada → warn, por vencer ≤ 2 días → default), `toAgendaItems(events | reminders | tasks | absences)` (reuses `buildCalendarEvents` from `lib/calendar/calendar-service.ts`), `toPersonDatum(staff, overviewRow)`, `toEntityCards(...)`, `toRecordTable(columns, rows, totals?)` (`"auto"` totals for numeric columns). Every aggregate action, page and assistant widget uses these; none builds shapes by hand.

#### 8.0.3 Owner-scoped CRUD helper (`lib/repositories/owner-scoped.ts`, new)

```ts
ownerScoped<T extends PgTable & { staffId; id; deletedAt? }>(table: T) => {
  list(db, staffId, opts?: { where?, orderBy?, limit?, cursor? }): Promise<Row[]>;
  get(db, staffId, id): Promise<Row>;                      // NOT_FOUND when missing; FORBIDDEN when owned by another staff
  insert(db, staffId, values): Promise<Row>;              // staffId always from the session argument
  update(db, staffId, id, patch): Promise<Row>;           // same NOT_FOUND/FORBIDDEN rules
  softDelete(db, staffId, id): Promise<void>;             // uses deletedAt; tables without it refuse
  lockForUpdate(tx, staffId, id): Promise<Row>;           // select … for update (time entries, checklists reorder)
}
```
`notes`, `checklists` (+ items through the parent), `reminders`, `notifications`, `gmail_threads`, `assistant_threads`, `time_entries` (own rows) are instances of it plus their specific queries. Owner checks live in one place and one test suite (§16).

#### 8.0.4 Cron job registry (`lib/cron/registry.ts`, new)

```ts
type CronJob = {
  name: string;
  due(now: Date, tz: string): { run: boolean; windowKey?: string };   // windowKey → once per window via cron_runs
  run(ctx: { db; now: Date; traceId: string; budgetMs: number }): Promise<{ count: number }>;
};
registerJob(job: CronJob): void;
runTick(now): Promise<TickReport>;   // lease "tick" (cron_leases, §3.11), sequential jobs, per-job try/catch + JSON log, cron_runs bookkeeping
```
Extension point: each job is its own file `lib/cron/jobs/<name>.ts` calling `registerJob`; `lib/cron/jobs/index.ts` imports every file in the folder (one line per job, added by the phase that owns the job; see "Phase and file ownership"). No module schedules its own work.

### 8.1 Preferences resolver (`lib/ui/preferences.ts`)

```ts
resolveAppearance(org: OrgAppearance, user: UserPreferences | null): ResolvedAppearance
```
1. `theme = org.allowUserOverride && user?.theme ? user.theme : org.baseTheme`.
2. Tokens: if `theme === org.baseTheme`, `org.tokens`; else `THEME_PRESETS[theme]` (a user theme override never applies the org's token edits of another base).
3. `style = org.allowUserOverride && user?.style ? user.style : org.styleDefault`; a `?estilo=` preview override is applied by the page, not here.
4. `mode`, `density`, `textSize` from the user (defaults `system`, `comoda`, 14).
5. `redesignEnabled = org.redesignAvailable && (user?.redesignEnabled ?? org.redesignDefault)` — the kill switch is enforced here, server-side (review B3).
6. `cssVars = { light: toCssVars(…, "light"), dark: toCssVars(…, "dark") }` (§8.2); `version = org.v`.

`getResolvedAppearance()` (server, `server-only`) reads `appearance.theme` (per-request `React.cache`) and the caller's row; on DB errors it logs and returns the Azul defaults (same pattern as `getPrimaryColor`).

### 8.2 Appearance → CSS and SSR (`lib/ui/appearance-css.ts`, `lib/ui/contrast.ts`; review B1, B2)

- `toCssVars(appearance, mode)`: `--<token>` for every token, `--font-sans`, `--radius` (`radius/16 rem`), `--card-padding`, `--gap`, `--shadow-card` (`none` | `0 1px 2px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.04)` | `0 10px 30px rgba(15,23,42,0.12)`), `--type-<role>-size` / `--type-<role>-weight` for the six roles, and `--text-base` = `textSize` (body, label and cardTitle scale from it).
- **Cookie** `cincel-appearance` (httpOnly false, `SameSite=Lax`, 1 year, unsigned: it holds no secrets and the server re-validates every value) = JSON `{ theme, mode, style, density, textSize, v }`. Written by `updateMyPreferencesAction` (which also returns the `ResolvedAppearance` so the client applies the new vars immediately, without a server round-trip or revalidation) and on login (from the DB row); the server ignores a cookie whose `v` differs from the org `v` and recomputes from the DB.
- **Root layout** (`app/layout.tsx`, server; review B17): reads preferences server-side. **Flag off** (`resolveAppearance(...).redesignEnabled === false`): renders exactly today's pipeline — `<style id="primary-color">`, `globals.css` values, `ThemeToggle` with `data-theme` — and no appearance block. **Flag on (review B18):** `<html>` always carries `data-theme="light"|"dark"`: the server sets it from the cookie for explicit modes, and in `system` mode the head script sets it before paint and on change. The layout renders `<html lang="es" data-theme={…} data-theme-id={theme} data-style={style} data-density={density} class={dark ? "dark" : undefined}>` and one `<style id="appearance">` with `html:root[data-theme="light"]{…light vars…}` and `html:root[data-theme="dark"]{…dark vars…}` for the resolved theme plus org overrides. Their specificity (0,2,1) beats the legacy `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` rule that stays in `globals.css` until Phase 9, so an OS in dark mode never overrides a light choice. The `.dark` class is kept in sync with `data-theme` for Tailwind `dark:` utilities. Never inline `style` attributes on `<html>`.
- **`mode = "system"`:** an inline blocking `<script>` in `<head>` (≤ 1 KB, no dependencies) sets `data-theme` and toggles `.dark` on `<html>` from `matchMedia("(prefers-color-scheme: dark)")` before first paint and on change. Explicit `light`/`dark` don't render the script (the server already set both).
- **Org changes** take effect on the next page load: `saveOrgAppearanceAction` bumps `v` and calls `revalidatePath("/", "layout")`.
- **Contrast** (`lib/ui/contrast.ts`, pure, client-importable): `CONTRAST_PAIRS` (§5.5) and `checkContrast(tokens, mode)` → `{ pair, mode, ratio, min, ok }[]`; WCAG 2.1 relative luminance on linearized sRGB, `rgba` composited over the pair's background, tints mixed in oklab (14 % light / 22 % dark over `card`). The editor, `saveOrgAppearanceAction` and the presets test call this one function; the action throws `LOW_CONTRAST: <pair> <mode> <ratio>` listing every failing pair (comma-separated).

### 8.3 `notify(staffIds, payload)` (`lib/notifications/notify.ts`; review B10)

```ts
type NotifyPayload = { kind: NotificationKind; title: string; body?: string; entity?: HistoryEntity; entityId?: string;
  url?: string; dedupeKey?: string; actorId?: string; force?: { inApp?: boolean; email?: boolean } };
notify(db, staffIds: string[], payload: NotifyPayload): Promise<{ created: number }>
```
- Drops `actorId` from recipients (nobody is notified of their own action) and inactive staff.
- Per recipient, loads preferences (row or `NOTIFICATION_DEFAULTS`; `force` overrides them, used by reminders) and **always inserts one row** when any channel is on: `in_app` = preference; `email_status = 'pending'` when email is on, else `'none'`; `digest` = preference; `deliver_after` = now, or the end of the recipient's quiet hours when now falls inside them. `on conflict (staff_id, dedupe_key) do nothing`.
- No email is sent inline: the `notifications-deliver` job (§13) sends `pending` rows whose `deliver_after ≤ now` and sets `sent`/`failed` (+ `email_error`); `daily-digest` groups unsent `digest` rows of the last 24 h per recipient into one email and sets `digested_at`.
- The Bandeja lists `in_app = true` rows only.
- Called from actions inside `after()`; failures log `{ msg: "notify.failed", trace_id, kind, count }` and never reach the user.
- Producers wired in this feature (each owned by one phase, see ownership table): task assignment (`asignacion`), @mention in task comments (`mencion`: `@Nombre Apellido` resolved by exact staff name, case/accent-insensitive), comment on a task the recipient manages (`comentario`), due tomorrow / overdue (`vencimiento`, the `daily-digest` producer `lib/cron/daily-producers/vencimiento.ts` (stub in Phase 1, implemented by Phase 3), dedupe per task per day), portal approvals (`aprobacion_cliente`), reminders (`recordatorio`), vacations and system messages (`sistema`). Admin tasks notify administrators only.

`NOTIFICATION_DEFAULTS`: all kinds `inApp: true`; `email: true` for `asignacion`, `mencion`, `recordatorio`; `digest: true` for `vencimiento`, `comentario`; others false.

### 8.4 Reminder text parser (`lib/my-space/reminder-parser.ts`)

Pure function `parseReminderText(text, now, tz = "America/Mexico_City")`, es-MX, accent-insensitive, first match wins, matched fragment removed from `cleanText` (and a leading "recuérdame"/"recordarme"/"recordar" is stripped). Rules:

| Rule | Pattern (examples) | dueAt |
|---|---|---|
| Relative minutes/hours | "en 15 min", "en 2 horas", "en media hora" | now + n |
| Today/tonight | "hoy a las 5", "hoy 17:30", "esta tarde" (16:00), "esta noche" (20:00) | today at time |
| Tomorrow / day after | "mañana", "mañana 9am", "pasado mañana a las 10" | +1/+2 days; default time 09:00 |
| Weekday | "el lunes", "viernes 4pm", "el próximo martes" | next occurrence (today excluded); default 09:00 |
| Date | "el 15", "15 de diciembre", "15/12", "15/12/2026 10:00" | that date (next year if past), default 09:00 |
| Time only | "a las 3", "3pm", "15:00", "9 de la mañana", "3 de la tarde" | today if future, else tomorrow; "a las 1–7" without am/pm → pm |
| Repeat | "cada día", "diario", "todos los días" → daily; "cada semana", "cada lunes" → weekly (+ weekday); "cada mes", "cada 1°" → monthly | as above |

Examples (now = Fri 2026-11-06 14:14):

| Input | cleanText | dueAt | repeat |
|---|---|---|---|
| "recuérdame mañana 9am llamar a Juanma" | "llamar a Juanma" | 2026-11-07 09:00 | none |
| "enviar factura en 2 horas" | "enviar factura" | 2026-11-06 16:14 | none |
| "visita de obra el lunes a las 10" | "visita de obra" | 2026-11-09 10:00 | none |
| "revisar bitácora cada viernes 5pm" | "revisar bitácora" | 2026-11-13 17:00 | weekly |
| "pagar IMSS el 15" | "pagar IMSS" | 2026-11-15 09:00 | none |
| "comprar material" | "comprar material" | null | none |

### 8.5 Reminders (`lib/my-space/reminders.ts`)

`fireDueReminders(db, now)` (cron job `reminders-fire`, Phase 5): selects `due_at <= now and fired_at is null and cancelled_at is null` (limit 500, `for update skip locked`), for each calls `notify([staffId], { kind: 'recordatorio', title: text, url, dedupeKey: 'recordatorio:<id>:<dueAt>', force: { inApp: channels.includes('app'), email: channels.includes('email') } })` (quiet hours still defer the email). Non-repeating → `fired_at = now`; repeating → `due_at` advanced by one period (monthly: same day-of-month clamped to month end) until > now.

### 8.6 Gmail (`lib/gmail/*`)

- `client.ts`: REST wrapper over `https://gmail.googleapis.com/gmail/v1/users/me/*` using the staff token from `google_oauth_accounts` (refresh via the existing `staff-token.ts`). Calls used: `threads.list` (q, maxResults 50), `threads.get` (format `metadata` for sync, `full` for reading), `history.list` (startHistoryId, historyTypes messageAdded/labelAdded/labelRemoved), `threads.modify` (remove `UNREAD`), `drafts.create`, `drafts.update` (when `createGmailDraftAction` receives a `draftId`, so edits never pile up drafts; an unknown or foreign `draftId` → `NOT_FOUND`), `drafts.send`, `messages.attachments.get` (attachment route). 401 → token refresh once; `invalid_grant` → `NOT_CONNECTED` and `gmail_accounts.last_error = 'invalid_grant'`; 403 insufficient scope → `SCOPE_MISSING`; 429/5xx → `RATE_LIMITED` and `next_sync_after = now + min(2^n min, 60 min)`.
- `sync.ts` `syncGmail(db, staffId)`: first run lists the last 100 threads of `in:inbox`; later runs use `history.list` from `history_id`; on 404 (history too old) falls back to a full list. Upserts `gmail_threads` (subject, from, snippet, receivedAt, unread, labels), computes `suggested_project_id` (§8.6.1), trims to 500 rows, stores `history_id`, `last_synced_at`, clears `last_error`. New unread threads do **not** create notifications (the Bandeja reads `gmail_threads` directly).
- `suggest.ts`: active project names visible to the staff, normalized (lowercase, no accents, no punctuation); a thread is suggested to project P when P's normalized name (≥ 4 chars) appears as a whole word in the subject, or in the snippet when it is ≥ 8 chars; ties → most recently updated project. Never auto-links.
- HTML bodies are sanitized server-side with the existing `sanitize-html` dependency (allowlist of tags/attributes, no scripts, remote images turned into links); the client renders them in `<iframe sandbox srcdoc>` so the email's CSS can't restyle the app.
- Disconnect (`disconnectGmailAction`, review B15): sets `disconnected_at`, deletes the caller's `gmail_threads`, and the sync job skips accounts with `disconnected_at` set. The shared Google token in `google_oauth_accounts` is **not** revoked (Drive and Calendar use it); the UI links to the Google account permissions page for a full revoke. Reconnecting via `?grant=gmail` clears `disconnected_at` and resets `history_id`.
- Mail content is untrusted for the assistant (§10.1).
- `createGmailDraftAction` issues `confirmToken = base64url(HMAC_SHA256(SESSION_SECRET, staffId|draftId|issuedAt))|issuedAt` with `expiresAt = issuedAt + 10 min`; `sendGmailDraftAction` verifies owner, draft and age (`CONFIRM_REQUIRED` when missing or not matching, `EXPIRED` when older than 10 min). Re-saving with the same `draftId` updates the draft and returns a fresh token. Assistant `send_email` uses AI SDK approval (§8.10) and calls the same internal `sendDraft(staffId, draftId)`.

### 8.7 Time tracking (`lib/time-tracking/*`)

- Local day: `workDate` and all day comparisons use `America/Mexico_City` (the regional setting is fixed to it).
- State of today (`state.ts`): no entry today → `off`; an open entry (`ended_at is null`) whose last pause has `to = null` → `pausa`; open otherwise → `on`; entries today but none open → `done`.
- Transitions run in one transaction that first locks the open entry with `select … for update` (`ownerScoped.lockForUpdate`), so two tabs can't double-append a pause: `clockIn` (off | done → on; inserts a new entry, `source`); `pause` (on → pausa; appends `{from: now, to: null}`); `resume` (pausa → on; closes the last pause); `clockOut` (on | pausa → done; closes an open pause, `ended_at = now`, `closed_by = 'user'`). Any other transition → `ALREADY_ON` / `NOT_ON`. The partial unique index guarantees at most one open entry per staff (concurrent clock-ins → one wins, the other gets `ALREADY_ON` from the unique violation).
- `workedSeconds` = Σ over today's entries of `(ended_at ?? now) − started_at − Σ pauses`.
- `enabled` = `settings.enabled && !exempt(caller.role)`. `required` = `enabled && requiredFrom != null && today >= requiredFrom && workDays.includes(today.dow)`. `promptAtLogin` = `enabled && settings.promptAtLogin && state === 'off' && workDays.includes(dow) && now < dayEnd`.
- Auto-close (cron job `auto-close-jornadas`, Phase 6): for every open entry where local time ≥ `autoCloseAt` of its `workDate`, or whose `workDate` < today, set `ended_at` = `autoCloseAt` of its `workDate` (or `dayEnd` of its `workDate` when `autoCloseAt` is null, so a forgotten entry never stays open into the next day), close the open pause at the same instant, `closed_by = 'auto_close'`, `flagged = true`, and `notify([staff], { kind: 'sistema', title: 'Cerramos tu jornada automáticamente', dedupeKey: 'auto_close:<entryId>' })`.
- Late: first `started_at` of a work day later than `dayStart + lateToleranceMin` → one late count.
- Weekly report (`report.ts`) per staff: `days[d].hours` = worked hours that day (2 decimals) minus `lunchMinutes/60` when the day has ≥ 5 worked hours and no pause ≥ 30 min; `target = hoursPerDay × (work days in week − days covered by aprobada vacations − holidays none)`; `status`: `sin_registro` if total = 0, `completo` if total ≥ target, else `incompleto`. Days before `requiredFrom` are still returned (UI marks them "prueba") but the CSV export excludes them.

### 8.8 Vacations (`lib/vacations/balance.ts`)

- `days` of a request = count of `TimeTrackingSettings.workDays` days in `[from, to]` (holiday calendar out of scope).
- `entitled` = `staff_profiles.vacation_days` when set, else `app_settings('vacations').daysPerYear` (review B12); `taken` = Σ days of `aprobada` requests with `from` in the year and `to < today` plus the elapsed part of the current one; `pending` = Σ days of `pendiente`; `available = entitled − taken − pending − (aprobada future)`. `requestVacationAction` does not block on a negative balance (the approver decides); the UI shows the warning.
- Approved vacations set the person `vacaciones` in `PersonDatum.availability` and reduce the time-tracking target.
- Privacy: `kind` (`enfermedad` is health data) is returned only to the requester and to `canDecideVacations`; everyone else gets `ausencia` (`fetchTeamAbsencesAction`). Notifications to deciders don't include the kind in the title.

### 8.9 Search (`lib/search/search.ts`)

One query per type, run in parallel, each limited to `limit`, then merged:
- `proyecto`: `projects.name` and `code` (`ILIKE %q%`, trigram similarity for ranking) — scoped like `fetchProjectsAction`. url `/proyectos/<id>`; subtitle = current tramo label · status.
- `tarea`: `tasks.title` live and not archived, scoped like `fetchTasksAction`; url `/tareas/<id>`; subtitle = project name · due date.
- `persona`: active `staff` (name, last_name, email) → `/personas/equipo/<id>`; `contacts` (name) only with `clients.canViewClients` → `/personas/clientes?contacto=<id>` (subtitle "Cliente"/"Proveedor"/"Socio"; client contacts only with `canSeeAdminData` once Project Flow makes clients admin-only).
- `archivo`: `drive_files.file_name` joined to `project_links` visible to the caller → web view link.
- `nota`: caller's live notes (title, body) → `/mi-espacio/notas/<id>`.
- Admin tasks only with `canSeeAdminData`. The "Acciones" group is static in the frontend; the backend returns no action results.
Ranking: exact (case/accent-insensitive) match 3, prefix 2, word-start 1.5, contains 1, plus `similarity()` (0–1); ties by recency; at most `limit` overall with at least one of each type that has results.

### 8.10 Assistant approvals, audit and threads (`lib/assistant/{define-tool,approvals,threads}.ts`; review B9)

- `defineTool({ name, description, schema, capability(user), available(ctx), confirm, summarize(input): string, run(ctx, input) })` returns an AI SDK v7 `tool()` whose `needsApproval` is `confirm` (or, for write tools, the dynamic rule of §10.1 for turns that read untrusted content). `execute` resolves names to ids (existing resolvers), re-checks `capability(user)` (`FORBIDDEN` result otherwise) and runs `run()`.
- **Approval flow (native):** the model's call to an approval-gated tool streams an approval request part (tool call id, input, approval id — no summary); the client renders it with `ConfirmationCard` from the part's `toolName` + `input`, computing the summary with `lib/assistant/tool-summaries.ts` (pure, client-safe map tool → `summarize(input)`, the same functions `defineTool` registers; review R2-3) and answers with `addToolApprovalResponse`; the next request carries `approvals[]`. Approved → `execute` runs and the model receives the result; denied → the model receives the denial and continues. No custom proposal round-trip exists.
- **Audit:** `approvals.ts` writes `assistant_actions` (unique per `threadId`+`toolCallId`): `proposed` when the approval request is streamed, `confirmed`/`cancelled` when the response arrives, `done`/`failed` after `execute`. `fetchAssistantActionsAction` reads it.
- **Threads:** the client generates the thread id (uuid) and sends it in every request; `threads.ts` verifies ownership **before** any upsert (a thread of another owner → 403) and upserts messages by `(thread_id, id)` (review R2-4), stores messages in `onFinish`, sets the title from the first user message, and keeps the last 50 live threads (`daily-digest` housekeeping). The route loads history from `assistant_messages` and accepts only the new user message plus approval responses; client-sent history is ignored, so forged tool results can't be persisted.
- **Legacy import:** `importLegacyAssistantThreadAction(messages)` stores the old localStorage messages as a new thread (`imported_from = 'localStorage'`, tool parts kept for display) without calling the model.
- **Page context:** `AssistantContext` ids come from the client, so each id is resolved through the viewer-scoped reads (`fetchProjectAction`, `fetchTaskAction`, `fetchStaffDetailAction`) and dropped when the viewer can't see it; only then are name and id added to the system prompt's "Contexto" section. Tools with a `project` input default to the resolved project.

### 8.11 Profile photo processing (`app/api/staff/me/photo/route.ts`)

The client re-encodes the image through `<canvas>` to JPEG (≤ 1024 px, which drops EXIF) before upload. The route still: enforces 2 MB (`413 TOO_LARGE`), checks magic bytes with the existing `file-type` dependency (`415 INVALID_TYPE` unless jpeg/png/webp), strips metadata without new dependencies (JPEG: drop APP1/APP13 segments; PNG: drop `eXIf`/`tEXt`/`iTXt`/`zTXt` chunks; WebP: drop `EXIF`/`XMP ` chunks and clear the VP8X flags), stores the bytes in `staff_photos`, and rate-limits to 10/hour per staff.

### 8.12 Phase 1 read helpers (fully implemented in Phase 1, §21)

Pure server reads that later phases' aggregates depend on, so no later phase waits for another:

| Helper | Signature | Returns before its data's phase lands |
|---|---|---|
| `lib/time-tracking/week-hours.ts` | `weekHours(db, staffIds, weekStart, settings) → Map<staffId, { days: { date; hours }[]; total }>` (§8.7 rules, lunch deduction) | zeros until Phase 6 writes entries |
| `lib/vacations/approved-absences.ts` | `approvedAbsences(db, { from, to, staffIds? }) → { staffId; from; to; kind }[]` | none until Phase 4 writes requests |
| `lib/my-space/reminders-for-day.ts` | `remindersForDay(db, staffId, date) → AgendaItem[]` | empty until Phase 5 writes reminders |

Consumers: `fetchInicioAction` (Mi día), `fetchPeopleOverviewAction` / `fetchPersonaDetailAction` (hours, availability), `fetchMyWeekHoursAction`, `fetchTeamHoursAction` and the CSV (targets minus approved absences).

---

## 9. Domain rules

### 9.1 Owner-only data
Notes, checklists, reminders, notifications, Gmail data, assistant threads/actions and a person's own time entries are readable and writable only by their owner. No admin bypass exists for notes, checklists, reminders, Gmail or assistant threads. Team time data is readable by `canViewTeamHours` through the aggregate actions only (never raw pauses of others except in the CSV).

### 9.2 Appearance
- A save stores the full `OrgAppearance` (no partial merge), bumps `v` and takes effect **on the next page load** for every user (§8.2).
- `redesignAvailable = false` (kill switch) forces `redesignEnabled = false` in `resolveAppearance` for everyone and makes `updateMyPreferencesAction({ redesignEnabled: true })` throw `DISABLED` (review B3).
- When `allowUserOverride` is switched off, existing user `theme`/`style` values are kept but ignored by the resolver; switching it back on restores them.
- `resetOrgAppearanceAction(base)` resets tokens, type scale and shape only.

### 9.3 Notifications
- Dedupe keys: `vencimiento:<taskId>:<YYYY-MM-DD>`, `recordatorio:<reminderId>:<dueAt ISO>`, `auto_close:<entryId>`, `asignacion:<taskId>:<managerId>`.
- Quiet hours set `deliver_after` on the row; they apply to email only.
- Daily digest (cron `daily-digest`, 07:30 local, window `daily-digest:<date>`): one email per staff with ≥ 1 row `digest = true and digested_at is null` from the last 24 h; template `resumen-diario`; sets `digested_at`.

### 9.4 Reminders
- `dueAt` stored in UTC; displayed in the org time zone.
- Editing a fired non-repeating reminder is done by `snoozeReminderAction` (clears `firedAt`).

### 9.5 Time tracking
- Disabled (`enabled = false`): `fetchMyTodayAction` returns `{ state: 'off', enabled: false, required: false, promptAtLogin: false, … }`; write actions throw `DISABLED`.
- Before `requiredFrom` (trial): everything works; `required = false`; no lateness notifications; CSV excludes those days.
- From `requiredFrom`: `required = true` on work days; the login prompt cannot be skipped (frontend); the `auto-close-jornadas` job sends a `sistema` notification at `dayStart + 2 h` to required staff in state `off` (dedupe `sin_entrada:<staff>:<date>`).
- Location: never stored (decision); the `TimeTrackingSettings` type has no location field.

### 9.6 Vacations
- Overlap check counts only the caller's `pendiente` and `aprobada` requests.
- Deciders are `canDecideVacations` (Administrador, Dirección) and never their own request.
- `kind` privacy: §8.8.

### 9.7 Admin-only data and Project Flow compatibility (review B7, B8)
- `lib/tramos/compat.ts` (contracts phase) is the only place the redesign touches tramo/fase/admin concepts. It exposes `listTramos()` (from `workflows` rows, keys `presale`/`diseno`/`construccion`), `tramoLabel(key)`, `tramoColorSlot(key)` (1–3), `tramoColorVar(key)`, `phaseLabel(phaseId)` (null while no fase catalog exists) and `canSeeAdminData(user)` (re-exports Project Flow's helper when present, else `isAdministratorRole`). Nothing in this feature imports Project Flow modules directly.
- Every aggregate and read in this feature filters through `canSeeAdminData`: `fetchInicioAction` (attention, myDay, KPIs), `fetchPersonaDetailAction` (tasks, counts), `fetchProjectsPortfolioAction` (`open`, `overdue`, `nextDelivery`, `budgetSpentPct`), `fetchPeopleOverviewAction` (counts), `searchWorkspaceAction`, and the assistant read tools (`get_task`, `list_my_tasks`, `get_project`, `team_workload_summary`, `list_activities_due`). Without the capability, admin tasks (`kind = 'admin'` once Project Flow lands) and client/origin fields are absent; `nextDelivery` never names an admin task.
- Proyecto · Resumen "Cliente y contactos" data is returned only to `canSeeAdminData` or to project members (`project_members`) while clients are not admin-only; once Project Flow makes the client admin-only, only `canSeeAdminData`.

### 9.8 Gmail
- A staff member's Gmail data is never shown to anyone else, including admins; linking a thread to a project stores only the subject and a link in the project's history.

### 9.9 Assistant audit
Writes by tools on shared entities (task, project, contact, staff) write `history_events`: `kind 'comentario'`, `comment = "<summary> (vía asistente)"`, `actor_id` = the user. Writes on owner-only entities (note, reminder, checklist, time entry, notification) write **nothing** to `history_events`, so private text never lands in a shared table; their audit is the `assistant_actions` row. Read tools write nothing.

### 9.10 Error copy contract
Phase 1 read stubs return safe defaults (empty lists, `enabled: false`, `connected: false`, zeros) and never throw (§21 Rule 1).

**`IMPLEMENTED` flags (reviews B19c, B20):** a `"use server"` file may only export async functions, so the flags live in a sibling plain module per actions file: `lib/actions/<domain>-actions.flags.ts` with `export const IMPLEMENTED = { <actionName>: false, … } as const` (no `"use server"`; one key per exported action of `<domain>-actions.ts`). Phase 1 creates every flags file; the phase that owns an actions file owns its flags file and flips its entries to `true`. Assistant tools (`available(ctx)`) and UI entry points import the flags file (client-safe) instead of probing read stubs.

`actionErrorText(err: unknown, context?: "search" | "gmail" | "photo" | "cutto" | "vacations" | <Project Flow contexts>)` in `lib/errors.ts` (created by the contracts phase if absent; additive codes). Codes added by this feature: `NOT_IMPLEMENTED` (Phase 1 write stubs; copy "Esta función todavía no está disponible."), `OVERRIDE_DISABLED`, `DISABLED`, `LOW_CONTRAST`, `TOO_LARGE`, `INVALID_TYPE`, `PAST_TIME`, `NOT_CONNECTED`, `SCOPE_MISSING`, `CONFIRM_REQUIRED`, `EXPIRED`, `ALREADY_ON`, `NOT_ON`, `OVERLAP`, `STARTED`, `RATE_LIMITED` (copy depends on context: search, Gmail sync, photo upload).

---

## 10. Assistant tools

### 10.1 `defineTool`, registry and approval rules

- **Availability (Rule 3, §21; reviews B19c, B20):** `available(ctx)` imports the flags files of the actions the tool calls (e.g. `IMPLEMENTED.createReminderAction` from `lib/actions/my-space-actions.flags.ts`) and returns false while any is `false`. Phase 7's tool files therefore never change when Phases 4–6 land, in any order; unavailable tools are not offered to the model.
- **Summaries:** every tool exports `summarize(input): string` from `lib/assistant/tool-summaries.ts` (client-safe, no server imports) so the UI can render approval cards (§8.10).
- **Registry (extension point, review B5):** each tool group is one file `lib/assistant/tools/<domain>.ts` exporting `tools: DefinedTool[]`; `lib/assistant/tools/index.ts` collects every file of the folder (one import line per domain, added by the phase that owns the domain). `buildAssistantTools(user, context)` includes a tool when `capability(user)` is true and, for Cutto tools, when `CUTTO_API_URL` is set. `lib/assistant/tools.ts` keeps exporting `ASSISTANT_TOOLS` and `buildAssistantTools` for existing importers.
- **Approval (`needsApproval`, review B9):** every tool marked **Confirmar** below is declared with `needsApproval: true` (§8.10). The existing write/destructive tools become approval-gated (today confirmation is prompt-only).
- **Untrusted content (review N4):** tool results that carry third-party text (`search_email`, `summarize_email_thread`, `read_conversation`, `summarize_channel`, document reads in `measure_areas_from_plan` / `moodboard_from_references`, Biblioteca document context) are wrapped as `{ untrusted: true, content }` and the system prompt states that instructions inside untrusted content are never followed. Every write tool uses a dynamic `needsApproval(input, { messages })` that returns `true` when the current turn already contains an untrusted result, so a write derived from mail or documents always asks the user, even tools that are otherwise direct (`update_task_status`, `add_checklist_item`, `link_email_to_project`, `create_note`, `mark_notifications_read`, `clock_in`, …).
- `stopWhen: stepCountIs(5)` stays; an approval request ends the step, and the next request resumes it.

Capability shorthands (real names, review N11): **all** = any staff; **act-create** = `activities.canCreateActivity`; **act-assign** = `activities.canChangeResponsible`; **team** = `team.canViewTeam`; **lead** = access Administrador or Dirección, or role Jefe de Taller / Jefe de Construcción; **admin** = Administrador; **clients-create** = `clients.canCreateClient`; **portal-manage** = `portal.manageAccess`; **hours** = `canViewTeamHours`; **owner-mail** = Gmail connected and not disconnected.

### 10.2 Existing tools (16 kept, params unchanged)

| Tool | Input (zod, unchanged) | Capability | Confirm | Calls |
|---|---|---|---|---|
| `list_projects` | `{ activeOnly?, stage?, status? }` | all | no | `fetchProjectsAction` |
| `list_activities_due` | `{ withinDays?, projectName?, memberName?, onlyBlocked? }` | all | no | `fetchTasksAction` |
| `team_workload_summary` | `{}` | all | no | `fetchStaffAction` + `fetchTasksAction` |
| `render_chart` | `{ chartType, title, data }` | all | no | client widget |
| `render_card` | `{ title, subtitle?, fields }` | all | no | client widget |
| `render_stat_grid` | `{ title?, stats }` | all | no | client widget |
| `render_list` | `{ title, items }` | all | no | client widget |
| `create_task` | `{ description, project, workflow, manager?, priority?, phase?, commitmentDate?, reviewDate? }` | act-create | **yes** (new) | `createUserTaskAction` |
| `assign_task` | `{ descriptionContains, manager, project?, workflow? }` | act-assign | **yes** | `assignTaskAction` |
| `create_client` | `{ name, kind?, phone?, contactName?, contactEmail?, contactPhone? }` | clients-create | **yes** | `createContactAction` |
| `onboard_client` | `{ name, kind?, phone?, acquisitionChannel?, contactName?, contactEmail?, contactPhone?, projectName, workflow }` | clients-create ∧ act-create | **yes** | existing onboarding |
| `create_rfc` | `{ title, proposal }` | act-create | **yes** | `lib/github/client.ts` |
| `find_duplicates` | `{}` | `canViewClients` ∨ `canViewActivities` | no | existing |
| `merge_duplicate_clients` | `{ name }` | `canDeleteClient` | **yes** | existing |
| `merge_duplicate_activities` | `{ projectName, descriptionContains }` | `canDeleteActivity` | **yes** | existing |
| `discard_project` | `{ projectName }` | `canDeleteProject` | **yes** | existing |

### 10.3 New tools (65)

Input schemas are sketches (`z.object` keys; `?` = optional); names resolve through the existing `resolveProject` / `resolveStaff` helpers.

**Consulta y búsqueda (4)**

| Tool | Input | Capability | Confirm | Calls |
|---|---|---|---|---|
| `search_workspace` | `{ query: string, types?: SearchType[], limit?: number }` | all | no | `searchWorkspaceAction` |
| `get_project` | `{ project: string }` | all (scoped) | no | `fetchProjectAction` + schedule summary |
| `get_task` | `{ taskId?: uuid, title?: string, project?: string }` (taskId or title+project) | all (scoped) | no | `fetchTaskAction` + history |
| `list_my_tasks` | `{ status?: TaskStatus[], due?: "hoy" \| "semana" \| "vencidas" }` | all | no | `fetchMyTasksAction` |

**Tareas (6)**

| Tool | Input | Capability | Confirm | Calls |
|---|---|---|---|---|
| `update_task_status` | `{ taskId: uuid, status: string, note?: string }` | `canChangeActivityStatus` for that task | no | `setTaskStatusAction` / `setTaskCustomStatusAction` |
| `reschedule_task` | `{ taskId: uuid, dueDate: date, reason?: string }` | act-assign | yes | `updateTaskAction` + `notify` |
| `add_task_comment` | `{ taskId: uuid, text: string, mentions?: string[] }` | all (task visible) | yes | `addTaskCommentAction` |
| `add_checklist_item` | `{ taskId: uuid, item: string, done?: boolean }` | task manager or act-assign | no | checklist actions |
| `create_tasks_from_notes` | `{ text?: string, emailThreadId?: string, project: string }` (one of text/emailThreadId; audio out of scope) | act-create | yes | `createUserTaskAction` × n |
| `rebalance_workload` | `{ tramo?: string, maxPerPerson?: number }` | lead | yes | `assignTaskAction` × n |

**Agenda y calendario (6)** — Cincel events are task dates plus Google Calendar (the existing one-way "Cincel" calendar); creating events with attendees writes to the staff member's primary calendar and therefore needs the `calendar` grant upgraded to `calendar.events` (Annex C, §11.1).

| Tool | Input | Capability | Confirm | Calls |
|---|---|---|---|---|
| `list_events` | `{ from: date, to: date, people?: string[], project?: string }` | all | no | `fetchCalendarAction` + Google events (when granted) |
| `find_free_slots` | `{ people: string[], duration: number (min), from: date, to: date, workingHoursOnly?: boolean }` | all | no | free/busy (Google) ∩ jornada `dayStart–dayEnd` − approved vacations |
| `create_event` | `{ title, start: datetime, end: datetime, attendees: string[], project?: string, location?: string }` | all (calendar.events granted) | yes | Google Calendar insert |
| `update_event` | `{ eventId: string, patch: {...} }` | organizer | yes | Google Calendar patch |
| `cancel_event` | `{ eventId: string, message?: string }` | organizer | yes | Google Calendar delete (sendUpdates=all) |
| `schedule_site_visit` | `{ project, date: datetime, people: string[], checklistTemplate?: string }` | lead | yes | `create_event` + `createUserTaskAction` (checklist) |

**Reuniones en Cutto (8) and Mensajes en Cutto (7)** — disabled unless `CUTTO_API_URL` is set (Q1). All call `CuttoClient` methods; until the API exists only deep links are produced by other tools and the UI.

| Tool | Input | Capability | Confirm |
|---|---|---|---|
| `create_meeting` | `{ title, start, duration, attendees: string[], project?, agenda? }` | all | yes |
| `start_call` | `{ people?: string[], channel?: string, video?: boolean }` | all | yes |
| `list_meetings` | `{ date?, project? }` | all | no |
| `invite_to_meeting` | `{ meetingId, people: string[] }` | organizer | yes |
| `get_meeting_notes` | `{ meetingId }` | attendee | no |
| `meeting_to_tasks` | `{ meetingId, project }` | attendee ∧ act-create | yes |
| `list_voice_rooms` | `{ project? }` | all | no |
| `join_voice_room` | `{ roomId }` | all | no (returns a deep link) |
| `list_conversations` | `{ unreadOnly? }` | all | no |
| `read_conversation` | `{ conversationId, limit? }` | member | no |
| `summarize_channel` | `{ channel, since: datetime }` | member | no |
| `send_message` | `{ to: string[], text, attachTaskId?, attachFileId? }` | all | yes |
| `post_to_project_channel` | `{ project, text, mentions?: string[] }` | member | yes |
| `reply_in_thread` | `{ messageId, text }` | member | yes |
| `create_project_channel` | `{ project, members: string[] }` | lead | yes |

**Notificaciones y recordatorios (7)**

| Tool | Input | Capability | Confirm | Calls |
|---|---|---|---|---|
| `list_notifications` | `{ unreadOnly?: boolean, types?: NotificationKind[] }` | all | no | `fetchNotificationsAction` |
| `mark_notifications_read` | `{ ids?: uuid[], all?: boolean }` | all | no | `markNotificationsReadAction` |
| `create_reminder` | `{ text, when?: string (natural or ISO), repeat?, link?: { taskId? , projectId? }, channels? }` | all | no | `parseReminderTextAction` + `createReminderAction` |
| `list_reminders` | `{ from?, to? }` | all | no | `fetchRemindersAction` |
| `cancel_reminder` | `{ reminderId, snoozeUntil?: datetime }` | all | no | `cancelReminderAction` / `snoozeReminderAction` |
| `notify_people` | `{ people: string[], text, link?: string, urgency?: "normal" \| "alta" }` | lead | yes | `notify` (`kind 'sistema'`) |
| `schedule_digest` | `{ time: "HH:MM", scope: "diario" }` | all | no | `updateNotificationPreferencesAction` (digest flags) — the digest hour is org-wide 07:30 in this feature; a `time` other than 07:30 → the tool returns an explanatory message |

**Correo / Gmail (5)**

| Tool | Input | Capability | Confirm | Calls |
|---|---|---|---|---|
| `search_email` | `{ query, from?, since? }` | owner-mail | no | `fetchGmailThreadsAction` (cache) |
| `summarize_email_thread` | `{ threadId }` | owner-mail | no | `fetchGmailThreadAction` |
| `draft_email` | `{ to: string[], subject, body, replyToThreadId? }` | owner-mail | no | `createGmailDraftAction` |
| `send_email` | `{ draftId }` | owner-mail | yes | internal `sendDraft` (§8.6) |
| `link_email_to_project` | `{ threadId, project }` | owner-mail | no | `linkGmailThreadToProjectAction` |

**Mi espacio y jornada (6)**

| Tool | Input | Capability | Confirm | Calls |
|---|---|---|---|---|
| `create_note` | `{ title, body, pinned?, color? }` (or `{ noteId, append }` to add text) | all | no | `createNoteAction` / `updateNoteAction` |
| `create_checklist` | `{ title, items: string[] }` | all | no | `createChecklistAction` |
| `clock_in` | `{}` | all (time tracking enabled) | no | `clockInAction({ source: 'assistant' })` |
| `pause_or_clock_out` | `{ action: "pausa" \| "salida" }` | all | no | `pauseWorkAction` / `clockOutAction` |
| `get_my_hours` | `{ range: "hoy" \| "semana" }` | all | no | `fetchMyTodayAction` / `fetchMyWeekHoursAction` |
| `team_hours_report` | `{ weekStart?: date, people?: string[] }` | hours | no | `fetchTeamHoursAction` |

**Personas, clientes y proveedores (5 new; `create_client`, `onboard_client` above)**

| Tool | Input | Capability | Confirm | Calls |
|---|---|---|---|---|
| `get_person` | `{ name }` | team | no | `fetchPersonaDetailAction` |
| `invite_client_to_portal` | `{ client, project }` | portal-manage | yes | `invitePortalClientAction` |
| `request_client_approval` | `{ project, fileId, message }` | lead | yes | portal notification + email (existing portal mail layout) |
| `request_quotes` | `{ item, quantity, suppliers: string[], deadline: date }` | lead | yes | one Gmail draft per supplier (owner-mail) or SMTP fallback from the firm address; records a `history_events` comment on each supplier contact |
| `compare_quotes` | `{ requestId?: string, item?: string }` | lead | no | reads replies linked to the request (Gmail threads labeled by the request) and renders `render_table` |

**Herramientas de arquitectura (8)** — computations run server-side; file-reading tools need the file in Drive and use the model's vision input (the provider must support images; when it does not, the tool returns "no disponible").

| Tool | Input | Capability | Confirm | Calls |
|---|---|---|---|---|
| `measure_areas_from_plan` | `{ fileId, scale?: string }` | all | no | Drive file → model vision → `render_table` (espacio, m²) with a "valores aproximados" note |
| `quantity_takeoff` | `{ material, area: number, format: string, wastePct?: number (default 10) }` | all | no | pure calculator `lib/assistant/calc/takeoff.ts` (piece/box/sack rules table) |
| `parametric_cost_estimate` | `{ area: number, use: string, finishLevel: "economico" \| "medio" \| "alto" }` | lead | no | org cost table (Annex C: `app_settings('parametric_costs')`, empty by default → tool explains it is not configured) |
| `zoning_check` | `{ project }` | all | no | compares ficha fields (niveles, área libre, altura, cajones) with the zoning fields stored in the ficha; missing data → lists what is missing |
| `site_photo_log` | `{ project, photos: string[] (attachment ids), notes? }` | Residente/lead | yes | attaches to the project's bitácora (Cronograma `schedule_task_events`) and proposes % per partida |
| `schedule_from_template` | `{ project, template: string, startDate: date }` | lead | yes | Project Flow `startTramo` when present; otherwise template tasks via `createUserTaskAction` |
| `moodboard_from_references` | `{ project, images: string[] }` | Diseño puesto or lead | no | model vision → palette + materials `render_table` |
| `progress_report` | `{ project, period: "semana" \| "mes" }` | lead | yes | Cronograma report export URL + summary |

**Widgets de respuesta (3 new)**

| Tool | Input | Capability | Confirm |
|---|---|---|---|
| `render_table` | `{ title?: string } & RecordTableData` (§6.1; FE `RenderTableArgs`) | all | no |
| `render_timeline` | `{ title?: string; items: AgendaItem[] }` (shared shape, §6.1; review R2-5) | all | no |
| `render_confirmation` | not a model-callable tool: the client's visual for AI SDK approval requests (`ConfirmationCard`), fed by the tool-call part `{ toolName, input, summary }` (§8.10) | — | — |

Total catalog: 16 existing + 65 new = 81 tools (15 of them Cutto, disabled by default).

---

## 11. Integrations

### 11.1 Google incremental consent (extends `lib/google/staff-oauth.ts` and the existing start/callback routes)
- `STAFF_OAUTH_EXTRA_SCOPES` gains `gmail: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose"`; `parseStaffOauthScope` accepts `"gmail"`; `hasGrantedScope` checks both scopes.
- `app/api/auth/google/start/route.ts` reads `scope` or, if absent, `grant` (`?grant=gmail`), with the same validation and session rules. The callback stores the merged scope string as today and, for `gmail`, upserts `gmail_accounts` (clearing `disconnected_at`) and queues a first sync with `after()`.
- Disconnect: `disconnectGmailAction` (§7.6, §8.6). There is no token revoke in this feature; the shared token keeps serving Drive and Calendar.
- Ops (`docs/google-workspace-admin-checklist.md`): enable the Gmail API; add both scopes; `gmail.readonly` is a **restricted** scope, so the OAuth consent screen must be **Internal** (Workspace) to avoid Google's security assessment (review N9).
- Calendar writes with attendees (`calendar.events`) are **out of scope** (Annex C3). `create_event`, `update_event`, `cancel_event` and `schedule_site_visit` stay disabled in the registry; `list_events` and `find_free_slots` use Cincel data only (task dates, work hours of Control de horario, approved vacations), not Google free/busy.

### 11.2 Cutto (review B11)

Two modules, split so client components never import server code:

```ts
// lib/integrations/cutto-links.ts — client-safe, no secrets
const BASE = process.env.NEXT_PUBLIC_CUTTO_BASE_URL ?? "https://cutto.cloudketer.dev";
export const cuttoLinks = {
  channelUrl: (projectId: string) => `${BASE}/c/project-${projectId}`,
  meetingUrl: (meetingId: string) => `${BASE}/m/${meetingId}`,
  personChatUrl: (email: string) => `${BASE}/dm/${encodeURIComponent(email)}`,
};

// lib/integrations/cutto-api.server.ts — import "server-only"
export interface CuttoApi {
  createMeeting(input: { title: string; start: string; durationMin: number; attendeeEmails: string[]; projectId?: string }): Promise<{ meetingId: string; url: string }>;
  postMessage(input: { channel: string; text: string }): Promise<{ messageId: string }>;
  // … the 15 Cutto tools' methods
}
export function getCuttoApi(): CuttoApi | null;   // null unless CUTTO_API_URL (+ CUTTO_API_TOKEN) are set
```
- The 15 Cutto tools are excluded from the registry when `getCuttoApi()` is null (default).
- `AgendaItem.meetingUrl` is set only for events that carry a stored Cutto URL; until Q1 is answered none do, so "Abrir en Cutto" on events is hidden (review N22). Project channel and person chat links are always available.
- The URL scheme is confirmed with the Cutto team before release (Q1).

### 11.3 Email templates (`lib/email/templates/*`, using `layout.ts`, Spanish copy)
- `recordatorio`: subject "Recordatorio: <texto>"; body with due time and a button "Abrir en Cincel".
- `resumen-diario`: subject "Tu resumen de hoy en Cincel"; sections Asignaciones, Menciones, Vencimientos, Comentarios with links; omitted sections when empty.
- `vacaciones-decision`: subject "Tu solicitud de vacaciones fue aprobada|rechazada"; dates, days, approver, note.
- `vacaciones-solicitud`: to deciders; subject "Nueva solicitud de ausencia de <nombre>"; dates and days, never the kind (privacy, §8.8); button "Revisar solicitudes".
- All four templates are created in Phase 1 (§21).
All sent with `sendMail`; when SMTP is not configured they only log (existing behavior).

---

## 12. Auth and security

### 12.1 Capabilities (all added in the contracts phase, review B4)

Added to `lib/auth/permissions.ts` (these are the only new names; everything else uses existing resolved capabilities by their real names):

| Helper | Rule | Notes |
|---|---|---|
| `canManageAppearance(user)` | `user.access === "Administrador"` | **Changed**: today it equals `canViewSensitiveStaffData` (Administrador or Dirección). Configuración General keeps its current check (`canViewSensitiveStaffData`) through a new alias `canManageGeneralSettings` so its behavior doesn't change |
| `canManageGeneralSettings(user)` | `canViewSensitiveStaffData(user)` | new alias (same rule as today) used by the `general` page guard and, from Phase 6, by `saveGeneralSettingsAction` / `restoreGeneralSettingsAction` |
| `canManageTimeTracking(user)` | `user.access === "Administrador"` | |
| `canViewTeamHours(user)` | `user.access === "Administrador" \|\| user.access === "Dirección"` | same pattern as `canViewSensitiveStaffData` (Q4) |
| `canDecideVacations(user)` | `user.access === "Administrador" \|\| user.access === "Dirección"` | review B12 |
| `canSeeAdminData(user)` | from `lib/tramos/compat.ts` (Project Flow helper when present, else `isAdministratorRole`) | re-exported here for one import site |

Existing names used by this spec: `team.canViewTeam`, `clients.canViewClients`, `clients.canCreateClient`, `activities.canCreateActivity`, `activities.canChangeResponsible`, `activities.canDeleteActivity`, `clients.canDeleteClient`, `projects.canDeleteProject`, `portal.manageAccess`.

### 12.2 Server guards (reviews B4, R2-1, R2-2)
- One `layout.tsx` per admin segment folder, `app/(staff)/ajustes/(admin)/<segment>/layout.tsx` (server, Phase 1), calls `requirePageCapability(cap)`; failure → `notFound()` everywhere (no redirect, no hint that the page exists). A single parent layout can't know its child segment, so there is no shared `(admin)/layout.tsx` guard.
- Segment rules (nav visibility uses the same capability):

| Segment | Capability |
|---|---|
| `general` | `canManageGeneralSettings` (today's rule, keeps Dirección where today allows it) |
| `tema` | `canManageAppearance` (Administrador) |
| `horario` (settings) | `canManageTimeTracking` (Administrador); the page's team-report section and `/api/horario/export` accept `canViewTeamHours` (Administrador, Dirección), so the segment guard is `canManageTimeTracking \|\| canViewTeamHours` and the settings form renders only with `canManageTimeTracking` |
| `estatus`, `permisos`, `monday`, `google`, `tramos`, `puestos` | Administrador (today's rule) |

- `saveGeneralSettingsAction` / `restoreGeneralSettingsAction` switch to `canManageGeneralSettings` in Phase 6 (same rule as today).
- Personal settings (`perfil`, `apariencia`, `notificaciones`, `integraciones`) need only a staff session.
- Every action re-checks its own capability (the page guard is not a substitute). The client prefix check in `AppRouteGuard` is not relied on.

### 12.3 Other rules
- Flags files (`*-actions.flags.ts`) contain only booleans keyed by action name; they carry no data, capability or secret, so importing them from client components is safe.
- Mi espacio, Gmail, assistant threads: owner-only (§9.1), enforced by `ownerScoped` with the session staff id (never from input).
- `/api/cron/tick`: `Authorization: Bearer ${CRON_SECRET}` compared in constant time; 401 otherwise; 503 if `CRON_SECRET` is unset. `/api` is already outside `middleware.ts`'s cookie checks, so no middleware change (and `middleware.ts` is not touched in this feature).
- `/api/staff/me/photo`, `/api/staff/[id]/photo`, `/api/horario/export`: session (401) and capability (403) checks in the handler.
- Assistant: every tool re-checks its capability at execute time; approval-gated tools can't run without an approval response for that `toolCallId`; tool inputs never accept a `staffId` for owner-only data; context ids are validated (§8.10).
- Rate limits (in-memory, like `googleStartRateLimiter`): `searchWorkspaceAction` 30/min per staff; `syncGmailAction` 1/30 s per staff; photo upload 10/hour per staff; violations → `RATE_LIMITED`.

---

## 13. Background work

**`POST /api/cron/tick`** (also `GET`), called every minute by the host cron on the Docker network (`* * * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://app:3000/api/cron/tick`), not through the public URL.

- **Lease, not advisory lock (review B14):** the tick acquires the `cron_leases` row `tick` for 55 s (§3.11); not acquired → `204`. Release at the end by owner. A crashed tick's lease expires by itself, so later ticks are never blocked. Long jobs can take their own lease (`job = <name>`).
- Jobs come from the registry (§8.0.4), one file each in `lib/cron/jobs/`, run sequentially within a total budget of 50 s; windowed jobs record `cron_runs(job, window_key)` with `insert … on conflict do nothing`, so a window runs once even when ticks repeat.

| Job (file `lib/cron/jobs/<name>.ts`) | Window key | Schedule | Work | Phase |
|---|---|---|---|---|
| `notifications-deliver` | none | every tick | send `email_status = 'pending'` rows with `deliver_after ≤ now` (limit 200), set `sent`/`failed` | 1 |
| `daily-digest` | `daily-digest:<date>` | 07:30 local | daily window, in order: (1) run the registered daily producers (`lib/cron/daily-producers/index.ts`; Phase 1 creates the registry and a stub `vencimiento.ts` that produces nothing; Phase 3 implements it for tasks due tomorrow and overdue, dedupe per task/day, admin tasks to admins only); (2) send the digests (§9.3); (3) housekeeping: purge read/non-inbox notifications > 180 days, soft-delete assistant threads beyond 50 per staff, trim `gmail_threads` beyond 500 per staff | 1 |
| `reminders-fire` | none (row `fired_at`) | every tick | §8.5 | 5 |
| `gmail-sync` | none | every tick | up to `GMAIL_SYNC_MAX_PER_TICK` connected (not disconnected) staff, oldest `last_synced_at` first, skipping backoff | 5 |
| `auto-close-jornadas` | `sin_entrada:<date>` for the reminder step | every tick | (1) auto-close forgotten entries (§8.7); (2) at `dayStart + 2 h` on work days, only when required, the missing clock-in notification (§9.5) | 6 |

- Response `200 { ran: [{ job, ms, count }], skipped: [...] }`.
- Failures: each job is wrapped; on error one JSON line `{ msg: "cron.job_failed", job, trace_id, error }`, its `cron_runs` row → `failed`, and the tick continues.
- `after()` keeps its existing uses and adds: `notify()` calls from actions; the first Gmail sync after consent.

---

## 14. Environment, Docker, observability

| Variable | Default | Purpose |
|---|---|---|
| `CRON_SECRET` | none (cron route returns 503) | Bearer secret for `/api/cron/tick` |
| `NEXT_PUBLIC_CUTTO_BASE_URL` | `https://cutto.cloudketer.dev` | Client-safe deep links (`cutto-links.ts`) |
| `CUTTO_API_URL`, `CUTTO_API_TOKEN` | none | Server-only; enable `cutto-api.server.ts` and the 15 Cutto tools |
| `GMAIL_SYNC_MAX_PER_TICK` | `10` | Gmail sync fan-out per tick |

`SESSION_SECRET` (existing) signs the Gmail confirm tokens. Docker/Compose: no image change; the deploy adds the host cron line (documented in `docs/deployment.md`). `next.config.ts`: no change (photo upload goes through a route handler, not a Server Action). Observability: JSON log lines with `trace_id` for `notify.failed`, `cron.job_failed`, `gmail.sync_failed`, `assistant.action` (`{ tool, status, ms }`). No metrics stack.

---

## 15. Folder structure (changes only)

```
lib/db/schema/{preferences,notifications,my-space,gmail,time,vacations,assistant}.ts   new
lib/db/schema/{_schema,shared,people,index}.ts                                      changed (enums, cron tables, staff_profiles.vacation_days, exports)
lib/db/migrations/<generated>_redesign_contracts.sql (+ meta)                       new, generated once (§4)
lib/types/{redesign,widgets}.ts, lib/validation/redesign.ts                         new
lib/ui/{preferences,themes,appearance-css,contrast}.ts                              new
lib/tramos/compat.ts                                                                new
lib/shell/nav-items/<domain>.ts (+ index.ts)                                        new (extension point)
lib/metrics/{series,widgets}.ts                                                     new (extend lib/dashboard/*)
lib/repositories/owner-scoped.ts                                                    new
lib/cron/{registry,tick,lease}.ts, lib/cron/jobs/<name>.ts (+ index.ts)             new
lib/cron/daily-producers/index.ts, lib/cron/daily-producers/vencimiento.ts        new (registry + stub in Phase 1; implemented in Phase 3)
lib/notifications/{notify,digest}.ts                                                new
lib/my-space/{reminder-parser,reminders}.ts                                         new
lib/gmail/{client,sync,suggest,sanitize}.ts                                         new
lib/time-tracking/{settings,state,report}.ts                                        new
lib/vacations/balance.ts, lib/search/search.ts                                      new
lib/assistant/{define-tool,approvals,threads}.ts, lib/assistant/tools/<domain>.ts (+ index.ts), lib/assistant/calc/takeoff.ts   new
lib/assistant/{tools,prompt}.ts, app/api/asistente/chat/route.ts                   changed
lib/integrations/{cutto-links.ts,cutto-api.server.ts}                               new
lib/actions/{preferences,org-appearance,profile-photo,search,notifications,my-space,gmail,time-tracking,vacations,assistant,people}-actions.ts  new ("use server", async functions only)
lib/actions/{…same domains…}-actions.flags.ts                                       new (plain module: export const IMPLEMENTED = {…} as const)
lib/actions/{dashboard,projects}-actions.flags.ts                                   new (flags for fetchInicioAction, fetchProjectsPortfolioAction)
lib/actions/{dashboard,projects,tasks,app-settings}-actions.ts                     changed (one owning phase each, see ownership)
lib/repositories/{preferences,notifications,my-space,gmail,time-entries,vacations,assistant}-repository.ts  new
lib/google/staff-oauth.ts, app/api/auth/google/{start,callback}/route.ts            changed (gmail grant)
lib/auth/permissions.ts                                                             changed (§12.1)
lib/settings/general-settings-schema.ts                                             changed (company links)
lib/errors.ts                                                                       changed (actionErrorText if absent; codes)
lib/email/templates/{recordatorio,resumen-diario,vacaciones-decision}.ts            new
app/layout.tsx                                                                      changed (appearance style, html attributes, Toaster)
app/(staff)/layout.tsx, app/(staff)/ajustes/(admin)/layout.tsx                      new
app/api/staff/me/photo/route.ts, app/api/staff/[id]/photo/route.ts, app/api/horario/export/route.ts, app/api/cron/tick/route.ts  new
scripts/themes-css.ts (+ package.json "themes:css")                                 new in Phase 1; run in Phase 9 to regenerate the globals.css fallback
```

---

## 16. Test plan

Vitest, next to the code; `*.db.test.ts` on the local Postgres; no CI workflow change (e2e stays local, CI changes are a separate infra issue).

**Unit (pure):**
- `contrast.ts`: every preset passes every `CONTRAST_PAIRS` entry in all six theme×mode combos and the computed ratios equal the §5.5 table (±0.01); a `muted-foreground #c0c0c0` edit on white fails with the right pair; `rgba` compositing; oklab tint mix.
- `toCssVars`: every `TokenName` emitted for both modes; type scale and shape vars; `--text-base`.
- `resolveAppearance`: override on/off; user theme ≠ base uses the preset; `redesignEnabled` fallback; `redesignAvailable = false` forces false.
- Appearance cookie: written by `updateMyPreferencesAction`; ignored when `v` differs from the org.
- `parseReminderText`: every row of §8.4 plus "a las 3" before/after 15:00, "31 de febrero" → null, accents/case.
- Reminder repeat advancement (daily, weekly, monthly on the 31st).
- Time tracking state machine: all transitions, `workedSeconds` with pauses, `required`/`promptAtLogin` table (disabled, trial, required, non-work day, exempt), auto-close with and without `autoCloseAt`, late calculation, weekly report statuses and lunch rule, target minus vacations; `requiredFrom` change into the past rejected.
- Vacation `days`, balance with override vs org default, overlap detection, `kind` masking.
- Search ranking order; urls of §7.3.
- Metrics helper: `kpiFromDaily` (value, series7, delta and `good` for both directions, avg30/min30/max30 with < 30 points), `weeklyCounts` against `bucketTaskTrend` fixtures.
- Widget builders: each builder against fixture DTOs (tones, `vacaciones`, `auto` totals); outputs type-checked against `lib/types/widgets.ts`.
- Cron registry: `due()` windows (`daily-digest` 07:30 local, `auto-close-jornadas` missing clock-in step at dayStart + 2 h); one window key per day; job files exist only for the five canonical names.
- Gmail project suggestion; HTML sanitizer allowlist; draft update reuses `draftId`.
- `defineTool`: `needsApproval` set for every **Confirmar** tool; dynamic approval after an untrusted result; capability gating; Cutto tools absent without `CUTTO_API_URL`; calendar-write tools absent.
- Photo metadata stripping for jpeg/png/webp fixtures with GPS EXIF.
- CSV export formula escaping.
- Drift guards: until Phase 9, `app/globals.css` is unchanged from today (snapshot test of its token block); from Phase 9 it equals `THEME_PRESETS.azul` (generated by `npm run themes:css`)
- B18 (local Playwright, recorded on the issue like the other e2e runs): with the flag on and `colorScheme: "dark"` emulated, light mode renders the light vars (the legacy OS-dark rule loses to `html:root[data-theme="light"]`), dark mode renders the dark vars, and system mode follows the emulated scheme with `data-theme` and `.dark` in sync; with the flag off, the page renders exactly today's look.
- B17: with `redesignEnabled = false` the root layout renders exactly today's pipeline (`<style id="primary-color">`, `globals.css`, `ThemeToggle` with `data-theme`) and no `<style id="appearance">`; with it on, the appearance block renders with `html:root[data-theme="light"]` / `html:root[data-theme="dark"]` selectors (review B18).

**Repository / DB (`*.db.test.ts`):**
- The redesign migration applies on an empty DB and on a fixture with `appearance.primary_color` set: both seed `baseTheme = 'azul'` and leave `appearance.primary_color` unchanged.
- Constraints: text size; quiet pair; notes not empty; checklist item text; reminder channels; notification delivery check; one open time entry per staff (concurrent insert → one row); vacation range/days; photo size and mime; `vacation_days >= 0`.
- Owner-scoped helper: one shared suite against every table that uses it.
- `notify`: every channel combination produces the right row (in-app only, email only inside quiet hours → `pending` with `deliver_after`, digest only); dedupe; actor exclusion; inactive staff. `notifications-deliver` sends only due pending rows; `daily-digest` groups and sets `digested_at`.
- Cron lease: two concurrent ticks → one runs; a lease left by a "crashed" tick is taken after it expires; windowed jobs once per window; a failing job doesn't stop the others.
- Admin-only filtering: with a fixture admin task (or `isAdministratorRole` fallback), non-admin calls of `fetchInicioAction`, `fetchPersonaDetailAction`, `fetchProjectsPortfolioAction`, `fetchPeopleOverviewAction`, `searchWorkspaceAction` and the read tools never return it.
- Assistant: approval audit rows per `toolCallId`; thread upsert by another owner → 403; client-sent history ignored; `importLegacyAssistantThreadAction` makes no model call.
- `disconnectGmailAction`: cache deleted, sync skipped, Google token untouched.

**Flags:** a Vitest check imports each `lib/actions/<domain>-actions.ts` and its `<domain>-actions.flags.ts` and asserts that every exported action has a key in `IMPLEMENTED` and that every key names an exported action (review B20); a second check asserts that no `"use server"` file exports anything but async functions.

**Actions:** auth and error codes of every action in §7 (mocking `requireCapabilityUser` like the existing `*-actions.test.ts`); route handlers: photo upload (401/413/415/429), photo read (401/404/304), export (403, BOM, trial exclusion, escaping), cron (401/503/204/200), chat route (thread upsert, approval response round-trip).

**Acceptance (`*.acceptance.db.test.ts`):** reminder created → tick at due time → in-app row + email sent by `notifications-deliver` (SMTP log mode); clock in → pause → resume → auto-close flagged → report status; vacation request → decision → balance and availability updated; org appearance save → next page load renders the new `<style id="appearance">`.

---

## 17. Acceptance (backend)

1. Preferences persist per staff and drive the `cincel-appearance` cookie; with `allowUserOverride = false`, setting theme or style throws `OVERRIDE_DISABLED`; with `redesignAvailable = false`, nobody gets the new shell and opting in throws `DISABLED`.
2. Every preset passes every pair of §5.5 in all six theme×mode combos; `saveOrgAppearanceAction` rejects any failing edit with `LOW_CONTRAST`; a saved appearance is rendered server-side on the next page load with no flash in light, dark or system mode.
3. Every Mi espacio, Gmail, notification and assistant-thread action returns or changes only the caller's rows.
4. A reminder due at T produces an in-app row (and an email when chosen) within one minute of T; a repeating one moves to its next occurrence; an email inside quiet hours is sent when they end.
5. `notify` always stores one row per recipient with the delivery state; digest-only and email-only kinds are delivered by the cron jobs; nobody is notified of their own action.
6. With time tracking disabled, write actions throw `DISABLED`; before `requiredFrom` entries work and are excluded from the CSV; after it, `required` is true on work days; forgotten entries close at `autoCloseAt` (or `dayEnd`) and are flagged.
7. `fetchTeamHoursAction` and the CSV are available only to `canViewTeamHours` and follow §8.7; CSV cells can't inject formulas.
8. Vacation requests reject overlaps; only Administrador and Dirección decide (never their own); `kind` is visible only to the requester and deciders; balance uses the person override or the org default.
9. `searchWorkspaceAction` returns ranked results across five types, respecting capability scopes, owner-only notes and admin-only data.
10. Gmail: consent via `?grant=gmail`; incremental sync with backoff; live thread reading; drafts updated in place; UI sends only with a valid `confirmToken`; disconnect clears the cache without revoking the shared token.
11. Assistant: threads persist server-side with client-generated ids; every **Confirmar** tool and every write after untrusted content requires an AI SDK approval, and the model receives the result; confirmed shared-entity writes are logged "vía asistente"; Cutto and calendar-write tools are absent by default.
12. `/api/cron/tick` rejects missing/wrong secrets, never runs two ticks at once, recovers from a crashed tick when its lease expires, and runs windowed jobs once per window.
13. No aggregate or read returns Project Flow admin tasks or client/origin data to a viewer without `canSeeAdminData`.
14. Admin settings pages are guarded on the server per segment (§12.2).

---

## 18. API alignment verification (frontend §7)

After review round 1 this section and frontend §7 list the same actions, inputs, outputs and error codes.

```
✅ fetchMyPreferencesAction / updateMyPreferencesAction → { preferences, appearance } (INVALID, OVERRIDE_DISABLED, DISABLED; no revalidation)  §7.1
✅ fetchOrgAppearanceAction / saveOrgAppearanceAction (FORBIDDEN, INVALID, LOW_CONTRAST)            §7.1
✅ resetOrgAppearanceAction(base) (FORBIDDEN)                                                      §7.1
✅ POST /api/staff/me/photo (TOO_LARGE, INVALID_TYPE, RATE_LIMITED) / removeMyPhotoAction / GET /api/staff/[id]/photo   §7.2
✅ searchWorkspaceAction (INVALID, RATE_LIMITED)                                                    §7.3
✅ fetchNotificationsAction / markNotificationsReadAction                                          §7.4
✅ fetchNotificationPreferencesAction / updateNotificationPreferencesAction (INVALID)              §7.4
✅ fetchNotesAction / createNoteAction / updateNoteAction / archiveNoteAction / restoreNoteAction  §7.5
✅ fetchChecklistsAction / createChecklistAction / addChecklistItemAction / toggleChecklistItemAction / reorderChecklistItemsAction / archiveChecklistAction  §7.5
✅ fetchRemindersAction / parseReminderTextAction / createReminderAction (PAST_TIME) / snoozeReminderAction / cancelReminderAction  §7.5
✅ fetchGmailStatusAction / fetchGmailThreadsAction / fetchGmailThreadAction (GmailMessage, GmailAttachment)  §7.6
✅ syncGmailAction (RATE_LIMITED) / linkGmailThreadToProjectAction                                  §7.6
✅ createGmailDraftAction (draftId? → update) → { draftId, confirmToken, expiresAt }               §7.6
✅ sendGmailDraftAction (CONFIRM_REQUIRED, EXPIRED, NOT_CONNECTED) / createTaskFromGmailThreadAction  §7.6
✅ disconnectGmailAction                                                                           §7.6 (review B15)
✅ GET /api/gmail/attachments/[messageId]/[attachmentId]                                          §7.6
✅ GET /api/auth/google/start?grant=gmail                                                          §11.1
✅ fetchTimeTrackingSettingsAction / saveTimeTrackingSettingsAction (FORBIDDEN, INVALID)            §7.7
✅ fetchMyTodayAction (TodayStatus + requiredFrom, hoursPerDay) / clockInAction / pauseWorkAction / resumeWorkAction / clockOutAction  §7.7
✅ fetchTeamHoursAction (FORBIDDEN, INVALID) / fetchMyWeekHoursAction / GET /api/horario/export     §7.7
✅ fetchMyVacationsAction / requestVacationAction (INVALID, OVERLAP) / cancelVacationRequestAction (STARTED)  §7.8
✅ fetchPendingVacationRequestsAction / decideVacationAction / fetchTeamAbsencesAction (kind masked)  §7.8
✅ fetchVacationSettingsAction / saveVacationSettingsAction                                        §7.8 (review B12)
✅ fetchAssistantThreadsAction / fetchAssistantThreadAction / deleteAssistantThreadAction           §7.9
✅ importLegacyAssistantThreadAction / fetchAssistantActionsAction                                  §7.9 (review B9)
✅ POST /api/asistente/chat { id, message?, approvals?, context }                                  §7.9
✅ fetchInicioAction → InicioData                                                                  §7.10
✅ fetchPersonaDetailAction → PersonaDetail / fetchPeopleOverviewAction → PeopleOverviewRow[]       §7.11
✅ fetchProjectsPortfolioAction → PortfolioRow[]                                                   §7.12
✅ POST /api/cron/tick (Bearer CRON_SECRET, lease)                                                  §13
✅ cutto-links.ts (client) / cutto-api.server.ts (server)                                          §11.2
✅ Types of lib/types/redesign.ts and lib/types/widgets.ts (single source)                         §6, §6.1
✅ Token values and contrast pairs (single source)                                                 §5
```

---

## 19. Differences from the frontend spec

None in the contract surface after round 1. Notes the frontend relies on:
- Token values, ink tokens, `warning-ink`, `border-strong` and the contrast pair list are defined here (§5); frontend §14 references them.
- Widget data shapes are defined only in `lib/types/widgets.ts` (§6.1); UI-only props (`actions`, `footer`, `renderCell`) live on the components.
- `redesignEnabled` is `boolean | null` in the table and resolved to `boolean`; `OrgAppearance` lives under one `app_settings` key.
- `GmailThreadSummary.from` is a display string; the cache stores name and email separately.

---

## 20. Resolved decisions

| # | Decision |
|---|---|
| D1 | `OrgAppearance` (incl. `styleDefault`, `allowUserOverride`, `redesignDefault`, `redesignAvailable`, `v`) is one `app_settings` key, `appearance.theme`. |
| D2 | The migration seeds Azul (rendered only for flag-on users); `appearance.primary_color` keeps driving the legacy pipeline until Phase 9 (review B17). |
| D3 | Repeating reminders are one row whose `due_at` advances; notifications carry the dedupe key. |
| D4 | One open time entry per staff is a DB guarantee; transitions lock the open entry. |
| D5 | Lunch is deducted only for days ≥ 5 h without a pause ≥ 30 min. |
| D6 | Vacation entitlement = `staff_profiles.vacation_days` or `vacations.daysPerYear` (default 12); holidays out of scope. |
| D7 | Gmail caches headers/snippets only; bodies and attachments are read live; nothing is shared with other staff. |
| D8 | Assistant confirmations use AI SDK `needsApproval`; Gmail UI sends use a 10-minute HMAC token from `createGmailDraftAction`. |
| D9 | Existing write tools become approval-gated; any write after untrusted content needs approval. |
| D10 | Cron is one authenticated route driven by host cron with a lease row; no queue. |
| D11 | One generated migration in the contracts phase; never hand-renumber; the feature that merges second regenerates. |
| D12 | Cálido dark values are derived and gated by the contrast test. |
| D13 | `canManageAppearance` becomes Administrador-only; General settings keep their current rule via `canManageGeneralSettings`. |
| D14 | Calendar writes and the parametric costs editor are out of scope (Annex C.2); the Gmail attachment route and `fetchMyWeekHoursAction` are in scope. |

---

## 21. Phase plan and file ownership (canonical; reviews B5, B16)

This section is identical in both redesign specs (only cross-references differ).

**Rule 1.** Phase 1 creates every new file. Each later phase owns the implementation of the files listed for it, exclusively. Phase 1 stubs: read actions return safe defaults (empty lists, `enabled: false`, `connected: false`); write actions throw `NOT_IMPLEMENTED` (new shared code, Spanish copy "Esta función todavía no está disponible.", §9.10). Each actions file has a sibling plain flags module `lib/actions/<domain>-actions.flags.ts` (`export const IMPLEMENTED = { … } as const`, no `"use server"`); Phase 1 creates every flags file, and the phase that owns an actions file owns its flags file and flips its entries. The UI imports the flags file and hides an entry point while its `IMPLEMENTED` flag is false (or its read action reports it disabled or empty), so nothing calls a write stub from the UI.

**Rule 2.** Phases 2–8 depend only on Phase 1 and never on each other. Phase 9 (Cleanup) runs after all.

**Rule 3.** Assistant tools register an `available(ctx)` check that imports the flags files (`lib/actions/<domain>-actions.flags.ts`) of the actions they call (§10.1); a tool whose backing action is still a stub reports unavailable and is not offered to the model.

| Phase | Name | Owns (implements) |
|---|---|---|
| 1 | Contracts and foundation | ONE migration PR with all new tables (incl. `cron_leases`) (§4); `lib/types/redesign.ts`, `lib/types/widgets.ts` (§6); all 62 §7 action signatures + zod schemas as stubs (Rule 1), each actions file with its sibling flags module `lib/actions/<domain>-actions.flags.ts` (`IMPLEMENTED`, §9.10); user-preference actions `fetchMyPreferencesAction` / `updateMyPreferencesAction` fully implemented; `fetchOrgAppearanceAction` implemented as a reader in `org-appearance-actions.ts`; `general_settings.company` schema fields `instagramUrl`, `contactEmail` + defaults in `lib/settings/general-settings-schema.ts`; photo routes `POST /api/staff/me/photo`, `GET /api/staff/[id]/photo` + `removeMyPhotoAction` fully implemented (§7.2); `lib/errors.ts` (`actionErrorText` + new codes incl. `NOT_IMPLEMENTED`, §9.10); capabilities in `lib/auth/permissions.ts` (`canManageAppearance`, `canManageGeneralSettings`, `canManageTimeTracking`, `canViewTeamHours`, `canDecideVacations`, `canSeeAdminData` re-export) and per-segment guards (§12); `lib/tramos/compat.ts`; `lib/ui/contrast.ts`, `lib/ui/themes.ts`, appearance resolver + cookie + SSR style block (flag-gated, B17/B18, §8.1–§8.2); `app/(staff)/layout.tsx`, AppShell, Sidebar (TimeClock slot hidden while `IMPLEMENTED.clockInAction` in `time-tracking-actions.flags.ts` is false / the `fetchMyTodayAction` stub reports `enabled: false`), PageHeader, EstiloSwitch, StyleProvider/StyleView, Toaster, EmptyState/ErrorState/LoadingSkeleton; the whole widget library + ListPage/FiltersBar/FormSheet/FormDialog/SettingsSection; nav config with extension points; `lib/notifications/notify.ts` (full: row insert, preferences, quiet hours, email pending, §8.3) + cron jobs `notifications-deliver` and `daily-digest`; the daily-producers registry `lib/cron/daily-producers/index.ts` with a stub `vencimiento.ts` (§13); ALL new email templates (recordatorio, resumen-diario, vacaciones-decision, vacaciones-solicitud, §11.3); read helpers fully implemented: `lib/time-tracking/week-hours.ts`, `lib/vacations/approved-absences.ts`, `lib/my-space/reminders-for-day.ts` (§8.12); cron registry + lease + `/api/cron/tick` (§8.0.4, §13); assistant `defineTool` + registry + `summarize(input)` + client-safe `lib/assistant/tool-summaries.ts` + ConfirmationCard + render_table/render_timeline/render_confirmation (UI only; chat route untouched) (§10) |
| 2 | Shell, navigation and states | redirects (both directions, flag-aware), CommandPalette (⌘K) + `search-actions.ts`, avatar menu UI (photo upload/remove via the Phase 1 routes), opt-in banner UI (calls the Phase 1 `updateMyPreferencesAction`), BottomTabs (mobile), Error404/error.tsx/loading.tsx per route group |
| 3 | Inicio, Tareas y Calendario | `fetchInicioAction`, `/inicio`, `/tareas` (tablero, lista, calendario views), TaskSheet, NewTaskDialog, calendar style variants, notify hooks inside `tasks-actions.ts` (asignación, mención, comentario), daily producer `lib/cron/daily-producers/vencimiento.ts` (vencimiento) |
| 4 | Proyectos, Personas, Biblioteca y Vacaciones | `fetchProjectsPortfolioAction`, `fetchPeopleOverviewAction`, `fetchPersonaDetailAction`, `/proyectos` + project tabs, `/personas/*`, `/biblioteca/*`, `vacations-actions.ts` (all), Mis vacaciones incl. "Días de vacaciones" settings section and "Solicitudes del equipo" |
| 5 | Mi espacio, Bandeja y Gmail | `my-space-actions.ts`, `notifications-actions.ts`, `gmail-actions.ts`, Gmail consent grant + attachment route, cron jobs `reminders-fire`, `gmail-sync`, `/mi-espacio/*`, Ajustes › Notificaciones and Ajustes › Integraciones pages |
| 6 | Ajustes, tema y Control de horario | `org-appearance-actions.ts` save/reset (`saveOrgAppearanceAction`, `resetOrgAppearanceAction`) + Tema y estilo editor, Apariencia page, `time-tracking-actions.ts`, TimeClock behavior, login clock-in prompt, team hours report + `/api/horario/export`, cron job `auto-close-jornadas`, Perfil page, Ajustes › General UI (company links form; schema fields land in Phase 1) and the save/restore switch to `canManageGeneralSettings` in `app-settings-actions.ts`, per-segment admin pages restyle (estatus, permisos, monday, google; tramos/puestos link to Project Flow pages when present) |
| 7 | Asistente en todas partes | `app/api/asistente/chat/route.ts`, `assistant-actions.ts`, AssistantButton/AssistantSheet, `/asistente` page, tool domain files `lib/assistant/tools/<domain>.ts` for all 65 new tools (each guarded by Rule 3), legacy thread import |
| 8 | Acceso y portal | login, denegado, cambio de contraseña, first-login wizards restyle, portal pages restyle + styles |
| 9 | Cleanup | remove flag and legacy shell/routes/pages, ThemeToggle data-theme legacy, switch `globals.css` fallback from Grafito to Azul, delete localStorage readers |

**Cron job names (canonical):** `notifications-deliver`, `daily-digest` (Phase 1); `reminders-fire`, `gmail-sync` (Phase 5); `auto-close-jornadas` (Phase 6). (§13)

**Existing shared files modified by exactly one phase:** `lib/actions/tasks-actions.ts` → 3; `lib/settings/general-settings-schema.ts` → 1 (fields + defaults); `lib/actions/app-settings-actions.ts` (switch save/restore to `canManageGeneralSettings`) → 6; `app/layout.tsx` and `app/globals.css` → 1 (and 9 for the fallback switch); `components/layout/Sidebar.tsx` and `Header.tsx` (legacy) → untouched until 9; `lib/auth/permissions.ts` → 1.

**Hidden-dependency resolutions:** command palette "Registrar entrada" appears only when `fetchMyTodayAction().enabled` (stub false until 6); photo upload buttons (Inicio in 3, Perfil in 6) post to the Phase 1 photo route, which is fully implemented; Inicio "Mi día" reads the `remindersForDay` helper (Phase 1) — empty until Phase 5 writes reminders; Personas hours read the `weekHours` helper (Phase 1) — zeros until Phase 6; the hours report target reads the `approvedAbsences` helper (Phase 1) — none until Phase 4; the vacations decision email uses the Phase 1 template.

### 21.1 Coordination with Project Flow (review R2-9)
- One `<Toaster>` in the root layout (Phase 1); Project Flow Phase 2 must not add a second (if Project Flow lands first, Phase 1 reuses its Toaster).
- Migrations follow §4 (the feature that merges second regenerates on top).
- `lib/actions/tasks-actions.ts` is also rewritten by Project Flow Phase 2; whichever merges second rebases. The redesign's change is three `after(() => notify(...))` calls at the end of `assignTaskAction`, `createUserTaskAction` and `addTaskCommentAction` (Phase 3); due-date notifications come from the daily producer, not from `tasks-actions.ts`.
- Redirect `/actividades/[tramo]?project=X` → `/tareas?tramo=<key>&project=X&iniciar=1` keeps the start-sheet deep link (Phase 2).
- A short addendum with these rules is added to the Project Flow specs separately.

---

## Annex C: contract additions

### C.1 Accepted from the frontend spec (FE Annex C)

| # | Addition | Where |
|---|---|---|
| FE1 | `createGmailDraftAction` returns `{ draftId, confirmToken, expiresAt }`; `sendGmailDraftAction(draftId, confirmToken)` validates it | §7.6, §8.6 |
| FE2 | `chart-1-ink` … `chart-5-ink` tokens, seeded and contrast-checked on their tints | §5.2, §5.5, §6 |
| FE3 | `fetchProjectsPortfolioAction(): PortfolioRow[]` | §7.12 |
| FE4 | `fetchPeopleOverviewAction(): PeopleOverviewRow[]` | §7.11 |
| FE5 | `general_settings.company` gains `instagramUrl`, `contactEmail` (`websiteUrl` = existing `website`) | §3.12 |

### C.2 Backend additions and scope decisions (round 1)

| # | Item | Status |
|---|---|---|
| C1 | Vacation entitlement: `fetchVacationSettingsAction` / `saveVacationSettingsAction` (org `daysPerYear` + per-person override) | **In scope**, §7.8; frontend consumer: Mis vacaciones "Días de vacaciones" section (review R2-6) |
| C2 | Shared widget shapes in `lib/types/widgets.ts`; `InicioData`/`PersonaDetail` composed of them | **In scope**, §6.1 (single source) |
| C3 | `calendar.events` grant for agenda write tools | **Out of scope**; the four calendar-write tools stay disabled |
| C4 | Gmail attachment stream route `GET /api/gmail/attachments/[messageId]/[attachmentId]` | **In scope**, §7.6 (consumer: Mi espacio › Gmail) |
| C5 | `parametric_costs` setting and editor | **Out of scope**; `parametric_cost_estimate` answers "no configurado" |
| C6 | `fetchMyWeekHoursAction()` → `{ days, total, target }` | **In scope**, §7.7 (consumer: Perfil) |
| C7 | New tokens `warning-ink`, `border-strong` | **In scope**, §5 (review B1) |
| C8 | `disconnectGmailAction`, `importLegacyAssistantThreadAction`, `fetchAssistantActionsAction`, `fetchPendingVacationRequestsAction`, `restoreNoteAction` | **In scope**, §7 (review B9, B12, B15; note undo) |

---

## Review round 1 fixes

| # | Issue | Resolution |
|---|---|---|
| B1 | Presets failed the contrast gate; two pair lists | One module `lib/ui/contrast.ts` with one pair list (§5.5); preset values fixed (bold in §5.1–§5.2) and every ratio listed per combo; new tokens `warning-ink`, `border-strong`; text on charts uses `chart-N-ink`; this spec is the single source of token values |
| B2 | SSR appearance inconsistent | Cookie JSON `{theme, mode, style, density, textSize, v}`; server `<style id="appearance">` with `:root`/`.dark` blocks; `<html>` data attributes and `.dark` class; blocking script for system mode; `cssVars: { light, dark }`; org changes on next page load (§8.2) |
| B3 | Rollout flag and kill switch | Route group `(staff)` layout branches on the flag; opt-in via `updateMyPreferencesAction({ redesignEnabled: true })` from the user menu; `redesignAvailable` enforced in `resolveAppearance` and the action (`DISABLED`) (§6, §8.1, §9.2) |
| B4 | Admin settings lost their access check | Server guard `app/(staff)/ajustes/(admin)/layout.tsx` per segment; capabilities listed in §12.1 (Administrador / Dirección rules) |
| B5 | No phase plan or ownership; widget types defined twice | §21 ownership; Phase 1 lands all shared pieces and extension points; `lib/types/widgets.ts` is the single source (§6.1) |
| B6 | Renumbering migrations skips them | One generated migration in Phase 1; never hand-renumber; second feature to merge regenerates (§4) |
| B7 | Hidden Project Flow dependencies | `lib/tramos/compat.ts`; no direct Project Flow imports; one Toaster; start deep link preserved (§9.7, §21.3) |
| B8 | Admin-only data leaks | Every aggregate, search and read tool filters through `canSeeAdminData`; Resumen client rule; `nextDelivery` excludes admin tasks (§9.7) |
| B9 | Assistant confirmations | AI SDK `needsApproval` + `addToolApprovalResponse`; `assistant_actions` is audit only; client thread ids; server-loaded history; legacy import without model call (§7.9, §8.10) |
| B10 | Notifications data gap | `notify` always inserts; `in_app`, `email_status`, `digest`, `deliver_after`; jobs `notifications-deliver`, `daily-digest` (§3.5, §8.3) |
| B11 | Cutto env and module mix | `NEXT_PUBLIC_CUTTO_BASE_URL` in client-safe `cutto-links.ts`; server-only `cutto-api.server.ts`; tools disabled without `CUTTO_API_URL` (§11.2) |
| B12 | Vacation kind leak; approver rule | `kind` only for owner and deciders (`ausencia` otherwise); deciders Administrador and Dirección; allowance via `vacations.daysPerYear` + `staff_profiles.vacation_days` with one action pair (§7.8, §8.8) |
| B13 | Style rule vs ListPage/KpiDatum | `KpiDatum.visibleIn`; pages pass data and widget specs (FE); no style branching in data (§6.1) |
| B14 | Advisory lock leaks on the pool | Lease table `cron_leases` (§3.11, §13) |
| B15 | Gmail disconnect missing | `disconnectGmailAction` (cache deleted, `disconnected_at`, shared token not revoked) (§7.6, §8.6) |
| N1 | Photo body limit, EXIF | Route handler with 2 MB limit; client canvas re-encode; server magic bytes + metadata strip (§7.2, §8.11) |
| N2 | "Next navigation" wording | "On next page load" (§8.2, §9.2, §17) |
| N3 | Fonts | Frontend concern (all three `next/font` declarations); no backend change |
| N4 | Prompt injection via mail/docs | Untrusted wrapper + dynamic approval for writes after untrusted content (§10.1) |
| N5 | Client context ids | Resolved through viewer-scoped reads, dropped when not visible (§8.10) |
| N6 | Client history trusted | Server loads history; client sends only the new message and approvals (§7.9) |
| N7 | Drafts pile up | `createGmailDraftAction` accepts `draftId` and uses `drafts.update` (§7.6) |
| N8 | Gmail HTML | Sanitized with `sanitize-html`; rendered in `<iframe sandbox srcdoc>` (§8.6) |
| N9 | Restricted scope | Internal consent screen documented (§11.1) |
| N10 | Search contract details | `nota` url `/mi-espacio/notas/<id>`; contact `?contacto=`; no `accion` results (§7.3) |
| N11 | Capability names | Real names (`team.canViewTeam`, `portal.manageAccess`, access-based Dirección) (§7, §10.1, §12.1) |
| N12 | TimeClock props | `TodayStatus.requiredFrom`, `hoursPerDay` (§6) |
| N13 | Deep-link sheets | Frontend concern (intercepting routes or query param); no backend change |
| N14 | Time-tracking edge cases | Row lock; close at `dayEnd` when `autoCloseAt` is null; `requiredFrom` change can't be in the past (§7.7, §8.7) |
| N15 | CSV formula injection | Cells escaped (§7.7) |
| N16 | `general_settings` rollback | Documented as a known rollback effect with a SQL fix in the runbook (§3.12) |
| N17 | `numeric` text size; trigram index | `numeric(..., { mode: "number" })`; `idx_notes_body_trgm` removed (§3.3, §3.6) |
| N18 | Error copy | One signature `actionErrorText(err, context?)`; `STARTED`; contextual `RATE_LIMITED` (§9.10) |
| N19 | Linked ids not checked | `projectId`/`taskId` must be visible to the caller (§7.5) |
| N20 | Private data in history | Owner-only entities write nothing to `history_events` (§9.9) |
| N21 | Annex items without consumer | Each marked in or out of scope with a frontend owner (Annex C.2) |
| N22 | Cutto meeting links | `meetingUrl` only for events with a stored Cutto URL; none until Q1 (§6.1, §11.2) |
| N23 | PageHeader location | Frontend concern (edit `components/v2/layout/PageHeader.tsx` in place) |
| N24 | Revalidation drift | `updateMyPreferencesAction` returns `{ preferences, appearance }`, sets the cookie and doesn't revalidate (client applies vars; next navigation renders from the cookie); photo upload revalidates the layout (§7.1, §7.2) |
| N25 | `mis-vacaciones` resource links | Kept and listed on `/biblioteca/vacaciones` (§4) |
| N26 | CI | Separate infra issue; no change here |
| N27 | Small notes | No `middleware.ts` change; host cron calls the app on the Docker network (§12.3, §13) |

---

## Review round 2 fixes

| # | Issue | Resolution |
|---|---|---|
| B16 | The two phase plans disagreed and later phases depended on each other | §21 replaced with the canonical phase table (identical in both specs): Phase 1 creates every file with stubs (Rule 1), Phases 2–8 depend only on Phase 1 (Rule 2), assistant tools check `available(ctx)` (Rule 3); single-owner list for shared files; hidden dependencies resolved through Phase 1 read helpers (§8.12), the Phase 1 `notify` + jobs, and Phase 1 templates |
| B17 | The legacy look changed with the flag off | Flag off renders today's pipeline exactly (`primary-color` style, `globals.css`, `ThemeToggle` `data-theme`); the appearance block renders only for flag-on users with `:root` and `.dark, :root[data-theme="dark"]` selectors; `globals.css` keeps today's values until Phase 9; the seed is Azul but only rendered for flag-on users (§4, §5.3, §8.2, §16) |
| R2-1 | One `(admin)` layout can't know its segment | One `layout.tsx` per admin segment calling `requirePageCapability(cap)`, `notFound()` on failure (§12.2) |
| R2-2 | Admin rules per segment differed | Segment table in §12.2 (general → `canManageGeneralSettings`, tema → `canManageAppearance`, horario → `canManageTimeTracking` with the report for `canViewTeamHours`, the rest Administrador); General save/restore switch to `canManageGeneralSettings` in Phase 6 |
| R2-3 | Approval summary source | `summarize(input): string` on every tool, exposed client-side through `lib/assistant/tool-summaries.ts`; `ConfirmationCard` renders from the approval part's `toolName` + `input` (§8.10, §10.1) |
| R2-4 | Global text PK on `assistant_messages` | PK `(thread_id, id)`; ownership verified before upsert (§3.10, §8.10) |
| R2-5 | `render_timeline` args differed | `{ title?: string; items: AgendaItem[] }` (§10.3) |
| R2-6 | Vacation settings location differed | "Días de vacaciones" lives in Mis vacaciones for `canDecideVacations`; revalidation and Annex C consumer updated (§7.8) |
| R2-7 | Guard-test false positive | Frontend concern (allow-list `components/shell/{EstiloSwitch,StyleProvider}.tsx`); no backend change |
| R2-8 | `LOW_CONTRAST` detail format | `<pair> <mode> <ratio>[, …]` in both specs (§7.1, §8.2) |
| R2-9 | Project Flow spec not updated | Coordination rules recorded in §21.1; the Project Flow addendum is added separately |
| R2-10 | `destructive` on `background` below 4.5 in Azul light | Pair `destructive/background` added to `CONTRAST_PAIRS`; Azul light `destructive` `#e11d48` → `#d81844` (4.61 on background, 5.08 on card); ratio table recomputed (§5) |
| Stubs | Read/write stub behavior | `NOT_IMPLEMENTED` code and copy; read stubs return safe defaults (§9.10, §21) |
| Cron names | Job names differed | Canonical five jobs: `notifications-deliver`, `daily-digest` (1), `reminders-fire`, `gmail-sync` (5), `auto-close-jornadas` (6); due-date notifications run as a `daily-digest` producer added by Phase 3; housekeeping runs in `daily-digest`; the missing clock-in reminder runs in `auto-close-jornadas` (§13) |

---

## Review round 3 fixes

| # | Issue | Resolution |
|---|---|---|
| B18 | The legacy OS-dark rule in `globals.css` overrode the new theme for flag-on users | Flag-on `<html>` always carries `data-theme="light"\|"dark"` (server from the cookie; head script in system mode); the appearance block uses `html:root[data-theme="light"]` / `html:root[data-theme="dark"]` (specificity 0,2,1), beating `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`; `.dark` kept in sync; Playwright check with emulated dark scheme for light, dark and system modes plus flag-off (§8.2, §16) |
| B19a | General settings schema coupled Phases 1 and 6 | `instagramUrl`, `contactEmail` schema fields + defaults land in Phase 1; Phase 6 owns the UI and the save/restore capability switch (§3.12, §21) |
| B19b | `preferences-actions.ts` had two owners | User preference actions fully implemented in Phase 1; org appearance moved to `lib/actions/org-appearance-actions.ts` (reader in Phase 1, save/reset in Phase 6); Phase 2 keeps only the banner and avatar-menu UI (§7.1, §21) |
| B19c | Tools and UI probed stubs | Every actions file has a sibling flags module with `IMPLEMENTED` (see round 4, B20); owning phases flip their own entries; `available(ctx)` and UI entry points read them (§9.10, §10.1, §21) |
| R3-1 | Digest time | 07:30 everywhere (§9.3, §10.3 `schedule_digest`, §13) |
| R3-2 | Producer file and registry missing from Phase 1 | `lib/cron/daily-producers/index.ts` + stub `vencimiento.ts` created in Phase 1; Phase 3 implements `vencimiento.ts` (§2, §13, §21) |
| R3-3 | Photo upload before Phase 2 | Photo routes and `removeMyPhotoAction` fully implemented in Phase 1; Phase 2 keeps the avatar menu UI (§21) |

---

## Review round 4 fixes

| # | Issue | Resolution |
|---|---|---|
| B20 | `export const IMPLEMENTED` can't live in a `"use server"` actions file (Next allows only async function exports there) | Flags move to a sibling plain module per actions file, `lib/actions/<domain>-actions.flags.ts` (`export const IMPLEMENTED = { … } as const`, no `"use server"`). Phase 1 creates every flags file; the phase that owns an actions file owns and flips its flags file; assistant tools' `available(ctx)` and UI entry points import the flags file. A Vitest check asserts one key per exported action (and no extra keys), plus that `"use server"` files export only async functions (§7, §9.10, §10.1, §12.3, §15, §16, §21) |

