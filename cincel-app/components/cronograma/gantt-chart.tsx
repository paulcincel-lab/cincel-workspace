import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/shadcn/tooltip";
import { ganttBySeccion } from "@/lib/cronograma/metrics";
import { fmtShort, isoDate } from "@/lib/cronograma/week";
import { sectionColor } from "@/lib/cronograma/sections";
import type { ScheduleTask } from "@/lib/types/schedule";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

interface GanttChartProps {
  tasks: ScheduleTask[];
  today: Date;
}

export function GanttChart({ tasks, today }: GanttChartProps) {
  const bars = ganttBySeccion(tasks);
  if (bars.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Cronograma general</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Sin tareas.</p>
        </CardContent>
      </Card>
    );
  }

  const pStart = new Date(`${bars.reduce((m, b) => (b.start < m ? b.start : m), bars[0].start)}T00:00:00`);
  const pEnd = new Date(`${bars.reduce((m, b) => (b.end > m ? b.end : m), bars[0].end)}T00:00:00`);
  const totalMs = pEnd.getTime() - pStart.getTime();
  const pct = (dateIso: string) => ((new Date(`${dateIso}T00:00:00`).getTime() - pStart.getTime()) / totalMs) * 100;

  const monthMarks: Array<{ label: string; left: number }> = [];
  const cursor = new Date(pStart.getFullYear(), pStart.getMonth(), 1);
  if (cursor < pStart) cursor.setMonth(cursor.getMonth() + 1);
  while (cursor <= pEnd) {
    monthMarks.push({ label: MESES[cursor.getMonth()], left: ((cursor.getTime() - pStart.getTime()) / totalMs) * 100 });
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const todayPct = pct(isoDate(today));
  const todayInRange = todayPct >= 0 && todayPct <= 100;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Cronograma general</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[560px]">
            <div className="relative ml-36 h-5">
              {monthMarks.map((m, i) => (
                <span
                  key={i}
                  className="absolute -translate-x-1/2 border-l border-border pl-1 text-[11px] text-muted-foreground"
                  style={{ left: `${m.left}%` }}
                >
                  {m.label}
                </span>
              ))}
            </div>
            <div className="relative space-y-1.5">
              {todayInRange ? (
                <div className="pointer-events-none absolute inset-y-0 left-36 right-0">
                  <div
                    className="absolute top-0 bottom-0 z-10 border-l border-dashed border-foreground"
                    style={{ left: `${todayPct}%` }}
                    title={`Hoy: ${fmtShort(today)}`}
                  />
                </div>
              ) : null}
              {bars.map((b) => (
                <div key={b.seccion} className="flex items-center gap-2">
                  <div className="w-36 shrink-0 truncate text-xs text-muted-foreground" title={b.seccion}>
                    {b.seccion}
                  </div>
                  <div className="relative h-5 flex-1 rounded bg-muted">
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <div
                            className={`absolute top-0 h-full rounded ${sectionColor(b.seccion)}`}
                            style={{ left: `${pct(b.start)}%`, width: `${Math.max(pct(b.end) - pct(b.start), 0.5)}%` }}
                          />
                        }
                      />
                      <TooltipContent>
                        {b.start} – {b.end} · {b.count} tareas
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Cada barra va de la primera a la última tarea programada de la partida. La línea punteada marca{" "}
          <b className="text-foreground">hoy: {fmtShort(today)}</b>.
        </p>
      </CardContent>
    </Card>
  );
}
