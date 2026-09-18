/**
 * Pure metrics for the Cronograma de Obra view, ported 1:1 from the
 * reference Madrid 22 dashboard (formulas documented in
 * docs/specs/backend.md §2.2). Zero React/DOM/DB imports — this is the
 * single source of numbers for the live view, the printable report, and
 * any future API/PDF. `today` is always injected, never read from
 * `Date.now()`, so callers (and tests) can pin it.
 */
import type { GapStatus, PaymentRow, ProgressMetrics, SCurvePoint, ScheduleStatus, ScheduleTask } from "@/lib/types/schedule";
import { addDays, currentWeekEndIso, isoDate, mondayOf } from "./week";
import { sortSections } from "./sections";

export function statusWeight(status: ScheduleStatus): number {
  if (status === "done") return 1;
  if (status === "progress") return 0.5;
  return 0;
}

function sortedByFecha(payments: PaymentRow[]): PaymentRow[] {
  return [...payments].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

/** The payment-calendar row in effect on `dateIso` — the last row whose date is `<= dateIso`. */
export function pagosRowForDate(payments: PaymentRow[], dateIso: string): PaymentRow | null {
  const sorted = sortedByFecha(payments);
  let row: PaymentRow | null = sorted[0] ?? null;
  for (const r of sorted) {
    if (r.fecha <= dateIso) row = r;
    else break;
  }
  return row;
}

function bounds(tasks: ScheduleTask[]): { minInicio: string | null; maxFin: string | null } {
  let minInicio: string | null = null;
  let maxFin: string | null = null;
  for (const t of tasks) {
    if (minInicio === null || t.inicio < minInicio) minInicio = t.inicio;
    if (maxFin === null || t.fin > maxFin) maxFin = t.fin;
  }
  return { minInicio, maxFin };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Translates a %-gap (vs. `comparePct`) into weeks, scaled by the project's total duration. */
function gapStatus(totalPct: number, comparePct: number, projectWeeks: number): GapStatus {
  const gap = totalPct - comparePct;
  const weeksDelay = -(gap / 100) * projectWeeks;
  if (Math.abs(weeksDelay) < 0.1) return { kind: "onTime" };
  if (weeksDelay > 0) return { kind: "late", weeks: round1(weeksDelay) };
  return { kind: "ahead", weeks: round1(Math.abs(weeksDelay)) };
}

export interface ScheduleMetricsInput {
  tasks: ScheduleTask[];
  payments: PaymentRow[];
}

export function computeProgress({ tasks, payments }: ScheduleMetricsInput, today: Date): ProgressMetrics {
  const total = tasks.length;
  const weekEnd = currentWeekEndIso(today);

  const plannedCount = tasks.filter((t) => t.fin <= weekEnd).length;
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const progressCount = tasks.filter((t) => t.status === "progress").length;
  const realWeighted = doneCount + progressCount * 0.5;
  const plannedPct = total ? Math.round((plannedCount / total) * 100) : 0;
  const realPct = total ? Math.round((realWeighted / total) * 100) : 0;

  const row = pagosRowForDate(payments, weekEnd);
  const pagosAvancePct = row?.avancePct ?? 0;
  const pagosPagadoPct = row?.pagadoPct ?? 0;

  let onTimeW = 0;
  let aheadW = 0;
  for (const t of tasks) {
    const w = statusWeight(t.status);
    if (t.fin <= weekEnd) onTimeW += w;
    else aheadW += w;
  }
  const onTimePct = total ? Math.round((onTimeW / total) * 100) : 0;
  const aheadPct = total ? Math.round((aheadW / total) * 100) : 0;

  const { minInicio, maxFin } = bounds(tasks);
  const projectWeeks =
    minInicio && maxFin
      ? (new Date(`${maxFin}T00:00:00`).getTime() - new Date(`${minInicio}T00:00:00`).getTime()) / (7 * 86400000)
      : 0;

  return {
    total,
    plannedCount,
    plannedPct,
    doneCount,
    progressCount,
    realPct,
    pagosAvancePct,
    pagosPagadoPct,
    onTimePct,
    aheadPct,
    projectWeeks,
    delayVsObra: gapStatus(realPct, plannedPct, projectWeeks),
    delayVsPagos: gapStatus(realPct, pagosAvancePct, projectWeeks),
  };
}

/** Same numbers as computeProgress — kept as a distinct export because ResumenCards consumes it by that name. */
export const computeResumen = computeProgress;

export function computeSCurve({ tasks, payments }: ScheduleMetricsInput, today: Date): SCurvePoint[] {
  const total = tasks.length;
  if (total === 0) return [];

  const { minInicio, maxFin } = bounds(tasks);
  if (!minInicio || !maxFin) return [];

  const start = mondayOf(new Date(`${minInicio}T00:00:00`));
  const endDate = new Date(`${maxFin}T00:00:00`);
  const weeks: Date[] = [];
  let cursor = new Date(start);
  while (cursor <= endDate) {
    weeks.push(new Date(cursor));
    cursor = addDays(cursor, 7);
  }
  if (weeks.length < 2) weeks.push(addDays(weeks[weeks.length - 1] ?? start, 7));

  const curWeekStart = mondayOf(today);

  return weeks.map((w) => {
    const wIso = isoDate(addDays(w, 6));
    const planned = (tasks.filter((t) => t.fin <= wIso).length / total) * 100;
    let real: number | null = null;
    if (w <= curWeekStart) {
      let sum = 0;
      for (const t of tasks) {
        if (t.fin <= wIso) sum += statusWeight(t.status);
      }
      real = (sum / total) * 100;
    }
    const pagos = pagosRowForDate(payments, wIso)?.avancePct ?? 0;
    return { weekStart: isoDate(w), planned, real, pagos };
  });
}

export interface Alertas {
  atrasadas: ScheduleTask[];
  flagged: ScheduleTask[];
}

export function computeAlertas({ tasks }: { tasks: ScheduleTask[] }, today: Date): Alertas {
  const todayIso = isoDate(today);
  const atrasadas = tasks
    .filter((t) => t.fin < todayIso && statusWeight(t.status) < 1)
    .sort((a, b) => a.fin.localeCompare(b.fin));
  const flagged = tasks.filter((t) => t.flagged);
  return { atrasadas, flagged };
}

export function tasksInRange(tasks: ScheduleTask[], start: Date, end: Date): ScheduleTask[] {
  const s = isoDate(start);
  const e = isoDate(end);
  return tasks.filter((t) => t.inicio <= e && t.fin >= s);
}

export interface SeccionBar {
  seccion: string;
  start: string;
  end: string;
  count: number;
}

export function ganttBySeccion(tasks: ScheduleTask[]): SeccionBar[] {
  const bySec = new Map<string, { min: string; max: string; count: number }>();
  for (const t of tasks) {
    const cur = bySec.get(t.seccion);
    if (!cur) {
      bySec.set(t.seccion, { min: t.inicio, max: t.fin, count: 1 });
    } else {
      if (t.inicio < cur.min) cur.min = t.inicio;
      if (t.fin > cur.max) cur.max = t.fin;
      cur.count += 1;
    }
  }
  return sortSections([...bySec.keys()]).map((seccion) => {
    const v = bySec.get(seccion);
    if (!v) throw new Error(`unreachable: ${seccion} missing from bySec`);
    return { seccion, start: v.min, end: v.max, count: v.count };
  });
}
