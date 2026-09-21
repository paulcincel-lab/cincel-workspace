import { and, asc, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { taskStatuses, tasks } from "@/lib/db/schema";
import type { TaskStatus, TaskStatusInput, TaskStatusOption } from "@/lib/types/core";

type TaskStatusRow = typeof taskStatuses.$inferSelect;

const BASE_STATUSES: readonly TaskStatus[] = ["pendiente", "en_proceso", "completado", "bloqueado"];

function toOption(row: TaskStatusRow): TaskStatusOption {
  return { id: row.id, name: row.name, baseStatus: row.baseStatus, sortOrder: row.sortOrder };
}

/** Validate and normalize a status draft; throws a coded error. */
export function normalizeTaskStatusInput(input: TaskStatusInput): Required<TaskStatusInput> {
  const name = input.name.trim();
  if (!name) throw new Error("TASK_STATUS_NAME_REQUIRED");
  if (!BASE_STATUSES.includes(input.baseStatus)) throw new Error("TASK_STATUS_BASE_INVALID");
  return { name, baseStatus: input.baseStatus, sortOrder: input.sortOrder ?? 0 };
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
 * Editing the base status also re-syncs tasks already using this status, so
 * `tasks.status` (the source of truth for metrics) never drifts from it.
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
    baseStatus: patch.baseStatus ?? before.baseStatus,
    sortOrder: patch.sortOrder ?? before.sortOrder,
  });
  await assertNameFree(values.name, id);
  return db.transaction(async (tx) => {
    const [after] = await tx.update(taskStatuses).set(values).where(eq(taskStatuses.id, id)).returning();
    if (values.baseStatus !== before.baseStatus) {
      await tx.update(tasks).set({ status: values.baseStatus }).where(eq(tasks.customStatusId, id));
    }
    return toOption(after);
  });
}

/** Soft-delete; tasks using it fall back to their (unchanged) base status. */
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
