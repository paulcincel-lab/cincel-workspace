import { keepPreviousData, queryOptions, type QueryClient, type QueryKey } from "@tanstack/react-query";

import {
  getTareasStartSlotData,
  getTaskSheetData,
  searchProjectTasksAction,
} from "@/lib/actions/page-data/tareas-actions";
import { listSubtasksAction, listTaskDependenciesAction } from "@/lib/actions/tasks-actions";
import { previewStartEtapaAction } from "@/lib/actions/etapa-start-actions";
import { fetchWorkflowAction } from "@/lib/actions/workflows-actions";
import { STALE, qk, type TareasListFilters } from "@/lib/query/keys";
import { effectiveMostrar, esencialResponsable, responsableFilter, type TareasQuery } from "@/lib/tareas/query";
import type { PresentationStyle } from "@/lib/types/redesign";
import type {
  StartEtapaPreview,
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
  getTareasByProject,
  getTareasFacets,
  getTareasListFirstPages,
  getTareasListPage,
  getTareasPageData,
  getTareasTrend,
  getTaskChildren,
} from "@/lib/actions/page-data/tareas-actions";
import type { TareasPageKeyInput } from "@/lib/query/keys";
import { TAREAS_FIRST_PAGES_MAX } from "@/lib/tareas/page-input";
import { getTareasSummary } from "@/lib/actions/page-data/tareas-actions";
import type { TareasSummary } from "@/lib/tareas/summary";
import type {
  TareasBoardColumn,
  TareasBoardData,
  TareasByProject,
  TareasFacets,
  TareasPageData,
  TareasRowsPage,
  TareasTrend,
} from "@/lib/tareas/page-data";

// ── Start slot (Query Migration 4d, #958) ────────────────────────────────────

/**
 * The Lista start slot of one etapa (`qk.tareas.startSlot(etapaId)`), 30 s
 * stale. Mounted only with exactly one etapa selected. Null when the etapa is
 * missing or inactive.
 */
export function tareasStartSlotOptions(etapaId: string) {
  return queryOptions<TareasStartSlotData | null>({
    queryKey: qk.tareas.startSlot(etapaId),
    queryFn: () => getTareasStartSlotData({ etapaId }),
    staleTime: STALE.screen,
  });
}

/**
 * The Iniciar etapa sheet's preview (`qk.tareas.startPreview(projectId,
 * workflowId)`): a read, never a mutation. staleTime 0, so every opening
 * reflects the current board; the caller adds `enabled: open`.
 */
export function startEtapaPreviewOptions(projectId: string, workflowId: string) {
  return queryOptions<StartEtapaPreview>({
    queryKey: qk.tareas.startPreview(projectId, workflowId),
    queryFn: () => previewStartEtapaAction(projectId, workflowId),
    staleTime: 0,
  });
}

/**
 * What starting or undoing an etapa invalidates (plan §3 "Etapa start"): the
 * etapa's start slot, every Tareas view (list, board, facets and the other
 * start slots under the `tareas` prefix), the project list and the
 * project's detail keys, the project options, Inicio and the shell badges.
 */
export function etapaStartInvalidations(target: { projectId: string; workflowId: string }): QueryKey[] {
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

// ── Filters ──────────────────────────────────────────────────────────────────

/**
 * The filters of a `/tareas` query, as the Tareas keys carry them. "Ocultar
 * completadas" with Mostrar "Todas" filters as "Abiertas" (`effectiveMostrar`).
 */
export function tareasListFiltersOf(query: TareasQuery): TareasListFilters {
  const mostrar = effectiveMostrar(query);
  return {
    etapa: query.etapa,
    proyecto: query.proyecto,
    responsable: query.responsable,
    estado: (query.estado as TaskStatus | null) ?? null,
    q: query.q,
    ...(mostrar !== "todas" ? { mostrar } : {}),
    // Two or more projects (#1045); one stays in `proyecto`, so its keys keep their shape.
    ...(query.proyectos && query.proyectos.length > 0 ? { proyectos: query.proyectos } : {}),
    // Only a responsable filter reads it, so the other keys stay as they were.
    ...(query.apoyo === false && responsableFilter(query.responsable) ? { apoyo: false as const } : {}),
  };
}

/**
 * What deleting a task invalidates (plan §3, `deleteTaskAction`): the list,
 * board, facets and first-page keys, the project's
 * Tareas tab, Inicio and the shell badges. The task's own detail is removed
 * (`removeQueries(tasks.detail(id))`), not refetched.
 */
export function taskDeleteInvalidations(projectId: string | null | undefined): QueryKey[] {
  return [
    [...qk.tareas.all, "list"],
    [...qk.tareas.all, "board"],
    [...qk.tareas.all, "facets"],
    [...qk.tareas.all, "page"],
    [...qk.tareas.all, "by-project"],
    [...qk.tareas.all, "summary"],
    ...(projectId ? [qk.proyectos.tab(projectId, "tareas")] : []),
    qk.inicio(),
    qk.shell.badges(),
    qk.me.tasks(),
  ];
}

// ── TaskSheet (Query Migration 4b, #956) ─────────────────────────────────────

/**
 * The active fases of one etapa (the sheet's Fase select), under the
 * `catalog.workflows` prefix like `newTaskWorkflowsKey`, so an etapa edit that
 * invalidates `qk.catalog.workflows()` refreshes it. Seeded by
 * `taskSheetOptions`.
 */
export const taskPhasesKey = (workflowId: string) => [...qk.catalog.workflows(), "phases", workflowId] as const;

/** Active fases of an etapa in catalog order. */
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
 * an admin task, which gets none) and the etapa's fases.
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

/** An etapa's active fases (`taskPhasesKey`), 5 min stale; read from the seeded key, fetched only when it is gone. */
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

/**
 * A parent's subtasks as table rows (`qk.tasks.children(id)`, #1047/#1048),
 * fetched on expand; 30 s stale. A list that loads children in one batch
 * seeds these keys with `seedTaskChildren` instead of one query per parent.
 */
export function taskChildrenOptions(parentId: string) {
  return queryOptions<TaskListRow[]>({
    queryKey: qk.tasks.children(parentId),
    queryFn: () => getTaskChildren(parentId),
    staleTime: STALE.screen,
  });
}

/** Writes batched children into each parent's `qk.tasks.children(id)` key. */
export function seedTaskChildren(client: QueryClient, byParent: Record<string, TaskListRow[]>): void {
  for (const [parentId, rows] of Object.entries(byParent)) client.setQueryData(qk.tasks.children(parentId), rows);
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

/** The Tareas views a task edit can change: first page, lista, tablero, facets, trend and summaries. */
const TAREAS_VIEW_KEYS: readonly QueryKey[] = [
  [...qk.tareas.all, "page"],
  [...qk.tareas.all, "list"],
  [...qk.tareas.all, "board"],
  [...qk.tareas.all, "facets"],
  [...qk.tareas.all, "trend"],
  [...qk.tareas.all, "by-project"],
  [...qk.tareas.all, "summary"],
];

/** `updateTaskAction` (plan §3): every Tareas view, the project's Tareas tab and Inicio; the detail is set from the result. */
export function taskUpdateInvalidations(projectId: string): QueryKey[] {
  return [...TAREAS_VIEW_KEYS, qk.proyectos.tab(projectId, "tareas"), qk.inicio(), qk.me.tasks()];
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
    qk.me.tasks(),
  ];
}

/** `assignTaskAction`: every Tareas view, Inicio (workload), the shell badges and Mi espacio's tasks. */
export function taskAssignInvalidations(): QueryKey[] {
  return [...TAREAS_VIEW_KEYS, qk.inicio(), qk.shell.badges(), qk.me.tasks()];
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

/**
 * `qk.tareas.page` input of a `/tareas` query: the resolved style (the
 * server prefetch and the client pass the same one) and the filters (never
 * `nueva`).
 */
export function tareasPageKeyInputOf(query: TareasQuery, estilo: PresentationStyle = "visual"): TareasPageKeyInput {
  // Esencial lists open work with its own "N completadas" disclosure: the switch is not part of it.
  const filters = estilo === "esencial" ? tareasListFiltersOf({ ...query, completadas: true }) : tareasListFiltersOf(query);
  return { estilo, ...filters };
}

function filtersOfPageKey(q: TareasPageKeyInput): TareasListFilters {
  return {
    etapa: q.etapa,
    proyecto: q.proyecto,
    responsable: q.responsable,
    estado: q.estado,
    q: q.q,
    ...(q.mostrar ? { mostrar: q.mostrar } : {}),
    ...(q.proyectos && q.proyectos.length > 0 ? { proyectos: q.proyectos } : {}),
    ...(q.apoyo === false ? { apoyo: false as const } : {}),
  };
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
  // Esencial's bundle counts with its own responsable default ("yo"), so it seeds the resolved keys.
  const f = q.estilo === "esencial" ? tareasEsencialFilters(filtersOfPageKey(q)) : filtersOfPageKey(q);
  client.setQueryData(qk.tareas.facets(f), data.facets);
  if (data.byProject) client.setQueryData(qk.tareas.byProject(f), data.byProject);
  if (data.board) client.setQueryData(qk.tareas.board(f), data.board);
  if (data.list) client.setQueryData<TareasListPages>(qk.tareas.list(f), { pages: [data.list], pageParams: [null] });
  if (data.summary) client.setQueryData(qk.tareas.summary(f), data.summary);
  for (const group of data.groups ?? []) {
    client.setQueryData<TareasListPages>(qk.tareas.list(group.filters), { pages: [group.page], pageParams: [null] });
  }
  return { facets: data.facets, etapas: data.etapas, staff: data.staff };
}

/**
 * One `/tareas` view (`qk.tareas.page(q)`), 30 s stale, the previous view
 * kept on screen while the next loads: one `getTareasPageData` call that
 * also seeds `tareas.facets(f)`, `tareas.board(f)` / `tareas.list(f)` and
 * keeps the facets, etapas and staff. The query function only reads
 * (no server writes). Exported for the sidebar hover prefetch.
 */
export function tareasPageOptions(q: TareasPageKeyInput) {
  return queryOptions<TareasPageData>({
    queryKey: qk.tareas.page(q),
    queryFn: async ({ client }) => {
      const data = await getTareasPageData({
        estilo: q.estilo,
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
    queryFn: ({ pageParam }) =>
      getTareasListPage({
        filters: f,
        cursor: pageParam,
        ...(f.orderBy ? { orderBy: f.orderBy } : {}),
        ...(f.orderDir ? { orderDir: f.orderDir } : {}),
      }),
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: STALE.screen,
    placeholderData: keepPreviousData,
    refetchOnMount: false,
  });
}

/**
 * Every row of `qk.tareas.list(f)`, page after page, without touching the
 * cache (the loaded groups keep their "Cargar más"): what an export of the
 * whole list reads, on demand only. Stops after `maxPages`.
 */
export async function fetchAllTareasListRows(f: TareasListFilters, maxPages = 100): Promise<TaskListRow[]> {
  const rows: TaskListRow[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const page: TareasRowsPage = await getTareasListPage({
      filters: f,
      cursor,
      ...(f.orderBy ? { orderBy: f.orderBy } : {}),
      ...(f.orderDir ? { orderDir: f.orderDir } : {}),
    });
    rows.push(...page.rows);
    cursor = page.nextCursor;
    if (!cursor) break;
  }
  return rows;
}

/**
 * Loads the first page of every list in `lists` that has no cached pages yet,
 * in one `getTareasListFirstPages` request, and seeds each
 * `qk.tareas.list(f)` (#1051). "Expandir todo" calls it before it opens the
 * rows, so N expanded rows cost one request, not N.
 */
export async function prefetchTareasListFirstPages(client: QueryClient, lists: TareasListFilters[]): Promise<void> {
  const missing = lists.filter((f) => client.getQueryData(qk.tareas.list(f)) === undefined);
  for (let i = 0; i < missing.length; i += TAREAS_FIRST_PAGES_MAX) {
    const chunk = missing.slice(i, i + TAREAS_FIRST_PAGES_MAX);
    const pages = await getTareasListFirstPages({ lists: chunk });
    chunk.forEach((f, j) => {
      const page = pages[j];
      if (page) client.setQueryData<TareasListPages>(qk.tareas.list(f), { pages: [page], pageParams: [null] });
    });
  }
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
 * facets and every Lista entry, the project's Tareas tab,
 * resumen and cronograma, Inicio, the shell badges and my tasks. Not the board it just
 * patched: the optimistic move already matches the server.
 */
export function tableroMoveInvalidations(projectId: string | null): QueryKey[] {
  return [
    TAREAS_FACETS_PREFIX,
    TAREAS_LIST_PREFIX,
    [...qk.tareas.all, "trend"],
    [...qk.tareas.all, "summary"],
    ...(projectId
      ? [qk.proyectos.tab(projectId, "tareas"), qk.proyectos.resumen(projectId), qk.proyectos.cronograma(projectId)]
      : []),
    qk.inicio(),
    qk.shell.badges(),
    qk.me.tasks(),
  ];
}

// ── Visual summary (Estilos, #986) ───────────────────────────────────────────

/** Every `tareas.trend` entry (any filters). */
export const TAREAS_TREND_PREFIX: QueryKey = [...qk.tareas.all, "trend"];

/**
 * The Tareas Visual summary (`qk.tareas.trend(f)`): KPI tiles with their
 * 7-day series and deltas, the people at work and the week strip. 30 s
 * stale; the previous filters' summary stays on screen while the next loads.
 */
export function tareasTrendOptions(f: TareasListFilters) {
  return queryOptions<TareasTrend>({
    queryKey: qk.tareas.trend(f),
    queryFn: () => getTareasTrend({ filters: f }),
    staleTime: STALE.screen,
    placeholderData: keepPreviousData,
  });
}

// ── Esencial (Estilos, #987) ─────────────────────────────────────────────────

/**
 * The filters Tareas Esencial reads with: a missing responsable is "yo"
 * (Solo mías on by default) and "todos" is everyone (null), so the keys of
 * "everyone" are the ones the other styles use.
 */
export function tareasEsencialFilters(f: TareasListFilters): TareasListFilters {
  return { ...f, responsable: esencialResponsable(f.responsable) };
}

/** Every `tareas.byProject` entry (any filters). */
export const TAREAS_BY_PROJECT_PREFIX: QueryKey = [...qk.tareas.all, "by-project"];

/**
 * The Esencial cards (`qk.tareas.byProject(f)`, `f` resolved with
 * `tareasEsencialFilters`): counts per project and the open rows (cap 200).
 * Seeded by the Esencial page bundle; 30 s stale, the previous filters'
 * cards stay on screen while the next load.
 */
export function tareasByProjectOptions(f: TareasListFilters) {
  return queryOptions<TareasByProject>({
    queryKey: qk.tareas.byProject(f),
    queryFn: () => getTareasByProject({ filters: f }),
    staleTime: STALE.screen,
    placeholderData: keepPreviousData,
  });
}

/**
 * The closed rows of one Esencial card, fetched on its first expand: the
 * Lista pages (`tareasListInfiniteOptions`) of the card's project with
 * `estado: completado`, without `mostrar` (it only narrows open work).
 */
export function tareasCompletedFilters(f: TareasListFilters, projectId: string): TareasListFilters {
  const { mostrar: _mostrar, ...rest } = f;
  void _mostrar;
  return { ...rest, proyecto: projectId, estado: "completado" };
}

// ── Analítico summary (Estilos, #988) ────────────────────────────────────────

/** Every `tareas.summary` entry (any filters). */
export const TAREAS_SUMMARY_PREFIX: QueryKey = [...qk.tareas.all, "summary"];

/**
 * The Tareas Analítico counts (`qk.tareas.summary(f)`): per project and
 * etapa, per project and in total, over every matching task. Seeded by the
 * Analítico page bundle; 30 s stale, the previous filters' counts stay on
 * screen while the next load.
 */
export function tareasSummaryOptions(f: TareasListFilters) {
  return queryOptions<TareasSummary>({
    queryKey: qk.tareas.summary(f),
    queryFn: () => getTareasSummary({ filters: f }),
    staleTime: STALE.screen,
    placeholderData: keepPreviousData,
  });
}
