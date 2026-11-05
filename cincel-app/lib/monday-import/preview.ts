/**
 * The Vista previa payload of the monday import wizard (#672) from a `plan`
 * dry run (scripts/monday/plan.ts `buildPlan`): counts per Cincel entity per
 * board, the plan's issues and up to 5 items per board shown as the Cincel
 * row apply creates for them. Boards whose items become tasks also get up to 5
 * rows for the projects the board makes, with their workflow and phases (#678). Issues are in Spanish with the step that fixes
 * them (#679). Pure: no DB, no files.
 */
import { ISSUE_FIX_STEP, issuePersonId, issuePersonName, issueText } from "@/lib/monday-import/preview-issues";
import type { CountKey, Plan } from "@/scripts/monday/plan";
import type { ExportData, PlannedProject, PlannedTask, RowRef, TaskStatus } from "@/scripts/monday/translate";
import type {
  MondayPreview,
  MondayPreviewBoard,
  MondayPreviewCounts,
  MondayPreviewSample,
} from "@/lib/types/monday-import";

export const SAMPLES_PER_BOARD = 5;

const STATUS_LABELS: Record<TaskStatus, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  completado: "Completado",
  bloqueado: "Bloqueado",
};

const PRIORITY_LABELS: Record<string, string> = { alta: "Alta", media: "Media", baja: "Baja" };

/** Names the samples show for ids the translation carries. */
export interface PreviewNames {
  customStatuses: Record<string, { name: string }>;
  staff: Record<string, { name: string }>;
  /** Workflow names for the project rows; a missing name shows as no workflow. */
  workflows?: Record<string, { name: string }>;
  /** Área names for the task rows (#686). */
  areas?: Record<string, { name: string }>;
}

export function toPreviewCounts(c: Record<CountKey, number>): MondayPreviewCounts {
  return {
    proyectos: c.projects,
    tareas: c.tasks,
    subtareas: c.childTasks,
    checklist: c.checklistItems,
    dependencias: c.dependencies,
    contactos: c.contacts,
    comentarios: c.comments,
    archivos: c.files,
    filasCronograma: c.cronogramaRows,
    yaImportados: c.skipped,
  };
}

const plannedId = (ref: RowRef | null | undefined): string | null =>
  ref && ref.kind === "planned" ? ref.externalId : null;

function countBy<T>(rows: readonly T[], key: (row: T) => string | null): Map<string, number> {
  const out = new Map<string, number>();
  for (const row of rows) {
    const k = key(row);
    if (k) out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** Builds the preview; `data` is the export the plan ran on (for the monday item names). */
export function buildPreview(plan: Plan, data: ExportData, names: PreviewNames): MondayPreview {
  const canApply = Boolean(plan.translation) && !plan.issues.some((i) => i.blocking);

  const itemNames = new Map<string, string>();
  for (const b of data.boards) {
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const n = node as { id?: string; name?: string; subitems?: unknown[] | null };
      if (n.id) itemNames.set(n.id, n.name ?? "");
      for (const child of n.subitems ?? []) walk(child);
    };
    for (const item of b.items) walk(item);
  }

  const boardNames = new Map<string, string>(data.boards.map((b) => [b.board.id, b.board.name]));
  const issues = plan.issues.map((i) => ({
    code: i.code,
    blocking: i.blocking,
    boardId: i.boardId ?? null,
    itemId: i.itemId ?? null,
    boardName: (i.boardId && boardNames.get(i.boardId)) || null,
    itemName: (i.itemId && itemNames.get(i.itemId)) || null,
    message: issueText(i.code, i.message),
    fixStep: ISSUE_FIX_STEP[i.code],
    personId: issuePersonId(i.code, i.message),
    personName: issuePersonName(i.code, i.message),
  }));

  const result = plan.translation?.result;
  const strategyOf = new Map(plan.translation?.mapping.boards.map((b) => [b.mondayBoardId, b.strategy]) ?? []);
  const projectNames = new Map(result?.projects.map((p) => [p.externalId, p.name]) ?? []);
  const checklist = countBy(result?.checklistItems ?? [], (c) => plannedId(c.task));
  const children = countBy(result?.tasks ?? [], (t) => plannedId(t.parentTask));
  const comments = countBy(result?.historyEvents ?? [], (h) => plannedId(h.target.ref));
  const files = countBy(result?.files ?? [], (f) => plannedId(f.task) ?? plannedId(f.project));
  const projectTasks = countBy(result?.tasks ?? [], (t) => (t.parentTask ? null : t.project.externalId));

  const empty = {
    project: null,
    status: null,
    customStatus: null,
    priority: null,
    manager: null,
    phase: null,
    workflow: null,
    commitmentDate: null,
    deliveryDate: null,
    kind: null,
    template: false,
    checklistItems: 0,
    tasks: 0,
    childTasks: 0,
    comments: 0,
    files: 0,
    contactType: null,
  } satisfies Omit<MondayPreviewSample["cincel"], "title">;

  const boardAreaOf = new Map(plan.translation?.mapping.boards.map((b) => [b.mondayBoardId, b.areaId ?? null]) ?? []);
  /** The task's área (#686): its own value's, else the board's; a new one by name. */
  const taskArea = (t: PlannedTask): string | null => {
    if (t.area?.status === "mapped") {
      if (t.area.newArea) return `${t.area.newArea} (nueva)`;
      return t.area.areaId ? (names.areas?.[t.area.areaId]?.name ?? null) : null;
    }
    const boardArea = boardAreaOf.get(t.source.boardId);
    return boardArea ? (names.areas?.[boardArea]?.name ?? null) : null;
  };

  const taskSample = (t: PlannedTask): MondayPreviewSample => ({
    mondayItemId: t.externalId,
    mondayName: itemNames.get(t.externalId) ?? t.title,
    groupTitle: t.source.groupTitle,
    entity: "tarea",
    cincel: {
      ...empty,
      title: t.title,
      project: projectNames.get(t.project.externalId) ?? null,
      status: STATUS_LABELS[t.status] ?? t.status,
      customStatus: t.customStatusId ? (names.customStatuses[t.customStatusId]?.name ?? null) : null,
      priority: PRIORITY_LABELS[t.priority] ?? t.priority,
      manager: t.managerId ? (names.staff[t.managerId]?.name ?? null) : null,
      phase: t.phase,
      // The task's área and workflow as apply writes them (#686).
      workflow: t.workflowId ? (names.workflows?.[t.workflowId]?.name ?? null) : null,
      area: taskArea(t),
      areaUnmapped: t.area?.status === "unmapped",
      commitmentDate: t.commitmentDate,
      deliveryDate: t.deliveryDate,
      kind: t.kind,
      template: Boolean(t.templateId),
      checklistItems: checklist.get(t.externalId) ?? 0,
      childTasks: children.get(t.externalId) ?? 0,
      comments: comments.get(t.externalId) ?? 0,
      files: files.get(t.externalId) ?? 0,
    },
  });

  const projectSample = (p: PlannedProject, mondayName: string): MondayPreviewSample => ({
    mondayItemId: p.externalId,
    mondayName,
    groupTitle: p.source.groupTitle,
    entity: "proyecto",
    cincel: {
      ...empty,
      title: p.name,
      status: p.status === "completado" ? "Completado" : "Activo",
      // The project's phases and workflow, as apply writes them (#678).
      phase: p.phases.length > 0 ? p.phases.join(", ") : null,
      // Its stages: the board workflow, then the stages groups were mapped to (#687).
      workflow:
        [...(p.workflowId ? [p.workflowId] : []), ...(p.extraStages ?? [])]
          .map((id) => names.workflows?.[id]?.name)
          .filter((name): name is string => Boolean(name))
          .join(", ") || null,
      tasks: projectTasks.get(p.externalId) ?? 0,
      comments: comments.get(p.externalId) ?? 0,
      files: files.get(p.externalId) ?? 0,
    },
  });

  const boards: MondayPreviewBoard[] = plan.boards.map((b) => {
    const strategy = strategyOf.get(b.boardId) ?? b.strategy;
    let samples: MondayPreviewSample[] = [];
    if (result && strategy === "crm_contacts") {
      samples = result.contacts
        .filter((c) => c.source?.boardId === b.boardId)
        .slice(0, SAMPLES_PER_BOARD)
        .map((c): MondayPreviewSample => ({
          mondayItemId: c.externalId,
          mondayName: itemNames.get(c.externalId) ?? c.name,
          groupTitle: c.source?.groupTitle ?? null,
          entity: "contacto" as const,
          cincel: {
            ...empty,
            title: c.name,
            contactType: c.type,
            comments: comments.get(c.externalId) ?? 0,
          },
        }));
    } else if (result && strategy === "item_as_project") {
      samples = result.projects
        .filter((p) => p.source.boardId === b.boardId)
        .slice(0, SAMPLES_PER_BOARD)
        .map((p) => projectSample(p, itemNames.get(p.externalId) ?? p.name));
    } else if (result) {
      // board_as_project / group_as_project: the projects first, named after the board or group.
      const projects = result.projects
        .filter((p) => p.source.boardId === b.boardId)
        .slice(0, SAMPLES_PER_BOARD)
        .map((p) => ({ ...projectSample(p, p.source.groupTitle ?? b.name), groupTitle: null }));
      const tasks = result.tasks
        .filter((t) => !t.parentTask && t.source.boardId === b.boardId)
        .slice(0, SAMPLES_PER_BOARD)
        .map(taskSample);
      samples = [...projects, ...tasks];
    }
    return { boardId: b.boardId, name: b.name, strategy, counts: toPreviewCounts(b), samples };
  });

  return { canApply, totals: toPreviewCounts(plan.totals), boards, issues };
}
