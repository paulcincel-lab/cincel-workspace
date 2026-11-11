/**
 * Task checklist → subtasks (#1046). Each `task_checklist_items` row of a
 * live task becomes a subtask of that task: same title, done → completado,
 * the checklist order kept (after the task's ordered subtasks), the task's
 * creator. An item of a task that is itself a subtask of a live task goes to
 * that parent instead (one level of nesting). Idempotent: a converted item
 * carries `converted_at` and is skipped by later runs.
 *
 * Kept for one release, read-only, then dropped in a follow-up:
 * - `core.task_checklist_items` (and `task_attachments.checklist_item_id`);
 * - `TaskChecklistItem`, `TaskDetail.checklistItems`,
 *   `TaskListItem.checklist`, `TaskListRow.checklistTotal` / `checklistDone`.
 *
 * Rollback: soft-delete the tasks listed in `converted_task_id`, then clear
 * `converted_task_id` and `converted_at` on the items.
 *
 * Run it with `npm run tasks:convert-checklists` (scripts/convert-task-checklists.ts).
 *
 * Relative imports: scripts run this file with tsx.
 *
 * Not this: Mi espacio checklists (`checklist_items`) are a different feature.
 */
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { alias, type PgDatabase, type PgQueryResultHKT } from "drizzle-orm/pg-core";

import { taskChecklistItems, tasks } from "../db/schema";

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

/** Any drizzle Postgres database (the app client or a script's own). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = PgDatabase<PgQueryResultHKT, any>;

type TaskRow = typeof tasks.$inferSelect;

type PlannedItem = {
  itemId: string;
  title: string;
  completed: boolean;
  completedAt: Date;
  createdById: string;
  target: TaskRow;
  promoted: boolean;
};

export type ChecklistConversionOptions = {
  /** Counts without writing. */
  dryRun?: boolean;
  /** Only the items of these tasks (tests, a staged run); all tasks when left out. */
  taskIds?: string[];
  /** Defaults to the app client; scripts pass their own. */
  db?: Database;
};

/**
 * Converts every task checklist item into a subtask. All the writes run in
 * one transaction.
 */
export async function convertChecklistToSubtasks(
  opts: ChecklistConversionOptions = {}
): Promise<ChecklistConversionReport> {
  const database: Database = opts.db ?? ((await import("../db/client")).db as unknown as Database);
  if (opts.taskIds && opts.taskIds.length === 0) {
    return { tasksScanned: 0, itemsConverted: 0, itemsPromotedToParent: 0, itemsSkipped: 0 };
  }
  if (opts.dryRun) return planAndApply(database, false, opts.taskIds);
  return database.transaction(async (tx) => {
    // Two runs at once would both see the same unconverted items.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('task_checklist_conversion'))`);
    return planAndApply(tx as unknown as Database, true, opts.taskIds);
  });
}

async function planAndApply(
  database: Database,
  write: boolean,
  taskIds: string[] | undefined
): Promise<ChecklistConversionReport> {
  const owner = alias(tasks, "owner");
  const parent = alias(tasks, "parent");

  const rows = await database
    .select({
      itemId: taskChecklistItems.id,
      title: taskChecklistItems.title,
      completed: taskChecklistItems.completed,
      updatedAt: taskChecklistItems.updatedAt,
      convertedAt: taskChecklistItems.convertedAt,
      owner,
      parent,
    })
    .from(taskChecklistItems)
    .innerJoin(owner, and(eq(owner.id, taskChecklistItems.taskId), isNull(owner.deletedAt)))
    .leftJoin(parent, and(eq(parent.id, owner.parentTaskId), isNull(parent.deletedAt)))
    .where(taskIds ? inArray(taskChecklistItems.taskId, taskIds) : undefined)
    .orderBy(
      asc(owner.createdAt),
      asc(owner.id),
      asc(taskChecklistItems.sortOrder),
      asc(taskChecklistItems.createdAt),
      asc(taskChecklistItems.id)
    );

  const report: ChecklistConversionReport = {
    tasksScanned: new Set(rows.map((r) => r.owner.id)).size,
    itemsConverted: 0,
    itemsPromotedToParent: 0,
    itemsSkipped: 0,
  };

  const planned: PlannedItem[] = [];
  for (const r of rows) {
    if (r.convertedAt) {
      report.itemsSkipped += 1;
      continue;
    }
    // A child whose parent is gone behaves as top-level, so it keeps its own items.
    const promoted = r.parent !== null;
    if (promoted) report.itemsPromotedToParent += 1;
    else report.itemsConverted += 1;
    planned.push({
      itemId: r.itemId,
      title: r.title.trim() || "Sin título",
      completed: r.completed,
      completedAt: r.updatedAt,
      createdById: r.owner.createdById,
      target: r.parent ?? r.owner,
      promoted,
    });
  }
  if (!write || planned.length === 0) return report;

  // Own items first, then the promoted ones, each in checklist order (stable sort).
  planned.sort((a, b) => Number(a.promoted) - Number(b.promoted));

  const targetIds = [...new Set(planned.map((p) => p.target.id))];
  const maxOrders = await database
    .select({ parentId: tasks.parentTaskId, max: sql<number | null>`max(${tasks.sortOrder})` })
    .from(tasks)
    .where(and(inArray(tasks.parentTaskId, targetIds), isNotNull(tasks.sortOrder)))
    .groupBy(tasks.parentTaskId);
  const nextOrder = new Map(maxOrders.map((m) => [m.parentId!, Number(m.max ?? 0)]));

  const now = new Date();
  for (const item of planned) {
    const t = item.target;
    const order = (nextOrder.get(t.id) ?? 0) + 1;
    nextOrder.set(t.id, order);
    // An admin parent makes an admin child (no tramo, fase or espacio); otherwise
    // the child takes the parent's tramo and fase, as createSubtask does.
    const admin = t.kind === "admin";
    const [sub] = await database
      .insert(tasks)
      .values({
        projectId: t.projectId,
        parentTaskId: t.id,
        kind: admin ? "admin" : "usuario",
        templateId: null,
        workflowId: admin ? null : t.workflowId,
        phaseId: admin ? null : t.phaseId,
        title: item.title,
        createdById: item.createdById,
        status: item.completed ? "completado" : "pendiente",
        closedAt: item.completed ? item.completedAt : null,
        sortOrder: order,
      })
      .returning({ id: tasks.id });
    await database
      .update(taskChecklistItems)
      .set({ convertedTaskId: sub.id, convertedAt: now })
      .where(and(eq(taskChecklistItems.id, item.itemId), isNull(taskChecklistItems.convertedAt)));
  }
  return report;
}
