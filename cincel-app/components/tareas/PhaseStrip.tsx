import { LoadBar } from "@/components/v2/status/LoadBar";
import { cn } from "@/lib/utils";
import type { WorkflowPhaseRef } from "@/lib/types/core";

interface PhaseStripProps {
  /** The tramo's active fases, in catalog order. */
  phases: WorkflowPhaseRef[];
  /** Open tasks per fase id. */
  openByPhase: Record<string, number>;
}

/** The tramo's fases in catalog order, with each fase's share of open tasks. */
export function PhaseStrip({ phases, openByPhase }: PhaseStripProps) {
  if (phases.length === 0) return null;
  const totalOpen = phases.reduce((sum, p) => sum + (openByPhase[p.id] ?? 0), 0);

  return (
    <div className="mb-4 rounded-lg border border-border bg-card p-4">
      <p className="mb-2 text-[11px]" aria-label="Fases">
        {phases.map((phase, i) => (
          <span key={phase.id}>
            {i > 0 ? <span className="text-muted-foreground"> · </span> : null}
            <span className={cn((openByPhase[phase.id] ?? 0) > 0 ? "text-foreground" : "text-muted-foreground")}>
              {phase.name}
            </span>
          </span>
        ))}
      </p>
      <LoadBar
        segments={phases.map((phase, i) => {
          const open = openByPhase[phase.id] ?? 0;
          return {
            percent: totalOpen === 0 ? 0 : (open / totalOpen) * 100,
            opacity: 0.4 + (0.6 * (i + 1)) / phases.length,
            label: `${phase.name}: ${open} abiertas`,
          };
        })}
      />
    </div>
  );
}
