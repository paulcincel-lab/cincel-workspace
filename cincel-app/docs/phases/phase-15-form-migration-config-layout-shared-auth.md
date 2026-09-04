# Phase 15: Form Migration — Config + Layout + Shared UI + Auth Pages

**Status: Done** (2026-09-04). Shipped as PRs #236 (auth pages), #237 (configuracion), #239 (layout), #240 (shared UI), #241 (feature components — the last Phase 15 issue). `DataTable.tsx` was migrated separately and earlier, as #227, alongside the `ExportMenu` stacking-context fix (see Addendum below) — its own deliverable line here is satisfied by that PR. Post-phase repo-wide grep confirmed zero raw `<button>`/`<input>`/`<select>`/`<textarea>` outside `components/ui/shadcn/`, with two deliberate documented exceptions (StarRating, PillDropdown color swatches — see Phase 14).

## Addendum: Dialog → Sheet, app-wide (2026-09-04, PR #242)
Not part of this phase's original scope, but a direct follow-up once Phase 15 closed: the app had accumulated 12 `Dialog` (centered modal) usages against 3 `Sheet` (slide-in drawer) usages, with no real design rule distinguishing them — the largest form in the app (`MemberEditorDrawer`, 25 fields) was a `Dialog` while smaller forms were `Sheet`s. Per explicit direction, every remaining `Dialog` was converted to `Sheet` and the `Dialog` primitive (`components/ui/shadcn/dialog.tsx`) was deleted — there is now exactly one overlay pattern for a form/drawer in this codebase. This also surfaced and fixed a real bug: `Sheet`'s base `w-[560px]` always wins over a `max-w-*` override (they don't conflict in tailwind-merge — width beats max-width when width is smaller), so `ClientesPageClient`'s and `clientes/[id]/page.tsx`'s Sheets had silently been rendering at 560px since Phase 14 despite a `max-w-2xl` class; fixed with an explicit `w-[672px]` override.

## Goal
Complete the raw-HTML-to-shadcn form migration by replacing all remaining raw `<button>`, `<input>`, `<select>`, and `<textarea>` elements across configuration, layout, dashboard, calendar, assistant, shared UI components, and authentication pages.

## Deliverables

### Frontend
- [x] Migrate `components/configuracion/PermissionsWorkspace.tsx` — Select, Switch (new primitive, added this PR), Button (#237)
- [x] Migrate `components/configuracion/GeneralSettingsWorkspace.tsx` — Input, Select, Switch, Button (#237)
- [x] Migrate `components/calendario/UnifiedCalendar.tsx` — nav/view-toggle/day-cell Buttons, filter Selects (#241)
- [x] Migrate `components/asistente/AssistantChat.tsx` — Textarea keeps its exact onKeyDown (Enter sends, Shift/Alt/Ctrl/Meta+Enter newline); Button for actions (#241)
- [x] Migrate `components/dashboard/InteractiveDashboard.tsx` — 5 filter Selects, Restablecer Button (#241)
- [x] Migrate `components/layout/Sidebar.tsx` — nav-group toggle to Button variant="ghost", active-state color preserved via className (#239)
- [x] Migrate `components/layout/Header.tsx` — profile-photo menu, Cerrar sesion, Editar links popover -> Button/Input (#239)
- [x] Migrate `components/ui/TeamMultiSelect.tsx` — pill/option Buttons, search Input (#240)
- [x] Migrate `components/ui/InlineEditable.tsx` — display-mode trigger -> Button variant="ghost" with h-auto/p-0 to avoid layout shift (#240)
- [x] Migrate `components/ui/ExportMenu.tsx` — already done pre-Phase-15, as part of the DataTable/stacking-context fix (#227)
- [x] Migrate `components/ui/DataTable.tsx` — migrated to the shadcn Table primitive; shipped as #227, ahead of and validated against this phase's other consuming-page migrations
- [x] Migrate `app/profile/page.tsx` — password Inputs, submit Button (#236)
- [x] Migrate `app/login/page.tsx` — email/password Inputs, remember-session Checkbox, action Buttons; verified rendering unauthenticated via a built production server (#236)
- [x] Migrate `app/change-password/page.tsx` — password Inputs, submit Button (#236)
- [x] Verify all migrated components preserve existing behavior — confirmed via `npm run build`, unit suite, and full E2E suite on every PR
- [x] Run full E2E suite to catch regressions from DataTable and layout component changes — green on every PR; see the Phase 14 doc's Risks for the one e2e-caught regression (Label association) this migration style produced elsewhere

### Backend
- None

### Infrastructure
- None

## Done Definition
- [x] Zero raw `<button>`, `<input>`, `<select>`, or `<textarea>` tags remain in any of the 14 listed files
- [x] Appropriate shadcn variants used throughout
- [x] All existing functionality preserved: login/logout flows, password change validation, sidebar collapse/expand, calendar navigation, assistant chat input, DataTable search/filter/sort, export menu actions
- [x] `npm run build` passes with zero errors
- [x] Full E2E test suite passes without modification
- [x] After this phase, a grep for raw `<button`, `<input`, `<select`, `<textarea` across `components/` and `app/` returns zero hits outside of `components/ui/shadcn/` primitive definitions — confirmed 2026-09-04

## Parallel work
- Auth pages (login, profile, change-password), config components, and shared UI components can be migrated in parallel
- DataTable should be migrated and tested first within this phase, since other files may depend on it
- No backend coordination needed

## Phase dependencies
- Requires: Phase 12 (shadcn form primitives must be available)
- Can run in parallel with Phases 13 and 14 (different files, no overlap)
- Recommended to land after Phases 13 and 14 so that DataTable changes can be validated against already-migrated consuming pages

## Complexity
- Backend: None
- Frontend: L (14 files; DataTable is high-risk due to wide reuse; auth pages are simple but critical path)
- Infra: None

## Risks
- `DataTable.tsx` is consumed by nearly every table view in the app — its internal search `<input>` and any action `<button>` elements must be swapped carefully; regression risk is highest here
- `AssistantChat.tsx` has a chat input with custom onKeyDown (Enter to send) — the shadcn Input/Textarea must preserve this behavior exactly
- Layout components (Sidebar, Header) are rendered on every page — visual regressions here affect the entire app; test thoroughly
- `login/page.tsx` and `change-password/page.tsx` are unauthenticated pages — ensure shadcn components work without session context
- `InlineEditable.tsx` toggles between display text and an edit input on click — same inline-edit pattern risk as EditableCell in Phase 14
- **Realized:** `PermissionsWorkspace.tsx` and `GeneralSettingsWorkspace.tsx` both used a raw `<button>`-based toggle switch with no shadcn equivalent in the repo yet — added `components/ui/shadcn/switch.tsx` (a base-ui `Switch` wrapper, same pattern as the existing `checkbox.tsx`) rather than approximating the toggle with an existing primitive
