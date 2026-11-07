/**
 * `vencimiento` daily producer (redesign BE §8.3, §9.3, §13): run only by the
 * `daily-digest` job (step 1, through `DAILY_PRODUCERS`). Every open task due
 * tomorrow or already overdue (due before today; a task due today is neither)
 * notifies its manager once per local day
 * (dedupe `vencimiento:<taskId>:<YYYY-MM-DD>`). Admin tasks notify
 * administrators only: their manager when that manager is an administrator,
 * otherwise every active administrator. Closed, archived and deleted tasks,
 * tasks of deleted projects and inactive staff produce nothing.
 */
import { and, eq, isNull, lt, ne, or, sql } from "drizzle-orm";

import { isStaffAdministrator } from "@/lib/auth/access-role";
import { projects, staff, tasks, taskStatuses } from "@/lib/db/schema";
import { notify } from "@/lib/notifications/notify";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";

import type { DailyProducer } from "./index";

/** Local calendar of the app (the regional setting is fixed to it). */
export const VENCIMIENTO_TIME_ZONE = "America/Mexico_City";

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` of `at` in `timeZone`. */
function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Adds whole days to a `YYYY-MM-DD` date (calendar arithmetic, no time zone). */
function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Today and tomorrow in the app's time zone. */
export function vencimientoDates(
  now: Date,
  timeZone: string = VENCIMIENTO_TIME_ZONE,
): { today: string; tomorrow: string } {
  const today = localDate(now, timeZone);
  return { today, tomorrow: addDays(today, 1) };
}

/** `vencimiento:<taskId>:<YYYY-MM-DD>` (one per task per day, BE §9.3). */
export function vencimientoDedupeKey(taskId: string, today: string): string {
  return `vencimiento:${taskId}:${today}`;
}

/** `DD/MM/YYYY` for the notification body. */
function displayDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

export type VencimientoTask = {
  id: string;
  title: string;
  kind: "workflow" | "usuario" | "admin";
  commitmentDate: string;
  projectName: string;
  managerId: string | null;
  managerActive: boolean;
  managerIsAdmin: boolean;
};

/** Copy of one notification: due tomorrow or overdue (Spanish, es-MX). */
export function vencimientoCopy(
  task: Pick<VencimientoTask, "title" | "commitmentDate" | "projectName">,
  today: string,
): { title: string; body: string } {
  const overdue = task.commitmentDate < today;
  return overdue
    ? {
        title: `Tarea vencida: ${task.title}`,
        body: `${task.projectName} · venció el ${displayDate(task.commitmentDate)}`,
      }
    : {
        title: `Vence mañana: ${task.title}`,
        body: `${task.projectName} · vence el ${displayDate(task.commitmentDate)}`,
      };
}

/**
 * Recipients of one task. Non-admin tasks: the active manager, if any. Admin
 * tasks: the manager when active and an administrator, else every active
 * administrator (never anyone else).
 */
export function vencimientoRecipients(task: VencimientoTask, activeAdminIds: readonly string[]): string[] {
  const hasActiveManager = !!task.managerId && task.managerActive;
  if (task.kind !== "admin") return hasActiveManager ? [task.managerId as string] : [];
  if (hasActiveManager && task.managerIsAdmin) return [task.managerId as string];
  return [...activeAdminIds];
}

/** Open tasks due tomorrow or overdue (due before today), live and in live projects. */
async function listVencimientoTasks(db: OwnerDb, today: string, tomorrow: string): Promise<VencimientoTask[]> {
  const rows = await db
    .select({
      id: tasks.id,
      title: tasks.title,
      kind: tasks.kind,
      commitmentDate: tasks.commitmentDate,
      projectName: projects.name,
      managerId: tasks.managerId,
      managerActive: sql<boolean>`coalesce(${staff.active} and ${staff.deletedAt} is null and ${staff.accessRevokedAt} is null, false)`,
      managerRole: staff.role,
      managerEmail: staff.email,
    })
    .from(tasks)
    .innerJoin(projects, and(eq(projects.id, tasks.projectId), isNull(projects.deletedAt)))
    .leftJoin(staff, eq(staff.id, tasks.managerId))
    .leftJoin(taskStatuses, eq(taskStatuses.id, tasks.customStatusId))
    .where(
      and(
        isNull(tasks.deletedAt),
        eq(tasks.archived, false),
        ne(tasks.status, "completado"),
        isNull(tasks.closedAt),
        or(isNull(taskStatuses.id), eq(taskStatuses.closes, false)),
        or(eq(tasks.commitmentDate, tomorrow), lt(tasks.commitmentDate, today)),
      ),
    )
    .orderBy(tasks.commitmentDate, tasks.id);

  return rows
    .filter((row): row is typeof row & { commitmentDate: string } => row.commitmentDate !== null)
    .map((row) => ({
      id: row.id,
      title: row.title,
      kind: row.kind,
      commitmentDate: row.commitmentDate,
      projectName: row.projectName,
      managerId: row.managerId,
      managerActive: row.managerId ? Boolean(row.managerActive) : false,
      managerIsAdmin: row.managerId ? isStaffAdministrator(row.managerRole, row.managerEmail) : false,
    }));
}

/** Active staff whose access role is "Administrador". */
async function listActiveAdministratorIds(db: OwnerDb): Promise<string[]> {
  const rows = await db
    .select({ id: staff.id, role: staff.role, email: staff.email })
    .from(staff)
    .where(and(isNull(staff.deletedAt), eq(staff.active, true), isNull(staff.accessRevokedAt)))
    .orderBy(staff.id);
  return rows.filter((row) => isStaffAdministrator(row.role, row.email)).map((row) => row.id);
}

/** Creates the day's `vencimiento` notifications; returns how many rows were inserted. */
export async function produceVencimientos(db: OwnerDb, now: Date): Promise<{ count: number }> {
  const { today, tomorrow } = vencimientoDates(now);
  const due = await listVencimientoTasks(db, today, tomorrow);
  if (due.length === 0) return { count: 0 };

  const adminIds = due.some((task) => task.kind === "admin") ? await listActiveAdministratorIds(db) : [];

  let count = 0;
  for (const task of due) {
    const recipients = vencimientoRecipients(task, adminIds);
    if (recipients.length === 0) continue;
    const copy = vencimientoCopy(task, today);
    const { created } = await notify(db, recipients, {
      kind: "vencimiento",
      title: copy.title,
      body: copy.body,
      entity: "task",
      entityId: task.id,
      url: `/tareas/${task.id}`,
      dedupeKey: vencimientoDedupeKey(task.id, today),
    });
    count += created;
  }
  return { count };
}

export const vencimientoProducer: DailyProducer = {
  name: "vencimiento",
  run: (ctx) => produceVencimientos(ctx.db, ctx.now),
};
