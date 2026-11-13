/**
 * Editable task cells of the Tareas tables (Analítico, Lista; #1025): what
 * each task column shows as its value, which options its editor lists, who
 * may change it (with the locked reason), the task with the change applied
 * (the optimistic patch) and the action that saves it. Pure and client-safe;
 * `useTaskCellEdits` turns these into `CellEdit` columns.
 */
import { LOCK_REASON, type CellOption } from "@/components/widgets/editable-cell";
import type { ActivitiesCapabilities } from "@/lib/auth/permissions";
import type { TareasListFilters } from "@/lib/query/keys";
import type { TareasListPages } from "@/lib/query/options/tareas";
import { SIN_ETAPA_KEY } from "@/lib/tareas/summary";
import {
  BASE_STATUSES,
  BASE_STATUS_COLOR,
  BASE_STATUS_LABEL,
  customStatusValue,
  parseStatusValue,
  statusSelectValue,
} from "@/lib/tasks/status-options";
import { etapaColorVar } from "@/lib/etapas/compat";
import type {
  ProjectSpaceRef,
  StaffRef,
  TaskListItem,
  TaskPatch,
  TaskPriority,
  TaskStatusOption,
  WorkflowPhaseRef,
  WorkflowRef,
} from "@/lib/types/core";

import { PRIORITY_LABEL, taskDueDate } from "./tablero-table";
import { hoursFieldText, hoursOfCellValue } from "./task-hours";

/** The task columns that edit in place. */
export type TaskCellField =
  | "tarea"
  | "etapa"
  | "fase"
  | "estatus"
  | "responsable"
  | "prioridad"
  | "vence"
  | "compromiso"
  | "revision"
  | "espacio"
  | "horas";

/** What a task cell reads: a `TaskListItem` or a `TaskListRow`. */
export type TaskCellTask = Pick<
  TaskListItem,
  | "id"
  | "projectId"
  | "kind"
  | "title"
  | "workflowId"
  | "workflow"
  | "phaseId"
  | "phase"
  | "spaceId"
  | "space"
  | "status"
  | "customStatus"
  | "managerId"
  | "manager"
  | "support"
  | "priority"
  | "commitmentDate"
  | "reviewDate"
  | "deliveryDate"
  | "parentTaskId"
  | "estimatedHours"
>;

/** The lists the editors offer. */
export type TaskCellCatalogs = {
  etapas: WorkflowRef[];
  /** Active fases of an etapa (empty until loaded). */
  phasesOf(workflowId: string): WorkflowPhaseRef[];
  statuses: TaskStatusOption[];
  staff: StaffRef[];
  /** Espacios of a project (empty until loaded). */
  spacesOf(projectId: string): ProjectSpaceRef[];
};

/** Who is editing: an admin (`canSeeAdminData`) and their activity capabilities. */
export type TaskCellViewer = {
  admin: boolean;
  caps: Pick<ActivitiesCapabilities, "canCreateActivity" | "canChangeResponsible" | "statusScope">;
};

/** Which action saves a field (and which invalidations follow it). */
export type TaskCellAction =
  | { kind: "update"; patch: TaskPatch }
  | { kind: "status"; status: TaskListItem["status"] }
  | { kind: "customStatus"; id: string }
  | { kind: "assign"; managerId: string | null }
  | { kind: "hours"; hours: number | null }
  | { kind: "none" };

const PRIORITIES: TaskPriority[] = ["alta", "media", "baja"];

/** The date field "Vence" shows (`taskDueDate`): the commitment date when set, else the delivery date. */
export function dueDateField(task: Pick<TaskCellTask, "commitmentDate">): "commitmentDate" | "deliveryDate" {
  return task.commitmentDate ? "commitmentDate" : "deliveryDate";
}

function day(date: string | null): string | null {
  return date ? date.slice(0, 10) : null;
}

/** The cell's value: an option value, an ISO date or the title. */
export function taskCellValue(task: TaskCellTask, field: TaskCellField): string | null {
  switch (field) {
    case "tarea":
      return task.title;
    case "etapa":
      return task.workflowId;
    case "fase":
      return task.phaseId;
    case "estatus":
      return statusSelectValue(task);
    case "responsable":
      return task.managerId;
    case "prioridad":
      return task.priority;
    case "vence":
      return taskDueDate(task);
    case "compromiso":
      return day(task.commitmentDate);
    case "revision":
      return day(task.reviewDate);
    case "espacio":
      return task.spaceId;
    case "horas":
      return task.estimatedHours === null || task.estimatedHours === undefined ? null : hoursFieldText(task.estimatedHours);
  }
}

/** true, or why the viewer can't change this cell (`resolveActivitiesCapabilities` and the task rules). */
export function taskCellLock(task: TaskCellTask, field: TaskCellField, viewer: TaskCellViewer): true | string {
  const { caps } = viewer;
  // Estatus and Responsable have their own capability (their actions check only it).
  if (field === "estatus") return caps.statusScope === "none" ? LOCK_REASON.status : true;
  if (field === "responsable") return caps.canChangeResponsible ? true : LOCK_REASON.responsible;
  if (!caps.canCreateActivity) return LOCK_REASON.taskWriter;
  const adminTask = task.kind === "admin";
  if (field === "etapa") {
    if (adminTask) return LOCK_REASON.adminTask;
    // Setting a missing etapa is open to task writers; moving the task is admins only.
    return task.workflowId !== null && !viewer.admin ? LOCK_REASON.etapa : true;
  }
  if (field === "fase") {
    if (adminTask) return LOCK_REASON.adminTask;
    return task.parentTaskId ? LOCK_REASON.subtaskPhase : true;
  }
  if (field === "espacio" && adminTask) return LOCK_REASON.adminTask;
  return true;
}

/** Colour of a status dot (the status tokens of `statusDotClass`). */
function statusColor(token: string): string {
  return `var(--${token})`;
}

/**
 * The options of a list cell (`select` / `person`). The "Sin …" entry of a
 * clearable cell comes from `CellEditor` ("Sin asignar" first, "Sin fase" /
 * "Sin espacio" last).
 */
export function taskCellOptions(task: TaskCellTask, field: TaskCellField, catalogs: TaskCellCatalogs): CellOption[] {
  switch (field) {
    case "etapa":
      return [...catalogs.etapas]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((t) => ({ value: t.id, label: t.name, color: etapaColorVar(t.key, t.sortOrder) }));
    case "fase": {
      const phases = task.workflowId ? catalogs.phasesOf(task.workflowId) : [];
      return phases.map((p) => ({ value: p.id, label: p.name }));
    }
    case "estatus":
      return [
        ...BASE_STATUSES.map((s) => ({ value: s, label: BASE_STATUS_LABEL[s], color: statusColor(BASE_STATUS_COLOR[s]) })),
        ...catalogs.statuses.map((c) => ({
          value: customStatusValue(c.id),
          label: c.name,
          color: statusColor(c.closes ? BASE_STATUS_COLOR.completado : BASE_STATUS_COLOR.en_proceso),
        })),
      ];
    case "responsable":
      return [...catalogs.staff]
        .sort((a, b) => a.name.localeCompare(b.name, "es"))
        .map((s) => ({ value: s.id, label: s.name, avatar: { name: s.name } }));
    case "prioridad":
      return PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }));
    case "espacio":
      return catalogs.spacesOf(task.projectId).map((s) => ({ value: s.id, label: s.name }));
    default:
      return [];
  }
}

/** The task as it reads once `value` is saved in `field` (the optimistic patch). */
export function taskWithChange<T extends TaskCellTask>(
  task: T,
  field: TaskCellField,
  value: string | null,
  catalogs: Pick<TaskCellCatalogs, "etapas" | "phasesOf" | "statuses" | "staff" | "spacesOf">,
): T {
  switch (field) {
    case "tarea":
      return value ? { ...task, title: value.trim() } : task;
    case "etapa": {
      if (value === task.workflowId) return task;
      const etapa = catalogs.etapas.find((t) => t.id === value) ?? null;
      // A fase belongs to one etapa: moving the task clears it (the server does the same).
      return { ...task, workflowId: value, workflow: etapa, phaseId: null, phase: null };
    }
    case "fase": {
      const phase = value && task.workflowId ? catalogs.phasesOf(task.workflowId).find((p) => p.id === value) : undefined;
      return { ...task, phaseId: value, phase: phase ? { id: phase.id, name: phase.name, sortOrder: phase.sortOrder } : null };
    }
    case "estatus": {
      if (!value) return task;
      const parsed = parseStatusValue(value);
      if (parsed.kind === "base") return { ...task, status: parsed.status, customStatus: null };
      const custom = catalogs.statuses.find((s) => s.id === parsed.id);
      if (!custom) return task;
      return {
        ...task,
        status: custom.closes ? "completado" : "en_proceso",
        customStatus: { id: custom.id, name: custom.name, closes: custom.closes, countsAsCompleted: custom.countsAsCompleted },
      };
    }
    case "responsable": {
      const person = value ? catalogs.staff.find((s) => s.id === value) : undefined;
      return { ...task, managerId: value, manager: person ? { id: person.id, name: person.name } : null };
    }
    case "prioridad":
      return value ? { ...task, priority: value as TaskPriority } : task;
    case "vence":
      return { ...task, [dueDateField(task)]: value };
    case "compromiso":
      return { ...task, commitmentDate: value };
    case "revision":
      return { ...task, reviewDate: value };
    case "horas":
      return { ...task, estimatedHours: hoursOfCellValue(value) };
    case "espacio": {
      const space = value ? catalogs.spacesOf(task.projectId).find((s) => s.id === value) : undefined;
      return { ...task, spaceId: value, space: space ? { id: space.id, name: space.name } : null };
    }
  }
}

/** The action that saves `value` in `field`. */
export function taskCellAction(task: TaskCellTask, field: TaskCellField, value: string | null): TaskCellAction {
  switch (field) {
    case "tarea": {
      const title = value?.trim();
      return title ? { kind: "update", patch: { title } } : { kind: "none" };
    }
    case "etapa":
      return value ? { kind: "update", patch: { workflowId: value } } : { kind: "none" };
    case "fase":
      return { kind: "update", patch: { phaseId: value } };
    case "estatus": {
      if (!value) return { kind: "none" };
      const parsed = parseStatusValue(value);
      return parsed.kind === "base" ? { kind: "status", status: parsed.status } : { kind: "customStatus", id: parsed.id };
    }
    case "responsable":
      return { kind: "assign", managerId: value };
    case "prioridad":
      return value ? { kind: "update", patch: { priority: value as TaskPriority } } : { kind: "none" };
    case "vence":
      return { kind: "update", patch: { [dueDateField(task)]: value } };
    case "compromiso":
      return { kind: "update", patch: { commitmentDate: value } };
    case "revision":
      return { kind: "update", patch: { reviewDate: value } };
    case "espacio":
      return { kind: "update", patch: { spaceId: value } };
    case "horas":
      return { kind: "hours", hours: hoursOfCellValue(value) };
  }
}

// ── Apoyo (#1038) ───────────────────────────────────────────────────────────

/** The column key of the Apoyo (equipo de apoyo) cell in every task table. */
export const TASK_SUPPORT_COLUMN = "apoyo";

/** The ids of the task's equipo de apoyo (the people editor's value). */
export function taskSupportIds(task: Pick<TaskCellTask, "support">): string[] {
  return task.support.map((s) => s.id);
}

/** true, or why the viewer can't change the equipo de apoyo: the Responsable's rule (`setTaskSupportAction`). */
export function taskSupportLock(viewer: { caps: Pick<ActivitiesCapabilities, "canChangeResponsible"> }): true | string {
  return viewer.caps.canChangeResponsible ? true : LOCK_REASON.support;
}

/** The people the Apoyo editor lists: the staff by name, with avatars. */
export function taskSupportOptions(staff: readonly StaffRef[]): CellOption[] {
  return [...staff]
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((s) => ({ value: s.id, label: s.name, avatar: { name: s.name } }));
}

/** Who can't be picked as apoyo: the task's Responsable. */
export function taskSupportExclude(task: Pick<TaskCellTask, "managerId">): string[] {
  return task.managerId ? [task.managerId] : [];
}

/** The task with `ids` as its equipo de apoyo (the optimistic patch); names from `staff` or the current support. */
export function taskWithSupport<T extends Pick<TaskCellTask, "support">>(task: T, ids: readonly string[], staff: readonly StaffRef[]): T {
  const known = new Map<string, StaffRef>([...task.support, ...staff].map((s) => [s.id, { id: s.id, name: s.name }]));
  const support = [...new Set(ids)].map((id) => known.get(id) ?? { id, name: "" });
  return { ...task, support };
}

/** Whether a task's etapa passes a `tareas.list` etapa filter (a key, a comma list or "Sin etapa"). */
export function matchesEtapaFilter(filter: string | null, etapaKey: string | null): boolean {
  if (!filter) return true;
  const keys = filter
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  return keys.some((k) => (k === SIN_ETAPA_KEY ? etapaKey === null : k === etapaKey));
}

/**
 * One `tareas.list(f)` cache with a task changed: the row (and, after an etapa
 * move, its subtasks) patched with `patch`, dropped from a list whose etapa
 * filter it no longer passes, and put first in an etapa-scoped list of its
 * project it now joins (`moved`, the patched row, when it came from another
 * list). The same object when nothing changes.
 */
export function patchTaskListPages(
  data: TareasListPages,
  filters: TareasListFilters | undefined,
  taskId: string,
  patch: <R extends TaskCellTask>(row: R) => R,
  options: { subtasks?: boolean; moved?: TareasListPages["pages"][number]["rows"][number] } = {},
): TareasListPages {
  const etapaFilter = filters?.etapa ?? null;
  let changed = false;
  let found = false;
  const pages = data.pages.map((page) => {
    let pageChanged = false;
    const rows = page.rows.flatMap((row) => {
      const target = row.id === taskId || (options.subtasks === true && row.parentTaskId === taskId);
      if (!target) return [row];
      if (row.id === taskId) found = true;
      const next = patch(row);
      if (next === row) return [row];
      pageChanged = true;
      return matchesEtapaFilter(etapaFilter, next.workflow?.key ?? null) ? [next] : [];
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, rows };
  });
  const moved = options.moved;
  if (
    !found &&
    moved &&
    etapaFilter &&
    pages.length > 0 &&
    (!filters?.proyecto || filters.proyecto === moved.projectId) &&
    (!filters?.proyectos?.length || filters.proyectos.includes(moved.projectId)) &&
    matchesEtapaFilter(etapaFilter, moved.workflow?.key ?? null)
  ) {
    changed = true;
    pages[0] = { ...pages[0], rows: [moved, ...pages[0].rows] };
  }
  return changed ? { ...data, pages } : data;
}
