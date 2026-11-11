/**
 * Tareas · Analítico counts (`qk.tareas.summary(f)`): one grouping-sets query
 * over project + tramo, project and the whole set (`tasksRepository.taskSummary`),
 * so every KPI, "Ir a" count, header, tramo row and footer is right however
 * many tasks match, not only over the loaded rows. Pure and client-safe.
 *
 * - open: not completado and no closing custom status;
 * - overdue: open and `coalesce(commitment_date, delivery_date)` before today
 *   in America/Mexico_City (the `taskDueDate` rule);
 * - daysLateSum: the days late of the overdue tasks, summed.
 */
import type { TareasListFilters } from "@/lib/query/keys";
import type { TaskSort } from "@/lib/tareas/sort";

export type TareasSummaryCounts = { total: number; open: number; overdue: number; blocked: number; daysLateSum: number };

export type TareasSummaryTramo = TareasSummaryCounts & {
  /** `id: null` = the tasks without a tramo ("Sin tramo"), sorted last. */
  tramo: { id: string | null; key: string | null; name: string; sortOrder: number };
};

export type TareasSummaryProject = TareasSummaryCounts & { project: { id: string; name: string }; tramos: TareasSummaryTramo[] };

export type TareasSummary = {
  /** The filtered set, by overdue desc then name; tramos by sort order. */
  projects: TareasSummaryProject[];
  totals: TareasSummaryCounts & { projects: number };
  /**
   * The same filters without `mostrar` ("de 4", "de 28"). `projectList` names
   * every project of that set with its task count and its count per tramo id
   * (`""` = Sin tramo), so En retraso can name the projects it hides and say
   * "4 de 8 tareas".
   */
  unfiltered: { projects: number; total: number; projectList?: TareasSummaryUnfilteredProject[] };
};

export type TareasSummaryUnfilteredProject = { id: string; name: string; total: number; byTramo: Record<string, number> };

/** `byTramo` key of a tramo (`""` for Sin tramo). */
export const summaryTramoKey = (tramoId: string | null): string => tramoId ?? "";

/**
 * The list filters of one Analítico tramo group (`qk.tareas.list`): the page
 * filters narrowed to the project and the tramo ("Sin tramo" is
 * `SIN_TRAMO_KEY`), in the "retraso" order or the header sort (`sort`,
 * #1044; `orderDir` left out for asc, so the default key stays the same).
 */
export function tareasGroupFilters(
  f: TareasListFilters,
  projectId: string,
  tramoKey: string | null,
  sort?: TaskSort | null,
): TareasListFilters {
  // The group is one project: the Proyecto multi-select (#1045) adds nothing, so its key stays the same.
  const { proyectos: _proyectos, ...rest } = f;
  const orderBy = sort?.orderBy ?? "retraso";
  const orderDir = sort?.orderDir === "desc" ? { orderDir: "desc" as const } : {};
  return { ...rest, proyecto: projectId, tramo: tramoKey ?? SIN_TRAMO_KEY, orderBy, ...orderDir };
}

/** Name of the tramo group of the tasks without a tramo. */
export const SIN_TRAMO_LABEL = "Sin tramo";

/**
 * The tramo filter value of the "Sin tramo" group (`TareasListFilters.tramo`):
 * the tasks without a tramo. No live tramo key starts with `__`.
 */
export const SIN_TRAMO_KEY = "__sin_tramo";

/** Sort order of "Sin tramo": after every real tramo. */
export const SIN_TRAMO_SORT = 2147483647;

export const EMPTY_SUMMARY_COUNTS: TareasSummaryCounts = { total: 0, open: 0, overdue: 0, blocked: 0, daysLateSum: 0 };

export const EMPTY_TAREAS_SUMMARY: TareasSummary = {
  projects: [],
  totals: { ...EMPTY_SUMMARY_COUNTS, projects: 0 },
  unfiltered: { projects: 0, total: 0, projectList: [] },
};

/** Overdue share of the open tasks, 0–100 rounded; 0 without open tasks. */
export const pctVencidas = (c: TareasSummaryCounts) => (c.open ? Math.round((c.overdue / c.open) * 100) : 0);

/** Average days late of the overdue tasks, one decimal; null without overdue tasks. */
export const retrasoPromedio = (c: TareasSummaryCounts) =>
  c.overdue ? Math.round((c.daysLateSum / c.overdue) * 10) / 10 : null;

/** Projects by overdue desc, then name (es). */
export function compareSummaryProjects(a: TareasSummaryProject, b: TareasSummaryProject): number {
  return b.overdue - a.overdue || a.project.name.localeCompare(b.project.name, "es");
}

/** Tramos by sort order ("Sin tramo" last), then name. */
export function compareSummaryTramos(a: TareasSummaryTramo, b: TareasSummaryTramo): number {
  return a.tramo.sortOrder - b.tramo.sortOrder || a.tramo.name.localeCompare(b.tramo.name, "es");
}

/** The projects of the unfiltered set that the filtered one leaves out (En retraso hides them), by name. */
export function hiddenSummaryProjects(summary: TareasSummary): { id: string; name: string }[] {
  const shown = new Set(summary.projects.map((p) => p.project.id));
  return (summary.unfiltered.projectList ?? [])
    .filter((p) => !shown.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
}
