/**
 * "Tareas de plantilla" in Equivalencias (FE §4.6 item 3): the etapa and fase each monday item ends up with, the
 * same order translate uses (BE §10.3). 1) The item's template match of its etapa gives the fase. 2) A group
 * mapped to a fase gives it. 3) The cleaned title contains a fase name of the etapa as a whole word (longest
 * wins). 4) Else the item keeps its etapa with no fase: "Sin fase · revisar". A group never creates a fase.
 * Pure and client-safe.
 */
import { currentGroupTarget, hasGroupTargets } from "@/lib/monday-import/group-targets";
import { nameKey, stripMondayNumbering } from "@/lib/project-flow/names";
import type { BoardDraft } from "@/lib/monday-import/wizard-steps";
import type { MondayBoardSource, MondayImportChoices } from "@/lib/types/monday-import";

export interface TemplateItemPlacement {
  /** The item's etapa, null for admin and ignored items and when nothing resolves one. */
  workflowId: string | null;
  etapa: string | null;
  phaseId: string | null;
  phase: string | null;
  /** The group becomes "Tareas de administración": no etapa, no fase. */
  admin: boolean;
  /** The group is not imported. */
  ignored: boolean;
  /** The item has a etapa but no fase: shown as "Sin fase · revisar". */
  review: boolean;
}

type Phase = { id: string; name: string; workflowId: string };

function phasesOf(choices: MondayImportChoices): Phase[] {
  return choices.workflows.flatMap((workflow) =>
    (workflow.phases ?? []).map((phase) => ({ id: phase.id, name: phase.name, workflowId: workflow.id })),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The fase of the etapa whose name the cleaned title contains as a whole word; the longest name wins. */
export function phaseFromTitle(title: string, phases: readonly { id: string; name: string }[]): string | null {
  const key = nameKey(stripMondayNumbering(title));
  let best: { id: string; length: number } | null = null;
  for (const phase of phases) {
    const phaseKey = nameKey(phase.name);
    if (!phaseKey) continue;
    const word = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(phaseKey)}($|[^\\p{L}\\p{N}])`, "u");
    if (word.test(key) && (!best || phaseKey.length > best.length)) best = { id: phase.id, length: phaseKey.length };
  }
  return best?.id ?? null;
}

/** Where one item of the board lands: its etapa and fase, or admin / not imported. */
export function templateItemPlacement(
  board: BoardDraft,
  source: MondayBoardSource,
  item: { id: string; name: string; groupId: string | null },
  choices: MondayImportChoices,
): TemplateItemPlacement {
  const phases = phasesOf(choices);
  const etapaName = (id: string | null) => choices.workflows.find((workflow) => workflow.id === id)?.name ?? null;
  const phaseName = (id: string | null) => phases.find((phase) => phase.id === id)?.name ?? null;
  const empty = { workflowId: null, etapa: null, phaseId: null, phase: null, review: false };

  let workflowId: string | null = board.workflowId ?? null;
  let groupPhaseId: string | null = null;
  const group = source.groups.find((candidate) => candidate.id === item.groupId);
  if (group && hasGroupTargets(board)) {
    const target = currentGroupTarget(board, group, choices);
    if (target.kind === "ignore") return { ...empty, admin: false, ignored: true };
    if (target.kind === "admin") return { ...empty, admin: true, ignored: false };
    if (target.kind === "etapa" && target.workflowId) workflowId = target.workflowId;
    if (target.kind === "phase") {
      const phase = phases.find((candidate) => candidate.id === target.phaseId);
      if (phase) {
        workflowId = phase.workflowId;
        groupPhaseId = phase.id;
      }
    }
  }
  if (!workflowId) return { ...empty, admin: false, ignored: false };

  const matchId = board.templateMatches?.[item.id];
  const template = matchId
    ? choices.templates.find((candidate) => candidate.id === matchId && candidate.workflowId === workflowId)
    : undefined;
  const phaseId =
    template?.phaseId ??
    groupPhaseId ??
    phaseFromTitle(
      item.name,
      phases.filter((phase) => phase.workflowId === workflowId),
    );
  return {
    workflowId,
    etapa: etapaName(workflowId),
    phaseId,
    phase: phaseName(phaseId),
    admin: false,
    ignored: false,
    review: !phaseId,
  };
}

/** The "Etapa · Fase" text of a placement. */
export function placementLabel(placement: TemplateItemPlacement): string {
  if (placement.ignored) return "No se importa";
  if (placement.admin) return "Tareas de administración";
  if (!placement.etapa) return "Sin etapa";
  return placement.phase ? `${placement.etapa} · ${placement.phase}` : placement.etapa;
}
