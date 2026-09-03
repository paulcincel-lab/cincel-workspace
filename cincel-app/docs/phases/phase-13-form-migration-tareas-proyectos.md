# Phase 13: Form Migration — Tareas + Proyectos

## Goal
Replace all raw `<button>`, `<input>`, `<select>`, and `<textarea>` elements in tareas and proyectos feature files with the shadcn form primitives from Phase 12, achieving consistent styling and behavior across the two largest feature areas.

## Deliverables

### Frontend
- [ ] Migrate `components/tareas/TaskDrawer.tsx` — replace raw form elements with shadcn Button/Input/Select/Textarea/Label
- [ ] Migrate `components/tareas/PresaleTable.tsx` — replace raw form elements
- [ ] Migrate `components/tareas/PresaleRow.tsx` — replace raw form elements
- [ ] Migrate `components/tareas/NewTaskModal.tsx` — replace raw form elements
- [ ] Migrate `components/tareas/NewProjectTemplateModal.tsx` — replace raw form elements
- [ ] Migrate `components/proyectos/ProjectsTable.tsx` — replace raw form elements
- [ ] Migrate `components/proyectos/ProjectNotesModal.tsx` — replace raw form elements
- [ ] Migrate `components/proyectos/ProjectCreateModal.tsx` — replace raw form elements
- [ ] Migrate `app/tareas/TareasPageClient.tsx` — replace raw form elements
- [ ] Migrate `app/proyectos/[id]/ficha/page.tsx` — replace raw form elements
- [ ] Verify all migrated components preserve existing props, event handlers (onChange, onKeyDown, autoFocus, etc.), and controlled/uncontrolled behavior
- [ ] `npm run build` passes; existing E2E tests pass without modification

### Backend
- None

### Infrastructure
- None

## Done Definition
- Zero raw `<button>`, `<input>`, `<select>`, or `<textarea>` tags remain in the 10 listed files (excluding elements inside third-party components or where shadcn wrapping is technically impossible)
- Each replaced element uses the appropriate shadcn variant (e.g. primary action buttons use `variant="default"`, secondary/cancel buttons use `variant="outline"` or `variant="ghost"`, delete buttons use `variant="destructive"`)
- All existing functionality is preserved: form submission, validation, disabled states, placeholder text, keyboard handlers
- `npm run build` passes with zero errors
- Existing E2E tests pass without modification

## Parallel work
- Tareas files and proyectos files can be migrated in parallel by different developers
- No backend coordination needed

## Phase dependencies
- Requires: Phase 12 (shadcn form primitives must be available before migration begins)

## Complexity
- Backend: None
- Frontend: L (10 files, many with dense form markup; PresaleTable/PresaleRow have inline-editable cells that need careful handling)
- Infra: None

## Risks
- PresaleTable and PresaleRow use inline-editable patterns where `<input>` elements appear/disappear on click — the shadcn Input wrapper must not interfere with this show/hide behavior or focus management
- TaskDrawer contains complex multi-section forms — read the actual current markup before assuming a mechanical find-and-replace approach works
- NewTaskModal was migrated to shadcn Dialog in Phase 10; form elements inside it must compose correctly with the Dialog's focus trap
