import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { cn } from "@/lib/utils";
import type { GapStatus, ProgressMetrics } from "@/lib/types/schedule";

function gapLabel(gap: GapStatus): string {
  if (gap.kind === "onTime") return "En tiempo";
  if (gap.kind === "late") return `≈ ${gap.weeks.toFixed(1)} semanas de retraso`;
  return `≈ ${gap.weeks.toFixed(1)} semanas de adelanto`;
}

function gapClass(gap: GapStatus): string {
  if (gap.kind === "onTime") return "text-muted-foreground";
  if (gap.kind === "late") return "text-destructive-ink";
  return "text-[color:var(--chart-4-ink)]";
}

interface FormulaCellProps {
  value: string;
  tag: string;
  className?: string;
}

function FormulaCell({ value, tag, className }: FormulaCellProps) {
  return (
    <div className="text-center">
      <div className={cn("text-2xl font-extrabold", className)}>{value}</div>
      <div className="text-xs text-muted-foreground">{tag}</div>
    </div>
  );
}

interface ResumenCardsProps {
  metrics: ProgressMetrics;
}

export function ResumenCards({ metrics }: ResumenCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Resumen 1 — Avance total de la obra (pasado + presente + futuro)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-center gap-4">
            <FormulaCell value={`${metrics.plannedPct}%`} tag="intención de obra" className="text-[color:var(--chart-3-ink)]" />
            <span className="text-muted-foreground">vs.</span>
            <FormulaCell
              value={`${metrics.pagosAvancePct}%`}
              tag="según calendario de pagos"
              className="text-[color:var(--chart-2-ink)]"
            />
            <span className="text-muted-foreground">vs.</span>
            <FormulaCell value={`${metrics.realPct}%`} tag="se lleva" className="text-[color:var(--chart-1-ink)]" />
          </div>
          <p className={cn("text-sm font-bold", gapClass(metrics.delayVsObra))}>
            {gapLabel(metrics.delayVsObra)} (vs. planeado en obra)
          </p>
          <p className={cn("text-sm font-bold", gapClass(metrics.delayVsPagos))}>
            {gapLabel(metrics.delayVsPagos)} (vs. calendario de pagos)
          </p>
          <p className="text-xs text-muted-foreground">
            &quot;Intención de obra&quot; según las tareas agendadas a la semana en curso. &quot;Según calendario de
            pagos&quot; es el avance de obra esperado de acuerdo al calendario de pagos. &quot;Se lleva&quot; incluye
            realizadas (100%) y en proceso (50%). Semanas de retraso/adelanto = brecha % × {metrics.projectWeeks.toFixed(1)}{" "}
            semanas totales de obra.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground">Resumen 2 — Avance desglosado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-center gap-4">
            <FormulaCell value={`${metrics.onTimePct}%`} tag="en tiempo" />
            <span className="text-muted-foreground">+</span>
            <FormulaCell value={`${metrics.aheadPct}%`} tag="adelantos" className="text-[color:var(--chart-4-ink)]" />
            <span className="text-muted-foreground">=</span>
            <FormulaCell value={`${metrics.realPct}%`} tag="total" className="text-[color:var(--chart-1-ink)]" />
          </div>
          <p className="text-xs text-muted-foreground">
            &quot;En tiempo&quot;: avance en tareas ya agendadas para esta semana o antes. &quot;Adelantos&quot;: avance
            en tareas de semanas futuras.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
