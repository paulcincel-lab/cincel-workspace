"use client";

import { DistributionWidget } from "@/components/widgets/DistributionWidget";
import { RecordTable } from "@/components/widgets/RecordTable";
import { StyleView } from "@/components/widgets/StyleView";
import type { DistributionSegment, RecordTableData } from "@/lib/types/widgets";

/**
 * Analítico extras of the Calendario view (redesign FE §3.4, §15.3):
 * - month: tramo summary (`DistributionWidget`) + the month's deliveries table;
 * - week: daily summary (shaded, Δ vs last week).
 * Visual and Esencial show only the `AgendaWidget`, so they render nothing here.
 */
export type CalendarSummaryWidgetProps =
  | { mode: "month"; tramos: DistributionSegment[]; deliveries: RecordTableData }
  | { mode: "week"; daily: RecordTableData };

export function CalendarSummaryWidget(props: CalendarSummaryWidgetProps) {
  return <StyleView visual={() => null} esencial={() => null} analitico={() => <Analitico {...props} />} />;
}

function Analitico(props: CalendarSummaryWidgetProps) {
  if (props.mode === "week") {
    return (
      <section aria-labelledby="calendario-resumen-diario" className="overflow-hidden rounded-[10px] border border-border">
        <h3 id="calendario-resumen-diario" className="border-b border-border bg-muted px-3 py-2 text-[11.5px] font-medium text-muted-foreground">
          Resumen diario
        </h3>
        <RecordTable data={props.daily} density="compacta" />
      </section>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <DistributionWidget title="Por tramo" segments={props.tramos} totalLabel="eventos" secondaryLabel="Entregas" />
      <section aria-labelledby="calendario-entregas-mes" className="overflow-hidden rounded-[10px] border border-border">
        <h3 id="calendario-entregas-mes" className="border-b border-border bg-muted px-3 py-2 text-[11.5px] font-medium text-muted-foreground">
          Entregas del mes
        </h3>
        <RecordTable
          data={props.deliveries}
          density="compacta"
          emptyState={{ title: "Sin entregas este mes" }}
        />
      </section>
    </div>
  );
}
