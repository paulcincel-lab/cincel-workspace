/**
 * Candidate fases in Equipo (project flow FE §3.10): the fases a person's
 * puestos suggest. Suggestions only; nothing here restricts assignment.
 */
import type { Position } from "@/lib/types/core";

export type CandidatePhase = { id: string; name: string; workflowName: string };

/** The union of the selected puestos' fases, deduplicated, in catalog order. */
export function candidatePhasesFor(positions: Position[], positionIds: string[]): CandidatePhase[] {
  const selected = new Set(positionIds);
  const seen = new Set<string>();
  const result: CandidatePhase[] = [];
  for (const position of positions) {
    if (!selected.has(position.id)) continue;
    for (const phase of position.phases) {
      if (seen.has(phase.id)) continue;
      seen.add(phase.id);
      result.push({ id: phase.id, name: phase.name, workflowName: phase.workflowName });
    }
  }
  return result;
}

/** "{etapa} · {fase}". */
export function candidatePhaseLabel(phase: CandidatePhase): string {
  return `${phase.workflowName} · ${phase.name}`;
}

/** Full list as "Diseño · Ejecutivo, Construcción · Obra". */
export function formatCandidatePhases(phases: CandidatePhase[]): string {
  return phases.map(candidatePhaseLabel).join(", ");
}

/** Column text: the first `max` fase names, plus "+N" for the rest. */
export function summarizeCandidatePhases(
  phases: CandidatePhase[],
  max = 2
): { text: string; extra: number } {
  const shown = phases.slice(0, max).map((phase) => phase.name);
  return { text: shown.join(", "), extra: Math.max(phases.length - max, 0) };
}
