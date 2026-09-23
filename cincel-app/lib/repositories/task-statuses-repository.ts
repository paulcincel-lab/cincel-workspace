import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { taskStatuses, tasks } from "@/lib/db/schema";
import type { TaskStatus, TaskStatusInput, TaskStatusOption } from "@/lib/types/core";

type TaskStatusRow = typeof taskStatuses.$inferSelect;

function toOption(row: TaskStatusRow): TaskStatusOption {
  return { id: row.id, name: row.name, closes: row.closes, sortOrder: row.sortOrder };
}

/**
 * The value kept in `tasks.status` while a task is in a custom status, so
 * everything keyed on it (overdue checks, completion metrics) treats the task
 * as finished or open. Never shown: the custom status is what the UI displays.
 */
export function underlyingStatus(customStatus: { closes: boolean }): TaskStatus {
  return customStatus.closes ? "completado" : "en_proceso";
}

/** Validate and normalize a status draft; throws a coded error. */
export function normalizeTaskStatusInput(input: TaskStatusInput): Required<TaskStatusInput> {
  const name = input.name.trim();
  if (!name) throw new Error("TASK_STATUS_NAME_REQUIRED");
  return { name, closes: Boolean(input.closes), sortOrder: input.sortOrder ?? 0 };
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
 * Toggling `closes` also re-syncs tasks already in this status, so they
 * immediately count as finished (or open again) in metrics.
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
    sortOrder: patch.sortOrder ?? before.sortOrder,
  });
  await assertNameFree(values.name, id);
  return db.transaction(async (tx) => {
    const [after] = await tx.update(taskStatuses).set(values).where(eq(taskStatuses.id, id)).returning();
    if (values.closes !== before.closes) {
      await tx.update(tasks).set({ status: underlyingStatus(values) }).where(eq(tasks.customStatusId, id));
    }
    return toOption(after);
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
