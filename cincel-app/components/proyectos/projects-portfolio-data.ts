/**
 * Data shapes of the /proyectos list (redesign FE §3.5, §4.6): the cards, the
 * portfolio table and the "Proyectos por tramo" segments, built once from
 * `fetchProjectsAction` + `fetchProjectsPortfolioAction`. Every style renders
 * these same shapes through the widget library; nothing here depends on the
 * presentation style. Pure and client-safe.
 */
import { tramoColorVar } from "@/lib/tramos/compat";
import type { ProjectListItem, WorkflowRef } from "@/lib/types/core";
import type { PortfolioRow, PresentationStyle } from "@/lib/types/redesign";
import type { DistributionSegment, EntityCard, RecordColumn, RecordTableData } from "@/lib/types/widgets";

/** Statuses the list shows (the archived ones live in the ficha and the legacy list). */
const LISTED_STATUSES: ReadonlySet<ProjectListItem["status"]> = new Set(["activo", "pausado"]);

export const NO_TRAMO_KEY = "sin-tramo";
export const NO_TRAMO_LABEL = "Sin tramo";
const NEUTRAL_COLOR_VAR = "var(--muted-foreground)";
const NO_VALUE = "—";

export const PROJECTS_TITLE = "Proyectos";
export const PROJECTS_BY_TRAMO_TITLE = "Proyectos por tramo";
export const BUDGET_COLUMN_LABEL = "Presup. ejercido";
export const NEXT_DELIVERY_LABEL = "Próxima entrega";

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

/** Projects whose name, place or code contain `query` (accent- and case-insensitive). */
export function searchProjects(projects: ProjectListItem[], query: string): ProjectListItem[] {
  const q = fold(query);
  if (!q) return projects;
  return projects.filter((p) => [p.name, placeOf(p) ?? "", p.code ?? ""].some((field) => fold(field).includes(q)));
}

/** The project's current tramo, or null (`needsTramo`). */
export function currentTramoOf(project: ProjectListItem): WorkflowRef | null {
  if (project.needsTramo) return null;
  return project.currentWorkflow ?? project.tramos.find((t) => t.current) ?? null;
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
const HIDE_ANALITICO: PresentationStyle[] = ["visual", "analitico"];

/**
 * The portfolio table (FE §3.5): Esencial reads nombre, lugar, tramo, avance
 * and próxima entrega; Analítico reads Real, Plan, Desv., Presup. ejercido
 * (only with `canSeeAdminData`: the column is absent otherwise), Abiertas,
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
    { key: "lugar", label: "Lugar", hideOn: ["visual", "analitico"] },
    { key: "tramo", label: "Tramo" },
    { key: "avance", label: "Avance", format: "percent", hideOn: HIDE_ANALITICO },
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
