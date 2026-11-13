/**
 * Bulk changes of the task tables (#1040): what each field of the bar shows
 * and saves, the patch `bulkUpdateTasksAction` takes, the patches that undo
 * it, the toast and the query keys to refresh. Pure and client-safe; the bar
 * is `TaskBulkBar`.
 */
import type { QueryKey } from "@tanstack/react-query";

import type { CellOption, CellValue } from "@/components/widgets/editable-cell";
import { qk } from "@/lib/query/keys";
import { taskDeleteInvalidations, taskStatusInvalidations } from "@/lib/query/options/tareas";
import { parseStatusValue, statusSelectValue } from "@/lib/tasks/status-options";
import type { TaskBulkPatch, TaskBulkResult, TaskListItem, WorkflowPhaseRef } from "@/lib/types/core";

import { taskDueDate } from "./tablero-table";
import { dueDateField, type TaskCellTask } from "./task-cell-edits";
import { hoursFieldText, hoursOfCellValue } from "./task-hours";
import { BULK_SKIPPED_TOAST, BULK_UPDATED_TOAST } from "./task-table-copy";

/** What the bar reads of a selected task (a `TaskListItem` or a `TaskListRow`). */
export type TaskBulkTask = TaskCellTask & Pick<TaskListItem, "support">;

/** The fields of the bar, in its order. */
export type TaskBulkField = "estatus" | "responsable" | "apoyo" | "fase" | "vence" | "horas";

export const TASK_BULK_FIELDS: readonly TaskBulkField[] = ["estatus", "responsable", "apoyo", "fase", "vence", "horas"];

/** A task's current value of a field, as the editors read it. */
export function bulkValueOf(task: TaskBulkTask, field: TaskBulkField): CellValue {
  switch (field) {
    case "estatus":
      return statusSelectValue(task);
    case "responsable":
      return task.managerId;
    case "apoyo":
      return task.support.map((s) => s.id);
    case "fase":
      return task.phaseId;
    case "vence":
      return taskDueDate(task);
    case "horas":
      return task.estimatedHours === null || task.estimatedHours === undefined ? null : hoursFieldText(task.estimatedHours);
  }
}

function key(value: CellValue): string {
  return Array.isArray(value) ? [...value].sort().join(",") : (value ?? "\u0000");
}

/** The value every task shares (the editor's checked option), else empty (null, or [] for Apoyo). */
export function commonValue(tasks: readonly TaskBulkTask[], field: TaskBulkField): CellValue {
  const empty: CellValue = field === "apoyo" ? [] : null;
  if (tasks.length === 0) return empty;
  const first = bulkValueOf(tasks[0], field);
  return tasks.every((task) => key(bulkValueOf(task, field)) === key(first)) ? first : empty;
}

/** The one-field patch of a picked value; null when the value can't be saved (no status). */
export function bulkPatchOf(field: TaskBulkField, value: CellValue): TaskBulkPatch | null {
  switch (field) {
    case "estatus": {
      if (typeof value !== "string" || value === "") return null;
      const parsed = parseStatusValue(value);
      return parsed.kind === "base" ? { status: parsed.status } : { customStatusId: parsed.id };
    }
    case "responsable":
      return { managerId: typeof value === "string" ? value : null };
    case "apoyo":
      return { supportIds: Array.isArray(value) ? value : [] };
    case "fase":
      return { phaseId: typeof value === "string" ? value : null };
    case "vence":
      return { dueDate: typeof value === "string" ? value : null };
    case "horas":
      return { estimatedHours: hoursOfCellValue(value) };
  }
}

/**
 * Deshacer: the patches that put the updated tasks back, one call per
 * previous value (tasks that had the same value go together).
 */
export function undoPatches(
  before: readonly TaskBulkTask[],
  field: TaskBulkField,
  updated: readonly string[],
): { ids: string[]; patch: TaskBulkPatch }[] {
  const changed = new Set(updated);
  const byValue = new Map<string, { ids: string[]; patch: TaskBulkPatch }>();
  for (const task of before) {
    if (!changed.has(task.id)) continue;
    const previous = bulkValueOf(task, field);
    const base = bulkPatchOf(field, previous);
    if (!base) continue;
    // Vence goes back into the date it came from, even after a clear left only the other one.
    const dueField = field === "vence" ? dueDateField(task) : undefined;
    const patch: TaskBulkPatch = dueField && "dueDate" in base ? { ...base, dueField } : base;
    const k = dueField ? `${dueField}:${key(previous)}` : key(previous);
    const entry = byValue.get(k);
    if (entry) entry.ids.push(task.id);
    else byValue.set(k, { ids: [task.id], patch });
  }
  return [...byValue.values()];
}

/** "3 tareas actualizadas. 1 tarea no se cambió por permisos." */
export function bulkResultToast(result: TaskBulkResult): string {
  const parts = [BULK_UPDATED_TOAST(result.updated.length)];
  if (result.skipped.length > 0) parts.push(BULK_SKIPPED_TOAST(result.skipped.length));
  return parts.join(" ");
}

/**
 * What a bulk change or delete refreshes: every Tareas view, each project's
 * Tareas tab, resumen and cronograma, Inicio, the badges, Mi espacio and the
 * tasks' detail.
 */
export function bulkInvalidations(tasks: readonly TaskBulkTask[]): QueryKey[] {
  const seen = new Set<string>();
  const keys: QueryKey[] = [];
  const add = (k: QueryKey) => {
    const s = JSON.stringify(k);
    if (seen.has(s)) return;
    seen.add(s);
    keys.push(k);
  };
  for (const projectId of new Set(tasks.map((t) => t.projectId))) {
    taskStatusInvalidations(projectId).forEach(add);
    taskDeleteInvalidations(projectId).forEach(add);
  }
  for (const task of tasks) add(qk.tasks.detail(task.id));
  return keys;
}

/**
 * The Fase options for the selected tasks: the fases of their etapas (tasks
 * of another etapa are skipped by the server). With several etapas each
 * option says its etapa.
 */
export function bulkPhaseOptions(
  tasks: readonly TaskBulkTask[],
  phasesOf: (workflowId: string) => readonly WorkflowPhaseRef[],
): CellOption[] {
  const etapas = new Map<string, string>();
  for (const task of tasks) if (task.workflowId) etapas.set(task.workflowId, task.workflow?.name ?? "");
  const several = etapas.size > 1;
  return [...etapas].flatMap(([id, name]) =>
    phasesOf(id).map((phase) => ({ value: phase.id, label: several && name ? `${name} · ${phase.name}` : phase.name })),
  );
}
