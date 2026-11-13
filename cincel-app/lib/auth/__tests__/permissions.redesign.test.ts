import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedUser, TeamMember } from "@/lib/auth/auth-service";
import { SYSTEM_ACCESS_ROLES, type SystemAccessRole } from "@/lib/data/roles";

vi.mock("@/lib/repositories/browser-state-repository", () => ({
  readStorage: vi.fn(() => null),
  writeStorage: vi.fn(),
  removeStorage: vi.fn(),
  readJsonStorage: vi.fn().mockReturnValue(null),
}));

import {
  canDecideVacations,
  canManageAppearance,
  canManageGeneralSettings,
  canManageTimeTracking,
  canSeeAdminData,
  canViewSensitiveStaffData,
  canViewTeamHours,
} from "@/lib/auth/permissions";
import { canSeeAdminData as compatCanSeeAdminData } from "@/lib/etapas/compat";

function makeUser(access: SystemAccessRole, role: string = access): AuthenticatedUser {
  const member: TeamMember = {
    id: "00000000-0000-0000-0000-000000000904",
    name: "Test User",
    phone: "+52 000 000 0000",
    institutionalEmail: "test@cincel.mx",
    role,
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
  return { member, email: "test@cincel.mx", access };
}

type Capability = (user: AuthenticatedUser | null) => boolean;

const ADMIN_ONLY = new Set<SystemAccessRole>(["Administrador"]);
const ADMIN_OR_DIRECCION = new Set<SystemAccessRole>(["Administrador", "Dirección"]);

const TABLE: Array<[string, Capability, Set<SystemAccessRole>]> = [
  ["canManageAppearance", canManageAppearance, ADMIN_ONLY],
  ["canManageGeneralSettings", canManageGeneralSettings, ADMIN_OR_DIRECCION],
  ["canManageTimeTracking", canManageTimeTracking, ADMIN_ONLY],
  ["canViewTeamHours", canViewTeamHours, ADMIN_OR_DIRECCION],
  ["canDecideVacations", canDecideVacations, ADMIN_OR_DIRECCION],
  ["canSeeAdminData", canSeeAdminData, ADMIN_ONLY],
];

describe("redesign capabilities role table", () => {
  for (const [name, capability, allowed] of TABLE) {
    describe(name, () => {
      it.each(SYSTEM_ACCESS_ROLES)(`for %s matches the role table`, (role) => {
        expect(capability(makeUser(role))).toBe(allowed.has(role));
      });

      it("is false without a user", () => {
        expect(capability(null)).toBe(false);
      });
    });
  }
});

describe("canManageGeneralSettings", () => {
  it.each(SYSTEM_ACCESS_ROLES)("equals today's General rule (canViewSensitiveStaffData) for %s", (role) => {
    const user = makeUser(role);
    expect(canManageGeneralSettings(user)).toBe(canViewSensitiveStaffData(user));
  });

  it("follows canViewSensitiveStaffData when the member role is Administrador", () => {
    const user = makeUser("Colaborador", "Administrador");
    expect(canManageGeneralSettings(user)).toBe(canViewSensitiveStaffData(user));
    expect(canManageGeneralSettings(user)).toBe(true);
  });

  it("equals canViewSensitiveStaffData without a user", () => {
    expect(canManageGeneralSettings(null)).toBe(canViewSensitiveStaffData(null));
  });
});

describe("canManageAppearance", () => {
  it("no longer admits Dirección", () => {
    expect(canManageAppearance(makeUser("Dirección"))).toBe(false);
  });
});

describe("canSeeAdminData re-export", () => {
  it("is the same function from lib/etapas/compat", () => {
    expect(compatCanSeeAdminData).toBe(canSeeAdminData);
  });

  it("accepts undefined", () => {
    expect(canSeeAdminData(undefined)).toBe(false);
  });
});
