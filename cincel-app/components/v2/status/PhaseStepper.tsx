import { cn } from "@/lib/utils";

interface PhaseStepperProps {
  /** Total number of phases in the pipeline, in order. */
  steps: number;
  /** 1-indexed position of the current phase. */
  current: number;
  label?: string;
  className?: string;
}

/**
 * A dot-sequence progress indicator for a task's position in a sequential
 * pipeline (e.g. Anteproyecto → Proyecto Arquitectónico → Ejecutivo).
 * Replaces a plain text Badge for phase, which doesn't convey order.
 */
export function PhaseStepper({ steps, current, label, className }: PhaseStepperProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span className="inline-flex items-center gap-[3px]">
        {Array.from({ length: steps }, (_, i) => {
          const index = i + 1;
          const done = index < current;
          const isCurrent = index === current;
          return (
            <span
              key={index}
              className={cn(
                "h-1 w-3.5 rounded-full bg-muted",
                done && "bg-foreground",
                isCurrent && "bg-muted-foreground"
              )}
            />
          );
        })}
      </span>
      {label ? (
        <span className="font-mono text-[10px] text-muted-foreground">{label}</span>
      ) : null}
    </span>
  );
}
