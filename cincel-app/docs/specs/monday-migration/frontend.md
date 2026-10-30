# Spec: One-time monday.com migration (Frontend)

**Status:** Ready for review · **Owner:** Oscar · **Date:** 2026-10-28
**Companion:** `docs/specs/monday-migration/backend.md`. The import itself is a CLI with no UI. This file covers the screens that **show** what the import translated, and the general features it introduces: child tasks, task dependencies and the project bitácora.

Conventions: as in `docs/specs/frontend.md` (plain shadcn in `components/ui/shadcn`, monochrome, drawers for editing, `DataTable`, Spanish copy, inline feedback, no toasts). Existing task UI: Actividades (`app/actividades/[departamento]/ActividadesClient.tsx`), Mis tareas (`app/mis-tareas`), the task drawer (`components/tareas/TaskDrawer.tsx`) and the project ficha (`app/proyectos/[id]/ficha`). Types live in `lib/types/task.ts` and `lib/types/core.ts`. New server actions follow the existing style: they throw `Error` with a code-like message (`"FORBIDDEN: …"`, `"CYCLE: …"`), and the UI maps it to Spanish copy inline.

---

## 1. Goals

- Staff see imported data where they already work: tasks, checklists, bitácora, cronograma and Drive links, with no "monday" screens to learn.
- Data with no Cincel equivalent is visible read-only, so nothing seems lost.
- Child tasks, dependencies and the project bitácora become normal features, usable for new work too.

### Non-goals (v1)
- A UI to run, preview or roll back an import (CLI only).
- Dependency arrows in the cronograma.
- More than one level of subtasks.

---

## 2. Proposed UI

### 2.1 Child tasks (`tasks.parent_task_id`)

- **One level only:** a task with a parent can't have subtasks (the add button is hidden and the action refuses). Imports flatten deeper levels (backend §5.2).
- **Task drawer:** a **Subtareas** section under the checklist: list of child tasks (status `Badge`, title, manager `AppAvatar`, commitment date). Click opens that task in the same drawer with a back link "← {tarea padre}". **Agregar subtarea** creates a `usuario` task with `parent_task_id`, the parent's project, phase and `workflow_id`.
- **Child task header:** "Subtarea de {padre}" link.
- **Actividades and Mis tareas:** child tasks are rows like any other, with a `CornerDownRight` icon and "Subtarea de {padre}" as the title's secondary line. Parent rows show a `Badge` "2/3 subtareas". No tree expand/collapse in v1.
- **Counts everywhere stay per task:** dashboard, Kanban, calendar and workload count a child task as one task, same as today's tasks. No aggregate changes.
- **Soft-deleting a parent** doesn't delete children; they show "Tarea padre eliminada" and behave as top-level. **Merging tasks** (`mergeTasks`) moves the merged task's children and dependencies to the surviving task.
- Actions in `lib/actions/tasks-actions.ts`: `createSubtaskAction(parentId, input)` → task; `listSubtasksAction(parentId)` → `TaskRef[]`. Errors: `FORBIDDEN`, `NOT_FOUND`, `NESTED` (parent is already a subtask). Same permissions as creating a task in that project.

### 2.2 Dependencies (`core.task_dependencies`)

- **Task drawer, section Dependencias:**
  - **Depende de**: tasks this one waits for (status, title, manager, date). Add with a `Popover` + `Command` search limited to the same project (**Agregar dependencia**); remove with an `X` button confirmed in `AlertDialog`.
  - **Bloquea a**: tasks that wait for this one (read-only list, links).
- **Waiting state:** a task with at least one dependency that isn't `completado`, deleted or archived shows a `Badge` "En espera" (outline variant, `Hourglass` icon) next to its status in the drawer and in Actividades / Mis tareas rows. Informational only; it doesn't change the status.
- Actions: `addTaskDependencyAction(taskId, dependsOnTaskId)` (same project, no self, no duplicate, no cycle: walk `depends_on` from the target, max depth 50), `removeTaskDependencyAction(taskId, dependsOnTaskId)`, `listTaskDependenciesAction(taskId)` → `{ dependsOn: TaskRef[], blocks: TaskRef[] }`. Errors: `FORBIDDEN`, `NOT_FOUND`, `OTHER_PROJECT`, `SELF`, `DUPLICATE`, `CYCLE`. Whoever can edit the task can edit its dependencies.
- Task list DTO gains `waitingOn: number` (deleted and archived dependencies don't count).

### 2.3 Datos de monday (read-only)

- **Task drawer:** a collapsed `Accordion` item **Datos de monday** at the bottom, only when the task has an `import_refs` row with `data`. A two-column table: column title → value (strings as text; arrays joined with ", "; URLs as links; `milestone: true` as "Hito"; `start` as "Inicio"). Subitem data (checklist mode) is listed per subitem. Footer: "Importado de monday el {fecha} · tablero {boardName} · grupo {groupTitle}".
- **Project ficha** and **contact sheet (Directorio):** the same accordion for the project's or contact's import data.
- Shared presentational component `components/ui/ImportDataPanel.tsx` (data passed in) used by the three places.
- `getImportDataAction(entity, rowId)` in `lib/actions/import-actions.ts` → `ImportData | null`; `entity` ∈ `task`, `project`, `contact`; staff session; same visibility as the row.

### 2.4 Project bitácora (new)

The app has task and contact bitácoras but none for projects; imported project-level comments (`item_as_project`) need one, and it's useful on its own.
- **Project ficha:** a **Bitácora** card listing the project's `history_events` (newest first; comments and changes), with an input to add a comment. Reuse the bitácora list/input pattern already used in `components/directorio/ClientDetailSheet.tsx` and the task drawer (extract a shared presentational component if the two are copies).
- Actions: `fetchProjectHistoryAction(projectId)` → history entries (same shape as `fetchTaskHistoryAction`); `addProjectCommentAction(projectId, text)` (needs project view access; inserts `entity = 'project'`, `kind = 'comentario'`).

### 2.5 Checklist, task bitácora, cronograma, links

No new UI. Imported comments appear in the existing task and contact bitácoras with their original dates (author = staff or the importer with the `monday · {name}:` prefix). Checklist items, cronograma rows and Drive links appear in their existing places.

### 2.6 Components to add

`command` (for the dependency search) is missing from `components/ui/shadcn`: add it with the shadcn CLI. `popover`, `accordion`, `alert-dialog`, `badge` exist.

---

## 3. Types

```ts
// lib/types/task.ts (additions)
type TaskRef = {
  id: string; title: string;
  status: "pendiente" | "en_proceso" | "completado" | "bloqueado";
  managerName: string | null; commitmentDate: string | null;
};
// task list item (existing type) gains:
//   parentTaskId: string | null; parentTitle: string | null;
//   subtaskCount: number; subtaskDoneCount: number; waitingOn: number;

// lib/types/core.ts (addition)
type ImportData = {
  source: "monday"; importedAt: string;
  boardName: string | null; groupTitle: string | null;
  data: Record<string, unknown>;
};
```

## 4. API contract

| Call | Request | Response / errors (thrown) |
|---|---|---|
| `createSubtaskAction(parentId, input)` | task input without project | task / `FORBIDDEN`, `NOT_FOUND`, `NESTED` |
| `listSubtasksAction(parentId)` | | `TaskRef[]` |
| `addTaskDependencyAction(taskId, dependsOnTaskId)` | | void / `FORBIDDEN`, `NOT_FOUND`, `OTHER_PROJECT`, `SELF`, `DUPLICATE`, `CYCLE` |
| `removeTaskDependencyAction(taskId, dependsOnTaskId)` | | void / `FORBIDDEN`, `NOT_FOUND` |
| `listTaskDependenciesAction(taskId)` | | `{ dependsOn: TaskRef[], blocks: TaskRef[] }` |
| `getImportDataAction(entity, rowId)` | `entity` ∈ `task`, `project`, `contact` | `ImportData \| null` |
| `fetchProjectHistoryAction(projectId)` | | history entries |
| `addProjectCommentAction(projectId, text)` | | void / `FORBIDDEN`, `NOT_FOUND`, `EMPTY` |

## 5. Testing

- Vitest + Testing Library: Subtareas (list, add, back link, hidden for subtasks); Dependencias (add, remove, cycle error copy, "En espera" badge and its exclusions); `ImportDataPanel` (strings, arrays, links, milestone, subitems, hidden without data); project Bitácora (list, add, empty state).
- Unit: cycle detection; DTO counts; `mergeTasks` moving children and dependencies.

## 6. Acceptance criteria

1. An imported child task shows under its parent's **Subtareas** and links back; a subtask can be added by hand; a subtask can't get subtasks.
2. A task with an unfinished dependency shows "En espera" in the drawer and in Actividades; a dependency closing a cycle is refused.
3. **Datos de monday** shows untranslated values on imported tasks, projects and contacts, and isn't shown on other rows.
4. The project ficha shows a **Bitácora** with imported project comments, and staff can add comments there.
5. Imported checklist items, task comments, cronograma rows and Drive links appear in their existing screens.
