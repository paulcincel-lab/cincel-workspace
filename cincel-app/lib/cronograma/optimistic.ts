import type { ScheduleViewData } from "@/lib/actions/schedule-actions";
import type { Imprevisto, ScheduleStatus, ScheduleTask } from "@/lib/types/schedule";

/**
 * Pure patches of the cached Cronograma (`qk.proyectos.cronograma(id)`) for
 * the optimistic status, flag and imprevistos mutations. Each returns a new
 * view and leaves the input untouched; an unknown id returns the view as is.
 */

function patchTask(view: ScheduleViewData, taskId: string, patch: (task: ScheduleTask) => ScheduleTask): ScheduleViewData {
  let changed = false;
  const tasks = view.data.tasks.map((task) => {
    if (task.id !== taskId) return task;
    changed = true;
    return patch(task);
  });
  return changed ? { ...view, data: { ...view.data, tasks } } : view;
}

export function patchTaskStatus(view: ScheduleViewData, taskId: string, status: ScheduleStatus): ScheduleViewData {
  return patchTask(view, taskId, (task) => (task.status === status ? task : { ...task, status }));
}

export function patchTaskFlag(view: ScheduleViewData, taskId: string, flagged: boolean): ScheduleViewData {
  return patchTask(view, taskId, (task) => (task.flagged === flagged ? task : { ...task, flagged }));
}

/** Puts `item` first in the imprevistos list. */
export function patchAddImprevisto(view: ScheduleViewData, item: Imprevisto): ScheduleViewData {
  return { ...view, data: { ...view.data, imprevistos: [item, ...view.data.imprevistos] } };
}

/** Swaps the imprevisto `id` (a temporary one) for `item`. */
export function patchReplaceImprevisto(view: ScheduleViewData, id: string, item: Imprevisto): ScheduleViewData {
  return {
    ...view,
    data: { ...view.data, imprevistos: view.data.imprevistos.map((i) => (i.id === id ? item : i)) },
  };
}

export function patchRemoveImprevisto(view: ScheduleViewData, id: string): ScheduleViewData {
  return { ...view, data: { ...view.data, imprevistos: view.data.imprevistos.filter((i) => i.id !== id) } };
}
