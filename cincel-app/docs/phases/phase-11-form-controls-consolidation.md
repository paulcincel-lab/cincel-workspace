# Phase 11: Form Controls Consolidation — TeamMultiSelect + PillDropdown

## Goal
Replace the two remaining custom form/selection components with shadcn-based equivalents, completing the UI consolidation effort started in Phase 9.

## Deliverables

### Frontend
- [ ] Install shadcn `popover`, `command`, `checkbox` primitives under `components/ui/shadcn/`
- [ ] Install shadcn `toggle-group` primitive under `components/ui/shadcn/`
- [ ] Rebuild `components/ui/TeamMultiSelect.tsx` using shadcn Popover + Command + Checkbox (multi-select combobox with search); preserve existing props API (`selectedMembers`, `onChange`, `members` list)
- [ ] Verify TeamMultiSelect works in `NewTaskModal` (migrated to shadcn Dialog in Phase 10)
- [ ] Verify TeamMultiSelect works in `MemberEditorDrawer` (migrated to shadcn Sheet in Phase 10)
- [ ] Rebuild `components/proveedores/PillDropdown.tsx` using shadcn ToggleGroup (single-select pill styling); preserve existing props API
- [ ] Verify PillDropdown works in the proveedores DataTable column

### Backend
- None (pure UI consolidation)

### Infrastructure
- None

## Done Definition
- TeamMultiSelect renders a searchable multi-select dropdown using shadcn Popover/Command/Checkbox with identical selection behavior
- PillDropdown renders single-select pills using shadcn ToggleGroup with identical visual style
- Both components work correctly inside their parent containers (Dialog, Sheet, DataTable)
- Keyboard navigation works: arrow keys in Command list, Enter to select, Escape to close popover
- No TypeScript errors; `npm run build` passes
- Existing E2E tests pass without modification

## Parallel work
- TeamMultiSelect and PillDropdown migrations are independent — can run in parallel
- No backend coordination needed

## Phase dependencies
- Requires: Phase 10 (TeamMultiSelect lives inside NewTaskModal and MemberEditorDrawer, which are migrated to shadcn Dialog/Sheet in Phase 10; must land after or alongside Phase 10 to avoid double-touching those files)

## Complexity
- Backend: None
- Frontend: M (2 components, but TeamMultiSelect's search + multi-select interaction is non-trivial)
- Infra: None

## Risks
- shadcn Command (cmdk) inside a shadcn Dialog can have focus-trap conflicts — the Command input must receive focus when the Popover opens inside a Dialog; test this combination explicitly
- PillDropdown's current pill styling may not match ToggleGroup's default appearance — may need custom Tailwind classes on ToggleGroupItem
- TeamMultiSelect search/filter behavior must match existing UX exactly (instant filter, no debounce)
