/**
 * Task checklist → subtasks (#1046). Each live `task_checklist_items` row
 * becomes a subtask of its task: title, done → completado, sort order, the
 * task's creator. An item of a task that is itself a subtask goes to that
 * task's parent (one level of nesting). Idempotent: an item already
 * converted is skipped.
 *
 * Kept for one release, read-only, then dropped in a follow-up:
 * - `core.task_checklist_items` (and `task_attachments.checklist_item_id`);
 * - `TaskChecklistItem`, `TaskDetail.checklistItems`,
 *   `TaskListItem.checklist`, `TaskListRow.checklistTotal` / `checklistDone`.
 *
 * Not this: Mi espacio checklists (`checklist_items`) are a different feature.
 */

/** What one conversion run did. */
export type ChecklistConversionReport = {
  /** Tasks with at least one item. */
  tasksScanned: number;
  /** Items that became subtasks of their own task. */
  itemsConverted: number;
  /** Items of a subtask that became subtasks of its parent. */
  itemsPromotedToParent: number;
  /** Items converted by an earlier run. */
  itemsSkipped: number;
};

/** Converts every task checklist item into a subtask; `dryRun` counts without writing. */
export async function convertChecklistToSubtasks(opts: { dryRun?: boolean } = {}): Promise<ChecklistConversionReport> {
  void opts;
  throw new Error("NOT_IMPLEMENTED: convertChecklistToSubtasks");
}
