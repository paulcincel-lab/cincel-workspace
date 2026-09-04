# Phase 14: Form Migration — Proveedores + Equipo + Recursos + Clientes

**Status: Done** (2026-09-03). Shipped as PRs #229 (StarRating/PillDropdown/EditableCell), #230 (tiendas), #231 (colaboradores), #232 (contratistas), #233 (equipo), #234 (recursos), #235 (clientes) — plus a same-day follow-up fix, #238, for a Label/Input association bug the clientes e2e spec caught. Every overlay this phase migrated to `Dialog` was later converted to `Sheet` in a subsequent app-wide pass (#242, 2026-09-04) — see Phase 15's addendum below.

## Goal
Replace all raw `<button>`, `<input>`, `<select>`, and `<textarea>` elements in the proveedores, equipo, recursos, and clientes feature areas with shadcn form primitives, continuing the migration from Phase 13. **Expanded scope (added after issue creation):** also close a gap left by Phase 10 — 6 raw custom modal/drawer/dropdown overlays in these same feature areas were never migrated to shadcn `Dialog`/`Sheet`/`Popover`, because Phase 10's scope was defined narrowly around the original `DialogOverlay`-linked files rather than a full-app sweep. Folded into this phase rather than a separate one since the files are identical or adjacent to what's already in scope here.

## Deliverables

### Frontend
- [x] Migrate `components/proveedores/StarRating.tsx` — kept as a plain `<button>` (bare glyph, no padding/border/background); documented inline why shadcn Button doesn't fit (#229)
- [x] Migrate `components/proveedores/PillDropdown.tsx` — internal content (options, add/delete, color picker) migrated to shadcn primitives; the two color-swatch grids kept as plain buttons, documented inline for the same reason as StarRating (#229)
- [x] Migrate `components/proveedores/EditableCell.tsx` — Input/Textarea, confirm/cancel Buttons (#229)
- [x] Migrate `components/equipo/MemberEditorDrawer.tsx` — replaced raw form elements (#233); overlay migrated to `Sheet` (#242)
- [x] Migrate `components/recursos/ResourcesWorkspace.tsx` — replaced raw form elements and its 3 raw `fixed inset-0` overlays (#234); overlays migrated to `Sheet` (#242)
- [x] Migrate `components/recursos/DrivePickerDialog.tsx` — replaced raw form elements (#234); overlay migrated to `Sheet` (#242)
- [x] Migrate `app/proveedores/tiendas/page.tsx` — replaced raw form elements and its overlay (#230); overlay migrated to `Sheet` (#242)
- [x] Migrate `app/proveedores/contratistas/page.tsx` — the multi-select dropdown migrated to `Popover` (#232, deleting its own click-away `useEffect`), `AddContractorModal`'s overlay migrated to `Sheet` (#242)
- [x] Migrate `app/proveedores/colaboradores/page.tsx` — replaced raw form elements and its overlay (#231); overlay migrated to `Sheet` (#242)
- [x] Migrate `app/equipo/EquipoPageClient.tsx` — replaced raw form elements (#233)
- [x] Migrate `app/clientes/[id]/page.tsx` — replaced raw form elements and its side-drawer overlay, migrated straight to `Sheet` (#235); a Label/Input association bug this introduced was caught by `clientes.spec.ts`'s CI run and fixed before merge (see Risks)
- [x] Migrate `app/clientes/ClientesPageClient.tsx` — replaced raw form elements and its side-drawer overlay, migrated straight to `Sheet` (#235)
- [x] Verify all migrated components preserve existing behavior and props — confirmed via `npm run build`, unit suite, and the full E2E suite on every PR

### Backend
- None

### Infrastructure
- None

## Done Definition
- [x] Zero raw `<button>`, `<input>`, `<select>`, or `<textarea>` tags remain in the 12 listed files (excluding StarRating and PillDropdown's color swatches, documented inline)
- [x] Zero raw `fixed inset-0` custom overlays remain in `ResourcesWorkspace.tsx`, `contratistas/page.tsx`, `tiendas/page.tsx`, `colaboradores/page.tsx`, `ClientesPageClient.tsx`, or `clientes/[id]/page.tsx` — all replaced with shadcn overlays (`Dialog` at the time this phase shipped, converted to `Sheet` app-wide in #242)
- [x] `contratistas/page.tsx`'s hand-rolled multi-select dropdown no longer has its own `mousedown`/click-away `useEffect` — deleted in favor of `Popover`'s built-in behavior, same as the `ExportMenu` fix
- [x] Appropriate shadcn variants used throughout (default/outline/ghost/destructive mapped from current Tailwind classes)
- [x] All existing functionality preserved: editable cells, star rating interaction, drawer forms, drive picker search, filter controls, modal/dropdown open-close and click-away behavior
- [x] `npm run build` passes with zero errors
- [x] Existing E2E tests pass without modification — `clientes.spec.ts` needed a small update (native `.selectOption()` → click + role="option", since a shadcn Select is a custom combobox, not a native `<select>`); this is the one exception to "without modification" and was necessary, not incidental

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
- **Realized risk:** a shadcn `<Label>` used as a *sibling* of `Input`/`Select` (rather than wrapping it) needs an explicit `htmlFor`/`id` pair, or it isn't programmatically associated with its control — this silently breaks Playwright's `getByLabel()` (and any assistive-tech user). It broke `clientes.spec.ts`'s CRUD test in CI on the first attempt (30s timeout waiting to fill a field); fixed before merge by adding `id`/`htmlFor` pairs throughout both clientes Sheets. The same latent bug was then found (via a targeted audit, not CI) in `colaboradores/page.tsx` and `contratistas/page.tsx`'s Add-item forms and fixed in a follow-up (#238) — no e2e spec exercised those two forms via `getByLabel`, so it hadn't surfaced yet. Lesson for future form work: when `<Label>` doesn't wrap its control, always pair `htmlFor`/`id` explicitly.
