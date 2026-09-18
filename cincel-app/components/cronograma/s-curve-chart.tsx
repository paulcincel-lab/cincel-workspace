import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { computeSCurve } from "@/lib/cronograma/metrics";
import type { PaymentRow, ScheduleTask } from "@/lib/types/schedule";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const W = 520;
const H = 210;
const PAD_L = 32;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 22;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

interface SCurveChartProps {
  tasks: ScheduleTask[];
  payments: PaymentRow[];
  today: Date;
}

export function SCurveChart({ tasks, payments, today }: SCurveChartProps) {
  const points = computeSCurve({ tasks, payments }, today);

  if (points.length < 2) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Proyectado vs. realizado</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Sin datos suficientes.</p>
        </CardContent>
      </Card>
    );
  }

  const start = new Date(`${points[0].weekStart}T00:00:00`);
  const endDate = new Date(`${points[points.length - 1].weekStart}T00:00:00`);
  const xPos = (i: number) => PAD_L + (points.length > 1 ? (i / (points.length - 1)) * PLOT_W : 0);
  const yPos = (v: number) => PAD_T + PLOT_H - (v / 100) * PLOT_H;
  const xForDate = (d: Date) => {
    const days = Math.round((d.getTime() - start.getTime()) / 86400000);
    const weekIndex = days / 7;
    return PAD_L + (points.length > 1 ? (weekIndex / (points.length - 1)) * PLOT_W : 0);
  };

  const plannedPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xPos(i).toFixed(1)},${yPos(p.planned).toFixed(1)}`).join(" ");
  const pagosPath = points.map((p, i) => `${i === 0 ? "M" : "L"}${xPos(i).toFixed(1)},${yPos(p.pagos).toFixed(1)}`).join(" ");
  let realPath = "";
  let realStarted = false;
  points.forEach((p, i) => {
    if (p.real === null) return;
    realPath += `${realStarted ? "L" : "M"}${xPos(i).toFixed(1)},${yPos(p.real).toFixed(1)} `;
    realStarted = true;
  });

  const todayXVal = xForDate(today);
  const todayX = todayXVal >= PAD_L - 0.5 && todayXVal <= W - PAD_R + 0.5 ? todayXVal : null;

  const gridlines = [0, 25, 50, 75, 100];

  const monthLabels: Array<{ x: number; label: string }> = [];
  const mCursor = new Date(start.getFullYear(), start.getMonth(), 1);
  if (mCursor < start) mCursor.setMonth(mCursor.getMonth() + 1);
  while (mCursor <= endDate) {
    const mx = xForDate(mCursor);
    if (mx >= PAD_L - 1 && mx <= W - PAD_R + 1) monthLabels.push({ x: mx, label: MESES[mCursor.getMonth()] });
    mCursor.setMonth(mCursor.getMonth() + 1);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Proyectado vs. realizado — eje horizontal en semanas</CardTitle>
      </CardHeader>
      <CardContent>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={210} preserveAspectRatio="xMidYMid meet">
          {gridlines.map((v) => (
            <g key={v}>
              <line x1={PAD_L} x2={W - PAD_R} y1={yPos(v)} y2={yPos(v)} className="stroke-border" strokeWidth={1} />
              <text x={PAD_L - 6} y={yPos(v) + 3} fontSize={9} textAnchor="end" className="fill-muted-foreground">
                {v}
              </text>
            </g>
          ))}
          {todayX !== null ? (
            <line
              x1={todayX}
              x2={todayX}
              y1={PAD_T}
              y2={H - PAD_B}
              className="stroke-foreground"
              strokeWidth={1.5}
              strokeDasharray="3 3"
            />
          ) : null}
          <path d={plannedPath} fill="none" className="stroke-yellow-400" strokeWidth={2} strokeDasharray="6 4" />
          <path d={pagosPath} fill="none" className="stroke-orange-500" strokeWidth={2} strokeDasharray="6 4" />
          {realPath ? <path d={realPath} fill="none" className="stroke-cyan-500" strokeWidth={2.5} /> : null}
          {monthLabels.map((m, i) => (
            <g key={i}>
              <line x1={m.x} x2={m.x} y1={H - PAD_B} y2={H - PAD_B + 4} className="stroke-border" strokeWidth={1} />
              <text x={m.x} y={H - 6} fontSize={9} textAnchor="middle" className="fill-muted-foreground">
                {m.label}
              </text>
            </g>
          ))}
        </svg>
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="inline-block w-4 border-t-2 border-dashed border-yellow-400" /> Proyectado (acumulado, %
            de tareas)
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-4 border-t-2 border-dashed border-orange-500" /> Calendario de pagos
            (acumulado, % avance programado)
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-4 bg-cyan-500" /> Realizado (hasta hoy)
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
