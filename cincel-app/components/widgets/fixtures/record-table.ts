/**
 * `RecordTable` fixtures (redesign FE §4.10.1, §17; frames `Estilos`,
 * `TareasLista`, `TareasListaAnalitico`, `InicioAnalitico`). The same data is
 * rendered in Visual, Esencial and Analítico. Data shapes come only from
 * `lib/types/widgets.ts`.
 */
import type { RecordTableData } from "@/lib/types/widgets";

/** "Tareas por tramo": counts, % vencidas with heat (> 45 warn, > 60 crit), budget only in Analítico. */
export const recordTableFixture: RecordTableData = {
  columns: [
    { key: "tramo", label: "Etapa" },
    { key: "abiertas", label: "Abiertas", format: "count" },
    { key: "vencidas", label: "Vencidas", format: "count" },
    { key: "pctVencidas", label: "% venc.", format: "percent" },
    { key: "diasProm", label: "Días prom.", format: "days", hideOn: ["esencial"] },
    { key: "presupuesto", label: "Presupuesto", format: "mxn", hideOn: ["visual", "esencial"] },
  ],
  rows: [
    { id: "diseno", tramo: "Diseño", abiertas: 10, vencidas: 7, pctVencidas: 70, diasProm: 4, presupuesto: 120000 },
    { id: "construccion", tramo: "Construcción", abiertas: 20, vencidas: 10, pctVencidas: 50, diasProm: 3, presupuesto: 450000 },
    { id: "decoracion", tramo: "Decoración", abiertas: 10, vencidas: 2, pctVencidas: 20, diasProm: 2, presupuesto: 80000 },
    { id: "presale", tramo: "Presale", abiertas: 8, vencidas: 0, pctVencidas: 0, diasProm: 1, presupuesto: 0 },
  ],
  totals: "auto",
  heat: [{ key: "pctVencidas", warnAt: 45, critAt: 60 }],
};

/** Expected "auto" totals of the fixture: sums, averages for % and días. */
export const recordTableFixtureTotals = {
  abiertas: 48,
  vencidas: 19,
  pctVencidas: 35,
  diasProm: 2.5,
  presupuesto: 650000,
} as const;

/** Tareas · Lista grouped by estatus, with a signed deviation column. */
export const recordTableGroupedFixture: RecordTableData = {
  columns: [
    { key: "tarea", label: "Tarea" },
    { key: "estatus", label: "Estatus" },
    { key: "proyecto", label: "Proyecto" },
    { key: "vence", label: "Vence", format: "date" },
    { key: "retraso", label: "Retraso", format: "days" },
    { key: "desviacion", label: "Desv.", format: "delta", mono: true },
  ],
  rows: [
    { id: "t1", tarea: "Planos de cocina", estatus: "En proceso", proyecto: "Casa Lomas", vence: "2026-11-02", retraso: 5, desviacion: -12 },
    { id: "t2", tarea: "Cotizar cancelería", estatus: "Pendiente", proyecto: "Depto Roma", vence: "2026-11-10", retraso: 0, desviacion: 3 },
    { id: "t3", tarea: "Render sala", estatus: "En proceso", proyecto: "Depto Roma", vence: "2026-11-12", retraso: 0, desviacion: 0 },
  ],
  groupBy: "estatus",
};

export const recordTableEmptyFixture: RecordTableData = {
  columns: recordTableFixture.columns,
  rows: [],
  totals: "auto",
};
