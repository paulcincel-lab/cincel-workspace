import { cn } from "@/lib/utils";

interface CapacityRingProps {
  /** 0-100 */
  percent: number;
  label: string;
  sublabel?: string;
  className?: string;
}

/**
 * Radial workload indicator for a person/department — the "capacity ring"
 * from the Actividades-as-Departamentos redesign. Pure presentation: the
 * caller computes `percent` (e.g. tareas activas / capacidad).
 */
export function CapacityRing({ percent, label, sublabel, className }: CapacityRingProps) {
  const pct = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className={cn("flex w-[76px] flex-col items-center gap-1.5", className)}>
      <div
        className="relative flex size-13 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(var(--foreground) calc(${pct} * 1%), var(--muted) 0)`,
        }}
      >
        <div className="absolute inset-[5px] rounded-full bg-background" />
        <span className="relative text-[11px] font-semibold tabular-nums">{pct}%</span>
      </div>
      <div className="text-center text-[11px] font-medium">{label}</div>
      {sublabel ? (
        <div className="font-mono text-[9.5px] text-muted-foreground">{sublabel}</div>
      ) : null}
    </div>
  );
}
