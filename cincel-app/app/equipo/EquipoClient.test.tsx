// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";

import type { Position, Staff } from "@/lib/types/core";

const state = vi.hoisted(() => ({
  access: "Administrador" as string,
  staff: [] as Staff[],
  positions: [] as Position[],
  drawerProps: null as Record<string, unknown> | null,
}));

vi.mock("@/lib/auth/auth-service", () => ({
  getCurrentAuthenticatedUser: () => ({
    access: state.access,
    email: "ana@cincel.mx",
    member: { id: "viewer" },
  }),
}));

vi.mock("@/lib/settings/use-general-settings", async () => {
  const { buildDefaultGeneralSettings } = await import("@/lib/settings/general-settings");
  return { useGeneralSettings: () => buildDefaultGeneralSettings() };
});

vi.mock("@/lib/actions/staff-actions", () => ({
  fetchStaffAction: vi.fn(() => Promise.resolve(state.staff)),
  fetchEmergencyContactsAction: vi.fn(() => Promise.resolve(null)),
  reorderStaffAction: vi.fn(),
  setStaffActiveAction: vi.fn(),
}));
vi.mock("@/lib/actions/positions-actions", () => ({
  fetchPositionsAction: vi.fn(() => Promise.resolve(state.positions)),
}));
vi.mock("@/lib/actions/tasks-actions", () => ({
  fetchTasksAction: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/lib/actions/projects-actions", () => ({
  fetchProjectsAction: vi.fn(() => Promise.resolve([])),
}));
vi.mock("@/lib/equipo/staff-export", () => ({
  canExportStaff: () => false,
  exportStaffAction: vi.fn(),
}));

vi.mock("@/lib/equipo/use-member-editor", () => ({
  useMemberEditor: () => {
    const isAdmin = state.access === "Administrador";
    return {
      showEditor: false,
      editingId: null,
      draft: { positionIds: [] },
      setDraft: vi.fn(),
      formError: "",
      accessPreviewState: null,
      isEditingSelfProtectedAdmin: false,
      editingGoogleManaged: false,
      editingGoogleAccess: null,
      teamCapabilities: {
        canViewTeam: true,
        canCreateCollaborator: isAdmin,
        canEditCollaborator: isAdmin,
        canChangeCollaboratorAccess: isAdmin,
        canToggleCollaboratorActive: isAdmin,
        canExportData: false,
      },
      openAddEditor: vi.fn(),
      openEditEditor: vi.fn(),
      closeEditor: vi.fn(),
      saveMember: vi.fn(),
    };
  },
}));

vi.mock("@/components/equipo/MemberEditorDrawer", () => ({
  MemberEditorDrawer: (props: Record<string, unknown>) => {
    state.drawerProps = props;
    return null;
  },
}));
vi.mock("@/components/equipo/MemberProfileModal", () => ({ MemberProfileModal: () => null }));
vi.mock("@/components/equipo/CoordinatorProjectsModal", () => ({ CoordinatorProjectsModal: () => null }));

import { EquipoClient } from "./EquipoClient";

const positions: Position[] = [
  {
    id: "p1",
    name: "Arquitecto proyectista",
    sortOrder: 0,
    active: true,
    staffCount: 1,
    googleManaged: false,
    phases: [
      { id: "f1", name: "Ejecutivo", sortOrder: 0, workflowId: "w1", workflowName: "Diseño" },
      { id: "f2", name: "Proyecto Estructural", sortOrder: 1, workflowId: "w1", workflowName: "Diseño" },
      { id: "f3", name: "Obra", sortOrder: 0, workflowId: "w2", workflowName: "Construcción" },
    ],
  },
];

function makeStaff(overrides: Partial<Staff>): Staff {
  return {
    id: "s1",
    kind: "empleado",
    name: "Ana",
    lastName: "Ruiz",
    phone: null,
    email: "ana@cincel.mx",
    role: "Colaborador",
    capacity: 8,
    availability: "Disponible",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    googleManaged: false,
    lastLoginAt: null,
    accessRevokedAt: null,
    accessRevokedReason: null,
    positions: [],
    candidatePhases: [],
    ...overrides,
  };
}

const withPuestos = makeStaff({
  id: "s1",
  name: "Ana",
  role: "Administrador",
  positions: [{ id: "p1", name: "Arquitecto proyectista" }],
  candidatePhases: [
    { id: "f1", name: "Ejecutivo", sortOrder: 0, workflowName: "Diseño" },
    { id: "f2", name: "Proyecto Estructural", sortOrder: 1, workflowName: "Diseño" },
    { id: "f3", name: "Obra", sortOrder: 0, workflowName: "Construcción" },
  ],
});
const withoutPuestos = makeStaff({ id: "s2", name: "Luis", lastName: "Mora", role: "Colaborador" });

function rowOf(name: string): HTMLElement {
  const row = screen.getAllByText(name)[0].closest("tr");
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

async function renderEquipo() {
  state.staff = [withPuestos, withoutPuestos];
  state.positions = positions;
  render(<EquipoClient initialTeam={state.staff} />);
  await waitFor(() => expect(state.drawerProps?.positionOptions).toEqual(positions));
}

beforeEach(() => {
  state.access = "Administrador";
  state.drawerProps = null;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("EquipoClient columns", () => {
  it.each(["Administrador", "Colaborador"])("shows Puestos, Fases candidatas and Acceso, without Área (%s)", async (access) => {
    state.access = access;
    await renderEquipo();
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent?.trim());
    expect(headers).toEqual(expect.arrayContaining(["Colaborador", "Puestos", "Fases candidatas", "Acceso"]));
    expect(headers).not.toContain("Área");
    expect(headers).not.toContain("Áreas");
    expect(headers).not.toContain("Puesto");
  });

  it("lists puestos as badges and 'Sin puesto' when empty", async () => {
    await renderEquipo();
    expect(within(rowOf("Ana Ruiz")).getByText("Arquitecto proyectista")).toBeTruthy();
    expect(within(rowOf("Luis Mora")).getByText("Sin puesto")).toBeTruthy();
  });

  it("truncates candidate fases to two with +N and keeps the full list for the tooltip", async () => {
    await renderEquipo();
    const row = rowOf("Ana Ruiz");
    expect(row.textContent).toContain("Ejecutivo, Proyecto Estructural");
    expect(row.textContent).toContain("+1");
    expect(row.textContent).not.toContain("Obra");
  });

  it("shows the access role under Acceso", async () => {
    await renderEquipo();
    expect(within(rowOf("Ana Ruiz")).getByText("Administrador")).toBeTruthy();
    expect(within(rowOf("Luis Mora")).getByText("Colaborador")).toBeTruthy();
  });
});

describe("EquipoClient member editor wiring", () => {
  it("passes the puestos catalog to the drawer and lets admins manage it", async () => {
    await renderEquipo();
    expect(state.drawerProps).toMatchObject({ positionOptions: positions, canManagePositions: true });
    expect(state.drawerProps).not.toHaveProperty("areaOptions");
    expect(screen.getByRole("button", { name: "+ Agregar colaborador" })).toBeTruthy();
  });

  it("doesn't let non-admins manage puestos or add collaborators", async () => {
    state.access = "Colaborador";
    await renderEquipo();
    expect(state.drawerProps).toMatchObject({ canManagePositions: false });
    expect(screen.queryByRole("button", { name: "+ Agregar colaborador" })).toBeNull();
  });
});
