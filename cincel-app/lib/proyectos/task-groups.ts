import type { TaskListItem, WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";

export const NO_PHASE_LABEL = "Sin fase · revisar";
export const NO_ETAPA_LABEL = "Sin etapa";
export const ADMIN_GROUP_LABEL = "Administración";

/** What grouping reads of a task: `TaskListItem` or the slim `TaskListRow`. */
export type FichaGroupTask = Pick<TaskListItem, "kind" | "workflow" | "phase">;

export type FichaPhaseGroup<T extends FichaGroupTask = TaskListItem> = {
  id: string;
  name: string;
  phase: WorkflowPhaseRef | null;
  tasks: T[];
};
export type FichaEtapaGroup<T extends FichaGroupTask = TaskListItem> = {
  id: string;
  name: string;
  /** Null for "Sin etapa" and "Administración". */
  etapa: WorkflowRef | null;
  kind: "etapa" | "sin_etapa" | "admin";
  phases: FichaPhaseGroup<T>[];
  count: number;
};

const NO_PHASE_ID = "__sin_fase__";

function groupByPhase<T extends FichaGroupTask>(tasks: T[]): FichaPhaseGroup<T>[] {
  const groups = new Map<string, FichaPhaseGroup<T>>();
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
 * The ficha's task list (FE §3.5): one group per etapa in etapa order, each
 * split by fase in catalog order with "Sin fase · revisar" last. Tasks with
 * no etapa go under "Sin etapa"; admin tasks under "Administración" (only
 * when `includeAdmin`, i.e. the viewer is an administrator).
 */
export function groupFichaTasks<T extends FichaGroupTask = TaskListItem>(
  tasks: T[],
  options: { includeAdmin?: boolean } = {}
): FichaEtapaGroup<T>[] {
  const etapas = new Map<string, { etapa: WorkflowRef; tasks: T[] }>();
  const noEtapa: T[] = [];
  const admin: T[] = [];

  for (const task of tasks) {
    if (task.kind === "admin") {
      admin.push(task);
    } else if (task.workflow) {
      const entry = etapas.get(task.workflow.id) ?? { etapa: task.workflow, tasks: [] };
      entry.tasks.push(task);
      etapas.set(task.workflow.id, entry);
    } else {
      noEtapa.push(task);
    }
  }

  const groups: FichaEtapaGroup<T>[] = [...etapas.values()]
    .sort((a, b) => a.etapa.sortOrder - b.etapa.sortOrder || a.etapa.name.localeCompare(b.etapa.name, "es"))
    .map(({ etapa, tasks: rows }) => ({
      id: etapa.id,
      name: etapa.name,
      etapa,
      kind: "etapa" as const,
      phases: groupByPhase(rows),
      count: rows.length,
    }));

  if (noEtapa.length > 0) {
    groups.push({
      id: "__sin_etapa__",
      name: NO_ETAPA_LABEL,
      etapa: null,
      kind: "sin_etapa",
      phases: [{ id: NO_PHASE_ID, name: NO_PHASE_LABEL, phase: null, tasks: noEtapa }],
      count: noEtapa.length,
    });
  }

  if (options.includeAdmin && admin.length > 0) {
    groups.push({
      id: "__administracion__",
      name: ADMIN_GROUP_LABEL,
      etapa: null,
      kind: "admin",
      phases: [{ id: "__admin__", name: ADMIN_GROUP_LABEL, phase: null, tasks: admin }],
      count: admin.length,
    });
  }

  return groups;
}

/** True when the project has non-admin tasks without an etapa (drives "Asignar etapa"). */
export function hasTasksWithoutEtapa(tasks: FichaGroupTask[]): boolean {
  return tasks.some((t) => t.kind !== "admin" && !t.workflow);
}
