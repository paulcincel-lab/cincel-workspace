/** Pure layout of the Día timeline (FE §4.1): hour rows, lanes, edge pins and the now line. */
import type { CalEventItem, CalItem, CalTaskItem } from "@/lib/types/calendario";

export const DEFAULT_DAY_START = "08:00";
export const DEFAULT_DAY_END = "19:00";
/** Height of one hour row, in rem. */
export const HOUR_ROW_REM = 4;

export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m ?? 0);
}

export function hhmm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Minutes since midnight of an ISO instant in the org time zone. */
export function minutesInZone(iso: string | Date, timeZone: string): number {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** Sane hour range: falls back to the default when the range is empty or inverted. */
export function dayRange(dayStart: string, dayEnd: string): { start: number; end: number } {
  const start = Math.floor(minutesOf(dayStart) / 60) * 60;
  const end = Math.ceil(minutesOf(dayEnd) / 60) * 60;
  if (!(end > start)) return { start: minutesOf(DEFAULT_DAY_START), end: minutesOf(DEFAULT_DAY_END) };
  return { start, end };
}

export type TimedBlock = {
  item: CalEventItem;
  /** Offset and height as a fraction of the visible range, 0..1. */
  top: number;
  height: number;
  lane: number;
  lanes: number;
  startMin: number;
  endMin: number;
};

export type DayLayout = {
  hours: number[];
  blocks: TimedBlock[];
  /** Events that start before the range, pinned at the top edge. */
  before: { item: CalEventItem; startMin: number }[];
  /** Events that start after the range, pinned at the bottom edge. */
  after: { item: CalEventItem; startMin: number }[];
  /** All-day events: shown with the pinned ones at the top. */
  allDay: CalEventItem[];
  tasks: CalTaskItem[];
};

/** Open tasks first, completed last; stable otherwise. */
export function sortTasks(tasks: readonly CalTaskItem[]): CalTaskItem[] {
  return tasks.map((t, i) => ({ t, i })).sort((a, b) => Number(a.t.completed) - Number(b.t.completed) || a.i - b.i).map((x) => x.t);
}

export function layoutDay(items: readonly CalItem[], date: string, dayStart: string, dayEnd: string, timeZone: string): DayLayout {
  const { start, end } = dayRange(dayStart, dayEnd);
  const span = end - start;
  const hours: number[] = [];
  for (let m = start; m < end; m += 60) hours.push(m);

  const tasks: CalTaskItem[] = [];
  const events: CalEventItem[] = [];
  for (const item of items) {
    if (item.date !== date) continue;
    if (item.kind === "task") tasks.push(item);
    else events.push(item);
  }

  const before: DayLayout["before"] = [];
  const after: DayLayout["after"] = [];
  const allDay: CalEventItem[] = [];
  const inside: { item: CalEventItem; startMin: number; endMin: number }[] = [];
  for (const item of events) {
    if (item.allDay) {
      allDay.push(item);
      continue;
    }
    const startMin = minutesInZone(item.start, timeZone);
    let endMin = minutesInZone(item.end, timeZone);
    if (endMin <= startMin) endMin = Math.min(startMin + 30, 24 * 60);
    if (startMin < start) before.push({ item, startMin });
    else if (startMin >= end) after.push({ item, startMin });
    else inside.push({ item, startMin, endMin: Math.min(endMin, end) });
  }
  inside.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  // Greedy lanes within each cluster of overlapping blocks.
  const blocks: TimedBlock[] = [];
  let cluster: { item: CalEventItem; startMin: number; endMin: number; lane: number }[] = [];
  let clusterEnd = -1;
  const laneEnds: number[] = [];
  const flush = () => {
    const lanes = Math.max(1, laneEnds.length);
    for (const c of cluster) {
      blocks.push({
        item: c.item,
        startMin: c.startMin,
        endMin: c.endMin,
        top: (c.startMin - start) / span,
        height: Math.max(c.endMin - c.startMin, 20) / span,
        lane: c.lane,
        lanes,
      });
    }
    cluster = [];
    laneEnds.length = 0;
  };
  for (const e of inside) {
    if (cluster.length > 0 && e.startMin >= clusterEnd) flush();
    let lane = laneEnds.findIndex((le) => le <= e.startMin);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = e.endMin;
    cluster.push({ ...e, lane });
    clusterEnd = Math.max(clusterEnd, e.endMin);
    if (cluster.length === 1) clusterEnd = e.endMin;
  }
  flush();

  return { hours, blocks, before, after, allDay, tasks: sortTasks(tasks) };
}

/** Fraction of the range where the now line sits, or null when it is outside or the day is not today. */
export function nowFraction(now: Date, today: string, date: string, dayStart: string, dayEnd: string, timeZone: string): number | null {
  if (today !== date) return null;
  const { start, end } = dayRange(dayStart, dayEnd);
  const m = minutesInZone(now, timeZone);
  if (m < start || m > end) return null;
  return (m - start) / (end - start);
}
