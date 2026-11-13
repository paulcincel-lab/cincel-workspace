/**
 * Data shapes of the /proyectos list (redesign FE §3.5, §4.6): the cards, the
 * portfolio table and the "Proyectos por tramo" segments, built once from
 * `fetchProjectsAction` + `fetchProjectsPortfolioAction`. Every style renders
 * these same shapes through the widget library; nothing here depends on the
 * presentation style. Pure and client-safe.
 */
import type { FilterCardProps } from "@/components/widgets/FilterCard";
import type { KpiStripProps } from "@/components/widgets/KpiStrip";
import type { TareasListFilters } from "@/lib/query/keys";
import { TASK_TREND_TIME_ZONE, localIsoDate } from "@/lib/dashboard/task-trend";
import { tramoColorVar } from "@/lib/tramos/compat";
import type { ProjectListItem, WorkflowRef } from "@/lib/types/core";
import type { PortfolioRow, PresentationStyle } from "@/lib/types/redesign";
import type { DistributionSegment, EntityCard, RecordColumn, RecordTableData } from "@/lib/types/widgets";
import { CSV_BOM, escapeCsvFormula } from "@/lib/utils/export-service";
import { readEtapaParam } from "@/lib/ui/etapa-param";

/** Statuses the list shows (the archived ones live in the ficha and the legacy list). */
const LISTED_STATUSES: ReadonlySet<ProjectListItem["status"]> = new Set(["activo", "pausado"]);

export const NO_TRAMO_KEY = "sin-tramo";
export const NO_TRAMO_LABEL = "Sin etapa";
const NEUTRAL_COLOR_VAR = "var(--muted-foreground)";
const NO_VALUE = "—";

export const PROJECTS_TITLE = "Proyectos";
export const PROJECTS_BY_TRAMO_TITLE = "Proyectos por etapa";
export const BUDGET_COLUMN_LABEL = "Presup. ejercido";
export const NEXT_DELIVERY_LABEL = "Próxima entrega";
/** Pill on admin-only columns (Presup. ejercido). */
export const ADMIN_COLUMN_BADGE = "ADMIN";

const DELIVERY_DATE = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short", timeZone: "UTC" });

/** "{n} activos · avance, fase y entregas de cada obra." */
export function projectsDescription(count: number): string {
  return `${count} ${count === 1 ? "activo" : "activos"} · avance, fase y entregas de cada obra.`;
}

/** Projects the list shows: activo and pausado. */
export function listedProjects(projects: ProjectListItem[]): ProjectListItem[] {
  return projects.filter((p) => LISTED_STATUSES.has(p.status));
}

/** Lowercase, accent-free text for search. */
function fold(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Projects whose name, client, place or code contain `query` (accent- and case-insensitive). */
export function searchProjects(projects: ProjectListItem[], query: string): ProjectListItem[] {
  const q = fold(query);
  if (!q) return projects;
  return projects.filter((p) =>
    [p.name, p.client?.name ?? "", placeOf(p) ?? "", p.code ?? ""].some((field) => fold(field).includes(q)),
  );
}

/** The project's current tramo, or null (`needsTramo`). */
export function currentTramoOf(project: ProjectListItem): WorkflowRef | null {
  if (project.needsTramo) return null;
  return project.currentWorkflow ?? project.tramos.find((t) => t.current) ?? null;
}

/**
 * Projects whose current tramo is `key` (a `buildTramoSegments` key;
 * `NO_TRAMO_KEY` keeps the projects without a tramo). A null key keeps every
 * project.
 */
export function filterByTramo(projects: ProjectListItem[], key: string | null): ProjectListItem[] {
  if (key === null) return projects;
  return projects.filter((p) => (currentTramoOf(p)?.key ?? NO_TRAMO_KEY) === key);
}

/** "Ciudad, Estado", or null when the ficha has no address. */
export function placeOf(project: Pick<ProjectListItem, "addressCity" | "addressState">): string | null {
  const parts = [project.addressCity, project.addressState].map((s) => s?.trim()).filter((s): s is string => Boolean(s));
  return parts.length > 0 ? parts.join(", ") : null;
}

/** `YYYY-MM-DD` (or ISO) → "12 nov" (es-MX, lowercase). */
export function formatDeliveryDate(date: string): string {
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  const parsed = day ? new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3]))) : new Date(date);
  if (Number.isNaN(parsed.getTime())) return date;
  return DELIVERY_DATE.format(parsed).replace(".", "").toLowerCase();
}

/** "Plano de acabados · 12 nov", or null without a next delivery. */
export function nextDeliveryText(row: PortfolioRow | undefined): string | null {
  if (!row?.nextDelivery) return null;
  return `${row.nextDelivery.title} · ${formatDeliveryDate(row.nextDelivery.date)}`;
}

/** "3 abiertas · 1 vencida". */
export function openOverdueText(open: number, overdue: number): string {
  return `${open} ${open === 1 ? "abierta" : "abiertas"} · ${overdue} ${overdue === 1 ? "vencida" : "vencidas"}`;
}

const SPARK = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/** Text sparkline of the 7-day open-task series ("▁▂▃▅▇"), or null without data. */
export function sparklineText(series: number[] | undefined): string | null {
  if (!series || series.length === 0) return null;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min;
  return series.map((n) => SPARK[span === 0 ? 0 : Math.round(((n - min) / span) * (SPARK.length - 1))]).join("");
}

/** The real progress: the portfolio's (schedule-aware) value, else the project's own. */
export function realProgress(project: ProjectListItem, row: PortfolioRow | undefined): number {
  const value = row ? row.real : project.progress;
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function portfolioById(portfolio: PortfolioRow[]): Map<string, PortfolioRow> {
  return new Map(portfolio.map((row) => [row.projectId, row]));
}

/**
 * Tramos in order for the strip and the step bars: `tramos` (from
 * `listTramos`) when given, otherwise the tramos the projects carry.
 */
export function orderedTramos(projects: ProjectListItem[], tramos?: WorkflowRef[]): WorkflowRef[] {
  const source: WorkflowRef[] =
    tramos && tramos.length > 0
      ? tramos
      : projects.flatMap((p) => {
          const current = currentTramoOf(p);
          return current ? [...p.tramos, current] : p.tramos;
        });
  const byKey = new Map<string, WorkflowRef>();
  for (const t of source) if (!byKey.has(t.key)) byKey.set(t.key, { id: t.id, key: t.key, name: t.name, sortOrder: t.sortOrder });
  return [...byKey.values()].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** One card per project (Visual cards, Esencial text cards). */
export function buildProjectCards(projects: ProjectListItem[], portfolio: Map<string, PortfolioRow>): EntityCard[] {
  return projects.map((project) => {
    const row = portfolio.get(project.id);
    const tramo = currentTramoOf(project);
    const open = row?.open ?? project.taskCounts.open;
    const overdue = row?.overdue ?? 0;
    const badges: NonNullable<EntityCard["badges"]> = [];
    if (project.status === "pausado") badges.push({ label: "Pausado", tone: "warn" });
    if (!tramo) badges.push({ label: NO_TRAMO_LABEL, tone: "warn" });
    if (overdue > 0) badges.push({ label: overdue === 1 ? "1 vencida" : `${overdue} vencidas`, tone: "critical" });
    const meta: NonNullable<EntityCard["meta"]> = [{ label: "Tareas", value: openOverdueText(open, overdue) }];
    meta.push({ label: NEXT_DELIVERY_LABEL, value: nextDeliveryText(row) ?? "Sin entregas" });
    return {
      id: project.id,
      title: project.name,
      subtitle: placeOf(project) ?? project.projectType ?? undefined,
      href: `/proyectos/${project.id}`,
      iconName: "Building2",
      tramo: tramo?.key ?? null,
      progress: realProgress(project, row),
      badges,
      meta,
    };
  });
}

const HIDE_ESENCIAL: PresentationStyle[] = ["visual", "esencial"];
/** Hidden in Analítico only: Esencial reads them, and so does the Visual table view (a dashboard override). */
const ONLY_ANALITICO: PresentationStyle[] = ["analitico"];

/**
 * The portfolio table (FE §3.5): Esencial (and Visual, when the user picks
 * the table view) reads nombre, lugar, tramo, avance and próxima entrega;
 * Analítico reads Real, Plan, Desv., Presup. ejercido (only with
 * `canSeeAdminData`: the column is absent otherwise), Abiertas,
 * Vencidas, Días a entrega, Próxima entrega and the 7-day trend, with a
 * totals row.
 */
export function buildPortfolioTable(
  projects: ProjectListItem[],
  portfolio: Map<string, PortfolioRow>,
  options: { canSeeAdminData: boolean },
): RecordTableData {
  const columns: RecordColumn[] = [
    { key: "name", label: "Proyecto" },
    { key: "lugar", label: "Lugar", hideOn: ONLY_ANALITICO },
    { key: "tramo", label: "Etapa" },
    { key: "avance", label: "Avance", format: "percent", hideOn: ONLY_ANALITICO },
    { key: "real", label: "Real", format: "percent", hideOn: HIDE_ESENCIAL },
    { key: "plan", label: "Plan", format: "percent", hideOn: HIDE_ESENCIAL },
    { key: "desviacion", label: "Desv.", format: "delta", hideOn: HIDE_ESENCIAL },
  ];
  if (options.canSeeAdminData) {
    columns.push({ key: "presupuesto", label: BUDGET_COLUMN_LABEL, format: "percent", hideOn: HIDE_ESENCIAL });
  }
  columns.push(
    { key: "abiertas", label: "Abiertas", format: "count", hideOn: HIDE_ESENCIAL },
    { key: "vencidas", label: "Vencidas", format: "count", hideOn: HIDE_ESENCIAL },
    { key: "dias", label: "Días a entrega", format: "days", hideOn: HIDE_ESENCIAL },
    { key: "proxima", label: NEXT_DELIVERY_LABEL },
    { key: "tendencia", label: "Tendencia", mono: true, hideOn: HIDE_ESENCIAL },
  );

  const rows = projects.map((project) => {
    const row = portfolio.get(project.id);
    const real = realProgress(project, row);
    const out: Record<string, unknown> = {
      id: project.id,
      name: project.name,
      lugar: placeOf(project) ?? NO_VALUE,
      tramo: currentTramoOf(project)?.name ?? NO_TRAMO_LABEL,
      avance: real,
      real,
      plan: row?.plan ?? null,
      desviacion: row?.deviation ?? null,
      abiertas: row?.open ?? project.taskCounts.open,
      vencidas: row?.overdue ?? 0,
      dias: row?.daysToDelivery ?? null,
      proxima: nextDeliveryText(row) ?? NO_VALUE,
      tendencia: sparklineText(row?.series7) ?? NO_VALUE,
    };
    if (options.canSeeAdminData) out.presupuesto = row?.budgetSpentPct ?? null;
    return out;
  });

  return { columns, rows, totals: portfolioTotals(rows, options) };
}

function average(values: unknown[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function sum(values: unknown[]): number {
  return values.reduce<number>((acc, v) => acc + (typeof v === "number" && Number.isFinite(v) ? v : 0), 0);
}

/** Totals row: averages for the percentages and the deviation, sums for the counts. */
function portfolioTotals(rows: Record<string, unknown>[], options: { canSeeAdminData: boolean }): Record<string, string | number> {
  const totals: Record<string, string | number> = { name: `Total (${rows.length})` };
  const put = (key: string, value: number | null) => {
    if (value !== null) totals[key] = value;
  };
  put("avance", average(rows.map((r) => r.avance)));
  put("real", average(rows.map((r) => r.real)));
  put("plan", average(rows.map((r) => r.plan)));
  put("desviacion", average(rows.map((r) => r.desviacion)));
  if (options.canSeeAdminData) put("presupuesto", average(rows.map((r) => r.presupuesto)));
  totals.abiertas = sum(rows.map((r) => r.abiertas));
  totals.vencidas = sum(rows.map((r) => r.vencidas));
  return totals;
}

/**
 * "Proyectos por tramo": one segment per tramo (count of listed projects in
 * it, in tramo order) plus "Sin tramo" when some project has none. Extra
 * columns for Analítico: open and overdue tasks and the average progress.
 */
export function buildTramoSegments(
  projects: ProjectListItem[],
  portfolio: Map<string, PortfolioRow>,
  tramos: WorkflowRef[],
): DistributionSegment[] {
  const groups = new Map<string, ProjectListItem[]>();
  for (const project of projects) {
    const key = currentTramoOf(project)?.key ?? NO_TRAMO_KEY;
    groups.set(key, [...(groups.get(key) ?? []), project]);
  }
  const segment = (key: string, label: string, colorVar: string): DistributionSegment => {
    const members = groups.get(key) ?? [];
    const rows = members.map((p) => portfolio.get(p.id));
    return {
      key,
      label,
      value: members.length,
      colorVar,
      extra: {
        abiertas: sum(members.map((p, i) => rows[i]?.open ?? p.taskCounts.open)),
        vencidas: sum(rows.map((r) => r?.overdue ?? 0)),
        avance: members.length > 0 ? `${Math.round(sum(members.map((p, i) => realProgress(p, rows[i]))) / members.length)}%` : NO_VALUE,
      },
    };
  };
  const segments = tramos.map((t) => segment(t.key, t.name, tramoColorVar(t.key)));
  // A project whose tramo isn't in the catalog list still counts, under its own name.
  for (const project of projects) {
    const tramo = currentTramoOf(project);
    if (tramo && !segments.some((s) => s.key === tramo.key)) segments.push(segment(tramo.key, tramo.name, tramoColorVar(tramo.key)));
  }
  if (groups.has(NO_TRAMO_KEY)) segments.push(segment(NO_TRAMO_KEY, NO_TRAMO_LABEL, NEUTRAL_COLOR_VAR));
  return segments;
}

export const TRAMO_EXTRA_COLUMNS = [
  { key: "abiertas", label: "Abiertas" },
  { key: "vencidas", label: "Vencidas" },
  { key: "avance", label: "Avance prom." },
];

/** Step state of each tramo for a project's step bar: done, current or next. */
export function tramoSteps(
  project: ProjectListItem,
  tramos: WorkflowRef[],
): { key: string; label: string; state: "done" | "current" | "next"; colorVar: string }[] {
  const current = currentTramoOf(project);
  const currentOrder = current ? tramos.findIndex((t) => t.key === current.key) : -1;
  return tramos.map((t, index) => {
    const started = project.tramos.find((pt) => pt.key === t.key);
    const state: "done" | "current" | "next" =
      current?.key === t.key ? "current" : (started && started.closedAt) || (currentOrder >= 0 && index < currentOrder) ? "done" : "next";
    return { key: t.key, label: t.name, state, colorVar: tramoColorVar(t.key) };
  });
}

/** Two-letter initials of a name. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
}

/** The project's team for the card avatars: encargado and coordinador. */
export function projectTeam(project: ProjectListItem): { id: string; name: string; initials: string }[] {
  const team: { id: string; name: string; initials: string }[] = [];
  for (const person of [project.manager, project.coordinator]) {
    if (person && !team.some((p) => p.id === person.id)) team.push({ ...person, initials: initialsOf(person.name) });
  }
  return team;
}

// ── Esencial (#993): tramo pills and soft project cards ─────────────────────

/** Key of the "Todos" pill (no tramo selected). */
export const ALL_TRAMOS_KEY = "todos";
export const ALL_TRAMOS_LABEL = "Todos";

export type TramoPill = { key: string; label: string; count: number };

/**
 * The Esencial filter pills: "Todos" first (every project), then one pill per
 * tramo with projects in it, in tramo order (a tramo outside `tramos` keeps
 * its own name after them), and "Sin tramo" last when some project has none.
 * Pills with no project are left out; "Todos" always stays.
 */
export function tramoPills(projects: ProjectListItem[], tramos: WorkflowRef[]): TramoPill[] {
  const counts = new Map<string, { label: string; count: number }>();
  for (const project of projects) {
    const tramo = currentTramoOf(project);
    const key = tramo?.key ?? NO_TRAMO_KEY;
    const entry = counts.get(key) ?? { label: tramo?.name ?? NO_TRAMO_LABEL, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  const pills: TramoPill[] = [{ key: ALL_TRAMOS_KEY, label: ALL_TRAMOS_LABEL, count: projects.length }];
  const take = (key: string, label: string) => {
    const entry = counts.get(key);
    if (!entry || entry.count === 0) return;
    pills.push({ key, label, count: entry.count });
    counts.delete(key);
  };
  for (const t of tramos) take(t.key, t.name);
  for (const [key, entry] of [...counts]) if (key !== NO_TRAMO_KEY) take(key, entry.label);
  take(NO_TRAMO_KEY, NO_TRAMO_LABEL);
  return pills;
}

type ListTramoStep = ReturnType<typeof tramoSteps>[number];

export type EsencialProjectRow = {
  id: string;
  name: string;
  /** "{client} · {place}", either part alone, or null. */
  subtitle: string | null;
  tramoKey: string | null;
  steps: ListTramoStep[];
  stepLabels: { key: string; label: string; current: boolean }[];
  open: number;
  overdue: number;
  status: "vencidas" | "al-dia";
  nextDelivery: { title: string; date: string } | null;
};

/**
 * One Esencial card per project, ordered by overdue tasks (most first), then
 * the next delivery date (soonest first, none last), then the name.
 */
export function esencialProjectRows(
  projects: ProjectListItem[],
  portfolio: Map<string, PortfolioRow>,
  tramos: WorkflowRef[],
): EsencialProjectRow[] {
  const rows = projects.map((project): EsencialProjectRow => {
    const row = portfolio.get(project.id);
    const tramoKey = currentTramoOf(project)?.key ?? null;
    const overdue = row?.overdue ?? 0;
    const parts = [project.client?.name?.trim(), placeOf(project)].filter((s): s is string => Boolean(s));
    return {
      id: project.id,
      name: project.name,
      subtitle: parts.length > 0 ? parts.join(" · ") : null,
      tramoKey,
      steps: tramoSteps(project, tramos),
      stepLabels: tramos.map((t) => ({ key: t.key, label: t.name, current: t.key === tramoKey })),
      open: row?.open ?? project.taskCounts.open,
      overdue,
      status: overdue > 0 ? "vencidas" : "al-dia",
      nextDelivery: row?.nextDelivery ?? null,
    };
  });
  return rows.sort((a, b) => {
    if (a.overdue !== b.overdue) return b.overdue - a.overdue;
    const da = a.nextDelivery?.date ?? null;
    const db = b.nextDelivery?.date ?? null;
    if (da !== db) {
      if (da === null) return 1;
      if (db === null) return -1;
      return da < db ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "es");
  });
}

/** "7 activos · en qué tramo va cada obra y qué sigue." ("1 activo" in singular). */
export function esencialDescription(count: number): string {
  return `${count} ${count === 1 ? "activo" : "activos"} · en qué etapa va cada obra y qué sigue.`;
}

// ── Analítico (#994): filters, KPI strip, portfolio grouped by tramo, CSV ────

/** `?mostrar=`: every project, those with overdue tasks, or those behind plan. */
export type PortfolioMostrar = "todos" | "vencidas" | "atrasados";
export type PortfolioFilters = { mostrar: PortfolioMostrar; tramos: string[]; mios: boolean; pausados: boolean; q: string };

/** "Atrasados vs plan": deviation at or below this many points. */
export const PORTFOLIO_BEHIND_PLAN_PTS = -3;
/** Heat of the Analítico table (legend below it). Budget heat: spent above the progress. */
export const PORTFOLIO_HEAT = {
  overduePct: { warnAbove: 45, critAbove: 60 },
  deviation: { warnAtOrBelow: -5, critAtOrBelow: -8 },
} as const;

export const PORTFOLIO_MOSTRAR: readonly PortfolioMostrar[] = ["todos", "vencidas", "atrasados"];
export const DEFAULT_PORTFOLIO_FILTERS: PortfolioFilters = { mostrar: "todos", tramos: [], mios: false, pausados: false, q: "" };

/** URL params of the Analítico filters (defaults are left out of the URL). */
export const PORTFOLIO_FILTER_PARAMS = { mostrar: "mostrar", tramo: "etapa", mios: "mios", pausados: "pausados", q: "q" } as const;

export const PORTFOLIO_ANALITICO_DESCRIPTION = "Portafolio por proyecto: avance contra plan, carga y retrasos.";
export const PORTFOLIO_NO_MATCH = "Ningún proyecto coincide con los filtros.";
export const PORTFOLIO_CLEAR_FILTERS = "Quitar filtros";

const MOSTRAR_LABELS: Record<PortfolioMostrar, string> = {
  todos: "Todos",
  vencidas: "Con vencidas",
  atrasados: "Atrasados vs plan",
};

const TRAMO_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]*$/;
const MINUS = "−";

/** The Analítico filters of a URL; unknown values fall back to the defaults. */
export function parsePortfolioFilters(params: URLSearchParams): PortfolioFilters {
  const mostrar = params.get(PORTFOLIO_FILTER_PARAMS.mostrar);
  const tramos = (readEtapaParam(params) ?? "")
    .split(",")
    .map((key) => key.trim())
    .filter((key, index, all) => TRAMO_KEY_PATTERN.test(key) && all.indexOf(key) === index);
  return {
    mostrar: PORTFOLIO_MOSTRAR.includes(mostrar as PortfolioMostrar) ? (mostrar as PortfolioMostrar) : "todos",
    tramos,
    mios: params.get(PORTFOLIO_FILTER_PARAMS.mios) === "1",
    pausados: params.get(PORTFOLIO_FILTER_PARAMS.pausados) === "1",
    q: (params.get(PORTFOLIO_FILTER_PARAMS.q) ?? "").trim(),
  };
}

/**
 * `params` with the Analítico filters written in (defaults removed); other
 * params (`estilo`, `nuevo`, …) are kept. Returns the search string without `?`.
 */
export function portfolioFiltersSearch(filters: PortfolioFilters, params: URLSearchParams): string {
  const next = new URLSearchParams(params);
  const put = (key: string, value: string | null) => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  put(PORTFOLIO_FILTER_PARAMS.mostrar, filters.mostrar === "todos" ? null : filters.mostrar);
  put(PORTFOLIO_FILTER_PARAMS.tramo, filters.tramos.length > 0 ? filters.tramos.join(",") : null);
  put(PORTFOLIO_FILTER_PARAMS.mios, filters.mios ? "1" : null);
  put(PORTFOLIO_FILTER_PARAMS.pausados, filters.pausados ? "1" : null);
  put(PORTFOLIO_FILTER_PARAMS.q, filters.q.trim() || null);
  return next.toString();
}

/** True when any Analítico filter differs from its default. */
export function hasPortfolioFilters(filters: PortfolioFilters): boolean {
  return filters.mostrar !== "todos" || filters.tramos.length > 0 || filters.mios || filters.pausados || filters.q.trim() !== "";
}

/** The viewer is the project's manager, coordinator or one of its members. */
function isMine(project: ProjectListItem, viewerStaffId: string): boolean {
  if (!viewerStaffId) return false;
  if (project.managerId === viewerStaffId || project.coordinatorId === viewerStaffId) return true;
  if (project.manager?.id === viewerStaffId || project.coordinator?.id === viewerStaffId) return true;
  return project.members.some((member) => member.id === viewerStaffId);
}

function tramoKeyOf(project: ProjectListItem): string {
  return currentTramoOf(project)?.key ?? NO_TRAMO_KEY;
}

function isBehindPlan(row: PortfolioRow | undefined): boolean {
  return row?.deviation !== null && row?.deviation !== undefined && row.deviation <= PORTFOLIO_BEHIND_PLAN_PTS;
}

function matchesMostrar(mostrar: PortfolioMostrar, row: PortfolioRow | undefined): boolean {
  if (mostrar === "vencidas") return (row?.overdue ?? 0) > 0;
  if (mostrar === "atrasados") return isBehindPlan(row);
  return true;
}

type Facet = "mostrar" | "tramos" | "mios" | "pausados";

/** The listed projects that pass every filter except `skip` (faceted counts). */
function filterExcept(
  projects: ProjectListItem[],
  portfolio: Map<string, PortfolioRow>,
  filters: PortfolioFilters,
  viewerStaffId: string,
  skip: Facet | null,
): ProjectListItem[] {
  const searched = searchProjects(listedProjects(projects), filters.q);
  return searched.filter((project) => {
    const row = portfolio.get(project.id);
    if (skip !== "pausados" && !filters.pausados && project.status === "pausado") return false;
    if (skip !== "mostrar" && !matchesMostrar(filters.mostrar, row)) return false;
    if (skip !== "tramos" && filters.tramos.length > 0 && !filters.tramos.includes(tramoKeyOf(project))) return false;
    if (skip !== "mios" && filters.mios && !isMine(project, viewerStaffId)) return false;
    return true;
  });
}

/**
 * The listed projects (activo and pausado) that pass the Analítico filters.
 * Paused projects stay out unless `pausados`.
 */
export function applyPortfolioFilters(
  projects: ProjectListItem[],
  portfolio: Map<string, PortfolioRow>,
  filters: PortfolioFilters,
  viewerStaffId: string,
): ProjectListItem[] {
  return filterExcept(projects, portfolio, filters, viewerStaffId, null);
}

/** Filter group ids of `portfolioFilterGroups`. */
export const PORTFOLIO_FILTER_GROUP = { mostrar: "mostrar", tramo: "tramo", mios: "mios", pausados: "pausados" } as const;

/**
 * The FilterCard groups, in order: Mostrar (one value), Tramo (several:
 * `value` is the comma-joined selection), Solo míos and Incluir pausados
 * (one option each, `value` "1" when on). Each count is computed over the
 * other active filters.
 */
export function portfolioFilterGroups(
  projects: ProjectListItem[],
  portfolio: Map<string, PortfolioRow>,
  filters: PortfolioFilters,
  viewerStaffId: string,
): FilterCardProps["groups"] {
  const forMostrar = filterExcept(projects, portfolio, filters, viewerStaffId, "mostrar");
  const forTramos = filterExcept(projects, portfolio, filters, viewerStaffId, "tramos");
  const forMios = filterExcept(projects, portfolio, filters, viewerStaffId, "mios");
  const forPausados = filterExcept(projects, portfolio, filters, viewerStaffId, "pausados");

  const tramoOptions = orderedTramos(listedProjects(projects)).map((tramo) => ({
    value: tramo.key,
    label: tramo.name,
    color: tramoColorVar(tramo.key),
    count: forTramos.filter((p) => tramoKeyOf(p) === tramo.key).length,
  }));
  const withoutTramo = forTramos.filter((p) => tramoKeyOf(p) === NO_TRAMO_KEY).length;
  if (withoutTramo > 0 || filters.tramos.includes(NO_TRAMO_KEY)) {
    tramoOptions.push({ value: NO_TRAMO_KEY, label: NO_TRAMO_LABEL, color: NEUTRAL_COLOR_VAR, count: withoutTramo });
  }

  return [
    {
      id: PORTFOLIO_FILTER_GROUP.mostrar,
      label: "Mostrar",
      value: filters.mostrar,
      options: PORTFOLIO_MOSTRAR.map((mostrar) => ({
        value: mostrar,
        label: MOSTRAR_LABELS[mostrar],
        count: forMostrar.filter((p) => matchesMostrar(mostrar, portfolio.get(p.id))).length,
        ...(mostrar === "vencidas" ? { tone: "destructive" as const, color: "var(--destructive)" } : {}),
      })),
    },
    { id: PORTFOLIO_FILTER_GROUP.tramo, label: "Etapa", value: filters.tramos.join(","), options: tramoOptions },
    {
      id: PORTFOLIO_FILTER_GROUP.mios,
      label: "Solo míos",
      value: filters.mios ? "1" : "",
      options: [{ value: "1", label: "Solo míos", count: forMios.filter((p) => isMine(p, viewerStaffId)).length }],
    },
    {
      id: PORTFOLIO_FILTER_GROUP.pausados,
      label: "Incluir pausados",
      value: filters.pausados ? "1" : "",
      options: [{ value: "1", label: "Incluir pausados", count: forPausados.filter((p) => p.status === "pausado").length }],
    },
  ];
}

/** One body row of the Analítico table. */
export type PortfolioTableRow = {
  id: string;
  name: string;
  client: string | null;
  tramoKey: string | null;
  /** Current tramo name, or "Sin tramo". */
  tramo: string;
  /** Position of the current tramo in the catalog (sorts the Tramo actual column); "Sin tramo" last. */
  tramoRank: number;
  real: number;
  deviation: number | null;
  open: number;
  overdue: number;
  overduePct: number | null;
  avgDelayDays: number | null;
  nextDelivery: { title: string; date: string } | null;
  budgetSpentPct: number | null;
};

/** Columns of the Analítico table; the budget column only with `canSeeAdminData`. */
export function portfolioColumns(opts: { canSeeAdminData: boolean }): RecordColumn[] {
  const columns: RecordColumn[] = [
    { key: "name", label: "Proyecto", width: 280 },
    { key: "real", label: "Avance", format: "percent", width: 140 },
    { key: "deviation", label: "Desv. plan", format: "delta", width: 100 },
    { key: "open", label: "Abiertas", format: "count", width: 90 },
    { key: "overdue", label: "Vencidas", format: "count", width: 90 },
    { key: "overduePct", label: "% vencidas", format: "percent", width: 100 },
    { key: "avgDelayDays", label: "Retraso prom.", format: "days", width: 110 },
    { key: "nextDelivery", label: NEXT_DELIVERY_LABEL, width: 200 },
  ];
  if (opts.canSeeAdminData) {
    columns.push({ key: "budgetSpentPct", label: BUDGET_COLUMN_LABEL, badge: ADMIN_COLUMN_BADGE, format: "percent", width: 150 });
  }
  return columns;
}

/** A sortable column key: Proyecto, Tramo actual and the numeric columns. */
export type PortfolioSortKey = "name" | "tramo" | "real" | "deviation" | "open" | "overdue" | "overduePct" | "avgDelayDays" | "budgetSpentPct";

/** Columns that sort on a header click. */
export const PORTFOLIO_SORTABLE_COLUMNS: readonly PortfolioSortKey[] = [
  "name",
  "tramo",
  "real",
  "deviation",
  "open",
  "overdue",
  "overduePct",
  "avgDelayDays",
  "budgetSpentPct",
];

/** Share of open tasks that are overdue, as a whole percent; null without open tasks. */
function overdueShare(overdue: number, open: number): number | null {
  return open > 0 ? Math.round((overdue / open) * 100) : null;
}

/** Mean of `values` weighted by `weights` (one decimal), skipping nulls; null when nothing counts. */
function weightedMean(values: (number | null)[], weights: number[]): number | null {
  let total = 0;
  let weight = 0;
  values.forEach((value, i) => {
    const w = weights[i] ?? 0;
    if (value === null || w <= 0) return;
    total += value * w;
    weight += w;
  });
  return weight > 0 ? Math.round((total / weight) * 10) / 10 : null;
}

const DECIMAL = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const INTEGER = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });
const DECIMAL_TRIM = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

/** A signed number with U+2212 for negatives ("+3", "−4.5"); `zero` for 0. */
function signed(value: number, format: Intl.NumberFormat, zero = format.format(0)): string {
  if (value > 0) return `+${format.format(value)}`;
  if (value < 0) return `${MINUS}${format.format(Math.abs(value))}`;
  return zero;
}

/** "4.5 d", or "—". */
export function delayText(days: number | null): string {
  return days === null ? NO_VALUE : `${DECIMAL.format(days)} d`;
}

/** "62 %", or "—". */
export function percentText(value: number | null): string {
  return value === null ? NO_VALUE : `${INTEGER.format(value)} %`;
}

/** "+3" / "−8" / "0", or "—" without a plan. */
export function deviationText(value: number | null): string {
  return value === null ? NO_VALUE : signed(Math.round(value * 10) / 10, DECIMAL_TRIM);
}

/** Heat level of a cell under `PORTFOLIO_HEAT`; null when the cell has none. */
export function portfolioHeat(key: string, row: PortfolioTableRow): "crit" | "warn" | null {
  if (key === "overduePct" && row.overduePct !== null) {
    if (row.overduePct > PORTFOLIO_HEAT.overduePct.critAbove) return "crit";
    if (row.overduePct > PORTFOLIO_HEAT.overduePct.warnAbove) return "warn";
  }
  if (key === "deviation" && row.deviation !== null) {
    if (row.deviation <= PORTFOLIO_HEAT.deviation.critAtOrBelow) return "crit";
    if (row.deviation <= PORTFOLIO_HEAT.deviation.warnAtOrBelow) return "warn";
  }
  if (key === "budgetSpentPct" && row.budgetSpentPct !== null && row.budgetSpentPct > row.real) return "warn";
  return null;
}

/** Text tone of a deviation cell without heat: negatives `destructive`, positives `success`. */
export function deviationTone(value: number | null): "destructive" | "success" | "default" {
  if (value === null || value === 0) return "default";
  return value < 0 ? "destructive" : "success";
}

/** The legend under the table; the budget clause only for admins. */
export function portfolioHeatLegend(opts: { canSeeAdminData: boolean }): string {
  const { overduePct, deviation } = PORTFOLIO_HEAT;
  const base = `Heat: % vencidas > ${overduePct.warnAbove} % ámbar, > ${overduePct.critAbove} % rojo · Desv. plan ≤ ${MINUS}${Math.abs(deviation.warnAtOrBelow)} ámbar, ≤ ${MINUS}${Math.abs(deviation.critAtOrBelow)} rojo`;
  return opts.canSeeAdminData
    ? `${base} · Presup. ejercido por encima del avance, ámbar. La columna de presupuesto solo la ven administradores.`
    : `${base}.`;
}

function proyectosText(n: number): string {
  return `${n} ${n === 1 ? "proyecto" : "proyectos"}`;
}

/** Sort rank of "Sin tramo": after every tramo. */
const NO_TRAMO_RANK = Number.MAX_SAFE_INTEGER;

/** One table row of a project; `tramoRank` is its tramo's position (`portfolioTable` sets it from the catalog). */
export function portfolioTableRow(
  project: ProjectListItem,
  row: PortfolioRow | undefined,
  opts: { canSeeAdminData: boolean; tramoRank?: number },
): PortfolioTableRow {
  const open = row?.open ?? project.taskCounts.open;
  const overdue = row?.overdue ?? 0;
  const tramo = currentTramoOf(project);
  return {
    id: project.id,
    name: project.name,
    client: project.client?.name ?? null,
    tramoKey: tramo?.key ?? null,
    tramo: tramo?.name ?? NO_TRAMO_LABEL,
    tramoRank: tramo ? (opts.tramoRank ?? tramo.sortOrder) : NO_TRAMO_RANK,
    real: realProgress(project, row),
    deviation: row?.deviation ?? null,
    open,
    overdue,
    overduePct: overdueShare(overdue, open),
    avgDelayDays: row?.avgDelayDays ?? null,
    nextDelivery: row?.nextDelivery ?? null,
    budgetSpentPct: opts.canSeeAdminData ? (row?.budgetSpentPct ?? null) : null,
  };
}

type RowsSummary = {
  count: number;
  real: number | null;
  deviation: number | null;
  open: number;
  overdue: number;
  overduePct: number | null;
  avgDelayDays: number | null;
  budgetSpentPct: number | null;
};

function mean(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function summarize(rows: PortfolioTableRow[]): RowsSummary {
  const open = sum(rows.map((r) => r.open));
  const overdue = sum(rows.map((r) => r.overdue));
  return {
    count: rows.length,
    real: rows.length > 0 ? Math.round(sum(rows.map((r) => r.real)) / rows.length) : null,
    deviation: mean(rows.map((r) => r.deviation)),
    open,
    overdue,
    overduePct: overdueShare(overdue, open),
    avgDelayDays: weightedMean(rows.map((r) => r.avgDelayDays), rows.map((r) => r.overdue)),
    budgetSpentPct: mean(rows.map((r) => r.budgetSpentPct)),
  };
}

/**
 * The Analítico table (#1042): one row per project, by name, whatever its
 * tramo (a project without one is a row like any other, "Sin tramo" in its
 * Tramo actual cell). `totals` holds the footer cell of every column.
 */
export function portfolioTable(
  projects: ProjectListItem[],
  portfolio: Map<string, PortfolioRow>,
  tramos: WorkflowRef[],
  opts: { canSeeAdminData: boolean },
): { rows: PortfolioTableRow[]; totals: Record<string, string> } {
  const order = orderedTramos(projects, tramos);
  for (const project of projects) {
    const tramo = currentTramoOf(project);
    if (tramo && !order.some((t) => t.key === tramo.key)) order.push(tramo);
  }
  const rank = new Map(order.map((t, i) => [t.key, i]));
  const rows = projects
    .map((project) => {
      const key = currentTramoOf(project)?.key;
      return portfolioTableRow(project, portfolio.get(project.id), { ...opts, tramoRank: key === undefined ? undefined : rank.get(key) });
    })
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const t = summarize(rows);
  const totals: Record<string, string> = {
    name: `Total · ${proyectosText(t.count)}`,
    real: t.real === null ? NO_VALUE : `${percentText(t.real)} prom.`,
    deviation: deviationText(t.deviation),
    open: INTEGER.format(t.open),
    overdue: INTEGER.format(t.overdue),
    overduePct: percentText(t.overduePct),
    avgDelayDays: delayText(t.avgDelayDays),
    nextDelivery: "",
  };
  if (opts.canSeeAdminData) totals.budgetSpentPct = percentText(t.budgetSpentPct);
  return { rows, totals };
}

/**
 * Rows sorted by a column: Proyecto by name, Tramo actual by catalog order
 * ("Sin tramo" last), numbers with nulls last; ties by name. Null: as given
 * (by name).
 */
export function sortPortfolioRows(
  rows: PortfolioTableRow[],
  sort: { key: PortfolioSortKey; direction: "asc" | "desc" } | null,
): PortfolioTableRow[] {
  if (!sort) return rows;
  const factor = sort.direction === "asc" ? 1 : -1;
  const byName = (a: PortfolioTableRow, b: PortfolioTableRow) => a.name.localeCompare(b.name, "es");
  if (sort.key === "name") return [...rows].sort((a, b) => byName(a, b) * factor);
  if (sort.key === "tramo") {
    return [...rows].sort((a, b) => {
      if (a.tramoRank === b.tramoRank) return byName(a, b);
      if (a.tramoRank === NO_TRAMO_RANK) return 1;
      if (b.tramoRank === NO_TRAMO_RANK) return -1;
      return (a.tramoRank - b.tramoRank) * factor;
    });
  }
  const key = sort.key;
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    const nx = typeof x === "number" ? x : null;
    const ny = typeof y === "number" ? y : null;
    if (nx === null && ny === null) return byName(a, b);
    if (nx === null) return 1;
    if (ny === null) return -1;
    return (nx - ny) * factor || byName(a, b);
  });
}

// ── A project's tasks under its row (#1042) ─────────────────────────────────

/**
 * The open tasks of one project, as the Tareas tables read them
 * (`qk.tareas.list`): every tramo, every responsable, completed ones out,
 * sorted by due date on the server (#1051), so "Cargar más" appends rows in
 * order. Loaded on the row's first expand.
 */
export function projectOpenTasksFilters(projectId: string): TareasListFilters {
  return { tramo: null, proyecto: projectId, responsable: null, estado: null, q: null, mostrar: "abiertas", orderBy: "vence" };
}

type DueTask = { title: string; commitmentDate: string | null; deliveryDate?: string | null };

/** Tasks by due date (commitment, else delivery; undated last), then title. */
export function sortByDueDate<T>(rows: readonly T[], taskOf: (row: T) => DueTask): T[] {
  const due = (t: DueTask) => (t.commitmentDate ?? t.deliveryDate ?? null)?.slice(0, 10) ?? null;
  return [...rows].sort((a, b) => {
    const x = taskOf(a);
    const y = taskOf(b);
    const dx = due(x);
    const dy = due(y);
    if (dx !== dy) {
      if (dx === null) return 1;
      if (dy === null) return -1;
      return dx < dy ? -1 : 1;
    }
    return x.title.localeCompare(y.title, "es");
  });
}

/** "Tareas de «Casa Lomas»": the row toggle's accessible name. */
export const PROJECT_TASKS_TOGGLE_LABEL = (name: string): string => `Tareas de «${name}»`;
export const PROJECT_TASKS_SEE_ALL = "Ver todas en el proyecto";
export const PROJECT_TASKS_EMPTY = "Este proyecto no tiene tareas abiertas.";
export const PROJECT_TASKS_ERROR = "No se pudieron cargar las tareas";

/** First click on a header: names and tramos A→Z, numbers highest first. */
export function initialSortDirection(key: PortfolioSortKey): "asc" | "desc" {
  return key === "name" || key === "tramo" ? "asc" : "desc";
}

/** `createdAt` falls in the calendar month of `now` (Mexico City). */
function createdThisMonth(createdAt: string, now: Date): boolean {
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) return false;
  return localIsoDate(at, TASK_TREND_TIME_ZONE).slice(0, 7) === localIsoDate(now, TASK_TREND_TIME_ZONE).slice(0, 7);
}

const NO_CHANGE = "sin cambio";

/** A KPI delta: `good` when the change goes the right way, "sin cambio" at 0. */
function kpiDelta(change: number, text: (signedValue: string) => string, lowerIsBetter: boolean, format = INTEGER) {
  if (change === 0) return { label: NO_CHANGE, tone: "neutral" as const };
  const good = lowerIsBetter ? change < 0 : change > 0;
  return { label: text(signed(change, format)), tone: good ? ("good" as const) : ("bad" as const) };
}

/**
 * The five KPIs of the Analítico strip over `projects` (the filtered rows):
 * active projects (+ created this month), mean progress (+ mean deviation
 * where there is a plan), open tasks (vs `series7[0]`), overdue tasks (vs a
 * week ago) and the mean delay (vs a week ago).
 */
export function portfolioKpis(projects: ProjectListItem[], portfolio: Map<string, PortfolioRow>, now: Date): KpiStripProps["items"] {
  const rows = projects.map((p) => ({ project: p, row: portfolio.get(p.id) }));
  const created = projects.filter((p) => createdThisMonth(p.createdAt, now)).length;
  const reals = rows.map(({ project, row }) => realProgress(project, row));
  const avgReal = reals.length > 0 ? Math.round(sum(reals) / reals.length) : null;
  const deviations = rows.map(({ row }) => row?.deviation ?? null).filter((d): d is number => d !== null);
  const avgDeviation = deviations.length > 0 ? Math.round((sum(deviations) / deviations.length) * 10) / 10 : null;
  const open = sum(rows.map(({ project, row }) => row?.open ?? project.taskCounts.open));
  const openBefore = sum(rows.map(({ project, row }) => row?.series7[0] ?? row?.open ?? project.taskCounts.open));
  const overdue = sum(rows.map(({ row }) => row?.overdue ?? 0));
  const overdueBefore = sum(rows.map(({ row }) => row?.overdueWeekAgo ?? 0));
  const delay = weightedMean(rows.map(({ row }) => row?.avgDelayDays ?? null), rows.map(({ row }) => row?.overdue ?? 0));
  const delayBefore = weightedMean(rows.map(({ row }) => row?.avgDelayWeekAgo ?? null), rows.map(({ row }) => row?.overdueWeekAgo ?? 0));
  const pct = overdueShare(overdue, open);

  const delayChange = delay !== null && delayBefore !== null ? Math.round((delay - delayBefore) * 10) / 10 : 0;

  return [
    {
      key: "activos",
      label: "PROYECTOS ACTIVOS",
      value: projects.length,
      delta: created > 0 ? { label: `+${created} este mes`, tone: "good" } : { label: NO_CHANGE, tone: "neutral" },
    },
    {
      key: "avance",
      label: "AVANCE PROMEDIO",
      value: percentText(avgReal),
      delta:
        avgDeviation === null
          ? { label: NO_CHANGE, tone: "neutral" }
          : kpiDelta(avgDeviation, (v) => `${v} pts vs plan`, false, DECIMAL_TRIM),
    },
    {
      key: "abiertas",
      label: "TAREAS ABIERTAS",
      value: open,
      delta: kpiDelta(open - openBefore, (v) => `${v} vs semana pasada`, true),
    },
    {
      key: "vencidas",
      label: "VENCIDAS",
      value: overdue,
      tone: overdue > 0 ? "destructive" : "default",
      ...(pct !== null ? { secondary: ` · ${percentText(pct)}` } : {}),
      delta: kpiDelta(overdue - overdueBefore, (v) => `${v} vs semana pasada`, true),
    },
    {
      key: "retraso",
      label: "RETRASO PROMEDIO",
      value: delayText(delay),
      delta: kpiDelta(delayChange, (v) => `${v} d`, true, DECIMAL),
    },
  ];
}

/** One CSV cell for es-MX Excel (`;` separator): text formula-escaped and quoted when needed; numbers as is. */
function csvField(value: string | number | null): string {
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  const escaped = escapeCsvFormula(value);
  return /[";\r\n]/.test(escaped) ? `"${escaped.replace(/"/g, '""')}"` : escaped;
}

/**
 * The visible rows as CSV for es-MX Excel: UTF-8 BOM, `;` separator, CRLF,
 * one line per project with its tramo and the visible columns (the budget
 * only with `canSeeAdminData`).
 */
export function portfolioCsv(rows: PortfolioTableRow[], opts: { canSeeAdminData: boolean }): string {
  const columns = portfolioColumns(opts);
  const header = ["Etapa", ...columns.flatMap((c) => (c.key === "name" ? [c.label, "Cliente"] : [c.label]))];
  const lines = [header.map(csvField).join(";")];
  for (const row of rows) {
    const cells: (string | number | null)[] = [row.tramo];
    for (const column of columns) {
      if (column.key === "name") cells.push(row.name, row.client);
      else if (column.key === "nextDelivery") cells.push(row.nextDelivery ? `${row.nextDelivery.title} · ${row.nextDelivery.date}` : null);
      else cells.push(row[column.key as keyof PortfolioTableRow] as number | null);
    }
    lines.push(cells.map(csvField).join(";"));
  }
  return `${CSV_BOM}${lines.join("\r\n")}\r\n`;
}

/** `proyectos-{YYYY-MM-DD}.csv` for `now` (Mexico City). */
export function portfolioCsvFileName(now: Date): string {
  return `proyectos-${localIsoDate(now, TASK_TREND_TIME_ZONE)}.csv`;
}

// ── Visual (#992, #1042): portfolio summary, attention cards, project grid, delivery timeline ──

/** Projects the Visual layout shows: `activo` only (paused ones are reachable from Analítico). */
export function activeOnlyProjects(projects: ProjectListItem[]): ProjectListItem[] {
  return projects.filter((p) => p.status === "activo");
}

/** One step of a project's tramo bar or stepper (`tramoSteps`). */
export type TramoStep = ReturnType<typeof tramoSteps>[number];

/** CSS colors of one tramo: dot / bar / stroke, text on its tint, and the tint itself. */
export type TramoTone = { color: string; ink: string; soft: string };

/** Tint token per chart slot (tramo tokens of #981). */
const TINT_BY_SLOT: Record<string, string> = {
  "1": "var(--tint-primary)",
  "2": "var(--tint-violet)",
  "3": "var(--tint-warning)",
  "4": "var(--tint-cyan)",
  "5": "var(--tint-success)",
};
const NEUTRAL_TONE: TramoTone = { color: NEUTRAL_COLOR_VAR, ink: "var(--foreground)", soft: "var(--muted)" };

/**
 * The tone of a tramo key (`NO_TRAMO_KEY` and unknown keys are neutral). With
 * `tramos`, a tramo outside the known keys takes its `sortOrder` slot, as in
 * `tramoColorVar`.
 */
export function tramoTone(key: string | null, tramos: WorkflowRef[] = []): TramoTone {
  if (!key || key === NO_TRAMO_KEY) return NEUTRAL_TONE;
  const color = tramoColorVar(key, tramos.find((t) => t.key === key)?.sortOrder);
  const slot = /^var\(--chart-(\d)\)$/.exec(color)?.[1];
  if (!slot) return NEUTRAL_TONE;
  return { color, ink: `var(--chart-${slot}-ink)`, soft: TINT_BY_SLOT[slot] ?? NEUTRAL_TONE.soft };
}

export type TeamAvatar = { id: string; name: string; initials: string; tramoKey: string | null };

/** One of the four Visual summary cards (#1042): a figure, its bar (0–100) and a footnote. */
export type PortfolioSummaryCard = {
  key: "activos" | "abiertas" | "vencidas" | "avance";
  label: string;
  /** The big figure, preformatted ("12", "62 %"). */
  value: string;
  /** Text after the figure ("tareas abiertas"); empty for none. */
  unit: string;
  /** The small figure at the top right ("3 proyectos"); null for none. */
  aside: string | null;
  /** Bar fill, 0–100. */
  bar: number;
  /** What the bar measures, for screen readers ("62 % al día"). */
  barLabel: string;
  /** Under the bar: a lead text and an optional bold figure. */
  footnote: { lead: string; figure?: string; tone?: "destructive" | "default" };
  /** Chart slot of the card's color (`summaryTone`); "destructive" for Vencidas. */
  tone: "1" | "2" | "5" | "destructive";
};

function pctOf(part: number, total: number): number {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}

/**
 * The Visual summary over the shown projects: Proyectos activos (bar: share
 * without overdue tasks), Tareas abiertas (bar: share on time), Vencidas
 * (bar: share of the open ones) and Avance medio (bar: the mean progress;
 * footnote: the mean deviation from plan).
 */
export function portfolioSummary(projects: ProjectListItem[], portfolio: Map<string, PortfolioRow>): PortfolioSummaryCard[] {
  const rows = projects.map((p) => ({ project: p, row: portfolio.get(p.id) }));
  const count = projects.length;
  const withOverdue = rows.filter(({ row }) => (row?.overdue ?? 0) > 0).length;
  const open = sum(rows.map(({ project, row }) => row?.open ?? project.taskCounts.open));
  const overdue = sum(rows.map(({ row }) => row?.overdue ?? 0));
  const reals = rows.map(({ project, row }) => realProgress(project, row));
  const avgReal = count > 0 ? Math.round(sum(reals) / count) : 0;
  const deviations = rows.map(({ row }) => row?.deviation ?? null).filter((d): d is number => d !== null);
  const avgDeviation = deviations.length > 0 ? Math.round((sum(deviations) / deviations.length) * 10) / 10 : null;
  const onTime = pctOf(open - overdue, open);
  const overdueShareValue = pctOf(overdue, open);
  return [
    {
      key: "activos",
      label: "Proyectos activos",
      value: INTEGER.format(count),
      unit: count === 1 ? "proyecto" : "proyectos",
      aside: null,
      bar: pctOf(count - withOverdue, count),
      barLabel: `${pctOf(count - withOverdue, count)} % sin vencidas`,
      footnote: withOverdue > 0 ? { lead: "Con vencidas", figure: INTEGER.format(withOverdue), tone: "destructive" } : { lead: "Todos al día" },
      tone: "1",
    },
    {
      key: "abiertas",
      label: "Tareas abiertas",
      value: INTEGER.format(open),
      unit: open === 1 ? "tarea abierta" : "tareas abiertas",
      aside: proyectosText(count),
      bar: onTime,
      barLabel: `${onTime} % al día`,
      footnote: { lead: "Al día", figure: `${onTime} %` },
      tone: "2",
    },
    {
      key: "vencidas",
      label: "Vencidas",
      value: INTEGER.format(overdue),
      unit: overdue === 1 ? "tarea vencida" : "tareas vencidas",
      aside: proyectosText(withOverdue),
      bar: overdueShareValue,
      barLabel: `${overdueShareValue} % de las abiertas`,
      footnote: overdue > 0 ? { lead: "De las abiertas", figure: `${overdueShareValue} %`, tone: "destructive" } : { lead: "Sin vencidas" },
      tone: "destructive",
    },
    {
      key: "avance",
      label: "Avance medio",
      value: `${avgReal} %`,
      unit: "",
      aside: proyectosText(count),
      bar: avgReal,
      barLabel: `Avance medio ${avgReal} %`,
      footnote:
        avgDeviation === null
          ? { lead: "Sin plan" }
          : { lead: "Desv. plan", figure: deviationText(avgDeviation), tone: avgDeviation < 0 ? "destructive" : "default" },
      tone: "5",
    },
  ];
}

/** The tone of a summary card (`PortfolioSummaryCard.tone`). */
export function summaryTone(tone: PortfolioSummaryCard["tone"]): TramoTone {
  if (tone === "destructive") return { color: "var(--destructive)", ink: "var(--destructive-ink)", soft: "var(--tint-destructive)" };
  return { color: `var(--chart-${tone})`, ink: `var(--chart-${tone}-ink)`, soft: TINT_BY_SLOT[tone] ?? NEUTRAL_TONE.soft };
}

/** "{client} · {place}", either part alone, or null. */
function clientPlace(project: ProjectListItem): string | null {
  const parts = [project.client?.name?.trim(), placeOf(project)].filter((s): s is string => Boolean(s));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The whole team: encargado, coordinador, then the members (by name), without repeats. */
function fullTeam(project: ProjectListItem): { id: string; name: string }[] {
  const team: { id: string; name: string }[] = [];
  for (const person of [project.manager, project.coordinator, ...(project.members ?? [])]) {
    if (person && !team.some((p) => p.id === person.id)) team.push({ id: person.id, name: person.name });
  }
  return team;
}

/** Avatars shown on an attention card; the rest count as "+n". */
export const ATTENTION_TEAM_MAX = 3;
/** Attention cards shown at most. */
export const ATTENTION_LIMIT = 3;

export type AttentionProject = {
  id: string;
  name: string;
  initials: string;
  tramoKey: string | null;
  /** "Diseño · Proyecto ejecutivo" (the tramo alone without an active fase). */
  badge: string;
  /** "Grupo Altavista · Polanco, CDMX". */
  subtitle: string | null;
  real: number;
  open: number;
  overdue: number;
  steps: TramoStep[];
  /** At most `ATTENTION_TEAM_MAX`. */
  team: TeamAvatar[];
  /** The "+n" after the avatars. */
  teamOverflow: number;
  nextDelivery: { title: string; date: string } | null;
};

/**
 * "Requieren atención": only projects with overdue tasks, most overdue first,
 * then the deviation (most behind first, none last), then the name; at most
 * `limit`.
 */
export function attentionProjects(
  projects: ProjectListItem[],
  portfolio: Map<string, PortfolioRow>,
  tramos: WorkflowRef[],
  limit: number = ATTENTION_LIMIT,
): AttentionProject[] {
  const order = orderedTramos(projects, tramos);
  return projects
    .map((project) => ({ project, row: portfolio.get(project.id) }))
    .filter(({ row }) => (row?.overdue ?? 0) > 0)
    .sort((a, b) => {
      const overdue = (b.row?.overdue ?? 0) - (a.row?.overdue ?? 0);
      if (overdue !== 0) return overdue;
      const da = a.row?.deviation ?? null;
      const db = b.row?.deviation ?? null;
      if (da !== db) {
        if (da === null) return 1;
        if (db === null) return -1;
        return da - db;
      }
      return a.project.name.localeCompare(b.project.name, "es");
    })
    .slice(0, Math.max(0, limit))
    .map(({ project, row }) => projectCardOf(project, row, order));
}

/** One project card (the attention cards and the Visual project grid share it). */
function projectCardOf(project: ProjectListItem, row: PortfolioRow | undefined, order: WorkflowRef[]): AttentionProject {
  const tramo = currentTramoOf(project);
  const tramoKey = tramo?.key ?? null;
  const team = fullTeam(project);
  return {
    id: project.id,
    name: project.name,
    initials: initialsOf(project.name),
    tramoKey,
    badge: tramo ? (project.activePhase ? `${tramo.name} · ${project.activePhase.name}` : tramo.name) : NO_TRAMO_LABEL,
    subtitle: clientPlace(project),
    real: realProgress(project, row),
    open: row?.open ?? project.taskCounts.open,
    overdue: row?.overdue ?? 0,
    steps: tramoSteps(project, order),
    team: team.slice(0, ATTENTION_TEAM_MAX).map((p) => ({ ...p, initials: initialsOf(p.name), tramoKey })),
    teamOverflow: Math.max(0, team.length - ATTENTION_TEAM_MAX),
    nextDelivery: row?.nextDelivery ?? null,
  };
}

/** The Visual project grid (#1042): one card per project, by name, whatever its tramo. */
export function portfolioProjectCards(
  projects: ProjectListItem[],
  portfolio: Map<string, PortfolioRow>,
  tramos: WorkflowRef[],
): AttentionProject[] {
  const order = orderedTramos(projects, tramos);
  return [...projects]
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((project) => projectCardOf(project, portfolio.get(project.id), order));
}

/** Shown in a project card's footer without a next delivery. */
export const NO_UPCOMING_DELIVERY = "Sin entregas próximas";

/**
 * The list data after moving project `id` to tramo `workflowId` (the
 * Tramo actual cell's optimistic update): `currentWorkflow` / `currentWorkflowId` point
 * at it, `needsTramo` clears and `tramos[].current` flips. Other projects
 * are untouched; an unknown tramo leaves the data as is.
 */
export function moveProjectToTramo<T extends { projects: ProjectListItem[]; tramos: WorkflowRef[] }>(
  data: T,
  id: string,
  workflowId: string,
): T {
  const project = data.projects.find((p) => p.id === id);
  const target =
    data.tramos.find((t) => t.id === workflowId) ??
    project?.tramos.find((t) => t.id === workflowId) ??
    null;
  if (!project || !target) return data;
  const ref: WorkflowRef = { id: target.id, key: target.key, name: target.name, sortOrder: target.sortOrder };
  return {
    ...data,
    projects: data.projects.map((p) =>
      p.id === id
        ? {
            ...p,
            currentWorkflowId: ref.id,
            currentWorkflow: ref,
            needsTramo: false,
            tramos: p.tramos.map((t) => ({ ...t, current: t.id === ref.id })),
          }
        : p,
    ),
  };
}

export type TimelineDay = { iso: string; /** "MAR 10" */ label: string; isToday: boolean };
export type TimelineItem = {
  projectId: string;
  projectName: string;
  title: string;
  date: string;
  dayIndex: number;
  tramoKey: string | null;
};

/** Days the delivery timeline covers (today … today + 10). */
export const TIMELINE_DAYS = 11;

const DAY_MS = 86_400_000;
const TIMELINE_WEEKDAY = new Intl.DateTimeFormat("es-MX", { weekday: "short", timeZone: "UTC" });
const TIMELINE_MONTH = new Intl.DateTimeFormat("es-MX", { month: "short", timeZone: "UTC" });

/** `YYYY-MM-DD` (or ISO) → UTC midnight ms, or null. */
function dayMs(date: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/** Uppercase short name without the abbreviation dot ("mar." → "MAR"). */
function shortUpper(format: Intl.DateTimeFormat, ms: number): string {
  return format.format(new Date(ms)).replace(/\./g, "").trim().toUpperCase();
}

/**
 * "Próximas entregas": `days` days from `today` (`YYYY-MM-DD`, project
 * timezone), each labelled "MAR 10", and every project's next delivery that
 * falls inside them, by day then project name. Range label "10 – 20 NOV"
 * ("28 NOV – 8 DIC" across months).
 */
export function deliveryTimeline(
  projects: ProjectListItem[],
  portfolio: Map<string, PortfolioRow>,
  today: string,
  days: number = TIMELINE_DAYS,
): { days: TimelineDay[]; items: TimelineItem[]; rangeLabel: string } {
  const start = dayMs(today);
  const count = Math.max(1, Math.floor(days));
  if (start === null) return { days: [], items: [], rangeLabel: "" };
  const timelineDays: TimelineDay[] = Array.from({ length: count }, (_, i) => {
    const ms = start + i * DAY_MS;
    const iso = new Date(ms).toISOString().slice(0, 10);
    return { iso, label: `${shortUpper(TIMELINE_WEEKDAY, ms)} ${new Date(ms).getUTCDate()}`, isToday: i === 0 };
  });
  const items: TimelineItem[] = [];
  for (const project of projects) {
    const delivery = portfolio.get(project.id)?.nextDelivery;
    const ms = delivery ? dayMs(delivery.date) : null;
    if (!delivery || ms === null) continue;
    const dayIndex = Math.round((ms - start) / DAY_MS);
    if (dayIndex < 0 || dayIndex >= count) continue;
    items.push({
      projectId: project.id,
      projectName: project.name,
      title: delivery.title,
      date: delivery.date.slice(0, 10),
      dayIndex,
      tramoKey: currentTramoOf(project)?.key ?? null,
    });
  }
  items.sort((a, b) => a.dayIndex - b.dayIndex || a.projectName.localeCompare(b.projectName, "es"));
  const end = start + (count - 1) * DAY_MS;
  const startMonth = shortUpper(TIMELINE_MONTH, start);
  const endMonth = shortUpper(TIMELINE_MONTH, end);
  const startDay = new Date(start).getUTCDate();
  const endDay = new Date(end).getUTCDate();
  const rangeLabel =
    startMonth === endMonth ? `${startDay} – ${endDay} ${endMonth}` : `${startDay} ${startMonth} – ${endDay} ${endMonth}`;
  return { days: timelineDays, items, rangeLabel };
}

/** "{n} obras activas · {k} entregas en los próximos 11 días." (singular forms for 1). */
export function visualDescription(listed: number, deliveries: number): string {
  const obras = listed === 1 ? "1 obra activa" : `${listed} obras activas`;
  const entregas = deliveries === 1 ? "1 entrega" : `${deliveries} entregas`;
  return `${obras} · ${entregas} en los próximos ${TIMELINE_DAYS} días.`;
}
