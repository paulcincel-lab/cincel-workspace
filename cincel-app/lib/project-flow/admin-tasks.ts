import { and, eq, inArray, isNull, ne } from "drizzle-orm";

import { isStaffAdministrator } from "@/lib/auth/access-role";
import { TASK_TREND_TIME_ZONE } from "@/lib/dashboard/task-trend";
import { historyEvents, staff, tasks } from "@/lib/db/schema";

import { ASSIGN_CLIENT_SYSTEM_KEY, ASSIGN_CLIENT_TASK_TITLE } from "./catalog";
import type { FlowExecutor, FlowTx } from "./db";
import { flowError, FLOW_ERROR } from "./errors";


/** Today's calendar date (YYYY-MM-DD) in the app's time zone (America/Mexico_City). */
export function todayInAppTimeZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TASK_TREND_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Inserts the admin task "Asignar cliente y origen" (`system_key
 * 'assign_client'`, priority alta, commitment today in America/Mexico_City,
 * no manager) unless it exists (BE §9.4 step 2). Returns the task id, or
 * null when it already existed.
 */
export async function ensureAssignClientTask(tx: FlowTx, projectId: string, actorId: string): Promise<string | null> {
  // tasks_project_system_key_uq (live rows) is the guard: a second call inserts nothing.
  const [row] = await tx
    .insert(tasks)
    .values({
      projectId,
      kind: "admin",
      systemKey: ASSIGN_CLIENT_SYSTEM_KEY,
      title: ASSIGN_CLIENT_TASK_TITLE,
      priority: "alta",
      commitmentDate: todayInAppTimeZone(),
      createdById: actorId,
      managerId: null,
    })
    .onConflictDoNothing()
    .returning({ id: tasks.id });
  return row?.id ?? null;
}

/**
 * Closes the live, open `assign_client` task when the project's client goes
 * from null to a value (BE §9.5). Origin isn't required. No-op when none.
 */
export async function closeAssignClientTask(tx: FlowTx, projectId: string, actorId: string): Promise<void> {
  const [open] = await tx
    .select({ id: tasks.id, status: tasks.status })
    .from(tasks)
    .where(
      and(
        eq(tasks.projectId, projectId),
        eq(tasks.systemKey, ASSIGN_CLIENT_SYSTEM_KEY),
        isNull(tasks.deletedAt),
        isNull(tasks.closedAt),
        ne(tasks.status, "completado")
      )
    )
    .limit(1)
    .for("update");
  if (!open) return;

  await tx
    .update(tasks)
    .set({ status: "completado", customStatusId: null, closedAt: new Date() })
    .where(eq(tasks.id, open.id));

  await tx.insert(historyEvents).values({
    entity: "task",
    entityId: open.id,
    kind: "cambio",
    actorId,
    field: "status",
    beforeValue: open.status,
    afterValue: "completado",
  });
}

/**
 * Every id must be a live, active staff member whose access role is
 * "Administrador" (`staffAccessRole`, lib/auth/access-role.ts), else
 * `ASSIGNEE_NOT_ADMIN` (BE §9.5, RD-12).
 */
export async function assertAdminAssignees(tx: FlowExecutor, staffIds: string[]): Promise<void> {
  const ids = Array.from(new Set(staffIds.filter(Boolean)));
  if (ids.length === 0) return;
  const rows = await tx
    .select({ id: staff.id, role: staff.role, email: staff.email })
    .from(staff)
    .where(and(inArray(staff.id, ids), isNull(staff.deletedAt), eq(staff.active, true)));
  const admins = new Set(rows.filter((r) => isStaffAdministrator(r.role, r.email)).map((r) => r.id));
  if (ids.some((id) => !admins.has(id))) throw flowError(FLOW_ERROR.ASSIGNEE_NOT_ADMIN);
}
