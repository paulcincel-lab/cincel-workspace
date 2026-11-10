import { and, asc, count, eq, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { taskStatuses, tasks } from "@/lib/db/schema";
import type { TaskStatus, TaskStatusInput, TaskStatusOption } from "@/lib/types/core";

type TaskStatusRow = typeof taskStatuses.$inferSelect;

function toOption(row: TaskStatusRow): TaskStatusOption {
  return {
    id: row.id,
    name: row.name,
    closes: row.closes,
    countsAsCompleted: row.countsAsCompleted,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The value kept in `tasks.status` while a task is in a custom status, so
 * everything keyed on it (overdue checks, completion metrics) treats the task
 * as finished or open. Never shown: the custom status is what the UI displays.
 */
export function underlyingStatus(customStatus: { closes: boolean }): TaskStatus {
  return customStatus.closes ? "completado" : "en_proceso";
}

/**
 * Validate and normalize a status draft; throws a coded error. Only a closing
 * status can count as completed (`INVALID` otherwise); when not given, a
 * closing status counts as completed, as every closing status did before
 * project flow (BE §3.6).
 */
export function normalizeTaskStatusInput(input: TaskStatusInput): Required<TaskStatusInput> {
  const name = input.name.trim();
  if (!name) throw new Error("TASK_STATUS_NAME_REQUIRED");
  const closes = Boolean(input.closes);
  if (input.countsAsCompleted && !closes) throw new Error("INVALID: countsAsCompleted");
  return {
    name,
    closes,
    countsAsCompleted: closes ? (input.countsAsCompleted ?? true) : false,
    sortOrder: input.sortOrder ?? 0,
  };
}

async function assertNameFree(name: string, exceptId?: string) {
  const rows = await db
    .select({ id: taskStatuses.id, name: taskStatuses.name })
    .from(taskStatuses)
    .where(isNull(taskStatuses.deletedAt));
  const taken = rows.some((r) => r.id !== exceptId && r.name.toLowerCase() === name.toLowerCase());
  if (taken) throw new Error("TASK_STATUS_NAME_TAKEN");
}

export async function listTaskStatuses(): Promise<TaskStatusOption[]> {
  const rows = await db
    .select()
    .from(taskStatuses)
    .where(isNull(taskStatuses.deletedAt))
    .orderBy(asc(taskStatuses.sortOrder), asc(taskStatuses.name));
  return rows.map(toOption);
}

export async function createTaskStatus(input: TaskStatusInput): Promise<TaskStatusOption> {
  const values = normalizeTaskStatusInput(input);
  await assertNameFree(values.name);
  const [row] = await db.insert(taskStatuses).values(values).returning();
  return toOption(row);
}

/**
 * Toggling `closes` also re-syncs tasks already in this status (their status
 * and `closed_at`), so they immediately count as finished (or open again).
 */
export async function updateTaskStatus(
  id: string,
  patch: Partial<TaskStatusInput>
): Promise<TaskStatusOption> {
  const [before] = await db
    .select()
    .from(taskStatuses)
    .where(and(eq(taskStatuses.id, id), isNull(taskStatuses.deletedAt)))
    .limit(1);
  if (!before) throw new Error("TASK_STATUS_NOT_FOUND");
  const values = normalizeTaskStatusInput({
    name: patch.name ?? before.name,
    closes: patch.closes ?? before.closes,
    // Kept unless sent; a `closes` change without it takes the default for the new `closes`.
    countsAsCompleted: patch.countsAsCompleted ?? (patch.closes === undefined ? before.countsAsCompleted : undefined),
    sortOrder: patch.sortOrder ?? before.sortOrder,
  });
  await assertNameFree(values.name, id);
  return db.transaction(async (tx) => {
    const [after] = await tx.update(taskStatuses).set(values).where(eq(taskStatuses.id, id)).returning();
    if (values.closes !== before.closes) {
      // Keeps `tasks_closed_at_check` true: closing keeps an existing date, reopening clears it.
      await tx
        .update(tasks)
        .set({
          status: underlyingStatus(values),
          closedAt: values.closes ? sql`coalesce(${tasks.closedAt}, now())` : null,
        })
        .where(eq(tasks.customStatusId, id));
    }
    return toOption(after);
  });
}

/**
 * Live tasks per base status (`tasks.status`), every base present (0 when
 * none). A task in a custom status counts under the status stored beneath it.
 */
export async function countTasksByBaseStatus(): Promise<Record<TaskStatus, number>> {
  const rows = await db
    .select({ status: tasks.status, n: count() })
    .from(tasks)
    .where(isNull(tasks.deletedAt))
    .groupBy(tasks.status);
  const out: Record<TaskStatus, number> = { pendiente: 0, en_proceso: 0, completado: 0, bloqueado: 0 };
  for (const row of rows) out[row.status] = Number(row.n);
  return out;
}

/** Per custom status id: its live tasks and the distinct projects they belong to. */
export async function countCustomStatusUsage(): Promise<Record<string, { tasks: number; projects: number }>> {
  const rows = await db
    .select({
      id: tasks.customStatusId,
      tasks: count(),
      projects: sql<number>`count(distinct ${tasks.projectId})::int`,
    })
    .from(tasks)
    .where(and(isNull(tasks.deletedAt), isNotNull(tasks.customStatusId)))
    .groupBy(tasks.customStatusId);
  const out: Record<string, { tasks: number; projects: number }> = {};
  for (const row of rows) if (row.id) out[row.id] = { tasks: Number(row.tasks), projects: Number(row.projects) };
  return out;
}

/** One transaction, `sort_order` = index (0..n), live statuses only. */
export async function reorderTaskStatuses(orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (const [i, id] of orderedIds.entries()) {
      await tx
        .update(taskStatuses)
        .set({ sortOrder: i })
        .where(and(eq(taskStatuses.id, id), isNull(taskStatuses.deletedAt)));
    }
  });
}

/** Soft-delete; tasks using it fall back to Completado (if it closed) or En proceso. */
export async function softDeleteTaskStatus(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(taskStatuses)
      .set({ deletedAt: new Date() })
      .where(and(eq(taskStatuses.id, id), isNull(taskStatuses.deletedAt)))
      .returning();
    if (!row) throw new Error("TASK_STATUS_NOT_FOUND");
    await tx.update(tasks).set({ customStatusId: null }).where(eq(tasks.customStatusId, id));
  });
}
