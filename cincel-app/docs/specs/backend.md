# Spec — Cronograma de Obra (Project Schedule View) — Backend

**Project:** Cincel Workspace portal
**Stack:** Next.js (App Router) · TypeScript · Drizzle ORM · PostgreSQL
**Reference implementation:** `Cronograma_Madrid_22_-_Dashboard.html` (single-file vanilla JS dashboard by Arq. José Ulloa for Casa Madrid 22)
**Status:** Draft v1 — 2026-09-18
**Companion doc:** `docs/specs/frontend.md` (components, state, theming, a11y for this same feature)

---

## 1. Purpose

Port the standalone Madrid 22 cronograma dashboard into a reusable, per-project schedule view inside the Cincel Workspace portal. The reference file is a one-off with data hardcoded in JS and state in `localStorage`; this spec turns it into a **generic, multi-user, database-backed feature** that any Cincel project can use, while preserving the calculations and visual language site staff already know.

### Goals

1. One `Cronograma` view per project, reachable from the project page.
2. Task progress is shared: any staff member marks a task and everyone sees it.
3. All metrics (donut, S-curve, resumen, alertas) computed from the same pure functions as the reference file, so numbers match what the client has been reading.
4. Schedule data is imported, not hand-typed: Excel/CSV import with stable task identity across re-imports.
5. Read-only snapshot ("Generar reporte") survives as a shareable/printable report.

### Non-goals (v1)

- Editing task dates/text in the UI (schedule changes happen in Excel → re-import).
- Dependencies between tasks, critical path, resource leveling.
- Cost tracking beyond the fixed payment calendar percentages.
- Notifications.

---

## 2. Reference behavior to preserve (data + calculations)

Everything below is extracted from the source file and is the contract for parity. The frontend spec's components render these numbers; this doc owns computing them.

### 2.1 Data

| Entity | Fields | Notes |
|---|---|---|
| Task | `id`, `legacyId`, `planta` (`PB`/`PA`), `seccion`, `responsable`, `inicio`, `fin`, `tarea` | 323 tasks in MD22. `id = planta + '-' + djb2(tarea)` so a task keeps its status when rows move in Excel. |
| Status | `null` (pendiente, 0) · `progress` (50%) · `done` (100%) | Stored as a map `taskId → status`. Old boolean `true` normalizes to `done`. |
| Flag | `taskId → true` | "Atención especial" ⚠. |
| Imprevisto | `id`, `fecha`, `texto` | Unplanned work done on site. User-addable/deletable. Seeded list ships with the project. |
| Adicional | `partida`, `items[]` | Quoted optional work (cotización MD22_04). Static, read-only. |
| Payment calendar | `fecha`, `pagado %`, `avance %` | 15 weekly rows, fixed per project ("Calendario de Pagos V1.4"). |
| Week offset | integer | Which week the boards are centered on. Per-user UI state, not project data — lives client-side, not in this backend model. |

Section order and color (fixed palette — full color mapping is in `frontend.md` §6, but the canonical order lives here since it drives `seccionOrder` at import time):

```
Preliminares · Albañilerías · Instalaciones eléctricas · Suministro apagadores y contactos ·
Instalaciones hidrosanitarias · Instalación de gas · Acabados · Carpinterías · Cancelerías y herrerías
```

### 2.2 Calculations (all week-based; week = Monday–Sunday)

Let `total = tasks.length`, `weekEnd = sunday(today)`, `w(t) ∈ {0, 0.5, 1}` the status weight.

| Metric | Formula |
|---|---|
| **Planned (obra)** | `count(t.fin ≤ weekEnd) / total` |
| **Real** | `Σ w(t) / total` — over all tasks, regardless of date |
| **Programado (pagos)** | `avance` of the last payment row with `fecha ≤ weekEnd` |
| **En tiempo** | `Σ w(t) for t.fin ≤ weekEnd / total` |
| **Adelantos** | `Σ w(t) for t.fin > weekEnd / total` |
| **Semanas de retraso/adelanto** | `-(real − compare) / 100 × projectWeeks`, where `projectWeeks = (maxFin − minInicio) / 7d`; `|x| < 0.1` → "En tiempo" |
| **S-curve planned point (week i)** | `count(t.fin ≤ sunday_i) / total` |
| **S-curve real point (week i)** | `Σ w(t) for t.fin ≤ sunday_i / total`, only for weeks ≤ current week (`null` afterward) |
| **S-curve pagos point** | payment row `avance` for `sunday_i` |
| **Atrasadas** | `t.fin < today && w(t) < 1`, sorted by `fin` asc |
| **Tasks in week** | `t.inicio ≤ weekEnd && t.fin ≥ weekStart` |
| **Gantt bar per sección** | `[min(inicio), max(fin)]` of that section's tasks, positioned as % of project span |

Percentages are `Math.round`ed at display time only; the S-curve uses unrounded values.

`lib/metrics.ts` (shared with frontend, see `frontend.md` §4) must have **zero React/DOM/DB imports** — it is the single source of numbers for the view, the report, and any future API/PDF, and all its functions take `(data, today: Date)` so `today` is injected rather than read from `Date.now()`.

---

## 3. Domain model (Drizzle)

The cronograma is **obra-level scheduling**, distinct from the workflow/user `tasks` already in the Cincel schema (which model office work). Do not merge them. A schedule task belongs to a project; an optional FK to a workflow task can be added later if a partida maps to office work.

All tables live in the `core` Postgres schema, like every other entity in this project — use `core.table()` / `core.enum()` from `lib/db/schema/_schema.ts`, not bare `pgTable()`/`pgEnum()`. The auth/identity entity in this project is `staff` (`staff.id`), not `users` — there is no `users` table. Mutable tables get the shared `...stamps` fragment (`createdAt`/`updatedAt` with `$onUpdate`); `...soft` is intentionally omitted from schedule tables because re-import does hard deletes of removed tasks (see §8.1).

```ts
// lib/db/schema/schedule.ts
import { core, stamps } from "./_schema";
import { projects } from "./projects";
import { staff } from "./staff";
import { contacts } from "./contacts";

export const projectSchedules = core.table('project_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(1),          // bumped on each import
  sourceFileName: text('source_file_name'),
  paymentCalendarLabel: text('payment_calendar_label'),     // "Calendario de Pagos V1.4"
  ...stamps,
}, (t) => [uniqueIndex('project_schedules_project_idx').on(t.projectId)]);

export const scheduleTaskStatus = core.enum('schedule_task_status', ['pending', 'progress', 'done']);

export const scheduleTasks = core.table('schedule_tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  scheduleId: uuid('schedule_id').notNull().references(() => projectSchedules.id, { onDelete: 'cascade' }),
  stableKey: text('stable_key').notNull(),      // `${planta}-${djb2(tarea)}` — identity across imports
  legacyId: text('legacy_id'),                  // Excel row id, e.g. "PB-5"
  planta: text('planta').notNull(),             // "PB" | "PA" — free text, not enum (other projects may have more levels)
  seccion: text('seccion').notNull(),
  seccionOrder: integer('seccion_order').notNull(),
  responsable: text('responsable'),
  responsableContactId: uuid('responsable_contact_id').references(() => contacts.id), // intentionally a bare FK, not the composite (id, type) pattern used for projects.clientId — the responsable can be any contact type, so it isn't constrained to one
  inicio: date('inicio').notNull(),
  fin: date('fin').notNull(),
  tarea: text('tarea').notNull(),
  status: scheduleTaskStatus('status').notNull().default('pending'),
  flagged: boolean('flagged').notNull().default(false),
  statusUpdatedAt: timestamp('status_updated_at', { withTimezone: true }),
  statusUpdatedBy: uuid('status_updated_by').references(() => staff.id),
  sortOrder: integer('sort_order').notNull(),
  ...stamps,
}, (t) => [uniqueIndex('schedule_tasks_key_idx').on(t.scheduleId, t.stableKey)]);

export const schedulePaymentRows = core.table('schedule_payment_rows', {
  id: uuid('id').primaryKey().defaultRandom(),
  scheduleId: uuid('schedule_id').notNull().references(() => projectSchedules.id, { onDelete: 'cascade' }),
  fecha: date('fecha').notNull(),
  pagadoPct: numeric('pagado_pct', { precision: 5, scale: 2 }).notNull(),
  avancePct: numeric('avance_pct', { precision: 5, scale: 2 }).notNull(),
}, (t) => [index('idx_schedule_payment_rows_schedule_fecha').on(t.scheduleId, t.fecha)]);

export const scheduleImprevistos = core.table('schedule_imprevistos', {
  id: uuid('id').primaryKey().defaultRandom(),
  scheduleId: uuid('schedule_id').notNull().references(() => projectSchedules.id, { onDelete: 'cascade' }),
  fecha: date('fecha').notNull(),
  texto: text('texto').notNull(),
  createdBy: uuid('created_by').references(() => staff.id),
  ...stamps,
}, (t) => [index('idx_schedule_imprevistos_schedule_id').on(t.scheduleId)]);

export const scheduleAdicionales = core.table('schedule_adicionales', {
  id: uuid('id').primaryKey().defaultRandom(),
  scheduleId: uuid('schedule_id').notNull().references(() => projectSchedules.id, { onDelete: 'cascade' }),
  partida: text('partida').notNull(),
  items: text('items').array().notNull(),   // Postgres text[], simpler and more queryable than jsonb for a flat string list
  quoteRef: text('quote_ref'),   // "MD22_04 · Adicionales 01"
  sortOrder: integer('sort_order').notNull(),
});

// Audit trail for status changes (drives "who marked what, when"). Not FK'd to
// scheduleTasks with onDelete:'cascade' — a re-import that removes a task must
// not silently destroy its history. taskId is nullable and left dangling
// (no FK) once its task is deleted by an import; stableKey is kept alongside
// it so history remains attributable even after the task row is gone.
export const scheduleTaskEvents = core.table('schedule_task_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  taskId: uuid('task_id'),
  taskStableKey: text('task_stable_key').notNull(),
  from: scheduleTaskStatus('from').notNull(),
  to: scheduleTaskStatus('to').notNull(),
  userId: uuid('user_id').references(() => staff.id),
  at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
});
```

**Decisions**

- `stableKey` reproduces the reference hash exactly (djb2, `>>> 0`, base36) so the existing MD22 export JSON can be imported 1:1.
- `status` and `flagged` live on the task row (not a separate map). Simpler queries; the events table gives history.
- Payment calendar is per-schedule rows, not a JSON blob, so it can be queried for the S-curve and edited by an admin later.
- Week offset stays client-side (URL search param `?week=-1`), never persisted (see `frontend.md` §7).
- Schema follows the project-wide `core` Postgres schema convention (`core.table()`/`core.enum()`) and reuses the shared `stamps` fragment — see `lib/db/schema/_schema.ts`.
- Server code follows the existing actions/repository pattern (`lib/actions/`, `lib/repositories/`), not a bespoke `server/` directory — see §4.
- Migration rollback: all six tables are new and additive, so a rollback is a straight `DROP TABLE` in FK-dependency order (`schedule_task_events`, `schedule_adicionales`, `schedule_imprevistos`, `schedule_payment_rows`, `schedule_tasks`, `project_schedules`) — no existing table is altered, so this feature carries no rollback risk to the rest of the schema.

---

## 4. Server module layout

Follows the project's existing actions/repository pattern (`lib/actions/`, `lib/repositories/`) rather than a bespoke `server/` directory, and the flat `lib/` / `app/` / `components/` root — this project has no `src/` or `features/` directory.

```
lib/
  db/schema/schedule.ts              Drizzle schema — all schedule_* tables (§3)
  actions/schedule-actions.ts        setTaskStatus, toggleTaskFlag, addImprevisto, deleteImprevisto,
                                      importSchedule, importLegacyState — session-authorized, per project convention
  repositories/schedule-repository.ts getScheduleForProject(projectId) → CronogramaData (one round trip, all tables)
  cronograma/
    week.ts            mondayOf, addDays, isoDate, weekBounds, fmtRange, fmtShort (Spanish months)
    hash.ts            djb2 → stableKey
    metrics.ts         PURE: computeProgress, computeSCurve, computeResumen, computeAlertas, tasksInRange, ganttBySeccion
    sections.ts        SECTION_ORDER (canonical order); SECTION_COLOR lives here too, consumed by frontend.md's theming section
    import/
      parse-excel.ts   xlsx/csv → NormalizedTask[]
      parse-json.ts    legacy export JSON → status/flag/imprevisto maps
  types/schedule.ts    shared types (§5)
app/
  proyectos/[id]/cronograma/
    page.tsx           server component → <CronogramaView data /> (frontend.md owns this component)
    reporte/page.tsx   read-only snapshot (see §7 below)
  api/proyectos/[id]/cronograma/export/route.ts   GET export (see §7)
```

`lib/cronograma/metrics.ts`, `week.ts`, `hash.ts`, `sections.ts`, and `lib/types/schedule.ts` are shared with the frontend (imported directly, not duplicated) — see `frontend.md` §4 for how the client composition root consumes them.

---

## 5. Types (shared with frontend)

```ts
export type ScheduleStatus = 'pending' | 'progress' | 'done';

export interface ScheduleTask {
  id: string; stableKey: string; legacyId: string | null;
  planta: string; seccion: string; responsable: string | null;
  inicio: string; fin: string;            // ISO date YYYY-MM-DD
  tarea: string; status: ScheduleStatus; flagged: boolean;
}
export interface PaymentRow { fecha: string; pagadoPct: number; avancePct: number }
export interface Imprevisto { id: string; fecha: string; texto: string }
export interface Adicional { partida: string; items: string[] }

export interface CronogramaData {
  project: { id: string; name: string; address: string | null };
  schedule: { id: string; version: number; paymentCalendarLabel: string | null };
  tasks: ScheduleTask[];
  payments: PaymentRow[];
  imprevistos: Imprevisto[];
  adicionales: Adicional[];
}

export interface ProgressMetrics {
  total: number; plannedCount: number; plannedPct: number;
  doneCount: number; progressCount: number; realPct: number;
  pagosAvancePct: number; pagosPagadoPct: number;
  onTimePct: number; aheadPct: number;
  projectWeeks: number;
  delayVsObra: GapStatus; delayVsPagos: GapStatus;
}
export type GapStatus = { kind: 'onTime' } | { kind: 'late' | 'ahead'; weeks: number };
export interface SCurvePoint { weekStart: string; planned: number; real: number | null; pagos: number }
```

---

## 6. Data flow & authorization (server side)

```
page.tsx (RSC)
  └─ getScheduleForProject(projectId)  ── one query, joins 5 tables ──▶ CronogramaData
       └─ <CronogramaView data today={serverNow} />   (client — see frontend.md)
```

- **Single read, client-side recompute.** Metrics are cheap (323 tasks × ~15 weeks); the client recomputes on optimistic state rather than round-tripping (see `frontend.md` §7).
- **Concurrency.** Last-write-wins on status is acceptable for v1. Actions accept `expectedStatus`; if the DB row differs, return `{ conflict: true, current }` and the client re-syncs instead of overwriting. Cheap to add, avoids two foremen fighting.
- **Authorization.** Any project member with `staff` role can change status/flags/imprevistos. Client-role users (see CRM contact types) get the read-only variant — same component, `readOnly` prop, identical to report mode.
- **`today`** is computed on the server in the project's timezone (`America/Mexico_City`) and passed down; the client does not use its own clock. This is what makes the numbers identical for everyone.

---

## 7. Report / export (server routes)

- **`/proyectos/[id]/cronograma/reporte`** — server-rendered, `readOnly`, print stylesheet (`@media print`: no nav, one section per page break where sensible). Accepts `?asOf=YYYY-MM-DD` to reproduce a past week. This replaces "Generar reporte" (the cloned-HTML snapshot).
- **Exportar** — `GET /api/proyectos/[id]/cronograma/export` returns the same JSON shape the reference file exports (`{done, flags, imprevistos, offset, today}`), so the client can keep using the old dashboard offline if they insist.
- **PDF** — out of scope v1; print-to-PDF from the report route is sufficient.

---

## 8. Import

### 8.1 Schedule (Excel/CSV)

Expected columns (header names case-insensitive, Spanish): `ID`, `Planta`, `Partida/Sección`, `Responsable`, `Inicio`, `Fin`, `Tarea`. Parsing with `xlsx` (SheetJS) on the server.

Algorithm:
1. Normalize rows → `NormalizedTask[]`; compute `stableKey`.
2. Diff against existing `schedule_tasks` by `stableKey`:
   - **kept**: update dates/section/responsable/order, **preserve status & flag**;
   - **new**: insert as `pending`;
   - **removed**: delete (show count in preview; require confirmation).
3. Bump `project_schedules.version`, store `sourceFileName`.
4. Wrap in one transaction.

Preview payload (rendered by `ImportDialog` in `frontend.md`) returns the three counts and the list of removed tasks before commit.

### 8.2 Legacy state (JSON from the old dashboard)

`{ done: {stableKey: 'done'|'progress'|true}, flags: {stableKey: true}, imprevistos: [...] }` → apply to matching `stableKey`s; report unmatched keys. This is the one-time migration path for MD22.

### 8.3 Seed for Madrid 22

A script `scripts/seed-madrid22.ts` that reads the reference HTML, extracts `RAW_DEFAULT_TASKS`, `RAW_PAGOS_CALENDAR`, `RAW_DEFAULT_IMPREVISTOS`, `ADICIONALES_DATA` and inserts them for the MD22 project. Used once, then the client's exported JSON is applied via §8.2.

---

## 9. Testing (backend)

- **Unit (`lib/metrics.ts`)** — golden tests using the MD22 dataset frozen at three dates (2026-07-15, 2026-08-20, 2026-09-18). Expected values are taken from the reference file run at those dates (patch `TODAY`). Any drift fails the build.
- **Unit (`hash.ts`)** — `djb2` matches the reference for a sample of 20 task strings including accented characters.
- **Import** — diff cases: moved row, changed date, new row, removed row, duplicate `tarea` text within a planta (collision → reject import with a clear error).
- **E2E (Playwright)** — mark a task in one browser context, reload in a second, see it updated (exercises server actions + `getScheduleForProject`).

---

## 10. Acceptance criteria (backend-relevant)

1. Opening `/proyectos/{md22}/cronograma` on 2026-09-18 shows the same planned %, programado %, real %, en tiempo %, adelantos %, and delay labels as the reference HTML with the client's latest exported state imported.
2. Status and flag changes persist and are visible to another user without file exchange.
3. Re-importing the Excel with moved rows keeps existing statuses.
4. Report route prints cleanly and accepts `?asOf`.
5. No `localStorage` usage anywhere in the feature.

---

## 11. Open questions

1. Should `responsable` map to CRM `contacts` at import time (by name match), or stay free text until someone links it manually? Recommendation: free text + optional manual link; auto-matching by name will misfire ("Chava").
2. Does the payment calendar belong to the schedule or to a future `quotes`/`cotizaciones` entity? For v1 it hangs off the schedule; revisit when cotizaciones are modeled.
3. Should clients (external contacts with portal access) see the imprevistos/adicionales panels? Default: yes, read-only — that's the point of the report today.
