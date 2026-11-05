/**
 * The groups table of Equivalencias (#687): what each monday group becomes (a phase of the board's workflow,
 * a new phase, a workflow stage, its own project or nothing) as select values and immutable mapping edits.
 * The default shown is `resolveGroupTarget`, the one translate imports. Pure and client-safe.
 */
import {
  GROUP_TARGET_STRATEGIES,
  groupTargetKinds,
  groupsLookLikeClients,
  nameKey,
  resolveGroupTarget,
  workflowPhaseNames,
} from "@/scripts/monday/group-targets";
import type { ClientRef, GroupTarget } from "@/scripts/monday/mapping.schema";
import type { MondayBoardSource, MondayImportChoices } from "@/lib/types/monday-import";
import type { BoardDraft } from "@/lib/monday-import/wizard-steps";

export type GroupChoice = { value: string; label: string };

export function hasGroupTargets(board: BoardDraft): boolean {
  return GROUP_TARGET_STRATEGIES.has(board.strategy);
}

/** The board workflow's phase names, from the active templates. */
export function boardPhases(board: BoardDraft, choices: MondayImportChoices): string[] {
  return workflowPhaseNames(choices.templates, board.workflowId);
}

export function encodeGroupTarget(target: GroupTarget): string {
  switch (target.kind) {
    case "workflow_phase":
      return `workflow_phase:${target.phase}`;
    case "stage":
      return `stage:${target.workflowId}`;
    default:
      return target.kind;
  }
}

export function decodeGroupTarget(value: string): GroupTarget | null {
  if (value.startsWith("workflow_phase:")) {
    const phase = value.slice("workflow_phase:".length);
    return phase.trim() ? { kind: "workflow_phase", phase } : null;
  }
  if (value.startsWith("stage:")) return { kind: "stage", workflowId: value.slice("stage:".length) };
  if (value === "phase" || value === "project" || value === "ignore") return { kind: value };
  return null;
}

/** What the group becomes now: the board's choice, else the default translate takes. */
export function currentGroupTarget(
  board: BoardDraft,
  group: { id: string; title: string },
  choices: MondayImportChoices,
): GroupTarget {
  return resolveGroupTarget(board, group, boardPhases(board, choices));
}

/** The options of one group's select, in the order of the issue: workflow phases and stages first. */
export function groupTargetChoices(
  board: BoardDraft,
  group: { title: string },
  choices: MondayImportChoices,
): GroupChoice[] {
  const kinds = groupTargetKinds(board.strategy);
  const workflowName = choices.workflows.find((workflow) => workflow.id === board.workflowId)?.name;
  const out: GroupChoice[] = [];
  if (kinds.includes("workflow_phase")) {
    for (const phase of boardPhases(board, choices)) {
      out.push({ value: `workflow_phase:${phase}`, label: `Fase «${phase}» de ${workflowName ?? "el workflow"}` });
    }
  }
  if (kinds.includes("stage")) {
    for (const workflow of choices.workflows) {
      if (workflow.id === board.workflowId) continue;
      out.push({ value: `stage:${workflow.id}`, label: `Etapa «${workflow.name}»` });
    }
  }
  if (kinds.includes("phase")) out.push({ value: "phase", label: `Fase nueva «${group.title}» del proyecto` });
  if (kinds.includes("project")) out.push({ value: "project", label: `Proyecto propio «${group.title}»` });
  if (kinds.includes("ignore")) out.push({ value: "ignore", label: "No importar" });
  return out;
}

/** Sets one group's target; a group that stops being its own project drops its client, name and code. */
export function setGroupTarget(board: BoardDraft, groupId: string, target: GroupTarget): BoardDraft {
  const next: BoardDraft = { ...board, groupTargets: { ...(board.groupTargets ?? {}), [groupId]: target } };
  if (target.kind !== "project") {
    if (board.groupClients?.[groupId]) {
      const groupClients = { ...board.groupClients };
      delete groupClients[groupId];
      next.groupClients = groupClients;
    }
    for (const key of ["projectNames", "projectCodes"] as const) {
      if (board[key]?.[groupId] === undefined) continue;
      const record = { ...board[key] };
      delete record[groupId];
      next[key] = record;
    }
  }
  return next;
}

/** Workflow phases chosen for groups that the new workflow doesn't have go back to the default. */
export function pruneGroupTargets(board: BoardDraft, choices: MondayImportChoices): BoardDraft {
  const phases = new Set(boardPhases(board, choices).map((phase) => phase.toLowerCase()));
  const entries = Object.entries(board.groupTargets ?? {});
  const kept = entries.filter(
    ([, target]) => target.kind !== "workflow_phase" || phases.has(target.phase.trim().toLowerCase()),
  );
  return kept.length === entries.length ? board : { ...board, groupTargets: Object.fromEntries(kept) };
}

/** Whether to suggest "Grupo como proyecto" for the whole board: its groups are named like clients. */
export function suggestsGroupAsProject(
  board: BoardDraft,
  source: MondayBoardSource,
  choices: MondayImportChoices,
): boolean {
  return hasGroupTargets(board) && groupsLookLikeClients(source.groups, choices.clients);
}

/** "Grupo como proyecto" for the whole board; each group named like a client gets that client. */
export function applyGroupAsProject(
  board: BoardDraft,
  source: MondayBoardSource,
  choices: MondayImportChoices,
): BoardDraft {
  const byName = new Map(choices.clients.map((client) => [nameKey(client.name), client.id]));
  const groupClients: Record<string, ClientRef> = { ...(board.groupClients ?? {}) };
  for (const group of source.groups) {
    const contactId = byName.get(nameKey(group.title));
    if (contactId && !groupClients[group.id]) groupClients[group.id] = { kind: "contact", contactId };
  }
  return { ...board, strategy: "group_as_project", groupClients, groupTargets: {} };
}

/** Groups mapped to their own project on a board_as_project board: they get a name, code and client. */
export function ownProjectGroups(board: BoardDraft, source: MondayBoardSource): MondayBoardSource["groups"] {
  if (board.strategy !== "board_as_project") return [];
  return source.groups.filter((group) => board.groupTargets?.[group.id]?.kind === "project");
}
