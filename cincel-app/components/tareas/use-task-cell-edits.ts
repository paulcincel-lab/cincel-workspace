"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";

import type { CanEdit, CellEdit, PeopleCellEdit } from "@/components/widgets/editable-cell";
import * as tasksActions from "@/lib/actions/tasks-actions";
import { canSeeAdminData, resolveActivitiesCapabilities } from "@/lib/auth/permissions";
import { qk, type TareasListFilters } from "@/lib/query/keys";
import { catalogProjectSpacesOptions, catalogTaskStatusesOptions } from "@/lib/query/options/catalog";
import {
  TAREAS_FACETS_PREFIX,
  TAREAS_LIST_PREFIX,
  TAREAS_SUMMARY_PREFIX,
  taskAssignInvalidations,
  taskPhasesOptions,
  taskStatusInvalidations,
  taskUpdateInvalidations,
  type TareasListPages,
} from "@/lib/query/options/tareas";
import { selectAuthenticatedUser, useSessionStore } from "@/lib/stores/session-store";
import type { ActionResult } from "@/lib/types/schedule";
import type {
  ProjectSpace,
  ProjectSpaceRef,
  StaffRef,
  TaskDetail,
  TaskListRow,
  TaskStatusOption,
  WorkflowPhaseRef,
  WorkflowRef,
} from "@/lib/types/core";
import type { RecordColumn } from "@/lib/types/widgets";

import { SUPPORT_IS_RESPONSIBLE } from "./task-table-copy";
import {
  TASK_SUPPORT_COLUMN,
  patchTaskListPages,
  taskCellAction,
  taskCellLock,
  taskCellOptions,
  taskCellValue,
  taskSupportExclude,
  taskSupportIds,
  taskSupportLock,
  taskSupportOptions,
  taskWithChange,
  taskWithSupport,
  type TaskCellAction,
  type TaskCellCatalogs,
  type TaskCellField,
  type TaskCellTask,
  type TaskCellViewer,
} from "./task-cell-edits";

/**
 * The keys the Tareas tables read: `CellCommitProvider` invalidates them
 * after every cell save (the rows, the Analítico counts and the chip counts).
 */
export const TAREAS_CELL_KEYS: QueryKey[] = [TAREAS_LIST_PREFIX, TAREAS_SUMMARY_PREFIX, TAREAS_FACETS_PREFIX];

/** The column keys of the Tareas tables that edit in place, and the field each one saves. */
export const TASK_CELL_COLUMNS: Readonly<Record<string, TaskCellField>> = {
  tarea: "tarea",
  tramo: "tramo",
  fase: "fase",
  estatus: "estatus",
  responsable: "responsable",
  prioridad: "prioridad",
  vence: "vence",
  compromiso: "compromiso",
  revision: "revision",
  espacio: "espacio",
};

/** How long after a tramo move the Fase editor opens (the row has moved to its new group by then). */
export const FASE_CHAIN_DELAY_MS = 150;
const FASE_CHAIN_TRIES = 10;

const NO_STATUSES: TaskStatusOption[] = [];
const NO_PHASES: WorkflowPhaseRef[] = [];
const NO_SPACES: ProjectSpaceRef[] = [];

/**
 * Opens a cell's editor from code: a click on its grid cell
 * (`[data-cell-row][data-cell-column]`, `use-cell-grid`). Retries while the
 * row moves to its new group; gives up when it never shows (its group is
 * collapsed or the column hidden in this style).
 */
export function openTaskCell(rowId: string, columnKey: string, tries = FASE_CHAIN_TRIES): void {
  window.setTimeout(() => {
    const cell = document.querySelector<HTMLElement>(`[data-cell-row="${rowId}"][data-cell-column="${columnKey}"]`);
    if (cell) cell.click();
    else if (tries > 1) openTaskCell(rowId, columnKey, tries - 1);
  }, FASE_CHAIN_DELAY_MS);
}

type Snapshot = Array<[QueryKey, unknown]>;

/**
 * Patches the loaded Tareas rows (every `tareas.list`) and the task detail
 * with the change; returns what to restore if the save fails.
 */
async function patchTaskCaches(
  qc: QueryClient,
  taskId: string,
  patch: <R extends TaskCellTask>(row: R) => R,
  moves: boolean,
): Promise<Snapshot> {
  const detailKey = qk.tasks.detail(taskId);
  await Promise.all([
    qc.cancelQueries({ queryKey: TAREAS_LIST_PREFIX }),
    qc.cancelQueries({ queryKey: detailKey, exact: true }),
  ]);
  const snapshot: Snapshot = [];
  const lists = qc.getQueriesData<TareasListPages>({ queryKey: TAREAS_LIST_PREFIX });
  let moved: TareasListPages["pages"][number]["rows"][number] | undefined;
  if (moves) {
    for (const [, data] of lists) {
      const row = data?.pages.flatMap((p) => p.rows).find((r) => r.id === taskId);
      if (row) {
        moved = patch(row);
        break;
      }
    }
  }
  for (const [key, data] of lists) {
    if (!data) continue;
    const filters = key[2] as TareasListFilters | undefined;
    const next = patchTaskListPages(data, filters, taskId, patch, { subtasks: moves, moved });
    if (next === data) continue;
    snapshot.push([key, data]);
    qc.setQueryData(key, next);
  }
  const detail = qc.getQueryData<TaskDetail | null>(detailKey);
  if (detail) {
    snapshot.push([detailKey, detail]);
    qc.setQueryData(detailKey, patch(detail));
  }
  // A subtask row under its expanded parent (#1048): its parent's `qk.tasks.children` list.
  for (const [key, rows] of qc.getQueriesData<TaskListRow[]>({ predicate: isChildrenQuery })) {
    if (!rows?.some((r) => r.id === taskId)) continue;
    snapshot.push([key, rows]);
    qc.setQueryData(key, rows.map((r) => (r.id === taskId ? patch(r) : r)));
  }
  return snapshot;
}

/** `qk.tasks.children(parentId)` = `["tasks", parentId, "children"]`. */
function isChildrenQuery(query: { queryKey: QueryKey }): boolean {
  const key = query.queryKey;
  return key.length === 3 && key[0] === "tasks" && key[2] === "children";
}

function runAction(taskId: string, action: Exclude<TaskCellAction, { kind: "none" }>): Promise<ActionResult<TaskDetail>> {
  switch (action.kind) {
    case "update":
      return tasksActions.updateTaskAction(taskId, action.patch);
    case "status":
      return tasksActions.setTaskStatusAction(taskId, action.status);
    case "customStatus":
      return tasksActions.setTaskCustomStatusAction(taskId, action.id);
    case "assign":
      return tasksActions.assignTaskAction(taskId, action.managerId);
  }
}

/** What else an action changes besides the tables (`TAREAS_CELL_KEYS` are the provider's). */
function extraInvalidations(projectId: string, action: TaskCellAction): QueryKey[] {
  const keys =
    action.kind === "assign"
      ? taskAssignInvalidations()
      : action.kind === "update"
        ? taskUpdateInvalidations(projectId)
        : taskStatusInvalidations(projectId);
  const own = new Set(TAREAS_CELL_KEYS.map((k) => JSON.stringify(k)));
  return keys.filter((k) => !own.has(JSON.stringify(k)));
}

/** A column without its editor (any table's `RecordColumn`). */
export type PlainColumn<Row> = Omit<RecordColumn<Row>, "edit" | "canEdit">;

export type UseTaskCellEditsOptions<Row> = {
  /** The task a table row stands for (undefined: the cell stays inert). */
  taskOf(row: Row): TaskCellTask | undefined;
  /** The page's tramos (every tramo of the catalog). */
  tramos: WorkflowRef[];
  /** Responsable options. */
  staff: StaffRef[];
  /** Projects whose espacios to load (only with an `espacio` column). */
  projectIds?: string[];
};

export type TaskCellEdits<Row> = {
  /**
   * The columns with `edit` / `canEdit` on the keys of `TASK_CELL_COLUMNS`
   * and on Apoyo (`TASK_SUPPORT_COLUMN`); others stay calculated.
   */
  withEdits(columns: readonly PlainColumn<Row>[]): RecordColumn<Row>[];
  /** One field's editor and lock. */
  cell(field: TaskCellField): { edit: CellEdit<Row>; canEdit: CanEdit<Row> };
  /** The Apoyo multi-select (#1038): saves through `setTaskSupportAction`, the Responsable's lock. */
  support(): { edit: PeopleCellEdit<Row>; canEdit: CanEdit<Row> };
  /**
   * Spread on the element around the table: the first hover or focus loads
   * the editors' lists (estatus catalog, fases of each tramo, espacios).
   */
  primeProps: { onPointerEnter(): void; onFocusCapture(): void };
};

/**
 * The editable task cells of a Tareas table (#1025): `CellEdit`s over
 * `task-cell-edits`, locked per `resolveActivitiesCapabilities` (Tramo moves
 * for admins only). A save patches every loaded `tareas.list` row and the task
 * detail right away (a tramo move takes the row, and its subtasks, to their
 * new group), restores them when the action fails, and refreshes what else
 * the action changes. When a tramo move leaves the task without fase, the
 * Fase editor opens next.
 */
export function useTaskCellEdits<Row>(options: UseTaskCellEditsOptions<Row>): TaskCellEdits<Row> {
  const { taskOf, tramos, staff, projectIds } = options;
  const qc = useQueryClient();
  const user = useSessionStore(selectAuthenticatedUser);
  const viewer = useMemo<TaskCellViewer>(
    () => ({ admin: canSeeAdminData(user), caps: resolveActivitiesCapabilities(user) }),
    [user],
  );

  // ── Catalogs: loaded on the first hover / focus of the table, not on mount.
  const [primed, setPrimed] = useState(false);
  const prime = useCallback(() => setPrimed(true), []);
  const statuses = useQuery({ ...catalogTaskStatusesOptions(), enabled: primed }).data ?? NO_STATUSES;
  const phaseData = useQueries({
    queries: tramos.map((t) => ({ ...taskPhasesOptions(t.id), enabled: primed })),
    combine: (results) => results.map((r) => r.data),
  });
  const spaceIds = useMemo(() => [...new Set(projectIds ?? [])], [projectIds]);
  const spaceData = useQueries({
    queries: spaceIds.map((id) => ({ ...catalogProjectSpacesOptions(id), enabled: primed })),
    combine: (results) => results.map((r) => r.data),
  });
  const phasesByTramo = useMemo(() => {
    const map = new Map<string, WorkflowPhaseRef[]>();
    tramos.forEach((t, i) => map.set(t.id, phaseData[i] ?? NO_PHASES));
    return map;
  }, [tramos, phaseData]);
  const spacesByProject = useMemo(() => {
    const map = new Map<string, ProjectSpaceRef[]>();
    spaceIds.forEach((id, i) => map.set(id, (spaceData[i] as ProjectSpace[] | null | undefined) ?? NO_SPACES));
    return map;
  }, [spaceIds, spaceData]);

  const catalogs = useMemo<TaskCellCatalogs>(
    () => ({
      tramos,
      phasesOf: (id) => phasesByTramo.get(id) ?? NO_PHASES,
      statuses,
      staff,
      spacesOf: (id) => spacesByProject.get(id) ?? NO_SPACES,
    }),
    [tramos, phasesByTramo, statuses, staff, spacesByProject],
  );

  const taskOfRef = useRef(taskOf);
  useEffect(() => {
    taskOfRef.current = taskOf;
  });

  const save = useCallback(
    async (field: TaskCellField, row: Row, value: string | null): Promise<ActionResult<unknown>> => {
      const task = taskOfRef.current(row);
      if (!task) return { ok: false, error: "NOT_FOUND" };
      const action = taskCellAction(task, field, value);
      if (action.kind === "none") return { ok: true, data: null };
      const moves = field === "tramo";
      const patch = <R extends TaskCellTask>(r: R): R => taskWithChange(r, field, value, catalogs);
      const snapshot = await patchTaskCaches(qc, task.id, patch, moves);
      const restore = () => {
        for (const [key, data] of snapshot) qc.setQueryData(key, data);
      };
      let result: ActionResult<TaskDetail>;
      try {
        result = await runAction(task.id, action);
      } catch (error) {
        restore();
        throw error;
      }
      if (!result.ok) {
        restore();
        return result;
      }
      const detailKey = qk.tasks.detail(task.id);
      if (qc.getQueryData(detailKey)) qc.setQueryData(detailKey, result.data);
      for (const queryKey of extraInvalidations(task.projectId, action)) void qc.invalidateQueries({ queryKey });
      // A subtask's parent list re-reads it (its order follows the due date).
      for (const [queryKey] of snapshot) if (isChildrenQuery({ queryKey })) void qc.invalidateQueries({ queryKey, exact: true });
      // The task moved to a tramo its fase isn't in: pick the new fase next.
      if (moves && task.phaseId !== null && result.data.phaseId === null) openTaskCell(task.id, "fase");
      return result;
    },
    [qc, catalogs],
  );

  const cell = useCallback(
    (field: TaskCellField): { edit: CellEdit<Row>; canEdit: CanEdit<Row> } => {
      const value = (row: Row) => {
        const task = taskOfRef.current(row);
        return task ? taskCellValue(task, field) : null;
      };
      const commit = (row: Row, v: string | null) => save(field, row, v);
      const options = (row: Row) => {
        const task = taskOfRef.current(row);
        return task ? taskCellOptions(task, field, catalogs) : [];
      };
      const canEdit: CanEdit<Row> = (row) => {
        const task = taskOfRef.current(row);
        return task ? taskCellLock(task, field, viewer) : true;
      };
      let edit: CellEdit<Row>;
      switch (field) {
        case "tarea":
          edit = { kind: "text", required: true, value, commit };
          break;
        case "responsable":
          edit = { kind: "person", options, clearable: true, value, commit };
          break;
        case "vence":
        case "compromiso":
        case "revision":
          edit = { kind: "date", quickPicks: true, clearable: true, value, commit };
          break;
        case "fase":
        case "espacio":
          edit = { kind: "select", options, clearable: true, value, commit };
          break;
        case "tramo":
        case "estatus":
        case "prioridad":
          // Prioridad is required in the data model (alta / media / baja): no "Sin prioridad".
          edit = { kind: "select", options, value, commit };
          break;
      }
      return { edit, canEdit };
    },
    [save, catalogs, viewer],
  );

  const saveSupport = useCallback(
    async (row: Row, ids: string[]): Promise<ActionResult<unknown>> => {
      const task = taskOfRef.current(row);
      if (!task) return { ok: false, error: "NOT_FOUND" };
      const patch = <R extends TaskCellTask>(r: R): R => taskWithSupport(r, ids, staff);
      const snapshot = await patchTaskCaches(qc, task.id, patch, false);
      const restore = () => {
        for (const [key, data] of snapshot) qc.setQueryData(key, data);
      };
      let result: Awaited<ReturnType<typeof tasksActions.setTaskSupportAction>>;
      try {
        result = await tasksActions.setTaskSupportAction(task.id, ids);
      } catch (error) {
        restore();
        throw error;
      }
      if (!result.ok) {
        restore();
        return result;
      }
      // The sheet's Apoyo and its history entry.
      void qc.invalidateQueries({ queryKey: qk.tasks.detail(task.id), exact: true });
      for (const queryKey of extraInvalidations(task.projectId, { kind: "assign", managerId: task.managerId })) {
        void qc.invalidateQueries({ queryKey });
      }
      return result;
    },
    [qc, staff],
  );

  const support = useCallback((): { edit: PeopleCellEdit<Row>; canEdit: CanEdit<Row> } => {
    const edit: PeopleCellEdit<Row> = {
      kind: "people",
      value: (row) => {
        const task = taskOfRef.current(row);
        return task ? taskSupportIds(task) : [];
      },
      commit: saveSupport,
      options: () => taskSupportOptions(staff),
      exclude: (row) => {
        const task = taskOfRef.current(row);
        return task ? taskSupportExclude(task) : [];
      },
      excludedLabel: SUPPORT_IS_RESPONSIBLE,
    };
    const canEdit: CanEdit<Row> = (row) => (taskOfRef.current(row) ? taskSupportLock(viewer) : true);
    return { edit, canEdit };
  }, [saveSupport, staff, viewer]);

  const withEdits = useCallback(
    (columns: readonly PlainColumn<Row>[]): RecordColumn<Row>[] =>
      columns.map((column): RecordColumn<Row> => {
        if (column.key === TASK_SUPPORT_COLUMN) return { ...column, ...support() };
        const field = TASK_CELL_COLUMNS[column.key];
        if (!field) return column;
        const { edit, canEdit } = cell(field);
        return { ...column, edit, canEdit };
      }),
    [cell, support],
  );

  const primeProps = useMemo(() => ({ onPointerEnter: prime, onFocusCapture: prime }), [prime]);

  return useMemo(() => ({ withEdits, cell, support, primeProps }), [withEdits, cell, support, primeProps]);
}
