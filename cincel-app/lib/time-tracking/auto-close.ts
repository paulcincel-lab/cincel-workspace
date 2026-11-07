/**
 * Cron work of `auto-close-jornadas` (redesign BE §8.7, §9.5, §13):
 *
 * 1. Auto-close: every open entry whose local time reached `autoCloseAt` of
 *    its `workDate` (or `dayEnd` when `autoCloseAt` is null), or whose
 *    `workDate` is before today, is closed at that instant, its open pause
 *    closed at the same instant, `closed_by = 'auto_close'`, `flagged = true`,
 *    and the owner gets a `sistema` notification (dedupe `auto_close:<entryId>`).
 * 2. Missing clock-in: at `dayStart + 2 h` of a required work day, staff in
 *    state `off` get a `sistema` notification (dedupe `sin_entrada:<staff>:<date>`),
 *    once per day through the `cron_runs` window `sin_entrada:<date>`.
 *
 * The decision helpers are pure; the two steps take the executor of the tick.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";

import { staffAccessRole } from "@/lib/auth/access-role";
import { cronRuns, staff, timeEntries } from "@/lib/db/schema";
import type { TimeEntryPause } from "@/lib/db/schema/time";
import { notify } from "@/lib/notifications/notify";
import type { OwnerDb } from "@/lib/repositories/owner-scoped";
import { dayOfWeek, localDate, localHourMinute } from "@/lib/time-tracking/local-time";
import { isExempt } from "@/lib/time-tracking/state";
import type { TimeTrackingSettings } from "@/lib/types/redesign";
import { approvedAbsences } from "@/lib/vacations/approved-absences";

export const AUTO_CLOSE_JOB = "auto-close-jornadas";
export const AUTO_CLOSE_TITLE = "Cerramos tu jornada automáticamente";
export const MISSING_CLOCK_IN_TITLE = "Aún no registras tu entrada";
/** The missing clock-in notification goes out this long after `dayStart`. */
export const MISSING_CLOCK_IN_DELAY_MIN = 120;

/** Minutes since midnight of `HH:MM`. */
export function minutesOf(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

/** UTC offset (ms) of the time-tracking zone at `at`: local wall clock − UTC. */
function zoneOffsetMs(at: Date): number {
  const wall = Date.parse(`${localDate(at)}T${localHourMinute(at)}:00Z`);
  const utcMinute = Math.floor(at.getTime() / 60_000) * 60_000;
  return wall - utcMinute;
}

/** The instant of local wall-clock `hhmm` on calendar date `date` (America/Mexico_City). */
export function localInstant(date: string, hhmm: string): Date {
  const asUtc = Date.parse(`${date}T${hhmm}:00Z`);
  let instant = asUtc - zoneOffsetMs(new Date(asUtc));
  // A second pass settles a guess that landed on the other side of an offset change.
  instant = asUtc - zoneOffsetMs(new Date(instant));
  return new Date(instant);
}

/** The instant an entry of `workDate` is auto-closed at: `autoCloseAt`, or `dayEnd` when null. */
export function autoCloseInstant(workDate: string, settings: TimeTrackingSettings): Date {
  return localInstant(workDate, settings.autoCloseAt ?? settings.dayEnd);
}

/**
 * When an open entry must be auto-closed now, the closing instant (never
 * before `startedAt`, so the row's order check holds); null otherwise.
 */
export function autoCloseDue(
  entry: { workDate: string; startedAt: Date },
  settings: TimeTrackingSettings,
  now: Date,
): Date | null {
  const cutoff = autoCloseInstant(entry.workDate, settings);
  const pastDay = entry.workDate < localDate(now);
  if (!pastDay && now.getTime() < cutoff.getTime()) return null;
  return cutoff.getTime() < entry.startedAt.getTime() ? entry.startedAt : cutoff;
}

/** The pauses with the open one (and any pause running past `at`) closed at `at`. */
export function closePausesAt(pauses: TimeEntryPause[], at: Date): TimeEntryPause[] {
  const atIso = at.toISOString();
  return pauses.map((pause) => {
    const from = Date.parse(pause.from) > at.getTime() ? atIso : pause.from;
    const to = pause.to === null || Date.parse(pause.to) > at.getTime() ? atIso : pause.to;
    return { from, to };
  });
}

/**
 * The missing clock-in step's window at `now`: it runs from `dayStart + 2 h`
 * until `dayEnd` on a work day, only when the feature is enabled and the day
 * is required (`requiredFrom` set and reached). One window per local day.
 */
export function missingClockInWindow(
  now: Date,
  settings: TimeTrackingSettings,
): { run: boolean; date: string; windowKey: string } {
  const date = localDate(now);
  const windowKey = `sin_entrada:${date}`;
  const required =
    settings.enabled &&
    settings.requiredFrom !== null &&
    date >= settings.requiredFrom &&
    settings.workDays.includes(dayOfWeek(date));
  if (!required) return { run: false, date, windowKey };
  const minute = minutesOf(localHourMinute(now));
  const opensAt = minutesOf(settings.dayStart) + MISSING_CLOCK_IN_DELAY_MIN;
  const run = minute >= opensAt && minute < minutesOf(settings.dayEnd);
  return { run, date, windowKey };
}

/**
 * Active staff with system access whose access role is not exempt (the
 * people Control de horario applies to). The role is resolved like the
 * session's (`staffAccessRole`), so the report and the clock agree.
 */
export async function trackedStaff(
  db: OwnerDb,
  settings: TimeTrackingSettings,
): Promise<{ id: string; name: string; lastName: string | null }[]> {
  const rows = await db
    .select({ id: staff.id, name: staff.name, lastName: staff.lastName, role: staff.role, email: staff.email })
    .from(staff)
    .where(and(eq(staff.active, true), isNull(staff.deletedAt)));
  return rows
    .filter((row) => {
      const access = staffAccessRole(row.role, row.email);
      return access !== null && !isExempt(settings, access);
    })
    .map(({ id, name, lastName }) => ({ id, name, lastName }));
}

/** Step 1: closes every forgotten open entry. Returns how many were closed. */
export async function autoCloseOpenEntries(db: OwnerDb, settings: TimeTrackingSettings, now: Date): Promise<number> {
  const open = await db
    .select({
      id: timeEntries.id,
      staffId: timeEntries.staffId,
      workDate: timeEntries.workDate,
      startedAt: timeEntries.startedAt,
      pauses: timeEntries.pauses,
    })
    .from(timeEntries)
    .where(isNull(timeEntries.endedAt));

  let closedCount = 0;
  for (const entry of open) {
    const at = autoCloseDue(entry, settings, now);
    if (!at) continue;
    const [closed] = await db
      .update(timeEntries)
      .set({ endedAt: at, pauses: closePausesAt(entry.pauses, at), closedBy: "auto_close", flagged: true })
      // A user who clocked out in the meantime keeps their own exit.
      .where(and(eq(timeEntries.id, entry.id), isNull(timeEntries.endedAt)))
      .returning({ id: timeEntries.id });
    if (!closed) continue;
    closedCount += 1;
    await notify(db, [entry.staffId], {
      kind: "sistema",
      title: AUTO_CLOSE_TITLE,
      body: `Tu jornada del ${entry.workDate} quedó cerrada a las ${localHourMinute(at)}. Si la hora no es correcta, avísale a tu administrador.`,
      dedupeKey: `auto_close:${entry.id}`,
    });
  }
  return closedCount;
}

/**
 * Step 2: the missing clock-in notification. Claims the day's `cron_runs`
 * window first, so ticks that repeat within the window send nothing; on a
 * failure the claim is released so the next tick retries (dedupe keys keep
 * the retried notifications single). Returns how many notifications were created.
 */
export async function notifyMissingClockIns(db: OwnerDb, settings: TimeTrackingSettings, now: Date): Promise<number> {
  const window = missingClockInWindow(now, settings);
  if (!window.run) return 0;

  const [claimed] = await db
    .insert(cronRuns)
    .values({ job: AUTO_CLOSE_JOB, windowKey: window.windowKey, status: "running", startedAt: now })
    .onConflictDoNothing()
    .returning({ job: cronRuns.job });
  if (!claimed) return 0;

  const claim = and(eq(cronRuns.job, AUTO_CLOSE_JOB), eq(cronRuns.windowKey, window.windowKey));
  try {
    const people = await trackedStaff(db, settings);
    const ids = people.map((person) => person.id);
    let created = 0;
    if (ids.length > 0) {
      const withEntry = await db
        .selectDistinct({ staffId: timeEntries.staffId })
        .from(timeEntries)
        .where(and(inArray(timeEntries.staffId, ids), eq(timeEntries.workDate, window.date)));
      const away = await approvedAbsences(db, { from: window.date, to: window.date, staffIds: ids });
      const skip = new Set([...withEntry.map((row) => row.staffId), ...away.map((absence) => absence.staffId)]);
      for (const id of ids) {
        if (skip.has(id)) continue;
        const result = await notify(db, [id], {
          kind: "sistema",
          title: MISSING_CLOCK_IN_TITLE,
          body: "Registra tu entrada de hoy desde el reloj de la barra lateral.",
          dedupeKey: `sin_entrada:${id}:${window.date}`,
        });
        created += result.created;
      }
    }
    await db
      .update(cronRuns)
      .set({ status: "done", finishedAt: new Date(), detail: { notified: created } })
      .where(claim);
    return created;
  } catch (error) {
    await db.delete(cronRuns).where(claim);
    throw error;
  }
}

