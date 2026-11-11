import type { QueryClient, QueryKey } from "@tanstack/react-query";

import { moveProjectToTramo } from "@/components/proyectos/projects-portfolio-data";
import type { PortfolioTableRow } from "@/components/proyectos/projects-portfolio-data";
import {
  TASK_SUPPORT_COLUMN,
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
  type TaskCellViewer,
} from "@/components/tareas/task-cell-edits";
import { SUPPORT_COLUMN_LABEL, SUPPORT_IS_RESPONSIBLE } from "@/components/tareas/task-table-copy";
import { CLEAR_LABEL, LOCK_REASON, type CellEdit, type CellOption, type PeopleCellEdit } from "@/components/widgets/editable-cell";
import { setProjectCurrentTramoAction, updateProjectAction } from "@/lib/actions/projects-actions";
import {
  assignTaskAction,
  setTaskCustomStatusAction,
  setTaskStatusAction,
  setTaskSupportAction,
  updateTaskAction,
} from "@/lib/actions/tasks-actions";
import type { ProyectoTareasData, ProyectosPageData } from "@/lib/loaders/proyectos";
import type { TaskRow } from "@/lib/proyectos/project-summary";
import { qk } from "@/lib/query/keys";
import { tramoColorVar } from "@/lib/tramos/compat";
import type { ProjectListItem, StaffRef, TaskListRow, TaskStatusOption, WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";
import type { ActionResult } from "@/lib/types/schedule";
import type { RecordColumn } from "@/lib/types/widgets";

/**
 * Editable columns of the Proyectos tables (#1026): the portfolio of
 * Proyectos Analítico (Tramo actual, Responsable) and "Tareas por tramo" of
 * Resumen Analítico (Tarea, Fase, Responsable, Estatus, Vence, with the
 * Tareas table rules of `components/tareas/task-cell-edits`). Each commit
 * patches its page query first (a project that changes tramo moves to that
 * group at once) and puts the cache back when the server refuses; the
 * page's `CellCommitProvider` invalidates the page keys on settle, and the
 * other views are invalidated here on success. Every other column is
 * calculated and stays inert.
 */

/** Patches the cached `key` with `patch`, runs `run`, and restores the cache on failure (or calls `onSuccess`). */
async function optimistic<T>(
  qc: QueryClient,
  key: QueryKey,
  patch: (cached: T) => T,
  run: () => Promise<ActionResult<unknown>>,
  onSuccess?: () => void,
): Promise<ActionResult<unknown>> {
  await qc.cancelQueries({ queryKey: key });
  const before = qc.getQueryData<T>(key);
  if (before !== undefined && before !== null) qc.setQueryData<T>(key, patch(before));
  let result: ActionResult<unknown>;
  try {
    result = await run();
  } catch (err) {
    if (before !== undefined) qc.setQueryData<T>(key, before);
    throw err;
  }
  if (!result.ok) {
    if (before !== undefined) qc.setQueryData<T>(key, before);
    return result;
  }
  onSuccess?.();
  return result;
}

function invalidate(qc: QueryClient, keys: QueryKey[]): void {
  for (const queryKey of keys) void qc.invalidateQueries({ queryKey });
}

// ── Proyectos Analítico ─────────────────────────────────────────────────────

/** Keys the portfolio's `CellCommitProvider` invalidates on settle. */
export const PORTFOLIO_COMMIT_KEYS: QueryKey[] = [qk.proyectos.list()];

export const PORTFOLIO_TRAMO_LABEL = "Tramo actual";
export const PORTFOLIO_MANAGER_LABEL = "Responsable";

export type PortfolioEditDeps = {
  qc: QueryClient;
  /** Every project of the page, by id (the rows carry only what the table shows). */
  projects: Map<string, ProjectListItem>;
  /** The tramo catalog (`ProyectosPageData.tramos`). */
  tramos: WorkflowRef[];
  /** People for Responsable (the staff catalog, or the projects' teams while it loads). */
  staff: { id: string; name: string }[];
  canChangeProjectStage: boolean;
  canEditProjectGeneral: boolean;
  /** An admin may give a tramo to a project without one ("Asignar tramo"). */
  canSeeAdminData: boolean;
};

function tramoOption(tramo: Pick<WorkflowRef, "id" | "key" | "name">): CellOption {
  return { value: tramo.id, label: tramo.name, color: tramoColorVar(tramo.key) };
}

/** The tramo a project can move to: its started tramos; an admin assigns any tramo to a project without one. */
export function projectTramoOptions(project: ProjectListItem | undefined, tramos: WorkflowRef[], isAdmin: boolean): CellOption[] {
  if (!project) return [];
  if (project.needsTramo && isAdmin) return tramos.map(tramoOption);
  return project.tramos.map(tramoOption);
}

/** The page data after giving project `id` the manager `staff` (null clears it). */
export function setProjectManager(data: ProyectosPageData, id: string, staff: { id: string; name: string } | null): ProyectosPageData {
  return {
    ...data,
    projects: data.projects.map((p) => (p.id === id ? { ...p, managerId: staff?.id ?? null, manager: staff } : p)),
  };
}

/**
 * The Analítico portfolio columns with Tramo actual and Responsable after
 * Proyecto. Both lock with "Solo un admin puede cambiar este proyecto." for a
 * viewer the actions would refuse (`canChangeProjectStage`,
 * `canEditProjectGeneral`).
 */
export function portfolioEditColumns(base: RecordColumn[], deps: PortfolioEditDeps): RecordColumn<PortfolioTableRow>[] {
  const { qc, projects, tramos, staff, canChangeProjectStage, canEditProjectGeneral, canSeeAdminData } = deps;
  const key = qk.proyectos.list();
  const projectViews = (id: string): QueryKey[] => [qk.proyectos.detail(id), qk.inicio()];

  const tramo: CellEdit<PortfolioTableRow> = {
    kind: "select",
    options: (row) => projectTramoOptions(projects.get(row.id), tramos, canSeeAdminData),
    value: (row) => {
      const project = projects.get(row.id);
      if (!project || project.needsTramo) return null;
      return project.currentWorkflow?.id ?? project.tramos.find((t) => t.current)?.id ?? null;
    },
    commit: async (row, v) => {
      // A project always keeps a tramo once it has one.
      if (v === null) return { ok: false, error: "INVALID" };
      return optimistic<ProyectosPageData>(
        qc,
        key,
        (data) => moveProjectToTramo(data, row.id, v),
        () => setProjectCurrentTramoAction(row.id, v),
        () => invalidate(qc, projectViews(row.id)),
      );
    },
  };

  const staffById = new Map(staff.map((s) => [s.id, s]));
  const manager: CellEdit<PortfolioTableRow> = {
    kind: "person",
    clearable: true,
    options: () => [
      { value: null, label: CLEAR_LABEL.person },
      ...staff.map((s) => ({ value: s.id, label: s.name, avatar: { name: s.name } })),
    ],
    value: (row) => projects.get(row.id)?.manager?.id ?? null,
    commit: (row, v) => {
      const project = projects.get(row.id);
      const person = v === null ? null : (staffById.get(v) ?? (project?.manager?.id === v ? project.manager : null) ?? { id: v, name: "" });
      return optimistic<ProyectosPageData>(
        qc,
        key,
        (data) => setProjectManager(data, row.id, person),
        () => updateProjectAction(row.id, { managerId: v }),
        () => invalidate(qc, projectViews(row.id)),
      );
    },
  };

  const lock = (allowed: boolean) => (): true | string => (allowed ? true : LOCK_REASON.project);
  const editable: RecordColumn<PortfolioTableRow>[] = [
    { key: "tramo", label: PORTFOLIO_TRAMO_LABEL, width: 160, edit: tramo, canEdit: lock(canChangeProjectStage) },
    { key: "manager", label: PORTFOLIO_MANAGER_LABEL, width: 170, edit: manager, canEdit: lock(canEditProjectGeneral) },
  ];
  const columns = base as RecordColumn<PortfolioTableRow>[];
  const at = columns.findIndex((c) => c.key === "name") + 1;
  return [...columns.slice(0, at), ...editable, ...columns.slice(at)];
}

// ── Resumen Analítico: Tareas por tramo ─────────────────────────────────────

/** Keys the Resumen `CellCommitProvider` invalidates on settle. */
export function resumenCommitKeys(projectId: string): QueryKey[] {
  return [qk.proyectos.tab(projectId, "tareas"), qk.proyectos.resumen(projectId)];
}

export type ResumenTaskEditDeps = {
  qc: QueryClient;
  projectId: string;
  /** The project's tasks (`qk.proyectos.tab(id, "tareas")`), by id. */
  tasks: Map<string, TaskListRow>;
  /** Active catalog fases per tramo (`ProjectSummaryInput.phasesByTramo`). */
  phasesByTramo: Record<string, WorkflowPhaseRef[]>;
  /** People for Responsable (the project's team). */
  people: StaffRef[];
  /** Custom statuses of the catalog (after the base ones). */
  statuses: TaskStatusOption[];
  viewer: TaskCellViewer;
};

/** Resumen column → Tareas field (#1025 rules). "Vence" here is the commitment date (`rowDue`). */
const RESUMEN_TASK_FIELDS: Readonly<Record<string, TaskCellField>> = {
  title: "tarea",
  phase: "fase",
  responsable: "responsable",
  status: "estatus",
  due: "compromiso",
};

const TASK_KINDS: Readonly<Record<TaskCellField, CellEdit<unknown>["kind"]>> = {
  tarea: "text",
  tramo: "select",
  fase: "select",
  estatus: "select",
  responsable: "person",
  prioridad: "select",
  vence: "date",
  compromiso: "date",
  revision: "date",
  espacio: "select",
};

/** Runs the action `taskCellAction` picks. */
function runTaskAction(id: string, action: TaskCellAction): Promise<ActionResult<unknown>> {
  switch (action.kind) {
    case "update":
      return updateTaskAction(id, action.patch);
    case "status":
      return setTaskStatusAction(id, action.status);
    case "customStatus":
      return setTaskCustomStatusAction(id, action.id);
    case "assign":
      return assignTaskAction(id, action.managerId);
    case "none":
      return Promise.resolve({ ok: false, error: "EMPTY" });
  }
}

/**
 * The "Tareas por tramo" columns: Tarea, Fase, Responsable, Estatus and Vence
 * edit in place with the Tareas table's values, options, locks and actions
 * (`components/tareas/task-cell-edits`); Días de retraso is calculated.
 */
/** Views besides the project's Tareas tab that show its tasks. */
function projectTaskViews(projectId: string): QueryKey[] {
  return [qk.tareas.all, qk.proyectos.list(), qk.proyectos.shell(projectId), qk.me.tasks(), qk.inicio(), qk.shell.badges()];
}

export type ProjectSupportEditDeps = {
  qc: QueryClient;
  projectId: string;
  /** The project's tasks (`qk.proyectos.tab(id, "tareas")`), by id. */
  tasks: Map<string, Pick<TaskListRow, "id" | "managerId" | "support">>;
  /** People the Apoyo editor lists. */
  people: StaffRef[];
  viewer: { caps: Pick<TaskCellViewer["caps"], "canChangeResponsible"> };
};

/**
 * The Apoyo column (#1038) of a project's task table (Resumen "Tareas por
 * tramo", the project Tareas tab): the people multi-select over
 * `setTaskSupportAction`, patching `qk.proyectos.tab(id, "tareas")` first.
 * The Responsable can't be picked; the lock is the Responsable's.
 */
export function projectTaskSupportColumn<Row extends { id: string }>(
  deps: ProjectSupportEditDeps,
  rest: Partial<RecordColumn<Row>> = {},
): RecordColumn<Row> {
  const { qc, projectId, tasks, people, viewer } = deps;
  const key = qk.proyectos.tab(projectId, "tareas");
  const edit: PeopleCellEdit<Row> = {
    kind: "people",
    value: (row) => {
      const task = tasks.get(row.id);
      return task ? taskSupportIds(task) : [];
    },
    options: () => taskSupportOptions(people),
    exclude: (row) => {
      const task = tasks.get(row.id);
      return task ? taskSupportExclude(task) : [];
    },
    excludedLabel: SUPPORT_IS_RESPONSIBLE,
    commit: (row, ids) => {
      if (!tasks.has(row.id)) return Promise.resolve({ ok: false, error: "NOT_FOUND" });
      return optimistic<ProyectoTareasData>(
        qc,
        key,
        (data) => ({ ...data, tasks: data.tasks.map((t) => (t.id === row.id ? taskWithSupport(t, ids, people) : t)) }),
        () => setTaskSupportAction(row.id, ids),
        () => invalidate(qc, [...projectTaskViews(projectId), qk.tasks.detail(row.id)]),
      );
    },
  };
  const canEdit = (row: Row): true | string => (tasks.has(row.id) ? taskSupportLock(viewer) : LOCK_REASON.taskWriter);
  return { key: TASK_SUPPORT_COLUMN, label: SUPPORT_COLUMN_LABEL, ...rest, edit, canEdit };
}

export function resumenTaskColumns(deps: ResumenTaskEditDeps): RecordColumn<TaskRow>[] {
  const { qc, projectId, tasks, phasesByTramo, people, statuses, viewer } = deps;
  const key = qk.proyectos.tab(projectId, "tareas");
  const otherViews = projectTaskViews(projectId);
  const catalogs: TaskCellCatalogs = {
    tramos: [],
    phasesOf: (workflowId) => [...(phasesByTramo[workflowId] ?? [])].sort((a, b) => a.sortOrder - b.sortOrder),
    statuses,
    staff: people,
    spacesOf: () => [],
  };

  function editOf(field: TaskCellField): CellEdit<TaskRow> {
    const base = {
      value: (row: TaskRow) => {
        const task = tasks.get(row.id);
        return task ? taskCellValue(task, field) : null;
      },
      commit: (row: TaskRow, v: string | null): Promise<ActionResult<unknown>> => {
        const task = tasks.get(row.id);
        if (!task) return Promise.resolve({ ok: false, error: "NOT_FOUND" });
        return optimistic<ProyectoTareasData>(
          qc,
          key,
          (data) => ({ ...data, tasks: data.tasks.map((t) => (t.id === row.id ? taskWithChange(t, field, v, catalogs) : t)) }),
          () => runTaskAction(row.id, taskCellAction(task, field, v)),
          () => invalidate(qc, [...otherViews, qk.tasks.detail(row.id)]),
        );
      },
    };
    const options = (row: TaskRow) => {
      const task = tasks.get(row.id);
      return task ? taskCellOptions(task, field, catalogs) : [];
    };
    switch (TASK_KINDS[field]) {
      case "text":
        return { ...base, kind: "text", required: true };
      case "person":
        return { ...base, kind: "person", clearable: true, options };
      case "date":
        return { ...base, kind: "date", quickPicks: true, clearable: true };
      default:
        return { ...base, kind: "select", clearable: field === "fase", options };
    }
  }

  const lockOf = (field: TaskCellField) => (row: TaskRow): true | string => {
    const task = tasks.get(row.id);
    return task ? taskCellLock(task, field, viewer) : LOCK_REASON.taskWriter;
  };

  const column = (key: string, label: string, rest: Partial<RecordColumn<TaskRow>>): RecordColumn<TaskRow> => {
    const field = RESUMEN_TASK_FIELDS[key]!;
    return { key, label, ...rest, edit: editOf(field), canEdit: lockOf(field) };
  };

  return [
    column("title", "Tarea", { width: 360 }),
    column("phase", "Fase", { width: 160 }),
    column("responsable", "Responsable", { width: 170 }),
    projectTaskSupportColumn<TaskRow>({ qc, projectId, tasks, people, viewer }, { width: 110 }),
    column("status", "Estatus", { width: 140 }),
    column("due", "Vence", { mono: true, width: 90 }),
    { key: "daysLate", label: "Días de retraso", align: "right", mono: true, format: "count", width: 130 },
  ];
}
