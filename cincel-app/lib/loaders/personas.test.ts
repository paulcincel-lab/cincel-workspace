// @vitest-environment node
/**
 * Personas loaders (Query Migration 6, #940) with mocked reads: the Equipo
 * join from one staff list, the capability gates (FORBIDDEN, 0 counts), the
 * SQL tab filter handed to `listContacts` and the admin-only stripping. The
 * DB side lives in `tests/db/personas.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser } from "@/lib/auth/auth-service";
import type { ContactListItem } from "@/lib/types/core";

const caps = vi.hoisted(() => ({
  team: { canViewTeam: true, canCreateCollaborator: true },
  clients: { canViewClients: true, canCreateClient: true, canEditClient: false, canDeleteClient: false },
  admin: false,
  activities: { canCreateActivity: true, canChangeResponsible: true },
}));

vi.mock("@/lib/db/client", () => ({ db: {} }));
vi.mock("@/lib/auth/permissions", () => ({
  resolveTeamCapabilities: vi.fn(() => caps.team),
  resolveClientsCapabilities: vi.fn(() => caps.clients),
  resolveActivitiesCapabilities: vi.fn(() => caps.activities),
  canViewTeamHours: vi.fn(() => false),
  canDecideVacations: vi.fn(() => false),
}));
vi.mock("@/lib/etapas/compat", () => ({ canSeeAdminData: vi.fn(() => caps.admin) }));
vi.mock("@/lib/time-tracking/settings", () => ({
  TIME_TRACKING_TIME_ZONE: "America/Mexico_City",
  getTimeTrackingSettings: vi.fn(async () => ({ enabled: true })),
}));
vi.mock("@/lib/time-tracking/week-hours", () => ({ weekHours: vi.fn(async () => new Map()) }));
vi.mock("@/lib/vacations/approved-absences", () => ({ approvedAbsences: vi.fn(async () => []) }));

const reads = vi.hoisted(() => ({
  listStaff: vi.fn(),
  listEtapasNav: vi.fn(),
  listAssignedOpenTasks: vi.fn(),
  listActiveProjectsByStaff: vi.fn(),
  listContacts: vi.fn(),
  countByType: vi.fn(),
}));
vi.mock("@/lib/repositories/staff-repository", () => ({
  listStaff: reads.listStaff,
  loadStaffPositions: vi.fn(async () => new Map()),
  toStaff: vi.fn(),
}));
vi.mock("@/lib/repositories/workflows-repository", () => ({ listEtapasNav: reads.listEtapasNav }));
vi.mock("@/lib/repositories/people-repository", () => ({
  listAssignedOpenTasks: reads.listAssignedOpenTasks,
  listActiveProjectsByStaff: reads.listActiveProjectsByStaff,
}));
vi.mock("@/lib/repositories/contacts-repository", () => ({
  listContacts: reads.listContacts,
  countByType: reads.countByType,
}));

import { EQUIPO_STAFF, EQUIPO_ETAPAS } from "@/components/personas/fixtures/equipo";

import { loadPersonasContacts, loadPersonasCounts, loadPersonasEquipo } from "./personas";
import { approvedAbsences } from "@/lib/vacations/approved-absences";

const USER = { member: { id: "s-viewer" }, email: "", access: "Colaborador" } as unknown as AuthenticatedUser;

function contactRow(patch: Partial<ContactListItem> & Pick<ContactListItem, "id" | "type">): ContactListItem {
  return {
    kind: "particular",
    name: patch.id,
    phone: null,
    email: null,
    website: null,
    location: null,
    acquisitionChannel: "Instagram",
    notes: null,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    primaryPerson: null,
    tags: [],
    providerProfile: null,
    ...patch,
  } as ContactListItem;
}

beforeEach(() => {
  caps.team = { canViewTeam: true, canCreateCollaborator: true };
  caps.clients = { canViewClients: true, canCreateClient: true, canEditClient: false, canDeleteClient: false };
  caps.admin = false;
  caps.activities = { canCreateActivity: true, canChangeResponsible: true };
  reads.listStaff.mockReset().mockResolvedValue(EQUIPO_STAFF);
  reads.listEtapasNav.mockReset().mockResolvedValue(EQUIPO_ETAPAS);
  reads.listAssignedOpenTasks.mockReset().mockResolvedValue(new Map());
  reads.listActiveProjectsByStaff.mockReset().mockResolvedValue(new Map());
  reads.listContacts.mockReset().mockResolvedValue([]);
  reads.countByType.mockReset().mockResolvedValue({ cliente: 4, socio: 1, proveedor: 6, contratista: 2 });
});

describe("loadPersonasEquipo", () => {
  it("joins one staff list into people, emails and etapas", async () => {
    const data = await loadPersonasEquipo(USER);
    expect(reads.listStaff).toHaveBeenCalledTimes(1);
    expect(data.people.map((p) => p.name)).toEqual(["Ana Ruiz", "Bruno Soto", "Carla Méndez"]);
    expect(data.people.map((p) => p.etapa)).toEqual(["diseno", "construccion", null]);
    expect(data.people.every((p) => p.weekHours === null)).toBe(true);
    expect(data.emails[EQUIPO_STAFF[0].id]).toBe("ana@cincel.mx");
    expect(data.canCreate).toBe(true);
    expect(data).not.toHaveProperty("positionOptions");
  });

  it("still lists the team when the overview reads fail", async () => {
    reads.listAssignedOpenTasks.mockRejectedValue(new Error("boom"));
    const data = await loadPersonasEquipo(USER);
    expect(data.people).toHaveLength(3);
    expect(data.people.every((p) => p.open === 0 && p.weekHours === null)).toBe(true);
  });

  it("resolves canAssign / canCreateTask from the activities capabilities", async () => {
    expect(await loadPersonasEquipo(USER)).toMatchObject({ canAssign: true, canCreateTask: true });
    caps.activities = { canCreateActivity: false, canChangeResponsible: false };
    expect(await loadPersonasEquipo(USER)).toMatchObject({ canAssign: false, canCreateTask: false });
    caps.activities = { canCreateActivity: true, canChangeResponsible: false };
    expect(await loadPersonasEquipo(USER)).toMatchObject({ canAssign: false, canCreateTask: true });
  });

  it("sends 4 weeks and the absences over them, with another person's kind masked", async () => {
    vi.mocked(approvedAbsences).mockResolvedValueOnce([
      { staffId: EQUIPO_STAFF[0].id, from: "2000-01-03", to: "2000-01-04", kind: "enfermedad" },
    ]);
    const data = await loadPersonasEquipo(USER);
    const range = vi.mocked(approvedAbsences).mock.calls.at(-1)![1];
    // This Monday through the Sunday of the fourth week.
    expect(Date.parse(range.to) - Date.parse(range.from)).toBe(27 * 86_400_000);
    expect(new Date(`${range.from}T00:00:00Z`).getUTCDay()).toBe(1);
    const [ana] = data.people;
    expect(ana.weeks).toHaveLength(4);
    expect(ana.absences).toEqual([{ from: "2000-01-03", to: "2000-01-04", kind: "ausencia" }]);
    expect(data.etapas).toEqual(EQUIPO_ETAPAS);
  });

  it("refuses a viewer without team.canViewTeam", async () => {
    caps.team = { canViewTeam: false, canCreateCollaborator: false };
    await expect(loadPersonasEquipo(USER)).rejects.toThrow("FORBIDDEN");
    expect(reads.listStaff).not.toHaveBeenCalled();
  });
});

describe("loadPersonasCounts", () => {
  it("uses the known active team instead of a COUNT", async () => {
    await expect(loadPersonasCounts(USER, { activeStaff: 3 })).resolves.toEqual({
      equipo: 3,
      clientes: 4,
      contratistas: 2,
      proveedores: 6,
    });
  });

  it("counts 0 for a tab the viewer can't open", async () => {
    caps.clients = { ...caps.clients, canViewClients: false };
    await expect(loadPersonasCounts(USER, { activeStaff: 3 })).resolves.toEqual({
      equipo: 3,
      clientes: 0,
      contratistas: 0,
      proveedores: 0,
    });
    expect(reads.countByType).not.toHaveBeenCalled();
  });

  it("refuses a viewer who can open no Personas tab", async () => {
    caps.team = { canViewTeam: false, canCreateCollaborator: false };
    caps.clients = { ...caps.clients, canViewClients: false };
    await expect(loadPersonasCounts(USER)).rejects.toThrow("FORBIDDEN");
  });
});

describe("loadPersonasContacts", () => {
  it.each([
    ["clientes", { types: ["cliente"] }],
    ["contratistas", { types: ["proveedor"], providerSubtype: "contratista" }],
    ["proveedores", { types: ["proveedor"] }],
  ] as const)("filters the %s tab in SQL", async (tab, filter) => {
    await loadPersonasContacts(USER, { tab, tipo: null });
    expect(reads.listContacts).toHaveBeenCalledWith(filter);
  });

  it("strips the origin for viewers without canSeeAdminData and keeps it for admins", async () => {
    reads.listContacts.mockResolvedValue([contactRow({ id: "c1", type: "cliente" })]);
    expect((await loadPersonasContacts(USER, { tab: "clientes" })).contacts[0]!.origin).toBeNull();
    caps.admin = true;
    const admin = await loadPersonasContacts(USER, { tab: "clientes" });
    expect(admin.contacts[0]!.origin).toBe("Instagram");
    expect(admin.capabilities.isAdmin).toBe(true);
  });

  it("reads ?tipo= only on Proveedores", async () => {
    expect((await loadPersonasContacts(USER, { tab: "proveedores", tipo: "tiendas" })).subfilter).toBe("tiendas");
    expect((await loadPersonasContacts(USER, { tab: "proveedores", tipo: "otro" })).subfilter).toBeNull();
    expect((await loadPersonasContacts(USER, { tab: "clientes", tipo: "tiendas" })).subfilter).toBeNull();
  });

  it("refuses a viewer without clients.canViewClients", async () => {
    caps.clients = { ...caps.clients, canViewClients: false };
    await expect(loadPersonasContacts(USER, { tab: "clientes" })).rejects.toThrow("FORBIDDEN");
    expect(reads.listContacts).not.toHaveBeenCalled();
  });
});
