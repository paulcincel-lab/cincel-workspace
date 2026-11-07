/**
 * Puestos capability after the drops release (project flow BE §4.2 step 15,
 * §4.3): the one-release `areas` → `positions` alias is gone, so a stored role
 * config that still has an `areas` module no longer changes the puestos
 * permissions.
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

import * as permissions from "@/lib/auth/permissions";

const { resolvePositionsCapabilities } = permissions;

function makeUser(access: SystemAccessRole): AuthenticatedUser {
  const member: TeamMember = {
    id: "00000000-0000-0000-0000-000000000698",
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

describe("positions capability without the areas alias", () => {
  it("ignores a stored legacy `areas` module", () => {
    storeRoles({
      Colaborador: { areas: { canManageAreas: true } },
      Dirección: { areas: { canManageAreas: false } },
    });
    expect(resolvePositionsCapabilities(makeUser("Colaborador")).canManagePositions).toBe(false);
    expect(resolvePositionsCapabilities(makeUser("Dirección")).canManagePositions).toBe(true);
  });

  it("still reads a stored `positions` module", () => {
    storeRoles({ "Jefe de Taller": { positions: { canManagePositions: true } } });
    expect(resolvePositionsCapabilities(makeUser("Jefe de Taller")).canManagePositions).toBe(true);
  });

  it("exports no legacy module mapper", () => {
    expect("mapLegacyModuleState" in permissions).toBe(false);
  });
});
