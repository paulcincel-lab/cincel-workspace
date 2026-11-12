import { Badge } from "@/components/ui/shadcn/badge";
import { LOAD_LABEL_COPY } from "@/lib/calendario/load";
import { formatHours, hoursOfWorkday, METER_LABEL, OVERLAP_TAG } from "@/lib/calendario/alerts";
import type { LoadLabel } from "@/lib/types/calendario";
import { cn } from "@/lib/utils";

export type DayLoadMeterProps = {
  hours: number;
  workday: number;
  label: LoadLabel;
  /** Mes cells: the bar and the label chip only, a smaller text. */
  compact?: boolean;
  /** While a proposal is open: the value the day will have; the current hours stay as text. */
  afterHours?: number | null;
  /** Draws the 3px destructive top edge when overloaded (default true). */
  edge?: boolean;
  className?: string;
};

const BAR_TONE: Record<LoadLabel, string> = {
  libre: "bg-primary/40",
  bien: "bg-primary",
  casi_lleno: "bg-warning",
  sobrecargado: "bg-destructive",
};

const CHIP_VARIANT: Record<LoadLabel, "outline" | "secondary" | "warning" | "destructive"> = {
  libre: "outline",
  bien: "secondary",
  casi_lleno: "warning",
  sobrecargado: "destructive",
};

/** Load meter of a day: bar, "{h} h de {w} h" and the label chip; a red top edge when overloaded. */
export function DayLoadMeter({ hours, workday, label, compact = false, afterHours = null, edge = true, className }: DayLoadMeterProps) {
  const shown = afterHours ?? hours;
  const max = Math.max(workday, 0);
  const pct = max > 0 ? Math.min(100, (shown / max) * 100) : shown > 0 ? 100 : 0;
  const overloaded = label === "sobrecargado";
  const text = hoursOfWorkday(shown, workday);
  return (
    <div
      data-slot="day-load-meter"
      data-label={label}
      className={cn("flex min-w-0 flex-col gap-1", edge && overloaded && "border-t-[3px] border-destructive pt-1", className)}
    >
      <div
        role="meter"
        aria-label={METER_LABEL}
        aria-valuemin={0}
        aria-valuemax={workday}
        aria-valuenow={shown}
        aria-valuetext={`${text}, ${LOAD_LABEL_COPY[label]}`}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full rounded-full motion-safe:transition-[width] motion-safe:duration-300", BAR_TONE[label])} style={{ width: `${pct}%` }} />
      </div>
      <div className={cn("flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5", compact && "gap-x-1")}>
        {compact ? null : <span className="font-mono text-xs tabular-nums text-foreground">{text}</span>}
        {afterHours !== null && afterHours !== hours ? (
          <span className="text-xs text-muted-foreground">
            <span className="sr-only">Antes: </span>
            {formatHours(hours)} h
          </span>
        ) : null}
        <Badge variant={CHIP_VARIANT[label]} className={cn(compact && "h-4 px-1.5 text-[10px]")}>
          {LOAD_LABEL_COPY[label]}
        </Badge>
      </div>
    </div>
  );
}

/** Tag drawn on both blocks of two overlapping meetings. */
export function OverlapTag({ className }: { className?: string }) {
  return (
    <Badge variant="destructive" data-slot="overlap-tag" className={cn("h-4 px-1.5 text-[10px]", className)}>
      {OVERLAP_TAG}
    </Badge>
  );
}
