/**
 * Range SQL, day aggregates and load per person/day (Calendario BE §5). Server-only.
 * Reads never load every task: a range returns its items plus per-day aggregates computed in SQL.
 * Reads return safe defaults until the owning issue (Phase 1, Phase 5) replaces the bodies.
 */
import "server-only";

import { alias } from "drizzle-orm/pg-core";
import { and, asc, eq, gt, inArray, isNull, lt, ne, sql } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { canSeeAdminData } from "@/lib/auth/permissions";
import { DEFAULT_TASK_HOURS, loadLabel, meetingHoursByDay, overlaps, workdayHours } from "@/lib/calendario/load";
import { getWorkdayHoursSetting } from "@/lib/calendario/workday-setting";
import { db } from "@/lib/db/client";
import { calendarEventAttendees, calendarEvents, positions, projectMembers, projects, staffPositions, tasks, workflowTaskTemplates } from "@/lib/db/schema";
import { getTimeTrackingSettings, TIME_TRACKING_TIME_ZONE } from "@/lib/time-tracking/settings";
import { approvedAbsences } from "@/lib/vacations/approved-absences";
import { emptyCalendarioRange, EMPTY_CALENDARIO_LIST } from "@/lib/calendario/empty";
import { stubDefault } from "@/lib/stubs";
import type {
  CalDay,
  CalItem,
  CalKpis,
  CalendarioListInput,
  CalendarioListPage,
  CalendarioRangeInput,
  DayLoad,
} from "@/lib/types/calendario";

/** One query: a row per day of the range (empty days return zeros). */
export async function dayAggregates(user: AuthenticatedUser, input: CalendarioRangeInput, today: string): Promise<CalDay[]> {
  return stubDefault(emptyCalendarioRange(input, today).days, user);
}

/** Task and event items of the range, at most `perDayLimit` per day. */
export async function rangeItems(
  user: AuthenticatedUser,
  input: CalendarioRangeInput,
  perDayLimit: number,
): Promise<{ items: CalItem[]; truncated: boolean }> {
  return stubDefault({ items: [] as CalItem[], truncated: false }, user, input, perDayLimit);
}

export async function rangeKpis(user: AuthenticatedUser, input: CalendarioRangeInput, today: string): Promise<CalKpis> {
  return stubDefault(emptyCalendarioRange(input, today).kpis, user);
}

/** Keyset page of items in `(date, kindOrder, start, title, id)` order. */
export async function listItemsPage(user: AuthenticatedUser, input: CalendarioListInput): Promise<CalendarioListPage> {
  return stubDefault(EMPTY_CALENDARIO_LIST, user, input);
}

/**
 * Planned hours per person and day (BE §9). The caller has already checked who the viewer may see:
 * `input.staffIds` is the final list (default: the viewer). Rows come back for every person and date
 * of the range, sorted by date then person.
 *
 * Hours of a day = effective hours of the person's open tasks due that day where they are the manager
 * (support tasks count 0, D5) + their confirmed meetings clipped to the jornada. Another person's
 * cached Google events are never read (visible to the owner only).
 */
export async function dayLoadRows(
  user: AuthenticatedUser,
  input: { from: string; to: string; staffIds?: string[] },
): Promise<DayLoad[]> {
  const staffIds = [...new Set(input.staffIds?.length ? input.staffIds : [user.member.id])];
  const { from, to } = input;
  const [settings, orgDefault] = await Promise.all([getTimeTrackingSettings(), getWorkdayHoursSetting()]);
  const dayStartUtc = `${from}T00:00:00Z`;
  const windowStart = new Date(Date.parse(dayStartUtc) - 86_400_000);
  const windowEnd = new Date(Date.parse(`${to}T00:00:00Z`) + 2 * 86_400_000);
  const dueSql = sql<string>`coalesce(${tasks.commitmentDate}, ${tasks.deliveryDate})`;
  const adminOk = canSeeAdminData(user);

  const [capacityRows, absences, taskRows, cincelRows, googleRows] = await Promise.all([
    db
      .select({ staffId: staffPositions.staffId, weekly: sql<number | null>`max(${positions.weeklyCapacityHours})` })
      .from(staffPositions)
      .innerJoin(positions, eq(positions.id, staffPositions.positionId))
      .where(and(inArray(staffPositions.staffId, staffIds), isNull(positions.deletedAt)))
      .groupBy(staffPositions.staffId),
    approvedAbsences(db, { from, to, staffIds }),
    db
      .select({
        id: tasks.id,
        staffId: tasks.managerId,
        due: dueSql,
        kind: tasks.kind,
        hours: sql<number>`coalesce(${tasks.estimatedHours}, ${workflowTaskTemplates.defaultEstimatedHours}, ${DEFAULT_TASK_HOURS}::numeric)::float8`,
      })
      .from(tasks)
      .leftJoin(workflowTaskTemplates, eq(workflowTaskTemplates.id, tasks.templateId))
      .where(
        and(
          inArray(tasks.managerId, staffIds),
          isNull(tasks.deletedAt),
          eq(tasks.archived, false),
          sql`${dueSql} between ${from}::date and ${to}::date`,
          sql`${tasks.status} <> 'completado'`,
          sql`not exists (select 1 from core.task_statuses ts_open where ts_open.id = ${tasks.customStatusId} and ts_open.deleted_at is null and ts_open.closes)`,
        ),
      )
      .orderBy(asc(tasks.id)),
    db
      .select({
        id: calendarEvents.id,
        staffId: calendarEventAttendees.staffId,
        startsAt: calendarEvents.startsAt,
        endsAt: calendarEvents.endsAt,
      })
      .from(calendarEvents)
      .innerJoin(calendarEventAttendees, eq(calendarEventAttendees.eventId, calendarEvents.id))
      .where(
        and(
          eq(calendarEvents.source, "cincel"),
          eq(calendarEvents.status, "confirmada"),
          eq(calendarEvents.allDay, false),
          isNull(calendarEvents.deletedAt),
          inArray(calendarEventAttendees.staffId, staffIds),
          ne(calendarEventAttendees.response, "rechaza"),
          lt(calendarEvents.startsAt, windowEnd),
          gt(calendarEvents.endsAt, windowStart),
        ),
      )
      .orderBy(asc(calendarEvents.id)),
    staffIds.includes(user.member.id)
      ? db
          .select({ id: calendarEvents.id, staffId: calendarEvents.ownerStaffId, startsAt: calendarEvents.startsAt, endsAt: calendarEvents.endsAt })
          .from(calendarEvents)
          .where(
            and(
              eq(calendarEvents.source, "google"),
              eq(calendarEvents.ownerStaffId, user.member.id),
              eq(calendarEvents.status, "confirmada"),
              eq(calendarEvents.allDay, false),
              isNull(calendarEvents.deletedAt),
              lt(calendarEvents.startsAt, windowEnd),
              gt(calendarEvents.endsAt, windowStart),
            ),
          )
          .orderBy(asc(calendarEvents.id))
      : Promise.resolve([] as { id: string; staffId: string | null; startsAt: Date; endsAt: Date }[]),
  ]);

  const weeklyOf = new Map(capacityRows.map((r) => [r.staffId, r.weekly === null ? null : Number(r.weekly)]));
  const absent = new Set<string>();
  for (const a of absences) {
    for (let d = a.from > from ? a.from : from; d <= (a.to < to ? a.to : to); d = nextDate(d)) absent.add(`${a.staffId}|${d}`);
  }

  type Cell = DayLoad & { intervals: { id: string; start: string; end: string }[] };
  const cells = new Map<string, Cell>();
  const cellOf = (staffId: string, date: string): Cell => {
    const key = `${staffId}|${date}`;
    let cell = cells.get(key);
    if (!cell) {
      const workday = absent.has(key)
        ? 0
        : workdayHours({ weeklyCapacityHours: weeklyOf.get(staffId) ?? null, workDays: settings.workDays.length }, orgDefault);
      cell = { date, staffId, hours: 0, workday, label: "libre", tasks: [], meetings: [], overlaps: [], intervals: [] };
      cells.set(key, cell);
    }
    return cell;
  };
  for (const staffId of staffIds) for (let d = from; d <= to; d = nextDate(d)) cellOf(staffId, d);

  for (const t of taskRows) {
    if (!t.staffId || !t.due) continue;
    if (t.kind === "admin" && !adminOk && t.staffId !== user.member.id) continue;
    cellOf(t.staffId, String(t.due)).tasks.push({ taskId: t.id, hours: Number(t.hours) });
  }
  const seen = new Set<string>();
  for (const e of [...cincelRows, ...googleRows]) {
    if (!e.staffId || seen.has(`${e.id}|${e.staffId}`)) continue;
    seen.add(`${e.id}|${e.staffId}`);
    const start = e.startsAt.toISOString();
    const end = e.endsAt.toISOString();
    const perDay = meetingHoursByDay(
      { start, end },
      { from, to, dayStart: settings.dayStart, dayEnd: settings.dayEnd, timeZone: TIME_TRACKING_TIME_ZONE },
    );
    for (const [date, hours] of Object.entries(perDay)) {
      const cell = cellOf(e.staffId, date);
      cell.meetings.push({ eventId: e.id, hours });
      cell.intervals.push({ id: e.id, start, end });
    }
  }

  const out: DayLoad[] = [];
  for (const cell of [...cells.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.staffId < b.staffId ? -1 : 1))) {
    const { intervals, ...row } = cell;
    const hours = Math.round([...row.tasks, ...row.meetings].reduce((sum, x) => sum + x.hours, 0) * 100) / 100;
    out.push({ ...row, hours, label: loadLabel(hours, row.workday), overlaps: overlaps(intervals) });
  }
  return out;
}

function nextDate(date: string): string {
  const [y = 1970, m = 1, d = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Of `staffIds`, the people who are members of an active project the viewer is also a member of. */
export async function staffSharingActiveProject(viewerId: string, staffIds: string[]): Promise<Set<string>> {
  if (staffIds.length === 0) return new Set();
  const mine = alias(projectMembers, "mine");
  const rows = await db
    .selectDistinct({ staffId: projectMembers.staffId })
    .from(projectMembers)
    .innerJoin(mine, and(eq(mine.projectId, projectMembers.projectId), eq(mine.staffId, viewerId)))
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(and(inArray(projectMembers.staffId, staffIds), eq(projects.status, "activo"), isNull(projects.deletedAt)));
  return new Set(rows.map((r) => r.staffId));
}
