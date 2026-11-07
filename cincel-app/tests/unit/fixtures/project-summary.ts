/**
 * Fixtures for the Proyecto · Resumen tests (redesign FE §3.5, §17 B8). One
 * project "Local Espinopapa" in Construcción with a client, a contact, a
 * three-person team, a cronograma and a few Drive files.
 */
import type { ProjectSummaryInput } from "@/lib/proyectos/project-summary";
import type { ProjectDetail, WorkflowRef } from "@/lib/types/core";
import type { PortfolioRow } from "@/lib/types/redesign";

export const TRAMOS: WorkflowRef[] = [
  { id: "w-presale", key: "presale", name: "Presale", sortOrder: 1 },
  { id: "w-diseno", key: "diseno", name: "Diseño", sortOrder: 2 },
  { id: "w-construccion", key: "construccion", name: "Construcción", sortOrder: 3 },
  { id: "w-decoracion", key: "decoracion", name: "Decoración", sortOrder: 4 },
];

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
    currentWorkflow: TRAMOS[2],
    tramos: [
      { ...TRAMOS[0], startedAt: "2026-04-06T00:00:00.000Z", closedAt: "2026-05-29T00:00:00.000Z", current: false },
      { ...TRAMOS[1], startedAt: "2026-06-01T00:00:00.000Z", closedAt: "2026-06-30T00:00:00.000Z", current: false },
      { ...TRAMOS[2], startedAt: "2026-07-01T00:00:00.000Z", closedAt: null, current: true },
    ],
    needsTramo: false,
    stages: TRAMOS.slice(0, 3),
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
  daysToDelivery: 84,
  nextDelivery: { title: "Entrega de acabados", date: "2026-11-20" },
  series7: [7, 8, 8, 9, 9, 10, 9],
};

export function fixtureSummaryInput(overrides: Partial<ProjectSummaryInput> = {}): ProjectSummaryInput {
  return {
    project: fixtureProject(),
    portfolio: PORTFOLIO,
    tramoCatalog: TRAMOS,
    taskStats: { total: 39, done: 32, open: 7, overdue: 4, currentPhase: "Obra negra" },
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
        webViewLink: "https://drive.google.com/file/d/f2/view",
        kind: "file",
      },
    ],
    spaces: [{ id: "e1", name: "Planta baja" }],
    staff: {
      s1: { email: "paul@cincel.mx", puesto: "Arquitecto" },
      s2: { email: "alejandro@cincel.mx", puesto: "Dirección de proyecto" },
      s3: { email: null, puesto: null },
    },
    showBudget: true,
    showClientContacts: true,
    today: "2026-11-06",
    ...overrides,
  };
}
