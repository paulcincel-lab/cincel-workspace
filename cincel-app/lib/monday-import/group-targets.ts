/**
 * The groups table of Equivalencias and of Reacomodar importación: what each monday group becomes (a tramo, a
 * fase of a tramo, an espacio, its own project, tareas de administración or nothing) as select values and
 * immutable mapping edits. The default shown is `resolveGroupTarget`, the one translate imports. Pure and
 * client-safe.
 */
import {
  GROUP_TARGET_STRATEGIES,
  activeCatalogPhases,
  groupTargetKinds,
  groupsLookLikeClients,
  isGroupTargetValid,
  nameKey,
  resolveGroupTarget,
  type ResolvedGroupTarget,
} from "@/scripts/monday/group-targets";
import type { GroupTarget } from "@/scripts/monday/mapping.schema";
import type { MondayBoardSource, MondayImportChoices } from "@/lib/types/monday-import";
import type { BoardDraft } from "@/lib/monday-import/wizard-steps";

/** One option of a group's select; `group` is the tramo name the fase options are grouped under. */
export type GroupChoice = { value: string; label: string; group?: string };

export function hasGroupTargets(board: BoardDraft): boolean {
  return GROUP_TARGET_STRATEGIES.has(board.strategy);
}

/** Select value of a target; the unresolved tramo has none (the select shows its placeholder). */
export function encodeGroupTarget(target: ResolvedGroupTarget): string {
  switch (target.kind) {
    case "tramo":
      return target.workflowId ? `tramo:${target.workflowId}` : "";
    case "phase":
      return `phase:${target.phaseId}`;
    default:
      return target.kind;
  }
}

export function decodeGroupTarget(value: string): GroupTarget | null {
  if (value.startsWith("tramo:")) {
    const workflowId = value.slice("tramo:".length).trim();
    return workflowId ? { kind: "tramo", workflowId } : null;
  }
  if (value.startsWith("phase:")) {
    const phaseId = value.slice("phase:".length).trim();
    return phaseId ? { kind: "phase", phaseId } : null;
  }
  if (value === "space" || value === "project" || value === "admin" || value === "ignore") return { kind: value };
  return null;
}

/** What the group becomes now: the board's choice, else the default translate takes. */
export function currentGroupTarget(
  board: BoardDraft,
  group: { id: string; title: string },
  choices: MondayImportChoices,
): ResolvedGroupTarget {
  return resolveGroupTarget(board, group, choices);
}

/**
 * The options of one group's select (FE §4.6 item 1), in this order: every tramo, every active fase grouped by
 * tramo, an espacio, its own project (board_as_project only), tareas de administración, and ignore.
 */
export function groupTargetChoices(
  board: BoardDraft,
  group: { title: string },
  choices: MondayImportChoices,
): GroupChoice[] {
  const kinds = groupTargetKinds(board.strategy);
  const out: GroupChoice[] = [];
  if (kinds.includes("tramo")) {
    for (const workflow of choices.workflows) {
      out.push({ value: `tramo:${workflow.id}`, label: `Etapa «${workflow.name}»` });
    }
  }
  if (kinds.includes("phase")) {
    for (const workflow of choices.workflows) {
      for (const phase of activeCatalogPhases(workflow)) {
        out.push({ value: `phase:${phase.id}`, label: `Fase «${phase.name}» · ${workflow.name}`, group: workflow.name });
      }
    }
  }
  if (kinds.includes("space")) out.push({ value: "space", label: `Espacio «${group.title}»` });
  if (kinds.includes("project")) out.push({ value: "project", label: `Proyecto aparte «${group.title}»` });
  if (kinds.includes("admin")) out.push({ value: "admin", label: "Tareas de administración" });
  if (kinds.includes("ignore")) out.push({ value: "ignore", label: "Ignorar" });
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

/**
 * Saved targets that no longer apply go back to the default: `phase` targets whose fase is inactive or gone,
 * `tramo` targets whose tramo is gone, and, when the export is given, targets of groups no longer in it.
 */
export function pruneGroupTargets(
  board: BoardDraft,
  choices: MondayImportChoices,
  source?: Pick<MondayBoardSource, "groups">,
): BoardDraft {
  const groupIds = source ? new Set(source.groups.map((group) => group.id)) : null;
  const entries = Object.entries(board.groupTargets ?? {});
  const kept = entries.filter(
    ([groupId, target]) => (!groupIds || groupIds.has(groupId)) && isGroupTargetValid(target, choices),
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
  const groupClients: NonNullable<BoardDraft["groupClients"]> = { ...(board.groupClients ?? {}) };
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
