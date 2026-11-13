/**
 * What each monday group becomes under the project flow: a etapa, a fase of a etapa, a project espacio, its own
 * project, tareas de administración, or nothing. Shared by `translate` (so plan, preview, apply and the remap
 * agree) and the wizard's Equivalencias step (so the default it shows is the one imported). A group never creates
 * a fase: fases come from the catalog. Pure; safe in client code.
 */
import type { BoardStrategy, GroupTarget } from "./mapping.schema";

/** Strategies whose groups can be mapped one by one; group_as_project makes every group a project already. */
export const GROUP_TARGET_STRATEGIES: ReadonlySet<BoardStrategy> = new Set(["board_as_project", "item_as_project"]);

/** The target kinds a strategy offers: `project` only where a group isn't already inside an item's project. */
export function groupTargetKinds(strategy: BoardStrategy): GroupTarget["kind"][] {
  if (strategy === "board_as_project") return ["etapa", "phase", "space", "project", "admin", "ignore"];
  if (strategy === "item_as_project") return ["etapa", "phase", "space", "admin", "ignore"];
  return [];
}

/** A fase of the catalog; `active: false` marks an inactive one (missing means active). */
export interface GroupTargetPhase {
  id: string;
  name: string;
  sortOrder?: number;
  active?: boolean;
}

/** The etapas and their fases, in catalog order (`MondayImportChoices.workflows` has this shape). */
export interface GroupTargetCatalog {
  workflows: readonly { id: string; name: string; phases?: readonly GroupTargetPhase[] }[];
}

/** A board without a etapa whose group resolves no etapa: plan reports it as `ETAPA_MISSING`. */
export type UnresolvedEtapaTarget = { kind: "etapa"; workflowId: null };

/** What `resolveGroupTarget` answers: a mapping target, or the unresolved etapa. */
export type ResolvedGroupTarget = GroupTarget | UnresolvedEtapaTarget;

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

/** A etapa's active fases, in catalog order. */
export function activeCatalogPhases(workflow: GroupTargetCatalog["workflows"][number]): GroupTargetPhase[] {
  return (workflow.phases ?? []).filter((phase) => phase.active !== false);
}

/** The etapa an active fase of the catalog belongs to, or null when the fase is unknown or inactive. */
export function phaseWorkflowId(catalog: GroupTargetCatalog, phaseId: string): string | null {
  for (const workflow of catalog.workflows) {
    if (activeCatalogPhases(workflow).some((phase) => phase.id === phaseId)) return workflow.id;
  }
  return null;
}

/** Whether a saved target still points at something the catalog has (a etapa, an active fase). */
export function isGroupTargetValid(target: GroupTarget, catalog: GroupTargetCatalog): boolean {
  if (target.kind === "etapa") return catalog.workflows.some((workflow) => workflow.id === target.workflowId);
  if (target.kind === "phase") return phaseWorkflowId(catalog, target.phaseId) !== null;
  return true;
}

/**
 * The board's own choice for the group when its strategy offers it and the catalog still has it, else the
 * default (matched by `nameKey`): the title is a etapa's name → that etapa; a fase of the board's etapa → that
 * fase; a fase of exactly one other etapa → that fase; "Administrativo" → tareas de administración; else the
 * board's etapa, or the unresolved etapa when the board has none.
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

  const etapa = catalog.workflows.find((workflow) => nameKey(workflow.name) === title);
  if (etapa) return { kind: "etapa", workflowId: etapa.id };

  const own = catalog.workflows.find((workflow) => workflow.id === boardWorkflowId);
  const ownPhase = own ? activeCatalogPhases(own).find((phase) => nameKey(phase.name) === title) : undefined;
  if (ownPhase) return { kind: "phase", phaseId: ownPhase.id };

  const others = catalog.workflows
    .filter((workflow) => workflow.id !== boardWorkflowId)
    .flatMap((workflow) => activeCatalogPhases(workflow).filter((phase) => nameKey(phase.name) === title));
  if (others.length === 1) return { kind: "phase", phaseId: others[0].id };

  if (title === "administrativo") return { kind: "admin" };

  return boardWorkflowId ? { kind: "etapa", workflowId: boardWorkflowId } : { kind: "etapa", workflowId: null };
}

/**
 * Where a group's tasks go: a etapa, a fase (with its etapa when the catalog is given), an espacio named after
 * the group, tareas de administración, or its own project. Ignored groups and the unresolved etapa place nothing.
 */
export function groupPlacement(
  target: ResolvedGroupTarget,
  group: { title: string },
  catalog?: GroupTargetCatalog,
): GroupPlacement {
  switch (target.kind) {
    case "etapa":
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
