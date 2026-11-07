import type { TaskListItem, WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";

export const NO_PHASE_LABEL = "Sin fase · revisar";
export const NO_TRAMO_LABEL = "Sin tramo";
export const ADMIN_GROUP_LABEL = "Administración";

export type FichaPhaseGroup = { id: string; name: string; phase: WorkflowPhaseRef | null; tasks: TaskListItem[] };
export type FichaTramoGroup = {
  id: string;
  name: string;
  /** Null for "Sin tramo" and "Administración". */
  tramo: WorkflowRef | null;
  kind: "tramo" | "sin_tramo" | "admin";
  phases: FichaPhaseGroup[];
  count: number;
};

const NO_PHASE_ID = "__sin_fase__";

function groupByPhase(tasks: TaskListItem[]): FichaPhaseGroup[] {
  const groups = new Map<string, FichaPhaseGroup>();
  for (const task of tasks) {
    const phase = task.phase;
    const id = phase?.id ?? NO_PHASE_ID;
    const group = groups.get(id) ?? { id, name: phase?.name ?? NO_PHASE_LABEL, phase: phase ?? null, tasks: [] };
    group.tasks.push(task);
    groups.set(id, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (!a.phase) return b.phase ? 1 : 0;
    if (!b.phase) return -1;
    return a.phase.sortOrder - b.phase.sortOrder || a.name.localeCompare(b.name, "es");
  });
}

/**
 * The ficha's task list (FE §3.5): one group per tramo in tramo order, each
 * split by fase in catalog order with "Sin fase · revisar" last. Tasks with
 * no tramo go under "Sin tramo"; admin tasks under "Administración" (only
 * when `includeAdmin`, i.e. the viewer is an administrator).
 */
export function groupFichaTasks(tasks: TaskListItem[], options: { includeAdmin?: boolean } = {}): FichaTramoGroup[] {
  const tramos = new Map<string, { tramo: WorkflowRef; tasks: TaskListItem[] }>();
  const noTramo: TaskListItem[] = [];
  const admin: TaskListItem[] = [];

  for (const task of tasks) {
    if (task.kind === "admin") {
      admin.push(task);
    } else if (task.workflow) {
      const entry = tramos.get(task.workflow.id) ?? { tramo: task.workflow, tasks: [] };
      entry.tasks.push(task);
      tramos.set(task.workflow.id, entry);
    } else {
      noTramo.push(task);
    }
  }

  const groups: FichaTramoGroup[] = [...tramos.values()]
    .sort((a, b) => a.tramo.sortOrder - b.tramo.sortOrder || a.tramo.name.localeCompare(b.tramo.name, "es"))
    .map(({ tramo, tasks: rows }) => ({
      id: tramo.id,
      name: tramo.name,
      tramo,
      kind: "tramo" as const,
      phases: groupByPhase(rows),
      count: rows.length,
    }));

  if (noTramo.length > 0) {
    groups.push({
      id: "__sin_tramo__",
      name: NO_TRAMO_LABEL,
      tramo: null,
      kind: "sin_tramo",
      phases: [{ id: NO_PHASE_ID, name: NO_PHASE_LABEL, phase: null, tasks: noTramo }],
      count: noTramo.length,
    });
  }

  if (options.includeAdmin && admin.length > 0) {
    groups.push({
      id: "__administracion__",
      name: ADMIN_GROUP_LABEL,
      tramo: null,
      kind: "admin",
      phases: [{ id: "__admin__", name: ADMIN_GROUP_LABEL, phase: null, tasks: admin }],
      count: admin.length,
    });
  }

  return groups;
}

/** True when the project has non-admin tasks without a tramo (drives "Asignar tramo"). */
export function hasTasksWithoutTramo(tasks: TaskListItem[]): boolean {
  return tasks.some((t) => t.kind !== "admin" && !t.workflow);
}
