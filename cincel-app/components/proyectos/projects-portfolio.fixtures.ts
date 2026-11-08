/**
 * Fixtures of the /proyectos list tests (redesign FE §17): two active
 * projects in different tramos, one paused without a tramo, one archived
 * (not listed), and their portfolio rows.
 */
import type { ProyectosPageData } from "@/lib/loaders/proyectos";
import type { ProjectListItem, WorkflowRef } from "@/lib/types/core";
import type { PortfolioRow } from "@/lib/types/redesign";

export const TRAMOS: WorkflowRef[] = [
  { id: "w1", key: "presale", name: "Presale", sortOrder: 1 },
  { id: "w2", key: "diseno", name: "Diseño", sortOrder: 2 },
  { id: "w3", key: "construccion", name: "Construcción", sortOrder: 3 },
];

function project(patch: Partial<ProjectListItem> & Pick<ProjectListItem, "id" | "name">): ProjectListItem {
  return {
    code: null,
    clientId: null,
    origin: null,
    originStaffId: null,
    status: "activo",
    currentWorkflowId: null,
    projectType: null,
    addressStreet: null,
    addressCity: null,
    addressState: null,
    managerId: null,
    coordinatorId: null,
    progress: 0,
    startDate: null,
    endDate: null,
    contractAmountMxn: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-11-01T00:00:00.000Z",
    client: null,
    currentWorkflow: null,
    tramos: [],
    activePhase: null,
    needsTramo: false,
    stages: [],
    manager: null,
    coordinator: null,
    taskCounts: { total: 0, open: 0, blocked: 0 },
    ...patch,
  };
}

export const PROJECTS: ProjectListItem[] = [
  project({
    id: "p-lomas",
    name: "Casa Lomas",
    addressCity: "Guadalajara",
    addressState: "Jalisco",
    progress: 40,
    currentWorkflowId: "w2",
    currentWorkflow: TRAMOS[1],
    tramos: [
      { ...TRAMOS[0], startedAt: "2026-09-01", closedAt: "2026-10-01", current: false },
      { ...TRAMOS[1], startedAt: "2026-10-01", closedAt: null, current: true },
    ],
    manager: { id: "s1", name: "Ana López" },
    coordinator: { id: "s2", name: "Luis Paz" },
    taskCounts: { total: 12, open: 5, blocked: 0 },
  }),
  project({
    id: "p-andares",
    name: "Depto Andares",
    addressCity: "Zapopan",
    progress: 10,
    currentWorkflowId: "w1",
    currentWorkflow: TRAMOS[0],
    tramos: [{ ...TRAMOS[0], startedAt: "2026-10-15", closedAt: null, current: true }],
    manager: { id: "s1", name: "Ana López" },
    taskCounts: { total: 10, open: 8, blocked: 1 },
  }),
  project({ id: "p-pausado", name: "Oficina Centro", status: "pausado", needsTramo: true, progress: 0 }),
  project({ id: "p-archivado", name: "Casa Antigua", status: "completado", progress: 100 }),
];

export const PORTFOLIO: PortfolioRow[] = [
  {
    projectId: "p-lomas",
    real: 62,
    plan: 70,
    deviation: -8,
    budgetSpentPct: 55,
    open: 4,
    overdue: 2,
    daysToDelivery: 45,
    nextDelivery: { title: "Plano de acabados", date: "2026-11-12" },
    series7: [3, 4, 4, 5, 6, 5, 4],
  },
  {
    projectId: "p-andares",
    real: 15,
    plan: 12,
    deviation: 3,
    budgetSpentPct: null,
    open: 8,
    overdue: 0,
    daysToDelivery: 120,
    nextDelivery: null,
    series7: [8, 8, 8, 8, 8, 8, 8],
  },
];

/** Same rows as a non-admin receives them: the server nulls the budget (BE §7.12). */
export const PORTFOLIO_NON_ADMIN: PortfolioRow[] = PORTFOLIO.map((row) => ({ ...row, budgetSpentPct: null }));

/**
 * `qk.proyectos.list()` data for a component test (seed it with
 * `client.setQueryData(qk.proyectos.list(), portfolioPageData(...))`): a
 * non-admin who can create projects, by default.
 */
export function portfolioPageData(patch: Partial<ProyectosPageData> = {}): ProyectosPageData {
  return {
    projects: PROJECTS,
    portfolio: PORTFOLIO_NON_ADMIN,
    tramos: TRAMOS,
    presaleAutoStart: false,
    canSeeAdminData: false,
    canCreateProject: true,
    ...patch,
  };
}
