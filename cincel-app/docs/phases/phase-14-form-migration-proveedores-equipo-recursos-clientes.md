# Phase 14: Form Migration — Proveedores + Equipo + Recursos + Clientes

## Goal
Replace all raw `<button>`, `<input>`, `<select>`, and `<textarea>` elements in the proveedores, equipo, recursos, and clientes feature areas with shadcn form primitives, continuing the migration from Phase 13. **Expanded scope (added after issue creation):** also close a gap left by Phase 10 — 6 raw custom modal/drawer/dropdown overlays in these same feature areas were never migrated to shadcn `Dialog`/`Sheet`/`Popover`, because Phase 10's scope was defined narrowly around the original `DialogOverlay`-linked files rather than a full-app sweep. Folded into this phase rather than a separate one since the files are identical or adjacent to what's already in scope here.

## Deliverables

### Frontend
- [ ] Migrate `components/proveedores/StarRating.tsx` — replace raw `<button>` elements; **note:** stars use buttons in a non-standard rating-widget pattern, verify the shadcn Button wrapper works for this use case or document why a plain `<button>` is acceptable here
- [ ] Migrate `components/proveedores/PillDropdown.tsx` — replace raw form elements
- [ ] Migrate `components/proveedores/EditableCell.tsx` — replace raw form elements
- [ ] Migrate `components/equipo/MemberEditorDrawer.tsx` — replace raw form elements
- [ ] Migrate `components/recursos/ResourcesWorkspace.tsx` — replace raw form elements **and** its 3 raw `fixed inset-0` overlays (2 centered modals + 1 plain overlay) to shadcn `Dialog`
- [ ] Migrate `components/recursos/DrivePickerDialog.tsx` — replace raw form elements
- [ ] Migrate `app/proveedores/tiendas/page.tsx` — replace raw form elements **and** its raw centered-modal overlay to shadcn `Dialog`
- [ ] Migrate `app/proveedores/contratistas/page.tsx` — replace raw form elements **and** two raw overlays: a hand-rolled multi-select dropdown (own `fixed inset-0` click-away backdrop, duplicate of the pattern already fixed in `PillDropdown.tsx`/`ExportMenu.tsx`) to shadcn `Popover`, and `AddContractorModal`'s centered-modal overlay to shadcn `Dialog`
- [ ] Migrate `app/proveedores/colaboradores/page.tsx` — replace raw form elements **and** its raw centered-modal overlay to shadcn `Dialog`
- [ ] Migrate `app/equipo/EquipoPageClient.tsx` — replace raw form elements
- [ ] Migrate `app/clientes/[id]/page.tsx` — replace raw form elements **and** its raw side-drawer overlay (`flex justify-end`) to shadcn `Sheet`
- [ ] Migrate `app/clientes/ClientesPageClient.tsx` — replace raw form elements **and** its raw side-drawer overlay (`flex justify-end`) to shadcn `Sheet`
- [ ] Verify all migrated components preserve existing behavior and props

### Backend
- None

### Infrastructure
- None

## Done Definition
- Zero raw `<button>`, `<input>`, `<select>`, or `<textarea>` tags remain in the 12 listed files (excluding elements where shadcn wrapping is technically inappropriate, such as StarRating if documented)
- Zero raw `fixed inset-0` custom overlays remain in `ResourcesWorkspace.tsx`, `contratistas/page.tsx`, `tiendas/page.tsx`, `colaboradores/page.tsx`, `ClientesPageClient.tsx`, or `clientes/[id]/page.tsx` — all replaced with shadcn `Dialog`/`Sheet`/`Popover`
- `contratistas/page.tsx`'s hand-rolled multi-select dropdown no longer has its own `mousedown`/click-away `useEffect` — deleted in favor of `Popover`'s built-in behavior, same as the `ExportMenu` fix
- Appropriate shadcn variants used throughout (default/outline/ghost/destructive mapped from current Tailwind classes)
- All existing functionality preserved: editable cells, star rating interaction, drawer forms, drive picker search, filter controls, modal/dropdown open-close and click-away behavior
- `npm run build` passes with zero errors
- Existing E2E tests pass without modification

## Parallel work
- Proveedores files, equipo files, recursos files, and clientes files can all be migrated in parallel
- Within a single file, the overlay migration (Dialog/Sheet/Popover) and the plain form-primitive migration can be done together in one pass, since the overlay's own contents are exactly the raw form elements also being migrated
- No backend coordination needed

## Phase dependencies
- Requires: Phase 12 (shadcn form primitives must be available)
- Requires: Phase 10's shadcn `dialog.tsx`/`sheet.tsx` primitives and Phase 11's `popover.tsx` (all already merged) for the added overlay-migration scope
- Can run in parallel with Phase 13 (different feature areas, no file overlap)

## Complexity
- Backend: None
- Frontend: L (12 files; StarRating and EditableCell have non-trivial interaction patterns that need careful migration; 6 of the 12 files also need an overlay migration, not just form primitives)
- Infra: None

## Risks
- `StarRating.tsx` uses `<button>` elements as clickable stars with hover/active states — a mechanical swap to shadcn Button may add undesired padding/sizing; the implementer should read the component first and decide if Button is appropriate or if these should remain as styled `<button>` with just a className update
- `EditableCell.tsx` toggles between display and edit modes with inline `<input>` — the shadcn Input must not alter the cell's layout or height when swapped in
- MemberEditorDrawer was migrated to shadcn **Dialog** in Phase 10 (not Sheet — despite its name it renders as a centered modal, confirmed when Phase 10 actually read the file); form elements inside must compose correctly with Dialog, not Sheet — a prior draft of this doc had this wrong
- The `DataTable`→shadcn-`Table` migration (Phase 15, PR #227) revealed that a floating layer needing only a higher `z-index` can still lose a real browser stacking-context contest against a sibling that becomes `position: relative` — go straight to a portaled primitive (`Popover`/`Dialog`/`Sheet`) for every overlay in this phase rather than patching a raw `fixed`/`absolute` div with a bigger z-index; it looked like the fix in CI and wasn't
- `contratistas/page.tsx`'s dropdown and `AddContractorModal` are two separate overlays in the same file — migrate both, don't miss the second while focused on the first
