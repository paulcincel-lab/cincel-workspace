import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { staff, tasks } from "@/lib/db/schema";
import type { TaskKind } from "@/lib/types/core";

import type { MentionableStaff } from "./task-mentions";

/** The task fields the notify hooks need. */
export type TaskNotifyTarget = {
  id: string;
  title: string;
  kind: TaskKind;
  managerId: string | null;
};

/** An active staff member that can receive a notification. */
export type NotifiableStaff = MentionableStaff & { role: string | null; email: string | null };

/** The live task, or null when it is gone. */
export async function loadTaskNotifyTarget(taskId: string): Promise<TaskNotifyTarget | null> {
  const [row] = await db
    .select({ id: tasks.id, title: tasks.title, kind: tasks.kind, managerId: tasks.managerId })
    .from(tasks)
    .where(and(eq(tasks.id, taskId), isNull(tasks.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Active, live staff; only the given ids when `ids` is passed. */
export async function loadNotifiableStaff(ids?: string[]): Promise<NotifiableStaff[]> {
  if (ids && ids.length === 0) return [];
  const live = and(isNull(staff.deletedAt), eq(staff.active, true));
  return db
    .select({ id: staff.id, name: staff.name, lastName: staff.lastName, role: staff.role, email: staff.email })
    .from(staff)
    .where(ids ? and(live, inArray(staff.id, ids)) : live);
}
