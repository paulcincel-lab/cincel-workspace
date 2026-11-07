import type { TaskKind, WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";

export const ADMIN_TASK_LABEL = "Administración";
export const NO_TRAMO_PHASE_LABEL = "—";

type NameRef = Pick<WorkflowRef, "name"> | Pick<WorkflowPhaseRef, "name">;

/**
 * The task's fields `tramoPhaseLabel` reads. `phaseRef` is today's name of the
 * fase on `TaskListItem`; `phase` is accepted once it becomes the fase ref
 * (the deprecated free-text string is ignored).
 */
export type TramoPhaseLabelTask = {
  kind: TaskKind;
  workflow: Pick<WorkflowRef, "name"> | null;
  phaseRef?: NameRef | null;
  phase?: NameRef | string | null;
};

function phaseName(task: TramoPhaseLabelTask): string | null {
  const ref = task.phaseRef ?? (typeof task.phase === "object" ? task.phase : null);
  const name = ref?.name.trim();
  return name ? name : null;
}

/**
 * "Tramo · Fase" text for a task: "Diseño · Ejecutivo", tramo only "Diseño",
 * an admin task "Administración", no tramo "—".
 */
export function tramoPhaseLabel(task: TramoPhaseLabelTask): string {
  if (task.kind === "admin") return ADMIN_TASK_LABEL;
  const tramo = task.workflow?.name.trim();
  if (!tramo) return NO_TRAMO_PHASE_LABEL;
  const phase = phaseName(task);
  return phase ? `${tramo} · ${phase}` : tramo;
}
