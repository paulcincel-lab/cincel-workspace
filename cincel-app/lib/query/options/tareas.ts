import { keepPreviousData, queryOptions, type QueryClient, type QueryKey } from "@tanstack/react-query";

import {
  getTareasCalendarData,
  getTareasStartSlotData,
  getTaskSheetData,
  searchProjectTasksAction,
} from "@/lib/actions/page-data/tareas-actions";
import { listSubtasksAction, listTaskDependenciesAction } from "@/lib/actions/tasks-actions";
import { previewStartTramoAction } from "@/lib/actions/tramo-start-actions";
import { fetchWorkflowAction } from "@/lib/actions/workflows-actions";
import { STALE, qk, type TareasListFilters } from "@/lib/query/keys";
import type { TareasQuery } from "@/lib/tareas/query";
import type {
  StartTramoPreview,
  TaskDetail,
  TaskListRow,
  TaskRef,
  TaskStatus,
  WorkflowDetail,
  WorkflowPhaseRef,
} from "@/lib/types/core";
import type { TareasStartSlotData } from "@/lib/types/tareas-start-slot";
import type { TaskSheetData } from "@/lib/types/task-sheet";
import { infiniteQueryOptions, type InfiniteData } from "@tanstack/react-query";
import {
  getTareasBoard,
  getTareasBoardColumn,
  getTareasFacets,
  getTareasListPage,
  getTareasPageData,
} from "@/lib/actions/page-data/tareas-actions";
import type { TareasPageKeyInput } from "@/lib/query/keys";
import type {
  TareasBoardColumn,
  TareasBoardData,
  TareasFacets,
  TareasPageData,
  TareasRowsPage,
} from "@/lib/tareas/page-data";

// ── Start slot (Query Migration 4d, #958) ────────────────────────────────────

/**
 * The Lista start slot of one tramo (`qk.tareas.startSlot(tramoId)`), 30 s
 * stale. Mounted only on `vista=lista` with exactly one tramo selected. Null
 * when the tramo is missing or inactive.
 */
export function tareasStartSlotOptions(tramoId: string) {
  return queryOptions<TareasStartSlotData | null>({
    queryKey: qk.tareas.startSlot(tramoId),
    queryFn: () => getTareasStartSlotData({ tramoId }),
    staleTime: STALE.screen,
  });
}

/**
 * The Iniciar tramo sheet's preview (`qk.tareas.startPreview(projectId,
 * workflowId)`): a read, never a mutation. staleTime 0, so every opening
 * reflects the current board; the caller adds `enabled: open`.
 */
export function startTramoPreviewOptions(projectId: string, workflowId: string) {
  return queryOptions<StartTramoPreview>({
    queryKey: qk.tareas.startPreview(projectId, workflowId),
    queryFn: () => previewStartTramoAction(projectId, workflowId),
    staleTime: 0,
  });
}

/**
 * What starting or undoing a tramo invalidates (plan §3 "Tramo start"): the
 * tramo's start slot, every Tareas view (list, board, facets, calendar and the
 * other start slots under the `tareas` prefix), the project list and the
 * project's detail keys, the project options, Inicio and the shell badges.
 */
export function tramoStartInvalidations(target: { projectId: string; workflowId: string }): QueryKey[] {
  return [
    qk.tareas.startSlot(target.workflowId),
    qk.tareas.all,
    qk.proyectos.list(),
    qk.proyectos.detail(target.projectId),
    qk.catalog.projectOptions(),
    qk.inicio(),
    qk.shell.badges(),
  ];
}

// ── Calendario (Query Migration 4c, #957) ────────────────────────────────────

/** The filters of a `/tareas` query, as the Tareas keys carry them. */
export function tareasListFiltersOf(query: TareasQuery): TareasListFilters {
  return {
    tramo: query.tramo,
    proyecto: query.proyecto,
    responsable: query.responsable,
    estado: (query.estado as TaskStatus | null) ?? null,
    q: query.q,
  };
}

/**
 * The Calendario rows of one inclusive range (`qk.tareas.calendar(f, from,
 * to)`), 30 s stale. The previous range stays on screen while the next one
 * loads. The query function only reads: the Google sync is a mutation.
 */
export function tareasCalendarOptions(filters: TareasListFilters, from: string, to: string) {
  return queryOptions<TaskListRow[]>({
    queryKey: qk.tareas.calendar(filters, from, to),
    queryFn: () => getTareasCalendarData({ filters, from, to }),
    staleTime: STALE.screen,
    placeholderData: keepPreviousData,
  });
}

/** Every `tareas.calendar` entry. */
export const TAREAS_CALENDAR_PREFIX: QueryKey = [...qk.tareas.all, "calendar"];

/**
 * What deleting a task invalidates (plan §3, `deleteTaskAction`): every
 * calendar range, the list, board, facets and first-page keys, the project's
 * Tareas tab, Inicio and the shell badges. The task's own detail is removed
 * (`removeQueries(tasks.detail(id))`), not refetched.
 */
export function taskDeleteInvalidations(projectId: string | null | undefined): QueryKey[] {
  return [
    TAREAS_CALENDAR_PREFIX,
    [...qk.tareas.all, "list"],
    [...qk.tareas.all, "board"],
    [...qk.tareas.all, "facets"],
    [...qk.tareas.all, "page"],
    ...(projectId ? [qk.proyectos.tab(projectId, "tareas")] : []),
    qk.inicio(),
    qk.shell.badges(),
  ];
}

// ── TaskSheet (Query Migration 4b, #956) ─────────────────────────────────────

/**
 * The active fases of one tramo (the sheet's Fase select), under the
 * `catalog.workflows` prefix like `newTaskWorkflowsKey`, so a tramo edit that
 * invalidates `qk.catalog.workflows()` refreshes it. Seeded by
 * `taskSheetOptions`.
 */
export const taskPhasesKey = (workflowId: string) => [...qk.catalog.workflows(), "phases", workflowId] as const;

/** Active fases of a tramo in catalog order. */
export function activeWorkflowPhases(workflow: WorkflowDetail | null | undefined): WorkflowPhaseRef[] {
  if (!workflow) return [];
  return workflow.phases
    .filter((p) => p.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(({ id, name, sortOrder }) => ({ id, name, sortOrder }));
}

/**
 * Writes what `getTaskSheetData` returned besides the task into the keys the
 * sheet reads: `catalog.taskStatuses`, `catalog.workflows`,
 * `catalog.assignableStaff(workflowId)`, `catalog.projectSpaces(pid)` (not for
 * an admin task, which gets none) and the tramo's fases.
 */
export function seedTaskSheet(client: QueryClient, data: TaskSheetData): void {
  const { task } = data;
  client.setQueryData(qk.catalog.taskStatuses(), data.statuses);
  client.setQueryData(qk.catalog.workflows(), data.workflows);
  client.setQueryData(qk.catalog.assignableStaff(task.workflowId), data.assignable);
  if (task.kind !== "admin") client.setQueryData(qk.catalog.projectSpaces(task.projectId), data.spaces);
  if (task.workflowId) client.setQueryData(taskPhasesKey(task.workflowId), data.phases);
}

/**
 * The task sheet (`qk.tasks.detail(id)`), 30 s stale: one `getTaskSheetData`
 * call that also seeds the catalog keys (5 min stale), so opening a task is
 * one request and reopening it within the stale time is none. Null when the
 * viewer can't see the task. The query function only reads.
 */
export function taskSheetOptions(id: string) {
  return queryOptions<TaskDetail | null>({
    queryKey: qk.tasks.detail(id),
    queryFn: async ({ client }) => {
      const data = await getTaskSheetData({ id });
      if (!data) return null;
      seedTaskSheet(client, data);
      return data.task;
    },
    staleTime: STALE.screen,
  });
}

/** A tramo's active fases (`taskPhasesKey`), 5 min stale; read from the seeded key, fetched only when it is gone. */
export function taskPhasesOptions(workflowId: string) {
  return queryOptions<WorkflowPhaseRef[]>({
    queryKey: taskPhasesKey(workflowId),
    queryFn: async () => activeWorkflowPhases(await fetchWorkflowAction(workflowId)),
    staleTime: STALE.catalog,
  });
}

/** A task's live subtareas (`qk.tasks.subtasks(id)`), 30 s stale. */
export function taskSubtasksOptions(id: string) {
  return queryOptions<TaskRef[]>({
    queryKey: qk.tasks.subtasks(id),
    queryFn: () => listSubtasksAction(id),
    staleTime: STALE.screen,
  });
}

/** "Depende de" and "Bloquea a" of a task (`qk.tasks.dependencies(id)`), 30 s stale. */
export function taskDependenciesOptions(id: string) {
  return queryOptions<{ dependsOn: TaskRef[]; blocks: TaskRef[] }>({
    queryKey: qk.tasks.dependencies(id),
    queryFn: () => listTaskDependenciesAction(id),
    staleTime: STALE.screen,
  });
}

/** Rows one dependency-picker search shows. */
export const PROJECT_TASK_SEARCH_LIMIT = 20;

/**
 * The dependency picker's search (`qk.tasks.options(projectId, q)`), 30 s
 * stale, at most 20 rows; the previous rows stay while the next search
 * loads. `q` is the debounced input. The key carries only the project and the
 * search, so the caller leaves out the task itself and its current
 * dependencies.
 */
export function projectTaskOptions(projectId: string, q: string) {
  return queryOptions<TaskRef[]>({
    queryKey: qk.tasks.options(projectId, q),
    queryFn: () => searchProjectTasksAction({ projectId, q, limit: PROJECT_TASK_SEARCH_LIMIT }),
    staleTime: STALE.screen,
    placeholderData: keepPreviousData,
  });
}

/** The Tareas views a task edit can change: first page, lista, tablero, calendario and facets. */
const TAREAS_VIEW_KEYS: readonly QueryKey[] = [
  [...qk.tareas.all, "page"],
  [...qk.tareas.all, "list"],
  [...qk.tareas.all, "board"],
  [...qk.tareas.all, "calendar"],
  [...qk.tareas.all, "facets"],
];

/** `updateTaskAction` (plan §3): every Tareas view, the project's Tareas tab and Inicio; the detail is set from the result. */
export function taskUpdateInvalidations(projectId: string): QueryKey[] {
  return [...TAREAS_VIEW_KEYS, qk.proyectos.tab(projectId, "tareas"), qk.inicio()];
}

/**
 * `setTaskStatusAction` / `setTaskCustomStatusAction`: every Tareas view, the
 * project's Tareas tab, resumen and cronograma, Inicio and the shell badges.
 */
export function taskStatusInvalidations(projectId: string): QueryKey[] {
  return [
    ...TAREAS_VIEW_KEYS,
    qk.proyectos.tab(projectId, "tareas"),
    qk.proyectos.resumen(projectId),
    qk.proyectos.cronograma(projectId),
    qk.inicio(),
    qk.shell.badges(),
  ];
}

/** `assignTaskAction`: every Tareas view, Inicio (workload) and the shell badges. */
export function taskAssignInvalidations(): QueryKey[] {
  return [...TAREAS_VIEW_KEYS, qk.inicio(), qk.shell.badges()];
}

/** Checklist add / update / remove / reorder: the views that show checklist progress. */
export function taskChecklistInvalidations(): QueryKey[] {
  return [[...qk.tareas.all, "page"], [...qk.tareas.all, "list"], [...qk.tareas.all, "board"]];
}

/** `createSubtaskAction`: the parent's subtareas, every Tareas key, the project's Tareas tab, Inicio and the badges. */
export function subtaskCreateInvalidations(parentId: string, projectId: string): QueryKey[] {
  return [
    qk.tasks.subtasks(parentId),
    qk.tareas.all,
    qk.proyectos.tab(projectId, "tareas"),
    qk.inicio(),
    qk.shell.badges(),
  ];
}

/**
 * `addTaskDependencyAction` / `removeTaskDependencyAction`: both tasks'
 * dependency lists ("Bloquea a" of the other one) and the views that show
 * "En espera" (`waitingOn`).
 */
export function taskDependencyInvalidations(taskId: string, otherId: string): QueryKey[] {
  return [
    qk.tasks.dependencies(taskId),
    qk.tasks.dependencies(otherId),
    [...qk.tareas.all, "page"],
    [...qk.tareas.all, "list"],
    [...qk.tareas.all, "board"],
  ];
}

// ── Lista y Tablero (Query Migration 4a, #955) ───────────────────────────────

/** `qk.tareas.page` input of a `/tareas` query: the view, the calendar mode and the filters (never `nueva` or `fecha`). */
export function tareasPageKeyInputOf(query: TareasQuery): TareasPageKeyInput {
  return { vista: query.vista, cal: query.cal, ...tareasListFiltersOf(query) };
}

function filtersOfPageKey(q: TareasPageKeyInput): TareasListFilters {
  return { tramo: q.tramo, proyecto: q.proyecto, responsable: q.responsable, estado: q.estado, q: q.q };
}

/** Every `tareas.list` entry (any filters). */
export const TAREAS_LIST_PREFIX: QueryKey = [...qk.tareas.all, "list"];
/** Every `tareas.facets` entry (any filters). */
export const TAREAS_FACETS_PREFIX: QueryKey = [...qk.tareas.all, "facets"];

/** The Lista pages as `useInfiniteQuery` keeps them. */
export type TareasListPages = InfiniteData<TareasRowsPage, string | null>;

/**
 * Writes the parts of a page bundle into the keys the views read:
 * `tareas.facets(f)`, `tareas.board(f)` (Tablero) and the first page of
 * `tareas.list(f)` (Lista). Later invalidations then target those keys.
 * Returns the bundle without the rows, which is what `tareas.page(q)` keeps:
 * the rows live once, in their own keys (and once in the dehydrated page).
 */
export function seedTareasPage(client: QueryClient, q: TareasPageKeyInput, data: TareasPageData): TareasPageData {
  const f = filtersOfPageKey(q);
  client.setQueryData(qk.tareas.facets(f), data.facets);
  if (data.board) client.setQueryData(qk.tareas.board(f), data.board);
  if (data.list) client.setQueryData<TareasListPages>(qk.tareas.list(f), { pages: [data.list], pageParams: [null] });
  return { facets: data.facets, tramos: data.tramos, staff: data.staff };
}

/**
 * One `/tareas` view (`qk.tareas.page(q)`), 30 s stale, the previous view
 * kept on screen while the next loads: one `getTareasPageData` call that
 * also seeds `tareas.facets(f)`, `tareas.board(f)` / `tareas.list(f)` and
 * keeps the facets, tramos and staff. The query function only reads
 * (no server writes). Exported for the sidebar hover prefetch.
 */
export function tareasPageOptions(q: TareasPageKeyInput) {
  return queryOptions<TareasPageData>({
    queryKey: qk.tareas.page(q),
    queryFn: async ({ client }) => {
      const data = await getTareasPageData({
        vista: q.vista,
        cal: q.cal,
        ...filtersOfPageKey(q),
      });
      return seedTareasPage(client, q, data);
    },
    staleTime: STALE.screen,
    placeholderData: keepPreviousData,
  });
}

/**
 * The chip counts and Proyecto options (`qk.tareas.facets(f)`). Seeded by
 * `tareasPageOptions`; fetched on its own only after an invalidation, so a
 * remount waits for the page bundle (`refetchOnMount: false`).
 */
export function tareasFacetsOptions(f: TareasListFilters) {
  return queryOptions<TareasFacets>({
    queryKey: qk.tareas.facets(f),
    queryFn: () => getTareasFacets({ filters: f }),
    staleTime: STALE.screen,
    placeholderData: keepPreviousData,
    refetchOnMount: false,
  });
}

/**
 * The board (`qk.tareas.board(f)`): every column's first rows and total.
 * Seeded by `tareasPageOptions`; the Tablero drag patches it optimistically.
 */
export function tareasBoardOptions(f: TareasListFilters) {
  return queryOptions<TareasBoardData>({
    queryKey: qk.tareas.board(f),
    queryFn: () => getTareasBoard({ filters: f }),
    staleTime: STALE.screen,
    placeholderData: keepPreviousData,
    refetchOnMount: false,
  });
}

/** Lista (`useInfiniteQuery(qk.tareas.list(f))`): the cursor is the page param; the first page is seeded. */
export function tareasListInfiniteOptions(f: TareasListFilters) {
  return infiniteQueryOptions<TareasRowsPage, Error, TareasListPages, readonly unknown[], string | null>({
    queryKey: qk.tareas.list(f),
    queryFn: ({ pageParam }) => getTareasListPage({ filters: f, cursor: pageParam }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: STALE.screen,
    placeholderData: keepPreviousData,
    refetchOnMount: false,
  });
}

/** The extra pages of one board column. */
export type TareasBoardColumnPages = InfiniteData<TareasBoardColumn, string | null>;

/**
 * "Cargar más" of one board column (`useInfiniteQuery(qk.tareas.board(f,
 * columnId))`): the pages after the board's first rows, starting at that
 * column's `nextCursor`. The caller enables it on the first click.
 */
export function tareasBoardColumnOptions(f: TareasListFilters, columnId: string, firstCursor: string | null) {
  return infiniteQueryOptions<TareasBoardColumn, Error, TareasBoardColumnPages, readonly unknown[], string | null>({
    queryKey: qk.tareas.board(f, columnId),
    queryFn: ({ pageParam }) => getTareasBoardColumn({ filters: f, columnId, cursor: pageParam }),
    initialPageParam: firstCursor,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: STALE.screen,
  });
}

/**
 * What a Tablero drag invalidates once it settles (plan §3, §4.4): the
 * facets and every Lista (and calendar) entry, the project's Tareas tab,
 * resumen and cronograma, Inicio and the shell badges. Not the board it just
 * patched: the optimistic move already matches the server.
 */
export function tableroMoveInvalidations(projectId: string | null): QueryKey[] {
  return [
    TAREAS_FACETS_PREFIX,
    TAREAS_LIST_PREFIX,
    TAREAS_CALENDAR_PREFIX,
    ...(projectId
      ? [qk.proyectos.tab(projectId, "tareas"), qk.proyectos.resumen(projectId), qk.proyectos.cronograma(projectId)]
      : []),
    qk.inicio(),
    qk.shell.badges(),
  ];
}
