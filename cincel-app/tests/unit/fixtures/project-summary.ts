/**
 * Fixtures for the Proyecto · Resumen tests (redesign FE §3.5, §17 B8). One
 * project "Local Espinopapa" in Construcción with a client, a contact, a
 * three-person team, a cronograma and a few Drive files.
 */
import type { ProjectSummaryInput } from "@/lib/proyectos/project-summary";
import type { HistoryEvent, ProjectDetail, TaskListRow, WorkflowPhaseRef, WorkflowRef } from "@/lib/types/core";
import type { PortfolioRow } from "@/lib/types/redesign";

export const ETAPAS: WorkflowRef[] = [
  { id: "w-presale", key: "presale", name: "Presale", sortOrder: 1 },
  { id: "w-diseno", key: "diseno", name: "Diseño", sortOrder: 2 },
  { id: "w-construccion", key: "construccion", name: "Construcción", sortOrder: 3 },
  { id: "w-decoracion", key: "decoracion", name: "Decoración", sortOrder: 4 },
];

/** Active catalog fases per etapa, in order (the Esencial "fase i de n"). */
export const PHASES_BY_ETAPA: Record<string, WorkflowPhaseRef[]> = {
  "w-presale": [{ id: "f-levantamiento", name: "Levantamiento", sortOrder: 1 }],
  "w-diseno": [
    { id: "f-anteproyecto", name: "Anteproyecto", sortOrder: 1 },
    { id: "f-ejecutivo", name: "Proyecto ejecutivo", sortOrder: 2 },
  ],
  "w-construccion": [
    { id: "f-preliminares", name: "Preliminares", sortOrder: 1 },
    { id: "f-obra-negra", name: "Obra negra", sortOrder: 2 },
    { id: "f-acabados", name: "Acabados", sortOrder: 3 },
  ],
  "w-decoracion": [],
};

export function fixtureProject(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: "p1",
    code: "CIN-014",
    name: "Local Espinopapa",
    clientId: "c1",
    origin: "Recomendación",
    originStaffId: null,
    status: "activo",
    currentWorkflowId: "w-construccion",
    projectType: "Local comercial",
    addressStreet: "Av. Reforma 10",
    addressCity: "CDMX",
    addressState: null,
    managerId: "s1",
    coordinatorId: "s2",
    progress: 70,
    startDate: "2026-04-06",
    endDate: "2027-01-29",
    contractAmountMxn: "1000000",
    createdAt: "2026-04-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    client: { id: "c1", name: "Grupo Espinopapa", type: "cliente" },
    currentWorkflow: ETAPAS[2],
    etapas: [
      { ...ETAPAS[0], startedAt: "2026-04-06T00:00:00.000Z", closedAt: "2026-05-29T00:00:00.000Z", current: false },
      { ...ETAPAS[1], startedAt: "2026-06-01T00:00:00.000Z", closedAt: "2026-06-30T00:00:00.000Z", current: false },
      { ...ETAPAS[2], startedAt: "2026-07-01T00:00:00.000Z", closedAt: null, current: true },
    ],
    needsEtapa: false,
    stages: ETAPAS.slice(0, 3),
    manager: { id: "s1", name: "Paul Langarica" },
    coordinator: { id: "s2", name: "Alejandro Riofrio" },
    originStaff: null,
    mondayImport: { boards: [{ id: "b1", name: "Local Espinopapa" }] },
    members: [
      { id: "s1", name: "Paul Langarica", role: "Residente de obra", active: true },
      { id: "s3", name: "Ana López", role: null, active: true },
    ],
    contacts: [{ id: "k1", name: "Mariana Ruiz", type: "cliente", role: "Propietaria" }],
    links: [],
    ...overrides,
  };
}

export const PORTFOLIO: PortfolioRow = {
  projectId: "p1",
  real: 82,
  plan: 85,
  deviation: -3,
  budgetSpentPct: 64,
  open: 9,
  overdue: 4,
  avgDelayDays: null,
  overdueWeekAgo: 0,
  avgDelayWeekAgo: null,
  daysToDelivery: 84,
  nextDelivery: { title: "Entrega de acabados", date: "2026-11-20" },
  series7: [7, 8, 8, 9, 9, 10, 9],
};

export function fixtureSummaryInput(overrides: Partial<ProjectSummaryInput> = {}): ProjectSummaryInput {
  return {
    project: fixtureProject(),
    portfolio: PORTFOLIO,
    etapaCatalog: ETAPAS,
    taskStats: { total: 39, done: 32, open: 7, overdue: 4, currentPhase: "Obra negra", currentPhaseId: "f-obra-negra" },
    schedule: {
      tasks: [
        {
          id: "t1",
          stableKey: "a",
          legacyId: null,
          planta: "PB",
          seccion: "Demoliciones",
          responsable: "Paul Langarica",
          inicio: "2026-07-03",
          fin: "2026-07-24",
          tarea: "Demoler muros",
          status: "done",
          flagged: false,
        },
        {
          id: "t2",
          stableKey: "b",
          legacyId: null,
          planta: "PB",
          seccion: "Acabados y pisos",
          responsable: "Alejandro Riofrio",
          inicio: "2026-10-10",
          fin: "2026-11-01",
          tarea: "Piso",
          status: "progress",
          flagged: false,
        },
        {
          id: "t3",
          stableKey: "c",
          legacyId: null,
          planta: "PB",
          seccion: "Acabados y pisos",
          responsable: "Alejandro Riofrio",
          inicio: "2026-11-02",
          fin: "2026-11-25",
          tarea: "Pintura",
          status: "pending",
          flagged: false,
        },
      ],
      payments: [
        { fecha: "2026-07-01", pagadoPct: 30, avancePct: 20 },
        { fecha: "2026-10-01", pagadoPct: 64, avancePct: 70 },
      ],
    },
    files: [
      {
        id: "f-planos",
        name: "Planos",
        mimeType: "application/vnd.google-apps.folder",
        sizeBytes: null,
        modifiedAt: "2026-11-03T10:00:00.000Z",
        iconLink: null,
        thumbnailLink: null,
        webViewLink: null,
        kind: "folder",
      },
      {
        id: "f1",
        name: "Planta arquitectónica.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        modifiedAt: "2026-11-03T09:00:00.000Z",
        iconLink: null,
        thumbnailLink: null,
        webViewLink: "https://drive.google.com/file/d/f1/view",
        kind: "file",
      },
      {
        id: "f2",
        name: "Render fachada.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 2000,
        modifiedAt: "2026-11-02T09:00:00.000Z",
        iconLink: null,
        thumbnailLink: "https://lh3.googleusercontent.com/thumb-f2",
        webViewLink: "https://drive.google.com/file/d/f2/view",
        kind: "file",
      },
    ],
    spaces: [{ id: "e1", name: "Planta baja" }],
    // Only the project's team; `email` is admin-only (the loader drops it for everyone else).
    staff: {
      s1: { id: "s1", name: "Paul Langarica", email: "paul@cincel.mx", puesto: "Arquitecto" },
      s2: { id: "s2", name: "Alejandro Riofrio", email: "alejandro@cincel.mx", puesto: "Dirección de proyecto" },
      s3: { id: "s3", name: "Ana López" },
    },
    showBudget: true,
    showClientContacts: true,
    today: "2026-11-06",
    phasesByEtapa: PHASES_BY_ETAPA,
    driveFolderUrl: "https://drive.google.com/drive/folders/drive-p1",
    // Open tasks across all projects against capacity (Personas occupancy).
    teamLoad: {
      s1: { loadPct: 92, openTotal: 11, capacity: 12 },
      s2: { loadPct: 60, openTotal: 6, capacity: 10 },
      s3: { loadPct: 40, openTotal: 4, capacity: 10 },
    },
    ...overrides,
  };
}

// ── Task list and history (`qk.proyectos.tab(id, "tareas")`, `qk.proyectos.history(id)`) ──

/** A slim task row of "Local Espinopapa" (Construcción, Paul as responsable unless overridden). */
export function fixtureTaskRow(id: string, overrides: Partial<TaskListRow> = {}): TaskListRow {
  return {
    id,
    projectId: "p1",
    kind: "workflow",
    templateId: null,
    workflowId: ETAPAS[2]!.id,
    phaseId: null,
    spaceId: null,
    closedAt: null,
    title: `Tarea ${id}`,
    createdById: "s1",
    managerId: "s1",
    status: "pendiente",
    customStatusId: null,
    priority: "media",
    sortOrder: null,
    commitmentDate: null,
    reviewDate: null,
    deliveryDate: null,
    archived: false,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    customStatus: null,
    project: { id: "p1", name: "Local Espinopapa", clientName: null },
    workflow: ETAPAS[2]!,
    phase: null,
    space: null,
    manager: { id: "s1", name: "Paul Langarica" },
    support: [],
    checklist: { total: 0, completed: 0 },
    parentTaskId: null,
    parentTitle: null,
    subtaskCount: 0,
    subtaskDoneCount: 0,
    subtaskDone: 0,
    commentCount: 0,
    attachmentCount: 0,
    checklistTotal: 0,
    checklistDone: 0,
    waitingOn: 0,
    ...overrides,
  };
}

const ALEJANDRO = { id: "s2", name: "Alejandro Riofrio" };
const ANA = { id: "s3", name: "Ana López" };

/**
 * Seven top-level tasks and one subtask: Presale and Diseño closed (one
 * Diseño task still open), Construcción in course with an overdue, a blocked
 * and two open tasks, Decoración not started with one dated task.
 */
export const TASK_ROWS: TaskListRow[] = [
  fixtureTaskRow("t-presale", { workflowId: ETAPAS[0]!.id, workflow: ETAPAS[0]!, status: "completado", title: "Levantamiento topográfico" }),
  fixtureTaskRow("t-diseno-1", { workflowId: ETAPAS[1]!.id, workflow: ETAPAS[1]!, status: "completado", title: "Planos ejecutivos" }),
  fixtureTaskRow("t-diseno-2", {
    workflowId: ETAPAS[1]!.id,
    workflow: ETAPAS[1]!,
    status: "pendiente",
    title: "Detalle de cancelería",
    managerId: ANA.id,
    manager: ANA,
    commitmentDate: "2026-11-20",
  }),
  fixtureTaskRow("t-obra-1", {
    status: "en_proceso",
    title: "Instalación eléctrica",
    commitmentDate: "2026-10-27",
    subtaskCount: 4,
    subtaskDone: 2,
    subtaskDoneCount: 2,
  }),
  fixtureTaskRow("t-obra-2", { status: "bloqueado", title: "Permiso de obra ante alcaldía", managerId: ALEJANDRO.id, manager: ALEJANDRO }),
  fixtureTaskRow("t-obra-3", { status: "pendiente", title: "Pintura de muros", commitmentDate: "2026-11-12" }),
  fixtureTaskRow("t-obra-4", { status: "completado", title: "Demoliciones" }),
  fixtureTaskRow("t-deco-1", {
    workflowId: ETAPAS[3]!.id,
    workflow: ETAPAS[3]!,
    status: "pendiente",
    title: "Selección de mobiliario",
    managerId: ANA.id,
    manager: ANA,
    commitmentDate: "2027-01-08",
  }),
  // A subtask: counted on its parent, never on its own.
  fixtureTaskRow("t-obra-1-a", { parentTaskId: "t-obra-1", status: "completado", title: "Tablero" }),
];

/** Project history, newest first ("now" = 2026-11-06T18:00Z). */
export const HISTORY_EVENTS: HistoryEvent[] = [
  {
    id: "h1",
    entity: "project",
    entityId: "p1",
    kind: "comentario",
    actor: { id: "s1", name: "Paul Langarica" },
    field: null,
    beforeValue: null,
    afterValue: null,
    comment: "Revisar el permiso",
    eventAt: "2026-11-06T16:00:00.000Z",
  },
  {
    id: "h2",
    entity: "project",
    entityId: "p1",
    kind: "cambio",
    actor: { id: "s2", name: "Alejandro Riofrio" },
    field: "currentWorkflowId",
    beforeValue: ETAPAS[1]!.id,
    afterValue: ETAPAS[2]!.id,
    comment: null,
    eventAt: "2026-07-01T15:00:00.000Z",
  },
];
