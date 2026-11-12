/**
 * Meetings of a date range: day aggregates, items, KPIs, overlaps and the
 * busy intervals the agenda tools read (Calendario BE §5.3, §8.2). Server-only.
 *
 * Reads come from `calendar_events` (Cincel meetings and the viewer's own
 * cached Google events), never from Google live. A meeting belongs to the day
 * it starts in its own time zone; an overlap belongs to the day where the
 * later of the two meetings starts, so overlaps across midnight count once.
 */
import "server-only";

import { sql, type SQL } from "drizzle-orm";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { db } from "@/lib/db/client";
import { tramoColorSlot } from "@/lib/tramos/compat";
import type {
  AttendeeResponse,
  CalDay,
  CalEventItem,
  CalItem,
  CalKpis,
  CalendarioFilters,
  CalTramoRef,
  MinutesState,
} from "@/lib/types/calendario";

export type EventRangeFilters = Pick<CalendarioFilters, "mostrar" | "quien" | "proyectos" | "tramo" | "responsable">;

/** Per-day numbers of the meetings in a range. */
export type EventDayAggregate = { events: number; meetingHours: number; overlaps: number };

const DEFAULT_FILTERS: EventRangeFilters = { mostrar: "todo", quien: "yo", proyectos: [], tramo: null, responsable: null };

/** Administrador and Dirección see every Cincel meeting (BE §8.2). */
function seesAllMeetings(user: AuthenticatedUser): boolean {
  return user.access === "Administrador" || user.access === "Dirección";
}

function uuidList(ids: string[]): SQL {
  return sql.join(
    ids.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
}

/** `ev` is `core.calendar_events`. */
const INVOLVED = (staffId: string) =>
  sql`(ev.organizer_id = ${staffId}::uuid or exists (select 1 from core.calendar_event_attendees att where att.event_id = ev.id and att.staff_id = ${staffId}::uuid))`;

/**
 * The visibility rule of §8.2 as a SQL condition over `ev`:
 * - Google cache: its owner only, also not to administrators.
 * - Cincel: organizer, attendees, members of the linked project, Administrador and Dirección
 *   (the last two groups only in "Todos"; "Yo" narrows to organizer and attendee).
 * - A meeting the viewer declined is hidden from their calendar.
 */
export function eventVisibilitySql(user: AuthenticatedUser, quien: "yo" | "todos"): SQL {
  const me = user.member.id;
  const own = INVOLVED(me);
  const cincelScope =
    quien === "yo"
      ? own
      : seesAllMeetings(user)
        ? sql`true`
        : sql`(${own} or (ev.project_id is not null and exists (select 1 from core.project_members pm where pm.project_id = ev.project_id and pm.staff_id = ${me}::uuid)))`;
  return sql`(
    (ev.source = 'google' and ev.owner_staff_id = ${me}::uuid)
    or (ev.source = 'cincel' and ${cincelScope}
        and not exists (select 1 from core.calendar_event_attendees dcl where dcl.event_id = ev.id and dcl.staff_id = ${me}::uuid and dcl.response = 'rechaza'))
  )`;
}

/** Visible, confirmed, live meetings that pass the page filters (`ev` alias). */
function eventWhere(user: AuthenticatedUser, filters: EventRangeFilters, canViewTeam: boolean): SQL {
  const quien = filters.quien === "todos" && canViewTeam ? "todos" : "yo";
  const parts: SQL[] = [
    eventVisibilitySql(user, quien),
    sql`ev.status = 'confirmada'`,
    sql`ev.deleted_at is null`,
  ];
  if (filters.proyectos.length > 0) parts.push(sql`ev.project_id in (${uuidList(filters.proyectos)})`);
  if (filters.tramo === "none") parts.push(sql`ev.workflow_id is null`);
  else if (filters.tramo) parts.push(sql`ev.workflow_id = ${filters.tramo}::uuid`);
  if (quien === "todos" && filters.responsable) parts.push(INVOLVED(filters.responsable));
  return sql.join(parts, sql` and `);
}

function wantsEvents(filters: EventRangeFilters): boolean {
  return filters.mostrar !== "tareas";
}

/** Whether the viewer may use "Todos" (BE §8.2); the callers pass `resolveCalendarCapabilities(user).canViewTeamCalendar`. */
export type EventScope = { canViewTeam: boolean };

const localDay = sql`(ev.starts_at at time zone ev.time_zone)::date`;

function dayString(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/** Meetings, meeting hours and overlaps per day of `[from, to]`; days without meetings are absent. */
export async function eventDayAggregates(
  user: AuthenticatedUser,
  range: { from: string; to: string },
  filters: EventRangeFilters,
  scope: EventScope,
): Promise<Map<string, EventDayAggregate>> {
  const out = new Map<string, EventDayAggregate>();
  if (!wantsEvents(filters)) return out;
  const where = eventWhere(user, filters, scope.canViewTeam);
  const me = user.member.id;

  const perDay = await db.execute<{ day: string; events: number; hours: string | number }>(sql`
    select to_char(${localDay}, 'YYYY-MM-DD') as day,
           count(*)::int as events,
           coalesce(sum(extract(epoch from (ev.ends_at - ev.starts_at)) / 3600), 0) as hours
    from core.calendar_events ev
    where ${where} and ${localDay} between ${range.from}::date and ${range.to}::date
    group by 1
  `);
  for (const r of perDay) out.set(dayString(r.day), { events: Number(r.events), meetingHours: Number(r.hours), overlaps: 0 });

  // Overlaps among the viewer's own meetings, on the day the later one starts (works across midnight).
  const overlaps = await db.execute<{ day: string; overlaps: number }>(sql`
    with mine as (
      select ev.id, ev.starts_at, ev.ends_at, ev.time_zone
      from core.calendar_events ev
      where ${where} and (ev.source = 'google' or ${INVOLVED(me)}) and not ev.all_day
        and ev.starts_at < (${range.to}::date + 2) and ev.ends_at > (${range.from}::date - 1)
    )
    select to_char((greatest(a.starts_at, b.starts_at) at time zone a.time_zone)::date, 'YYYY-MM-DD') as day,
           count(*)::int as overlaps
    from mine a join mine b on a.id < b.id and a.starts_at < b.ends_at and b.starts_at < a.ends_at
    group by 1
  `);
  for (const r of overlaps) {
    const day = dayString(r.day);
    if (day < range.from || day > range.to) continue;
    const row = out.get(day) ?? { events: 0, meetingHours: 0, overlaps: 0 };
    row.overlaps = Number(r.overlaps);
    out.set(day, row);
  }
  return out;
}

/** Meetings and meeting hours of the range for the KPI tiles. */
export async function eventKpis(
  user: AuthenticatedUser,
  range: { from: string; to: string },
  filters: EventRangeFilters,
  scope: EventScope,
): Promise<{ meetings: number; meetingHours: number }> {
  const days = await eventDayAggregates(user, range, filters, scope);
  let meetings = 0;
  let meetingHours = 0;
  for (const d of days.values()) {
    meetings += d.events;
    meetingHours += d.meetingHours;
  }
  return { meetings, meetingHours };
}

type EventRow = {
  id: string;
  source: "cincel" | "google";
  title: string;
  all_day: boolean;
  day: string;
  start_local: string;
  start_offset_min: string | number;
  end_local: string;
  end_offset_min: string | number;
  location: string | null;
  meet_url: string | null;
  project_id: string | null;
  project_name: string | null;
  workflow_id: string | null;
  workflow_key: string | null;
  workflow_name: string | null;
  workflow_color_slot: number | null;
  organizer_id: string | null;
  organizer_name: string | null;
  google_html_link: string | null;
  synced_at: Date | string | null;
  google_sync_error: string | null;
  minutes_status: "borrador" | "lista" | "enviada" | null;
};

type AttendeeRow = { event_id: string; name: string; staff_id: string | null; response: AttendeeResponse };

/** `2026-11-12T09:30:00` + offset minutes → `2026-11-12T09:30:00-06:00`. */
export function withOffset(local: string, offsetMin: number): string {
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(Math.round(offsetMin));
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${local}${sign}${hh}:${mm}`;
}

function minutesState(status: EventRow["minutes_status"]): MinutesState {
  return status ?? "ninguna";
}

function tramoOf(row: EventRow): CalTramoRef | null {
  if (!row.workflow_id) return null;
  const slot = row.workflow_color_slot ?? (row.workflow_key ? tramoColorSlot(row.workflow_key) : null);
  return {
    id: row.workflow_id,
    key: row.workflow_key,
    name: row.workflow_name ?? "",
    colorSlot: slot === 1 || slot === 2 || slot === 3 || slot === 4 || slot === 5 ? slot : null,
  };
}

function rowToItem(row: EventRow, attendees: AttendeeRow[], user: AuthenticatedUser): CalEventItem {
  const canEdit = row.organizer_id === user.member.id || (row.source === "cincel" && seesAllMeetings(user));
  return {
    kind: "event",
    id: `e:${row.id}`,
    eventId: row.id,
    source: row.source,
    title: row.title,
    date: dayString(row.day),
    start: withOffset(row.start_local, Number(row.start_offset_min)),
    end: withOffset(row.end_local, Number(row.end_offset_min)),
    allDay: row.all_day,
    project: row.project_id ? { id: row.project_id, name: row.project_name ?? "" } : null,
    tramo: tramoOf(row),
    location: row.location,
    meetUrl: row.meet_url,
    attendees: attendees.map((a) => ({ name: a.name, staffId: a.staff_id, response: a.response })),
    attendeeCount: attendees.length,
    organizer: row.organizer_id ? { id: row.organizer_id, name: row.organizer_name ?? "" } : null,
    googleHtmlLink: row.google_html_link,
    syncedAt: row.synced_at ? new Date(row.synced_at).toISOString() : null,
    syncError: row.google_sync_error,
    minutes: minutesState(row.minutes_status),
    canEdit,
  };
}

/**
 * Meetings of `[from, to]` as `CalEventItem`s, ordered by start. With `perDayLimit`, at most that many
 * per day (the day aggregate keeps the true count) and `truncated` says when some day had more.
 */
export async function eventItemsInRange(
  user: AuthenticatedUser,
  range: { from: string; to: string },
  filters: EventRangeFilters,
  scope: EventScope,
  opts: { perDayLimit?: number } = {},
): Promise<{ items: CalEventItem[]; truncated: boolean }> {
  if (!wantsEvents(filters)) return { items: [], truncated: false };
  const where = eventWhere(user, filters, scope.canViewTeam);
  const limit = opts.perDayLimit && opts.perDayLimit > 0 ? opts.perDayLimit : 1_000_000;

  const rows = await db.execute<EventRow & { day_rank: number }>(sql`
    select * from (
      select ev.id, ev.source, ev.title, ev.all_day,
             to_char(${localDay}, 'YYYY-MM-DD') as day,
             to_char(ev.starts_at at time zone ev.time_zone, 'YYYY-MM-DD"T"HH24:MI:SS') as start_local,
             extract(epoch from ((ev.starts_at at time zone ev.time_zone) - (ev.starts_at at time zone 'UTC'))) / 60 as start_offset_min,
             to_char(ev.ends_at at time zone ev.time_zone, 'YYYY-MM-DD"T"HH24:MI:SS') as end_local,
             extract(epoch from ((ev.ends_at at time zone ev.time_zone) - (ev.ends_at at time zone 'UTC'))) / 60 as end_offset_min,
             ev.location, ev.meet_url, ev.project_id, p.name as project_name,
             ev.workflow_id, w.key as workflow_key, w.name as workflow_name, w.color_slot as workflow_color_slot,
             ev.organizer_id, o.name as organizer_name,
             ev.google_html_link, ev.synced_at, ev.google_sync_error, mm.status as minutes_status,
             row_number() over (partition by ${localDay} order by ev.starts_at, ev.title, ev.id)::int as day_rank
      from core.calendar_events ev
      left join core.projects p on p.id = ev.project_id
      left join core.workflows w on w.id = ev.workflow_id
      left join core.staff o on o.id = ev.organizer_id
      left join core.meeting_minutes mm on mm.event_id = ev.id
      where ${where} and ${localDay} between ${range.from}::date and ${range.to}::date
    ) x
    where day_rank <= ${limit}
    order by start_local, title, id
  `);
  const list = Array.from(rows);
  const truncated = opts.perDayLimit ? await anyDayOver(where, range, limit) : false;
  if (list.length === 0) return { items: [], truncated };

  const attendeeRows = await db.execute<AttendeeRow>(sql`
    select event_id, name, staff_id, response
    from core.calendar_event_attendees
    where event_id in (${uuidList(list.map((r) => r.id))})
    order by is_organizer desc, name
  `);
  const byEvent = new Map<string, AttendeeRow[]>();
  for (const a of attendeeRows) {
    const bucket = byEvent.get(a.event_id) ?? [];
    bucket.push(a);
    byEvent.set(a.event_id, bucket);
  }
  return { items: list.map((r) => rowToItem(r, byEvent.get(r.id) ?? [], user)), truncated };
}

async function anyDayOver(where: SQL, range: { from: string; to: string }, limit: number): Promise<boolean> {
  const rows = await db.execute<{ over: boolean }>(sql`
    select exists (
      select 1 from core.calendar_events ev
      where ${where} and ${localDay} between ${range.from}::date and ${range.to}::date
      group by ${localDay} having count(*) > ${limit}
    ) as over
  `);
  return Array.from(rows)[0]?.over === true;
}

/** The meetings the agenda tools list: same rows and order as the page for the same range. */
export async function listEventItemsForTools(
  user: AuthenticatedUser,
  range: { from: string; to: string },
  opts: { canViewTeam: boolean; project?: string | null; staffIds?: string[] } = { canViewTeam: false },
): Promise<CalEventItem[]> {
  const others = (opts.staffIds ?? []).filter((id) => id !== user.member.id);
  const own = (opts.staffIds ?? []).length === 0 || (opts.staffIds ?? []).includes(user.member.id);
  const filters: EventRangeFilters = { ...DEFAULT_FILTERS, proyectos: opts.project ? [opts.project] : [] };
  const found = new Map<string, CalEventItem>();
  if (own) {
    const mine = await eventItemsInRange(user, range, filters, { canViewTeam: opts.canViewTeam });
    for (const item of mine.items) found.set(item.id, item);
  }
  if (opts.canViewTeam) {
    for (const staffId of others) {
      const theirs = await eventItemsInRange(
        user,
        range,
        { ...filters, quien: "todos", responsable: staffId },
        { canViewTeam: true },
      );
      for (const item of theirs.items) found.set(item.id, item);
    }
  }
  return [...found.values()].sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));
}

export type BusyWindow = { start: string; end: string };

/**
 * Busy windows (times only) of the confirmed, timed Cincel meetings these people organize or attend, plus
 * the viewer's own cached Google events when `includeOwnGoogle`. Reads no titles, so free/busy works for
 * people whose meetings the viewer may not open.
 */
export async function busyWindowsOf(
  viewerId: string,
  staffIds: string[],
  range: { timeMin: string; timeMax: string },
  opts: { includeOwnGoogle: boolean },
): Promise<BusyWindow[]> {
  const ids = uuidList(staffIds.length ? staffIds : [viewerId]);
  const people =
    staffIds.length > 0
      ? sql`and (ev.organizer_id in (${ids}) or exists (select 1 from core.calendar_event_attendees att where att.event_id = ev.id and att.staff_id in (${ids}) and att.response <> 'rechaza'))`
      : sql`and false`;
  const googleOwn = opts.includeOwnGoogle ? sql`or (ev.source = 'google' and ev.owner_staff_id = ${viewerId}::uuid)` : sql``;
  const rows = await db.execute<{ start: Date | string; end: Date | string }>(sql`
    select ev.starts_at as start, ev.ends_at as "end"
    from core.calendar_events ev
    where ev.status = 'confirmada' and ev.deleted_at is null and not ev.all_day
      and ev.starts_at < ${range.timeMax}::timestamptz and ev.ends_at > ${range.timeMin}::timestamptz
      and ((ev.source = 'cincel' ${people}) ${googleOwn})
    order by ev.starts_at
  `);
  return Array.from(rows).map((r) => ({ start: new Date(r.start).toISOString(), end: new Date(r.end).toISOString() }));
}

/** A confirmed Cincel meeting for the ICS feed. */
export type FeedMeeting = {
  id: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  location: string | null;
  meetUrl: string | null;
  projectName: string | null;
};

/**
 * The person's confirmed Cincel meetings (organizer or attendee) from `from` on, for their ICS feed.
 * Cached Google events are not exported: they are already in the person's Google calendar.
 */
export async function listFeedMeetings(staffId: string, from: Date): Promise<FeedMeeting[]> {
  const rows = await db.execute<{
    id: string;
    title: string;
    description: string | null;
    starts_at: Date | string;
    ends_at: Date | string;
    all_day: boolean;
    location: string | null;
    meet_url: string | null;
    project_name: string | null;
  }>(sql`
    select ev.id, ev.title, ev.description, ev.starts_at, ev.ends_at, ev.all_day, ev.location, ev.meet_url, p.name as project_name
    from core.calendar_events ev
    left join core.projects p on p.id = ev.project_id
    where ev.source = 'cincel' and ev.status = 'confirmada' and ev.deleted_at is null
      and ev.ends_at > ${from.toISOString()}::timestamptz
      and ${INVOLVED(staffId)}
      and not exists (select 1 from core.calendar_event_attendees dcl where dcl.event_id = ev.id and dcl.staff_id = ${staffId}::uuid and dcl.response = 'rechaza')
    order by ev.starts_at, ev.id
  `);
  return Array.from(rows).map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    startsAt: new Date(r.starts_at),
    endsAt: new Date(r.ends_at),
    allDay: r.all_day,
    location: r.location,
    meetUrl: r.meet_url,
    projectName: r.project_name,
  }));
}

// ── Merging into the task side of the range (BE §5.2) ───────────────────────

/** Puts the meeting counts and overlaps into the per-day rows; `mostrar = reuniones` zeroes the task counts. */
export function mergeEventDays(days: CalDay[], events: Map<string, EventDayAggregate>, filters: Pick<EventRangeFilters, "mostrar">): CalDay[] {
  return days.map((d) => {
    const e = events.get(d.date);
    const tasksHidden = filters.mostrar === "reuniones";
    return {
      ...d,
      tasks: tasksHidden ? 0 : d.tasks,
      overdue: tasksHidden ? 0 : d.overdue,
      completed: tasksHidden ? 0 : d.completed,
      events: e?.events ?? 0,
      overlaps: e?.overlaps ?? 0,
    };
  });
}

/** Meetings first by start, then the task items, day by day; `mostrar = reuniones` drops the tasks. */
export function mergeEventItems(
  tasks: { items: CalItem[]; truncated: boolean },
  events: { items: CalEventItem[]; truncated: boolean },
  filters: Pick<EventRangeFilters, "mostrar">,
): { items: CalItem[]; truncated: boolean } {
  const taskItems = filters.mostrar === "reuniones" ? [] : tasks.items.filter((i) => i.kind === "task");
  const dates = new Set<string>([...taskItems.map((i) => i.date), ...events.items.map((i) => i.date)]);
  const items: CalItem[] = [];
  for (const date of [...dates].sort()) {
    items.push(...events.items.filter((i) => i.date === date).sort((a, b) => a.start.localeCompare(b.start)));
    items.push(...taskItems.filter((i) => i.date === date));
  }
  return { items, truncated: tasks.truncated || events.truncated };
}

/** The meeting KPIs; `mostrar = tareas` leaves them at zero and `reuniones` zeroes the task ones. */
export function mergeEventKpis(kpis: CalKpis, events: { meetings: number; meetingHours: number }, filters: Pick<EventRangeFilters, "mostrar">): CalKpis {
  const tasksHidden = filters.mostrar === "reuniones";
  return {
    ...kpis,
    tasks: tasksHidden ? 0 : kpis.tasks,
    overdue: tasksHidden ? 0 : kpis.overdue,
    overduePct: tasksHidden ? 0 : kpis.overduePct,
    unassigned: tasksHidden ? 0 : kpis.unassigned,
    meetings: events.meetings,
    meetingHours: Math.round(events.meetingHours * 100) / 100,
  };
}
