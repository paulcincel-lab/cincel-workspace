/**
 * Which meeting moves and where (BE §11.2 `resolve_overlap`). Pure and client-safe.
 *
 * The slot is the earliest window inside the working hours of the next 5
 * workdays where every attendee is free (Google free/busy plus Cincel data),
 * with the same length as the meeting that moves.
 */
import { addDaysToDate, findFreeSlots, weekdayOf, type BusyInterval } from "@/lib/assistant/agenda/free-slots";

/** Workdays searched after the day the meeting is on. */
export const OVERLAP_SEARCH_WORKDAYS = 5;
/** Start times are rounded up to a quarter hour. */
const STEP_MIN = 15;

/** "No pude ver la agenda de {n} persona(s)." */
export function unknownAgendaLine(count: number): string {
  return `No pude ver la agenda de ${count} ${count === 1 ? "persona" : "personas"}.`;
}

export type OverlapCandidate = { id: string; organizerId: string | null; createdAt: string };

/**
 * The meeting that moves. `keep` names the one that stays; otherwise the one
 * the viewer organizes; if both, the later-created one (decision of #1082).
 * `canEdit` lets an administrator move a meeting they do not organize.
 */
export function pickEventToMove(
  pair: [OverlapCandidate, OverlapCandidate],
  opts: { viewerId: string; keep?: string; isAdmin: boolean },
): { move: OverlapCandidate; keep: OverlapCandidate } | { error: "INVALID" | "NOT_ORGANIZER" } {
  const [a, b] = pair;
  if (a.id === b.id) return { error: "INVALID" };
  if (opts.keep !== undefined) {
    if (opts.keep !== a.id && opts.keep !== b.id) return { error: "INVALID" };
    const keep = opts.keep === a.id ? a : b;
    const move = keep === a ? b : a;
    return opts.isAdmin || move.organizerId === opts.viewerId ? { move, keep } : { error: "NOT_ORGANIZER" };
  }
  const mine = pair.filter((e) => e.organizerId === opts.viewerId);
  const pool = mine.length > 0 ? mine : opts.isAdmin ? pair : [];
  if (pool.length === 0) return { error: "NOT_ORGANIZER" };
  const move = [...pool].sort((x, y) => {
    if (x.createdAt !== y.createdAt) return x.createdAt < y.createdAt ? 1 : -1;
    return x.id < y.id ? 1 : -1;
  })[0];
  return { move, keep: move === a ? b : a };
}

/** First and last local date of the search: `workdays` workdays starting on `from`. */
export function searchWindow(from: string, workDays: number[], workdays = OVERLAP_SEARCH_WORKDAYS): { from: string; to: string } {
  const days = new Set(workDays);
  let to = from;
  let counted = 0;
  for (let i = 0; i < 60; i += 1) {
    const date = addDaysToDate(from, i);
    to = date;
    if (days.has(weekdayOf(date))) counted += 1;
    if (counted >= workdays) break;
  }
  return { from, to };
}

export type OverlapSlotInput = {
  /** Length of the meeting that moves. */
  durationMin: number;
  /** First local date searched (the meeting's day, or today when it already passed). */
  from: string;
  settings: { dayStart: string; dayEnd: string; workDays: number[] };
  timeZone: string;
  /** Staff attendees: their approved absences close the day. */
  staffIds: string[];
  absences: { staffId: string; from: string; to: string }[];
  /** Every attendee's busy time: free/busy, their Cincel meetings, and the meeting's own slot. */
  busy: BusyInterval[];
  now: Date;
};

/** The earliest common slot, or null when the 5 workdays have none. */
export function findOverlapSlot(input: OverlapSlotInput): { start: string; end: string } | null {
  const window = searchWindow(input.from, input.settings.workDays);
  const { slots } = findFreeSlots({
    from: window.from,
    to: window.to,
    durationMin: input.durationMin,
    workingHoursOnly: true,
    settings: input.settings,
    timeZone: input.timeZone,
    staffIds: input.staffIds,
    absences: input.absences,
    busy: input.busy,
    now: input.now,
    limit: 100,
  });
  const stepMs = STEP_MIN * 60_000;
  const durationMs = input.durationMin * 60_000;
  for (const slot of slots) {
    const free = { start: new Date(slot.start).getTime(), end: new Date(slot.end).getTime() };
    const start = Math.ceil(free.start / stepMs) * stepMs;
    if (start + durationMs <= free.end) {
      return { start: new Date(start).toISOString(), end: new Date(start + durationMs).toISOString() };
    }
  }
  return null;
}
