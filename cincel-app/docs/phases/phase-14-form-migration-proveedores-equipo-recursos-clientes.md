# Phase 14: Form Migration — Proveedores + Equipo + Recursos + Clientes

## Goal
Replace all raw `<button>`, `<input>`, `<select>`, and `<textarea>` elements in the proveedores, equipo, recursos, and clientes feature areas with shadcn form primitives, continuing the migration from Phase 13.

## Deliverables

### Frontend
- [ ] Migrate `components/proveedores/StarRating.tsx` — replace raw `<button>` elements; **note:** stars use buttons in a non-standard rating-widget pattern, verify the shadcn Button wrapper works for this use case or document why a plain `<button>` is acceptable here
- [ ] Migrate `components/proveedores/PillDropdown.tsx` — replace raw form elements
- [ ] Migrate `components/proveedores/EditableCell.tsx` — replace raw form elements
- [ ] Migrate `components/equipo/MemberEditorDrawer.tsx` — replace raw form elements
- [ ] Migrate `components/recursos/ResourcesWorkspace.tsx` — replace raw form elements
- [ ] Migrate `components/recursos/DrivePickerDialog.tsx` — replace raw form elements
- [ ] Migrate `app/proveedores/tiendas/page.tsx` — replace raw form elements
- [ ] Migrate `app/proveedores/contratistas/page.tsx` — replace raw form elements
- [ ] Migrate `app/proveedores/colaboradores/page.tsx` — replace raw form elements
- [ ] Migrate `app/equipo/EquipoPageClient.tsx` — replace raw form elements
- [ ] Migrate `app/clientes/[id]/page.tsx` — replace raw form elements
- [ ] Migrate `app/clientes/ClientesPageClient.tsx` — replace raw form elements
- [ ] Verify all migrated components preserve existing behavior and props

### Backend
- None

### Infrastructure
- None

## Done Definition
- Zero raw `<button>`, `<input>`, `<select>`, or `<textarea>` tags remain in the 12 listed files (excluding elements where shadcn wrapping is technically inappropriate, such as StarRating if documented)
- Appropriate shadcn variants used throughout (default/outline/ghost/destructive mapped from current Tailwind classes)
- All existing functionality preserved: editable cells, star rating interaction, drawer forms, drive picker search, filter controls
- `npm run build` passes with zero errors
- Existing E2E tests pass without modification

## Parallel work
- Proveedores files, equipo files, recursos files, and clientes files can all be migrated in parallel
- No backend coordination needed

## Phase dependencies
- Requires: Phase 12 (shadcn form primitives must be available)
- Can run in parallel with Phase 13 (different feature areas, no file overlap)

## Complexity
- Backend: None
- Frontend: L (12 files; StarRating and EditableCell have non-trivial interaction patterns that need careful migration)
- Infra: None

## Risks
- `StarRating.tsx` uses `<button>` elements as clickable stars with hover/active states — a mechanical swap to shadcn Button may add undesired padding/sizing; the implementer should read the component first and decide if Button is appropriate or if these should remain as styled `<button>` with just a className update
- `EditableCell.tsx` toggles between display and edit modes with inline `<input>` — the shadcn Input must not alter the cell's layout or height when swapped in
- MemberEditorDrawer was migrated to shadcn Sheet in Phase 10; form elements inside must compose correctly with the Sheet
