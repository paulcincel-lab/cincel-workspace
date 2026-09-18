# Phase 4: Report, Export, E2E Tests & Polish

## Goal
The feature is complete: report route with historical snapshots, JSON export, print stylesheet, full E2E test coverage, and accessibility polish.

## Deliverables

### Backend
- [ ] `app/proyectos/[id]/cronograma/reporte/page.tsx` — server-rendered read-only view, all accordions expanded, accepts `?asOf=YYYY-MM-DD` to reproduce a past week's metrics
- [ ] `app/api/proyectos/[id]/cronograma/export/route.ts` — GET endpoint returning JSON in the same shape as the reference file export (`{done, flags, imprevistos, offset, today}`)
- [ ] Authorization check on export endpoint (staff project member)

### Frontend
- [ ] `components/cronograma/cronograma-header.tsx` — wire remaining action buttons: "Exportar" triggers download, "Generar reporte" navigates to report route
- [ ] Print stylesheet for report route (`@media print`: hide nav/sidebar, page breaks between sections)
- [ ] `readOnly` prop wired through all components for report mode and client-role users
- [ ] Component tests: `TaskCard` cycles status and reverts on action failure; `readOnly` disables controls
- [ ] Component tests: `GanttChart`, `ProgressDonut`, `SCurveChart` render correctly against MD22 golden dataset
- [ ] E2E test (Playwright): mark a task in one browser context, reload in a second, see it updated
- [ ] Accessibility audit: all numbers in donut/S-curve present as text in legend, color never sole signal for status/delay

### Infrastructure
- [ ] (none)

## Done Definition
- `/proyectos/{md22}/cronograma/reporte` renders a clean read-only page with all sections visible
- `?asOf=2026-08-20` on the report route shows metrics as of that past date
- `GET /api/proyectos/{md22}/cronograma/export` returns valid JSON matching the legacy export shape
- Print-to-PDF from the report route produces a readable document with no nav/sidebar
- E2E test passes: status change in context A is visible in context B after reload
- No `localStorage` usage anywhere in the feature (verified by grep across all new files)
- All component tests pass
- Screen reader can navigate all sections; status changes are announced

## Parallel work
- BE: report route + export API can run alongside FE: print stylesheet + component tests
- FE: component tests and E2E tests can be developed in parallel

## Phase dependencies
- Requires: Phase 3 (mutations, import — all interactive features must work before testing and reporting)

## Complexity
- Backend: S
- Frontend: M
- Infra: n/a

## Risks
- Print stylesheet may need per-section tuning to avoid awkward page breaks
- `?asOf` requires metrics to work correctly with a pinned historical date — edge cases around tasks that didn't exist at that date
- E2E test reliability depends on server action revalidation timing
