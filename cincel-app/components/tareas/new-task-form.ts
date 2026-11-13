/**
 * Pure form logic of `NewTaskDialog` (redesign FE §3.4): defaults, the fase
 * catalog of the selected etapa, "Usar plantilla de la etapa", validation and
 * the `createUserTaskAction` / `createSubtaskAction` inputs. Client-safe.
 */
import { actionErrorText } from "@/lib/errors";
import { parseStatusValue, statusSelectValue, type ParsedStatusValue } from "@/lib/tasks/status-options";
import type {
  ProjectListItem,
  SubtaskInput,
  TaskPriority,
  UserTaskInput,
  WorkflowDetail,
  TaskStatus,
  WorkflowPhaseRef,
} from "@/lib/types/core";

export const PRIORITY_OPTIONS: readonly { value: TaskPriority; label: string }[] = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "baja", label: "Baja" },
];

export type NewTaskDraft = {
  title: string;
  /** "" until the projects load or when none is picked. */
  projectId: string;
  /** Null: follow the default etapa (`defaults.etapaKey`, then the project's current etapa). */
  workflowId: string | null;
  phaseId: string | null;
  managerId: string | null;
  /** `YYYY-MM-DD` or "". Saved as the task's `deliveryDate`. */
  deliveryDate: string;
  priority: TaskPriority;
  description: string;
  /** One row per subtarea; empty rows are dropped on save. */
  subtasks: string[];
};

export type NewTaskDefaults = {
  projectId?: string;
  etapaKey?: string;
  title?: string;
  description?: string;
  /**
   * Board column the task is created in (Tablero "+ Agregar"): a base status
   * (`pendiente`, …) or `custom:<id>`. Applied right after the task is created.
   */
  status?: string;
  /** Responsable preselected (quick-add `@persona`, Mi espacio: me); null = "Sin responsable". Kept only when the etapa allows them. */
  managerId?: string | null;
  /** `YYYY-MM-DD` (quick-add date). */
  deliveryDate?: string | null;
  priority?: TaskPriority;
};

export function draftFromDefaults(defaults: NewTaskDefaults = {}): NewTaskDraft {
  return {
    title: defaults.title ?? "",
    projectId: defaults.projectId ?? "",
    workflowId: null,
    phaseId: null,
    managerId: defaults.managerId ?? null,
    deliveryDate: defaults.deliveryDate ?? "",
    priority: defaults.priority ?? "media",
    description: defaults.description ?? "",
    subtasks: [],
  };
}

type ProjectChoice = Pick<ProjectListItem, "id" | "name" | "currentWorkflowId">;

/** The active etapas in catalog order (the `select` of the etapa catalog query). */
export function activeWorkflowsInOrder(rows: readonly WorkflowDetail[]): WorkflowDetail[] {
  return rows.filter((w) => w.active).sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Responsables suggested for the etapa first (the `select` of `catalog.assignableStaff`). */
export function suggestedFirst<T extends { suggested: boolean }>(list: readonly T[]): T[] {
  return [...list].sort((a, b) => Number(b.suggested) - Number(a.suggested));
}

/** The draft's project while it's in the list, else the first project; "" without projects. */
export function resolveProjectId(projectId: string, projects: readonly ProjectChoice[]): string {
  return projects.some((p) => p.id === projectId) ? projectId : (projects[0]?.id ?? "");
}

/**
 * The etapa to show: the picked one while it's live, else the `defaults`
 * etapa key, else the project's current etapa, else the first etapa.
 */
export function resolveWorkflowId(
  workflowId: string | null,
  workflows: readonly Pick<WorkflowDetail, "id" | "key">[],
  options: { etapaKey?: string; project?: ProjectChoice | null } = {}
): string | null {
  if (workflowId && workflows.some((w) => w.id === workflowId)) return workflowId;
  const byKey = options.etapaKey ? workflows.find((w) => w.key === options.etapaKey) : undefined;
  if (byKey) return byKey.id;
  const current = options.project?.currentWorkflowId;
  if (current && workflows.some((w) => w.id === current)) return current;
  return workflows[0]?.id ?? null;
}

/** The etapa's active fase catalog in catalog order; empty when it has none (the Fase field hides). */
export function etapaFases(workflow: Pick<WorkflowDetail, "phases"> | null | undefined): WorkflowPhaseRef[] {
  if (!workflow) return [];
  return workflow.phases
    .filter((p) => p.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => ({ id: p.id, name: p.name, sortOrder: p.sortOrder }));
}

/**
 * The fase to save: the picked one while it's still in the etapa's catalog,
 * else the first catalog fase (the catalog can change under an open form);
 * null when the etapa has no fases.
 */
export function resolvePhaseId(phaseId: string | null, phases: readonly WorkflowPhaseRef[]): string | null {
  return phaseId && phases.some((p) => p.id === phaseId) ? phaseId : (phases[0]?.id ?? null);
}

/**
 * Titles of the etapa's active task templates in catalog order: those of the
 * selected fase, or every template of the etapa (fase order, then template
 * order) when no fase is selected.
 */
export function etapaTemplateTitles(
  workflow: Pick<WorkflowDetail, "templates" | "phases"> | null | undefined,
  phaseId: string | null
): string[] {
  if (!workflow) return [];
  const faseOrder = new Map(workflow.phases.map((p) => [p.id, p.sortOrder]));
  const faseRank = (id: string | null) => (id === null ? Number.MAX_SAFE_INTEGER : (faseOrder.get(id) ?? Number.MAX_SAFE_INTEGER));
  return workflow.templates
    .filter((t) => t.active && (phaseId === null || t.phaseId === phaseId))
    .sort((a, b) => faseRank(a.phaseId) - faseRank(b.phaseId) || a.sortOrder - b.sortOrder)
    .map((t) => t.title.trim())
    .filter((title) => title.length > 0);
}

/** Appends the template titles that aren't already a subtarea (case-insensitive); drops empty rows. */
export function applyTemplate(subtasks: readonly string[], titles: readonly string[]): string[] {
  const kept = subtasks.filter((s) => s.trim().length > 0);
  const seen = new Set(kept.map((s) => s.trim().toLocaleLowerCase("es-MX")));
  const next = [...kept];
  for (const title of titles) {
    const key = title.trim().toLocaleLowerCase("es-MX");
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(title.trim());
  }
  return next;
}

export type ResolvedDraft = NewTaskDraft & { projectId: string; workflowId: string | null; phaseId: string | null };

export type DraftErrors = { title?: string; form?: string };

/**
 * Client-side checks before calling the action (FE §9 copy): an empty title
 * (`EMPTY`), and no project, no etapa or no fase while the etapa has a
 * catalog (`INVALID`).
 */
export function validateDraft(draft: ResolvedDraft, fases: readonly WorkflowPhaseRef[]): DraftErrors {
  const errors: DraftErrors = {};
  if (!draft.title.trim()) errors.title = actionErrorText("EMPTY");
  if (!draft.projectId || !draft.workflowId || (fases.length > 0 && !draft.phaseId)) {
    errors.form = actionErrorText("INVALID");
  }
  return errors;
}

export function hasErrors(errors: DraftErrors): boolean {
  return Boolean(errors.title || errors.form);
}

/** The `createUserTaskAction` input for a resolved, valid draft. */
export function toUserTaskInput(draft: ResolvedDraft, fases: readonly WorkflowPhaseRef[]): UserTaskInput {
  const notes = draft.description.trim();
  return {
    projectId: draft.projectId,
    title: draft.title.trim(),
    notes: notes ? notes : null,
    workflowId: draft.workflowId,
    phaseId: fases.length > 0 ? draft.phaseId : null,
    managerId: draft.managerId,
    priority: draft.priority,
    deliveryDate: draft.deliveryDate || null,
  };
}

/**
 * The status to set on a just-created task so it lands in the preselected
 * board column; null when there is none or the task already sits there.
 */
export function initialStatusTarget(
  statusKey: string | undefined,
  created: { status?: TaskStatus; customStatus?: { id: string } | null },
): ParsedStatusValue | null {
  if (!statusKey) return null;
  if (created.status && statusSelectValue({ status: created.status, customStatus: created.customStatus }) === statusKey) {
    return null;
  }
  return parseStatusValue(statusKey);
}

/** One `createSubtaskAction` input per non-empty subtarea row, in order. */
export function toSubtaskInputs(draft: Pick<NewTaskDraft, "subtasks" | "managerId" | "priority">): SubtaskInput[] {
  return draft.subtasks
    .map((s) => s.trim())
    .filter((title) => title.length > 0)
    .map((title) => ({ title, managerId: draft.managerId, priority: draft.priority }));
}
