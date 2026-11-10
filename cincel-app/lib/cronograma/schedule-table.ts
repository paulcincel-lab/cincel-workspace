/**
 * The schedule as one `RecordTableData` for `CronogramaWidget` (redesign FE
 * §3.5, §4.10.2): partidas (one per sección, in sección order) with their
 * tareas, plus the project milestones. Pure: built from the same
 * `ScheduleTask[]` the existing panels read, so Visual, Esencial and Analítico
 * show the same numbers. Percentages use the definitions of
 * `computeProgress` (real = weighted status, plan = share of tasks due by the
 * end of the current week).
 *
 * Row keys: `id`, `kind` ("partida" | "tarea" | "hito"), `partida`,
 * `responsable`, `inicio` / `fin` (ISO dates), `duracion` (days), `real` /
 * `plan` (0–100), `desviacion` (points) and `holgura` (days: until `fin` for
 * open rows, negative when overdue; for "Entrega de obra", contract end minus
 * estimated end).
 */
import type { RecordTableData } from "@/lib/types/widgets";
import type { PaymentRow, ScheduleTask } from "@/lib/types/schedule";

import { computeProgress, statusWeight } from "./metrics";
import { sortSections } from "./sections";
import { currentWeekEndIso, isoDate } from "./week";

export type ScheduleTableInput = {
  tasks: ScheduleTask[];
  payments: PaymentRow[];
  today: Date;
  /** Contract delivery date of the project (ISO), when known. */
  contractEnd?: string | null;
};

const DAY_MS = 86_400_000;

export const SCHEDULE_TABLE_COLUMNS: RecordTableData["columns"] = [
  { key: "partida", label: "Partida" },
  { key: "responsable", label: "Responsable" },
  { key: "inicio", label: "Inicio", format: "date", mono: true },
  { key: "fin", label: "Fin", format: "date", mono: true },
  { key: "duracion", label: "Duración", format: "days", align: "right", mono: true },
  { key: "real", label: "% real", format: "percent", align: "right", mono: true },
  { key: "plan", label: "% plan", format: "percent", align: "right", mono: true, hideOn: ["esencial"] },
  { key: "desviacion", label: "Desviación", format: "delta", align: "right", mono: true, hideOn: ["esencial"] },
  { key: "holgura", label: "Holgura", format: "days", align: "right", mono: true },
  { key: "timeline", label: "Meses", mono: true, hideOn: ["esencial"] },
];

function toDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

/** Whole days from `from` to `to` (both ISO dates); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / DAY_MS);
}

/** Calendar days a row spans, both ends included. */
function duration(inicio: string, fin: string): number {
  return Math.max(daysBetween(inicio, fin) + 1, 1);
}

function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function holguraOf(fin: string, real: number, todayIso: string): number {
  return real >= 100 ? 0 : daysBetween(todayIso, fin);
}

export function buildScheduleTable({ tasks, payments, today, contractEnd = null }: ScheduleTableInput): RecordTableData {
  if (tasks.length === 0) return { columns: SCHEDULE_TABLE_COLUMNS, rows: [] };

  const todayIso = isoDate(today);
  const weekEnd = currentWeekEndIso(today);

  const bySection = new Map<string, ScheduleTask[]>();
  for (const task of tasks) {
    const list = bySection.get(task.seccion);
    if (list) list.push(task);
    else bySection.set(task.seccion, [task]);
  }

  // Row ids are React keys: two tasks can share an id (a legacy import with a repeated planta + tarea), so a
  // repeated id gets a numeric suffix instead of colliding.
  const usedIds = new Map<string, number>();
  const uniqueId = (base: string): string => {
    const seen = usedIds.get(base) ?? 0;
    usedIds.set(base, seen + 1);
    return seen === 0 ? base : `${base}-${seen + 1}`;
  };

  const rows: Record<string, unknown>[] = [];
  for (const seccion of sortSections([...bySection.keys()])) {
    const sectionTasks = [...(bySection.get(seccion) ?? [])].sort(
      (a, b) => a.inicio.localeCompare(b.inicio) || a.fin.localeCompare(b.fin),
    );
    const inicio = sectionTasks.reduce((min, t) => (t.inicio < min ? t.inicio : min), sectionTasks[0].inicio);
    const fin = sectionTasks.reduce((max, t) => (t.fin > max ? t.fin : max), sectionTasks[0].fin);
    const real = Math.round((sectionTasks.reduce((sum, t) => sum + statusWeight(t.status), 0) / sectionTasks.length) * 100);
    const plan = Math.round((sectionTasks.filter((t) => t.fin <= weekEnd).length / sectionTasks.length) * 100);
    rows.push({
      id: uniqueId(`partida-${slugify(seccion) || rows.length}`),
      kind: "partida",
      partida: seccion,
      responsable: null,
      inicio,
      fin,
      duracion: duration(inicio, fin),
      real,
      plan,
      desviacion: real - plan,
      holgura: holguraOf(fin, real, todayIso),
    });
    for (const task of sectionTasks) {
      const taskReal = Math.round(statusWeight(task.status) * 100);
      const taskPlan = task.fin <= weekEnd ? 100 : 0;
      rows.push({
        id: uniqueId(`tarea-${task.id}`),
        kind: "tarea",
        partida: task.tarea,
        responsable: task.responsable,
        inicio: task.inicio,
        fin: task.fin,
        duracion: duration(task.inicio, task.fin),
        real: taskReal,
        plan: taskPlan,
        desviacion: taskReal - taskPlan,
        holgura: holguraOf(task.fin, taskReal, todayIso),
      });
    }
  }

  const metrics = computeProgress({ tasks, payments }, today);
  const projectStart = tasks.reduce((min, t) => (t.inicio < min ? t.inicio : min), tasks[0].inicio);
  const projectEnd = tasks.reduce((max, t) => (t.fin > max ? t.fin : max), tasks[0].fin);
  const allDone = tasks.every((t) => t.status === "done");
  const deliveryHolgura = contractEnd ? daysBetween(projectEnd, contractEnd) : null;

  const milestones: Record<string, unknown>[] = [
    {
      id: "hito-inicio",
      kind: "hito",
      partida: "Inicio de obra",
      responsable: null,
      inicio: projectStart,
      fin: projectStart,
      duracion: 0,
      real: projectStart <= todayIso ? 100 : 0,
      plan: null,
      desviacion: null,
      holgura: null,
    },
    {
      id: "hito-entrega",
      kind: "hito",
      partida: "Entrega de obra",
      responsable: null,
      inicio: projectEnd,
      fin: projectEnd,
      duracion: 0,
      real: allDone ? 100 : 0,
      plan: null,
      desviacion: null,
      holgura: deliveryHolgura,
    },
  ];

  return {
    columns: SCHEDULE_TABLE_COLUMNS,
    rows: [milestones[0], ...rows, milestones[1]],
    totals: {
      partida: "Proyecto",
      inicio: projectStart,
      fin: projectEnd,
      duracion: duration(projectStart, projectEnd),
      real: metrics.realPct,
      plan: metrics.plannedPct,
      desviacion: metrics.realPct - metrics.plannedPct,
      ...(deliveryHolgura === null ? {} : { holgura: deliveryHolgura }),
    },
  };
}
