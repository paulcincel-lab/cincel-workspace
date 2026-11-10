/**
 * `GroupedTable`, `KpiStrip` and `FilterCard` fixtures (ADR 0005; frames
 * `Main` and `Analitico-Vencidas`): Tareas in Analítico grouped by project →
 * tramo, with the KPI strip and the filter card above. Data shapes come only
 * from the widget types.
 */
import type { FilterGroup } from "@/components/widgets/FilterCard";
import type { Group, GroupAnchor, HeatRule } from "@/components/widgets/GroupedTable";
import type { KpiStripItem } from "@/components/widgets/KpiStrip";
import { DAYS_LATE_HEAT, OVERDUE_SHARE_HEAT, PLAN_DEVIATION_HEAT } from "@/components/tareas/lista-table";
import type { RecordColumn } from "@/lib/types/widgets";

export type GroupedTaskRow = {
  id: string;
  tarea: string;
  responsable: string;
  estatus: string;
  vence: string;
  diasRetraso: number | null;
  subtareas: string;
  pctVencidas?: number;
};

export const groupedTaskColumns: RecordColumn[] = [
  { key: "tarea", label: "Tarea", width: 240 },
  { key: "responsable", label: "Responsable", width: 140 },
  { key: "estatus", label: "Estatus", width: 120 },
  { key: "vence", label: "Vence", format: "date", width: 90 },
  { key: "diasRetraso", label: "Días de retraso", format: "days", width: 110 },
  { key: "subtareas", label: "Subtareas", align: "right", mono: true, width: 80 },
  { key: "pctVencidas", label: "% vencidas", format: "percent", width: 80 },
];

export const groupedTaskHeat: HeatRule[] = [{ ...OVERDUE_SHARE_HEAT }, { ...DAYS_LATE_HEAT }, { ...PLAN_DEVIATION_HEAT }];

function task(id: string, tarea: string, estatus: string, vence: string, diasRetraso: number | null, extra: Partial<GroupedTaskRow> = {}): GroupedTaskRow {
  return { id, tarea, responsable: "Oscar R.", estatus, vence, diasRetraso, subtareas: "1/3", ...extra };
}

/** `Main`: two projects, each with tramos (second level). */
export const groupedTaskGroups: Group<GroupedTaskRow>[] = [
  {
    id: "casa-lomas",
    label: "Casa Lomas",
    caption: "8 tareas · 2 tramos",
    metrics: [
      { key: "abiertas", label: "abiertas", value: "7" },
      { key: "vencidas", label: "vencidas", value: "4", tone: "destructive" },
      { key: "pct", label: "vencidas", value: "57 %", tone: "warning", pill: true },
    ],
    footer: "auto",
    children: [
      {
        id: "casa-lomas/diseno",
        label: "Diseño",
        color: "var(--chart-2)",
        caption: "3 tareas",
        metrics: [
          { key: "abiertas", label: "abiertas", value: "3" },
          { key: "vencidas", label: "vencidas", value: "2", tone: "destructive" },
          { key: "retraso", value: "15 d" },
          { key: "bloqueadas", label: "bloqueada", value: "1", tone: "destructive" },
        ],
        rows: [
          task("t1", "Planos arquitectónicos", "En proceso", "2026-11-02", 7, { pctVencidas: 50 }),
          task("t2", "Render de fachada", "Bloqueado", "2026-10-28", 12, { pctVencidas: 70 }),
          task("t3", "Paleta de materiales", "Pendiente", "2026-11-20", null, { pctVencidas: 30 }),
        ],
      },
      {
        id: "casa-lomas/construccion",
        label: "Construcción",
        color: "var(--chart-3)",
        caption: "5 tareas",
        metrics: [{ key: "abiertas", label: "abiertas", value: "4" }],
        rows: [
          task("t4", "Cimentación", "En proceso", "2026-11-05", 4),
          task("t5", "Muros planta baja", "Pendiente", "2026-11-12", null),
          task("t6", "Instalación eléctrica", "Pendiente", "2026-11-25", null),
          task("t7", "Losa", "Completado", "2026-10-20", null),
          task("t8", "Herrería", "Pendiente", "2026-12-01", null),
        ],
      },
    ],
  },
  {
    id: "depto-roma",
    label: "Depto Roma",
    caption: "2 tareas · 1 tramo",
    metrics: [{ key: "abiertas", label: "abiertas", value: "2" }],
    footer: "auto",
    children: [
      {
        id: "depto-roma/decoracion",
        label: "Decoración",
        color: "var(--chart-4)",
        caption: "2 tareas",
        metrics: [{ key: "abiertas", label: "abiertas", value: "2" }],
        rows: [task("t9", "Cortinas", "Pendiente", "2026-11-15", null), task("t10", "Iluminación", "En proceso", "2026-11-18", null)],
      },
    ],
  },
  { id: "oficina-sur", label: "Oficina Sur", caption: "Sin tareas vencidas", metrics: [], rows: [], hidden: true },
];

/** `Analitico-Vencidas`: anchors per project with overdue counts. */
export const groupedTaskAnchors: GroupAnchor[] = [
  { groupId: "casa-lomas", label: "Casa Lomas", count: 4, tone: "destructive" },
  { groupId: "depto-roma", label: "Depto Roma", count: 0, tone: "destructive" },
  { groupId: "oficina-sur", label: "Oficina Sur", count: 0 },
];

export const groupedTaskTotals = { label: "Total · 10 tareas en 2 proyectos", summary: "9 abiertas · 4 vencidas · 44 % · 6.3 d" };

export const kpiStripFixture: KpiStripItem[] = [
  { key: "abiertas", label: "Abiertas", value: 24, delta: { label: "+3 vs semana pasada", tone: "bad" } },
  { key: "vencidas", label: "Vencidas", value: 7, tone: "destructive", delta: { label: "−2 vs semana pasada", tone: "good" } },
  { key: "pct", label: "% vencidas", value: "29 %", delta: { label: "sin cambio", tone: "neutral" } },
  { key: "retraso", label: "Retraso promedio", value: "6.3 d" },
  { key: "proyectos", label: "Proyectos", value: 3, secondary: "de 4" },
];

export const filterCardFixture: FilterGroup[] = [
  {
    id: "estado",
    label: "Estado",
    value: "todas",
    options: [
      { value: "todas", label: "Todas", count: 28 },
      { value: "vencidas", label: "Vencidas", count: 7, tone: "destructive" },
      { value: "semana", label: "Esta semana", count: 9 },
    ],
  },
  {
    id: "tramo",
    label: "Tramo",
    value: "todos",
    options: [
      { value: "todos", label: "Todos" },
      { value: "diseno", label: "Diseño", color: "var(--chart-2)" },
      { value: "construccion", label: "Construcción", color: "var(--chart-3)" },
    ],
  },
];
