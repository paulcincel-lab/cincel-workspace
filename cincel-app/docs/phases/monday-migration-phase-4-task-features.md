# monday Migration Phase 4: Subtasks, Dependencies, Datos de monday + Project Bitácora

## Goal
Child tasks, task dependencies with the "En espera" badge, the read-only **Datos de monday** panel and the project **Bitácora** work in the app for imported and new data alike.

## Deliverables

### Backend
- [ ] Types: `TaskRef`; task list item gains `parentTaskId`, `parentTitle`, `subtaskCount`, `subtaskDoneCount`, `waitingOn`; `ImportData` in `lib/types/core.ts` (FE §3)
- [ ] Task list queries compute the new DTO fields; `waitingOn` ignores `completado`, deleted and archived dependencies (FE §2.2)
- [ ] `createSubtaskAction(parentId, input)` (`usuario` task with parent's project, phase, `workflow_id`; `NESTED` if parent is a subtask) and `listSubtasksAction(parentId)`; same permissions as creating a task in that project (FE §2.1, §4)
- [ ] `mergeTasks` moves the merged task's children and dependencies to the surviving task; soft-deleted parents leave children top-level (FE §2.1)
- [ ] `addTaskDependencyAction` (same project, no self, no duplicate, cycle walk max depth 50), `removeTaskDependencyAction`, `listTaskDependenciesAction` → `{ dependsOn, blocks }`; errors `FORBIDDEN`, `NOT_FOUND`, `OTHER_PROJECT`, `SELF`, `DUPLICATE`, `CYCLE` (FE §2.2, §4)
- [ ] `getImportDataAction(entity, rowId)` in `lib/actions/import-actions.ts` for `task` / `project` / `contact`, using `lib/import/refs.ts` with the app `db`; same visibility as the row (FE §2.3)
- [ ] `fetchProjectHistoryAction(projectId)` and `addProjectCommentAction(projectId, text)` (`entity = 'project'`, `kind = 'comentario'`; `EMPTY`) (FE §2.4)
- [ ] Unit tests: cycle detection, DTO counts, `mergeTasks` moving children and dependencies (FE §5)

### Frontend
- [ ] Add shadcn `command` via the CLI (FE §2.6)
- [ ] Task drawer **Subtareas** section (list, **Agregar subtarea**, open child in same drawer with "← {padre}", hidden for subtasks); child header "Subtarea de {padre}"; "Tarea padre eliminada" state (FE §2.1)
- [ ] Actividades and Mis tareas rows: `CornerDownRight` + "Subtarea de {padre}" secondary line; "2/3 subtareas" `Badge` on parents; counts elsewhere unchanged (FE §2.1)
- [ ] Task drawer **Dependencias**: **Depende de** with `Popover` + `Command` search scoped to the project, remove via `AlertDialog`; **Bloquea a** read-only; error codes mapped to Spanish inline (FE §2.2)
- [ ] "En espera" outline `Badge` with `Hourglass` next to status in the drawer, Actividades and Mis tareas (FE §2.2)
- [ ] `components/ui/ImportDataPanel.tsx` (collapsed `Accordion`, two-column table, arrays/links/"Hito"/"Inicio", per-subitem data, footer) in the task drawer, project ficha and Directorio contact sheet; hidden without data (FE §2.3)
- [ ] Project ficha **Bitácora** card (newest first, comment input), extracting a shared bitácora list/input component if task drawer and `ClientDetailSheet.tsx` duplicate it (FE §2.4)
- [ ] Vitest + Testing Library: Subtareas, Dependencias (cycle copy, badge exclusions), `ImportDataPanel`, project Bitácora (FE §5)

### Infrastructure
- [ ] None

## Done Definition
- FE §6 #1–#4: a child task shows under its parent's **Subtareas** and links back; a subtask can be added by hand; a subtask can't get subtasks; an unfinished dependency shows "En espera" in the drawer and Actividades; a cycle is refused; **Datos de monday** shows on rows with import data only; the project ficha shows a **Bitácora** with comments and accepts new ones
- With import data seeded by hand into `import_refs` (before Phase 3 lands), the panel renders on tasks, projects and contacts
- Dashboard, Kanban, calendar and workload counts unchanged for existing data

## Parallel work
- BE actions and DTO fields ∥ FE components against the FE §4 contract
- Four independent slices that can be split across developers: Subtareas · Dependencias + "En espera" · Datos de monday · project Bitácora
- The whole phase runs in parallel with monday Migration Phases 2 and 3

## Phase dependencies
- Requires: monday Migration Phase 1 schema only (`parent_task_id`, `task_dependencies`, `import_refs`, `lib/import/refs.ts`)
- Needed by: the real-client staging spot-check in Phase 3 (BE §12 #8, #9)

## Complexity
- Backend: M
- Frontend: L
- Infra: S

## Risks
- Task list DTO change touches Actividades and Mis tareas queries; watch performance of subtask/dependency counts on large projects
- `mergeTasks` changes affect existing merge behaviour; needs regression tests
