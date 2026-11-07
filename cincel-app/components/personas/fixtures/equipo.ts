/**
 * Personas · Equipo fixtures (redesign FE §3.6): staff DTOs plus the
 * `fetchPeopleOverviewAction` rows (R4-02 shape), used by the tests while the
 * overview action's `IMPLEMENTED` flag is false.
 */
import type { PeopleOverviewRow } from "@/lib/types/redesign";
import type { Staff, WorkflowRef } from "@/lib/types/core";

export function staffFixture(patch: Partial<Staff> & Pick<Staff, "id" | "name">): Staff {
  return {
    kind: "empleado",
    lastName: null,
    phone: null,
    email: null,
    role: "Colaborador",
    capacity: 8,
    availability: "Disponible",
    active: true,
    createdAt: "2026-01-05T15:00:00.000Z",
    updatedAt: "2026-01-05T15:00:00.000Z",
    googleManaged: false,
    lastLoginAt: null,
    accessRevokedAt: null,
    accessRevokedReason: null,
    positions: [],
    candidatePhases: [],
    ...patch,
  };
}

export const EQUIPO_TRAMOS: WorkflowRef[] = [
  { id: "w1", key: "presale", name: "Presale", sortOrder: 0 },
  { id: "w2", key: "diseno", name: "Diseño", sortOrder: 1 },
  { id: "w3", key: "construccion", name: "Construcción", sortOrder: 2 },
];

export const EQUIPO_STAFF: Staff[] = [
  staffFixture({
    id: "00000000-0000-4000-8000-000000000101",
    name: "Ana",
    lastName: "Ruiz",
    email: "ana@cincel.mx",
    role: "Administrador",
    positions: [{ id: "p1", name: "Arquitecta proyectista" }],
    candidatePhases: [{ id: "f1", name: "Ejecutivo", sortOrder: 0, workflowName: "Diseño" }],
  }),
  staffFixture({
    id: "00000000-0000-4000-8000-000000000102",
    name: "Bruno",
    lastName: "Soto",
    email: "bruno@cincel.mx",
    role: "Colaborador",
    positions: [{ id: "p2", name: "Residente de obra" }],
    candidatePhases: [{ id: "f3", name: "Obra", sortOrder: 0, workflowName: "Construcción" }],
  }),
  staffFixture({
    id: "00000000-0000-4000-8000-000000000103",
    name: "Carla",
    lastName: "Méndez",
    email: null,
    role: "Dirección",
  }),
];

/** Overview rows as a viewer without `canViewTeamHours` gets them: `weekHours` null for everyone. */
export const EQUIPO_OVERVIEW_NO_HOURS: PeopleOverviewRow[] = [
  {
    staffId: EQUIPO_STAFF[0].id,
    open: 6,
    overdue: 1,
    activeProjects: 3,
    occupancyPct: 75,
    weekHours: null,
    availability: ["ocupado", "ocupado", "saturado", "libre", "libre"],
  },
  {
    staffId: EQUIPO_STAFF[1].id,
    open: 2,
    overdue: 0,
    activeProjects: 1,
    occupancyPct: 25,
    weekHours: null,
    availability: ["libre", "libre", "libre", "vacaciones", "vacaciones"],
  },
  {
    staffId: EQUIPO_STAFF[2].id,
    open: 0,
    overdue: 0,
    activeProjects: 0,
    occupancyPct: 0,
    weekHours: null,
    availability: ["libre", "libre", "libre", "libre", "libre"],
  },
];

/** Same rows as a `canViewTeamHours` viewer gets them; hours are zero until time entries exist. */
export const EQUIPO_OVERVIEW_WITH_HOURS: PeopleOverviewRow[] = EQUIPO_OVERVIEW_NO_HOURS.map((row) => ({
  ...row,
  weekHours: 0,
}));
