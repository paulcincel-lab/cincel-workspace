/**
 * Tareas · Esencial test fixture: the cards `tareas.byProject(f)` returns for
 * the signed-in user (Ana, `ESENCIAL_ME`), seen on 7 de noviembre de 2026.
 */
import type { TareasByProject, TareasFacets, TareasProjectGroup } from "@/lib/tareas/page-data";
import type { TaskListItem, TaskListRow } from "@/lib/types/core";

import { DISENO, LISTA_TRAMOS, PRESALE, makeListaTask } from "./lista-tasks";

export const ESENCIAL_TODAY = "2026-11-07";
export const ESENCIAL_ME = "11111111-1111-4111-8111-111111111111";
export const ESENCIAL_TRAMOS = LISTA_TRAMOS;

export function esencialRow(overrides: Partial<TaskListItem> = {}): TaskListRow {
  const { notes: _notes, ...item } = makeListaTask({ managerId: ESENCIAL_ME, ...overrides });
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

const LOMAS = { id: "p1", name: "Casa Lomas", clientName: null };
const ROMA = { id: "p2", name: "Depto Roma", clientName: null };

export const LOMAS_GROUP: TareasProjectGroup = {
  project: { id: LOMAS.id, name: LOMAS.name },
  open: 3,
  overdue: 1,
  completed: 2,
  rows: [
    esencialRow({ id: "t1", title: "Render del lobby", project: LOMAS, projectId: LOMAS.id, commitmentDate: "2026-11-02", status: "en_proceso" }),
    esencialRow({ id: "t2", title: "Planos de fachada", project: LOMAS, projectId: LOMAS.id, commitmentDate: "2026-11-10" }),
    esencialRow({ id: "t3", title: "Bloqueada por cliente", project: LOMAS, projectId: LOMAS.id, status: "bloqueado", workflow: PRESALE, workflowId: PRESALE.id }),
  ],
};

export const ROMA_GROUP: TareasProjectGroup = {
  project: { id: ROMA.id, name: ROMA.name },
  open: 1,
  overdue: 0,
  completed: 0,
  rows: [esencialRow({ id: "t4", title: "Cotización", project: ROMA, projectId: ROMA.id, workflow: DISENO, commitmentDate: "2026-11-20" })],
};

export const ESENCIAL_DATA: TareasByProject = { groups: [LOMAS_GROUP, ROMA_GROUP], truncated: false };

export const ESENCIAL_FACETS: TareasFacets = {
  total: 4,
  byTramo: { diseno: 3, presale: 1 },
  projects: [
    { id: LOMAS.id, name: LOMAS.name, count: 3 },
    { id: ROMA.id, name: ROMA.name, count: 1 },
  ],
  mostrar: { todas: 4, abiertas: 4, en_retraso: 1 },
  mine: 4,
};
