/**
 * `propose_redistribution` and `resolve_overlap` (Calendario BE §10.3, §11.2).
 * Server-only. Each function re-checks the viewer's scope and permissions,
 * reads Cincel data, runs the pure planner and writes one proposal (ADR 0007):
 * nothing changes until the person applies it.
 */
import "server-only";

import { addDaysToDate, localDateOf, localTimeOf, zonedTimeToUtc } from "@/lib/assistant/agenda/free-slots";
import { resolveCalendarCapabilities, canSeeAdminData } from "@/lib/auth/permissions";
import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import { viewerScopeOf } from "@/lib/auth/viewer-scope";
import { effectiveHours } from "@/lib/calendario/load";
import { DEFAULT_HORIZON_DAYS, formatHours, loadAfterMoves, proposeRedistribution } from "@/lib/calendario/redistribute";
import {
  findOverlapSlot,
  OVERLAP_SEARCH_WORKDAYS,
  pickEventToMove,
  searchWindow,
  unknownAgendaLine,
} from "@/lib/calendario/resolve-overlap";
import { db } from "@/lib/db/client";
import { freeBusy } from "@/lib/google/calendar-events-sync";
import * as planning from "@/lib/repositories/calendario-planning-repository";
import { dayLoadRows } from "@/lib/repositories/calendario-repository";
import { createProposal } from "@/lib/repositories/proposals-repository";
import { getTimeTrackingSettings, TIME_TRACKING_TIME_ZONE } from "@/lib/time-tracking/settings";
import type { DeferredItem, Proposal, ProposalChange } from "@/lib/types/calendario";
import { approvedAbsences } from "@/lib/vacations/approved-absences";
import { ProposeRedistributionToolSchema, ResolveOverlapToolSchema } from "@/lib/validation/calendario";
import { parseInput } from "@/lib/validation/project-flow";
import type { z } from "zod";

export type ProposeRedistributionInput = z.output<typeof ProposeRedistributionToolSchema>;
export type ResolveOverlapInput = z.output<typeof ResolveOverlapToolSchema>;

/** What the tools and the action return: the stored proposal plus the numbers the meters need. */
export type RedistributionProposal = {
  proposal: Proposal;
  /** Before and after hours of every day the proposal touches. */
  loadAfter: { date: string; before: number; after: number; workday: number }[];
};
export type OverlapProposal = {
  proposal: Proposal;
  /** People whose agenda could not be read; they were treated as free. */
  unknownCalendars: number;
};

/** Days after the base day that the load is read for. */
const LOAD_LOOKAHEAD_DAYS = 21;

function longDate(date: string): string {
  return new Intl.DateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`))
    .replace(",", "")
    .replace(".", "");
}

function expandAbsences(rows: { from: string; to: string }[], from: string, to: string): string[] {
  const out = new Set<string>();
  for (const row of rows) {
    for (let day = row.from > from ? row.from : from; day <= row.to && day <= to; day = addDaysToDate(day, 1)) out.add(day);
  }
  return [...out].sort();
}

/** An ISO string with the org-zone offset (`2026-11-13T10:00:00-06:00`). */
export function toOffsetIso(instant: Date): string {
  const date = localDateOf(instant, TIME_TRACKING_TIME_ZONE);
  const time = localTimeOf(instant, TIME_TRACKING_TIME_ZONE);
  const [y, m, d] = date.split("-").map(Number);
  const [h, min] = time.split(":").map(Number);
  const minute = Math.floor(instant.getTime() / 60_000) * 60_000;
  const offsetMin = Math.round((Date.UTC(y, m - 1, d, h, min) - minute) / 60_000);
  const sign = offsetMin < 0 ? "-" : "+";
  const abs = Math.abs(offsetMin);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date}T${time}:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

// ── propose_redistribution ──────────────────────────────────────────────────

export async function proposeRedistributionFor(user: AuthenticatedUser, input: ProposeRedistributionInput): Promise<RedistributionProposal> {
  const caps = resolveCalendarCapabilities(user);
  if (!caps.canViewCalendar) throw new Error("FORBIDDEN: calendar");
  const staffId = input.staffId ?? user.member.id;
  if (staffId !== user.member.id && !caps.canViewTeamCalendar) throw new Error("FORBIDDEN: team calendar");

  const target = input.target ?? "spread";
  const date = input.date;
  const to = addDaysToDate(date, LOAD_LOOKAHEAD_DAYS);
  const settings = await getTimeTrackingSettings();
  const today = localDateOf(new Date(), TIME_TRACKING_TIME_ZONE);

  const [load, absenceRows, rows, name] = await Promise.all([
    dayLoadRows(user, { from: date, to, staffIds: [staffId] }),
    approvedAbsences(db, { from: date, to, staffIds: [staffId] }),
    planning.openTasksDueOn(staffId, date, viewerScopeOf(user)),
    planning.staffDisplayName(staffId),
  ]);
  if (name === null) throw new Error("NOT_FOUND: staff");

  const byId = new Map(rows.map((r) => [r.id, r]));
  const hoursOf: Record<string, number> = {};
  const result = proposeRedistribution({
    staffId,
    date,
    target,
    horizonDays: DEFAULT_HORIZON_DAYS,
    load,
    tasks: rows.map((r) => {
      const hours = effectiveHours({ estimatedHours: r.estimatedHours, templateHours: r.templateHours }).hours;
      hoursOf[r.id] = hours;
      return {
        taskId: r.id,
        title: r.title,
        hours,
        priority: r.priority,
        blocked: r.blocked,
        fixed: r.deliveryDate === date && r.commitmentDate === null,
        dependsOn: r.dependsOn,
        dependents: r.dependents,
      };
    }),
    workDays: settings.workDays,
    absences: expandAbsences(absenceRows, date, to),
    today,
  });

  if (result.moves.length === 0) throw new Error("NO_CHANGES: nothing to move");

  const changes: ProposalChange[] = result.moves.map((move) => {
    const row = byId.get(move.taskId);
    return {
      changeId: `task:${move.taskId}`,
      type: "task_date",
      taskId: move.taskId,
      title: row?.title ?? "",
      projectName: row?.projectName ?? null,
      before: { date: move.from, field: row?.commitmentDate ? "commitmentDate" : "deliveryDate" },
      after: { date: move.to },
      reason: move.reason,
      staffId,
    };
  });
  const deferred: DeferredItem[] = result.deferred;
  const loadAfter = loadAfterMoves(load, result.moves, hoursOf);
  const day = loadAfter.find((d) => d.date === date);

  const count = result.moves.length;
  const noun = count === 1 ? "tarea" : "tareas";
  const title = target === "next_day" ? `Pasar ${count} ${noun} al día siguiente` : `Repartir ${count} ${noun} de ${longDate(date)}`;
  const line = day
    ? `${name} pasa de ${formatHours(day.before)} h a ${formatHours(day.after)} h el ${longDate(date)}.`
    : `${count} ${noun} de ${name} cambian de día.`;

  const proposal = await createProposal(user, target === "next_day" ? "pasar_a_manana" : "repartir", {
    title,
    line,
    changes,
    deferred,
    range: { from: date, to: result.moves.reduce((max, m) => (m.to > max ? m.to : max), date) },
  });
  return { proposal, loadAfter };
}

// ── resolve_overlap ─────────────────────────────────────────────────────────

export async function resolveOverlapFor(user: AuthenticatedUser, input: ResolveOverlapInput): Promise<OverlapProposal> {
  const caps = resolveCalendarCapabilities(user);
  if (!caps.canViewCalendar) throw new Error("FORBIDDEN: calendar");

  const events = await planning.eventsWithAttendees([...input.eventIds]);
  const first = events.find((e) => e.id === input.eventIds[0]);
  const second = events.find((e) => e.id === input.eventIds[1]);
  if (!first || !second) throw new Error("NOT_FOUND: event");

  const isAdmin = canSeeAdminData(user);
  const picked = pickEventToMove(
    [
      { id: first.id, organizerId: first.organizerId, createdAt: first.createdAt.toISOString() },
      { id: second.id, organizerId: second.organizerId, createdAt: second.createdAt.toISOString() },
    ],
    { viewerId: user.member.id, keep: input.keep, isAdmin },
  );
  if ("error" in picked) throw new Error(picked.error === "INVALID" ? "INVALID: keep" : "NOT_ORGANIZER: not the organizer");

  const move = picked.move.id === first.id ? first : second;
  const kept = picked.keep.id === first.id ? first : second;
  // Only a Cincel meeting can be moved from here; a cached Google event belongs to its owner.
  if (move.source !== "cincel") throw new Error("NOT_ORGANIZER: google event");

  const durationMin = Math.round((move.endsAt.getTime() - move.startsAt.getTime()) / 60_000);
  const settings = await getTimeTrackingSettings();
  const now = new Date();
  const today = localDateOf(now, TIME_TRACKING_TIME_ZONE);
  const eventDay = localDateOf(move.startsAt, TIME_TRACKING_TIME_ZONE);
  const from = eventDay > today ? eventDay : today;
  const window = searchWindow(from, settings.workDays, OVERLAP_SEARCH_WORKDAYS);
  const timeMin = zonedTimeToUtc(window.from, 0, TIME_TRACKING_TIME_ZONE);
  const timeMax = zonedTimeToUtc(addDaysToDate(window.to, 1), 0, TIME_TRACKING_TIME_ZONE);

  const staffIds = [...new Set([...move.attendees.map((a) => a.staffId), move.organizerId].filter((id): id is string => !!id))];
  const emails = [...new Set(move.attendees.map((a) => a.email.trim().toLowerCase()).filter(Boolean))];
  if (user.email && !emails.includes(user.email.toLowerCase()) && move.organizerId === user.member.id) {
    emails.push(user.email.toLowerCase());
  }

  // Google free/busy (max 20 emails); whoever it cannot answer for is treated as free and reported.
  const asked = emails.slice(0, 20);
  let unknown = emails.length - asked.length;
  const busy: { start: string; end: string }[] = [];
  try {
    const result = await freeBusy(user.member.id, asked, timeMin.toISOString(), timeMax.toISOString());
    unknown += result.unknown.length;
    for (const key of Object.keys(result.busy).sort()) busy.push(...result.busy[key]);
  } catch {
    unknown += asked.length;
  }
  busy.push(...(await planning.staffBusyIntervals(staffIds, timeMin, timeMax, move.id)));
  // The meeting's own slot is not a candidate (its Google copy shows up as busy too).
  busy.push({ start: move.startsAt.toISOString(), end: move.endsAt.toISOString() });

  const absences = staffIds.length ? await approvedAbsences(db, { from: window.from, to: window.to, staffIds }) : [];
  const slot = findOverlapSlot({
    durationMin,
    from,
    settings: { dayStart: settings.dayStart, dayEnd: settings.dayEnd, workDays: settings.workDays },
    timeZone: TIME_TRACKING_TIME_ZONE,
    staffIds,
    absences,
    busy,
    now,
  });
  if (!slot) throw new Error("NO_SLOT: no common slot");

  const newStart = new Date(slot.start);
  const newEnd = new Date(slot.end);
  const change: ProposalChange = {
    changeId: `event:${move.id}`,
    type: "event_update",
    eventId: move.id,
    before: { start: toOffsetIso(move.startsAt), end: toOffsetIso(move.endsAt) },
    after: { start: toOffsetIso(newStart), end: toOffsetIso(newEnd) },
    // "Aplicar y avisar": applying sends the update to the attendees.
    notify: true,
  };

  const newDay = localDateOf(newStart, TIME_TRACKING_TIME_ZONE);
  const people = emails.length;
  const involvesViewer =
    isAdmin || kept.organizerId === user.member.id || kept.attendees.some((a) => a.staffId === user.member.id);
  const keptName = involvesViewer ? `«${kept.title}»` : "la otra reunión";
  const parts = [
    `Se traslapaba con ${keptName}. Propongo el ${longDate(newDay)} de ${localTimeOf(newStart, TIME_TRACKING_TIME_ZONE)} a ${localTimeOf(newEnd, TIME_TRACKING_TIME_ZONE)}, libre para ${people} ${people === 1 ? "persona" : "personas"}.`,
  ];
  if (unknown > 0) parts.push(unknownAgendaLine(unknown));

  const proposal = await createProposal(user, "resolver_traslape", {
    title: `Mover «${move.title}»`,
    line: parts.join(" "),
    changes: [change],
    deferred: [],
    range: { from: eventDay < newDay ? eventDay : newDay, to: eventDay < newDay ? newDay : eventDay },
  });
  return { proposal, unknownCalendars: unknown };
}

/** The same two functions for `runProposingToolAction`. */
export async function runOwnProposingTool(
  user: AuthenticatedUser,
  name: "propose_redistribution" | "resolve_overlap",
  input: unknown,
): Promise<Proposal> {
  if (name === "propose_redistribution") {
    return (await proposeRedistributionFor(user, parseInput(ProposeRedistributionToolSchema, input))).proposal;
  }
  return (await resolveOverlapFor(user, parseInput(ResolveOverlapToolSchema, input))).proposal;
}
