/**
 * Pure form logic of `NewTaskDialog` (redesign FE §3.4): defaults, the fase
 * catalog of the selected tramo, "Usar plantilla del tramo", validation and
 * the `createUserTaskAction` / `createSubtaskAction` inputs. Client-safe.
 */
import { actionErrorText } from "@/lib/errors";
import type {
  ProjectListItem,
  SubtaskInput,
  TaskPriority,
  UserTaskInput,
  WorkflowDetail,
  WorkflowPhaseRef,
} from "@/lib/types/core";
import { resolvePhaseId } from "./NewTaskModal";

export const PRIORITY_OPTIONS: readonly { value: TaskPriority; label: string }[] = [
  { value: "alta", label: "Alta" },
  { value: "media", label: "Media" },
  { value: "baja", label: "Baja" },
];

export type NewTaskDraft = {
  title: string;
  /** "" until the projects load or when none is picked. */
  projectId: string;
  /** Null: follow the default tramo (`defaults.tramoKey`, then the project's current tramo). */
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

export type NewTaskDefaults = { projectId?: string; tramoKey?: string; title?: string; description?: string };

export function initialDraft(defaults: NewTaskDefaults = {}): NewTaskDraft {
  return {
    title: defaults.title ?? "",
    projectId: defaults.projectId ?? "",
    workflowId: null,
    phaseId: null,
    managerId: null,
    deliveryDate: "",
    priority: "media",
    description: defaults.description ?? "",
    subtasks: [],
  };
}

type ProjectChoice = Pick<ProjectListItem, "id" | "name" | "currentWorkflowId">;

/** The draft's project while it's in the list, else the first project; "" without projects. */
export function resolveProjectId(projectId: string, projects: readonly ProjectChoice[]): string {
  return projects.some((p) => p.id === projectId) ? projectId : (projects[0]?.id ?? "");
}

/**
 * The tramo to show: the picked one while it's live, else the `defaults`
 * tramo key, else the project's current tramo, else the first tramo.
 */
export function resolveWorkflowId(
  workflowId: string | null,
  workflows: readonly Pick<WorkflowDetail, "id" | "key">[],
  options: { tramoKey?: string; project?: ProjectChoice | null } = {}
): string | null {
  if (workflowId && workflows.some((w) => w.id === workflowId)) return workflowId;
  const byKey = options.tramoKey ? workflows.find((w) => w.key === options.tramoKey) : undefined;
  if (byKey) return byKey.id;
  const current = options.project?.currentWorkflowId;
  if (current && workflows.some((w) => w.id === current)) return current;
  return workflows[0]?.id ?? null;
}

/** The tramo's active fase catalog in catalog order; empty when it has none (the Fase field hides). */
export function tramoFases(workflow: Pick<WorkflowDetail, "phases"> | null | undefined): WorkflowPhaseRef[] {
  if (!workflow) return [];
  return workflow.phases
    .filter((p) => p.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => ({ id: p.id, name: p.name, sortOrder: p.sortOrder }));
}

export { resolvePhaseId };

/**
 * Titles of the tramo's active task templates in catalog order: those of the
 * selected fase, or every template of the tramo (fase order, then template
 * order) when no fase is selected.
 */
export function tramoTemplateTitles(
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
 * (`EMPTY`), and no project, no tramo or no fase while the tramo has a
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

/** One `createSubtaskAction` input per non-empty subtarea row, in order. */
export function toSubtaskInputs(draft: Pick<NewTaskDraft, "subtasks" | "managerId" | "priority">): SubtaskInput[] {
  return draft.subtasks
    .map((s) => s.trim())
    .filter((title) => title.length > 0)
    .map((title) => ({ title, managerId: draft.managerId, priority: draft.priority }));
}
