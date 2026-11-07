/**
 * What each monday group becomes under the project flow: a tramo, a fase of a tramo, a project espacio, its own
 * project, tareas de administración, or nothing. Shared by `translate` (so plan, preview, apply and the remap
 * agree) and the wizard's Equivalencias step (so the default it shows is the one imported). A group never creates
 * a fase: fases come from the catalog. Pure; safe in client code.
 */
import type { BoardStrategy, GroupTarget } from "./mapping.schema";

/** Strategies whose groups can be mapped one by one; group_as_project makes every group a project already. */
export const GROUP_TARGET_STRATEGIES: ReadonlySet<BoardStrategy> = new Set(["board_as_project", "item_as_project"]);

/** The target kinds a strategy offers: `project` only where a group isn't already inside an item's project. */
export function groupTargetKinds(strategy: BoardStrategy): GroupTarget["kind"][] {
  if (strategy === "board_as_project") return ["tramo", "phase", "space", "project", "admin", "ignore"];
  if (strategy === "item_as_project") return ["tramo", "phase", "space", "admin", "ignore"];
  return [];
}

/** A fase of the catalog; `active: false` marks an inactive one (missing means active). */
export interface GroupTargetPhase {
  id: string;
  name: string;
  sortOrder?: number;
  active?: boolean;
}

/** The tramos and their fases, in catalog order (`MondayImportChoices.workflows` has this shape). */
export interface GroupTargetCatalog {
  workflows: readonly { id: string; name: string; phases?: readonly GroupTargetPhase[] }[];
}

/** A board without a tramo whose group resolves no tramo: plan reports it as `TRAMO_MISSING`. */
export type UnresolvedTramoTarget = { kind: "tramo"; workflowId: null };

/** What `resolveGroupTarget` answers: a mapping target, or the unresolved tramo. */
export type ResolvedGroupTarget = GroupTarget | UnresolvedTramoTarget;

/** Where a group's tasks go: the fields translate fills from the group; the rest resolve per task. */
export interface GroupPlacement {
  workflowId?: string;
  phaseId?: string;
  space?: string;
  admin?: true;
  project?: true;
}

/** Normalized names for matching: lower case, no accents, single spaces. */
export function nameKey(name: string): string {
  return name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Builds the catalog from translate's lookups (`workflows` and `phases` by id), fases by `sortOrder`. */
export function groupTargetCatalog(
  workflows: Record<string, { name: string }>,
  phases: Record<string, { workflowId: string; name: string; sortOrder?: number; active?: boolean }>,
): GroupTargetCatalog {
  return {
    workflows: Object.entries(workflows).map(([id, workflow]) => ({
      id,
      name: workflow.name,
      phases: Object.entries(phases)
        .filter(([, phase]) => phase.workflowId === id)
        .map(([phaseId, phase]) => ({ id: phaseId, name: phase.name, sortOrder: phase.sortOrder, active: phase.active }))
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    })),
  };
}

/** A tramo's active fases, in catalog order. */
export function activeCatalogPhases(workflow: GroupTargetCatalog["workflows"][number]): GroupTargetPhase[] {
  return (workflow.phases ?? []).filter((phase) => phase.active !== false);
}

/** The tramo an active fase of the catalog belongs to, or null when the fase is unknown or inactive. */
export function phaseWorkflowId(catalog: GroupTargetCatalog, phaseId: string): string | null {
  for (const workflow of catalog.workflows) {
    if (activeCatalogPhases(workflow).some((phase) => phase.id === phaseId)) return workflow.id;
  }
  return null;
}

/** Whether a saved target still points at something the catalog has (a tramo, an active fase). */
export function isGroupTargetValid(target: GroupTarget, catalog: GroupTargetCatalog): boolean {
  if (target.kind === "tramo") return catalog.workflows.some((workflow) => workflow.id === target.workflowId);
  if (target.kind === "phase") return phaseWorkflowId(catalog, target.phaseId) !== null;
  return true;
}

/**
 * The board's own choice for the group when its strategy offers it and the catalog still has it, else the
 * default (matched by `nameKey`): the title is a tramo's name → that tramo; a fase of the board's tramo → that
 * fase; a fase of exactly one other tramo → that fase; "Administrativo" → tareas de administración; else the
 * board's tramo, or the unresolved tramo when the board has none.
 */
export function resolveGroupTarget(
  board: { strategy: BoardStrategy; workflowId?: string | null; groupTargets?: Record<string, GroupTarget> },
  group: { id: string; title: string },
  catalog: GroupTargetCatalog,
): ResolvedGroupTarget {
  const chosen = board.groupTargets?.[group.id];
  if (chosen && groupTargetKinds(board.strategy).includes(chosen.kind) && isGroupTargetValid(chosen, catalog)) {
    return chosen;
  }
  const title = nameKey(group.title);
  const boardWorkflowId = board.workflowId ?? null;

  const tramo = catalog.workflows.find((workflow) => nameKey(workflow.name) === title);
  if (tramo) return { kind: "tramo", workflowId: tramo.id };

  const own = catalog.workflows.find((workflow) => workflow.id === boardWorkflowId);
  const ownPhase = own ? activeCatalogPhases(own).find((phase) => nameKey(phase.name) === title) : undefined;
  if (ownPhase) return { kind: "phase", phaseId: ownPhase.id };

  const others = catalog.workflows
    .filter((workflow) => workflow.id !== boardWorkflowId)
    .flatMap((workflow) => activeCatalogPhases(workflow).filter((phase) => nameKey(phase.name) === title));
  if (others.length === 1) return { kind: "phase", phaseId: others[0].id };

  if (title === "administrativo") return { kind: "admin" };

  return boardWorkflowId ? { kind: "tramo", workflowId: boardWorkflowId } : { kind: "tramo", workflowId: null };
}

/**
 * Where a group's tasks go: a tramo, a fase (with its tramo when the catalog is given), an espacio named after
 * the group, tareas de administración, or its own project. Ignored groups and the unresolved tramo place nothing.
 */
export function groupPlacement(
  target: ResolvedGroupTarget,
  group: { title: string },
  catalog?: GroupTargetCatalog,
): GroupPlacement {
  switch (target.kind) {
    case "tramo":
      return target.workflowId ? { workflowId: target.workflowId } : {};
    case "phase": {
      const workflowId = catalog ? phaseWorkflowId(catalog, target.phaseId) : null;
      return workflowId ? { workflowId, phaseId: target.phaseId } : { phaseId: target.phaseId };
    }
    case "space":
      return { space: group.title.trim() };
    case "admin":
      return { admin: true };
    case "project":
      return { project: true };
    case "ignore":
      return {};
  }
}

/**
 * Whether a board's groups look like clients or sites rather than fases: at least two groups and most of
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
