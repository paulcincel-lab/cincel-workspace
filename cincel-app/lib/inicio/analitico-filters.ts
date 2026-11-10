/**
 * Inicio Analítico table filters (#991): Responsable (an assignee id) and
 * Tramo (a tramo key) applied on the client to the Atención, Carga, Tramos
 * and Agenda tables. The KPI strip and Ritmo semanal are never filtered (the
 * server data has no per-person or per-tramo split for them). Pure and
 * client-safe; with no filter set every function returns its input as is.
 */
import type { InicioTramoAssigneeRow } from "@/lib/types/redesign";
import type { AgendaItem, AttentionItem, DistributionSegment, PersonDatum, TramoKey } from "@/lib/types/widgets";

/** `useInicioDashboard` filters: null = all. */
export type InicioAnaliticoFilters = { responsable: string | null; tramo: TramoKey | null };

/** The filter keys of `useInicioDashboard` (`createDashboardStore` `filters`). */
export const INICIO_FILTER_KEYS = ["responsable", "tramo"] as const satisfies readonly (keyof InicioAnaliticoFilters)[];

export function hasActiveFilters(filters: InicioAnaliticoFilters): boolean {
  return filters.responsable !== null || filters.tramo !== null;
}

/** Atención items of the responsable and of the tramo. */
export function filterAttention<T extends Pick<AttentionItem, "assignee" | "tramo">>(
  items: T[],
  filters: InicioAnaliticoFilters,
): T[] {
  if (!hasActiveFilters(filters)) return items;
  return items.filter(
    (item) =>
      (filters.responsable === null || item.assignee?.id === filters.responsable) &&
      (filters.tramo === null || item.tramo === filters.tramo),
  );
}

/**
 * Carga por persona: the responsable alone; with a tramo, the people with at
 * least one open task in it (`byTramoAssignee`). Without the split rows a
 * tramo filter keeps every person.
 */
export function filterWorkload<T extends Pick<PersonDatum, "id">>(
  people: T[],
  filters: InicioAnaliticoFilters,
  byTramoAssignee: readonly InicioTramoAssigneeRow[] = [],
): T[] {
  if (!hasActiveFilters(filters)) return people;
  const inTramo =
    filters.tramo !== null && byTramoAssignee.length > 0
      ? new Set(
          byTramoAssignee
            .filter((row) => row.tramo === filters.tramo && row.open > 0 && row.assigneeId !== null)
            .map((row) => row.assigneeId),
        )
      : null;
  return people.filter(
    (person) =>
      (filters.responsable === null || person.id === filters.responsable) && (inTramo === null || inTramo.has(person.id)),
  );
}

/**
 * Tareas abiertas por tramo: the tramo's segment alone; with a responsable,
 * each segment recounted from that person's open tasks (`byTramoAssignee`):
 * `value` = open, `secondary` = overdue, `extra.diasProm` = their mean age.
 * Segments left without open tasks are dropped.
 */
export function filterTramos(
  segments: DistributionSegment[],
  filters: InicioAnaliticoFilters,
  byTramoAssignee: readonly InicioTramoAssigneeRow[] = [],
): DistributionSegment[] {
  if (!hasActiveFilters(filters)) return segments;
  const ofTramo = filters.tramo === null ? segments : segments.filter((s) => s.key === filters.tramo);
  if (filters.responsable === null) return ofTramo;
  const mine = byTramoAssignee.filter((row) => row.assigneeId === filters.responsable);
  return ofTramo.flatMap((segment) => {
    const rows = mine.filter((row) => row.tramo === segment.key);
    const open = rows.reduce((sum, row) => sum + row.open, 0);
    if (open === 0) return [];
    const overdue = rows.reduce((sum, row) => sum + row.overdue, 0);
    const ageDays = rows.reduce((sum, row) => sum + row.ageDays, 0);
    return [
      {
        ...segment,
        value: open,
        secondary: overdue,
        extra: { ...segment.extra, diasProm: Math.round((ageDays / open) * 10) / 10 },
      },
    ];
  });
}

/** Agenda de hoy items of the responsable and of the tramo. */
export function filterAgenda<T extends Pick<AgendaItem, "tramo"> & { assignee?: { id: string } | null }>(
  items: T[],
  filters: InicioAnaliticoFilters,
): T[] {
  if (!hasActiveFilters(filters)) return items;
  return items.filter(
    (item) =>
      (filters.responsable === null || item.assignee?.id === filters.responsable) &&
      (filters.tramo === null || (item.tramo ?? null) === filters.tramo),
  );
}
