import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser, TeamMember } from "@/lib/auth/auth-service";
import type { SystemAccessRole } from "@/lib/data/roles";

const readStorageMock = vi.hoisted(() => vi.fn<(key: string) => string | null>(() => null));

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: readStorageMock,
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn().mockReturnValue(null),
}));

import {
  PERMISSIONS_CUSTOM_STORAGE_KEY,
  resolvePositionsCapabilities,
  resolvePositionsCapabilitiesFromDefaults,
} from "@/lib/auth/permissions";
import { PERMISSIONS_MODULES_REGISTRY } from "@/lib/auth/permissionsRegistry";
import { buildDefaultPermissionsState, sanitizePermissionsState } from "@/lib/auth/permissionsState";

function makeUser(role: SystemAccessRole): AuthenticatedUser {
  const member: TeamMember = {
    id: "00000000-0000-0000-0000-000000000999",
    name: "Test User",
    phone: "+52 000 000 0000",
    institutionalEmail: "test@cincel.mx",
    role: "Colaborador",
    area: "General",
    capacity: 8,
    availability: "Disponible",
    active: true,
    authStatus: {
      authEnabled: true,
      hasPasswordHash: true,
      mustChangePassword: false,
      passwordUpdatedAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    },
  };
  return { member, email: "test@cincel.mx", access: role };
}

function storeOverrides(roles: Record<string, Record<string, unknown>>) {
  readStorageMock.mockImplementation((key) =>
    key === PERMISSIONS_CUSTOM_STORAGE_KEY ? JSON.stringify({ version: 1, roles }) : null
  );
}

beforeEach(() => {
  readStorageMock.mockReset();
  readStorageMock.mockReturnValue(null);
});

describe("positions capability", () => {
  it("is registered as the Puestos module; the Áreas module is gone", () => {
    const positions = PERMISSIONS_MODULES_REGISTRY.find((module) => module.id === "positions");
    expect(positions?.name).toBe("Puestos");
    expect(positions?.actions.map((action) => action.id)).toEqual(["canViewPositions", "canManagePositions"]);
    expect(PERMISSIONS_MODULES_REGISTRY.some((module) => module.id === "areas")).toBe(false);
  });

  it("defaults: everyone views, Administrador and Dirección manage", () => {
    expect(resolvePositionsCapabilitiesFromDefaults(makeUser("Administrador")).canManagePositions).toBe(true);
    expect(resolvePositionsCapabilitiesFromDefaults(makeUser("Dirección")).canManagePositions).toBe(true);
    expect(resolvePositionsCapabilitiesFromDefaults(makeUser("Colaborador")).canManagePositions).toBe(false);
    expect(resolvePositionsCapabilitiesFromDefaults(makeUser("Colaborador")).canViewPositions).toBe(true);
  });
});

describe("stored role configs", () => {
  it("a stored positions module overrides the defaults", () => {
    storeOverrides({ Colaborador: { positions: { canViewPositions: true, canManagePositions: true } } });
    expect(resolvePositionsCapabilities(makeUser("Colaborador")).canManagePositions).toBe(true);
  });

  it("without stored overrides the defaults apply", () => {
    expect(resolvePositionsCapabilities(makeUser("Colaborador")).canManagePositions).toBe(false);
  });

  it("the Permisos page drops a stored areas module", () => {
    const defaults = buildDefaultPermissionsState();
    const stored = {
      version: 1,
      roles: { Colaborador: { areas: { canViewAreas: true, canManageAreas: true } } },
    };
    const state = sanitizePermissionsState(defaults, stored);
    expect(state.Colaborador.positions).toEqual(defaults.Colaborador.positions);
    expect(state.Colaborador.areas).toBeUndefined();
  });
});
