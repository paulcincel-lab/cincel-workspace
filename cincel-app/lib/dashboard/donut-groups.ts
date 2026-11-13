import {
  BASE_STATUSES,
  BASE_STATUS_COLOR,
  BASE_STATUS_LABEL,
  isTaskClosed,
  statusColorVar,
} from "@/lib/tasks/status-options";
import { etapaColorSlot } from "@/lib/etapas/etapa-color";
import type { TaskStatus, WorkflowRef } from "@/lib/types/core";

/** One donut segment: legend label, count and CSS fill color. */
export type DonutSlice = {
  key: string;
  label: string;
  count: number;
  color: string;
};

/**
 * Tasks by base status. Custom statuses count under the base status stored
 * underneath them; a closing custom status counts as Completado.
 */
export function tasksByBaseStatus(
  tasks: Array<{
    status: TaskStatus;
    customStatus?: { closes: boolean } | null;
  }>,
): DonutSlice[] {
  const counts = new Map<TaskStatus, number>(BASE_STATUSES.map((s) => [s, 0]));
  tasks.forEach((task) => {
    const base: TaskStatus = isTaskClosed(task) ? "completado" : task.status;
    counts.set(base, (counts.get(base) ?? 0) + 1);
  });
  return BASE_STATUSES.map((status) => ({
    key: status,
    label: BASE_STATUS_LABEL[status],
    count: counts.get(status) ?? 0,
    color: statusColorVar(BASE_STATUS_COLOR[status]),
  }));
}

export const NO_ETAPA_LABEL = "Sin etapa";

/** Chart fill for an etapa: its fixed chart token, or the neutral gray. */
function etapaChartColor(etapa: WorkflowRef | null): string {
  const slot = etapa ? etapaColorSlot(etapa) : null;
  return slot ? `var(--chart-${slot})` : "var(--muted-foreground)";
}

/**
 * Projects by their current etapa, in etapa order; projects without one go to
 * "Sin etapa" (last). BE §8.8.
 */
export function projectsByEtapa(projects: Array<{ currentWorkflow: WorkflowRef | null }>): DonutSlice[] {
  const slices = new Map<string, DonutSlice & { sortOrder: number }>();
  let noEtapa = 0;
  projects.forEach(({ currentWorkflow: etapa }) => {
    if (!etapa) {
      noEtapa += 1;
      return;
    }
    const slice = slices.get(etapa.id) ?? {
      key: etapa.id,
      label: etapa.name,
      count: 0,
      color: etapaChartColor(etapa),
      sortOrder: etapa.sortOrder,
    };
    slice.count += 1;
    slices.set(etapa.id, slice);
  });
  const rows: DonutSlice[] = [...slices.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map(({ sortOrder: _sortOrder, ...slice }) => slice);
  if (noEtapa > 0)
    rows.push({
      key: "sin-etapa",
      label: NO_ETAPA_LABEL,
      count: noEtapa,
      color: etapaChartColor(null),
    });
  return rows;
}
