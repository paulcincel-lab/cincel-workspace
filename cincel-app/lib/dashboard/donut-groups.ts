import {
  BASE_STATUSES,
  BASE_STATUS_COLOR,
  BASE_STATUS_LABEL,
  isTaskClosed,
  statusColorVar,
} from "@/lib/tasks/status-options";
import { tramoColorSlot } from "@/lib/tramos/tramo-color";
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

export const NO_TRAMO_LABEL = "Sin tramo";

/** Chart fill for a tramo: its fixed chart token, or the neutral gray. */
function tramoChartColor(tramo: WorkflowRef | null): string {
  const slot = tramo ? tramoColorSlot(tramo) : null;
  return slot ? `var(--chart-${slot})` : "var(--muted-foreground)";
}

/**
 * Projects by their current tramo, in tramo order; projects without one go to
 * "Sin tramo" (last). BE §8.8.
 */
export function projectsByTramo(projects: Array<{ currentWorkflow: WorkflowRef | null }>): DonutSlice[] {
  const slices = new Map<string, DonutSlice & { sortOrder: number }>();
  let noTramo = 0;
  projects.forEach(({ currentWorkflow: tramo }) => {
    if (!tramo) {
      noTramo += 1;
      return;
    }
    const slice = slices.get(tramo.id) ?? {
      key: tramo.id,
      label: tramo.name,
      count: 0,
      color: tramoChartColor(tramo),
      sortOrder: tramo.sortOrder,
    };
    slice.count += 1;
    slices.set(tramo.id, slice);
  });
  const rows: DonutSlice[] = [...slices.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
    .map(({ sortOrder: _sortOrder, ...slice }) => slice);
  if (noTramo > 0)
    rows.push({
      key: "sin-tramo",
      label: NO_TRAMO_LABEL,
      count: noTramo,
      color: tramoChartColor(null),
    });
  return rows;
}
