/**
 * "Área y workflow de las tareas" on Equivalencias (#686): where a board's tasks take their área and workflow
 * from (the board, its groups or one of its columns) and what each monday value maps to. Pure and client-safe;
 * translate (scripts/monday/translate.ts) reads the same `taskAreaSource` / `taskAreas` fields.
 */
import type { BoardDraft } from "@/lib/monday-import/wizard-steps";
import type { MondayBoardSource, MondayImportChoices } from "@/lib/types/monday-import";
import type { TaskAreaSource, TaskAreaTarget } from "@/scripts/monday/mapping.schema";

/** Column types a task's área can come from. */
export const TASK_AREA_COLUMN_TYPES: ReadonlySet<string> = new Set(["dropdown", "status", "text"]);

/** Strategies whose items become tasks. */
const TASK_STRATEGIES = new Set<BoardDraft["strategy"]>(["board_as_project", "group_as_project", "item_as_project"]);

export function hasTaskAreas(board: BoardDraft): boolean {
  return TASK_STRATEGIES.has(board.strategy);
}

/** Lower case, no accents, single spaces (as translate's `areaNameKey`). */
export function nameMatchKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** The columns a board's tasks can take their área from: subitem columns on item_as_project boards. */
export function taskAreaColumns(board: BoardDraft, source: MondayBoardSource): MondayBoardSource["columns"] {
  const columns = board.strategy === "item_as_project" ? source.subitemColumns : source.columns;
  return columns.filter((column) => TASK_AREA_COLUMN_TYPES.has(column.type));
}

/** `board`, `group` or `column:<id>`, for the source select. */
export function encodeTaskAreaSource(source: TaskAreaSource | undefined): string {
  if (!source || source.kind === "board") return "board";
  return source.kind === "group" ? "group" : `column:${source.columnId}`;
}

export function decodeTaskAreaSource(value: string): TaskAreaSource {
  if (value === "group") return { kind: "group" };
  if (value.startsWith("column:")) return { kind: "column", columnId: value.slice("column:".length) };
  return { kind: "board" };
}

/** The monday values of the source, each with the key `taskAreas` stores it under. */
export function taskAreaValues(
  board: BoardDraft,
  source: MondayBoardSource,
): { key: string; label: string }[] {
  const from = board.taskAreaSource;
  if (!from || from.kind === "board") return [];
  if (from.kind === "group") return source.groups.map((group) => ({ key: group.id, label: group.title }));
  return (source.taskAreaValues?.[from.columnId] ?? []).map((value) => ({ key: value, label: value }));
}

/** The workflows offered for an área: its own when it has any (`area_workflows`), else every workflow. */
export function workflowsForArea(
  areaId: string | null,
  choices: MondayImportChoices,
): MondayImportChoices["workflows"] {
  const area = choices.areas.find((candidate) => candidate.id === areaId);
  if (!area || area.workflowIds.length === 0) return choices.workflows;
  return choices.workflows.filter((workflow) => area.workflowIds.includes(workflow.id));
}

/**
 * The pre-filled target of a monday value: the área named like it, with its workflow named like it, else its
 * only workflow; else the one área owning a workflow named like it. null when nothing matches.
 */
export function suggestTaskArea(value: string, choices: MondayImportChoices): TaskAreaTarget | null {
  const key = nameMatchKey(value);
  if (!key) return null;
  const workflowNamed = choices.workflows.find((workflow) => nameMatchKey(workflow.name) === key);
  const area = choices.areas.find((candidate) => nameMatchKey(candidate.name) === key);
  if (area) {
    const offered = workflowsForArea(area.id, choices);
    const workflow =
      (workflowNamed && offered.some((w) => w.id === workflowNamed.id) ? workflowNamed : undefined) ??
      (area.workflowIds.length === 1 ? offered[0] : undefined);
    return { action: "area", areaId: area.id, workflowId: workflow?.id ?? null };
  }
  if (workflowNamed) {
    const owners = choices.areas.filter((candidate) => candidate.workflowIds.includes(workflowNamed.id));
    if (owners.length === 1) return { action: "area", areaId: owners[0].id, workflowId: workflowNamed.id };
  }
  return null;
}

/** Changes the source; the values of the new source are pre-filled by name, the old source's are dropped. */
export function setTaskAreaSource(
  board: BoardDraft,
  next: TaskAreaSource,
  source: MondayBoardSource,
  choices: MondayImportChoices,
): BoardDraft {
  const updated: BoardDraft = { ...board, taskAreaSource: next, taskAreas: {} };
  const taskAreas: Record<string, TaskAreaTarget> = {};
  for (const { key, label } of taskAreaValues(updated, source)) {
    const suggestion = suggestTaskArea(label, choices);
    if (suggestion) taskAreas[key] = suggestion;
  }
  return { ...updated, taskAreas };
}

/** Sets (or clears, with null) the target of one value. */
export function setTaskAreaTarget(board: BoardDraft, key: string, target: TaskAreaTarget | null): BoardDraft {
  const taskAreas = { ...(board.taskAreas ?? {}) };
  if (target) taskAreas[key] = target;
  else delete taskAreas[key];
  return { ...board, taskAreas };
}

export const UNMAPPED = "__unmapped__";
export const CREATE_AREA = "__create__";
export const IGNORE = "__ignore__";

/** The área select's value: an área id, CREATE_AREA, IGNORE or UNMAPPED. */
export function encodeTaskAreaChoice(target: TaskAreaTarget | undefined): string {
  if (!target) return UNMAPPED;
  if (target.action === "ignore") return IGNORE;
  if (target.action === "create_area") return CREATE_AREA;
  return target.areaId;
}

/**
 * The target after picking `choice` in the área select. An área keeps the current workflow when it is one of
 * the área's, else takes its only workflow; "Crear área" is named after the monday value.
 */
export function decodeTaskAreaChoice(
  choice: string,
  label: string,
  current: TaskAreaTarget | undefined,
  choices: MondayImportChoices,
): TaskAreaTarget | null {
  if (choice === UNMAPPED) return null;
  if (choice === IGNORE) return { action: "ignore" };
  const workflowId = current && current.action !== "ignore" ? current.workflowId : null;
  if (choice === CREATE_AREA) return { action: "create_area", name: label.trim() || label, workflowId };
  const offered = workflowsForArea(choice, choices);
  const area = choices.areas.find((candidate) => candidate.id === choice);
  const kept = workflowId && offered.some((w) => w.id === workflowId) ? workflowId : null;
  const only = area && area.workflowIds.length === 1 ? (offered[0]?.id ?? null) : null;
  return { action: "area", areaId: choice, workflowId: kept ?? only };
}

/** Values of the current source with no target yet: their tasks keep the board's workflow. */
export function unmappedTaskAreaValues(board: BoardDraft, source: MondayBoardSource): string[] {
  return taskAreaValues(board, source)
    .filter(({ key }) => !board.taskAreas?.[key])
    .map(({ label }) => label);
}
