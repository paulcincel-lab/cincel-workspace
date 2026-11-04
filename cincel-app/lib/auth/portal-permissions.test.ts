import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser, TeamMember } from "@/lib/auth/auth-service";
import { SYSTEM_ACCESS_ROLES, type SystemAccessRole } from "@/lib/data/roles";

const readStorageMock = vi.hoisted(() => vi.fn<(key: string) => string | null>(() => null));

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: readStorageMock,
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn().mockReturnValue(null),
}));

import {
  PERMISSIONS_CUSTOM_STORAGE_KEY,
  resolvePortalCapabilities,
  resolvePortalCapabilitiesFromDefaults,
} from "@/lib/auth/permissions";
import { PERMISSIONS_MODULES_REGISTRY } from "@/lib/auth/permissionsRegistry";

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

const MANAGE_ACCESS_ROLES: SystemAccessRole[] = ["Administrador", "Dirección", "Jefe de Taller", "Jefe de Construcción"];

beforeEach(() => {
  readStorageMock.mockReset();
  readStorageMock.mockReturnValue(null);
});

describe("resolvePortalCapabilitiesFromDefaults", () => {
  it.each(SYSTEM_ACCESS_ROLES)("portal.manageAccess default for %s follows BE §0.3", (role) => {
    expect(resolvePortalCapabilitiesFromDefaults(makeUser(role)).manageAccess).toBe(
      MANAGE_ACCESS_ROLES.includes(role)
    );
  });

  it.each(SYSTEM_ACCESS_ROLES)("portal.disableUsers default for %s is Administrador only", (role) => {
    expect(resolvePortalCapabilitiesFromDefaults(makeUser(role)).disableUsers).toBe(role === "Administrador");
  });

  it("treats a missing user as Colaborador (no portal access)", () => {
    expect(resolvePortalCapabilitiesFromDefaults(null)).toEqual({ manageAccess: false, disableUsers: false });
  });
});

describe("resolvePortalCapabilities", () => {
  it("returns the defaults when nothing is stored", () => {
    expect(resolvePortalCapabilities(makeUser("Jefe de Taller"))).toEqual({
      manageAccess: true,
      disableUsers: false,
    });
  });

  it("applies stored overrides for the user's role", () => {
    storeOverrides({
      "Arquitecto Senior": { portal: { manageAccess: true } },
      "Jefe de Taller": { portal: { manageAccess: false, disableUsers: true } },
    });

    expect(resolvePortalCapabilities(makeUser("Arquitecto Senior"))).toEqual({
      manageAccess: true,
      disableUsers: false,
    });
    expect(resolvePortalCapabilities(makeUser("Jefe de Taller"))).toEqual({
      manageAccess: false,
      disableUsers: true,
    });
  });

  it("ignores overrides for other roles or other modules", () => {
    storeOverrides({
      Colaborador: { portal: { manageAccess: true } },
      Administrador: { team: { canViewTeam: false } },
    });

    expect(resolvePortalCapabilities(makeUser("Administrador"))).toEqual({
      manageAccess: true,
      disableUsers: true,
    });
  });

  it("falls back to the default when an override is not a boolean", () => {
    storeOverrides({ Administrador: { portal: { disableUsers: "yes" } } });

    expect(resolvePortalCapabilities(makeUser("Administrador")).disableUsers).toBe(true);
  });
});

describe("Portal de clientes registry module", () => {
  const portalModule = PERMISSIONS_MODULES_REGISTRY.find((module) => module.id === "portal");

  it("is registered with both boolean capabilities", () => {
    expect(portalModule?.name).toBe("Portal de clientes");
    expect(portalModule?.actions.map((action) => [action.id, action.type])).toEqual([
      ["manageAccess", "boolean"],
      ["disableUsers", "boolean"],
    ]);
  });

  it("reads values from the resolver's capabilities", () => {
    const capabilities = portalModule!.resolver(makeUser("Dirección"));
    const values = Object.fromEntries(
      portalModule!.actions.map((action) => [action.id, action.getValue(capabilities)])
    );

    expect(values).toEqual({ manageAccess: true, disableUsers: false });
    expect(portalModule!.isEnabled(values)).toBe(true);
    expect(portalModule!.isEnabled({ manageAccess: false, disableUsers: false })).toBe(false);
  });
});
