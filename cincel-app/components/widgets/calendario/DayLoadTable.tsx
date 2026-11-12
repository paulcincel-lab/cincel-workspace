"use client";

import { GroupedTable, type HeatRule } from "@/components/widgets/GroupedTable";
import type { RecordColumn } from "@/lib/types/widgets";
import { HEAT_CRIT_PCT, HEAT_WARN_PCT, labelOf, loadPct, weekdayAndDay } from "@/lib/calendario/alerts";
import { LOAD_LABEL_COPY } from "@/lib/calendario/load";
import type { CalDay } from "@/lib/types/calendario";

const COLUMNS: RecordColumn[] = [
  { key: "fecha", label: "Fecha", width: 160 },
  { key: "horas", label: "Horas", align: "right", mono: true, width: 90 },
  { key: "jornada", label: "Jornada", align: "right", mono: true, width: 90 },
  { key: "pct", label: "%", align: "right", mono: true, format: "percent", width: 80 },
  { key: "estado", label: "Estado", width: 130 },
  { key: "traslapes", label: "Traslapes", align: "right", mono: true, format: "count", width: 90 },
];

/** Strict rules: above 85 warns, above 100 is critical. */
const HEAT: HeatRule[] = [{ key: "pct", warnAt: HEAT_WARN_PCT, critAt: HEAT_CRIT_PCT }];

type LoadRow = { id: string; fecha: string; horas: string; jornada: string; pct: number; estado: string; traslapes: number };

export type DayLoadTableProps = {
  days: readonly CalDay[];
  /** Hours per date while a proposal is open (after values). */
  afterByDate?: Readonly<Record<string, number>>;
};

/** Analítico "Carga del día": one row per day of the viewer's range with heat cells. */
export function DayLoadTable({ days, afterByDate }: DayLoadTableProps) {
  const rows: LoadRow[] = days
    .filter((d) => d.hours !== null && d.workday !== null && d.loadLabel !== null)
    .map((d) => {
      const workday = d.workday ?? 0;
      const hours = afterByDate?.[d.date] ?? d.hours ?? 0;
      return {
        id: d.date,
        fecha: weekdayAndDay(d.date),
        horas: `${Math.round(hours * 10) / 10} h`,
        jornada: `${Math.round(workday * 10) / 10} h`,
        pct: loadPct(hours, workday),
        estado: LOAD_LABEL_COPY[afterByDate?.[d.date] === undefined ? (d.loadLabel ?? "libre") : labelOf(hours, workday)],
        traslapes: d.overlaps,
      };
    });
  return (
    <GroupedTable<LoadRow>
      toggleAll={false}
      label="Carga del día"
      columns={COLUMNS}
      heat={HEAT}
      groups={[{ id: "carga-del-dia", label: "Carga del día", caption: `${rows.length} ${rows.length === 1 ? "día" : "días"}`, metrics: [], rows }]}
      defaultExpanded
      getRowId={(row) => row.id}
    />
  );
}
