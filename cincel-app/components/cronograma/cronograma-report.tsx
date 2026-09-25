import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/shadcn/card";
import { computeProgress } from "@/lib/cronograma/metrics";
import { fmtShort } from "@/lib/cronograma/week";
import type { CronogramaData } from "@/lib/types/schedule";

import { GanttChart } from "./gantt-chart";
import { ProgressDonut } from "./progress-donut";
import { SCurveChart } from "./s-curve-chart";
import { WeekBoards } from "./week-boards";
import { AlertasPanel } from "./alertas-panel";
import { ResumenCards } from "./resumen-cards";
import { AdicionalesPanel } from "./adicionales-panel";
import { ImprevistosPanel } from "./imprevistos-panel";

interface CronogramaReportProps {
  data: CronogramaData;
  asOf: Date;
}

/**
 * Read-only snapshot of the schedule as of a given date — the server-rendered
 * replacement for the reference dashboard's "Generar reporte" (cloned-HTML
 * snapshot). No Sidebar/Header chrome and no interactive controls, so it
 * prints cleanly and works for client-role viewers.
 */
export function CronogramaReport({ data, asOf }: CronogramaReportProps) {
  const metrics = computeProgress({ tasks: data.tasks, payments: data.payments }, asOf);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 print:p-0">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cronograma de Obra</p>
        <h1 className="text-2xl font-bold text-foreground">{data.project.name}</h1>
        {data.project.address ? <p className="text-sm text-muted-foreground">{data.project.address}</p> : null}
        <p className="text-sm text-muted-foreground">Corte al {fmtShort(asOf)} de {asOf.getFullYear()}</p>
      </div>

      <GanttChart tasks={data.tasks} today={asOf} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ProgressDonut metrics={metrics} />
        <SCurveChart tasks={data.tasks} payments={data.payments} today={asOf} />
      </div>

      <WeekBoards tasks={data.tasks} today={asOf} weekOffset={0} readOnly />
      <AlertasPanel tasks={data.tasks} today={asOf} readOnly />
      <ResumenCards metrics={metrics} />
      <ImprevistosPanel scheduleId={data.schedule.id} imprevistos={data.imprevistos} readOnly />
      <AdicionalesPanel adicionales={data.adicionales} defaultOpen />

      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">Co-creado con</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Cloudketer</CardContent>
      </Card>
    </div>
  );
}
