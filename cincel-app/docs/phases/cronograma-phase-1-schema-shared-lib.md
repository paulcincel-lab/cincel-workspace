# Phase 1: Schema + Shared Library

## Goal
All six schedule tables exist in Postgres with a working migration, shared pure-function library computes correct metrics, and the MD22 seed script can populate a project's schedule.

## Deliverables

### Backend
- [ ] `lib/db/schema/schedule.ts` — all six tables (`project_schedules`, `schedule_tasks`, `schedule_payment_rows`, `schedule_imprevistos`, `schedule_adicionales`, `schedule_task_events`) with `core.table()`/`core.enum()`, `stamps` on mutable tables
- [ ] Add `...stamps` to `scheduleAdicionales` and `schedulePaymentRows` (review NB #1 — cheap now, avoids migration later)
- [ ] Add `index('idx_schedule_task_events_stable_key').on(t.taskStableKey)` to `scheduleTaskEvents` (review NB #3)
- [ ] Drizzle migration generated and tested (`npx drizzle-kit generate` + `npx drizzle-kit migrate`)
- [ ] `lib/types/schedule.ts` — all shared types (`ScheduleStatus`, `ScheduleTask`, `PaymentRow`, `Imprevisto`, `Adicional`, `CronogramaData`, `ProgressMetrics`, `GapStatus`, `SCurvePoint`)
- [ ] `lib/cronograma/hash.ts` — djb2 hash matching reference implementation
- [ ] `lib/cronograma/week.ts` — `mondayOf`, `addDays`, `isoDate`, `weekBounds`, `fmtRange`, `fmtShort`
- [ ] `lib/cronograma/sections.ts` — `SECTION_ORDER`, `SECTION_COLOR`
- [ ] `lib/cronograma/metrics.ts` — all pure functions: `computeProgress`, `computeSCurve`, `computeResumen`, `computeAlertas`, `tasksInRange`, `ganttBySeccion` (zero React/DOM/DB imports)
- [ ] `scripts/seed-madrid22.ts` — extract and insert MD22 data for one project
- [ ] Unit tests for `metrics.ts` — golden tests at three dates (2026-07-15, 2026-08-20, 2026-09-18)
- [ ] Unit tests for `hash.ts` — djb2 parity with reference for 20 sample strings

### Frontend
- [ ] (none — no UI in this phase)

### Infrastructure
- [ ] Schema barrel export updated (`lib/db/schema/index.ts`)
- [ ] Drizzle config includes new schema file

## Done Definition
- `npx drizzle-kit migrate` succeeds and all six tables exist in the `core` schema
- `seed-madrid22.ts` inserts 323 tasks, 15 payment rows, imprevistos, and adicionales for an existing project
- `metrics.ts` golden tests pass at all three dates with values matching the reference HTML
- `hash.ts` tests pass for all 20 sample strings
- `metrics.ts` has zero React/DOM/DB imports (verified by grep)

## Parallel work
- `lib/cronograma/` pure functions (hash, week, metrics, sections) can be developed independently of the schema/migration work
- `lib/types/schedule.ts` types can be written alongside schema since they mirror the same domain model

## Phase dependencies
- Requires: none (additive tables, no existing schema changes)

## Complexity
- Backend: M
- Frontend: n/a
- Infra: S

## Risks
- djb2 hash must exactly match reference implementation including `>>> 0` and base36 encoding, otherwise MD22 legacy import won't match stable keys
- Accented characters in task names may cause hash mismatches if encoding differs
