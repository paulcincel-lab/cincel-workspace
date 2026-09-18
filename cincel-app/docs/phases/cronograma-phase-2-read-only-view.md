# Phase 2: Read-Only View

## Goal
Navigating to `/proyectos/{id}/cronograma` renders the full schedule dashboard (Gantt, donut, S-curve, week boards, alertas, resumen, adicionales) from real database data — read-only, no mutations yet.

## Deliverables

### Backend
- [ ] `lib/repositories/schedule-repository.ts` — `getScheduleForProject(projectId)` returning `CronogramaData` in one query with joins across all five data tables
- [ ] `app/proyectos/[id]/cronograma/page.tsx` — server component that calls the repository and passes data + server `today` (America/Mexico_City) to the client component

### Frontend
- [ ] `components/cronograma/cronograma-view.tsx` — client composition root, receives `CronogramaData` + `today`, computes all metrics via `useMemo` calling shared `metrics.ts`
- [ ] `components/cronograma/cronograma-header.tsx` — project name, address, week navigation (`?week=` search param), "Hoy" reset button (action buttons placeholder, no handlers yet)
- [ ] `components/cronograma/gantt-chart.tsx` — SVG/CSS-grid Gantt by seccion with month ticks and today line, section colors from `sections.ts`, horizontal scroll on mobile
- [ ] `components/cronograma/progress-donut.tsx` — triple-ring SVG donut (planned/pagos/real) with center real %, legend with Badge dots
- [ ] `components/cronograma/s-curve-chart.tsx` — SVG polyline x3, gridlines, month labels, today marker
- [ ] `components/cronograma/week-boards.tsx` — three columns (prev/current/next week), stacked on mobile with current week first, HOY badge on current week column
- [ ] `components/cronograma/task-card.tsx` — read-only in this phase: shows status icon + text, flag indicator, task meta; no click handlers yet
- [ ] `components/cronograma/alertas-panel.tsx` — atrasadas + atencion especial groups using TaskCard, empty states
- [ ] `components/cronograma/resumen-cards.tsx` — two summary cards with formula rows, delay labels colored appropriately
- [ ] `components/cronograma/adicionales-panel.tsx` — grouped accordion list, read-only

### Infrastructure
- [ ] (none)

## Done Definition
- `/proyectos/{md22}/cronograma` renders all 9 sections from the spec with real seeded MD22 data
- Planned %, programado %, real % values match the reference HTML output for the same dataset and date
- Week navigation changes the board columns and S-curve today marker correctly
- Gantt bars are colored per section and positioned proportionally to project span
- Mobile: boards stack (current week first), Gantt scrolls horizontally
- No console errors, no layout shifts

## Parallel work
- BE: repository + server page can run alongside FE: all display components (once types and metrics from Phase 1 are merged)
- FE: Gantt, donut, S-curve, boards, alertas, resumen, adicionales components can all be developed in parallel since they consume the same `CronogramaData` + metrics output

## Phase dependencies
- Requires: Phase 1 (schema, migration, types, metrics, seed data)

## Complexity
- Backend: S
- Frontend: L
- Infra: n/a

## Risks
- SVG chart rendering (Gantt, donut, S-curve) may require iteration to match reference visual fidelity
- Mobile responsive layout for the three-column board needs careful testing
- S-curve with hand-drawn SVG polylines requires correct scaling against dynamic week ranges
