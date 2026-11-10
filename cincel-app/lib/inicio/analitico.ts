/**
 * Inicio Analítico (#991, frame `Inicio-Analitico`): pure builders over
 * `qk.inicio()` for the KPI strip, the header description and the five
 * sections (Atención, Ritmo semanal, Carga por persona, Tareas abiertas por
 * tramo, Agenda de hoy): grouping, totals, heat levels and "Ir a" counts.
 * Client-safe; the page component only maps these to the widget kit.
 */
import { cachedDateTimeFormat } from "@/lib/dates/zoned-formatters";
import { INICIO_TIME_ZONE } from "@/lib/inicio/header";
import { formatSignedDelta } from "@/lib/metrics/series";
import type { InicioAgendaItem, InicioData } from "@/lib/types/redesign";
import type { AttentionItem, DistributionSegment, KpiDatum, KpiDeltaTone, PersonDatum, ProgressItem } from "@/lib/types/widgets";

/** Section ids: the `id` of each section card, the "Ir a" targets. */
export const ANALITICO_SECTION = {
  atencion: "s-atencion",
  ritmo: "s-ritmo",
  carga: "s-carga",
  tramos: "s-tramos",
  agenda: "s-agenda",
} as const;

/** Atención reasons shown in Analítico (Decision: vencidas and bloqueadas only). */
export const ANALITICO_ATTENTION_REASONS: readonly string[] = ["Vencida", "Bloqueada"];

/** Task rows shown per tramo before "Ver más" (Many). */
export const ATTENTION_PAGE_SIZE = 20;

/** Overdue share heat (≥ 45 warn, ≥ 60 crit) on whole percents. */
export const SHARE_WARN_AT = 45;
export const SHARE_CRIT_AT = 60;
/** Days-late heat of a task row (≥ 5 warn, ≥ 10 crit). */
export const DAYS_WARN_AT = 5;
export const DAYS_CRIT_AT = 10;
/** Neto heat of a week (≤ −4 crit). */
export const NET_CRIT_AT = -4;

export type Heat = "warn" | "crit" | null;

export function shareHeat(pct: number | null): Heat {
  if (pct === null) return null;
  if (pct >= SHARE_CRIT_AT) return "crit";
  if (pct >= SHARE_WARN_AT) return "warn";
  return null;
}

export function daysLateHeat(days: number | null): Heat {
  if (days === null) return null;
  if (days >= DAYS_CRIT_AT) return "crit";
  if (days >= DAYS_WARN_AT) return "warn";
  return null;
}

export function netHeat(net: number): Heat {
  return net <= NET_CRIT_AT ? "crit" : null;
}

/** Whole percent of `part / whole`, null when `whole` is 0. */
export function pctOf(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** "6.3 d" (one decimal), "—" for null. */
export function daysText(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : `${round1(value).toFixed(1)} d`;
}

/** "−3" / "+2" / "0". */
export function signed(value: number): string {
  return formatSignedDelta(value);
}

// ── Header ──────────────────────────────────────────────────────────────────

/** "Lunes 9 de noviembre · resumen operativo de las últimas 8 semanas." */
export function analiticoDescription(date: Date, weeks: number, timeZone: string = INICIO_TIME_ZONE): string {
  const day = cachedDateTimeFormat("es-MX", { weekday: "long", day: "numeric", month: "long", timeZone })
    .format(date)
    .replace(",", "");
  const capitalized = day.charAt(0).toLocaleUpperCase("es-MX") + day.slice(1);
  return `${capitalized} · resumen operativo de las últimas ${weeks} semanas.`;
}

// ── KPI strip ───────────────────────────────────────────────────────────────

export type AnaliticoKpi = {
  key: string;
  label: string;
  value: string;
  tone?: "default" | "destructive";
  delta?: { label: string; tone: KpiDeltaTone };
};

/** Strip order, labels and the direction that is good. */
const STRIP: { key: string; label: string; goodWhen: "up" | "down"; unit?: string }[] = [
  { key: "abiertas", label: "Abiertas", goodWhen: "down" },
  { key: "vencidas", label: "Vencidas", goodWhen: "down" },
  { key: "completadas_semana", label: "Completadas (sem.)", goodWhen: "up" },
  { key: "proyectos_activos", label: "Proyectos activos", goodWhen: "up" },
  { key: "retraso_promedio", label: "Retraso promedio", goodWhen: "down", unit: "d" },
];

function deltaTone(change: number, goodWhen: "up" | "down"): KpiDeltaTone {
  if (change === 0) return "neutral";
  return (goodWhen === "up" ? change > 0 : change < 0) ? "good" : "bad";
}

/**
 * The five KPI cards. The delta is the 7-day change ("+2 vs sem. pasada",
 * "+0.8 d"); Proyectos activos shows "N en riesgo" instead (muted), only with
 * `showProjectRisk`. A KPI the loader did not return is left out.
 */
export function analiticoKpis(
  kpis: KpiDatum[],
  projects: Pick<ProgressItem, "atRisk">[],
  showProjectRisk: boolean,
): AnaliticoKpi[] {
  return STRIP.flatMap((spec) => {
    const kpi = kpis.find((k) => k.key === spec.key);
    if (!kpi) return [];
    const item: AnaliticoKpi = {
      key: spec.key,
      label: spec.label,
      value: kpi.display ?? String(kpi.value),
      tone: spec.key === "vencidas" && kpi.value > 0 ? "destructive" : "default",
    };
    if (spec.key === "proyectos_activos") {
      if (showProjectRisk) {
        const atRisk = projects.filter((p) => p.atRisk).length;
        item.delta = { label: `${atRisk} en riesgo`, tone: "neutral" };
      }
      return [item];
    }
    if (kpi.delta) {
      const change = round1(kpi.delta.value);
      item.delta = {
        label: spec.unit ? `${signed(change)} ${spec.unit}` : `${signed(change)} vs sem. pasada`,
        tone: deltaTone(change, spec.goodWhen),
      };
    }
    return [item];
  });
}

// ── Atención ────────────────────────────────────────────────────────────────

export type AttentionTask = AttentionItem;
export type AttentionTramo = { key: string; label: string; colorVar: string; tasks: AttentionTask[]; overdue: number; daysLate: number };
export type AttentionProject = {
  id: string;
  name: string;
  tramos: AttentionTramo[];
  overdue: number;
  daysLate: number;
  /** overdue / open of the project (`ProgressItem`), whole percent; null without open tasks. */
  overduePct: number | null;
};
export type AttentionSummary = { projects: AttentionProject[]; overdue: number; blocked: number; daysLate: number };

/**
 * Vencidas and bloqueadas grouped project → tramo, each level ordered by
 * days late desc (projects by overdue desc first). Tramo label and color
 * come from `tasksByTramo`.
 */
export function attentionSummary(
  items: AttentionItem[],
  progress: Pick<ProgressItem, "id" | "open" | "overdue">[],
  tramos: Pick<DistributionSegment, "key" | "label" | "colorVar">[],
): AttentionSummary {
  const tramoInfo = new Map(tramos.map((t) => [t.key, t]));
  const progressById = new Map(progress.map((p) => [p.id, p]));
  const rows = items.filter((item) => ANALITICO_ATTENTION_REASONS.includes(item.reason));

  const byProject = new Map<string, { name: string; items: AttentionItem[] }>();
  for (const item of rows) {
    const id = item.projectId ?? item.project;
    const entry = byProject.get(id) ?? { name: item.project, items: [] };
    entry.items.push(item);
    byProject.set(id, entry);
  }

  const late = (item: AttentionItem) => item.daysLate ?? 0;
  const isOverdue = (item: AttentionItem) => item.daysLate !== null;

  const projects: AttentionProject[] = [...byProject].map(([id, { name, items: own }]) => {
    const byTramo = new Map<string, AttentionTask[]>();
    for (const item of own) {
      const key = item.tramo ?? "sin-tramo";
      byTramo.set(key, [...(byTramo.get(key) ?? []), item]);
    }
    const tramoRows: AttentionTramo[] = [...byTramo]
      .map(([key, tasks]) => {
        const info = tramoInfo.get(key);
        const sorted = [...tasks].sort((a, b) => late(b) - late(a) || a.title.localeCompare(b.title, "es"));
        return {
          key,
          label: info?.label ?? "Sin tramo",
          colorVar: info?.colorVar ?? "var(--muted-foreground)",
          tasks: sorted,
          overdue: tasks.filter(isOverdue).length,
          daysLate: tasks.reduce((sum, t) => sum + late(t), 0),
        };
      })
      .sort((a, b) => b.daysLate - a.daysLate || a.label.localeCompare(b.label, "es"));
    const p = progressById.get(id);
    const overdue = tramoRows.reduce((sum, t) => sum + t.overdue, 0);
    return {
      id,
      name,
      tramos: tramoRows,
      overdue,
      daysLate: tramoRows.reduce((sum, t) => sum + t.daysLate, 0),
      overduePct: p?.open !== undefined ? pctOf(p.overdue ?? 0, p.open) : null,
    };
  });
  projects.sort((a, b) => b.overdue - a.overdue || b.daysLate - a.daysLate || a.name.localeCompare(b.name, "es"));

  return {
    projects,
    overdue: rows.filter(isOverdue).length,
    blocked: rows.filter((r) => r.reason === "Bloqueada").length,
    daysLate: rows.reduce((sum, r) => sum + late(r), 0),
  };
}

/** "3 tramos" / "1 tramo". */
export function countLabel(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

// ── Ritmo semanal ───────────────────────────────────────────────────────────

export type PaceTotals = { created: number; completed: number; net: number };

export function paceTotals(weeks: InicioData["weeklyPace"]): PaceTotals {
  const created = weeks.reduce((sum, w) => sum + w.created, 0);
  const completed = weeks.reduce((sum, w) => sum + w.completed, 0);
  return { created, completed, net: completed - created };
}

/** The "Ir a" count of Ritmo semanal: the net of the last week shown. */
export function lastWeekNet(weeks: InicioData["weeklyPace"]): number {
  const last = weeks[weeks.length - 1];
  return last ? last.completed - last.created : 0;
}

// ── Carga por persona ───────────────────────────────────────────────────────

export type WorkloadTotals = {
  people: number;
  open: number;
  inProgress: number;
  overdue: number;
  overduePct: number | null;
  /** Mean days late over every overdue task (weighted by each person's overdue count). */
  avgDaysLate: number | null;
  saturated: number;
};

export function workloadTotals(people: PersonDatum[]): WorkloadTotals {
  const open = people.reduce((sum, p) => sum + p.open, 0);
  const overdue = people.reduce((sum, p) => sum + p.overdue, 0);
  const lateWeight = people.reduce((sum, p) => (p.avgDaysLate !== null && p.avgDaysLate !== undefined ? sum + p.overdue : sum), 0);
  const lateSum = people.reduce((sum, p) => (p.avgDaysLate !== null && p.avgDaysLate !== undefined ? sum + p.avgDaysLate * p.overdue : sum), 0);
  return {
    people: people.length,
    open,
    inProgress: people.reduce((sum, p) => sum + (p.inProgress ?? 0), 0),
    overdue,
    overduePct: pctOf(overdue, open),
    avgDaysLate: lateWeight > 0 ? round1(lateSum / lateWeight) : null,
    saturated: saturatedCount(people),
  };
}

/** People at or above 100 % occupancy. */
export function saturatedCount(people: Pick<PersonDatum, "occupancyPct">[]): number {
  return people.filter((p) => (p.occupancyPct ?? 0) >= 100).length;
}

// ── Tareas abiertas por tramo ───────────────────────────────────────────────

export type TramoTotals = { tramos: number; open: number; overdue: number; overduePct: number | null; avgDays: number | null };

export function tramoTotals(segments: DistributionSegment[]): TramoTotals {
  const open = segments.reduce((sum, s) => sum + s.value, 0);
  const overdue = segments.reduce((sum, s) => sum + (s.secondary ?? 0), 0);
  const ageSum = segments.reduce((sum, s) => sum + segmentDays(s) * s.value, 0);
  return {
    tramos: segments.length,
    open,
    overdue,
    overduePct: pctOf(overdue, open),
    avgDays: open > 0 ? round1(ageSum / open) : null,
  };
}

/** `extra.diasProm` of a tramo segment (0 when missing). */
export function segmentDays(segment: Pick<DistributionSegment, "extra">): number {
  const value = segment.extra?.diasProm;
  return typeof value === "number" ? value : 0;
}

// ── Agenda de hoy ───────────────────────────────────────────────────────────

/** "10:30" for a timed item; null for all-day items and deliveries. */
export function agendaTime(item: Pick<InicioAgendaItem, "start" | "allDay">): string | null {
  if (item.allDay) return null;
  const match = /T(\d{2}:\d{2})/.exec(item.start);
  return match ? match[1]! : null;
}

/** By time; items without a time (deliveries) last, by title. */
export function sortAgenda<T extends Pick<InicioAgendaItem, "start" | "allDay" | "title">>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const ta = agendaTime(a);
    const tb = agendaTime(b);
    if (ta === null && tb !== null) return 1;
    if (tb === null && ta !== null) return -1;
    return (ta ?? "").localeCompare(tb ?? "") || a.title.localeCompare(b.title, "es");
  });
}

/** "lun 9 nov". */
export function agendaDayLabel(date: Date, timeZone: string = INICIO_TIME_ZONE): string {
  return cachedDateTimeFormat("es-MX", { weekday: "short", day: "numeric", month: "short", timeZone })
    .format(date)
    .replace(/[.,]/g, "")
    .toLocaleLowerCase("es-MX");
}
