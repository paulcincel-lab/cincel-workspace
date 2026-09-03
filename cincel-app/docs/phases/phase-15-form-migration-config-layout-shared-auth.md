# Phase 15: Form Migration — Config + Layout + Shared UI + Auth Pages

## Goal
Complete the raw-HTML-to-shadcn form migration by replacing all remaining raw `<button>`, `<input>`, `<select>`, and `<textarea>` elements across configuration, layout, dashboard, calendar, assistant, shared UI components, and authentication pages.

## Deliverables

### Frontend
- [ ] Migrate `components/configuracion/PermissionsWorkspace.tsx` — replace raw form elements
- [ ] Migrate `components/configuracion/GeneralSettingsWorkspace.tsx` — replace raw form elements
- [ ] Migrate `components/calendario/UnifiedCalendar.tsx` — replace raw form elements
- [ ] Migrate `components/asistente/AssistantChat.tsx` — replace raw form elements
- [ ] Migrate `components/dashboard/InteractiveDashboard.tsx` — replace raw form elements
- [ ] Migrate `components/layout/Sidebar.tsx` — replace raw form elements
- [ ] Migrate `components/layout/Header.tsx` — replace raw form elements
- [ ] Migrate `components/ui/TeamMultiSelect.tsx` — replace raw form elements
- [ ] Migrate `components/ui/InlineEditable.tsx` — replace raw form elements
- [ ] Migrate `components/ui/ExportMenu.tsx` — replace raw form elements
- [ ] Migrate `components/ui/DataTable.tsx` — replace raw form elements; **note:** DataTable is heavily reused across the app, test all consuming pages after migration
- [ ] Migrate `app/profile/page.tsx` — replace raw form elements
- [ ] Migrate `app/login/page.tsx` — replace raw form elements
- [ ] Migrate `app/change-password/page.tsx` — replace raw form elements
- [ ] Verify all migrated components preserve existing behavior
- [ ] Run full E2E suite to catch regressions from DataTable and layout component changes

### Backend
- None

### Infrastructure
- None

## Done Definition
- Zero raw `<button>`, `<input>`, `<select>`, or `<textarea>` tags remain in any of the 14 listed files
- Appropriate shadcn variants used throughout
- All existing functionality preserved: login/logout flows, password change validation, sidebar collapse/expand, calendar navigation, assistant chat input, DataTable search/filter/sort, export menu actions
- `npm run build` passes with zero errors
- Full E2E test suite passes without modification
- After this phase, a grep for raw `<button`, `<input`, `<select`, `<textarea` across `components/` and `app/` returns zero hits outside of `components/ui/shadcn/` primitive definitions

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
