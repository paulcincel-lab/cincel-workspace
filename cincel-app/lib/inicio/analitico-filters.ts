/**
 * Inicio Analítico table filters (#991): Responsable (an assignee id) and
 * Etapa (an etapa key) applied on the client to the Atención, Carga, Etapas
 * and Agenda tables. The KPI strip and Ritmo semanal are never filtered (the
 * server data has no per-person or per-etapa split for them). Pure and
 * client-safe; with no filter set every function returns its input as is.
 */
import type { InicioEtapaAssigneeRow } from "@/lib/types/redesign";
import type { AgendaItem, AttentionItem, DistributionSegment, PersonDatum, EtapaKey } from "@/lib/types/widgets";

/** `useInicioDashboard` filters: null = all. */
export type InicioAnaliticoFilters = { responsable: string | null; etapa: EtapaKey | null };

/** The filter keys of `useInicioDashboard` (`createDashboardStore` `filters`). */
export const INICIO_FILTER_KEYS = ["responsable", "etapa"] as const satisfies readonly (keyof InicioAnaliticoFilters)[];

export function hasActiveFilters(filters: InicioAnaliticoFilters): boolean {
  return filters.responsable !== null || filters.etapa !== null;
}

/** Atención items of the responsable and of the etapa. */
export function filterAttention<T extends Pick<AttentionItem, "assignee" | "etapa">>(
  items: T[],
  filters: InicioAnaliticoFilters,
): T[] {
  if (!hasActiveFilters(filters)) return items;
  return items.filter(
    (item) =>
      (filters.responsable === null || item.assignee?.id === filters.responsable) &&
      (filters.etapa === null || item.etapa === filters.etapa),
  );
}

/**
 * Carga por persona: the responsable alone; with an etapa, the people with at
 * least one open task in it (`byEtapaAssignee`). Without the split rows a
 * etapa filter keeps every person.
 */
export function filterWorkload<T extends Pick<PersonDatum, "id">>(
  people: T[],
  filters: InicioAnaliticoFilters,
  byEtapaAssignee: readonly InicioEtapaAssigneeRow[] = [],
): T[] {
  if (!hasActiveFilters(filters)) return people;
  const inEtapa =
    filters.etapa !== null && byEtapaAssignee.length > 0
      ? new Set(
          byEtapaAssignee
            .filter((row) => row.etapa === filters.etapa && row.open > 0 && row.assigneeId !== null)
            .map((row) => row.assigneeId),
        )
      : null;
  return people.filter(
    (person) =>
      (filters.responsable === null || person.id === filters.responsable) && (inEtapa === null || inEtapa.has(person.id)),
  );
}

/**
 * Tareas abiertas por etapa: the etapa's segment alone; with a responsable,
 * each segment recounted from that person's open tasks (`byEtapaAssignee`):
 * `value` = open, `secondary` = overdue, `extra.diasProm` = their mean age.
 * Segments left without open tasks are dropped.
 */
export function filterEtapas(
  segments: DistributionSegment[],
  filters: InicioAnaliticoFilters,
  byEtapaAssignee: readonly InicioEtapaAssigneeRow[] = [],
): DistributionSegment[] {
  if (!hasActiveFilters(filters)) return segments;
  const ofEtapa = filters.etapa === null ? segments : segments.filter((s) => s.key === filters.etapa);
  if (filters.responsable === null) return ofEtapa;
  const mine = byEtapaAssignee.filter((row) => row.assigneeId === filters.responsable);
  return ofEtapa.flatMap((segment) => {
    const rows = mine.filter((row) => row.etapa === segment.key);
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

/** Agenda de hoy items of the responsable and of the etapa. */
export function filterAgenda<T extends Pick<AgendaItem, "etapa"> & { assignee?: { id: string } | null }>(
  items: T[],
  filters: InicioAnaliticoFilters,
): T[] {
  if (!hasActiveFilters(filters)) return items;
  return items.filter(
    (item) =>
      (filters.responsable === null || item.assignee?.id === filters.responsable) &&
      (filters.etapa === null || (item.etapa ?? null) === filters.etapa),
  );
}
