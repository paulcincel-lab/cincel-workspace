import "server-only";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { resolveCalendarCapabilities } from "@/lib/auth/permissions";
import { PER_DAY_LIMIT } from "@/lib/calendario/items";
import {
  EMPTY_CALENDARIO_LIST,
  emptyCalendarioRange,
  emptyMinutes,
  emptyPlanWeek,
} from "@/lib/calendario/empty";
import { buildDaySummary, buildWeekSummary } from "@/lib/calendario/risk";
import { applyLoadToDays } from "@/lib/calendario/load";
import { canSeeAdminData } from "@/lib/auth/permissions";
import { todayInAppTimeZone } from "@/lib/project-flow/admin-tasks";
import * as calendarEventsRepository from "@/lib/repositories/calendar-events-repository";
import * as calendarioRepository from "@/lib/repositories/calendario-repository";
import { dayLoadRows, staffSharingActiveProject } from "@/lib/repositories/calendario-repository";
import * as minutesRepository from "@/lib/repositories/meeting-minutes-repository";
import { cachedDateTimeFormat } from "@/lib/dates/zoned-formatters";
import { INICIO_TIME_ZONE } from "@/lib/inicio/header";
import { loadSummaryData } from "@/lib/repositories/calendario-summary-repository";
import { addDays, mondayOf } from "@/lib/time-tracking/local-time";
import { getProposal } from "@/lib/repositories/proposals-repository";
import { stubDefault } from "@/lib/stubs";
import { addDaysIso, buildAgenda, daysBetween, DELIVERY_WINDOW_DAYS, planDelta, prepSummary } from "@/lib/calendario/meeting-prep";
import { canPhrase, phrasingLimiter, rephraseSummary } from "@/lib/calendario/prep-phrasing";
import { ORG_TIME_ZONE, localParts } from "@/lib/my-space/zoned-time";
import {
  getPrepEvent,
  getPrepLastMinutes,
  getPrepProject,
  listAttendeeStaffIds,
  listPrepDeliveries,
  listPrepOverdue,
} from "@/lib/repositories/meeting-prep-repository";
import type {
  CalendarioListInput,
  CalendarioListPage,
  CalendarioRange,
  CalendarioRangeInput,
  DayLoad,
  DaySummary,
  MeetingDetail,
  MeetingMinutes,
  MeetingPrep,
  PlanWeekData,
  Proposal,
  WeekSummary,
} from "@/lib/types/calendario";

/**
 * Calendario loaders (BE §5, §8, §9, §10). One read per visible range; Google is
 * read from the Postgres cache, never live. Stubs return safe defaults and never
 * throw; the owning issues replace the bodies.
 */

function requireCalendar(user: AuthenticatedUser): void {
  if (!resolveCalendarCapabilities(user).canViewCalendar) throw new Error("FORBIDDEN");
}

/**
 * Items of the visible range plus per-day aggregates computed in SQL: three reads
 * (day aggregates, items with their support people, KPIs), never the full task list.
 * `quien = todos` is forced to `yo` without `canViewTeamCalendar` (inside the repository).
 * Meetings, hours and the Google state join in their own issues: `events` counts 0 and
 * `hours` / `workday` / `loadLabel` are null until then.
 */
export async function loadCalendarioRange(user: AuthenticatedUser, input: CalendarioRangeInput): Promise<CalendarioRange> {
  requireCalendar(user);
  const today = todayInAppTimeZone();
  const perDayLimit = PER_DAY_LIMIT[input.view];
  const [days, found, kpis] = await Promise.all([
    calendarioRepository.dayAggregates(user, input, today),
    calendarioRepository.rangeItems(user, input, perDayLimit, today),
    calendarioRepository.rangeKpis(user, input, today),
  ]);
  const shown = new Map<string, number>();
  for (const item of found.items) shown.set(item.date, (shown.get(item.date) ?? 0) + 1);
  const range: CalendarioRange = {
    from: input.from,
    to: input.to,
    today,
    days: days.map((d) => ({ ...d, shown: shown.get(d.date) ?? 0 })),
    items: found.items,
    kpis,
    truncated: found.truncated,
    google: { connected: false, eventsGrant: false, syncedAt: null, error: null },
  };
  if (input.filters.quien !== "yo") return range;
  // Own planned hours against the workday for each day (BE §9).
  const load = await dayLoadRows(user, { from: input.from, to: input.to, staffIds: [user.member.id] });
  return { ...range, days: applyLoadToDays(range.days, load) };
}

/** Keyset page of the Analítico list. */
export async function loadCalendarioList(user: AuthenticatedUser, input: CalendarioListInput): Promise<CalendarioListPage> {
  requireCalendar(user);
  return calendarioRepository.listItemsPage(user, input);
}

function assertCanViewCalendar(user: AuthenticatedUser): void {
  if (!resolveCalendarCapabilities(user).canViewCalendar) throw new Error("FORBIDDEN");
}

/** Hour of the day (0-23) in the organization time zone. */
function orgHour(now: Date): number {
  return Number.parseInt(cachedDateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: INICIO_TIME_ZONE }).format(now), 10) % 24;
}

/** Greeting, lead and the four tiles for one day (BE §10.1); the lead is a template, no model. */
export async function loadDaySummary(user: AuthenticatedUser, input: { date: string }, now: Date = new Date()): Promise<DaySummary> {
  assertCanViewCalendar(user);
  const today = todayInAppTimeZone(now);
  const data = await loadSummaryData(user, { from: input.date, to: input.date, today });
  return buildDaySummary({
    viewerId: user.member.id,
    viewerName: user.member.name,
    today,
    from: input.date,
    to: input.date,
    hour: orgHour(now),
    ...data,
    overloaded: [],
  });
}

export async function loadWeekSummary(user: AuthenticatedUser, input: { from: string }, now: Date = new Date()): Promise<WeekSummary> {
  assertCanViewCalendar(user);
  const today = todayInAppTimeZone(now);
  const from = mondayOf(input.from);
  const to = addDays(from, 6);
  const [data, load] = await Promise.all([
    loadSummaryData(user, { from, to, today }),
    loadDayLoad(user, { from, to, staffIds: [user.member.id] }),
  ]);
  const overloaded = load
    .filter((d) => d.staffId === user.member.id && d.label === "sobrecargado")
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ date: d.date, hours: d.hours, workday: d.workday }));
  return buildWeekSummary({
    viewerId: user.member.id,
    viewerName: user.member.name,
    today,
    from,
    to,
    hour: orgHour(now),
    ...data,
    overloaded,
  });
}

/**
 * Planned hours per person and day (BE §9). Own load is always allowed; other people's needs
 * `canViewTeamCalendar` or a shared active project, otherwise the whole read is `FORBIDDEN`.
 */
export async function loadDayLoad(user: AuthenticatedUser, input: { from: string; to: string; staffIds?: string[] }): Promise<DayLoad[]> {
  const staffIds = await allowedLoadStaff(user, input.staffIds);
  return dayLoadRows(user, { from: input.from, to: input.to, staffIds });
}

/** The people whose load the viewer may read (default: themselves); throws `FORBIDDEN` for any other. */
export async function allowedLoadStaff(user: AuthenticatedUser, requested?: string[]): Promise<string[]> {
  const ids = [...new Set(requested?.length ? requested : [user.member.id])];
  const others = ids.filter((id) => id !== user.member.id);
  if (others.length === 0) return ids;
  if (resolveCalendarCapabilities(user).canViewTeamCalendar) return ids;
  const shared = await staffSharingActiveProject(user.member.id, others);
  if (others.some((id) => !shared.has(id))) throw new Error("FORBIDDEN");
  return ids;
}

export async function loadMeetingDetail(user: AuthenticatedUser, eventId: string): Promise<MeetingDetail | null> {
  requireCalendar(user);
  return calendarEventsRepository.getMeetingDetail(user, eventId);
}

/**
 * Meeting prep (BE §10.2): KPIs, summary, Lo vencido and the proposed agenda. Null when the viewer
 * is neither the organizer nor a staff attendee. `phrasing: true` asks the model to rephrase the
 * summary (rate-limited); every other load is built from templates.
 */
export async function loadMeetingPrep(
  user: AuthenticatedUser,
  eventId: string,
  opts: { phrasing?: boolean } = {},
): Promise<MeetingPrep | null> {
  const viewerId = user.member.id;
  const event = await getPrepEvent(viewerId, eventId);
  if (!event) return null;

  const includeAdmin = canSeeAdminData(user);
  const start = localParts(event.startsAt, event.timeZone);
  const meetingDate = isoDate(start);
  const today = isoDate(localParts(new Date(), ORG_TIME_ZONE));

  const project = event.projectId ? await getPrepProject(event.projectId, includeAdmin) : null;
  const scope = event.projectId && project ? { projectId: event.projectId } : { staffIds: await listAttendeeStaffIds(event.id) };
  const late = await listPrepOverdue(scope, meetingDate, includeAdmin);
  const overdue = late.rows.map((r) => ({
    taskId: r.taskId,
    title: r.title,
    managerName: r.managerName,
    date: r.date,
    daysLate: Math.max(1, daysBetween(r.date, meetingDate)),
  }));

  const last = event.projectId && project ? await getPrepLastMinutes(event.projectId, event.startsAt, event.id) : null;
  const lastMeeting = last
    ? { date: isoDate(localParts(last.startsAt, last.timeZone)), decisions: last.decisions, open: last.openPoints.length }
    : null;
  const deliveries =
    event.projectId && project
      ? await listPrepDeliveries(event.projectId, meetingDate, addDaysIso(meetingDate, DELIVERY_WINDOW_DAYS), includeAdmin)
      : [];

  const agenda = buildAgenda({
    overdue,
    openPoints: last && lastMeeting ? last.openPoints.map((text) => ({ text, date: lastMeeting.date })) : [],
    deliveries,
  });
  const delta = project ? planDelta({ progress: project.progress, startDate: project.startDate, endDate: project.endDate, today }) : null;

  const prep: Omit<MeetingPrep, "summary"> = {
    eventId: event.id,
    kpis: {
      progressVsPlan: delta,
      tramo: project?.tramoName ? { name: project.tramoName, phase: project.phaseName } : null,
      overdue: late.overdueCount,
      open: late.openCount,
      lastMeeting,
    },
    overdue: overdue.map(({ taskId, title, managerName, date, daysLate }) => ({ taskId, title, managerName, date, daysLate })),
    agenda,
  };
  const template = prepSummary({
    hasProject: project !== null,
    delta,
    overdue: overdue.map((t) => ({ title: t.title, daysLate: t.daysLate })),
    overdueCount: late.overdueCount,
    lastMeeting: last && lastMeeting ? { date: lastMeeting.date, openPoints: last.openPoints } : null,
  });

  if (!opts.phrasing || !canPhrase()) return { ...prep, summary: template };
  if (!phrasingLimiter.hit(viewerId).allowed) throw new Error("RATE_LIMITED");
  return { ...prep, summary: await rephraseSummary(prep, template) };
}

function isoDate(p: { year: number; month: number; day: number }): string {
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export async function loadMeetingMinutes(user: AuthenticatedUser, eventId: string): Promise<MeetingMinutes | null> {
  return minutesRepository.getMinutes(user, eventId);
}

export async function loadPlanWeek(user: AuthenticatedUser, input: { weekStart: string; staffIds?: string[] }): Promise<PlanWeekData> {
  return stubDefault(emptyPlanWeek(input.weekStart), user);
}

export async function loadProposal(user: AuthenticatedUser, id: string): Promise<Proposal | null> {
  return getProposal(user, id);
}
