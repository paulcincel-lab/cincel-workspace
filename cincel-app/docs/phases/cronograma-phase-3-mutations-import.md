# Phase 3: Mutations + Import

## Goal
Staff can cycle task status, toggle flags, manage imprevistos, and import/re-import schedules from Excel/CSV or legacy JSON — all changes persist and are visible to other users.

## Deliverables

### Backend
- [ ] `lib/actions/schedule-actions.ts` — all server actions with session authorization:
  - `setTaskStatus(taskId, status, expectedStatus)` — with conflict detection returning `{ conflict: true, current }`
  - `toggleTaskFlag(taskId)` — toggle boolean
  - `addImprevisto(scheduleId, {fecha, texto})` — insert + revalidate
  - `deleteImprevisto(id)` — delete + revalidate
  - `importSchedule(projectId, file)` — parse, diff, preview, commit (transactional)
  - `importLegacyState(scheduleId, json)` — apply status/flag/imprevisto maps by stableKey
- [ ] `lib/cronograma/import/parse-excel.ts` — xlsx/csv parsing via SheetJS, normalize to `NormalizedTask[]` with stableKey computation
- [ ] `lib/cronograma/import/parse-json.ts` — legacy export JSON parsing, stableKey matching, unmatched key reporting
- [ ] `schedule_task_events` audit trail writes on every status change
- [ ] Import diff algorithm: kept (preserve status/flag), new (insert pending), removed (delete with confirmation)
- [ ] File-size guard on import (5 MB limit, review NB #4)
- [ ] Shared `ActionResult<T>` type in `lib/types/schedule.ts` (review NB #2)
- [ ] Import unit tests: moved row, changed date, new row, removed row, duplicate tarea collision rejection
- [ ] Import edge case tests: malformed Excel (wrong columns, empty rows, date format mismatches) (review NB #6)

### Frontend
- [ ] `components/cronograma/task-card.tsx` — interactive: status click cycles `pending -> progress -> done -> pending`, flag toggle, optimistic update with toast on failure/conflict, keyboard support (Space/Enter cycles, F toggles flag), `readOnly` prop disables both controls
- [ ] `components/cronograma/cronograma-view.tsx` — add `useOptimistic` for task status/flag state, recompute metrics on optimistic changes
- [ ] `components/cronograma/imprevistos-panel.tsx` — newest-first list, add form (text + date picker), delete with AlertDialog confirmation, `useOptimistic`
- [ ] `components/cronograma/import-dialog.tsx` — Dialog with two tabs:
  - Tab 1: Excel/CSV upload, preview table showing diff (new/kept/removed counts + removed task list), confirm button
  - Tab 2: Legacy JSON paste/upload, apply with unmatched key report
- [ ] `components/cronograma/cronograma-header.tsx` — wire action buttons: Importar opens ImportDialog, Exportar and Generar reporte as placeholders for Phase 4
- [ ] `aria-label` on status button (`"Estado: en proceso -- clic para marcar realizada"`), `aria-pressed` on flag toggle

### Infrastructure
- [ ] (none)

## Done Definition
- Clicking a task status cycles through the three states, persists to DB, and is visible on page reload
- Clicking a task status in one browser session is visible after reload in a second session
- Conflict detection: if two users change the same task, the second gets a conflict toast and re-syncs
- Flag toggle persists and audit trail records the change
- Adding/deleting an imprevisto persists and list updates optimistically
- Importing an Excel with known MD22 data creates 323 tasks; re-importing with one moved row preserves existing statuses
- Legacy JSON import applies statuses/flags to matching stableKeys and reports unmatched keys
- Import rejects files > 5 MB with a user-facing error
- Import rejects duplicate tarea text within a planta with a clear error message
- Keyboard navigation works on task cards (Space/Enter/F)

## Parallel work
- BE: server actions + import parsing can run alongside FE: interactive TaskCard + ImprevistosPanel + ImportDialog (once types are agreed)
- BE: parse-excel.ts and parse-json.ts can be developed in parallel

## Phase dependencies
- Requires: Phase 2 (read-only view rendering, repository, component shells)

## Complexity
- Backend: L
- Frontend: M
- Infra: n/a

## Risks
- SheetJS parsing may not handle all Excel date formats the client uses (Mexican locale dates)
- Import transaction with large task count (323+) must complete within reasonable time
- Optimistic UI revert on conflict needs careful state management to avoid flicker
