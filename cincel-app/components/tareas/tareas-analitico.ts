/**
 * Tareas · Analítico view model (frames `Main`, `Analitico-Vencidas`): the
 * KPI strip, the project → tramo groups of `GroupedTable`, their captions,
 * metrics and footers, the page totals and the hidden-projects note. Every
 * count comes from the summary (`qk.tareas.summary(f)`), never from the
 * loaded rows, so they hold past the first page. Pure and client-safe.
 */
import type { GroupMetric, HeatRule } from "@/components/widgets/GroupedTable";
import type { KpiStripItem } from "@/components/widgets/KpiStrip";
import { formatDueDate } from "@/lib/proyectos/project-tasks-by-fase";
import type { TareasMostrar } from "@/lib/tareas/query";
import { CLEAR_LABEL } from "@/components/widgets/editable-cell";
import {
  SIN_TRAMO_LABEL,
  hiddenSummaryProjects,
  pctVencidas,
  retrasoPromedio,
  summaryTramoKey,
  type TareasSummary,
  type TareasSummaryCounts,
  type TareasSummaryProject,
  type TareasSummaryTramo,
} from "@/lib/tareas/summary";
import { isTaskClosed, statusColorToken, taskStatusLabel, type StatusColorToken } from "@/lib/tasks/status-options";
import type { TaskListRow } from "@/lib/types/core";
import type { RecordColumn } from "@/lib/types/widgets";

import { OVERDUE_SHARE_HEAT } from "./lista-table";
import { TASK_SUPPORT_COLUMN } from "./task-cell-edits";
import { SUPPORT_COLUMN_LABEL } from "./task-table-copy";
import { PRIORITY_LABEL, daysLate, taskDueDate } from "./tablero-table";

export const ANALITICO_DESCRIPTION = "Por proyecto y tramo, ordenada por retraso.";
export const ANALITICO_EMPTY_TITLE = "No hay tareas con estos filtros";
export const ANALITICO_EMPTY_LATE_TITLE = "No hay tareas en retraso";
export const ANALITICO_ANCHORS_CAPTION = "tareas vencidas por proyecto";
export const ANALITICO_TABLE_LABEL = "Tareas por proyecto y tramo";

export const ANALITICO_COLUMNS: RecordColumn[] = [
  { key: "tarea", label: "Tarea" },
  { key: "tramo", label: "Tramo" },
  { key: "fase", label: "Fase" },
  { key: "responsable", label: "Responsable" },
  { key: TASK_SUPPORT_COLUMN, label: SUPPORT_COLUMN_LABEL },
  { key: "estatus", label: "Estatus" },
  { key: "vence", label: "Vence", mono: true },
  { key: "prioridad", label: "Prioridad" },
  { key: "subtareas", label: "Subtareas", align: "right", mono: true },
  { key: "diasRetraso", label: "Días de retraso", align: "right", mono: true },
];

/**
 * "Días de retraso" heat (decision default: warn ≥ 5, critical ≥ 10). The
 * shared rule compares with `>`, so the thresholds sit one below.
 */
export const ANALITICO_DAYS_LATE_HEAT: HeatRule = { key: "diasRetraso", warnAt: 4, critAt: 9 };

const NUMBER = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 1 });

const plural = (n: number, one: string, many: string) => `${NUMBER.format(n)} ${n === 1 ? one : many}`;
export const tareasText = (n: number) => plural(n, "tarea", "tareas");
export const tramosText = (n: number) => plural(n, "tramo", "tramos");
export const proyectosText = (n: number) => plural(n, "proyecto", "proyectos");
export const vencidasText = (n: number) => plural(n, "vencida", "vencidas");
export const abiertasText = (n: number) => plural(n, "abierta", "abiertas");
export const bloqueadasText = (n: number) => plural(n, "bloqueada", "bloqueadas");

/** "6.3 d", or "—" without overdue tasks. */
export function retrasoText(c: TareasSummaryCounts): string {
  const avg = retrasoPromedio(c);
  return avg === null ? "—" : `${NUMBER.format(avg)} d`;
}

/** "29 %". */
export function pctText(c: TareasSummaryCounts): string {
  return `${NUMBER.format(pctVencidas(c))} %`;
}

/** Tone of the "% vencidas" chip (`OVERDUE_SHARE_HEAT`): ≥ 60 destructive, ≥ 45 warning, 0 success, else muted. */
export function overdueShareTone(pct: number): NonNullable<GroupMetric["tone"]> {
  if (pct >= OVERDUE_SHARE_HEAT.critAt) return "destructive";
  if (pct >= OVERDUE_SHARE_HEAT.warnAt) return "warning";
  if (pct === 0) return "success";
  return "muted";
}

/** The five KPIs: Todas and Abiertas share one set, En retraso has its own. */
export function analiticoKpis(summary: TareasSummary, mostrar: TareasMostrar): KpiStripItem[] {
  const t = summary.totals;
  if (mostrar === "en_retraso") {
    return [
      { key: "proyectos", label: "Proyectos", value: t.projects, secondary: `de ${NUMBER.format(summary.unfiltered.projects)}` },
      { key: "mostradas", label: "Tareas mostradas", value: t.total, secondary: `de ${NUMBER.format(summary.unfiltered.total)}` },
      { key: "vencidas", label: "Vencidas", value: t.overdue, tone: "destructive" },
      { key: "bloqueadas", label: "Bloqueadas", value: t.blocked },
      { key: "retraso", label: "Retraso promedio", value: retrasoText(t) },
    ];
  }
  return [
    { key: "proyectos", label: "Proyectos", value: t.projects },
    { key: "abiertas", label: "Abiertas", value: t.open },
    { key: "vencidas", label: "Vencidas", value: t.overdue, tone: "destructive" },
    { key: "pct", label: "% vencidas", value: pctText(t) },
    { key: "retraso", label: "Retraso promedio", value: retrasoText(t) },
  ];
}

/** Group id of a project section. */
export const projectGroupId = (projectId: string) => `p:${projectId}`;

/** Group id of a tramo group inside a project. */
export const tramoGroupId = (projectId: string, tramoId: string | null) => `t:${projectId}:${tramoId ?? "none"}`;

function unfilteredOf(summary: TareasSummary, projectId: string) {
  return summary.unfiltered.projectList?.find((p) => p.id === projectId) ?? null;
}

/** "8 tareas · 4 tramos"; En retraso "4 de 8 tareas · 3 tramos". */
export function projectCaption(summary: TareasSummary, p: TareasSummaryProject, mostrar: TareasMostrar): string {
  const tramos = tramosText(p.tramos.length);
  if (mostrar !== "en_retraso") return `${tareasText(p.total)} · ${tramos}`;
  const all = unfilteredOf(summary, p.project.id)?.total ?? p.total;
  return `${NUMBER.format(p.total)} de ${tareasText(all)} · ${tramos}`;
}

/** Header metrics: Abiertas, Vencidas, the "% vencidas" chip and Retraso prom. */
export function projectMetrics(p: TareasSummaryProject): GroupMetric[] {
  const pct = pctVencidas(p);
  return [
    { key: "abiertas", value: NUMBER.format(p.open), label: p.open === 1 ? "abierta" : "abiertas" },
    {
      key: "vencidas",
      value: NUMBER.format(p.overdue),
      label: p.overdue === 1 ? "vencida" : "vencidas",
      tone: p.overdue > 0 ? "destructive" : "default",
    },
    { key: "pct", value: `${NUMBER.format(pct)} %`, label: "vencidas", pill: true, tone: overdueShareTone(pct) },
    { key: "retraso", value: retrasoText(p), label: "retraso prom." },
  ];
}

/** "2 tareas"; En retraso "1 de 2 tareas". */
export function tramoCaption(
  summary: TareasSummary,
  projectId: string,
  t: TareasSummaryTramo,
  mostrar: TareasMostrar,
): string {
  if (mostrar !== "en_retraso") return tareasText(t.total);
  const all = unfilteredOf(summary, projectId)?.byTramo[summaryTramoKey(t.tramo.id)] ?? t.total;
  return `${NUMBER.format(t.total)} de ${tareasText(all)}`;
}

/** "1 abierta · 1 vencida · 9 d · 1 bloqueada"; En retraso "1 vencida · 9 d · bloqueada". */
export function tramoMetrics(t: TareasSummaryTramo, mostrar: TareasMostrar): GroupMetric[] {
  const out: GroupMetric[] = [];
  if (mostrar !== "en_retraso") out.push({ key: "abiertas", value: abiertasText(t.open) });
  out.push({ key: "vencidas", value: vencidasText(t.overdue), tone: t.overdue > 0 ? "destructive" : "default" });
  if (t.overdue > 0) out.push({ key: "retraso", value: retrasoText(t) });
  if (t.blocked > 0) {
    const text = mostrar === "en_retraso" && t.blocked === 1 ? "bloqueada" : bloqueadasText(t.blocked);
    out.push({ key: "bloqueadas", value: text });
  }
  return out;
}

/** A project's `<tfoot>`: "Total · 8 tareas" (En retraso "Total · 4 vencidas") and the days-late sum. */
export function projectFooter(p: TareasSummaryProject, mostrar: TareasMostrar): Record<string, string | number> {
  const label = mostrar === "en_retraso" ? `Total · ${vencidasText(p.overdue)}` : `Total · ${tareasText(p.total)}`;
  return { tarea: label, diasRetraso: p.daysLateSum };
}

/** The bar under the last section. */
export function analiticoTotals(summary: TareasSummary, mostrar: TareasMostrar): { label: string; summary: string } {
  const t = summary.totals;
  if (mostrar === "en_retraso") {
    const avg = retrasoPromedio(t);
    return {
      label: `Total · ${vencidasText(t.overdue)} en ${proyectosText(t.projects)}`,
      summary: `${plural(t.daysLateSum, "día", "días")} de retraso · ${avg === null ? "—" : `${NUMBER.format(avg)} d`} promedio`,
    };
  }
  return {
    label: `Total · ${tareasText(t.total)} en ${proyectosText(t.projects)}`,
    summary: `${abiertasText(t.open)} · ${vencidasText(t.overdue)} · ${pctText(t)} · ${retrasoText(t)}`,
  };
}

/**
 * En retraso: the note naming the projects it hides, or null when it hides
 * none. "1 proyecto sin tareas vencidas no se muestra: A." / "N proyectos sin
 * tareas vencidas no se muestran: A, B."
 */
export function hiddenProjectsNote(summary: TareasSummary): string | null {
  const hidden = hiddenSummaryProjects(summary);
  if (hidden.length === 0) return null;
  const names = hidden.map((p) => p.name).join(", ");
  const head =
    hidden.length === 1
      ? `1 proyecto sin tareas vencidas no se muestra: ${names}.`
      : `${NUMBER.format(hidden.length)} proyectos sin tareas vencidas no se muestran: ${names}.`;
  return `${head} Los tramos sin vencidas también se ocultan.`;
}

/** "Se expandieron 12 grupos" / "Se contrajeron 1 grupo". */
export function expandAnnouncement(opened: boolean, n: number): string {
  const groups = plural(n, "grupo", "grupos");
  return opened ? `Se expandieron ${groups}` : `Se contrajeron ${groups}`;
}

/** One table row (`GroupedTable` leaf). */
export type AnaliticoRow = {
  id: string;
  /** The row's task: the editable cells read and patch it. */
  task: TaskListRow;
  tarea: string;
  /** Tramo name, or "Sin tramo". */
  tramo: string;
  /** Fase name, or "Sin fase". */
  fase: string;
  responsable: string;
  estatus: string;
  statusToken: StatusColorToken;
  vence: string;
  overdue: boolean;
  closed: boolean;
  prioridad: string;
  subtareas: string;
  diasRetraso: number;
};

export function analiticoRow(row: TaskListRow, today: string): AnaliticoRow {
  const item = { ...row, notes: null };
  const late = daysLate(item, today);
  return {
    id: row.id,
    task: row,
    tarea: row.title,
    tramo: row.workflow?.name ?? SIN_TRAMO_LABEL,
    fase: row.phase?.name ?? CLEAR_LABEL.phase,
    responsable: row.manager?.name ?? "Sin asignar",
    estatus: taskStatusLabel(row),
    statusToken: statusColorToken(row),
    vence: formatDueDate(taskDueDate(row)),
    overdue: late > 0,
    closed: isTaskClosed(row),
    prioridad: PRIORITY_LABEL[row.priority],
    subtareas: row.subtaskCount > 0 ? `${row.subtaskDone}/${row.subtaskCount}` : "—",
    diasRetraso: late,
  };
}

/** "9 días de retraso" (the heat cell's text alternative). */
export function daysLateLabel(n: number): string {
  return `${plural(n, "día", "días")} de retraso`;
}
