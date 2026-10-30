/**
 * Bucketing for the dashboard "Avance de tareas" chart: tasks created vs
 * completed per day (current week) or per week (current month). Dates are
 * bucketed by their calendar date in the app's time zone.
 */

export const TASK_TREND_TIME_ZONE = "America/Mexico_City";

export type TaskTrendRange = "semana" | "mes";

export interface TaskTrend {
  labels: string[];
  created: number[];
  completed: number[];
}

/** One chart bucket, `from`..`to` inclusive ISO dates (`YYYY-MM-DD`). */
export interface TaskTrendBucket {
  label: string;
  from: string;
  to: string;
}

export interface TaskTrendCompletion {
  taskId: string;
  at: Date;
}

const DAY_MS = 86_400_000;
const DAY_LABELS = ["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB", "DOM"];

/** Calendar date of `at` in `timeZone`, as `YYYY-MM-DD`. */
export function localIsoDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

// Calendar dates are handled as UTC midnights so no local clock leaks in.
function parseIso(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

function mondayOf(d: Date): Date {
  return addDays(d, -((d.getUTCDay() + 6) % 7));
}

/** ISO-8601 week number of the week starting on `monday`. */
function isoWeek(monday: Date): number {
  const thursday = addDays(monday, 3);
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - jan1) / DAY_MS / 7) + 1;
}

/**
 * `semana`: the current week (Monday–Sunday), one bucket per day.
 * `mes`: the current month, one bucket per Monday–Sunday week, clipped to the
 * month and labelled by ISO week number (`S44`).
 */
export function taskTrendBuckets(range: TaskTrendRange, now: Date, timeZone: string): TaskTrendBucket[] {
  const today = parseIso(localIsoDate(now, timeZone));

  if (range === "semana") {
    const monday = mondayOf(today);
    return DAY_LABELS.map((label, i) => {
      const day = toIso(addDays(monday, i));
      return { label, from: day, to: day };
    });
  }

  const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const last = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
  const buckets: TaskTrendBucket[] = [];
  for (let monday = mondayOf(first); monday <= last; monday = addDays(monday, 7)) {
    const sunday = addDays(monday, 6);
    buckets.push({
      label: `S${isoWeek(monday)}`,
      from: toIso(monday < first ? first : monday),
      to: toIso(sunday > last ? last : sunday),
    });
  }
  return buckets;
}

/**
 * UTC instants that surely contain every bucket whatever the time zone offset;
 * `bucketTaskTrend` drops anything outside the buckets themselves.
 */
export function taskTrendQueryWindow(buckets: TaskTrendBucket[]): {
  from: Date;
  to: Date;
} {
  return {
    from: addDays(parseIso(buckets[0].from), -1),
    to: addDays(parseIso(buckets[buckets.length - 1].to), 2),
  };
}

/**
 * Counts per bucket: `created` from each task's creation date, `completed`
 * from status → completado events, a task counting once per bucket.
 */
export function bucketTaskTrend({
  buckets,
  timeZone,
  createdAt,
  completions,
}: {
  buckets: TaskTrendBucket[];
  timeZone: string;
  createdAt: Date[];
  completions: TaskTrendCompletion[];
}): TaskTrend {
  const indexOf = (at: Date) => {
    const day = localIsoDate(at, timeZone);
    return buckets.findIndex((b) => day >= b.from && day <= b.to);
  };

  const created = buckets.map(() => 0);
  for (const at of createdAt) {
    const i = indexOf(at);
    if (i !== -1) created[i] += 1;
  }

  const completedIds = buckets.map(() => new Set<string>());
  for (const c of completions) {
    const i = indexOf(c.at);
    if (i !== -1) completedIds[i].add(c.taskId);
  }

  return {
    labels: buckets.map((b) => b.label),
    created,
    completed: completedIds.map((ids) => ids.size),
  };
}
