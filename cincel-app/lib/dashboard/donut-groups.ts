import { areaColorVar } from "@/lib/areas/area-color";
import {
  BASE_STATUSES,
  BASE_STATUS_COLOR,
  BASE_STATUS_LABEL,
  isTaskClosed,
  statusColorVar,
} from "@/lib/tasks/status-options";
import type { TaskStatus } from "@/lib/types/core";

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

export const NO_AREA_LABEL = "Sin área";

/** Projects by the área of their primary stage; projects without one go to "Sin área". */
export function projectsByArea(
  projects: Array<{
    area: { id: string; name: string; colorSlot: number | null } | null;
  }>,
): DonutSlice[] {
  const slices = new Map<string, DonutSlice>();
  let noArea = 0;
  projects.forEach(({ area }) => {
    if (!area) {
      noArea += 1;
      return;
    }
    const slice = slices.get(area.id) ?? {
      key: area.id,
      label: area.name,
      count: 0,
      color: areaColorVar(area.colorSlot),
    };
    slice.count += 1;
    slices.set(area.id, slice);
  });
  const rows = [...slices.values()];
  if (noArea > 0)
    rows.push({
      key: "sin-area",
      label: NO_AREA_LABEL,
      count: noArea,
      color: areaColorVar(null),
    });
  return rows;
}
