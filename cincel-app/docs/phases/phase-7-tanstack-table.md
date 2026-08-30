# Phase 7: TanStack Table Adoption

## Goal
Replace all hand-rolled record tables with a single reusable `DataTable` component backed by `@tanstack/react-table`, adding column sorting to every data table in the app.

## Deliverables

### Backend
- (none — pure frontend phase)

### Frontend
- [ ] Add `@tanstack/react-table` v8 dependency
- [ ] Create `components/ui/DataTable.tsx` — generic component accepting `columns: ColumnDef<T>[]`, `data: T[]`, with sticky header, zebra/hover rows, empty state, loading state, row click / row actions slot, built-in sort (asc/desc/none with indicator icon) and text-filter input
- [ ] Unit test covering column-def to rendered-header to sort-toggle path
- [ ] Migrate `ProjectsTable.tsx` to `DataTable`
- [ ] Migrate `PresaleTable.tsx` + `TareasPageClient.tsx` to `DataTable`
- [ ] Migrate `EquipoPageClient.tsx` to `DataTable`
- [ ] Migrate `ClientesPageClient.tsx` to `DataTable`
- [ ] Migrate `app/proveedores/{colaboradores,contratistas,tiendas}/page.tsx` to `DataTable`
- [ ] Migrate `components/dashboard/TasksTable.tsx` + `InteractiveDashboard.tsx` tables to `DataTable`

### Infrastructure
- (none)

## Done Definition
- `DataTable` component exists and renders any `ColumnDef[]` + `data[]` with clickable sort headers
- Every in-scope page renders its table via `DataTable` instead of raw `<table>` JSX
- All existing page behavior preserved: filters, row actions, drawers/modals, edit-in-place inputs
- Column sorting (asc/desc/none) works on every migrated table
- No regressions in out-of-scope pages (UnifiedCalendar, PermissionsWorkspace untouched)

## Parallel work
- Phase 1 (DataTable component) must land first
- Phase 2 page migrations are all independent of each other — all 6 migration issues can run in parallel once DataTable ships

## Phase dependencies
- Requires: none (pure frontend, no backend or schema changes)
- Independent of Phase 8 (assistant widgets) — no shared files

## Complexity
- Backend: -
- Frontend: M (component is straightforward; bulk of work is 6 parallel page migrations, each small)
- Infra: -

## Risks
- Pages with complex in-table interactions (edit-in-place, inline drawers) may need DataTable escape hatches or render-prop columns — resolve per page during migration
- Existing filter dropdowns (status, area) may need to stay as page-level controls rather than TanStack column filters depending on UX fit
