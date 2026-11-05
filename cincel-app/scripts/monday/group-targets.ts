/**
 * What each monday group becomes (#687): a phase of the board's workflow, a new project phase, a workflow
 * stage, its own project, or nothing. Shared by `translate` (so plan, preview and apply agree) and the
 * wizard's Equivalencias step (so the default it shows is the one imported). Pure; safe in client code.
 */
import type { BoardStrategy, GroupTarget } from "./mapping.schema";

/** Strategies whose groups can be mapped one by one; group_as_project makes every group a project already. */
export const GROUP_TARGET_STRATEGIES: ReadonlySet<BoardStrategy> = new Set(["board_as_project", "item_as_project"]);

/** The target kinds a strategy offers: `project` only where a group isn't already inside an item's project. */
export function groupTargetKinds(strategy: BoardStrategy): GroupTarget["kind"][] {
  if (strategy === "board_as_project") return ["workflow_phase", "phase", "stage", "project", "ignore"];
  if (strategy === "item_as_project") return ["workflow_phase", "phase", "stage", "ignore"];
  return [];
}

/** The phase names of a workflow's templates, trimmed, without blanks or case-insensitive repeats. */
export function workflowPhaseNames(
  templates: Iterable<{ workflowId: string; phase?: string | null }>,
  workflowId: string | null | undefined,
): string[] {
  if (!workflowId) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of templates) {
    const phase = t.workflowId === workflowId ? t.phase?.trim() : undefined;
    if (!phase || seen.has(phase.toLowerCase())) continue;
    seen.add(phase.toLowerCase());
    out.push(phase);
  }
  return out;
}

/** The board's own choice for the group, else its workflow's phase of the same name, else a new phase. */
export function resolveGroupTarget(
  board: { strategy: BoardStrategy; groupTargets?: Record<string, GroupTarget> },
  group: { id: string; title: string },
  workflowPhases: readonly string[],
): GroupTarget {
  const chosen = board.groupTargets?.[group.id];
  if (chosen && groupTargetKinds(board.strategy).includes(chosen.kind)) return chosen;
  const title = group.title.trim().toLowerCase();
  const match = workflowPhases.find((phase) => phase.trim().toLowerCase() === title);
  return match ? { kind: "workflow_phase", phase: match } : { kind: "phase" };
}

/** The project phase a group's tasks get: null for stages, own projects and ignored groups. */
export function groupPhase(target: GroupTarget, groupTitle: string): string | null {
  if (target.kind === "phase") return groupTitle;
  if (target.kind === "workflow_phase") return target.phase;
  return null;
}

/** Normalized names for "these groups look like clients": lower case, no accents, single spaces. */
export function nameKey(name: string): string {
  return name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Whether a board's groups look like clients or sites rather than phases: at least two groups and most of
 * them named like an existing cliente contact. The wizard then suggests "Grupo como proyecto".
 */
export function groupsLookLikeClients(
  groups: readonly { title: string }[],
  clients: readonly { name: string }[],
): boolean {
  if (groups.length < 2) return false;
  const names = new Set(clients.map((client) => nameKey(client.name)));
  const matches = groups.filter((group) => names.has(nameKey(group.title))).length;
  return matches * 2 > groups.length;
}
