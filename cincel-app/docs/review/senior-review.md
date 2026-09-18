VERDICT: APPROVED

---

## Blocking Issues

None.

Previous blocking issues (residual English `/projects/` routes in 3 locations, stale `features/cronograma/types.ts` import path) were all fixed in commit b90de80.

---

## Non-Blocking Issues

1. **`scheduleAdicionales` and `schedulePaymentRows` lack `...stamps`.** Both are import-only and read-only in v1, so this is not blocking, but adding `createdAt` now avoids a migration later if edit support is added.

2. **No structured error types for server actions.** The specs describe conflict handling (`{ conflict: true, current }`) and import rejection (duplicate `tarea` collision) but do not define a shared error/result union type in `lib/types/schedule.ts`. Implementers will invent ad-hoc shapes. Consider adding an `ActionResult<T>` type.

3. **`scheduleTaskEvents` has no index on `taskStableKey`.** History queries by stable key (after a task is deleted by re-import) will table-scan. Low volume in v1 but worth adding.

4. **No rate limit or file-size guard on the import endpoint.** Excel parsing with SheetJS on large files is CPU-bound. Not critical for an internal tool, but a file-size guard (e.g., 5 MB) would be prudent.

5. **Timezone constant not configurable per project.** `today` is hardcoded to `America/Mexico_City`. Adequate for v1 since all current projects are in Mexico City, but if the app later supports projects in other timezones, this becomes a buried assumption.

6. **Import error/edge case test coverage.** Backend.md section 9 covers the happy-path import diff. Missing: malformed Excel (wrong columns, empty rows, date format mismatches), oversized files.

---

## Previous Blocking Issues -- Resolution Status

| # | Issue | Status |
|---|---|---|
| 1 | `pgTable` -> `core.table()` | RESOLVED |
| 2 | `users.id` -> `staff.id` | RESOLVED |
| 3 | `pgEnum` -> `core.enum()` | RESOLVED |
| 4 | Missing `stamps`/`soft` fragments | RESOLVED (soft omission documented) |
| 5 | `src/features/` layout | RESOLVED |
| 6 | English routes | RESOLVED (b90de80) |
| 7 | Bare FK to `contacts.id` | RESOLVED (documented as intentional) |
| 8 | Stale `features/` import path | RESOLVED (b90de80) |

---

## API Contract Diff

```
  getScheduleForProject(projectId) -> CronogramaData        -- both specs, shapes aligned
  setTaskStatus(taskId, status, expectedStatus)              -- both specs, aligned
  toggleTaskFlag(taskId)                                     -- both specs, aligned
  addImprevisto(scheduleId, {fecha, texto})                  -- both specs, aligned
  deleteImprevisto(id)                                       -- both specs, aligned
  importSchedule(projectId, file)                            -- both specs, aligned
  importLegacyState(scheduleId, json)                        -- both specs, aligned
  GET /api/proyectos/[id]/cronograma/export                  -- both specs, aligned
  /proyectos/[id]/cronograma/reporte?asOf=                   -- both specs, aligned
```

No mismatches.

---

## Data Model Review

```
  project_schedules       -- complete; core.table, stamps, unique index on projectId
  schedule_tasks          -- complete; core.table, stamps, composite unique on (scheduleId, stableKey)
  schedule_payment_rows   -- complete; core.table, composite index on (scheduleId, fecha)
  schedule_imprevistos    -- complete; core.table, stamps, index on scheduleId
  schedule_adicionales    -- complete; core.table, text[] for items
  schedule_task_events    -- complete; bare taskId (no FK) preserves audit on re-import delete
```

All tables use `core.table()`/`core.enum()`. Auth references `staff.id`. No missing tables or dangling FKs.

---

## Frontend Architecture Notes

- No store introduced -- `useOptimistic` + `useMemo` for client state is appropriate for single-page recompute over ~323 tasks.
- Week offset in URL search params (`?week=`), not persisted server-side. Clean.
- Shared `lib/cronograma/metrics.ts` has zero React/DOM/DB imports -- enforced by both specs.
- `readOnly` prop gates all mutations, reused for both client-role users and the report route. No auth gap.
- No TanStack Query -- server actions + `revalidatePath` is the data-refresh pattern, consistent with the portal.
- Import path reference in section 5 now correctly points to `lib/types/schedule.ts`.

---

## Backend Architecture Notes

- Actions/repository split follows existing project pattern correctly.
- Pure-function metrics module shared between server and client is well-designed.
- Import algorithm with stable key identity (djb2 hash) is sound.
- Audit trail decoupled from task FK (bare `taskId` + `taskStableKey`) solves the cascade-delete problem cleanly.
- Rollback plan documented: additive-only migration, straight `DROP TABLE` in FK order.
- Single-query repository (`getScheduleForProject`) with joins -- no N+1.
- `today` computed server-side in project timezone and passed to client -- eliminates clock drift.

---

## Recommended Edits

No blocking edits required. For non-blocking items, implementers can address during build:

**NB #1 (stamps on read-only tables):** Add `...stamps` to `scheduleAdicionales` and `schedulePaymentRows` in the schema definition if edit support is planned for v2.

**NB #3 (index on events):** Add `index('idx_schedule_task_events_stable_key').on(t.taskStableKey)` to `scheduleTaskEvents` table definition.
