/**
 * Tareas · Lista test fixture: five tasks over two projects, seen on
 * sábado 7 de noviembre de 2026 (the week closes on domingo 8).
 */
import type { TaskListItem, WorkflowRef } from "@/lib/types/core";

export const LISTA_TODAY = "2026-11-07";

export const PRESALE: WorkflowRef = { id: "w-presale", key: "presale", name: "Presale", sortOrder: 1 };
export const DISENO: WorkflowRef = { id: "w-diseno", key: "diseno", name: "Diseño", sortOrder: 2 };
export const LISTA_TRAMOS: WorkflowRef[] = [PRESALE, DISENO];

export function makeListaTask(overrides: Partial<TaskListItem> = {}): TaskListItem {
  return {
    id: "t1",
    projectId: "p1",
    kind: "workflow",
    templateId: null,
    workflowId: DISENO.id,
    phaseId: null,
    spaceId: null,
    closedAt: null,
    title: "Tarea",
    notes: null,
    createdById: "s1",
    managerId: null,
    status: "pendiente",
    customStatusId: null,
    priority: "media",
    sortOrder: null,
    commitmentDate: null,
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    customStatus: null,
    project: { id: "p1", name: "Casa Lomas", clientName: null },
    workflow: DISENO,
    phase: null,
    space: null,
    manager: null,
    support: [],
    checklist: { total: 0, completed: 0 },
    parentTaskId: null,
    parentTitle: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    waitingOn: 0,
    ...overrides,
  } as TaskListItem;
}

const LOMAS = { id: "p1", name: "Casa Lomas", clientName: null };
const ROMA = { id: "p2", name: "Depto Roma", clientName: null };

export const LISTA_TASKS: TaskListItem[] = [
  makeListaTask({
    id: "t2",
    title: "Planos de fachada",
    project: LOMAS,
    commitmentDate: "2026-11-08",
    manager: { id: "s2", name: "Luis Pérez" },
  }),
  makeListaTask({
    id: "t4",
    title: "Cotización inicial",
    status: "completado",
    closedAt: "2026-10-29T12:00:00.000Z",
    project: ROMA,
    projectId: "p2",
    workflow: PRESALE,
    workflowId: PRESALE.id,
    commitmentDate: "2026-10-30",
  }),
  makeListaTask({
    id: "t1",
    title: "Levantamiento",
    project: LOMAS,
    priority: "alta",
    commitmentDate: "2026-11-01",
    manager: { id: "s1", name: "Ana Ruiz" },
    subtaskCount: 4,
    subtaskDoneCount: 1,
  }),
  makeListaTask({
    id: "t5",
    title: "Visita de obra",
    status: "en_proceso",
    project: ROMA,
    projectId: "p2",
    workflow: PRESALE,
    workflowId: PRESALE.id,
  }),
  makeListaTask({
    id: "t3",
    title: "Propuesta económica",
    status: "en_proceso",
    project: ROMA,
    projectId: "p2",
    workflow: PRESALE,
    workflowId: PRESALE.id,
    priority: "baja",
    deliveryDate: "2026-11-05",
  }),
];
