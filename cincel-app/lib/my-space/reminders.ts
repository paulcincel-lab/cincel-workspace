/**
 * Reminder firing (redesign BE §8.5; cron job `reminders-fire`, Phase 5):
 * due, open reminders (limit 500, `for update skip locked`) → `notify` with
 * kind `recordatorio`; non-repeating get `fired_at`, repeating move `due_at`
 * forward one period until it is in the future.
 */
import { and, asc, eq, isNull, lte } from "drizzle-orm";

import { projects, reminders, tasks } from "@/lib/db/schema";
import { notify } from "@/lib/notifications/notify";
import type { FlowDb } from "@/lib/project-flow/db";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import type { Reminder, ReminderChannel, ReminderRepeat } from "@/lib/types/redesign";

import {
  ORG_TIME_ZONE,
  addDays,
  addMonths,
  daysInMonth,
  localParts,
  zonedTimeToUtc,
  type LocalDate,
} from "./zoned-time";

/** Reminders fired per tick at most (BE §8.5). */
export const FIRE_BATCH_LIMIT = 500;

type ReminderRow = typeof reminders.$inferSelect;

/** `recordatorio:<id>:<dueAt ISO>` (BE §9.3): one notification per occurrence. */
export function reminderDedupeKey(id: string, dueAt: Date): string {
  return `recordatorio:${id}:${dueAt.toISOString()}`;
}

/** Where the notification opens: the linked task, else the linked project, else Mi espacio. */
export function reminderUrl(row: Pick<ReminderRow, "taskId" | "projectId">): string {
  if (row.taskId) return `/tareas/${row.taskId}`;
  if (row.projectId) return `/proyectos/${row.projectId}`;
  return "/mi-espacio";
}

export function toReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    text: row.text,
    dueAt: row.dueAt.toISOString(),
    repeat: row.repeat,
    channels: row.channels.filter((c): c is ReminderChannel => c === "app" || c === "email"),
    taskId: row.taskId,
    projectId: row.projectId,
    firedAt: row.firedAt ? row.firedAt.toISOString() : null,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
  };
}

export async function fireDueReminders(db: OwnerDb, now: Date): Promise<{ count: number }> {
  return (db as FlowDb).transaction(async (tx) => {
    // Rows another tick already holds are skipped, never fired twice.
    const due = await tx
      .select()
      .from(reminders)
      .where(and(lte(reminders.dueAt, now), isNull(reminders.firedAt), isNull(reminders.cancelledAt)))
      .orderBy(asc(reminders.dueAt))
      .limit(FIRE_BATCH_LIMIT)
      .for("update", { skipLocked: true });

    for (const row of due) {
      await notify(tx, [row.staffId], {
        kind: "recordatorio",
        title: row.text,
        url: reminderUrl(row),
        dedupeKey: reminderDedupeKey(row.id, row.dueAt),
        // The reminder's own channels decide; quiet hours still defer the email (BE §8.3).
        force: { inApp: row.channels.includes("app"), email: row.channels.includes("email") },
      });
      const patch =
        row.repeat === "none"
          ? { firedAt: now, updatedAt: now }
          : { dueAt: nextOccurrence(row.dueAt, row.repeat, now), updatedAt: now };
      await tx.update(reminders).set(patch).where(eq(reminders.id, row.id));
    }
    return { count: due.length };
  });
}

/**
 * Next occurrence after `now` (monthly: same day of month clamped to month end).
 * Periods are counted in the org's wall time from `dueAt`, so the time of day
 * stays put and a monthly reminder on the 31st falls on the 30th or 28th/29th
 * of shorter months and returns to the 31st when the month has one.
 */
export function nextOccurrence(dueAt: Date, repeat: Exclude<ReminderRepeat, "none">, now: Date): Date {
  const tz = ORG_TIME_ZONE;
  const start = localParts(dueAt, tz);
  const startDate = { year: start.year, month: start.month, day: start.day };
  for (let n = 1; ; n++) {
    let date: LocalDate;
    if (repeat === "daily") date = addDays(startDate, n);
    else if (repeat === "weekly") date = addDays(startDate, 7 * n);
    else {
      const { year, month } = addMonths(start.year, start.month, n);
      date = { year, month, day: Math.min(start.day, daysInMonth(year, month)) };
    }
    const candidate = zonedTimeToUtc(date, start.hour, start.minute, tz, start.second);
    if (candidate.getTime() > now.getTime()) return candidate;
  }
}

/**
 * The links of a reminder must be visible to its owner (BE §7.5): a live task
 * (admin tasks only for `canSeeAdminData`) the caller may view, and a live
 * project. Returns false when either is not.
 */
export async function reminderLinksVisible(
  db: OwnerDb,
  viewer: { isAdmin: boolean; canViewTasks: boolean; canViewProjects: boolean },
  links: { taskId?: string | null; projectId?: string | null },
): Promise<boolean> {
  if (links.taskId) {
    if (!viewer.canViewTasks) return false;
    const [task] = await db
      .select({ kind: tasks.kind })
      .from(tasks)
      .where(and(eq(tasks.id, links.taskId), isNull(tasks.deletedAt)))
      .limit(1);
    if (!task || (task.kind === "admin" && !viewer.isAdmin)) return false;
  }
  if (links.projectId) {
    if (!viewer.canViewProjects) return false;
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, links.projectId), isNull(projects.deletedAt)))
      .limit(1);
    if (!project) return false;
  }
  return true;
}
