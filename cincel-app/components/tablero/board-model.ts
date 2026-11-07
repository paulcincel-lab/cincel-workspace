import type { TaskListItem, TaskStatus, TaskStatusOption } from "@/lib/types/core";
import { BASE_STATUSES, BASE_STATUS_LABEL, customStatusValue, statusSelectValue } from "@/lib/tasks/status-options";

/**
 * The task board model shared by the legacy `/tablero` page and the
 * `TaskBoardWidget` of the redesign widget library: columns, where each task
 * sits, and flattening the per-status board the actions return.
 */

/** A board column: one per built-in status, then one per custom status. Keyed by the status select value. */
export type BoardColumn = { key: string; label: string };

/** Every task of a per-status board, in built-in status order. */
export function flattenBoard(board: Record<TaskStatus, TaskListItem[]>): TaskListItem[] {
  return BASE_STATUSES.flatMap((s) => board[s] ?? []);
}

/** The built-in status columns followed by the given custom statuses. */
export function boardColumns(customStatuses: Pick<TaskStatusOption, "id" | "name">[]): BoardColumn[] {
  return [
    ...BASE_STATUSES.map((s) => ({ key: s as string, label: BASE_STATUS_LABEL[s] })),
    ...customStatuses.map((c) => ({ key: customStatusValue(c.id), label: c.name })),
  ];
}

/** The custom statuses the tasks are in, deduplicated, in first-seen order. */
export function customStatusesOf(tasks: TaskListItem[]): { id: string; name: string }[] {
  const seen = new Map<string, { id: string; name: string }>();
  for (const t of tasks) {
    if (t.customStatus && !seen.has(t.customStatus.id)) {
      seen.set(t.customStatus.id, { id: t.customStatus.id, name: t.customStatus.name });
    }
  }
  return [...seen.values()];
}

/**
 * Groups tasks into the columns. Each task sits in its custom status's column
 * when it has one, else in its built-in status's. `columnOf` overrides where a
 * task sits (e.g. an optimistic move not yet confirmed by the server).
 */
export function groupTasksByColumn(
  tasks: TaskListItem[],
  columns: BoardColumn[],
  columnOf: (task: TaskListItem) => string = statusSelectValue,
): Record<string, TaskListItem[]> {
  const keys = new Set(columns.map((c) => c.key));
  const next: Record<string, TaskListItem[]> = Object.fromEntries(columns.map((c) => [c.key, []]));
  tasks.forEach((t) => {
    const key = columnOf(t);
    next[keys.has(key) ? key : t.status].push(t);
  });
  return next;
}
