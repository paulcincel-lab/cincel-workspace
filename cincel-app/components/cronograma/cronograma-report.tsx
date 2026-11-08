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
import { ReportToolbar } from "./report-toolbar";

interface CronogramaReportProps {
  data: CronogramaData;
  asOf: Date;
}

/**
 * Read-only snapshot of the schedule as of a given date (redesign FE §3.5,
 * canvas `ProyectoReporte`): a screen-only toolbar and a printable sheet built
 * from tokens; no style switch and no interactive controls.
 */
export function CronogramaReport({ data, asOf }: CronogramaReportProps) {
  const metrics = computeProgress({ tasks: data.tasks, payments: data.payments }, asOf);

  const sections = (
    <>
      <GanttChart tasks={data.tasks} today={asOf} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 print:grid-cols-2">
        <ProgressDonut metrics={metrics} />
        <SCurveChart tasks={data.tasks} payments={data.payments} today={asOf} />
      </div>

      <WeekBoards tasks={data.tasks} today={asOf} weekOffset={0} readOnly />
      <AlertasPanel tasks={data.tasks} today={asOf} readOnly />
      <ResumenCards metrics={metrics} />
      <ImprevistosPanel scheduleId={data.schedule.id} imprevistos={data.imprevistos} readOnly />
      <AdicionalesPanel adicionales={data.adicionales} defaultOpen />
    </>
  );

  const corte = `Corte al ${fmtShort(asOf)} ${asOf.getFullYear()}`;
  return (
    <div data-print-root className="flex flex-col gap-4 pb-10 print:block print:p-0">
      <ReportToolbar projectId={data.project.id} projectName={data.project.name} />
      <div className="rounded-xl bg-muted px-4 py-8 print:rounded-none print:bg-transparent print:p-0">
        <article
          aria-label="Hoja del reporte"
          className="mx-auto flex w-full max-w-[816px] flex-col gap-7 bg-card px-6 py-10 text-card-foreground shadow-sm sm:px-16 sm:py-14 print:max-w-none print:gap-5 print:p-0 print:shadow-none"
        >
          <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-foreground pb-4">
            <div className="flex min-w-0 flex-col gap-0.5">
              <p className="text-xs text-muted-foreground">Cronograma de obra</p>
              <p className="text-xl font-semibold text-foreground">{data.project.name}</p>
              {data.project.address ? <p className="text-sm text-muted-foreground">{data.project.address}</p> : null}
            </div>
            <div className="flex flex-col gap-0.5 text-right">
              <p className="text-sm font-semibold text-foreground">Reporte de avance de obra</p>
              <p className="font-mono text-xs text-muted-foreground">{corte}</p>
            </div>
          </header>

          {sections}

          <footer className="flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
            <span>Generado en Cincel Workspace</span>
            <span className="font-mono">{corte}</span>
          </footer>
        </article>
      </div>
    </div>
  );
}
