/**
 * `TaskBoardWidget` fixture: one board and its table, rendered by every
 * style (Visual / Esencial / Analítico) so the tests can check the same
 * numbers appear in each. Bloqueado is empty (a collapsed column in Visual);
 * one task sits in the custom status "En revisión".
 */
import type { TaskListItem, WorkflowRef } from "@/lib/types/core";
import type { TaskBoard } from "@/lib/types/redesign";
import type { RecordTableData } from "@/lib/types/widgets";

const PRESALE: WorkflowRef = { id: "w1", key: "presale", name: "Presale", sortOrder: 1 };
const DISENO: WorkflowRef = { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 };
const CONSTRUCCION: WorkflowRef = { id: "w3", key: "construccion", name: "Construcción", sortOrder: 3 };
const DECORACION: WorkflowRef = { id: "w4", key: "decoracion", name: "Decoración", sortOrder: 4 };

const ANA = { id: "s1", name: "Ana López" };
const LUIS = { id: "s2", name: "Luis Pérez" };
const MARCO = { id: "s3", name: "Marco Ruiz" };

/** Due dates before this are overdue in any run; after it, never. */
const PAST = "2026-01-15";
const FUTURE = "2030-06-15";

function task(overrides: Partial<TaskListItem> & Pick<TaskListItem, "id" | "title">): TaskListItem {
  return {
    projectId: "p1",
    kind: "workflow",
    templateId: null,
    workflowId: DISENO.id,
    phaseId: null,
    spaceId: null,
    closedAt: null,
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
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    customStatus: null,
    project: { id: "p1", name: "Residencia Valle Alto", clientName: null },
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
  };
}

export const taskBoardTasks: TaskListItem[] = [
  task({
    id: "t1",
    title: "Levantamiento topográfico",
    priority: "alta",
    managerId: ANA.id,
    manager: ANA,
    commitmentDate: PAST,
    subtaskCount: 3,
    subtaskDoneCount: 1,
  }),
  task({
    id: "t2",
    title: "Planos ejecutivos",
    managerId: LUIS.id,
    manager: LUIS,
    phaseId: "f1",
    phase: { id: "f1", name: "Ejecutivo", sortOrder: 2 },
    commitmentDate: FUTURE,
  }),
  task({
    id: "t3",
    title: "Cotización de acabados",
    priority: "baja",
    workflowId: PRESALE.id,
    workflow: PRESALE,
    project: { id: "p2", name: "Casa Lomas", clientName: null },
    projectId: "p2",
  }),
  task({
    id: "t4",
    title: "Cimbra losa nivel 2",
    status: "en_proceso",
    priority: "alta",
    workflowId: CONSTRUCCION.id,
    workflow: CONSTRUCCION,
    managerId: MARCO.id,
    manager: MARCO,
    commitmentDate: "2026-02-01",
    subtaskCount: 4,
    subtaskDoneCount: 2,
  }),
  task({
    id: "t5",
    title: "Selección de mobiliario",
    status: "en_proceso",
    workflowId: DECORACION.id,
    workflow: DECORACION,
    managerId: ANA.id,
    manager: ANA,
    commitmentDate: "2030-07-01",
  }),
  task({
    id: "t6",
    title: "Revisión de renders",
    status: "en_proceso",
    customStatusId: "cs-rev",
    customStatus: { id: "cs-rev", name: "En revisión", closes: false, countsAsCompleted: false },
    managerId: LUIS.id,
    manager: LUIS,
    commitmentDate: "2030-05-01",
  }),
  task({
    id: "t7",
    title: "Entrega de anteproyecto",
    status: "completado",
    closedAt: "2026-01-12T00:00:00.000Z",
    managerId: ANA.id,
    manager: ANA,
    commitmentDate: "2026-01-10",
  }),
];

export const taskBoardFixture: TaskBoard = {
  pendiente: taskBoardTasks.filter((t) => t.status === "pendiente"),
  en_proceso: taskBoardTasks.filter((t) => t.status === "en_proceso"),
  completado: taskBoardTasks.filter((t) => t.status === "completado"),
  bloqueado: [],
};

export const emptyTaskBoardFixture: TaskBoard = { pendiente: [], en_proceso: [], completado: [], bloqueado: [] };

/** Tasks per column key, and overdue open tasks per column, as every style must show them. */
export const taskBoardExpected = {
  counts: { pendiente: 3, en_proceso: 2, completado: 1, bloqueado: 0, "custom:cs-rev": 1 },
  overdue: { pendiente: 1, en_proceso: 1, completado: 0, bloqueado: 0, "custom:cs-rev": 0 },
  total: 7,
} as const;

const STATUS_TEXT: Record<string, string> = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  completado: "Completado",
  bloqueado: "Bloqueado",
};

const PRIORITY_TEXT = { alta: "Alta", media: "Media", baja: "Baja" } as const;

/** Days of delay per task id (as the server computes them on the fixture's reference day). */
const DELAY: Record<string, number> = { t1: 296, t4: 279 };

export const taskBoardTableFixture: RecordTableData = {
  columns: [
    { key: "tarea", label: "Tarea" },
    { key: "proyecto", label: "Proyecto" },
    { key: "tramo", label: "Etapa" },
    { key: "fase", label: "Fase", hideOn: ["esencial"] },
    { key: "responsable", label: "Responsable" },
    { key: "estatus", label: "Estatus" },
    { key: "prioridad", label: "Prioridad", hideOn: ["esencial"] },
    { key: "vence", label: "Vence", format: "date", mono: true },
    { key: "retraso", label: "Días de retraso", format: "days", align: "right", mono: true, hideOn: ["esencial"] },
    { key: "subtareas", label: "Subtareas", align: "right", mono: true, hideOn: ["esencial"] },
  ],
  rows: taskBoardTasks.map((t) => ({
    id: t.id,
    tarea: t.title,
    proyecto: t.project.name,
    tramo: t.workflow?.name ?? "",
    fase: t.phase?.name ?? "Sin fase",
    responsable: t.manager?.name ?? "Sin responsable",
    estatus: t.customStatus?.name ?? STATUS_TEXT[t.status],
    prioridad: PRIORITY_TEXT[t.priority],
    vence: t.commitmentDate,
    retraso: DELAY[t.id] ?? 0,
    subtareas: t.subtaskCount > 0 ? `${t.subtaskDoneCount}/${t.subtaskCount}` : "",
  })),
  groupBy: "estatus",
  heat: [{ key: "retraso", warnAt: 1, critAt: 7 }],
};
