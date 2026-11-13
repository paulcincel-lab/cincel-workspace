/**
 * Tareas · Analítico test fixture, seen on lunes 9 de noviembre de 2026:
 * Casa Lomas (Presale: Contrato 10 days late and blocked, Levantamiento
 * done; Diseño: Planos 5 days late, Render 4 days late) and Depto Roma
 * (Diseño: Fachada on time). Casa Valle de Bravo has tasks, none overdue.
 */
import { qk, type TareasListFilters } from "@/lib/query/keys";
import type { TareasListPages } from "@/lib/query/options/tareas";
import type { TareasFacets } from "@/lib/tareas/page-data";
import { tareasGroupFilters, type TareasSummary } from "@/lib/tareas/summary";
import type { TaskListItem, TaskListRow } from "@/lib/types/core";
import type { QueryClient } from "@tanstack/react-query";

import { DISENO, LISTA_ETAPAS, PRESALE, makeListaTask } from "./lista-tasks";

export const ANALITICO_TODAY = "2026-11-09";
export const ANALITICO_ETAPAS = LISTA_ETAPAS;

const LOMAS = { id: "p1", name: "Casa Lomas", clientName: null };
const ROMA = { id: "p2", name: "Depto Roma", clientName: null };

export function analiticoTaskRow(overrides: Partial<TaskListItem> = {}): TaskListRow {
  const { notes: _notes, ...item } = makeListaTask(overrides);
  void _notes;
  return {
    ...item,
    subtaskDone: item.subtaskDoneCount,
    commentCount: 0,
    attachmentCount: 0,
    checklistTotal: item.checklist.total,
    checklistDone: item.checklist.completed,
  };
}

export const LOMAS_PRESALE_ROWS: TaskListRow[] = [
  analiticoTaskRow({
    id: "t1",
    title: "Contrato",
    project: LOMAS,
    workflow: PRESALE,
    workflowId: PRESALE.id,
    status: "bloqueado",
    commitmentDate: "2026-10-30",
    priority: "alta",
    manager: { id: "s1", name: "Ana Ruiz" },
    subtaskCount: 5,
    subtaskDoneCount: 2,
  }),
  analiticoTaskRow({
    id: "t2",
    title: "Levantamiento",
    project: LOMAS,
    workflow: PRESALE,
    workflowId: PRESALE.id,
    status: "completado",
    commitmentDate: "2026-10-20",
  }),
];

export const LOMAS_DISENO_ROWS: TaskListRow[] = [
  analiticoTaskRow({ id: "t3", title: "Planos", project: LOMAS, commitmentDate: "2026-11-04" }),
  analiticoTaskRow({ id: "t4", title: "Render", project: LOMAS, commitmentDate: "2026-11-05" }),
];

export const ROMA_DISENO_ROWS: TaskListRow[] = [
  analiticoTaskRow({ id: "t5", title: "Fachada", projectId: ROMA.id, project: ROMA, commitmentDate: "2026-12-01" }),
];

const presale = { id: PRESALE.id, key: PRESALE.key, name: PRESALE.name, sortOrder: PRESALE.sortOrder };
const diseno = { id: DISENO.id, key: DISENO.key, name: DISENO.name, sortOrder: DISENO.sortOrder };

const UNFILTERED: TareasSummary["unfiltered"] = {
  projects: 3,
  total: 7,
  projectList: [
    { id: "p1", name: "Casa Lomas", total: 4, byEtapa: { [PRESALE.id]: 2, [DISENO.id]: 2 } },
    { id: "p3", name: "Casa Valle de Bravo", total: 2, byEtapa: { [DISENO.id]: 2 } },
    { id: "p2", name: "Depto Roma", total: 1, byEtapa: { [DISENO.id]: 1 } },
  ],
};

/** Mostrar: Todas (Casa Valle de Bravo sits outside the etapa filter here, so it isn't listed). */
export const ANALITICO_SUMMARY: TareasSummary = {
  projects: [
    {
      project: { id: "p1", name: "Casa Lomas" },
      total: 4,
      open: 3,
      overdue: 3,
      blocked: 1,
      daysLateSum: 19,
      etapas: [
        { etapa: presale, total: 2, open: 1, overdue: 1, blocked: 1, daysLateSum: 10 },
        { etapa: diseno, total: 2, open: 2, overdue: 2, blocked: 0, daysLateSum: 9 },
      ],
    },
    {
      project: { id: "p2", name: "Depto Roma" },
      total: 1,
      open: 1,
      overdue: 0,
      blocked: 0,
      daysLateSum: 0,
      etapas: [{ etapa: diseno, total: 1, open: 1, overdue: 0, blocked: 0, daysLateSum: 0 }],
    },
  ],
  totals: { total: 5, open: 4, overdue: 3, blocked: 1, daysLateSum: 19, projects: 2 },
  unfiltered: { projects: 2, total: 5, projectList: UNFILTERED.projectList!.filter((p) => p.id !== "p3") },
};

/** Mostrar: En retraso. */
export const ANALITICO_LATE_SUMMARY: TareasSummary = {
  projects: [
    {
      project: { id: "p1", name: "Casa Lomas" },
      total: 3,
      open: 3,
      overdue: 3,
      blocked: 1,
      daysLateSum: 19,
      etapas: [
        { etapa: presale, total: 1, open: 1, overdue: 1, blocked: 1, daysLateSum: 10 },
        { etapa: diseno, total: 2, open: 2, overdue: 2, blocked: 0, daysLateSum: 9 },
      ],
    },
  ],
  totals: { total: 3, open: 3, overdue: 3, blocked: 1, daysLateSum: 19, projects: 1 },
  unfiltered: UNFILTERED,
};

export const ANALITICO_FACETS: TareasFacets = {
  total: 5,
  byEtapa: { presale: 2, diseno: 3 },
  projects: [],
  mostrar: { todas: 7, abiertas: 6, en_retraso: 3 },
  mine: 1,
};

/** Seeds the summary and every group's first page under the keys the view reads. */
export function seedAnalitico(client: QueryClient, f: TareasListFilters, summary: TareasSummary): void {
  client.setQueryData(qk.tareas.summary(f), summary);
  const page = (rows: TaskListRow[]): TareasListPages => ({
    pages: [{ rows, nextCursor: null, total: rows.length }],
    pageParams: [null],
  });
  const late = f.mostrar === "en_retraso";
  const lomasPresale = late ? LOMAS_PRESALE_ROWS.filter((r) => r.status !== "completado") : LOMAS_PRESALE_ROWS;
  client.setQueryData(qk.tareas.list(tareasGroupFilters(f, "p1", PRESALE.key)), page(lomasPresale));
  client.setQueryData(qk.tareas.list(tareasGroupFilters(f, "p1", DISENO.key)), page(LOMAS_DISENO_ROWS));
  client.setQueryData(qk.tareas.list(tareasGroupFilters(f, "p2", DISENO.key)), page(ROMA_DISENO_ROWS));
}
