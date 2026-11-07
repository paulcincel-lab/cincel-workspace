/**
 * Puestos capability (project flow BE §4.2 step 15, §12): `areas.canManageAreas`
 * became `positions.canManagePositions`. For one release a stored role config
 * that still has an `areas` module resolves to the `positions` permissions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedUser, TeamMember } from "@/lib/auth/auth-service";
import type { SystemAccessRole } from "@/lib/data/roles";

const storage = vi.hoisted(() => ({ value: null as string | null }));

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn(() => storage.value),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn(() => (storage.value ? JSON.parse(storage.value) : null)),
}));

import { PERMISSIONS_CUSTOM_STORAGE_KEY, resolvePositionsCapabilities } from "@/lib/auth/permissions";

function makeUser(access: SystemAccessRole): AuthenticatedUser {
  const member: TeamMember = {
    id: "00000000-0000-0000-0000-000000000740",
    name: "Test User",
    phone: "",
    institutionalEmail: "test@cincel.mx",
    role: "Colaborador",
    area: "",
    capacity: 0,
    availability: "",
    active: true,
  } as TeamMember;
  return { member, email: member.institutionalEmail, access } as AuthenticatedUser;
}

function storeRoles(roles: Record<string, Record<string, Record<string, unknown>>>) {
  storage.value = JSON.stringify({ version: 1, roles });
}

beforeEach(() => {
  storage.value = null;
});

describe("positions capability", () => {
  it("defaults: Administrador and Dirección manage puestos, others don't", () => {
    expect(resolvePositionsCapabilities(makeUser("Administrador")).canManagePositions).toBe(true);
    expect(resolvePositionsCapabilities(makeUser("Dirección")).canManagePositions).toBe(true);
    expect(resolvePositionsCapabilities(makeUser("Jefe de Taller")).canManagePositions).toBe(false);
    expect(resolvePositionsCapabilities(makeUser("Colaborador")).canManagePositions).toBe(false);
  });

  it("maps a stored legacy `areas` module to `positions`", () => {
    storeRoles({
      Colaborador: { areas: { canManageAreas: true } },
      Dirección: { areas: { canManageAreas: false } },
    });
    expect(PERMISSIONS_CUSTOM_STORAGE_KEY).toBeTruthy();
    expect(resolvePositionsCapabilities(makeUser("Colaborador")).canManagePositions).toBe(true);
    expect(resolvePositionsCapabilities(makeUser("Dirección")).canManagePositions).toBe(false);
  });

  it("reads a stored `positions` module directly", () => {
    storeRoles({ "Jefe de Taller": { positions: { canManagePositions: true } } });
    expect(resolvePositionsCapabilities(makeUser("Jefe de Taller")).canManagePositions).toBe(true);
  });

  it("falls back to the defaults when the role has neither module", () => {
    storeRoles({ Colaborador: { team: { canViewTeam: true } } });
    expect(resolvePositionsCapabilities(makeUser("Colaborador")).canManagePositions).toBe(false);
    expect(resolvePositionsCapabilities(makeUser("Administrador")).canManagePositions).toBe(true);
  });
});
