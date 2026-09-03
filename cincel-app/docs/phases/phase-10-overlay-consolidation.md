# Phase 10: Overlay Consolidation — Dialog + Sheet Migration

## Goal
Migrate all modal and drawer overlays from the custom `DialogOverlay.tsx` wrapper to shadcn `Dialog` (for centered modals) and shadcn `Sheet` (for side drawers), then delete `DialogOverlay.tsx` entirely.

## Deliverables

### Frontend
- [ ] Install shadcn `dialog` and `sheet` primitives under `components/ui/shadcn/`
- [ ] Migrate `components/tareas/NewTaskModal.tsx` from DialogOverlay to shadcn Dialog
- [ ] Migrate `components/tareas/NewProjectTemplateModal.tsx` to shadcn Dialog
- [ ] Migrate `components/proyectos/ProjectCreateModal.tsx` to shadcn Dialog
- [ ] Migrate `components/proyectos/ProjectNotesModal.tsx` to shadcn Dialog
- [ ] Migrate `components/equipo/MemberProfileModal.tsx` to shadcn Dialog
- [ ] Migrate `components/equipo/CoordinatorProjectsModal.tsx` to shadcn Dialog
- [ ] Migrate `components/recursos/DrivePickerDialog.tsx` outer wrapper to shadcn Dialog (internal file-picker logic unchanged)
- [ ] Migrate `components/tareas/TaskDrawer.tsx` from DialogOverlay to shadcn Sheet (side="right"); preserve save/history/add-note state logic exactly
- [ ] Migrate `components/equipo/MemberEditorDrawer.tsx` to shadcn Sheet (side="right")
- [ ] Delete `components/ui/DialogOverlay.tsx` after all consumers are migrated
- [ ] Verify all migrated overlays retain: Escape-to-close, click-outside-to-close, focus trap, ARIA attributes

### Backend
- None (pure UI consolidation)

### Infrastructure
- None

## Done Definition
- `components/ui/DialogOverlay.tsx` is deleted from the repo with zero remaining imports
- All 7 modals open/close correctly using shadcn Dialog with proper focus management
- Both drawers slide in from the right using shadcn Sheet and close correctly
- TaskDrawer save, history navigation, and add-note flows work identically to pre-migration (manual regression test or E2E)
- MemberEditorDrawer form submission works identically to pre-migration
- Keyboard accessibility preserved: Escape closes, Tab cycles within overlay, focus returns to trigger on close
- No TypeScript errors; `npm run build` passes
- Existing E2E tests pass without modification

## Parallel work
- All 7 modal migrations are independent of each other — can run in parallel
- Both drawer migrations are independent of each other
- Modal and drawer migrations can run in parallel, BUT DialogOverlay can only be deleted once ALL are done
- No backend coordination needed

## Phase dependencies
- Requires: Phase 9 (AppBadge used inside several modals; should be stable before touching modal internals)
- DialogOverlay deletion is the gate: modals and drawers MUST be in the same phase to allow full cleanup

## Complexity
- Backend: None
- Frontend: L (9 overlay components to migrate, each with its own state/form logic to preserve; TaskDrawer is the most complex)
- Infra: None

## Risks
- TaskDrawer has real state logic (save, history, add-note) — highest regression risk in this phase; recommend manual walkthrough or targeted E2E test before and after migration
- shadcn Dialog/Sheet use Radix primitives with their own focus-trap implementation — must verify no conflicts with any remaining custom focus logic
- DrivePickerDialog has internal Google Picker API integration — ensure only the outer overlay wrapper changes, not the picker iframe logic
- Multiple modals may be triggered from the same parent (e.g., NewTaskModal from TaskDrawer) — verify stacking/nesting behavior with shadcn Dialog
