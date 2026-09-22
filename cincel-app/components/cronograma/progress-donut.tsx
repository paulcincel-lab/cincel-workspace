import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import type { ProgressMetrics } from "@/lib/types/schedule";

const R_OUTER = 68;
const R_MID = 54;
const R_INNER = 40;
const STROKE = 11;

function ring(radius: number, pct: number) {
  const c = 2 * Math.PI * radius;
  return { circumference: c, dash: `${((pct / 100) * c).toFixed(1)} ${c.toFixed(1)}` };
}

interface ProgressDonutProps {
  metrics: ProgressMetrics;
}

export function ProgressDonut({ metrics }: ProgressDonutProps) {
  const outer = ring(R_OUTER, metrics.plannedPct);
  const mid = ring(R_MID, metrics.pagosAvancePct);
  const inner = ring(R_INNER, metrics.realPct);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avance del proyecto</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          <svg
            viewBox="0 0 180 180"
            width={200}
            height={200}
            className="shrink-0"
            role="img"
            aria-label={`Avance del proyecto: planeado ${metrics.plannedPct}%, programado ${metrics.pagosAvancePct}%, real ${metrics.realPct}%`}
          >
            <g transform="translate(90,90) rotate(-90)">
              <circle r={R_OUTER} fill="none" className="stroke-muted" strokeWidth={STROKE} />
              <circle
                r={R_OUTER}
                fill="none"
                className="stroke-yellow-400"
                strokeWidth={STROKE}
                strokeDasharray={outer.dash}
                strokeLinecap="round"
              />
              <circle r={R_MID} fill="none" className="stroke-muted" strokeWidth={STROKE} />
              <circle
                r={R_MID}
                fill="none"
                className="stroke-orange-500"
                strokeWidth={STROKE}
                strokeDasharray={mid.dash}
                strokeLinecap="round"
              />
              <circle r={R_INNER} fill="none" className="stroke-muted" strokeWidth={STROKE} />
              <circle
                r={R_INNER}
                fill="none"
                className="stroke-cyan-500"
                strokeWidth={STROKE}
                strokeDasharray={inner.dash}
                strokeLinecap="round"
              />
            </g>
            <text x={90} y={84} textAnchor="middle" fontSize={22} fontWeight={800} className="fill-foreground">
              {metrics.realPct}%
            </text>
            <text x={90} y={102} textAnchor="middle" fontSize={10.5} className="fill-muted-foreground">
              real
            </text>
          </svg>

          <div className="flex-1 space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-yellow-400" />
              <span>
                Avance planeado en obra — {metrics.plannedPct}% ({metrics.plannedCount}/{metrics.total}, a la semana
                en curso)
              </span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500" />
              <span>Avance programado — {metrics.pagosAvancePct}% (de acuerdo a calendario de pagos)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-cyan-500" />
              <span>
                Avance real — {metrics.realPct}% ({metrics.doneCount} realizadas + {metrics.progressCount} en
                proceso, de {metrics.total})
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-border p-3 text-center">
            <div className="text-lg font-bold text-foreground">{metrics.doneCount}</div>
            <div className="text-xs text-muted-foreground">Tareas realizadas</div>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <div className="text-lg font-bold text-foreground">{metrics.progressCount}</div>
            <div className="text-xs text-muted-foreground">En proceso (50%)</div>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <div className="text-lg font-bold text-foreground">{metrics.pagosPagadoPct}%</div>
            <div className="text-xs text-muted-foreground">Pagado · según calendario de pagos</div>
          </div>
          <div className="rounded-lg border border-border p-3 text-center">
            <div className="text-lg font-bold text-foreground">{metrics.projectWeeks.toFixed(1)}</div>
            <div className="text-xs text-muted-foreground">Semanas totales de obra</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
